pub async fn dispatch(
    cmd: &str,
    args: serde_json::Value,
    ctx: &crate::server::state::DispatchCtx,
) -> Option<Result<serde_json::Value, String>> {
    crate::dispatch_table! { cmd, args, ctx;

        "stack_list" (path: String) => {
            crate::stack::stack_list(path).await
        }

        "stack_create_branch" (path: String, name: String, parent: String) => {
            crate::stack::stack_create_branch(path, name, parent).await
        }

        "stack_adopt" (path: String, name: String, parent: String) => {
            crate::stack::stack_adopt(path, name, parent).await
        }

        "stack_remove" (path: String, name: String) => {
            crate::stack::stack_remove(path, name).await
        }

        "stack_next_branch_name" (path: String, base: String) => {
            crate::stack::stack_next_branch_name(path, base).await
        }

        "stack_restack_state" (path: String) => {
            crate::stack::stack_restack_state(path).await
        }

        "stack_restack" (path: String, branch: String) => {
            crate::stack::stack_restack(path, branch).await
        }

        "stack_restack_resume" (path: String) => {
            crate::stack::stack_restack_resume(path).await
        }

        "branch_cleanup_candidates" (path: String, stale_days: u32) => {
            crate::stack::branch_cleanup_candidates(path, stale_days).await
        }

        "rebase_status" (path: String) => {
            crate::rebase::rebase_status(path).await
        }

        "rebase_start" (
            path: String,
            upstream: String,
            onto: Option<String>,
            autostash: bool
        ) => {
            crate::rebase::rebase_start(path, upstream, onto, autostash).await
        }

        "rebase_continue" (path: String) => {
            crate::rebase::rebase_continue(path).await
        }

        "rebase_skip" (path: String) => {
            crate::rebase::rebase_skip(path).await
        }

        "rebase_abort" (path: String) => {
            crate::rebase::rebase_abort(path).await
        }

        "rebase_todo_preview" (path: String, base: String) => {
            crate::rebase::rebase_todo_preview(path, base).await
        }

        "rebase_interactive" (
            path: String,
            base: String,
            todo: Vec<crate::rebase::TodoItem>,
            autostash: bool
        ) => {
            crate::rebase::rebase_interactive(path, base, todo, autostash).await
        }

        "commit_fixup" (path: String, target_hash: String, autosquash: bool) => {
            crate::rebase::commit_fixup(path, target_hash, autosquash).await
        }

        "reflog_list" (path: String, limit: u32, skip: u32) => {
            crate::undo::reflog_list(path, limit, skip).await
        }

        "undo_preview" (path: String) => {
            crate::undo::undo_preview(path).await
        }

        "undo_last_operation" (path: String) => {
            crate::undo::undo_last_operation(path).await
        }

        "reset_to_reflog_entry" (path: String, selector: String, mode: String) => {
            crate::undo::reset_to_reflog_entry(path, selector, mode).await
        }

        "branch_restore" (path: String, name: String, hash: String) => {
            crate::undo::branch_restore(path, name, hash).await
        }

        "commit_full_message" (path: String, hash: String) => {
            crate::undo::commit_full_message(path, hash).await
        }

        "lfs_available" (path: String) => {
            crate::lfs::lfs_available(path).await
        }

        "lfs_tracked_patterns" (path: String) => {
            crate::lfs::lfs_tracked_patterns(path).await
        }

        "lfs_track" (path: String, pattern: String) => {
            crate::lfs::lfs_track(path, pattern).await
        }

        "lfs_untrack" (path: String, pattern: String) => {
            crate::lfs::lfs_untrack(path, pattern).await
        }

        "lfs_ls_files" (path: String, limit: Option<u32>) => {
            crate::lfs::lfs_ls_files(path, limit).await
        }

        "lfs_pull" (path: String) => {
            crate::lfs::lfs_pull(path).await
        }

        "lfs_pointer_info" (path: String, file_path: String, treeish: Option<String>) => {
            crate::lfs::lfs_pointer_info(path, file_path, treeish).await
        }

        "git_sign_in" (host: String, username: String, token: String) => {
            crate::credentials::git_sign_in(host, username, token).await
        }

        "git_sign_in_via_credential_manager" (host: String) => {
            crate::credentials::git_sign_in_via_credential_manager(host).await
        }

        "git_sign_out" (host: String, username: Option<String>) => {
            crate::credentials::git_sign_out(host, username).await
        }

        "git_credential_helper" () => {
            Ok::<Option<String>, String>(crate::credentials::git_credential_helper().await)
        }

        "secret_set" (key: String, value: String) => {
            crate::secrets::secret_set(key, value).await
        }

        "secret_get" (key: String) => {
            crate::secrets::secret_get(key).await
        }

        "secret_delete" (key: String) => {
            crate::secrets::secret_delete(key).await
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState};
    use serde_json::json;
    use std::sync::Arc;

    const REGISTERED: &[(&str, &str)] = &[
        ("stack_list", "path"),
        ("stack_create_branch", "path"),
        ("stack_adopt", "path"),
        ("stack_remove", "path"),
        ("stack_next_branch_name", "path"),
        ("stack_restack_state", "path"),
        ("stack_restack", "path"),
        ("stack_restack_resume", "path"),
        ("branch_cleanup_candidates", "path"),
        ("rebase_status", "path"),
        ("rebase_start", "path"),
        ("rebase_continue", "path"),
        ("rebase_skip", "path"),
        ("rebase_abort", "path"),
        ("rebase_todo_preview", "path"),
        ("rebase_interactive", "path"),
        ("commit_fixup", "path"),
        ("reflog_list", "path"),
        ("undo_preview", "path"),
        ("undo_last_operation", "path"),
        ("reset_to_reflog_entry", "path"),
        ("branch_restore", "path"),
        ("commit_full_message", "path"),
        ("lfs_available", "path"),
        ("lfs_tracked_patterns", "path"),
        ("lfs_track", "path"),
        ("lfs_untrack", "path"),
        ("lfs_ls_files", "path"),
        ("lfs_pull", "path"),
        ("lfs_pointer_info", "path"),
        ("git_sign_in", "host"),
        ("git_sign_in_via_credential_manager", "host"),
        ("git_sign_out", "host"),
        ("secret_set", "key"),
        ("secret_get", "key"),
        ("secret_delete", "key"),
    ];

    fn ctx() -> DispatchCtx {
        let state = ServerState::new("host".into(), [3u8; 32], vec![], None);
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        DispatchCtx::new(state, Arc::new(ConnectionHandle::new(1, tx)), 1, "test")
    }

    #[tokio::test]
    async fn every_command_is_claimed_and_validates_its_arguments() {
        let ctx = ctx();
        for (cmd, missing) in REGISTERED {
            let out = super::dispatch(cmd, json!({}), &ctx).await;
            let result = out.unwrap_or_else(|| panic!("{cmd} nicht registriert"));
            assert_eq!(
                result,
                Err(format!("Fehlendes Argument \"{missing}\".")),
                "{cmd}"
            );
        }
    }

    #[tokio::test]
    async fn camel_case_argument_names_reach_the_inner_functions() {
        let ctx = ctx();
        let out = super::dispatch(
            "commit_fixup",
            json!({ "autosquash": true, "targetHash": "abc" }),
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(out, Err("Fehlendes Argument \"path\".".to_string()));

        let out = super::dispatch(
            "branch_cleanup_candidates",
            json!({ "staleDays": 30 }),
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(out, Err("Fehlendes Argument \"path\".".to_string()));

        let out = super::dispatch("lfs_pointer_info", json!({ "filePath": "a.bin" }), &ctx)
            .await
            .unwrap();
        assert_eq!(out, Err("Fehlendes Argument \"path\".".to_string()));
    }

    #[tokio::test]
    async fn argumentless_command_is_claimed() {
        let ctx = ctx();
        let out = super::dispatch("git_credential_helper", json!({}), &ctx).await;
        assert!(out.unwrap().is_ok());
    }

    #[tokio::test]
    async fn unrelated_commands_are_not_claimed() {
        let ctx = ctx();
        assert!(super::dispatch("repo_status", json!({}), &ctx).await.is_none());
    }
}
