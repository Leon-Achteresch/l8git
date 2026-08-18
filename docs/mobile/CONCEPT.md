# l8git Remote — Mobile Companion Concept

Status: v1 contract. All implementation agents must follow this document exactly. Deviations require orchestrator approval.

## Goal

A React Native (Expo) app under `mobile/` that connects to one or more l8git hosts, mirrors the desktop feature set (multi-repo workspace, commits, history, diffs, branches, stashes, PRs, CI, dashboard, inbox) and supports the Agents tab completely (overview, chat for all four providers, approvals, capabilities, worktree review). Hosts run a new headless Rust binary `l8gitd` that reuses the existing `l8git_lib` command implementations. Connections work over LAN directly and over the internet through a self-hosted relay. Multiple simultaneous host connections are a first-class requirement.

## Architecture overview

```
┌─────────────┐   ws:// (LAN)              ┌──────────────────────┐
│  RN app     │ ─────────────────────────► │  l8gitd (headless)   │
│  (Expo)     │   ws(s):// via relay       │  axum WS server      │
│             │ ─────► ┌───────┐ ────────► │  reuses l8git_lib    │
└─────────────┘        │ relay │           │  commands + agents   │
                       └───────┘           └──────────────────────┘
```

- All frames are end-to-end encrypted (see Crypto). Relay and network only ever see ciphertext. Therefore plain `ws://` is acceptable on every leg.
- The desktop Tauri app is unchanged in behavior; it shares the Rust command implementations with `l8gitd` via refactored inner functions.
- The mobile app reuses the existing TypeScript agent provider stores (`src/lib/agents/**`) via a platform seam; the ~250 KB of provider protocol logic is NOT reimplemented.

## Monorepo layout

```
l8git/
├─ src/               desktop frontend (unchanged except platform seam)
├─ src-tauri/         Rust: lib + tauri app + NEW bin l8gitd (src-tauri/src/server/)
├─ relay/             NEW small Rust crate: blind frame relay
├─ mobile/            NEW Expo app
└─ docs/mobile/       this document + protocol notes
```

Root `package.json` gains bun workspaces: `["mobile"]`. Metro in `mobile/` gets `watchFolders: [repoRoot]` and resolves the alias `@desktop/*` → `../src/*` so the mobile app imports `src/lib/agents/**` directly.

## Wire protocol v1 (contract — both sides implement exactly this)

Transport: WebSocket, binary messages. Every WS binary message is one encrypted frame. Inside the encryption, payloads are UTF-8 JSON.

### Handshake (Noise-NNpsk0-equivalent, PSK from pairing)

1. Client → Server (plaintext JSON text message):
   `{"v":1,"type":"hello","hostId":"<hostId>","eph":"<base64 x25519 client ephemeral pub>","nonce":"<base64 16 random bytes>"}`
2. Server → Client (plaintext JSON text message):
   `{"v":1,"type":"welcome","eph":"<base64 x25519 server ephemeral pub>","tag":"<base64 HMAC-SHA256(psk, "l8git-hs-v1" || clientEph || serverEph || nonce)>"}`
   Client verifies `tag`; abort on mismatch.
3. Key derivation, both sides:
   `okm = HKDF-SHA256(ikm = X25519(eph_priv, peer_eph_pub), salt = psk, info = "l8git-remote-v1", len = 64)`
   `k_c2s = okm[0..32]`, `k_s2c = okm[32..64]`.
4. All subsequent messages are binary: `ciphertext = ChaCha20-Poly1305(key, nonce, plaintextJson)` where nonce = 12 bytes little-endian message counter (separate counters per direction, starting at 0). The wire format is `nonce(12) || ciphertext`.
5. The client's first encrypted frame must be `{"type":"auth","tag":"<base64 HMAC-SHA256(psk, "l8git-auth-v1" || clientEph || serverEph || nonce)>"}`. Server verifies (constant-time) and replies `{"type":"ready","host":{"name":...,"version":...,"platform":...}}`, else closes.

Rust: `x25519-dalek`, `chacha20poly1305`, `hkdf`, `hmac`, `sha2`, `subtle`, `rand`. TypeScript: `@noble/curves`, `@noble/ciphers`, `@noble/hashes` (pure JS, RN-safe).

### Frames (inside encryption)

