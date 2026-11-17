use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use crate::server::crypto::{self, Session, Welcome};
use crate::server::state::ServerState;
use crate::server::ws;

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[path = "../../tests/common/mod.rs"]
mod workspace_test_repos;

const HOST_ID: &str = "e2e-host";
const TIMEOUT: Duration = Duration::from_secs(10);

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct Host {
    addr: SocketAddr,
    psk: [u8; crypto::PSK_LEN],
    state: Arc<ServerState>,
    task: tokio::task::JoinHandle<Result<(), String>>,
}

impl Drop for Host {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn start() -> Host {
    let psk = crypto::decode_psk(&crypto::random_psk_b64()).unwrap();
    let state = ServerState::new(HOST_ID.into(), psk, vec![]);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let task = tokio::spawn(ws::serve_on(state.clone(), listener));
    Host {
        addr,
        psk,
        state,
        task,
    }
}

struct Client {
    socket: Socket,
    session: Session,
}

async fn recv(socket: &mut Socket) -> Option<Message> {
    loop {
        let next = tokio::time::timeout(TIMEOUT, socket.next())
            .await
            .expect("the host answers in time")?;
        match next.expect("the socket stays readable") {
            Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => continue,
            Message::Close(_) => return None,
            message => return Some(message),
        }
    }
}

async fn handshake(host: &Host, host_id: &str) -> Result<Client, String> {
    let (mut socket, _) = tokio_tungstenite::connect_async(format!("ws://{}/ws", host.addr))
        .await
        .map_err(|e| e.to_string())?;
    let (pending, hello) = crypto::client_hello(&host.psk, host_id);
    socket
        .send(Message::Text(serde_json::to_string(&hello).unwrap().into()))
        .await
        .map_err(|e| e.to_string())?;
    let Some(Message::Text(raw)) = recv(&mut socket).await else {
        return Err("welcome must arrive as a plaintext text frame".into());
    };
    let welcome: Welcome = serde_json::from_str(raw.as_str()).map_err(|e| e.to_string())?;
    let session = pending.finish(&welcome)?;
    Ok(Client { socket, session })
}

impl Client {
    async fn send(&mut self, frame: Value) {
        let sealed = self.session.sealer.seal_json(&frame).unwrap();
        self.socket
            .send(Message::Binary(sealed.into()))
            .await
            .unwrap();
    }

    async fn recv(&mut self) -> Option<Value> {
        match recv(&mut self.socket).await? {
            Message::Binary(bytes) => Some(self.session.opener.open_json(&bytes).unwrap()),
            other => panic!("expected an encrypted binary frame, got {other:?}"),
        }
    }

    async fn authenticate(&mut self) -> Value {
        let auth = self.session.auth_frame();
        self.send(auth).await;
        self.recv().await.expect("the host replies with ready")
    }

