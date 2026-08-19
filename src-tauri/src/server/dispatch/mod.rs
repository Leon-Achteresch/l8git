pub mod agents;
pub mod coverage;
pub mod git;
pub mod gitops;
pub mod pr;
pub mod system;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::ipc::{Channel, InvokeResponseBody};

use crate::server::state::DispatchCtx;

pub const CHANNEL_SENTINEL: &str = "__channel__";
pub const RAW_PAYLOAD_KEY: &str = "__raw__";

#[cfg(test)]
pub const TEST_SLEEP_COMMAND: &str = "__test_sleep";

pub async fn dispatch(cmd: &str, args: Value, ctx: &DispatchCtx) -> Result<Value, String> {
    #[cfg(test)]
    if cmd == TEST_SLEEP_COMMAND {
        let millis = args.get("millis").and_then(Value::as_u64).unwrap_or_default();
        std::thread::sleep(std::time::Duration::from_millis(millis));
        return Ok(json!("slept"));
    }
    if let Some(result) = git::dispatch(cmd, args.clone(), ctx).await {
        return result;
    }
    if let Some(result) = gitops::dispatch(cmd, args.clone(), ctx).await {
        return result;
    }
    if let Some(result) = pr::dispatch(cmd, args.clone(), ctx).await {
        return result;
    }
    if let Some(result) = agents::dispatch(cmd, args.clone(), ctx).await {
        return result;
    }
    if let Some(result) = system::dispatch(cmd, args, ctx).await {
        return result;
    }
    Err(format!("Unbekannter Befehl: {cmd}"))
}

pub fn camel_case(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut upper_next = false;
    for ch in name.chars() {
        if ch == '_' {
            upper_next = !out.is_empty();
            continue;
        }
        if upper_next {
            out.extend(ch.to_uppercase());
            upper_next = false;
        } else {
            out.push(ch);
        }
    }
    out
}

pub fn arg<T: DeserializeOwned>(args: &Value, name: &str) -> Result<T, String> {
    let camel = camel_case(name);
    let found = args
        .get(camel.as_str())
        .or_else(|| args.get(name))
        .cloned();
    match found {
        Some(value) => serde_json::from_value(value)
            .map_err(|e| format!("Ungültiges Argument \"{camel}\": {e}")),
        None => serde_json::from_value(Value::Null)
            .map_err(|_| format!("Fehlendes Argument \"{camel}\".")),
    }
}

pub fn body_to_value(body: InvokeResponseBody) -> Value {
    match body {
        InvokeResponseBody::Json(raw) => {
            serde_json::from_str(&raw).unwrap_or(Value::String(raw))
        }
        InvokeResponseBody::Raw(bytes) => json!({ RAW_PAYLOAD_KEY: B64.encode(bytes) }),
    }
}

pub fn channel_arg<T>(args: &Value, ctx: &DispatchCtx, name: &str) -> Result<Channel<T>, String> {
    let camel = camel_case(name);
    match args.get(camel.as_str()).or_else(|| args.get(name)) {
        None | Some(Value::Null) => {}
        Some(Value::Object(map)) if map.get(CHANNEL_SENTINEL) == Some(&Value::Bool(true)) => {}
        Some(_) => {
            return Err(format!(
                "Argument \"{camel}\" muss der Channel-Platzhalter {{\"{CHANNEL_SENTINEL}\":true}} sein."
            ))
        }
    }
    let conn = ctx.conn.clone();
    let req_id = ctx.req_id;
    let arg_name = camel;
    Ok(Channel::new(move |body| {
        if conn.send_chan(req_id, &arg_name, body_to_value(body)) {
            return Ok(());
        }
        Err(tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "Verbindung geschlossen",
        )))
    }))
}

pub fn to_json<T: Serialize>(result: Result<T, String>) -> Result<Value, String> {
    result.and_then(|value| serde_json::to_value(value).map_err(|e| e.to_string()))
}

#[macro_export]
macro_rules! dispatch_table {
    (
        $cmd:expr, $args:expr, $ctx:expr;
        $( $name:literal ( $($spec:tt)* ) => $body:block )*
    ) => {{
        let __dispatch_args = $args;
        let __dispatch_ctx = $ctx;
        match $cmd {
            $(
                $name => $crate::__dispatch_bind!(__dispatch_args, __dispatch_ctx, { $($spec)* } -> {
                    Some($crate::server::dispatch::to_json($body))
                }),
            )*
            _ => None,
        }
    }};
}

