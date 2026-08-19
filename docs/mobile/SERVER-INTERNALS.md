# l8gitd server internals

Working notes for the module agents that fill `src-tauri/src/server/dispatch/*.rs`.
The binding protocol contract is `docs/mobile/CONCEPT.md`; this document only describes
the Rust-side plumbing the skeleton provides.

## Layout

```
src-tauri/src/
├─ sink.rs                    global event sink (compiled always, no headless feature)
├─ bin/l8gitd.rs              CLI: serve | pair | status | allow
└─ server/                    #[cfg(feature = "headless")]
   ├─ mod.rs
   ├─ crypto.rs               handshake, HKDF, ChaCha20-Poly1305 framing
   ├─ ws.rs                   axum WS server, session lifecycle, frame loop
   ├─ state.rs                ServerState, ConnectionHandle, DispatchCtx
   ├─ config.rs               config.json, repo-root allowlist
   ├─ pairing.rs              keyring (service "l8gitd"), QR, LAN IP
   ├─ sink.rs                 broadcast sink used by l8gitd
   ├─ relay_client.rs         outbound relay link with backoff reconnect
   ├─ e2e.rs                  #[cfg(test)] socket-level protocol tests
   └─ dispatch/
      ├─ mod.rs               dispatch_table! macro + helpers
      ├─ coverage.rs          generate_handler! ↔ dispatch parity check
      └─ {git,gitops,pr,agents,system}.rs   ← module agents fill these
```

Build: `cargo check` (desktop, unchanged), `cargo check --features headless --all-targets`
and `cargo build --features headless --bin l8gitd`.
Tests: `cargo test --features headless` (in `src-tauri`) and `cargo test` (in `relay`).

`dispatch/coverage.rs` parses `lib.rs` and the five dispatch tables at compile time via
`include_str!` and fails the build's test run if the two command sets diverge, so a new
`#[tauri::command]` cannot be added without also registering it in a dispatch table.

## The event sink

`crate::sink` replaces the old `cmdlog::set_app_handle` / `app.emit` coupling.

```rust
pub trait EventSink: Send + Sync + 'static {
    fn emit(&self, name: &str, payload: serde_json::Value);
}
pub fn set_sink(sink: Arc<dyn EventSink>);
pub fn emit<T: Serialize + ?Sized>(name: &str, payload: &T);
```

- The Tauri app registers a sink that forwards to `AppHandle::emit` (`lib.rs`, `TauriSink`).
- `l8gitd` registers `server::sink::BroadcastSink`, which pushes into
  `ServerState::events`; every authenticated connection forwards those as
  `{"type":"event","name":...,"payload":...}` frames.
- If no sink is registered (unit tests, `cargo test`), `sink::emit` is a no-op and does
  not even serialize.

Already routed through it: `git-command` (cmdlog.rs), `repo-changed` (watcher.rs),
`git-progress` / `git-progress-done` (git.rs). **Never call `app.emit` directly again** —
anything emitted that way is invisible to mobile clients.

Emit a new global event with `crate::sink::emit("my-event", &payload);` from anywhere,
including plain OS threads.

## DispatchCtx

```rust
pub struct DispatchCtx {
    pub state: Arc<ServerState>,   // agents, pty, host, allowlist, event bus
    pub conn: Arc<ConnectionHandle>, // the connection that issued this request
    pub req_id: i64,               // id of the req frame
    pub cmd: String,               // command name as received
}
```

`ServerState` fields you will need:

| Field / method | Purpose |
|---|---|
| `state.agents: AgentTransportState` | pass as `&ctx.state.agents` to agent inner fns |
| `state.pty: PtyState` | pass as `&ctx.state.pty` to pty inner fns |
| `state.host: HostInfo` | name / version / platform, used in the `ready` frame |
| `state.host_id`, `state.psk`, `state.relay` | pairing + transport config |
| `state.watch(path)` / `unwatch(path)` / `unwatch_all()` | filesystem watcher registration; use these instead of calling `watcher::*` directly so shutdown can clean up |
| `state.allowed_roots()` / `ensure_allowed(&args)` | repo-root allowlist |

