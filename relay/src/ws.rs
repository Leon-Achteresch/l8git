use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;

use crate::frame::{RelayFrame, OP_CLOSE, OP_DATA, OP_OPEN};
use crate::state::{HostLink, RelayState};

pub const TOKEN_HEADER: &str = "x-relay-token";

pub fn router(state: Arc<RelayState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/host/{host_id}", get(host_upgrade))
        .route("/client/{host_id}", get(client_upgrade))
        .with_state(state)
}

pub async fn serve(state: Arc<RelayState>, bind: &str, port: u16) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind((bind, port))
        .await
        .map_err(|e| format!("cannot bind {bind}:{port}: {e}"))?;
    log::info!("l8git-relay listening on {bind}:{port}");
    axum::serve(listener, router(state))
        .await
        .map_err(|e| format!("relay stopped: {e}"))
}

async fn health() -> &'static str {
    "ok"
}

fn token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(TOKEN_HEADER)?
        .to_str()
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn host_upgrade(
    State(state): State<Arc<RelayState>>,
    Path(host_id): Path<String>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(token) = token(&headers) else {
        return (StatusCode::UNAUTHORIZED, "missing x-relay-token").into_response();
    };
    if !state.register_token(&host_id, &token) {
        log::warn!("relay rejected host {host_id}: token mismatch");
        return (StatusCode::FORBIDDEN, "token mismatch").into_response();
    }
    ws.on_upgrade(move |socket| host_session(state, host_id, socket))
}

async fn client_upgrade(
    State(state): State<Arc<RelayState>>,
    Path(host_id): Path<String>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(token) = token(&headers) else {
        return (StatusCode::UNAUTHORIZED, "missing x-relay-token").into_response();
    };
    if !state.check_token(&host_id, &token) {
        log::warn!("relay rejected client for {host_id}: unknown host or token mismatch");
        return (StatusCode::FORBIDDEN, "token mismatch").into_response();
    }
    let Some(link) = state.host(&host_id) else {
        return (StatusCode::SERVICE_UNAVAILABLE, "host offline").into_response();
    };
    let conn_id = state.next_conn_id();
    ws.on_upgrade(move |socket| client_session(link, conn_id, socket))
}

async fn host_session(state: Arc<RelayState>, host_id: String, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let (link, previous) = state.attach_host(&host_id, tx);
    if let Some(previous) = previous {
        log::info!("relay replacing stale host link for {host_id}");
        for client in previous.drain_conns() {
            drop(client);
        }
    }
    log::info!("relay host {host_id} online (epoch {})", link.epoch);

    let writer = tokio::spawn(async move {
        while let Some(text) = rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    while let Some(Ok(message)) = stream.next().await {
        let raw = match message {
            Message::Text(text) => text.as_bytes().to_vec(),
            Message::Binary(bytes) => bytes.to_vec(),
            Message::Ping(_) | Message::Pong(_) => continue,
            Message::Close(_) => break,
        };
        match RelayFrame::parse(&raw) {
            Ok(frame) => handle_host_frame(&link, frame),
            Err(error) => log::warn!("relay host {host_id}: {error}"),
        }
    }

    state.detach_host(&host_id, link.epoch);
    for client in link.drain_conns() {
        drop(client);
    }
    writer.abort();
    log::info!("relay host {host_id} offline (epoch {})", link.epoch);
}

fn handle_host_frame(link: &Arc<HostLink>, frame: RelayFrame) {
    match frame.op.as_str() {
        OP_DATA => {
            let Some(client) = link.conn(&frame.conn_id) else {
                link.send(&RelayFrame::close(&frame.conn_id));
                return;
            };
            match frame.payload() {
                Ok(payload) => {
                    if client.send(payload).is_err() {
                        link.remove_conn(&frame.conn_id);
                        link.send(&RelayFrame::close(&frame.conn_id));
                    }
                }
                Err(error) => log::warn!("relay host {}: {error}", link.host_id),
            }
        }
        OP_CLOSE => {
            drop(link.remove_conn(&frame.conn_id));
        }
        OP_OPEN => log::warn!("relay host {} sent an unexpected open frame", link.host_id),
        other => log::warn!("relay host {} sent unknown op {other}", link.host_id),
    }
}

async fn client_session(link: Arc<HostLink>, conn_id: String, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    link.add_conn(&conn_id, tx);
    if !link.send(&RelayFrame::open(&conn_id)) {
        link.remove_conn(&conn_id);
        return;
    }
    log::info!("relay client {conn_id} attached to {}", link.host_id);

    let writer = tokio::spawn(async move {
        while let Some(payload) = rx.recv().await {
            if sink.send(Message::Binary(payload.into())).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    while let Some(Ok(message)) = stream.next().await {
        let payload = match message {
            Message::Binary(bytes) => bytes.to_vec(),
            Message::Text(text) => text.as_bytes().to_vec(),
            Message::Ping(_) | Message::Pong(_) => continue,
            Message::Close(_) => break,
        };
        if !link.send(&RelayFrame::data(&conn_id, &payload)) {
            break;
        }
    }

    drop(link.remove_conn(&conn_id));
    link.send(&RelayFrame::close(&conn_id));
    let _ = writer.await;
    log::info!("relay client {conn_id} detached from {}", link.host_id);
}
