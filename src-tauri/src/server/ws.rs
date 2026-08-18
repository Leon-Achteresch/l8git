use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio::task::AbortHandle;

use crate::server::crypto::{self, Hello, Opener, Sealer};
use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState};
use crate::server::{dispatch, exec, resources};

#[derive(Clone, Debug)]
pub enum Frame {
    Text(String),
    Binary(Vec<u8>),
}

impl Frame {
    pub fn into_bytes(self) -> Vec<u8> {
        match self {
            Frame::Text(text) => text.into_bytes(),
            Frame::Binary(bytes) => bytes,
        }
    }
}

pub type Inbox = mpsc::UnboundedReceiver<Frame>;
pub type Wire = mpsc::UnboundedSender<Frame>;

pub fn router(state: Arc<ServerState>) -> Router {
    Router::new()
        .route("/", get(upgrade))
        .route("/ws", get(upgrade))
        .route("/health", get(health))
        .with_state(state)
}

pub async fn serve(state: Arc<ServerState>, port: u16) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("Port {port} nicht belegbar: {e}"))?;
    log::info!("l8gitd listening on 0.0.0.0:{port} hostId={}", state.host_id);
    serve_on(state, listener).await
}

pub async fn serve_on(state: Arc<ServerState>, listener: tokio::net::TcpListener) -> Result<(), String> {
    axum::serve(listener, router(state))
        .await
        .map_err(|e| format!("Server beendet: {e}"))
}

async fn health() -> &'static str {
    "ok"
}

async fn upgrade(State(state): State<Arc<ServerState>>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| async move {
        if let Err(error) = socket_session(state, socket).await {
            log::debug!("l8gitd session ended: {error}");
        }
    })
}

