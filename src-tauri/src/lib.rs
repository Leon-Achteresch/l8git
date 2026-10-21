mod exports;
mod agent_addons;
mod agent_review;
pub mod agent_transport;
mod capability_market;
mod capability_sync;
mod claude;
mod claude_usage;
mod cmd;
mod cmdlog;
pub mod compare;
mod credentials;
mod cursor;
mod favicon;
mod hub;
pub mod git;
pub mod jira;
pub mod jira_mcp;
pub mod jira_policy;
pub mod lfs;
mod media;
pub mod pathsafe;
pub mod pr;
mod providers;
mod provider_rate_limit;
pub mod pty;
mod rebase;
mod remote;
pub mod renderer_mcp;
mod repo_tools;
mod secrets;
#[cfg(feature = "headless")]
pub mod server;
mod shell;
pub mod sink;
mod stack;
mod undo;
mod watcher;

struct TauriSink(tauri::AppHandle);

impl sink::EventSink for TauriSink {
    fn emit(&self, name: &str, payload: serde_json::Value) {
        use tauri::Emitter;
        let _ = self.0.emit_to("main", name, payload);
    }
}

/// Memory knobs set by `tune_webkit_without_gpu`, dropped again once WebKit's processes have started.
#[cfg(target_os = "linux")]
static WEBKIT_MEMORY_ENV: std::sync::OnceLock<Vec<&'static str>> = std::sync::OnceLock::new();