#[macro_export]
macro_rules! __dispatch_bind {
    ($args:expr, $ctx:expr, { } -> $body:tt) => {
        $body
    };
    ($args:expr, $ctx:expr, { $name:ident : chan $ty:ty $(, $($rest:tt)*)? } -> $body:tt) => {{
        let $name = match $crate::server::dispatch::channel_arg::<$ty>(
            &$args,
            $ctx,
            stringify!($name),
        ) {
            Ok(value) => value,
            Err(error) => return Some(Err(error)),
        };
        $crate::__dispatch_bind!($args, $ctx, { $($($rest)*)? } -> $body)
    }};
    ($args:expr, $ctx:expr, { $name:ident : $ty:ty $(, $($rest:tt)*)? } -> $body:tt) => {{
        let $name: $ty = match $crate::server::dispatch::arg::<$ty>(&$args, stringify!($name)) {
            Ok(value) => value,
            Err(error) => return Some(Err(error)),
        };
        $crate::__dispatch_bind!($args, $ctx, { $($($rest)*)? } -> $body)
    }};
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState};
    use std::sync::Arc;
    use tokio::sync::mpsc;

    fn ctx() -> (DispatchCtx, mpsc::Receiver<Value>) {
        let state = ServerState::new("host".into(), [7u8; 32], vec![], None);
        let (tx, rx) = mpsc::channel(crate::server::state::OUTBOX_CAPACITY);
        let conn = Arc::new(ConnectionHandle::new(1, tx));
        (DispatchCtx::new(state, conn, 42, "demo"), rx)
    }

    async fn demo(cmd: &str, args: Value, ctx: &DispatchCtx) -> Option<Result<Value, String>> {
        crate::dispatch_table! {
            cmd, args, ctx;

            "echo_command" (repo_path: String, limit: Option<u32>) => {
                Ok::<_, String>(json!({ "repoPath": repo_path, "limit": limit }))
            }

            "streaming_command" (repo_path: String, on_event: chan Value) => {
                let _ = on_event.send(json!({ "phase": "start", "repo": repo_path }));
                Ok::<_, String>(json!("done"))
            }

            "reporting_command" (on_event: chan Value) => {
                Ok::<_, String>(json!(on_event.send(json!("tick")).is_ok()))
            }

            "state_command" () => {
                Ok::<_, String>(json!({
                    "hostId": ctx.state.host_id,
                    "cmd": ctx.cmd,
                    "connection": ctx.conn.id,
                    "watched": ctx.state.watched(),
                }))
            }

            "failing_command" () => {
                Err::<Value, String>("__REMOTE_CANCELED__".into())
            }
        }
    }

    #[test]
    fn camel_case_matches_tauri_argument_conversion() {
        assert_eq!(camel_case("repo_path"), "repoPath");
        assert_eq!(camel_case("on_data"), "onData");
        assert_eq!(camel_case("id"), "id");
        assert_eq!(camel_case("resume_session_id"), "resumeSessionId");
        assert_eq!(camel_case("_leading"), "leading");
        assert_eq!(camel_case("type_"), "type");
        assert_eq!(camel_case("repo__path"), "repoPath");
    }

    #[tokio::test]
    async fn deserializes_camel_case_and_optional_arguments() {
        let (ctx, _rx) = ctx();
        let out = demo("echo_command", json!({ "repoPath": "/tmp/x" }), &ctx)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(out, json!({ "repoPath": "/tmp/x", "limit": null }));

        let out = demo(
            "echo_command",
            json!({ "repo_path": "/tmp/y", "limit": 3 }),
            &ctx,
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(out, json!({ "repoPath": "/tmp/y", "limit": 3 }));

        let err = demo("echo_command", json!({}), &ctx).await.unwrap();
        assert_eq!(err, Err("Fehlendes Argument \"repoPath\".".to_string()));
    }

    #[tokio::test]
    async fn channel_sentinel_becomes_a_chan_frame_sender() {
        let (ctx, mut rx) = ctx();
        let out = demo(
            "streaming_command",
            json!({ "repoPath": "/tmp/x", "onEvent": { "__channel__": true } }),
            &ctx,
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(out, json!("done"));
        let frame = rx.try_recv().unwrap();
        assert_eq!(
            frame,
            json!({
                "type": "chan",
                "id": 42,
                "arg": "onEvent",
                "payload": { "phase": "start", "repo": "/tmp/x" }
            })
        );
    }

    #[tokio::test]
    async fn a_channel_reports_failure_once_the_connection_is_gone() {
        let (ctx, rx) = ctx();
        let args = json!({ "onEvent": { "__channel__": true } });
        assert_eq!(
            demo("reporting_command", args.clone(), &ctx).await.unwrap(),
            Ok(json!(true))
        );
        drop(rx);
        assert_eq!(
            demo("reporting_command", args, &ctx).await.unwrap(),
            Ok(json!(false)),
            "producers rely on the send error to shut themselves down"
        );
    }

    #[tokio::test]
    async fn rejects_a_bogus_channel_argument() {
        let (ctx, _rx) = ctx();
        let out = demo(
            "streaming_command",
            json!({ "repoPath": "/tmp/x", "onEvent": 5 }),
            &ctx,
        )
        .await
        .unwrap();
        assert!(out.unwrap_err().contains("__channel__"));
    }

    #[tokio::test]
    async fn preserves_error_strings_and_reports_unknown_commands() {
        let (ctx, _rx) = ctx();
        assert_eq!(
            demo("failing_command", json!({}), &ctx).await.unwrap(),
            Err("__REMOTE_CANCELED__".to_string())
        );
        assert!(demo("nope", json!({}), &ctx).await.is_none());
        assert!(dispatch("nope", json!({}), &ctx)
            .await
            .unwrap_err()
            .contains("Unbekannter Befehl"));
    }

    #[tokio::test]
    async fn arm_bodies_can_reach_the_dispatch_context() {
        let (ctx, _rx) = ctx();
        let out = demo("state_command", json!({}), &ctx).await.unwrap().unwrap();
        assert_eq!(
            out,
            json!({ "hostId": "host", "cmd": "demo", "connection": 1, "watched": [] })
        );
    }

    #[test]
    fn raw_channel_payloads_are_base64_wrapped() {
        let value = body_to_value(InvokeResponseBody::Raw(vec![1, 2, 3]));
        assert_eq!(value, json!({ "__raw__": "AQID" }));
        let value = body_to_value(InvokeResponseBody::Json("{\"a\":1}".into()));
        assert_eq!(value, json!({ "a": 1 }));
    }
}
