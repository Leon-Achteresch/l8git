use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use l8git_relay::{router, RelayFrame, RelayState, TOKEN_HEADER};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

const TOKEN: &str = "tOkEn-abc";

async fn start_relay() -> (String, Arc<RelayState>) {
    let state = RelayState::new();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("ws://{}", listener.local_addr().unwrap());
    let app = router(state.clone());
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    (base, state)
}

async fn connect(url: &str, token: &str) -> Result<Socket, String> {
    let mut request = url.into_client_request().unwrap();
    request
        .headers_mut()
        .insert(TOKEN_HEADER, HeaderValue::from_str(token).unwrap());
    tokio_tungstenite::connect_async(request)
        .await
        .map(|(socket, _)| socket)
        .map_err(|e| e.to_string())
}

async fn next_host_frame(host: &mut Socket) -> RelayFrame {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), host.next())
            .await
            .expect("host frame arrives in time")
            .expect("host socket is open")
            .expect("host frame is readable");
        match message {
            Message::Text(text) => return RelayFrame::parse(text.as_bytes()).unwrap(),
            Message::Ping(_) | Message::Pong(_) => continue,
            other => panic!("unexpected host message {other:?}"),
        }
    }
}

async fn next_client_bytes(client: &mut Socket) -> Vec<u8> {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), client.next())
            .await
            .expect("client frame arrives in time")
            .expect("client socket is open")
            .expect("client frame is readable");
        match message {
            Message::Binary(bytes) => return bytes.to_vec(),
            Message::Ping(_) | Message::Pong(_) => continue,
            other => panic!("unexpected client message {other:?}"),
        }
    }
}

async fn await_host_online(state: &Arc<RelayState>) {
    for _ in 0..500 {
        if state.host_count() > 0 {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("host never registered");
}

#[tokio::test]
async fn host_and_client_exchange_bytes_in_both_directions_through_the_relay() {
    let (base, state) = start_relay().await;
    let mut host = connect(&format!("{base}/host/h1"), TOKEN).await.unwrap();
    await_host_online(&state).await;

    let mut client = connect(&format!("{base}/client/h1"), TOKEN).await.unwrap();

    let open = next_host_frame(&mut host).await;
    assert_eq!(open.op, "open");
    let conn_id = open.conn_id.clone();

    client
        .send(Message::Binary(b"hello host".to_vec().into()))
        .await
        .unwrap();
    let up = next_host_frame(&mut host).await;
    assert_eq!(up.op, "data");
    assert_eq!(up.conn_id, conn_id);
    assert_eq!(up.payload().unwrap(), b"hello host");

    host.send(Message::Text(
        RelayFrame::data(&conn_id, b"hello client").encode().into(),
    ))
    .await
    .unwrap();
    assert_eq!(next_client_bytes(&mut client).await, b"hello client");

    for i in 0u8..16 {
        let payload = vec![i; 64];
        client
            .send(Message::Binary(payload.clone().into()))
            .await
            .unwrap();
        let frame = next_host_frame(&mut host).await;
        assert_eq!(frame.payload().unwrap(), payload);
        host.send(Message::Text(
            RelayFrame::data(&conn_id, &payload).encode().into(),
        ))
        .await
        .unwrap();
        assert_eq!(next_client_bytes(&mut client).await, payload);
    }

    client.close(None).await.unwrap();
    let close = next_host_frame(&mut host).await;
    assert_eq!(close.op, "close");
    assert_eq!(close.conn_id, conn_id);
}

#[tokio::test]
async fn two_clients_are_multiplexed_over_one_host_socket() {
    let (base, state) = start_relay().await;
    let mut host = connect(&format!("{base}/host/h2"), TOKEN).await.unwrap();
    await_host_online(&state).await;

    let mut first = connect(&format!("{base}/client/h2"), TOKEN).await.unwrap();
    let first_id = next_host_frame(&mut host).await.conn_id;
    let mut second = connect(&format!("{base}/client/h2"), TOKEN).await.unwrap();
    let second_id = next_host_frame(&mut host).await.conn_id;
    assert_ne!(first_id, second_id);

    host.send(Message::Text(
        RelayFrame::data(&second_id, b"for-second").encode().into(),
    ))
    .await
    .unwrap();
    assert_eq!(next_client_bytes(&mut second).await, b"for-second");

    first.send(Message::Binary(b"from-first".to_vec().into())).await.unwrap();
    let frame = next_host_frame(&mut host).await;
    assert_eq!(frame.conn_id, first_id);
    assert_eq!(frame.payload().unwrap(), b"from-first");

    host.send(Message::Text(RelayFrame::close(&first_id).encode().into()))
        .await
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_secs(5), first.next())
            .await
            .expect("first client is closed by the relay")
            .map(|message| matches!(message, Ok(Message::Close(_))))
            .unwrap_or(true)
    );

    host.send(Message::Text(
        RelayFrame::data(&second_id, b"still-alive").encode().into(),
    ))
    .await
    .unwrap();
    assert_eq!(next_client_bytes(&mut second).await, b"still-alive");
}

#[tokio::test]
async fn a_host_going_away_closes_its_client_connections() {
    let (base, state) = start_relay().await;
    let mut host = connect(&format!("{base}/host/h3"), TOKEN).await.unwrap();
    await_host_online(&state).await;
    let mut client = connect(&format!("{base}/client/h3"), TOKEN).await.unwrap();
    let _ = next_host_frame(&mut host).await;

    host.close(None).await.unwrap();
    let closed = tokio::time::timeout(Duration::from_secs(5), client.next())
        .await
        .expect("client notices the host disconnect");
    assert!(closed
        .map(|message| matches!(message, Ok(Message::Close(_))))
        .unwrap_or(true));
    assert!(connect(&format!("{base}/client/h3"), TOKEN).await.is_err());
}

#[tokio::test]
async fn tokens_are_trusted_on_first_use_and_enforced_afterwards() {
    let (base, state) = start_relay().await;
    let mut host = connect(&format!("{base}/host/h4"), TOKEN).await.unwrap();
    await_host_online(&state).await;

    assert!(connect(&format!("{base}/host/h4"), "other").await.is_err());
    assert!(connect(&format!("{base}/client/h4"), "other").await.is_err());
    assert!(connect(&format!("{base}/client/unknown"), TOKEN).await.is_err());
    assert!(tokio_tungstenite::connect_async(format!("{base}/host/h5"))
        .await
        .is_err());

    let mut client = connect(&format!("{base}/client/h4"), TOKEN).await.unwrap();
    assert_eq!(next_host_frame(&mut host).await.op, "open");
    client
        .send(Message::Binary(b"still works".to_vec().into()))
        .await
        .unwrap();
    assert_eq!(
        next_host_frame(&mut host).await.payload().unwrap(),
        b"still works"
    );
}
