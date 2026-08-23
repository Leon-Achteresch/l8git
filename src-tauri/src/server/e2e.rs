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
    let state = ServerState::new(HOST_ID.into(), psk, vec![], None);
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
    assert!(res["error"].as_str().unwrap().contains("Unbekannter Befehl"));

    let res = client
        .call(3, "repo_status", json!({ "repoPath": "/etc" }))
        .await;
    assert_eq!(res["ok"], false);
    assert!(res["error"].as_str().unwrap().contains("freigegeben"));

    client.send(json!({ "type": "ping", "t": 99 })).await;
    assert_eq!(
        client.recv().await.unwrap(),
        json!({ "type": "pong", "t": 99 })
    );
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
