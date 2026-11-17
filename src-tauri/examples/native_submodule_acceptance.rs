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
    use l8git_lib::git;
    use serde_json::Value;
    use std::{borrow::Cow, path::PathBuf};
    use tauri::{
        ipc::{Invoke, InvokeBody},
        utils::assets::{AssetKey, AssetsIter, CspHash},
        utils::config::Csp,
        Assets, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
    };

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
        let child = spec["child"]
            .as_str()
            .ok_or("Missing child path")?
            .to_owned();
        for path in [&parent, &child] {
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
        let script = format!(
            "const fixture = {};\n{}",
            spec,
            include_str!("../../scripts/native-submodule-acceptance.js")
        );

        let mut context = tauri::generate_context!();
        let config = context.config_mut();
        config.identifier = "com.leon.l8git.native-submodule-acceptance".into();
        config.product_name = Some("l8git Native Submodule Acceptance".into());
        config.build.dev_url = None;
        config.app.windows.clear();
        // All remote origins are excluded, including avatars, updater and fonts.
        let csp = "default-src 'self' tauri:; script-src 'self' tauri: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' tauri:; img-src 'self' tauri: data: blob:; connect-src 'self' tauri: ipc: http://ipc.localhost; worker-src 'self' tauri: blob:; object-src 'none'";
        config.app.security.csp = Some(Csp::Policy(csp.into()));
        config.app.security.dev_csp = Some(Csp::Policy(csp.into()));
        context.set_assets(Box::new(BuiltFrontend(assets)));

        // Real Tauri command macros and product implementations, without the
        // production plugins, credentials, agents, watchers or update handlers.
        let git_ipc: fn(Invoke<Wry>) -> bool = tauri::generate_handler![
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
        let app = tauri::Builder::default()
            .invoke_handler(move |invoke: Invoke<Wry>| {
                let InvokeBody::Json(body) = invoke.message.payload() else {
                    invoke.resolver.reject("Acceptance requires JSON IPC");
                    return true;
                };
                if invoke.message.command() == "native_acceptance_result" {
                    let passed = body["ok"] == true;
                    println!("NATIVE_SUBMODULE_RESULT {body}");
                    let app = invoke.message.webview_ref().app_handle().clone();
                    invoke.resolver.resolve(());
                    app.exit(if passed { 0 } else { 1 });
                    return true;
                }
                match body["path"].as_str() {
                    Some(path) if path == parent || path == child => git_ipc(invoke),
                    _ => {
                        invoke.resolver.reject("IPC outside the fixture scope");
                        true
                    }
                }
            })
            .setup(move |app| {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("l8git Native Submodule Acceptance")
                    .inner_size(1180.0, 760.0)
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
