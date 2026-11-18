#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("This acceptance runner requires macOS and WKWebView.");
    std::process::exit(1);
}

#[cfg(target_os = "macos")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    macos::run()
}

#[cfg(target_os = "macos")]
mod macos {
    use l8git_lib::{compare, git, sink, watcher};
    use serde_json::Value;
    use std::{
        borrow::Cow,
        collections::BTreeMap,
        path::PathBuf,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc, Mutex,
        },
    };
    use tauri::{
        ipc::{Invoke, InvokeBody},
        utils::assets::{AssetKey, AssetsIter, CspHash},
        utils::config::Csp,
        Assets, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
    };

    // Send keys only to this private fixture process, never to the desktop.
    fn post_fixture_key(key: u16) -> Result<(), &'static str> {
        use std::ffi::c_void;

        #[link(name = "CoreGraphics", kind = "framework")]
        unsafe extern "C" {
            fn CGEventCreateKeyboardEvent(
                source: *const c_void,
                key: u16,
                down: bool,
            ) -> *mut c_void;
            fn CGEventPostToPid(pid: i32, event: *mut c_void);
        }
        #[link(name = "CoreFoundation", kind = "framework")]
        unsafe extern "C" {
            fn CFRelease(value: *mut c_void);
        }

        for down in [true, false] {
            // Quartz accepts a null source. Release each created event after posting.
            unsafe {
                let event = CGEventCreateKeyboardEvent(std::ptr::null(), key, down);
                if event.is_null() {
                    return Err("Could not create private keyboard event");
                }
                CGEventPostToPid(std::process::id() as i32, event);
                CFRelease(event);
            }
        }
        Ok(())
    }

    struct BuiltFrontend(PathBuf);

    impl Assets<Wry> for BuiltFrontend {
        fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
            let asset = self
                .0
                .join(key.as_ref().trim_start_matches('/'))
                .canonicalize()
                .ok()?;
            if !asset.starts_with(&self.0) {
                return None;
            }
            std::fs::read(asset).ok().map(Cow::Owned)
        }

        fn iter(&self) -> Box<AssetsIter<'_>> {
            Box::new(std::iter::empty())
        }

        fn csp_hashes(&self, _: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
            Box::new(std::iter::empty())
        }
    }

    #[derive(Default)]
    struct WorktreeTrace(Mutex<BTreeMap<String, BTreeMap<String, usize>>>);

    impl WorktreeTrace {
        fn record(&self, path: &str, name: &str) {
            let mut counts = self.0.lock().unwrap();
            let count = counts
                .entry(path.into())
                .or_default()
                .entry(name.into())
                .or_default();
            *count += 1;
            println!("NATIVE_WORKTREE_TRACE {name} {path} {count}");
        }
    }

    struct WorktreeSink(tauri::AppHandle, Arc<WorktreeTrace>);

    impl sink::EventSink for WorktreeSink {
        fn emit(&self, name: &str, payload: Value) {
            if name == "repo-worktrees-changed" {
                if let Some(path) = payload.as_str() {
                    self.1.record(path, name);
                }
            }
            let _ = self.0.emit_to("main", name, payload);
        }
    }

    fn allowed_staging_command(command: &str, body: &Value) -> bool {
        match command {
            "open_repo" | "repo_status" | "repo_full_status" | "list_stashes"
            | "list_git_remotes" | "merge_state" | "cherry_pick_state" => true,
            "repo_file_diff" => matches!(body["file"].as_str(), Some("mode.sh" | "text.txt")),
            "stage_files" | "unstage_files" if body["files"] == serde_json::json!(["mode.sh"]) => {
                println!("NATIVE_STAGING_MUTATION {command}");
                true
            }
            "git_apply_reviewed_hunks" if body["file"] == "text.txt" => {
                let Some(action @ ("stage" | "unstage")) = body["action"].as_str() else {
                    return false;
                };
                if !matches!(body["patches"].as_array(), Some(patches) if patches.len() == 1) {
                    return false;
                }
                println!("NATIVE_STAGING_MUTATION {command}:{action}");
                true
            }
            _ => false,
        }
    }

    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let home = PathBuf::from(std::env::var("HOME")?);
        let fixture = home.parent().ok_or("Missing isolated home parent")?;
        // Require the isolated fixture layout before creating a WebView.
        if home.file_name().and_then(|name| name.to_str()) != Some("home")
            || !fixture.join("fixture.json").is_file()
            || !fixture.join("home/.native-submodule-acceptance").is_file()
        {
            return Err("Use scripts/native-submodule-acceptance.py to launch this example".into());
        }
        let spec: Value = serde_json::from_slice(&std::fs::read(fixture.join("fixture.json"))?)?;
        let parent = spec["parent"]
            .as_str()
            .ok_or("Missing parent path")?
            .to_owned();
        let staging = spec["kind"] == "staging";
        let worktree = spec["kind"] == "worktree";
        let notes = spec["kind"] == "notes";
        let compare = spec["kind"] == "compare";
        let search = spec["kind"] == "search";
        let history_path = spec["historyPath"] == true;
        let history_dates = spec["historyDates"] == true;
        let child = spec["child"].as_str().map(str::to_owned);
        if staging && (child.is_some() || PathBuf::from(&parent) != fixture.join("repos/staging")) {
            return Err("Unexpected staging fixture layout".into());
        }
        if !staging && child.is_none() {
            return Err("Missing child path".into());
        }
        for path in std::iter::once(&parent).chain(child.iter()) {
            let canonical = PathBuf::from(path).canonicalize()?;
            if !canonical.starts_with(fixture.join("repos")) || canonical.to_str() != Some(path) {
                return Err("Repository must be a canonical fixture path".into());
            }
        }
        let assets = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dist")
            .canonicalize()?;
        if !assets.join("index.html").is_file() {
            return Err("Build the frontend before native acceptance".into());
        }
        let (identifier, title, script, result_tag) = if search {
            (
                "com.leon.l8git.native-search-acceptance",
                "l8git Native Commit Search Acceptance",
                include_str!("../../scripts/native-search-acceptance.js"),
                "NATIVE_SEARCH_RESULT",
            )
        } else if compare {
            (
                "com.leon.l8git.native-compare-acceptance",
                "l8git Native Compare Acceptance",
                include_str!("../../scripts/native-compare-acceptance.js"),
                "NATIVE_COMPARE_RESULT",
            )
        } else if notes {
            (
                "com.leon.l8git.native-notes-acceptance",
                "l8git Native Commit Notes Acceptance",
                include_str!("../../scripts/native-notes-acceptance.js"),
                "NATIVE_NOTES_RESULT",
            )
        } else if worktree {
            (
                "com.leon.l8git.native-worktree-acceptance",
                "l8git Native Worktree Acceptance",
                include_str!("../../scripts/native-worktree-acceptance.js"),
                "NATIVE_WORKTREE_RESULT",
            )
        } else if staging {
            (
                "com.leon.l8git.native-staging-acceptance",
                "l8git Native Staging Acceptance",
                include_str!("../../scripts/native-staging-acceptance.js"),
                "NATIVE_STAGING_RESULT",
            )
        } else {
            (
                "com.leon.l8git.native-submodule-acceptance",
                "l8git Native Submodule Acceptance",
                include_str!("../../scripts/native-submodule-acceptance.js"),
                "NATIVE_SUBMODULE_RESULT",
            )
        };
        let script = format!("const fixture = {spec};\n{script}");

        let mut context = tauri::generate_context!();
        let config = context.config_mut();
        config.identifier = identifier.into();
        config.product_name = Some(title.into());
        config.build.dev_url = None;
        config.app.windows.clear();
        // All remote origins are excluded, including avatars, updater and fonts.
        let csp = "default-src 'self' tauri:; script-src 'self' tauri: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' tauri:; img-src 'self' tauri: data: blob:; connect-src 'self' tauri: ipc: http://ipc.localhost; worker-src 'self' tauri: blob:; object-src 'none'";
        config.app.security.csp = Some(Csp::Policy(csp.into()));
        config.app.security.dev_csp = Some(Csp::Policy(csp.into()));
        context.set_assets(Box::new(BuiltFrontend(assets)));

        // Real Tauri command macros and product implementations, without the
        // production plugins, credentials, agents, watchers or update handlers.
        let submodule_ipc: fn(Invoke<Wry>) -> bool = tauri::generate_handler![
            git::open_repo,
            git::repo_status,
            git::repo_full_status,
            git::list_stashes,
            git::list_git_remotes,
            git::merge_state,
            git::cherry_pick_state,
            git::list_submodules,
            git::get_submodule_commits,
            git::repo_file_diff,
            git::open_submodule_repo,
            git::git_submodule_pin_diff,
        ];
        let staging_ipc: fn(Invoke<Wry>) -> bool = tauri::generate_handler![
            git::open_repo,
            git::repo_status,
            git::repo_full_status,
            git::list_stashes,
            git::list_git_remotes,
            git::merge_state,
            git::cherry_pick_state,
            git::repo_file_diff,
            git::stage_files,
            git::unstage_files,
            git::git_apply_reviewed_hunks,
        ];
        let worktree_ipc: fn(Invoke<Wry>) -> bool = tauri::generate_handler![
            watcher::watch_repo,
            watcher::unwatch_repo,
            git::open_repo,
            git::repo_status,
            git::repo_full_status,
            git::list_stashes,
            git::list_git_remotes,
            git::merge_state,
            git::cherry_pick_state,
            git::list_worktrees,
        ];
        let notes_ipc: fn(Invoke<Wry>) -> bool = tauri::generate_handler![
            git::open_repo,
            git::repo_status,
            git::repo_full_status,
            git::list_stashes,
            git::list_git_remotes,
            git::merge_state,
            git::cherry_pick_state,
            git::repo_history_page,
            git::repo_log_page,
            git::repo_commit_inspect,
            git::repo_commit_file_diff,
            git::commit_signature_status,
            git::repo_commit_note,
        ];
        let notes_calls = AtomicUsize::new(0);
        let compare_ipc: fn(Invoke<Wry>) -> bool = tauri::generate_handler![
            git::open_repo,
            git::repo_status,
            git::repo_full_status,
            git::list_stashes,
            git::list_git_remotes,
            git::merge_state,
            git::cherry_pick_state,
            compare::repo_compare_commits,
            compare::repo_compare_file_diff,
        ];
        let search_ipc: fn(Invoke<Wry>) -> bool = tauri::generate_handler![
            git::open_repo,
            git::repo_status,
            git::repo_full_status,
            git::list_stashes,
            git::list_git_remotes,
            git::merge_state,
            git::cherry_pick_state,
            git::repo_log_page,
            git::repo_history_page,
            git::repo_search_commits,
            git::repo_commit_inspect,
            git::repo_commit_file_diff,
            git::commit_signature_status,
        ];
        let trace = Arc::new(WorktreeTrace::default());
        let invoke_trace = trace.clone();
        let app = tauri::Builder::default()
            .invoke_handler(move |invoke: Invoke<Wry>| {
                let InvokeBody::Json(body) = invoke.message.payload() else {
                    invoke.resolver.reject("Acceptance requires JSON IPC");
                    return true;
                };
                if invoke.message.command() == "native_acceptance_result" {
                    let passed = body["ok"] == true;
                    println!("{result_tag} {body}");
                    let app = invoke.message.webview_ref().app_handle().clone();
                    invoke.resolver.resolve(());
                    app.exit(if passed { 0 } else { 1 });
                    return true;
                }
                let path = body["path"].as_str();
                if (history_path || history_dates)
                    && invoke.message.command() == "native_history_key"
                {
                    let key = match body["key"].as_str() {
                        Some("Enter") => 36,
                        Some("Space") => 49,
                        _ => {
                            invoke.resolver.reject("Only Enter and Space are allowed");
                            return true;
                        }
                    };
                    match post_fixture_key(key) {
                        Ok(()) => invoke.resolver.resolve(()),
                        Err(error) => invoke.resolver.reject(error),
                    }
                    return true;
                }
                if search {
                    if path == Some(parent.as_str()) || path == child.as_deref() {
                        let command = invoke.message.command();
                        if matches!(
                            command,
                            "repo_search_commits"
                                | "repo_commit_inspect"
                                | "repo_log_page"
                                | "repo_history_page"
                        ) {
                            let mut data = body.clone();
                            data["command"] = command.into();
                            println!("NATIVE_SEARCH_IPC {data}");
                        }
                        return search_ipc(invoke);
                    }
                } else if compare {
                    let command = invoke.message.command();
                    if command == "native_compare_delete" {
                        println!("NATIVE_COMPARE_PHASE delete");
                        invoke.resolver.resolve(());
                        return true;
                    }
                    if command == "native_compare_deleted" {
                        let exists = PathBuf::from(&parent)
                            .join(".git/refs/heads/release")
                            .exists();
                        invoke.resolver.resolve(!exists);
                        return true;
                    }
                    if path == Some(parent.as_str())
                        || (child.is_some() && path == child.as_deref())
                    {
                        if matches!(command, "repo_compare_commits" | "repo_compare_file_diff") {
                            let mut data = body.clone();
                            data["command"] = command.into();
                            println!("NATIVE_COMPARE_IPC {data}");
                        }
                        return compare_ipc(invoke);
                    }
                } else if notes {
                    let command = invoke.message.command();
                    if command == "native_notes_count" {
                        invoke.resolver.resolve(notes_calls.load(Ordering::Relaxed));
                        return true;
                    }
                    if path == Some(parent.as_str())
                        || (child.is_some() && path == child.as_deref())
                    {
                        if command == "repo_commit_note" {
                            notes_calls.fetch_add(1, Ordering::Relaxed);
                            let input =
                                serde_json::json!({ "path": path, "commit": body["commit"] });
                            println!("NATIVE_NOTES_IPC {input}");
                        }
                        return notes_ipc(invoke);
                    }
                } else if worktree {
                    let command = invoke.message.command();
                    if command == "native_worktree_phase" {
                        if let Some(phase @ ("add" | "remove" | "inactive-add")) =
                            body["phase"].as_str()
                        {
                            println!("NATIVE_WORKTREE_PHASE {phase}");
                            invoke.resolver.resolve(());
                            return true;
                        }
                    }
                    if path == Some(parent.as_str())
                        || (child.is_some() && path == child.as_deref())
                    {
                        if command == "native_worktree_counts" {
                            let counts = invoke_trace.0.lock().unwrap();
                            invoke
                                .resolver
                                .resolve(counts.get(path.unwrap()).cloned().unwrap_or_default());
                            return true;
                        }
                        if matches!(command, "watch_repo" | "unwatch_repo" | "list_worktrees") {
                            invoke_trace.record(path.unwrap(), command);
                        }
                        return worktree_ipc(invoke);
                    }
                } else if staging {
                    if path == Some(parent.as_str())
                        && allowed_staging_command(invoke.message.command(), body)
                    {
                        return staging_ipc(invoke);
                    }
                } else if path == Some(parent.as_str())
                    || (child.is_some() && path == child.as_deref())
                {
                    return submodule_ipc(invoke);
                }
                invoke.resolver.reject("IPC outside the fixture scope");
                true
            })
            .setup(move |app| {
                if worktree {
                    sink::set_sink(Arc::new(WorktreeSink(app.handle().clone(), trace)));
                }
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title(title)
                    .inner_size(if history_dates { 1680.0 } else { 1180.0 }, 760.0)
                    .incognito(true)
                    .on_navigation(|url| {
                        url.scheme() == "tauri" && url.host_str() == Some("localhost")
                    })
                    .initialization_script(script)
                    .build()?;
                Ok(())
            })
            .build(context)?;
        let code = app.run_return(|_, _| {});
        std::process::exit(code);
    }
}