    async fn call(&mut self, id: i64, cmd: &str, args: Value) -> Value {
        self.send(json!({ "type": "req", "id": id, "cmd": cmd, "args": args }))
            .await;
        loop {
            let frame = self.recv().await.expect("the host answers the request");
            if frame["type"] == "res" && frame["id"] == id {
                return frame;
            }
        }
    }
}

#[tokio::test]
async fn a_paired_client_authenticates_and_calls_a_command_over_the_socket() {
    let host = start().await;
    let mut client = handshake(&host, HOST_ID).await.unwrap();

    let ready = client.authenticate().await;
    assert_eq!(ready["type"], "ready");
    assert_eq!(ready["host"]["platform"], std::env::consts::OS);
    assert_eq!(ready["host"]["version"], env!("CARGO_PKG_VERSION"));
    assert!(ready["host"]["name"].as_str().is_some_and(|n| !n.is_empty()));

    let res = client.call(1, "git_command_log", json!({ "limit": 3 })).await;
    assert_eq!(res["ok"], true);
    assert!(res["data"].as_array().is_some_and(|entries| entries.len() <= 3));

    let res = client.call(2, "no_such_command", json!({})).await;
    assert_eq!(res["ok"], false);
    assert!(res["error"].as_str().unwrap().contains("Unknown command"));

    let res = client
        .call(3, "repo_status", json!({ "repoPath": "/etc" }))
        .await;
    assert_eq!(res["ok"], false);
    assert!(res["error"].as_str().unwrap().contains("shared"));

    client.send(json!({ "type": "ping", "t": 99 })).await;
    assert_eq!(
        client.recv().await.unwrap(),
        json!({ "type": "pong", "t": 99 })
    );
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn workspace_fetch_ipc_over_the_paired_socket_uses_server_membership() {
    use workspace_test_repos::TestRepo;

    let repo = TestRepo::new("workspace-fetch-socket");
    let source = TestRepo::new("workspace-fetch-socket-source");
    source.commit("fixture.txt", "first\n", "first");
    repo.git(&["remote", "add", "origin", &source.file_url()]);
    let host = start().await;
    host.state.roots.write().unwrap().push(repo.path.clone());
    let mut client = handshake(&host, HOST_ID).await.unwrap();
    assert_eq!(client.authenticate().await["type"], "ready");

    let path = repo.s();
    let preview = client
        .call(1, "repo_fetch_scope", json!({ "path": path }))
        .await;
    assert_eq!(preview["ok"], true);
    assert_eq!(preview["data"]["target"]["remote"], "origin");
    let args =
        json!({ "path": path, "workspaceId": "workspace", "target": preview["data"]["target"] });
    let command = "__test_workspace_fetch";
    assert_eq!(client.call(2, command, args.clone()).await["ok"], false);
    {
        let mut fixture = host.state.workspace_fetch_fixture.write().unwrap();
        fixture.active_workspace = Some("workspace".into());
        fixture.opened.push(repo.path.clone());
        fixture.approvals.push(
            crate::git::WorkspaceFetchApproval::capture("workspace", repo.path.clone()).unwrap(),
        );
    }
    assert_eq!(client.call(3, command, args.clone()).await["ok"], true);
    assert_eq!(repo.rev("refs/remotes/origin/main"), source.head());

    host.state
        .workspace_fetch_fixture
        .write()
        .unwrap()
        .approvals
        .clear();
    let mut retry = args;
    retry["opId"] = json!("socket-retry");
    let rejected = client.call(4, command, retry).await;
    assert_eq!(rejected["ok"], false);
    assert!(rejected["error"]
        .as_str()
        .unwrap()
        .contains("no approved membership"));
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn single_fetch_ipc_reports_progress_log_and_releases_remote_reservation() {
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use workspace_test_repos::TestRepo;

    async fn fetch_result(client: &mut Client, id: i64, op_id: &str) -> (Value, Value, bool) {
        let mut response = None;
        let mut done = None;
        let mut progress = false;
        while response.is_none() || done.is_none() {
            let frame = client.recv().await.expect("fetch completion arrives");
            if frame["type"] == "res" && frame["id"] == id {
                response = Some(frame);
            } else if frame["type"] == "event" && frame["payload"]["opId"] == op_id {
                if frame["name"] == "git-progress-done" {
                    done = Some(frame["payload"].clone());
                } else if frame["name"] == "git-progress" && frame["payload"]["op"] == "fetch" {
                    progress = true;
                }
            }
        }
        (response.unwrap(), done.unwrap(), progress)
    }

    async fn wait_for_transport(started: &std::path::Path) {
        tokio::time::timeout(TIMEOUT, async {
            while !started.exists() {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("fetch reached the local transport");
    }

    let repo = TestRepo::new("single-fetch-ipc");
    let source = TestRepo::new("single-fetch-ipc-source");
    let links = TestRepo::new("single-fetch-ipc-links");
    let alias = links.path.join("alias");
    symlink(&repo.path, &alias).unwrap();
    let first = source.commit("fixture.txt", "first\n", "first");
    repo.git(&["remote", "add", "origin", &source.file_url()]);
    let transport = repo.path.join(".git/fixture-upload-pack");
    let hold = repo.path.join(".git/hold-transport");
    let started = repo.path.join(".git/transport-started");
    let fail = repo.path.join(".git/fail-transport");
    repo.write(
        ".git/fixture-upload-pack",
        r#"#!/bin/sh
dir=${0%/*}
: > "$dir/transport-started"
printf 'Counting objects: 50%% (1/2)\r' >&2
for attempt in $(seq 1 750); do
    if [ ! -f "$dir/hold-transport" ]; then
        [ ! -f "$dir/fail-transport" ] || exit 17
        exec git-upload-pack "$@"
    fi
    sleep 0.02
done
exit 1
"#,
    );
    fs::set_permissions(&transport, fs::Permissions::from_mode(0o700)).unwrap();
    let command = format!("'{}'", transport.to_str().unwrap().replace('\'', "'\\''"));
    repo.git(&["config", "remote.origin.uploadpack", &command]);

    let host = start().await;
    // The production daemon installs this same sink before serving. This
    // acceptance test is run in its own test process because the sink is global.
    crate::server::sink::install(&host.state);
    host.state.roots.write().unwrap().push(repo.path.clone());
    let mut owner = handshake(&host, HOST_ID).await.unwrap();
    let mut competitor = handshake(&host, HOST_ID).await.unwrap();
    assert_eq!(owner.authenticate().await["type"], "ready");
    assert_eq!(competitor.authenticate().await["type"], "ready");

    let path = repo.s();
    let preview = owner
        .call(1, "repo_fetch_scope", json!({ "path": path }))
        .await;
    assert_eq!(preview["ok"], true);
    assert_eq!(preview["data"]["remotes"], json!(["origin"]));
    assert_eq!(preview["data"]["target"]["remote"], "origin");
    assert!(preview["data"]["target"]["fingerprint"]
        .as_str()
        .is_some_and(|value| value.len() == 64));
    assert!(!started.exists());
    assert!(!repo.exists(".git/FETCH_HEAD"));

    let request = |id: i64, op_id: &str| {
        json!({ "type": "req", "id": id, "cmd": "git_fetch",
        "args": { "path": path, "remote": "origin", "opId": op_id } })
    };
    fs::write(&hold, "").unwrap();
    owner.send(request(2, "single-success")).await;
    wait_for_transport(&started).await;
    let conflict = competitor
        .call(
            3,
            "git_fetch",
            json!({
                "path": alias, "remote": "origin", "opId": "single-conflict",
            }),
        )
        .await;
    assert_eq!(conflict["ok"], false);
    assert!(conflict["error"]
        .as_str()
        .unwrap()
        .contains("git.remoteBusy"));
    for (id, command) in [(9, "git_pull"), (10, "git_push")] {
        let conflict = competitor
            .call(
                id,
                command,
                json!({
                    "path": alias, "remote": "origin", "setUpstream": false, "dryRun": true,
                }),
            )
            .await;
        assert_eq!(conflict["ok"], false);
        assert!(conflict["error"]
            .as_str()
            .unwrap()
            .contains("git.remoteBusy"));
    }
    fs::remove_file(&hold).unwrap();
    let (result, done, progress) = fetch_result(&mut owner, 2, "single-success").await;
    assert_eq!(result["ok"], true);
    assert_eq!(done["ok"], true);
    assert!(
        progress,
        "streamed Git progress must reach the authenticated client"
    );
    assert_eq!(repo.rev("refs/remotes/origin/main"), first);

    fs::write(&fail, "").unwrap();
    owner.send(request(4, "single-failure")).await;
    let (result, done, _) = fetch_result(&mut owner, 4, "single-failure").await;
    assert_eq!(result["ok"], false);
    assert_eq!(done["ok"], false);
    assert_eq!(done["canceled"], false);
    fs::remove_file(&fail).unwrap();

    fs::remove_file(&started).unwrap();
    fs::write(&hold, "").unwrap();
    owner.send(request(5, "single-cancel")).await;
    wait_for_transport(&started).await;
    let canceled = competitor
        .call(6, "git_remote_cancel", json!({ "opId": "single-cancel" }))
        .await;
    assert_eq!(canceled["ok"], true);
    assert_eq!(canceled["data"], true);
    let (result, done, _) = fetch_result(&mut owner, 5, "single-cancel").await;
    assert_eq!(result["ok"], false);
    assert_eq!(done["canceled"], true);
    fs::remove_file(&hold).unwrap();

    let second = source.commit("fixture.txt", "second\n", "second");
    owner.send(request(7, "single-retry")).await;
    let (result, done, _) = fetch_result(&mut owner, 7, "single-retry").await;
    assert_eq!(result["ok"], true);
    assert_eq!(done["ok"], true);
    assert_eq!(repo.rev("refs/remotes/origin/main"), second);

    repo.git(&["switch", "-c", "main", "--track", "origin/main"]);
    let third = source.commit("fixture.txt", "third\n", "third");
    let pull = owner
        .call(
            11,
            "git_pull",
            json!({
                "path": path, "remote": "origin", "strategy": "ff-only",
            }),
        )
        .await;
    assert_eq!(pull["ok"], true, "{pull}");
    assert_eq!(repo.head(), third);
    let push = owner
        .call(
            12,
            "git_push",
            json!({
                "path": path, "remote": "origin", "setUpstream": false, "dryRun": true,
            }),
        )
        .await;
    assert_eq!(push["ok"], true, "{push}");
    assert_eq!(source.head(), third);

    let log = owner.call(8, "git_command_log", json!({})).await;
    let entries = log["data"].as_array().unwrap();
    let outcomes: Vec<_> = entries
        .iter()
        .filter(|row| {
            row["args"][0] == "fetch"
                && (row["repoPath"] == path || row["repoPath"] == json!(alias))
        })
        .map(|row| row["exitOk"].as_bool().unwrap())
        .collect();
    assert_eq!(
        outcomes.len(),
        4,
        "conflicting fetch must never reach the runner"
    );
    assert_eq!(outcomes.iter().filter(|success| **success).count(), 2);
    for command in ["pull", "push"] {
        assert_eq!(
            entries
                .iter()
                .filter(|row| {
                    row["args"][0] == command
                        && (row["repoPath"] == path || row["repoPath"] == json!(alias))
                })
                .count(),
            1,
            "only the accepted {command} may reach the runner"
        );
    }
}

#[tokio::test]
async fn a_request_before_authentication_is_refused_and_closes_the_socket() {
    let host = start().await;
    let mut client = handshake(&host, HOST_ID).await.unwrap();

    client
        .send(json!({ "type": "req", "id": 1, "cmd": "git_command_log", "args": {} }))
        .await;
    assert!(
        client.recv().await.is_none(),
        "an unauthenticated request must not be answered"
    );
}

#[tokio::test]
async fn a_wrong_auth_tag_closes_the_socket_without_a_ready_frame() {
    let host = start().await;
    let mut client = handshake(&host, HOST_ID).await.unwrap();

    let forged = B64.encode([0u8; 32]);
    client.send(json!({ "type": "auth", "tag": forged })).await;
    assert!(client.recv().await.is_none());
}

#[tokio::test]
async fn a_dropped_connection_closes_the_pty_it_opened() {
    let host = start().await;
    let mut client = handshake(&host, HOST_ID).await.unwrap();
    client.authenticate().await;

    let res = client
        .call(
            1,
            "pty_open",
            json!({
                "cols": 80,
                "rows": 24,
                "onData": { "__channel__": true },
                "onExit": { "__channel__": true }
            }),
        )
        .await;
    assert_eq!(res["ok"], true, "pty_open failed: {res}");
    let id = res["data"].as_u64().expect("pty_open returns an id") as u32;
    assert!(host.state.pty.is_open(id));

    drop(client);

    let mut closed = false;
    for _ in 0..100 {
        if !host.state.pty.is_open(id) {
            closed = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(closed, "the pty of a dropped connection must be closed");

    let mut next = handshake(&host, HOST_ID).await.unwrap();
    next.authenticate().await;
    let res = next
        .call(1, "pty_write", json!({ "id": id, "data": "x" }))
        .await;
    assert_eq!(res["ok"], false);
    assert_eq!(res["error"], "no session");
}

#[tokio::test]
async fn a_pty_closed_by_its_owner_is_not_closed_twice_on_disconnect() {
    let host = start().await;
    let mut client = handshake(&host, HOST_ID).await.unwrap();
    client.authenticate().await;

    let res = client
        .call(
            1,
            "pty_open",
            json!({
                "cols": 80,
                "rows": 24,
                "onData": { "__channel__": true },
                "onExit": { "__channel__": true }
            }),
        )
        .await;
    let first = res["data"].as_u64().expect("pty_open returns an id") as u32;
    assert_eq!(client.call(2, "pty_close", json!({ "id": first })).await["ok"], true);
    assert!(!host.state.pty.is_open(first));

    let res = client
        .call(
            3,
            "pty_open",
            json!({
                "cols": 80,
                "rows": 24,
                "onData": { "__channel__": true },
                "onExit": { "__channel__": true }
            }),
        )
        .await;
    let second = res["data"].as_u64().expect("pty_open returns an id") as u32;
    assert_ne!(first, second);

    drop(client);

    let mut closed = false;
    for _ in 0..100 {
        if !host.state.pty.is_open(second) {
            closed = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(closed, "the still open pty must be closed on disconnect");
}

#[tokio::test]
async fn a_hello_for_an_unknown_host_id_is_rejected() {
    let host = start().await;
    assert!(handshake(&host, "someone-else").await.is_err());
}