async fn socket_session(state: Arc<ServerState>, socket: WebSocket) -> Result<(), String> {
    let (mut sink, mut stream) = socket.split();
    let (in_tx, in_rx) = mpsc::unbounded_channel::<Frame>();
    let (wire, mut wire_rx) = mpsc::unbounded_channel::<Frame>();

    let writer = tokio::spawn(async move {
        while let Some(frame) = wire_rx.recv().await {
            let message = match frame {
                Frame::Text(text) => Message::Text(text.into()),
                Frame::Binary(bytes) => Message::Binary(bytes.into()),
            };
            if sink.send(message).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    let reader = tokio::spawn(async move {
        while let Some(Ok(message)) = stream.next().await {
            let frame = match message {
                Message::Text(text) => Frame::Text(text.to_string()),
                Message::Binary(bytes) => Frame::Binary(bytes.to_vec()),
                Message::Ping(_) | Message::Pong(_) => continue,
                Message::Close(_) => break,
            };
            if in_tx.send(frame).is_err() {
                break;
            }
        }
    });

    let result = session(state, in_rx, wire).await;
    reader.abort();
    let _ = writer.await;
    result
}

pub async fn session(state: Arc<ServerState>, mut inbox: Inbox, wire: Wire) -> Result<(), String> {
    let hello_raw = inbox
        .recv()
        .await
        .ok_or_else(|| "kein hello empfangen".to_string())?
        .into_bytes();
    let hello: Hello =
        serde_json::from_slice(&hello_raw).map_err(|e| format!("ungültiges hello: {e}"))?;
    if hello.host_id != state.host_id {
        return Err("unbekannte hostId".into());
    }

    let (welcome, mut handshake) = crypto::server_accept(&state.psk, &hello)?;
    let welcome_raw = serde_json::to_string(&welcome).map_err(|e| e.to_string())?;
    wire.send(Frame::Text(welcome_raw))
        .map_err(|_| "Verbindung geschlossen".to_string())?;

    let auth_frame = match inbox.recv().await {
        Some(Frame::Binary(bytes)) => bytes,
        Some(Frame::Text(_)) => return Err("auth-Frame muss binär sein".into()),
        None => return Err("kein auth-Frame empfangen".into()),
    };
    let auth = handshake.opener.open_json(&auth_frame)?;
    if auth.get("type").and_then(Value::as_str) != Some("auth") {
        return Err("erster Frame muss auth sein".into());
    }
    let tag = auth.get("tag").and_then(Value::as_str).unwrap_or_default();
    if !handshake.verify_auth_tag(tag) {
        return Err("auth-Tag ungültig".into());
    }

    let ready = state.ready_frame();
    let (mut sealer, opener, _) = handshake.split();
    let ready_frame = sealer.seal_json(&ready)?;
    wire.send(Frame::Binary(ready_frame))
        .map_err(|_| "Verbindung geschlossen".to_string())?;

    let (outbox, out_rx) = mpsc::unbounded_channel::<Value>();
    let conn = Arc::new(ConnectionHandle::new(state.next_connection_id(), outbox));
    log::info!("l8gitd connection {} authenticated", conn.id);

    let writer = tokio::spawn(writer_loop(wire, sealer, out_rx));
    let events = tokio::spawn(event_loop(state.clone(), conn.clone()));

    let result = read_loop(state.clone(), conn.clone(), opener, inbox).await;

    conn.release_resources(&state);
    log::info!("l8gitd connection {} closed", conn.id);
    drop(conn);
    events.abort();
    let _ = writer.await;
    result
}

async fn writer_loop(wire: Wire, mut sealer: Sealer, mut out_rx: mpsc::UnboundedReceiver<Value>) {
    while let Some(frame) = out_rx.recv().await {
        let Ok(sealed) = sealer.seal_json(&frame) else {
            break;
        };
        if wire.send(Frame::Binary(sealed)).is_err() {
            break;
        }
    }
}

async fn event_loop(state: Arc<ServerState>, conn: Arc<ConnectionHandle>) {
    let mut rx = state.events.subscribe();
    loop {
        match rx.recv().await {
            Ok(event) => {
                if !conn.send_event(&event.name, event.payload) {
                    return;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                log::warn!("l8gitd connection {} dropped {skipped} events", conn.id);
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => return,
        }
    }
}

type Pending = Arc<Mutex<HashMap<i64, AbortHandle>>>;

async fn read_loop(
    state: Arc<ServerState>,
    conn: Arc<ConnectionHandle>,
    mut opener: Opener,
    mut inbox: Inbox,
) -> Result<(), String> {
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
    let mut outcome = Ok(());
    while let Some(message) = inbox.recv().await {
        let Frame::Binary(bytes) = message else {
            outcome = Err("unerwarteter Text-Frame nach dem Handshake".to_string());
            break;
        };
        match opener.open_json(&bytes) {
            Ok(frame) => handle_frame(&state, &conn, &pending, frame),
            Err(error) => {
                outcome = Err(error);
                break;
            }
        }
    }
    for (_, handle) in pending.lock().unwrap_or_else(|e| e.into_inner()).drain() {
        handle.abort();
    }
    outcome
}

fn frame_id(frame: &Value) -> Option<i64> {
    frame.get("id").and_then(Value::as_i64)
}

fn handle_frame(state: &Arc<ServerState>, conn: &Arc<ConnectionHandle>, pending: &Pending, frame: Value) {
    match frame.get("type").and_then(Value::as_str).unwrap_or_default() {
        "ping" => {
            conn.send_pong(frame.get("t").cloned().unwrap_or(Value::Null));
        }
        "cancel" => {
            let Some(id) = frame_id(&frame) else {
                return;
            };
            let handle = pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);
            if let Some(handle) = handle {
                handle.abort();
                conn.send_response(id, Err("__REMOTE_CANCELED__".to_string()));
            }
        }
        "req" => spawn_request(state, conn, pending, frame),
        other => {
            log::debug!("l8gitd ignoring frame type {other}");
        }
    }
}

fn spawn_request(state: &Arc<ServerState>, conn: &Arc<ConnectionHandle>, pending: &Pending, frame: Value) {
    let Some(id) = frame_id(&frame) else {
        conn.send_response(0, Err("req-Frame ohne id".to_string()));
        return;
    };
    let Some(cmd) = frame.get("cmd").and_then(Value::as_str).map(str::to_string) else {
        conn.send_response(id, Err("req-Frame ohne cmd".to_string()));
        return;
    };
    let args = match frame.get("args") {
        None | Some(Value::Null) => json!({}),
        Some(Value::Object(map)) => Value::Object(map.clone()),
        Some(_) => {
            conn.send_response(id, Err("args muss ein Objekt sein".to_string()));
            return;
        }
    };
    if let Err(error) = state.ensure_allowed(&args) {
        conn.send_response(id, Err(error));
        return;
    }

    let ctx = DispatchCtx::new(state.clone(), conn.clone(), id, &cmd);
    let conn_for_task = conn.clone();
    let pending_for_task = pending.clone();
    let (cancel, canceled) = tokio::sync::oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        let _cancel_on_abort = cancel;
        let tracked = resources::tracked(&cmd).then(|| (cmd.clone(), args.clone()));
        let result = tokio::task::spawn_blocking(move || {
            exec::run(dispatch::dispatch(&cmd, args, &ctx), canceled)
        })
        .await
        .unwrap_or_else(|error| Err(format!("Befehl abgebrochen: {error}")));
        if let (Some((cmd, args)), Ok(data)) = (tracked, &result) {
            conn_for_task.record_resource(&cmd, &args, data);
        }
        pending_for_task
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
        conn_for_task.send_response(id, result);
    });
    pending
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id, task.abort_handle());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn harness() -> (Arc<ServerState>, Arc<ConnectionHandle>, Pending, mpsc::UnboundedReceiver<Value>) {
        let state = ServerState::new("host".into(), [3u8; 32], vec![], None);
        let (tx, rx) = mpsc::unbounded_channel();
        let conn = Arc::new(ConnectionHandle::new(1, tx));
        (state, conn, Arc::new(Mutex::new(HashMap::new())), rx)
    }

    async fn drain(rx: &mut mpsc::UnboundedReceiver<Value>) -> Value {
        tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv())
            .await
            .expect("frame arrives")
            .expect("channel open")
    }

    #[tokio::test]
    async fn ping_is_answered_with_a_pong_carrying_the_same_timestamp() {
        let (state, conn, pending, mut rx) = harness();
        handle_frame(&state, &conn, &pending, json!({ "type": "ping", "t": 17 }));
        assert_eq!(drain(&mut rx).await, json!({ "type": "pong", "t": 17 }));
    }

    #[tokio::test]
    async fn unknown_commands_answer_with_an_error_response() {
        let (state, conn, pending, mut rx) = harness();
        handle_frame(
            &state,
            &conn,
            &pending,
            json!({ "type": "req", "id": 9, "cmd": "does_not_exist", "args": {} }),
        );
        let frame = drain(&mut rx).await;
        assert_eq!(frame["type"], "res");
        assert_eq!(frame["id"], 9);
        assert_eq!(frame["ok"], false);
        assert!(frame["error"].as_str().unwrap().contains("Unbekannter Befehl"));
    }

    #[tokio::test]
    async fn requests_touching_paths_outside_the_allowlist_are_refused() {
        let (state, conn, pending, mut rx) = harness();
        handle_frame(
            &state,
            &conn,
            &pending,
            json!({ "type": "req", "id": 4, "cmd": "repo_status", "args": { "repoPath": "/etc" } }),
        );
        let frame = drain(&mut rx).await;
        assert_eq!(frame["id"], 4);
        assert_eq!(frame["ok"], false);
        assert!(frame["error"].as_str().unwrap().contains("freigegeben"));
    }

    #[tokio::test]
    async fn malformed_requests_are_rejected_without_dispatching() {
        let (state, conn, pending, mut rx) = harness();
        handle_frame(&state, &conn, &pending, json!({ "type": "req", "cmd": "x" }));
        assert_eq!(drain(&mut rx).await["id"], 0);
        handle_frame(&state, &conn, &pending, json!({ "type": "req", "id": 2 }));
        assert!(drain(&mut rx).await["error"]
            .as_str()
            .unwrap()
            .contains("cmd"));
        handle_frame(
            &state,
            &conn,
            &pending,
            json!({ "type": "req", "id": 3, "cmd": "x", "args": 5 }),
        );
        assert!(drain(&mut rx).await["error"]
            .as_str()
            .unwrap()
            .contains("Objekt"));
    }

    #[tokio::test]
    async fn cancel_reports_the_remote_cancel_sentinel_for_running_requests() {
        let (state, conn, pending, mut rx) = harness();
        let (never_tx, never_rx) = tokio::sync::oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            let _ = never_rx.await;
        });
        pending
            .lock()
            .unwrap()
            .insert(11, task.abort_handle());
        handle_frame(&state, &conn, &pending, json!({ "type": "cancel", "id": 11 }));
        let frame = drain(&mut rx).await;
        assert_eq!(frame["ok"], false);
        assert_eq!(frame["error"], "__REMOTE_CANCELED__");
        assert!(pending.lock().unwrap().is_empty());
        handle_frame(&state, &conn, &pending, json!({ "type": "cancel", "id": 11 }));
        assert!(rx.try_recv().is_err());
        drop(never_tx);
    }

    #[tokio::test]
    async fn a_session_over_plain_channels_completes_the_handshake_and_serves_frames() {
        let psk = crypto::decode_psk(&crypto::random_psk_b64()).unwrap();
        let state = ServerState::new("host-x".into(), psk, vec![], None);
        let (in_tx, in_rx) = mpsc::unbounded_channel::<Frame>();
        let (wire_tx, mut wire_rx) = mpsc::unbounded_channel::<Frame>();
        let task = tokio::spawn(session(state, in_rx, wire_tx));

        let (handshake, hello) = crypto::client_hello(&psk, "host-x");
        in_tx
            .send(Frame::Binary(serde_json::to_vec(&hello).unwrap()))
            .unwrap();
        let Some(Frame::Text(welcome_raw)) = wire_rx.recv().await else {
            panic!("welcome must be a text frame");
        };
        let welcome: crypto::Welcome = serde_json::from_str(&welcome_raw).unwrap();
        let mut client = handshake.finish(&welcome).unwrap();

        let auth = client.auth_frame();
        in_tx
            .send(Frame::Binary(client.sealer.seal_json(&auth).unwrap()))
            .unwrap();
        let Some(Frame::Binary(ready)) = wire_rx.recv().await else {
            panic!("ready must be a binary frame");
        };
        assert_eq!(client.opener.open_json(&ready).unwrap()["type"], "ready");

        let ping = json!({ "type": "ping", "t": 42 });
        in_tx
            .send(Frame::Binary(client.sealer.seal_json(&ping).unwrap()))
            .unwrap();
        let Some(Frame::Binary(pong)) = wire_rx.recv().await else {
            panic!("pong must be a binary frame");
        };
        assert_eq!(
            client.opener.open_json(&pong).unwrap(),
            json!({ "type": "pong", "t": 42 })
        );

        drop(in_tx);
        assert!(task.await.unwrap().is_ok());
        assert!(wire_rx.recv().await.is_none());
    }

    #[tokio::test]
    async fn a_slow_synchronous_command_never_stalls_the_ping_loop() {
        let psk = crypto::decode_psk(&crypto::random_psk_b64()).unwrap();
        let state = ServerState::new("host-slow".into(), psk, vec![], None);
        let (in_tx, in_rx) = mpsc::unbounded_channel::<Frame>();
        let (wire_tx, mut wire_rx) = mpsc::unbounded_channel::<Frame>();
        let task = tokio::spawn(session(state, in_rx, wire_tx));

        let (handshake, hello) = crypto::client_hello(&psk, "host-slow");
        in_tx
            .send(Frame::Binary(serde_json::to_vec(&hello).unwrap()))
            .unwrap();
        let Some(Frame::Text(welcome_raw)) = wire_rx.recv().await else {
            panic!("welcome must be a text frame");
        };
        let welcome: crypto::Welcome = serde_json::from_str(&welcome_raw).unwrap();
        let mut client = handshake.finish(&welcome).unwrap();
        let auth = client.auth_frame();
        in_tx
            .send(Frame::Binary(client.sealer.seal_json(&auth).unwrap()))
            .unwrap();
        let Some(Frame::Binary(ready)) = wire_rx.recv().await else {
            panic!("ready must be a binary frame");
        };
        assert_eq!(client.opener.open_json(&ready).unwrap()["type"], "ready");

        let slow = json!({
            "type": "req",
            "id": 1,
            "cmd": dispatch::TEST_SLEEP_COMMAND,
            "args": { "millis": 1500 }
        });
        in_tx
            .send(Frame::Binary(client.sealer.seal_json(&slow).unwrap()))
            .unwrap();
        let ping = json!({ "type": "ping", "t": 5 });
        in_tx
            .send(Frame::Binary(client.sealer.seal_json(&ping).unwrap()))
            .unwrap();

        let started = std::time::Instant::now();
        let pong = tokio::time::timeout(std::time::Duration::from_millis(600), wire_rx.recv())
            .await
            .expect("the pong arrives while the slow command is still running");
        let Some(Frame::Binary(pong)) = pong else {
            panic!("pong must be a binary frame");
        };
        assert_eq!(
            client.opener.open_json(&pong).unwrap(),
            json!({ "type": "pong", "t": 5 })
        );
        assert!(started.elapsed() < std::time::Duration::from_millis(600));

        let Some(Frame::Binary(res)) = wire_rx.recv().await else {
            panic!("the slow command still answers");
        };
        let res = client.opener.open_json(&res).unwrap();
        assert_eq!(res["id"], 1);
        assert_eq!(res["data"], "slept");
        assert!(started.elapsed() >= std::time::Duration::from_millis(1400));

        drop(in_tx);
        assert!(task.await.unwrap().is_ok());
    }

    #[tokio::test]
    async fn a_session_rejects_a_hello_for_another_host_id() {
        let psk = crypto::decode_psk(&crypto::random_psk_b64()).unwrap();
        let state = ServerState::new("host-x".into(), psk, vec![], None);
        let (in_tx, in_rx) = mpsc::unbounded_channel::<Frame>();
        let (wire_tx, mut wire_rx) = mpsc::unbounded_channel::<Frame>();
        let task = tokio::spawn(session(state, in_rx, wire_tx));
        let (_, hello) = crypto::client_hello(&psk, "someone-else");
        in_tx
            .send(Frame::Binary(serde_json::to_vec(&hello).unwrap()))
            .unwrap();
        assert!(task.await.unwrap().is_err());
        assert!(wire_rx.recv().await.is_none());
    }

    #[tokio::test]
    async fn sink_events_are_broadcast_to_authenticated_connections() {
        let (state, conn, _pending, mut rx) = harness();
        let events = tokio::spawn(event_loop(state.clone(), conn.clone()));
        while state.events.receiver_count() == 0 {
            tokio::task::yield_now().await;
        }
        state
            .events
            .send(crate::server::state::BroadcastEvent {
                name: "repo-changed".into(),
                payload: json!("/tmp/repo"),
            })
            .unwrap();
        assert_eq!(
            drain(&mut rx).await,
            json!({ "type": "event", "name": "repo-changed", "payload": "/tmp/repo" })
        );
        events.abort();
    }
}
