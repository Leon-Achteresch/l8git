mod credentials;
mod favicon;
mod git;
mod providers;
mod shell;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::menu::{MenuBuilder, SubmenuBuilder};

            let app_menu = SubmenuBuilder::new(app, "gitit")
                .text("nav-repo", "Repository")
                .text("nav-about", "About")
                .text("nav-settings", "Einstellungen");

            #[cfg(target_os = "macos")]
            let app_menu = app_menu.separator().quit();

            let app_menu = app_menu.build()?;

            let menu = MenuBuilder::new(app).items(&[&app_menu]).build()?;

            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            use tauri::Emitter;

            let path = match event.id().as_ref() {
                "nav-repo" => Some("/"),
                "nav-about" => Some("/about"),
                "nav-settings" => Some("/settings"),
                _ => None,
            };

            if let Some(path) = path {
                let _ = app.emit("menu-navigate", path);
            }
        })
        .invoke_handler(tauri::generate_handler![
            git::open_repo,
            favicon::read_repo_favicon,
            shell::reveal_repo_folder,
            shell::open_repo_terminal,
            shell::open_repo_in_ide,
            git::git_fetch,
            git::git_pull,
            git::git_push,
            git::git_clone,
            git::git_checkout,
            git::git_create_branch,
            git::git_merge,
            git::git_discard_files,
            git::delete_branch,
            git::delete_remote_branch,
            git::repo_status,
            git::repo_upstream_sync_counts,
            git::repo_file_diff,
            git::stage_files,
            git::unstage_files,
            git::commit_changes,
            credentials::list_git_accounts,
            credentials::probe_git_account,
            credentials::git_sign_in,
            credentials::git_sign_in_via_credential_manager,
            credentials::git_sign_out,
            credentials::git_credential_helper,
            providers::list_remote_repos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