/// Without a usable GPU render node, WebKitGTK's DMABuf renderer composites through llvmpipe in the UI and
/// web process: ~250 MB more memory and no smoother scrolling than its software path. Such machines are the weak
/// ones, so also trade WebKit's memory headroom for footprint. Runs before WebKit reads the environment; knobs the
/// user set win.
#[cfg(target_os = "linux")]
fn tune_webkit_without_gpu() {
    // shortcut: an openable render node counts as a GPU even without 3D (vgem, virtio-gpu without virgl); add an EGL probe if such users report high memory.
    let gpu = std::fs::read_dir("/dev/dri").into_iter().flatten().flatten().any(|entry| {
        entry.file_name().to_string_lossy().starts_with("renderD")
            && std::fs::OpenOptions::new().read(true).write(true).open(entry.path()).is_ok()
    });
    if gpu {
        return;
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    let memory_env = [
        // glibc keeps freed heap tops and raises its mmap threshold up to 32 MB; return memory early instead.
        ("GLIBC_TUNABLES", "glibc.malloc.trim_threshold=131072:glibc.malloc.mmap_threshold=262144"),
        // JSC grows the JS heap to 32 MB before its first full GC; start collecting at 8 MB.
        ("JSC_largeHeapSize", "8388608"),
        // GTK (GLX) and WebKit (EGL) would load Mesa's llvmpipe (LLVM) only to probe: -12 MB private in this
        // process. WebGL is off too, so the terminal uses xterm's DOM renderer instead of WebGL on llvmpipe.
        ("GDK_GL", "disable"),
        ("__EGL_VENDOR_LIBRARY_FILENAMES", "/dev/null"),
    ];
    let set = memory_env
        .into_iter()
        .filter(|(key, _)| std::env::var_os(key).is_none())
        // A user-chosen EGL vendor directory would be overridden by the FILENAMES list.
        .filter(|(key, _)| {
            *key != "__EGL_VENDOR_LIBRARY_FILENAMES"
                || std::env::var_os("__EGL_VENDOR_LIBRARY_DIRS").is_none()
        })
        .map(|(key, value)| {
            std::env::set_var(key, value);
            key
        })
        .collect::<Vec<_>>();
    // GLIBC_TUNABLES only reaches child processes; give this process the same malloc limits.
    #[cfg(target_env = "gnu")]
    if set.contains(&"GLIBC_TUNABLES") {
        unsafe {
            libc::mallopt(libc::M_TRIM_THRESHOLD, 131072);
            libc::mallopt(libc::M_MMAP_THRESHOLD, 262144);
        }
    }
    let _ = WEBKIT_MEMORY_ENV.set(set);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    tune_webkit_without_gpu();
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let dark = matches!(window.theme(), Ok(tauri::Theme::Dark));
                    let color = if dark {
                        tauri::webview::Color(10, 10, 10, 255)
                    } else {
                        tauri::webview::Color(250, 250, 250, 255)
                    };
                    let _ = window.set_background_color(Some(color));
                }
            }
            // WebKit's network and web process have started with the memory knobs; keep them away from the
            // terminals, git and agents we spawn. Only processes started before setup get them (a web process
            // relaunched after a crash runs with WebKit's defaults). Other threads may getenv meanwhile; glibc
            // never frees environ strings, so the worst case is one stale lookup.
            #[cfg(target_os = "linux")]
            for key in WEBKIT_MEMORY_ENV.get().into_iter().flatten() {
                std::env::remove_var(key);
            }
            sink::set_sink(std::sync::Arc::new(TauriSink(app.handle().clone())));
            Ok(())
        })
        .manage(agent_transport::AgentTransportState::default())
        .manage(pty::PtyState::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            exports::save_user_export,
            exports::runtime_diagnostics,
            remote::remote_status,
            remote::remote_set_config,
            remote::remote_start,
            remote::remote_stop,
            remote::remote_pair,
            remote::remote_add_root,
            remote::remote_remove_root,
            agent_addons::agent_addon_config_read,
            agent_addons::agent_addon_config_write,
            agent_transport::agent_transport_open,
            agent_transport::agent_transport_send,
            agent_transport::agent_transport_close,
            agent_transport::agent_session_claim,
            agent_transport::agent_transport_close_all,
            agent_transport::opencode_delete_session,
            agent_transport::opencode_cli,
            capability_market::agent_market_search,
            capability_market::agent_market_inspect,
            capability_market::agent_market_install,
            capability_market::agent_market_add_mcp,
            capability_market::agent_market_preview,
            capability_market::agent_market_target_path,
            capability_sync::agent_cap_inventory,
            capability_sync::agent_cap_copy,
            capability_sync::agent_cap_delete,
            capability_sync::agent_cap_sync_plan,
            capability_sync::agent_cap_sync_apply,
            claude_usage::fetch_claude_usage,
            claude::claude_list_sessions,
            claude::claude_read_session,
            claude::claude_rename_session,
            claude::claude_delete_session,
            claude::claude_fork_session,
            claude::claude_auth_status,
            claude::claude_start_login,
            claude::claude_cancel_login,
            claude::claude_logout,
            claude::claude_effective_settings,
            claude::claude_write_settings,
            claude::agent_diagnostics_report,
            claude::claude_list_plugins,
            claude::claude_list_skills,
            claude::claude_list_hooks,
            claude::claude_mcp_login,
            claude::claude_mcp_remove,
            claude::claude_list_capability_files,
            claude::claude_read_capability_file,
            claude::claude_write_capability_file,
            claude::claude_version_status,
            claude::claude_delete_capability_file,
            claude::claude_set_hook_disabled,
            claude::claude_set_plugin_enabled,
            claude::claude_uninstall_plugin,
            cursor::cursor_list_sessions,
            cursor::cursor_delete_session,
            cursor::cursor_rename_session,
            cursor::cursor_cli,
            cursor::cursor_list_hooks,
            git::open_repo,
            git::git_init_repo,
            git::repo_log_page,
            git::repo_history_page,
            git::repo_search_commits,
            compare::repo_compare_commits,
            compare::repo_compare_file_diff,
            favicon::read_repo_favicon,
            favicon::read_image_data_url,
            shell::reveal_repo_folder,
            shell::open_repo_terminal,
            shell::open_repo_in_ide,
            shell::save_clipboard_image,
            shell::detect_clis,
            repo_tools::list_repo_tools,
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
            git::git_resolve_commit,
            git::git_merge,
            git::git_revert_commit,
            git::git_cherry_pick,
            git::git_cherry_pick_continue,
            git::git_cherry_pick_skip,
            git::git_cherry_pick_abort,
            git::cherry_pick_state,
            git::merge_state,
            git::git_merge_abort,
            git::git_get_conflict_versions,
            git::git_save_resolved_file,
            git::git_merge_commit,
            git::git_tag_commit,
            git::git_discard_files,
            git::git_discard_worktree_changes,
            git::git_restore_files_at_commit,
            git::delete_branch,
            git::delete_remote_branch,
            git::delete_tag,
            git::delete_remote_tag,
            git::repo_status,
            git::repo_full_status,
            git::repo_upstream_sync_counts,
            git::repo_staged_diff,
            git::repo_file_diff,
            git::repo_read_file,
            git::repo_write_file,
            git::repo_file_content_at,
            git::repo_commit_inspect,
            git::repo_commit_file_diff,
            git::stage_files,
            git::add_to_gitignore,
            git::unstage_files,
            git::stage_hunk,
            git::unstage_hunk,
            git::discard_hunk,
            git::git_apply_reviewed_hunks,
            git::git_commit_split_snapshot,
            git::git_commit_split_group_checked,
            git::commit_changes,
            git::commit_amend,
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
            hub::hub_connect,
            hub::hub_t3_send,
            hub::hub_disconnect,
            hub::hub_use_for_git,
            hub::hub_api,
            hub::hub_oauth_available,
            hub::hub_oauth_start,
            hub::hub_oauth_poll,
            providers::create_remote_repo,
            pr::resolve_repo_commit_avatars,
            pr::pr_list,
            pr::pr_list_page,
            pr::pr_create_web_url,
            pr::pr_create,
            pr::pr_detail,
            pr::pr_commits,
            pr::pr_files,
            pr::pr_file_patch,
            pr::pr_conversation,
            pr::pr_checks,
            pr::repo_commit_checks,
            pr::list_workflow_runs,
            pr::get_workflow_jobs,
            pr::rerun_workflow,
            pr::cancel_workflow,
            pr::list_workflow_files,
            pr::read_workflow_file,
            pr::save_workflow_file,
            pr::pr_add_comment,
            pr::pr_submit_review,
            pr::pr_merge,
            pr::pr_checkout,
            pr::pr_rerun_check,
            pr::pr_rerun_check_suite,
            pr::pr_check_annotations,
            pr::pr_branch_protection,
            pr::pr_set_auto_merge,
            watcher::watch_repo,
            watcher::unwatch_repo,
            git::repo_language_stats,
            git::repo_blame,
            git::repo_list_files,
            git::list_submodules,
            git::get_submodule_commits,
            git::git_submodule_init,
            git::git_submodule_update,
            git::git_submodule_sync,
            git::git_submodule_add,
            git::git_submodule_deinit,
            git::list_worktrees,
            git::git_worktree_add,
            git::git_worktree_remove,
            git::git_worktree_remove_checked,
            git::git_worktree_lock,
            git::git_worktree_unlock,
            git::git_worktree_prune,
            git::git_worktree_move,
            git::list_git_hooks,
            git::get_git_hook_content,
            git::save_git_hook,
            git::delete_git_hook,
            git::toggle_git_hook,
            git::run_git_hook,
            git::git_bisect_status,
            git::git_bisect_start,
            git::git_bisect_mark,
            git::git_bisect_reset,
            git::git_reset,
            git::repo_contributor_stats,
            git::repo_activity_buckets,
            git::repo_branch_activity,
            git::commit_signing_info,
            git::set_commit_signing,
            git::commit_signature_status,
            git::branch_push_remote,
            undo::reflog_list,
            undo::undo_last_operation,
            undo::undo_preview,
            undo::reset_to_reflog_entry,
            undo::branch_restore,
            undo::commit_full_message,
            git::repos_overview,
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            pty::pty_close_all,
            pty::pty_has_foreground_process,
            pty::pty_shell_name,
            secrets::secret_set,
            secrets::secret_get,
            secrets::secret_delete,
            jira::jira_save_credentials,
            jira::jira_credentials_status,
            jira::jira_delete_credentials,
            jira::jira_test_connection,
            jira::jira_fetch_issue,
            jira::jira_fetch_comments,
            jira::jira_search_issues,
            jira_policy::jira_write_policy,
            jira_policy::jira_mcp_command,
            jira_policy::jira_sync_cursor_mcp,
            renderer_mcp::renderer_mcp_command,
            rebase::rebase_start,
            rebase::rebase_status,
            rebase::rebase_continue,
            rebase::rebase_skip,
            rebase::rebase_abort,
            rebase::rebase_todo_preview,
            rebase::rebase_interactive,
            rebase::commit_fixup,
            git::git_remote_cancel,
            cmdlog::git_command_log,
            cmdlog::git_command_log_clear,
            cmdlog::git_command_log_live,
            media::repo_file_bytes_at,
            lfs::lfs_available,
            lfs::lfs_tracked_patterns,
            lfs::lfs_track,
            lfs::lfs_untrack,
            lfs::lfs_ls_files,
            lfs::lfs_pull,
            lfs::lfs_pointer_info,
            pr::pr_provider_capabilities,
            agent_review::agent_review_summary,
            agent_review::agent_review_commit_checked,
            agent_review::agent_review_delete_branch_checked,
            agent_review::agent_review_file_diff,
            agent_review::agent_review_discard_change,
            agent_review::agent_review_branch_merged,
            stack::stack_list,
            stack::stack_create_branch,
            stack::stack_adopt,
            stack::stack_remove,
            stack::stack_next_branch_name,
            stack::stack_restack,
            stack::stack_restack_resume,
            stack::stack_restack_state,
            stack::branch_cleanup_candidates,
            pr::pr_review_threads,
            pr::pr_resolve_thread,
            git::repo_range_commits,
            pr::pr_default_branch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
