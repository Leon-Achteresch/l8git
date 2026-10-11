pub async fn dispatch(
    cmd: &str,
    args: serde_json::Value,
    ctx: &crate::server::state::DispatchCtx,
) -> Option<Result<serde_json::Value, String>> {
    crate::dispatch_table! { cmd, args, ctx;

        "repo_compare_commits" (path: String, base: String, head: String, mode: Option<String>) => {
            crate::compare::repo_compare_commits(path, base, head, mode).await
        }

        "repo_compare_file_diff" (path: String, base: String, head: String, mode: Option<String>, file: String, previous_file: Option<String>) => {
            crate::compare::repo_compare_file_diff(path, base, head, mode, file, previous_file).await
        }

        "git_remote_cancel" (op_id: String) => {
            crate::git::git_remote_cancel(op_id).await
        }

        "repo_search_commits" (
            path: String,
            query: String,
            skip: usize,
            limit: usize,
            hide_t3_checkpoints: Option<bool>,
            search_paths: Option<bool>,
            scan_limit: Option<usize>
        ) => {
            crate::git::repo_search_commits(
                path,
                query,
                skip,
                limit,
                hide_t3_checkpoints,
                search_paths,
                scan_limit,
            )
            .await
        }

        "open_repo" (path: String, hide_t3_checkpoints: Option<bool>) => {
            crate::git::open_repo(path, hide_t3_checkpoints).await
        }

        "git_init_repo" (path: String) => {
            crate::git::git_init_repo(path).await
        }

        "repo_history_page" (path: String, filter: crate::git::HistoryFilter, skip: usize, limit: usize) => {
            crate::git::repo_history_page(path, filter, skip, limit).await
        }

        "repo_log_page" (
            path: String,
            skip: usize,
            limit: usize,
            hide_t3_checkpoints: Option<bool>
        ) => {
            crate::git::repo_log_page(path, skip, limit, hide_t3_checkpoints).await
        }

        "branch_push_remote" (path: String) => {
            crate::git::branch_push_remote(path).await
        }

        "git_fetch" (
            path: String,
            prune_branches: Option<bool>,
            prune_tags: Option<bool>,
            remote: Option<String>,
            all_remotes: Option<bool>,
            op_id: Option<String>
        ) => {
            crate::git::git_fetch(
                path,
                prune_branches,
                prune_tags,
                remote,
                all_remotes,
                op_id,
            )
            .await
        }

        "git_pull" (
            path: String,
            strategy: Option<String>,
            remote: Option<String>,
            op_id: Option<String>
        ) => {
            crate::git::git_pull(path, strategy, remote, op_id).await
        }

        "git_push" (
            path: String,
            set_upstream: bool,
            remote: Option<String>,
            force_mode: Option<String>,
            tags_mode: Option<String>,
            atomic: Option<bool>,
            no_verify: Option<bool>,
            dry_run: Option<bool>,
            op_id: Option<String>
        ) => {
            crate::git::git_push(
                path,
                set_upstream,
                remote,
                force_mode,
                tags_mode,
                atomic,
                no_verify,
                dry_run,
                op_id,
            )
            .await
        }

        "list_git_remotes" (path: String) => {
            crate::git::list_git_remotes(path).await
        }

        "set_git_remote_url" (path: String, name: String, url: String) => {
            crate::git::set_git_remote_url(path, name, url).await
        }

        "add_git_remote" (path: String, name: String, url: String) => {
            crate::git::add_git_remote(path, name, url).await
        }

        "branch_has_upstream" (path: String) => {
            crate::git::branch_has_upstream(path).await
        }

        "repo_upstream_sync_counts" (path: String) => {
            crate::git::repo_upstream_sync_counts(path).await
        }

        "git_clone" (url: String, dest: String, op_id: Option<String>) => {
            crate::git::git_clone(url, dest, op_id).await
        }

        "git_checkout" (
            path: String,
            ref_name: String,
            create: bool,
            from_remote: Option<String>,
            base: Option<String>
        ) => {
            crate::git::git_checkout(path, ref_name, create, from_remote, base).await
        }

        "git_create_branch" (path: String, name: String, base: Option<String>, checkout: bool) => {
            crate::git::git_create_branch(path, name, base, checkout).await
        }

        "git_resolve_commit" (path: String, rev: String) => {
            crate::git::git_resolve_commit(path, rev).await
        }

        "git_merge" (
            path: String,
            branch: String,
            strategy: Option<String>,
            message: Option<String>,
            expected_branch: Option<String>,
            expected_head: Option<String>,
            expected_source_head: Option<String>
        ) => {
            crate::git::git_merge(path, branch, strategy, message, expected_branch, expected_head, expected_source_head).await
        }

        "git_revert_commit" (path: String, commit: String, merge_mainline: Option<u8>) => {
            crate::git::git_revert_commit(path, commit, merge_mainline).await
        }

        "git_cherry_pick" (path: String, commits: Vec<String>, mainline: Option<u8>) => {
            crate::git::git_cherry_pick(path, commits, mainline).await
        }

        "git_cherry_pick_continue" (path: String) => {
            crate::git::git_cherry_pick_continue(path).await
        }

        "git_cherry_pick_skip" (path: String) => {
            crate::git::git_cherry_pick_skip(path).await
        }

        "git_cherry_pick_abort" (path: String) => {
            crate::git::git_cherry_pick_abort(path).await
        }

        "cherry_pick_state" (path: String) => {
            crate::git::cherry_pick_state(path).await
        }

        "merge_state" (path: String) => {
            crate::git::merge_state(path).await
        }

        "git_merge_abort" (path: String) => {
            crate::git::git_merge_abort(path).await
        }

        "git_get_conflict_versions" (path: String, file: String) => {
            crate::git::git_get_conflict_versions(path, file).await
        }

        "git_save_resolved_file" (path: String, file: String, content: String) => {
            crate::git::git_save_resolved_file(path, file, content).await
        }

        "git_merge_commit" (path: String) => {
            crate::git::git_merge_commit(path).await
        }

        "git_tag_commit" (
            path: String,
            name: String,
            commit: String,
            annotated: Option<bool>,
            message: Option<String>,
            sign: Option<bool>
        ) => {
            crate::git::git_tag_commit(path, name, commit, annotated, message, sign).await
        }

        "git_discard_files" (path: String, files: Vec<String>, untracked: Vec<bool>, expected_fingerprints: Option<Vec<String>>) => {
            crate::git::git_discard_files(path, files, untracked, expected_fingerprints).await
        }

        "git_discard_worktree_changes" (path: String, files: Vec<String>, untracked: Vec<bool>, expected_fingerprints: Option<Vec<String>>) => {
            crate::git::git_discard_worktree_changes(path, files, untracked, expected_fingerprints).await
        }

        "git_restore_files_at_commit" (path: String, commit: String, files: Vec<String>) => {
            crate::git::git_restore_files_at_commit(path, commit, files).await
        }

        "delete_branch" (path: String, name: String, force: bool) => {
            crate::git::delete_branch(path, name, force).await
        }

        "delete_remote_branch" (path: String, remote_ref: String) => {
            crate::git::delete_remote_branch(path, remote_ref).await
        }

        "delete_tag" (path: String, name: String) => {
            crate::git::delete_tag(path, name).await
        }

        "delete_remote_tag" (path: String, name: String, remote: String) => {
            crate::git::delete_remote_tag(path, name, remote).await
        }

        "repo_status" (path: String) => {
            crate::git::repo_status(path).await
        }

        "repo_full_status" (path: String) => {
            crate::git::repo_full_status(path).await
        }

        "stage_files" (path: String, files: Vec<String>) => {
            crate::git::stage_files(path, files).await
        }

        "unstage_files" (path: String, files: Vec<String>) => {
            crate::git::unstage_files(path, files).await
        }

        "git_commit_split_snapshot" (path: String, files: Vec<String>) => {
            crate::git::git_commit_split_snapshot(path, files).await
        }

        "git_commit_split_group_checked" (
            path: String,
            files: Vec<String>,
            expected: crate::git::CommitSplitSnapshot,
            selections: Vec<crate::git::CommitSplitSelection>,
            message: String,
            sign: Option<bool>
        ) => {
            crate::git::git_commit_split_group_checked(path, files, expected, selections, message, sign).await
        }

        "commit_changes" (path: String, message: String, sign: Option<bool>) => {
            crate::git::commit_changes(path, message, sign).await
        }

        "commit_amend" (path: String, message: String, expected_head: Option<String>) => {
            crate::git::commit_amend(path, message, expected_head).await
        }

        "commit_signing_info" (path: String) => {
            crate::git::commit_signing_info(path).await
        }

        "set_commit_signing" (
            path: String,
            commit_sign: Option<bool>,
            tag_sign: Option<bool>,
            format: Option<String>,
            signing_key: Option<String>
        ) => {
            crate::git::set_commit_signing(path, commit_sign, tag_sign, format, signing_key).await
        }

        "commit_signature_status" (path: String, hash: String) => {
            crate::git::commit_signature_status(path, hash).await
        }

        "repo_staged_diff" (path: String) => {
            crate::git::repo_staged_diff(path).await
        }

        "repo_file_diff" (path: String, file: String, untracked: bool, include_fingerprint: Option<bool>) => {
            crate::git::repo_file_diff(path, file, untracked, include_fingerprint).await
        }

        "repo_read_file" (path: String, file: String) => {
            crate::git::repo_read_file(path, file).await
        }

        "repo_write_file" (path: String, file: String, content: String) => {
            crate::git::repo_write_file(path, file, content).await
        }

        "repo_file_content_at" (path: String, file: String, treeish: String) => {
            crate::git::repo_file_content_at(path, file, treeish).await
        }

        "stage_hunk" (path: String, patch: String) => {
            crate::git::stage_hunk(path, patch).await
        }

        "unstage_hunk" (path: String, patch: String) => {
            crate::git::unstage_hunk(path, patch).await
        }

        "discard_hunk" (path: String, patch: String) => {
            crate::git::discard_hunk(path, patch).await
        }

        "git_apply_reviewed_hunks" (path: String, file: String, action: String, patches: Vec<String>, expected_fingerprint: String) => {
            crate::git::git_apply_reviewed_hunks(path, file, action, patches, expected_fingerprint).await
        }

        "repo_commit_inspect" (path: String, commit: String) => {
            crate::git::repo_commit_inspect(path, commit).await
        }

        "repo_commit_file_diff" (path: String, commit: String, file: String) => {
            crate::git::repo_commit_file_diff(path, commit, file).await
        }

        "add_to_gitignore" (path: String, patterns: Vec<String>) => {
            crate::git::add_to_gitignore(path, patterns).await
        }

        "list_stashes" (path: String) => {
            crate::git::list_stashes(path).await
        }

        "git_stash_push" (
            path: String,
            message: Option<String>,
            include_untracked: bool,
            keep_index: bool
        ) => {
            crate::git::git_stash_push(path, message, include_untracked, keep_index).await
        }

        "git_stash_pop" (path: String, index: u32, expected_hash: String) => {
            crate::git::git_stash_pop(path, index, expected_hash).await
        }

        "git_stash_apply" (path: String, index: u32, expected_hash: String) => {
            crate::git::git_stash_apply(path, index, expected_hash).await
        }

        "git_stash_drop" (path: String, index: u32, expected_hash: String) => {
            crate::git::git_stash_drop(path, index, expected_hash).await
        }

        "git_stash_show" (path: String, index: u32, expected_hash: Option<String>) => {
            crate::git::git_stash_show(path, index, expected_hash).await
        }

        "git_stash_file_diff" (path: String, index: u32, file: String, expected_hash: Option<String>) => {
            crate::git::git_stash_file_diff(path, index, file, expected_hash).await
        }

        "git_stash_branch" (path: String, index: u32, name: String, expected_hash: String) => {
            crate::git::git_stash_branch(path, index, name, expected_hash).await
        }

        "repo_branch_activity" (path: String) => {
            crate::git::repo_branch_activity(path).await
        }

        "repo_blame" (path: String, file: String, commit: Option<String>) => {
            crate::git::repo_blame(path, file, commit).await
        }

        "repo_list_files" (path: String) => {
            crate::git::repo_list_files(path).await
        }

        "repo_language_stats" (path: String) => {
            crate::git::repo_language_stats(path).await
        }

        "list_worktrees" (path: String) => {
            crate::git::list_worktrees(path).await
        }

        "git_worktree_add" (
            path: String,
            worktree_path: String,
            branch: Option<String>,
            new_branch: Option<String>
        ) => {
            crate::git::git_worktree_add(path, worktree_path, branch, new_branch).await
        }

        "git_worktree_remove" (path: String, worktree_path: String, force: bool) => {
            crate::git::git_worktree_remove(path, worktree_path, force).await
        }

        "git_worktree_remove_checked" (
            path: String,
            worktree_path: String,
            expected_branch: String,
            expected_head: String,
            merged_into: String
        ) => {
            crate::git::git_worktree_remove_checked(path, worktree_path, expected_branch, expected_head, merged_into).await
        }

        "git_worktree_lock" (path: String, worktree_path: String, reason: Option<String>) => {
            crate::git::git_worktree_lock(path, worktree_path, reason).await
        }

        "git_worktree_unlock" (path: String, worktree_path: String) => {
            crate::git::git_worktree_unlock(path, worktree_path).await
        }

        "git_worktree_prune" (path: String) => {
            crate::git::git_worktree_prune(path).await
        }

        "git_worktree_move" (path: String, worktree_path: String, new_path: String) => {
            crate::git::git_worktree_move(path, worktree_path, new_path).await
        }

        "list_submodules" (path: String) => {
            crate::git::list_submodules(path).await
        }

        "get_submodule_commits" (path: String, submodule_path: String, pinned_commit: String) => {
            crate::git::get_submodule_commits(path, submodule_path, pinned_commit).await
        }

        "git_submodule_init" (path: String, submodule_path: Option<String>) => {
            crate::git::git_submodule_init(path, submodule_path).await
        }

        "git_submodule_update" (
            path: String,
            submodule_path: Option<String>,
            init: bool,
            recursive: bool
        ) => {
            crate::git::git_submodule_update(path, submodule_path, init, recursive).await
        }

        "git_submodule_sync" (path: String, submodule_path: Option<String>) => {
            crate::git::git_submodule_sync(path, submodule_path).await
        }

        "git_submodule_add" (
            path: String,
            url: String,
            subpath: String,
            name: Option<String>,
            branch: Option<String>
        ) => {
            crate::git::git_submodule_add(path, url, subpath, name, branch).await
        }

        "git_submodule_deinit" (path: String, submodule_path: String, force: bool) => {
            crate::git::git_submodule_deinit(path, submodule_path, force).await
        }

        "list_git_hooks" (path: String) => {
            crate::git::list_git_hooks(path).await
        }

        "get_git_hook_content" (path: String, hook_name: String) => {
            crate::git::get_git_hook_content(path, hook_name).await
        }

        "save_git_hook" (path: String, hook_name: String, content: String) => {
            crate::git::save_git_hook(path, hook_name, content).await
        }

        "delete_git_hook" (path: String, hook_name: String) => {
            crate::git::delete_git_hook(path, hook_name).await
        }

        "toggle_git_hook" (path: String, hook_name: String, enabled: bool) => {
            crate::git::toggle_git_hook(path, hook_name, enabled).await
        }

        "run_git_hook" (path: String, hook_name: String) => {
            crate::git::run_git_hook(path, hook_name).await
        }

        "git_bisect_status" (path: String) => {
            crate::git::git_bisect_status(path).await
        }

        "git_bisect_start" (path: String, bad: String, good: String) => {
            crate::git::git_bisect_start(path, bad, good).await
        }

        "git_bisect_mark" (path: String, verdict: String) => {
            crate::git::git_bisect_mark(path, verdict).await
        }

        "git_bisect_reset" (path: String) => {
            crate::git::git_bisect_reset(path).await
        }

        "git_reset" (path: String, target: String, mode: String, expected_head: Option<String>) => {
            crate::git::git_reset(path, target, mode, expected_head).await
        }

        "repo_contributor_stats" (
            path: String,
            since_days: u32,
            limit: Option<u32>,
            include_merges: Option<bool>
        ) => {
            crate::git::repo_contributor_stats(path, since_days, limit, include_merges).await
        }

        "repo_activity_buckets" (
            path: String,
            since_days: u32,
            bucket: String,
            include_merges: Option<bool>
        ) => {
            crate::git::repo_activity_buckets(path, since_days, bucket, include_merges).await
        }

        "repos_overview" (paths: Vec<String>) => {
            crate::git::repos_overview(paths).await
        }

        "repo_range_commits" (
            path: String,
            base: Option<String>,
            head: String,
            limit: Option<u32>
        ) => {
            crate::git::repo_range_commits(path, base, head, limit).await
        }

    }
}