`ConnectionHandle` (`ctx.conn`) can send extra frames out of band:
`send_chan(id, arg, payload)`, `send_event(name, payload)`, `send(raw_frame)`.
Ordinary responses are sent by `ws.rs` from the value your dispatch returns —
do not send a `res` frame yourself.

## The dispatch_table! macro

Each module file exposes exactly one entry point; `dispatch/mod.rs` tries the modules in
order `git → gitops → pr → agents → system` and returns
`Err("Unbekannter Befehl: …")` when nobody claims the command.

```rust
pub async fn dispatch(
    cmd: &str,
    args: serde_json::Value,
    ctx: &crate::server::state::DispatchCtx,
) -> Option<Result<serde_json::Value, String>> {
    crate::dispatch_table! { cmd, args, ctx;
        // arms go here
    }
}
```

Arm syntax:

```
"command_name" ( arg_name: Type, other_arg: Option<Type>, chan_arg: chan PayloadType ) => { expr }
```

- Argument names are written in **Rust snake_case**; the macro looks the value up under
  its camelCase form first (`repo_path` → `repoPath`, exactly what
  `to_lower_camel_case` in `tauri-macros` produces) and falls back to the literal
  snake_case key.
- A missing key is deserialized from `null`, so `Option<T>` arguments become `None`
  and required arguments produce `Fehlendes Argument "repoPath".`.
- `chan T` replaces the client sentinel `{"__channel__":true}` with a real
  `tauri::ipc::Channel<T>`; every `send()` becomes a
  `{"type":"chan","id":<req id>,"arg":"<camelCase name>","payload":…}` frame on the
  issuing connection. Passing anything other than the sentinel/null is an error.
- The arm body is an expression returning `Result<T, String>` with `T: Serialize`;
  `.await` is allowed. The macro serializes `Ok(T)` into the `res` frame and passes
  `Err(String)` through verbatim (sentinels such as `__REMOTE_CANCELED__` survive).
- Arms are separated by nothing — a block already terminates the arm.

### Example 1 — simple command

`git::repo_status` is `pub async fn repo_status(path: String) -> Result<Vec<StatusEntry>, String>`
and takes no Tauri-only parameters, so it can be called as is:

```rust
"repo_status" (path: String) => {
    crate::git::repo_status(path).await
}
```

### Example 2 — command with State access

`pty::pty_write` is `#[tauri::command] pub fn pty_write(state: State<PtyState>, id: u32, data: String)`.
After the inner-function refactor (below) it becomes `pty_write_inner(&PtyState, u32, String)`:

```rust
"pty_write" (id: u32, data: String) => {
    crate::pty::pty_write_inner(&ctx.state.pty, id, data)
}
```

`ctx` is in scope inside every arm body; it is the `&DispatchCtx` you passed to the macro.

### Example 3 — command with a Channel parameter

`agent_transport::agent_transport_open(state, provider, session_id, options, on_event: Channel<AgentStreamEvent>)`:

```rust
"agent_transport_open" (
    provider: String,
    session_id: String,
    options: Option<crate::agent_transport::AgentTransportOptions>,
    on_event: chan crate::agent_transport::AgentStreamEvent
) => {
    crate::agent_transport::agent_transport_open_inner(
        &ctx.state.agents,
        provider,
        session_id,
        options,
        on_event,
    ).await
}
```

The client sends
`{"type":"req","id":7,"cmd":"agent_transport_open","args":{"provider":"claude","sessionId":"…","onEvent":{"__channel__":true}}}`
and receives `{"type":"chan","id":7,"arg":"onEvent","payload":{…AgentStreamEvent…}}`
for every event, followed by the final `res` frame.

Channel payloads that are raw bytes (`Channel<tauri::ipc::Response>`, e.g. `pty_open`'s
`on_data`) are not valid JSON, so they are wrapped as
`{"__raw__":"<base64>"}`. Clients must unwrap that key.

## Inner-function refactor pattern

