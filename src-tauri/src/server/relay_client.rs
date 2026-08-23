use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use crate::server::crypto;
use crate::server::state::ServerState;
use crate::server::ws::{self, Frame};

pub const TOKEN_HEADER: &str = "x-relay-token";
pub const OP_OPEN: &str = "open";
pub const OP_DATA: &str = "data";
pub const OP_CLOSE: &str = "close";

pub const BACKOFF_MIN: Duration = Duration::from_secs(1);
pub const BACKOFF_MAX: Duration = Duration::from_secs(60);
pub const PING_INTERVAL: Duration = Duration::from_secs(30);
pub const RELAY_QUEUE: usize = 256;

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type Outbound = mpsc::Sender<Message>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayFrame {
    conn_id: String,
    op: String,
    #[serde(default)]
    data: String,
}

impl RelayFrame {
    fn new(conn_id: &str, op: &str, payload: &[u8]) -> Self {
        Self {
            conn_id: conn_id.to_string(),
            op: op.to_string(),
            data: B64.encode(payload),
        }
    }

    fn payload(&self) -> Result<Vec<u8>, String> {
        B64.decode(self.data.as_bytes())
            .map_err(|e| format!("relay-Frame ohne gültiges base64: {e}"))
    }

    fn message(conn_id: &str, op: &str, payload: &[u8]) -> Message {
        Message::Text(
            serde_json::to_string(&Self::new(conn_id, op, payload))
                .unwrap_or_default()
                .into(),
        )
    }
}

pub fn endpoint(relay: &str, host_id: &str) -> Result<String, String> {
    let trimmed = relay.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Relay-URL ist leer".into());
    }
    let base = match trimmed.split_once("://") {
        Some(("wss", rest)) => format!("wss://{rest}"),
        Some(("ws", rest)) => format!("ws://{rest}"),
        Some(("https", rest)) => format!("wss://{rest}"),
        Some(("http", rest)) => format!("ws://{rest}"),
        Some((scheme, _)) => return Err(format!("Relay-URL mit unbekanntem Schema: {scheme}")),
        None => return Err(format!("Relay-URL ohne Schema: {trimmed}")),
    };
    if base.split("://").nth(1).is_none_or(str::is_empty) {
        return Err(format!("Relay-URL ohne Host: {trimmed}"));
    }
    Ok(format!("{base}/host/{host_id}"))
}

pub fn next_backoff(current: Duration) -> Duration {
    (current * 2).min(BACKOFF_MAX)
}

pub fn with_jitter(delay: Duration) -> Duration {
    let factor = rand::rngs::OsRng.gen_range(0.5f64..1.0f64);
    delay.mul_f64(factor)
}

pub async fn run(state: Arc<ServerState>, relay: String) {
    let url = match endpoint(&relay, &state.host_id) {
        Ok(url) => url,
        Err(error) => {
            log::error!("l8gitd Relay-Client: {error}");
            return;
        }
    };
    let token = crypto::relay_token(&state.psk);
    let mut backoff = BACKOFF_MIN;
    loop {
        match connect(&url, &token).await {
            Ok(socket) => {
                log::info!("l8gitd am Relay registriert: {url}");
                backoff = BACKOFF_MIN;
                if let Err(error) = pump(state.clone(), socket).await {
                    log::warn!("l8gitd Relay-Verbindung beendet: {error}");
                }
            }
            Err(error) => log::warn!("l8gitd Relay nicht erreichbar: {error}"),
        }
        let wait = with_jitter(backoff);
        log::debug!("l8gitd Relay-Reconnect in {:.1}s", wait.as_secs_f64());
        tokio::time::sleep(wait).await;
        backoff = next_backoff(backoff);
    }
}

async fn connect(url: &str, token: &str) -> Result<Socket, String> {
    let mut request = url
        .into_client_request()
        .map_err(|e| format!("Relay-URL ungültig: {e}"))?;
    let value = HeaderValue::from_str(token).map_err(|e| format!("Relay-Token ungültig: {e}"))?;
    request.headers_mut().insert(TOKEN_HEADER, value);
    let (socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| e.to_string())?;
    Ok(socket)
}

