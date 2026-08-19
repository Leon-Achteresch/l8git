pub async fn dispatch(
    cmd: &str,
    args: serde_json::Value,
    ctx: &crate::server::state::DispatchCtx,
) -> Option<Result<serde_json::Value, String>> {
    crate::dispatch_table! { cmd, args, ctx;

        "pr_create_web_url" (path: String, branch: String) => {
            crate::pr::pr_create_web_url(path, branch)
        }

        "pr_create" (
            path: String,
            title: String,
            body: String,
            head: String,
            base: String,
            draft: bool
        ) => {
            crate::pr::pr_create(path, title, body, head, base, draft).await
        }

        "resolve_repo_commit_avatars" (path: String, hashes: Vec<String>) => {
            crate::pr::resolve_repo_commit_avatars(path, hashes).await
        }

        "pr_default_branch" (path: String) => {
            crate::pr::pr_default_branch(path).await
        }

        "pr_list" (path: String) => {
            crate::pr::pr_list(path).await
        }

        "pr_detail" (path: String, number: u64) => {
            crate::pr::pr_detail(path, number).await
        }

        "pr_commits" (path: String, number: u64) => {
            crate::pr::pr_commits(path, number).await
        }

        "pr_files" (path: String, number: u64) => {
            crate::pr::pr_files(path, number).await
        }

        "pr_file_patch" (path: String, number: u64, file: String) => {
            crate::pr::pr_file_patch(path, number, file).await
        }

        "pr_conversation" (path: String, number: u64) => {
            crate::pr::pr_conversation(path, number).await
        }

        "pr_checks" (path: String, number: u64) => {
            crate::pr::pr_checks(path, number).await
        }

        "repo_commit_checks" (path: String) => {
            crate::pr::repo_commit_checks(path).await
        }

        "pr_add_comment" (
            path: String,
            number: u64,
            body: String,
            in_reply_to: Option<String>,
            file_path: Option<String>,
            line: Option<u64>
        ) => {
            crate::pr::pr_add_comment(path, number, body, in_reply_to, file_path, line).await
        }

        "pr_submit_review" (
            path: String,
            number: u64,
            event: String,
            body: String,
            comments: Option<Vec<crate::pr::ReviewDraftComment>>
        ) => {
            crate::pr::pr_submit_review(path, number, event, body, comments).await
        }

        "pr_merge" (
            path: String,
            number: u64,
            strategy: String,
            message: Option<String>,
            delete_source_branch: Option<bool>
        ) => {
            crate::pr::pr_merge(path, number, strategy, message, delete_source_branch).await
        }

        "pr_checkout" (path: String, number: u64) => {
            crate::pr::pr_checkout(path, number).await
        }

        "list_workflow_runs" (path: String) => {
            crate::pr::list_workflow_runs(path).await
        }

        "get_workflow_jobs" (path: String, run_id: u64) => {
            crate::pr::get_workflow_jobs(path, run_id).await
        }

        "rerun_workflow" (path: String, run_id: u64) => {
            crate::pr::rerun_workflow(path, run_id).await
        }

        "cancel_workflow" (path: String, run_id: u64) => {
            crate::pr::cancel_workflow(path, run_id).await
        }

        "pr_rerun_check" (path: String, check_run_id: String) => {
            crate::pr::pr_rerun_check(path, check_run_id).await
        }

        "pr_rerun_check_suite" (path: String, suite_id: String) => {
            crate::pr::pr_rerun_check_suite(path, suite_id).await
        }

        "pr_check_annotations" (path: String, check_run_id: String) => {
            crate::pr::pr_check_annotations(path, check_run_id).await
        }

        "pr_branch_protection" (path: String, branch: String) => {
            crate::pr::pr_branch_protection(path, branch).await
        }

        "pr_set_auto_merge" (
            path: String,
            pr_node_id: String,
            enable: bool,
            merge_method: Option<String>
        ) => {
            crate::pr::pr_set_auto_merge(path, pr_node_id, enable, merge_method).await
        }

        "pr_review_threads" (path: String, number: u64) => {
            crate::pr::pr_review_threads(path, number).await
        }

        "pr_resolve_thread" (path: String, thread_id: String, resolved: bool) => {
            crate::pr::pr_resolve_thread(path, thread_id, resolved).await
        }

        "list_workflow_files" (path: String) => {
            crate::pr::list_workflow_files(path)
        }

        "read_workflow_file" (path: String, filename: String) => {
            crate::pr::read_workflow_file(path, filename)
        }

        "save_workflow_file" (path: String, filename: String, content: String) => {
            crate::pr::save_workflow_file(path, filename, content)
        }

        "pr_provider_capabilities" (path: String) => {
            crate::pr::pr_provider_capabilities(path)
        }

        "create_remote_repo" (
            host: String,
            name: String,
            private: bool,
            description: Option<String>
        ) => {
            crate::providers::create_remote_repo(host, name, private, description).await
        }

        "list_remote_repos" (host: String) => {
            crate::providers::list_remote_repos(host).await
        }

        "read_repo_favicon" (path: String) => {
            Ok::<Option<String>, String>(crate::favicon::read_repo_favicon(path).await)
        }

        "repo_file_bytes_at" (
            path: String,
            treeish: Option<String>,
            file_path: String
        ) => {
            crate::media::repo_file_bytes_at(path, treeish, file_path).await
        }

        "list_repo_tools" (path: String) => {
            crate::repo_tools::list_repo_tools(path)
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState};
    use serde_json::{json, Value};
    use std::sync::Arc;
    use tokio::sync::mpsc;

    fn ctx() -> (DispatchCtx, mpsc::Receiver<Value>) {
        let state = ServerState::new("host".into(), [7u8; 32], vec![], None);
        let (tx, rx) = mpsc::channel(crate::server::state::OUTBOX_CAPACITY);
        let conn = Arc::new(ConnectionHandle::new(1, tx));
        (DispatchCtx::new(state, conn, 42, "pr"), rx)
    }

    fn missing_repo() -> String {
        std::env::temp_dir()
            .join("l8gitd-dispatch-pr-does-not-exist")
            .to_string_lossy()
            .to_string()
    }

    #[tokio::test]
    async fn claims_only_its_own_commands() {
        let (ctx, _rx) = ctx();
        assert!(super::dispatch("kein_befehl", json!({}), &ctx).await.is_none());
        assert!(super::dispatch("list_repo_tools", json!({ "path": "." }), &ctx)
            .await
            .is_some());
    }

    #[tokio::test]
    async fn maps_camel_case_arguments_and_serializes_results() {
        let (ctx, _rx) = ctx();
        let repo = missing_repo();

        let out = super::dispatch("list_repo_tools", json!({ "path": repo }), &ctx)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(out, json!([]));

        let out = super::dispatch("list_workflow_files", json!({ "path": missing_repo() }), &ctx)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(out, json!([]));

        let err = super::dispatch(
            "read_workflow_file",
            json!({ "path": missing_repo(), "filename": "build.txt" }),
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(err, Err("Nur .yml/.yaml Dateien erlaubt.".to_string()));
    }

    #[tokio::test]
    async fn reports_missing_arguments_with_camel_case_names() {
        let (ctx, _rx) = ctx();
        let err = super::dispatch("pr_set_auto_merge", json!({ "path": "." }), &ctx)
            .await
            .unwrap();
        assert_eq!(err, Err("Fehlendes Argument \"prNodeId\".".to_string()));

        let err = super::dispatch(
            "get_workflow_jobs",
            json!({ "path": ".", "runId": "nope" }),
            &ctx,
        )
        .await
        .unwrap();
        assert!(err.unwrap_err().starts_with("Ungültiges Argument \"runId\""));
    }
}
