pub async fn dispatch(
    cmd: &str,
    args: serde_json::Value,
    ctx: &crate::server::state::DispatchCtx,
) -> Option<Result<serde_json::Value, String>> {
    crate::dispatch_table! { cmd, args, ctx;

        "pty_open" (
            cols: u16,
            rows: u16,
            cwd: Option<String>,
            shell: Option<String>,
            dark: Option<bool>,
            on_data: chan tauri::ipc::Response,
            on_exit: chan i32
        ) => {
            crate::pty::pty_open_inner(
                &ctx.state.pty,
                cols,
                rows,
                cwd,
                shell,
                dark,
                on_data,
                on_exit,
            )
            .await
        }

        "pty_write" (id: u32, data: String) => {
            crate::pty::pty_write_inner(&ctx.state.pty, id, data)
        }

        "pty_resize" (id: u32, cols: u16, rows: u16) => {
            crate::pty::pty_resize_inner(&ctx.state.pty, id, cols, rows)
        }

        "pty_close" (id: u32) => {
            crate::pty::pty_close_inner(&ctx.state.pty, id)
        }

        "pty_close_all" () => {
            crate::pty::pty_close_all_inner(&ctx.state.pty)
        }

        "pty_has_foreground_process" (id: u32) => {
            crate::pty::pty_has_foreground_process_inner(&ctx.state.pty, id)
        }

        "pty_shell_name" () => {
            Ok::<_, String>(crate::pty::pty_shell_name())
        }

        "reveal_repo_folder" (path: String) => {
            crate::shell::reveal_repo_folder(path).await
        }

        "open_repo_terminal" (path: String, use_git_bash: bool) => {
            crate::shell::open_repo_terminal(path, use_git_bash).await
        }

        "open_repo_in_ide" (path: String, ide_launch: String) => {
            crate::shell::open_repo_in_ide(path, ide_launch).await
        }

        "save_clipboard_image" (bytes: Vec<u8>, ext: String, name: Option<String>) => {
            crate::shell::save_clipboard_image(bytes, ext, name).await
        }

        "detect_clis" (commands: Vec<String>) => {
            Ok::<_, String>(crate::shell::detect_clis(commands).await)
        }

        "watch_repo" (path: String) => {
            ctx.state.watch(ctx.conn.id, path.trim())
        }

        "unwatch_repo" (path: String) => {
            ctx.state.unwatch(ctx.conn.id, path.trim())
        }

        "git_command_log" (limit: Option<usize>) => {
            Ok::<_, String>(crate::cmdlog::git_command_log(limit))
        }

        "git_command_log_clear" () => {
            crate::cmdlog::git_command_log_clear();
            Ok::<_, String>(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::dispatch;
    use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState};
    use serde_json::{json, Value};
    use std::sync::Arc;
    use tokio::sync::mpsc;

    fn ctx(cmd: &str) -> (DispatchCtx, mpsc::UnboundedReceiver<Value>) {
        let state = ServerState::new("host".into(), [3u8; 32], vec![], None);
        let (tx, rx) = mpsc::unbounded_channel();
        let conn = Arc::new(ConnectionHandle::new(1, tx));
        (DispatchCtx::new(state, conn, 9, cmd), rx)
    }

    #[tokio::test]
    async fn claims_every_registered_command() {
        for cmd in [
            "pty_open",
            "pty_write",
            "pty_resize",
            "pty_close",
            "pty_close_all",
            "pty_has_foreground_process",
            "pty_shell_name",
            "reveal_repo_folder",
            "open_repo_terminal",
            "open_repo_in_ide",
            "save_clipboard_image",
            "detect_clis",
            "watch_repo",
            "unwatch_repo",
            "git_command_log",
        ] {
            let (c, _rx) = ctx(cmd);
            assert!(
                dispatch(cmd, json!({}), &c).await.is_some(),
                "{cmd} not registered"
            );
        }
        let (c, _rx) = ctx("nope");
        assert!(dispatch("nope", json!({}), &c).await.is_none());
    }

    #[tokio::test]
    async fn reports_missing_arguments_with_camel_case_names() {
        let (c, _rx) = ctx("open_repo_terminal");
        assert_eq!(
            dispatch("open_repo_terminal", json!({ "path": "/tmp" }), &c).await,
            Some(Err("Fehlendes Argument \"useGitBash\".".to_string()))
        );
    }

    #[tokio::test]
    async fn routes_pty_commands_to_the_server_pty_state() {
        let (c, _rx) = ctx("pty_write");
        assert_eq!(
            dispatch("pty_write", json!({ "id": 1, "data": "x" }), &c).await,
            Some(Err("no session".to_string()))
        );

        let (c, _rx) = ctx("pty_close");
        assert_eq!(
            dispatch("pty_close", json!({ "id": 1 }), &c).await,
            Some(Ok(Value::Null))
        );

        let (c, _rx) = ctx("pty_close_all");
        assert_eq!(
            dispatch("pty_close_all", json!({}), &c).await,
            Some(Ok(json!(0)))
        );

        let (c, _rx) = ctx("pty_shell_name");
        let name = dispatch("pty_shell_name", json!({}), &c)
            .await
            .unwrap()
            .unwrap();
        assert!(name.is_string());
    }

    #[tokio::test]
    async fn watch_commands_go_through_the_server_registry() {
        let (c, _rx) = ctx("watch_repo");
        assert_eq!(
            dispatch("watch_repo", json!({ "path": "  " }), &c).await,
            Some(Err("Pfad darf nicht leer sein".to_string()))
        );

        let dir = std::env::temp_dir().join(format!("l8git-watch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.to_string_lossy().into_owned();
        let (c, _rx) = ctx("watch_repo");
        assert_eq!(
            dispatch("watch_repo", json!({ "path": path.clone() }), &c).await,
            Some(Ok(Value::Null))
        );
        assert_eq!(c.state.watched(), vec![path.clone()]);
        assert_eq!(
            dispatch("unwatch_repo", json!({ "path": path.clone() }), &c).await,
            Some(Ok(Value::Null))
        );
        assert!(c.state.watched().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn command_log_round_trips_through_the_dispatcher() {
        let (c, _rx) = ctx("git_command_log");
        let out = dispatch("git_command_log", json!({ "limit": 5 }), &c)
            .await
            .unwrap()
            .unwrap();
        assert!(out.is_array());
    }

    #[tokio::test]
    async fn detect_clis_returns_only_resolvable_binaries() {
        let (c, _rx) = ctx("detect_clis");
        let out = dispatch(
            "detect_clis",
            json!({ "commands": ["l8git-does-not-exist-xyz", "  "] }),
            &c,
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(out, json!([]));
    }

    #[tokio::test]
    async fn rejects_a_pty_open_channel_argument_that_is_not_the_sentinel() {
        let (c, _rx) = ctx("pty_open");
        let out = dispatch(
            "pty_open",
            json!({ "cols": 80, "rows": 24, "onData": 5, "onExit": { "__channel__": true } }),
            &c,
        )
        .await
        .unwrap();
        assert!(out.unwrap_err().contains("onData"));
    }
}