async fn pump(state: Arc<ServerState>, socket: Socket) -> Result<(), String> {
    let (mut sink, mut stream) = socket.split();
    let (out_tx, mut out_rx) = mpsc::channel::<Message>(RELAY_QUEUE);

    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if sink.send(message).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });
    let keepalive = tokio::spawn(keepalive_loop(out_tx.clone()));

    let mut conns: HashMap<String, mpsc::UnboundedSender<Frame>> = HashMap::new();
    let result = loop {
        let Some(message) = stream.next().await else {
            break Ok(());
        };
        let message = match message {
            Ok(message) => message,
            Err(error) => break Err(error.to_string()),
        };
        let raw = match message {
            Message::Text(text) => text.as_bytes().to_vec(),
            Message::Binary(bytes) => bytes.to_vec(),
            Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => continue,
            Message::Close(_) => break Ok(()),
        };
        match serde_json::from_slice::<RelayFrame>(&raw) {
            Ok(frame) => handle_relay_frame(&state, &out_tx, &mut conns, frame),
            Err(error) => log::warn!("l8gitd Relay-Frame unlesbar: {error}"),
        }
    };

    conns.clear();
    keepalive.abort();
    drop(out_tx);
    let _ = writer.await;
    result
}

async fn keepalive_loop(out: Outbound) {
    let mut ticker = tokio::time::interval(PING_INTERVAL);
    ticker.tick().await;
    loop {
        ticker.tick().await;
        if out
            .send(Message::Ping(Vec::<u8>::new().into()))
            .await
            .is_err()
        {
            return;
        }
    }
}

fn handle_relay_frame(
    state: &Arc<ServerState>,
    out: &Outbound,
    conns: &mut HashMap<String, mpsc::UnboundedSender<Frame>>,
    frame: RelayFrame,
) {
    match frame.op.as_str() {
        OP_OPEN => {
            let (in_tx, in_rx) = mpsc::unbounded_channel::<Frame>();
            conns.insert(frame.conn_id.clone(), in_tx);
            log::info!("l8gitd Relay-Verbindung {} geöffnet", frame.conn_id);
            tokio::spawn(relay_session(
                state.clone(),
                frame.conn_id,
                in_rx,
                out.clone(),
            ));
        }
        OP_DATA => {
            let Some(session) = conns.get(&frame.conn_id) else {
                let _ = out.try_send(RelayFrame::message(&frame.conn_id, OP_CLOSE, &[]));
                return;
            };
            match frame.payload() {
                Ok(payload) => {
                    if session.send(Frame::Binary(payload)).is_err() {
                        conns.remove(&frame.conn_id);
                        let _ = out.try_send(RelayFrame::message(&frame.conn_id, OP_CLOSE, &[]));
                    }
                }
                Err(error) => log::warn!("l8gitd Relay: {error}"),
            }
        }
        OP_CLOSE => {
            conns.remove(&frame.conn_id);
            log::info!("l8gitd Relay-Verbindung {} geschlossen", frame.conn_id);
        }
        other => log::warn!("l8gitd Relay: unbekannte op {other}"),
    }
}