| Frame | Direction | Shape |
|---|---|---|
| request | c→s | `{"type":"req","id":number,"cmd":string,"args":object}` |
| response | s→c | `{"type":"res","id":number,"ok":true,"data":any}` or `{"type":"res","id":number,"ok":false,"error":string}` |
| channel message | s→c | `{"type":"chan","id":number,"arg":string,"payload":any}` — `id` = originating request id, `arg` = the parameter name of the channel argument |
| global event | s→c | `{"type":"event","name":string,"payload":any}` |
| cancel | c→s | `{"type":"cancel","id":number}` (best-effort) |
| ping/pong | both | `{"type":"ping","t":number}` / `{"type":"pong","t":number}` |

### Command semantics

- `cmd` names and `args` are identical to the existing Tauri commands. Argument keys use the same camelCase names the desktop frontend already sends via `invoke(cmd, args)` (Tauri v2 converts Rust snake_case parameters to camelCase; the `l8gitd` dispatcher must replicate that conversion).
- Tauri `Channel<T>` parameters: the client sends the sentinel `{"__channel__":true}` as the argument value; the server replaces it with a sender that emits `chan` frames tagged with the request id and camelCase parameter name.
- Global events forwarded as `event` frames: `repo-changed`, `git-command`, `git-progress`, `git-progress-done` — identical payloads to today's Tauri events.
- Errors keep today's error-string behavior including sentinels (`__REMOTE_CANCELED__` etc.).

### Pairing

`l8gitd pair` generates (once, persisted in the OS keyring via the existing `secrets.rs` mechanics, service `l8gitd`): `hostId` (16 random bytes, base64url), `psk` (32 random bytes). It prints a QR code (crate `qrcode`, render to terminal) plus the JSON for manual entry:

`{"v":1,"hostId":"...","psk":"<base64>","name":"<hostname>","endpoints":["ws://<lan-ip>:<port>","<relayUrl if configured>"]}`

The phone scans this once per host and stores it in `expo-secure-store`. Multiple pairings = multiple hosts.

### Relay

Small axum crate in `relay/`. Blind: it only matches parties and pipes bytes.

- Host registers: WS `GET /host/{hostId}` with header `x-relay-token: <base64url sha256(psk || "l8git-relay-v1")>`. First registration for a hostId stores the token hash; later registrations must present the same token (trust-on-first-use per hostId).
- Client connects: WS `GET /client/{hostId}` with the same `x-relay-token` header.
- Multiplexing over the single host WS: relay wraps every message as `{"connId":string,"op":"open"|"data"|"close","data":"<base64>"}` (JSON text frames host↔relay). Client↔relay frames are raw binary, piped 1:1 into `data`.
- The E2E handshake runs through the relay unchanged (hello/welcome as `data` payloads). The relay never sees plaintext beyond the hello/welcome messages, which contain no secrets.
- `l8gitd` takes `--relay wss://host` config; it maintains a persistent outbound relay connection with exponential backoff reconnect.

## Rust: l8gitd

- New module `src-tauri/src/server/` + `[[bin]] name = "l8gitd"` in `src-tauri/Cargo.toml` (`required-features = ["headless"]` with a `headless` cargo feature enabling axum/tokio-net deps, so desktop builds are unaffected).
- Event sink: replace direct `app.emit` coupling with a small global sink (`server/sink.rs` or extension of `cmdlog::set_app_handle` pattern): the Tauri app registers a Tauri-emitting sink, `l8gitd` registers a per-connection broadcast sink. Watcher, cmdlog and git progress publish through it.
- Command refactor pattern per module: each `#[tauri::command] fn foo(state: State<X>, app: AppHandle, a: A) -> Result<B, String>` is split into `pub(crate) async fn foo_inner(x: &X, a: A) -> Result<B, String>` plus a thin Tauri wrapper. The dispatcher calls the inner functions.
- Dispatcher: `server/dispatch/<module>.rs` per domain, wired through a shared macro provided by the server skeleton that handles arg deserialization (camelCase), channel substitution and JSON result serialization. Every existing command is exposed; there is no curated allowlist — auth gates the whole surface.
- State: `l8gitd` owns `AgentTransportState`, `PtyState` and watcher state in a plain struct passed to dispatch.
- Sessions: multiple concurrent client connections are supported; channel frames and events go to the connection that issued the request (events: broadcast to all authenticated connections).
- CLI: `l8gitd serve [--port 8484] [--relay wss://...]`, `l8gitd pair`, `l8gitd status`. Repos: the server serves whatever repo paths clients request, guarded by `pathsafe` + a persisted allowlist of repo roots (`l8gitd allow <path>`, auto-populated with paths already in the desktop workspace file if present).

