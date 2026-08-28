fn ensure_option_paths_allowed(
    ctx: &crate::server::state::DispatchCtx,
    options: Option<&crate::agent_transport::AgentTransportOptions>,
) -> Result<(), String> {
    let Some(options) = options else {
        return Ok(());
    };
    let allowed = ctx.state.allowed_roots();
    for path in options.path_arguments() {
        crate::server::config::check_path(&allowed, path)?;
    }
    Ok(())
}

pub async fn dispatch(
    cmd: &str,
    args: serde_json::Value,
    ctx: &crate::server::state::DispatchCtx,
) -> Option<Result<serde_json::Value, String>> {
    crate::dispatch_table! { cmd, args, ctx;

        "agent_addon_config_read" (path: String, provider: String) => {
            crate::agent_addons::agent_addon_config_read(path, provider).await
        }

        "agent_addon_config_write" (path: String, provider: String, contents: String) => {
            crate::agent_addons::agent_addon_config_write(path, provider, contents).await
        }

        "agent_transport_open" (
            provider: String,
            session_id: String,
            options: Option<crate::agent_transport::AgentTransportOptions>,
            on_event: chan crate::agent_transport::AgentStreamEvent
        ) => {
            match ensure_option_paths_allowed(ctx, options.as_ref()) {
                Err(error) => Err(error),
                Ok(()) => {
                    crate::agent_transport::agent_transport_open_inner(
                        &ctx.state.agents,
                        provider,
                        session_id,
                        options,
                        on_event,
                    )
                    .await
                }
            }
        }

        "agent_transport_send" (id: u32, session_id: String, message: serde_json::Value) => {
            crate::agent_transport::agent_transport_send_inner(
                &ctx.state.agents,
                id,
                session_id,
                message,
            )
        }

        "agent_transport_close" (id: u32, session_id: String) => {
            crate::agent_transport::agent_transport_close_inner(&ctx.state.agents, id, session_id)
        }

        "agent_transport_close_all" () => {
            crate::agent_transport::agent_transport_close_all_inner(&ctx.state.agents)
        }

        "opencode_cli" (args: Vec<String>, cwd: Option<String>) => {
            crate::agent_transport::opencode_cli(args, cwd).await
        }

        "opencode_delete_session" (path: String, session_id: String) => {
            crate::agent_transport::opencode_delete_session(path, session_id).await
        }

        "claude_list_sessions" (paths: Vec<String>) => {
            crate::claude::claude_list_sessions(paths).await
        }

        "claude_read_session" (path: String, session_id: String) => {
            crate::claude::claude_read_session(path, session_id).await
        }

        "claude_rename_session" (path: String, session_id: String, title: String) => {
            crate::claude::claude_rename_session(path, session_id, title).await
        }

        "claude_delete_session" (path: String, session_id: String) => {
            crate::claude::claude_delete_session(path, session_id).await
        }

        "claude_auth_status" () => {
            crate::claude::claude_auth_status().await
        }

        "claude_start_login" () => {
            crate::claude::claude_start_login().await
        }

        "claude_logout" () => {
            crate::claude::claude_logout().await
        }

        "claude_list_plugins" (path: String) => {
            crate::claude::claude_list_plugins(path).await
        }

        "claude_list_skills" (path: String) => {
            crate::claude::claude_list_skills(path).await
        }

        "claude_list_hooks" (path: String) => {
            crate::claude::claude_list_hooks(path).await
        }

        "claude_list_capability_files" (path: String, kind: String) => {
            crate::claude::claude_list_capability_files(path, kind).await
        }

        "claude_read_capability_file" (path: String, file: String) => {
            crate::claude::claude_read_capability_file(path, file).await
        }

        "claude_write_capability_file" (path: String, file: String, contents: String) => {
            crate::claude::claude_write_capability_file(path, file, contents).await
        }

        "claude_delete_capability_file" (path: String, file: String) => {
            crate::claude::claude_delete_capability_file(path, file).await
        }

        "claude_set_hook_disabled" (
            path: String,
            source: String,
            key: String,
            disabled: bool
        ) => {
            crate::claude::claude_set_hook_disabled(path, source, key, disabled).await
        }

        "claude_set_plugin_enabled" (path: String, plugin: String, enabled: bool) => {
            crate::claude::claude_set_plugin_enabled(path, plugin, enabled).await
        }

        "claude_uninstall_plugin" (path: String, plugin: String) => {
            crate::claude::claude_uninstall_plugin(path, plugin).await
        }

        "claude_mcp_remove" (path: String, name: String) => {
            crate::claude::claude_mcp_remove(path, name).await
        }

        "claude_mcp_login" (path: String, name: String) => {
            crate::claude::claude_mcp_login(path, name).await
        }

        "cursor_list_sessions" (paths: Vec<String>) => {
            crate::cursor::cursor_list_sessions(paths).await
        }

        "cursor_delete_session" (session_id: String) => {
            crate::cursor::cursor_delete_session(session_id).await
        }

        "cursor_rename_session" (session_id: String, title: String) => {
            crate::cursor::cursor_rename_session(session_id, title).await
        }

        "cursor_list_hooks" (path: String) => {
            crate::cursor::cursor_list_hooks(path).await
        }

        "cursor_cli" (args: Vec<String>, cwd: Option<String>) => {
            crate::cursor::cursor_cli(args, cwd).await
        }

        "agent_review_summary" (worktree_path: String, base_path: String) => {
            crate::agent_review::agent_review_summary(worktree_path, base_path).await
        }

        "agent_review_file_diff" (worktree_path: String, merge_base: String, file: String) => {
            crate::agent_review::agent_review_file_diff(worktree_path, merge_base, file).await
        }

        "agent_review_branch_merged" (path: String, branch: String) => {
            crate::agent_review::agent_review_branch_merged(path, branch).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState, OUTBOX_CAPACITY};
    use serde_json::json;
    use std::sync::Arc;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn agent_options_pointing_outside_the_allowlist_never_reach_the_cli() {
        let state = ServerState::new("host".into(), [5u8; 32], vec![std::env::temp_dir()], None);
        let (tx, _rx) = mpsc::channel(OUTBOX_CAPACITY);
        let ctx = DispatchCtx::new(
            state,
            Arc::new(ConnectionHandle::new(1, tx)),
            1,
            "agent_transport_open",
        );
        let result = dispatch(
            "agent_transport_open",
            json!({
                "provider": "cursor",
                "sessionId": "s1",
                "options": { "addDirs": ["/etc"], "prompt": "hallo", "agentsTrusted": true },
                "onEvent": { "__channel__": true }
            }),
            &ctx,
        )
        .await
        .expect("the command is dispatched");
        assert!(result.unwrap_err().contains("nicht freigegeben"));
    }
}