async fn relay_session(
    state: Arc<ServerState>,
    conn_id: String,
    inbox: ws::Inbox,
    out: Outbound,
) {
    let (wire, mut wire_rx) = mpsc::channel::<Frame>(ws::WIRE_CAPACITY);
    let forward_id = conn_id.clone();
    let forward_out = out.clone();
    let forward = tokio::spawn(async move {
        while let Some(frame) = wire_rx.recv().await {
            let payload = frame.into_bytes();
            if forward_out
                .send(RelayFrame::message(&forward_id, OP_DATA, &payload))
                .await
                .is_err()
            {
                break;
            }
        }
    });
    if let Err(error) = ws::session(state, inbox, wire).await {
        log::debug!("l8gitd Relay-Session {conn_id} beendet: {error}");
    }
    let _ = forward.await;
    let _ = out.send(RelayFrame::message(&conn_id, OP_CLOSE, &[])).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_are_derived_from_the_configured_relay_url() {
        assert_eq!(
            endpoint("wss://relay.example", "abc").unwrap(),
            "wss://relay.example/host/abc"
        );
        assert_eq!(
            endpoint("  https://relay.example:9000/  ", "abc").unwrap(),
            "wss://relay.example:9000/host/abc"
        );
        assert_eq!(
            endpoint("http://127.0.0.1:8485", "a-b_c").unwrap(),
            "ws://127.0.0.1:8485/host/a-b_c"
        );
        assert!(endpoint("relay.example", "abc").is_err());
        assert!(endpoint("ftp://relay.example", "abc").is_err());
        assert!(endpoint("wss://", "abc").is_err());
        assert!(endpoint("   ", "abc").is_err());
    }

    #[test]
    fn backoff_doubles_up_to_the_cap_and_stays_jittered_below_it() {
        let mut delay = BACKOFF_MIN;
        for _ in 0..10 {
            let jittered = with_jitter(delay);
            assert!(jittered <= delay && jittered >= delay / 2);
            delay = next_backoff(delay);
        }
        assert_eq!(delay, BACKOFF_MAX);
        assert_eq!(next_backoff(BACKOFF_MAX), BACKOFF_MAX);
        assert_eq!(next_backoff(BACKOFF_MIN), Duration::from_secs(2));
    }

    #[test]
    fn relay_frames_match_the_wire_shape_of_the_relay_crate() {
        let Message::Text(text) = RelayFrame::message("c1", OP_DATA, b"hi") else {
            panic!("relay frames are text messages");
        };
        assert_eq!(text.as_str(), r#"{"connId":"c1","op":"data","data":"aGk="}"#);
        let parsed: RelayFrame =
            serde_json::from_str(r#"{"connId":"c1","op":"open","data":""}"#).unwrap();
        assert_eq!(parsed.op, OP_OPEN);
        assert!(parsed.payload().unwrap().is_empty());
        let missing: RelayFrame = serde_json::from_str(r#"{"connId":"c1","op":"close"}"#).unwrap();
        assert_eq!(missing.data, "");
    }

    #[tokio::test]
    async fn open_data_and_close_frames_drive_independent_sessions() {
        let psk = crypto::decode_psk(&crypto::random_psk_b64()).unwrap();
        let state = ServerState::new("host-x".into(), psk, vec![], None);
        let (out_tx, mut out_rx) = mpsc::channel::<Message>(RELAY_QUEUE);
        let mut conns = HashMap::new();

        handle_relay_frame(
            &state,
            &out_tx,
            &mut conns,
            RelayFrame::new("c1", OP_OPEN, &[]),
        );
        assert_eq!(conns.len(), 1);

        let (handshake, hello) = crypto::client_hello(&psk, "host-x");
        handle_relay_frame(
            &state,
            &out_tx,
            &mut conns,
            RelayFrame::new("c1", OP_DATA, &serde_json::to_vec(&hello).unwrap()),
        );
        let welcome_raw = expect_data(&mut out_rx, "c1").await;
        let welcome: crypto::Welcome = serde_json::from_slice(&welcome_raw).unwrap();
        let mut client = handshake.finish(&welcome).unwrap();

        let auth = client.auth_frame();
        handle_relay_frame(
            &state,
            &out_tx,
            &mut conns,
            RelayFrame::new("c1", OP_DATA, &client.sealer.seal_json(&auth).unwrap()),
        );
        let ready = expect_data(&mut out_rx, "c1").await;
        assert_eq!(client.opener.open_json(&ready).unwrap()["type"], "ready");

        handle_relay_frame(
            &state,
            &out_tx,
            &mut conns,
            RelayFrame::new("c2", OP_DATA, b"unknown conn"),
        );
        assert_eq!(expect_op(&mut out_rx).await, (String::from("c2"), OP_CLOSE.to_string()));

        handle_relay_frame(
            &state,
            &out_tx,
            &mut conns,
            RelayFrame::new("c1", OP_CLOSE, &[]),
        );
        assert!(conns.is_empty());
        assert_eq!(expect_op(&mut out_rx).await, (String::from("c1"), OP_CLOSE.to_string()));
    }

    async fn next_frame(out_rx: &mut mpsc::Receiver<Message>) -> RelayFrame {
        let message = tokio::time::timeout(Duration::from_secs(5), out_rx.recv())
            .await
            .expect("frame arrives in time")
            .expect("outbound channel is open");
        let Message::Text(text) = message else {
            panic!("relay frames are text messages");
        };
        serde_json::from_str(text.as_str()).unwrap()
    }

    async fn expect_data(out_rx: &mut mpsc::Receiver<Message>, conn_id: &str) -> Vec<u8> {
        let frame = next_frame(out_rx).await;
        assert_eq!(frame.conn_id, conn_id);
        assert_eq!(frame.op, OP_DATA);
        frame.payload().unwrap()
    }

    async fn expect_op(out_rx: &mut mpsc::Receiver<Message>) -> (String, String) {
        let frame = next_frame(out_rx).await;
        (frame.conn_id, frame.op)
    }
}