Tauri-only parameters (`State<'_, X>`, `AppHandle`, `Webview`, `Window`) cannot exist in
`l8gitd`. Split every command that uses them:

```rust
// before
#[tauri::command]
pub fn pty_write(state: tauri::State<PtyState>, id: u32, data: String) -> Result<(), String> {
    let session = state.sessions.read().unwrap().get(&id).cloned().ok_or("no session")?;
    session.write(&data)
}

// after
#[tauri::command]
pub fn pty_write(state: tauri::State<PtyState>, id: u32, data: String) -> Result<(), String> {
    pty_write_inner(&state, id, data)
}

pub(crate) fn pty_write_inner(state: &PtyState, id: u32, data: String) -> Result<(), String> {
    let session = state.sessions.read().unwrap().get(&id).cloned().ok_or("no session")?;
    session.write(&data)
}
```

Rules:

- The wrapper keeps the exact command name, signature shape and return type — the desktop
  frontend must not notice anything.
- Make the inner function `pub(crate)`; only make it `pub` if `l8gitd`'s bin needs it.
- Async commands keep `async fn foo_inner(...) -> Result<T, String>`; sync commands stay sync.
- `Channel<T>` parameters stay `Channel<T>` in the inner function — the dispatcher hands
  it a `Channel` built with `Channel::new`, so nothing downstream changes.
- Commands that took `AppHandle` only to `emit` lose that parameter entirely and call
  `crate::sink::emit(...)` instead (see `watcher::watch_repo`).
- `#[tauri::command]` functions live in their existing module; do not move them.

## Path arguments and the allowlist

Before any dispatch, `ws.rs` runs `ServerState::ensure_allowed(&args)`. It walks the whole
args object recursively and, for keys whose camelCase name is one of

`path, paths, repoPath, repoPaths, repoRoot, rootPath, basePath, cwd, dir, directory, worktree, worktreePath, addDirs, targetPath, destPath, dest, newPath, destination`

checks every **absolute** string value — and every absolute string inside an array value,
which is what `repos_overview`, `claude_list_sessions` and `cursor_list_sessions` send as
`paths` — against the persisted roots
(`l8gitd allow <path>`, stored in `<config_dir>/l8gitd/config.json`) using
`pathsafe::contained`. Relative values are ignored here — they are still the command's own
responsibility via `pathsafe::resolve_in_root`. With an empty allowlist every absolute path
is rejected.

If you add a command with a differently named absolute-path argument, add the key to
`server::config::PATH_ARG_KEYS`. `agent_transport_open` additionally re-checks `cwd`,
`worktree` and `addDirs` of its options struct against the roots in
`server::dispatch::agents`, so a forgotten key alone cannot hand an agent CLI a directory
the operator never released.

## Session lifecycle (for reference)

1. Client text frame `hello` → `hostId` must match; otherwise the socket closes.
2. Server text frame `welcome` with the HMAC tag over `"l8git-hs-v1" || cEph || sEph || nonce`.
3. Client binary frame `auth`; the tag is verified in constant time.
4. Server binary frame `ready` with `HostInfo`.
5. Frame loop: `req` spawns a tokio task per request (so long git operations do not block
   the socket), `cancel` aborts a running task and answers with `__REMOTE_CANCELED__`,
   `ping` is answered with `pong`. Encryption counters are strictly sequential per
   direction; a gap or replay closes the session.

`cancel` also kills the git child of the request: `spawn_request` remembers the `opId` of
the arguments, and `cancel` (as well as the disconnect path) routes it through
`git::cancel_remote_op`, the same registry `git_remote_cancel(opId)` uses. Without an
`opId` the abort only stops the awaiting task.

Every connection gets its own send queue; all sealing happens in a single writer task, so
frames produced concurrently by dispatch tasks and the event forwarder stay ordered and
never reuse a nonce.

Limits enforced by `ws::session` (a client that violates them loses the session, which runs
`release_resources`, so its PTYs and agent transports die with it):