## TypeScript platform seam (desktop refactor, minimal blast radius)

New `src/lib/platform/` with the interface both runtimes implement:

```ts
export interface PlatformIpc {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
  channel<T>(onMessage: (msg: T) => void): unknown        // returns the value to pass as a channel arg
  listen(event: string, cb: (payload: unknown) => void): () => void
  storage: StateStorage                                    // zustand-compatible
  secrets: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; delete(k: string): Promise<void> }
}
export function setPlatform(p: PlatformIpc): void
export function platform(): PlatformIpc
```

- Desktop: `src/lib/platform/tauri.ts` implements it with `@tauri-apps/api` and `localStorage`; registered in `src/main.tsx` before anything else.
- Codemod scope (only what mobile needs): everything under `src/lib/agents/**` plus its transitive lib imports must consume `platform()` instead of importing `@tauri-apps/api/*`, `localStorage`, or DOM APIs directly. Desktop-only code outside that closure keeps direct imports.
- Constraint: after the codemod `bun run build` (tsc + vite) must pass and desktop behavior must be unchanged.
- Mobile: `mobile/lib/platform-remote.ts` implements `PlatformIpc` over the wire protocol, routing to the active connection; `storage` uses AsyncStorage, `secrets` uses expo-secure-store.

## Mobile app

- Expo SDK (latest), TypeScript, Expo Router. Libraries: nativewind v4 + react-native-reusables, react-native-reanimated, zustand, @tanstack/react-query, @noble/{curves,ciphers,hashes}, expo-camera (QR pairing), expo-secure-store, @react-native-async-storage/async-storage, lucide-react-native, react-native-svg, expo-haptics.
- Design: dark-first, zinc/near-black surfaces matching desktop l8git, Geist font (`@expo-google-fonts` equivalent or bundled), accent colors per domain, 60fps list scrolling (FlashList optional; FlatList acceptable v1), reanimated shared transitions for screen changes, skeleton loaders, haptic feedback on approvals.
- Navigation: bottom tabs — Inbox, Repos, Agents, Dashboard, Settings. Repo detail is a stack under Repos with segmented sections (Status/Commit, History, Branches, Stash, PRs, CI). Agents tab: overview list → thread chat; approvals surfaced globally (badge + inline cards).
- Connection manager (`mobile/lib/connections.ts`, zustand): N simultaneous connections, one per paired host; per-host status (connecting/online/offline/error), auto-reconnect with exponential backoff + jitter, app-state aware (reconnect on foreground, keep alive briefly in background), endpoint racing (try LAN first, fall back to relay), ping/pong liveness every 20 s.
- Data layer: TanStack Query for all request/response domains. Query keys always start with `[hostId, repoPath, domain, ...]`. Invalidation wired to `repo-changed`, `git-progress-done` and agent events. Mutations for all write operations with optimistic updates where cheap.
- Agents: the four provider chat stores from `src/lib/agents/**` are imported directly (via `@desktop/*` alias) and driven through the remote `PlatformIpc`. The Agents chat pane binds to one active host at a time; Inbox/Overview/Dashboard aggregate across all connected hosts via direct queries. Approvals (`AgentPendingRequest`) are the flagship mobile flow: push-style in-app banner, approve/deny with haptics.
- Claude MCP control-requests (`mcp_message`) are handled by the same imported store code on the phone — no extra work, but the connection must stay open during turns; reconnect uses `AgentStreamEvent.sequence` replay detection already present in `rpc-client.ts`.

## Out of scope v1 (deferred)

Monaco-based merge editor, interactive terminal UI (protocol supports PTY; UI later), Voice, offline write queue, iOS push notifications via APNs (requires server-side notification derivation; the in-app foreground experience covers v1).

## Quality bar

- No code comments (repo convention).
- Rust: `cargo check` green for desktop lib AND `cargo build --features headless --bin l8gitd` AND `cargo build -p l8git-relay`.
- TS: `bun run build` green at repo root; `bunx tsc --noEmit` green in `mobile/`.
- Every protocol implementation (crypto handshake, framing, dispatcher arg mapping) ships with a minimal runnable check (Rust unit test / vitest) proving a full round-trip.
