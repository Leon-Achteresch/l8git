mod cmd;
mod credentials;
mod favicon;
mod git;
mod pr;
mod providers;
mod shell;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            git::open_repo,
            git::repo_log_page,
            git::repo_search_commits,
            favicon::read_repo_favicon,
            shell::reveal_repo_folder,
            shell::open_repo_terminal,
            shell::open_repo_in_ide,
            git::git_fetch,
            git::git_pull,
            git::git_push,
            git::list_git_remotes,
            git::set_git_remote_url,
            git::add_git_remote,
            git::branch_has_upstream,
            git::git_clone,
            git::git_checkout,
            git::git_create_branch,
            git::git_merge,
            git::git_revert_commit,
            git::git_cherry_pick,
            git::git_cherry_pick_continue,
            git::git_cherry_pick_skip,
            git::git_cherry_pick_abort,
            git::cherry_pick_state,
            git::git_tag_commit,
            git::git_discard_files,
            git::delete_branch,
            git::delete_remote_branch,
            git::delete_tag,
            git::delete_remote_tag,
            git::repo_status,
            git::repo_full_status,
            git::repo_upstream_sync_counts,
            git::repo_file_diff,
            git::repo_commit_inspect,
            git::repo_commit_file_diff,
            git::stage_files,
            git::unstage_files,
            git::commit_changes,
            git::list_stashes,
            git::git_stash_push,
            git::git_stash_pop,
            git::git_stash_apply,
            git::git_stash_drop,
            git::git_stash_show,
            git::git_stash_file_diff,
            git::git_stash_branch,
            credentials::git_sign_in,
            credentials::git_sign_in_via_credential_manager,
            credentials::git_sign_out,
            credentials::git_credential_helper,
            providers::list_remote_repos,
            pr::resolve_repo_commit_avatars,
            pr::pr_list,
            pr::pr_create_web_url,
            pr::pr_create,
            pr::pr_detail,
            pr::pr_commits,
            pr::pr_files,
            pr::pr_file_patch,
            pr::pr_conversation,
            pr::pr_checks,
            pr::repo_commit_checks,
            pr::pr_add_comment,
            pr::pr_submit_review,
            pr::pr_merge,
            pr::pr_checkout,
            watcher::watch_repo,
            watcher::unwatch_repo,
            git::repo_language_stats,
            git::repo_blame,
            git::list_submodules,
            git::git_submodule_init,
            git::git_submodule_update,
            git::git_submodule_sync,
            git::git_submodule_add,
            git::git_submodule_deinit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