- `HANDSHAKE_TIMEOUT` (10 s) per handshake frame — an unauthenticated peer cannot park a
  session.
- `IDLE_TIMEOUT` (60 s, 3× the client's 20 s ping) in the frame loop — a half-open
  connection (radio loss, no FIN) is torn down instead of parking the reader forever.
- `state::MAX_SESSIONS` (64) concurrent sessions, counted by a `SessionSlot` guard.
- The outbound queues are bounded (`OUTBOX_CAPACITY` frames per connection,
  `WIRE_CAPACITY` sealed frames per transport). `ConnectionHandle::send` reports `false`
  when the queue is full, which makes producers (PTY flusher, agent stdout reader) stop and
  drops the connection instead of growing the heap without bound. `dispatch::channel_arg`
  translates that `false` into an `Err` on the `Channel`, which is the shutdown signal those
  producers already listen to.

## Transport seam

`ws.rs` no longer talks to a socket directly. A session runs over two channels:

```rust
pub enum Frame { Text(String), Binary(Vec<u8>) }
pub type Inbox = mpsc::UnboundedReceiver<Frame>;
pub type Wire  = mpsc::Sender<Frame>;
pub async fn session(state: Arc<ServerState>, inbox: Inbox, wire: Wire) -> Result<(), String>;
```

- `ws::socket_session` (the axum `/ws` upgrade path) pumps an `axum` `WebSocket` into those
  channels: `Message::Text`/`Message::Binary` → `Frame`, ping/pong dropped, close ends the pump.
- `relay_client::relay_session` feeds the same `session` from a relay `connId`.
- The handshake reads `hello` from whichever frame kind arrives first (the relay delivers it
  as binary), answers `welcome` as `Frame::Text` and everything after that as `Frame::Binary`.
  Text frames after the handshake still end the session.
- Sealing stays in one writer task per session, so nonces never repeat regardless of transport.

## Relay

The relay is the standalone crate `relay/` (`l8git-relay`, own `Cargo.toml`, no workspace
link to `src-tauri`). It is blind: it matches parties and pipes bytes.

```
l8gitd  --ws(s) /host/{hostId}-->  relay  <--ws(s) /client/{hostId}--  mobile app
        JSON text frames                         raw binary frames
```

- `x-relay-token` = `base64url(sha256(psk || "l8git-relay-v1"))` (`crypto::relay_token`).
  The first registration for a `hostId` pins `sha256(token)`; later host *and* client
  connections must present the same token (constant-time compare), otherwise `403`.
  A client for an unknown `hostId` gets `403`, one whose host is offline gets `503`.
- Host multiplexing frames: `{"connId":string,"op":"open"|"data"|"close","data":"<base64>"}`,
  standard base64 with padding, `data` empty for `open`/`close`. `connId` is relay-assigned
  (`c0`, `c1`, …, unique per relay process); `open` is always relay→host.
- Cleanup: a client socket closing sends `close` to the host; a host socket closing drops all
  of its client sockets; a reconnecting host replaces the previous link (epoch-guarded, so a
  late teardown of the old socket cannot unregister the new one).
- Run it: `cd relay && cargo run -- --port 8485 [--bind 0.0.0.0]`, health check `GET /health`.
  State is in memory only; restarting the relay clears the pinned tokens.

`server/relay_client.rs` is the l8gitd side:

- `endpoint(relay, host_id)` normalizes the configured URL (`http`/`https` are mapped to
  `ws`/`wss`, trailing `/` stripped) and appends `/host/{hostId}`; `l8gitd serve` validates it
  before starting and fails fast on a broken `--relay` value.
- One outbound socket per host, a `ping` every 30 s, reconnect with exponential backoff
  (1 s → 60 s, `next_backoff`) and jitter (`with_jitter`, 50–100 % of the delay); the backoff
  resets after a successful connect.
- Every `open` spawns a full `ws::session` — identical dispatch, allowlist, events and
  crypto as a direct LAN connection. `data` is decoded and pushed into that session's inbox,
  `close` (or a dying session) tears it down and reports `close` back to the relay.
