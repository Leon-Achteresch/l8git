use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Serialize)]
struct Commit {
    hash: String,
    short_hash: String,
    author: String,
    email: String,
    date: String,
    subject: String,
    parents: Vec<String>,
}

#[derive(Serialize)]
struct Branch {
    name: String,
    is_current: bool,
    is_remote: bool,
}

#[derive(Serialize)]
struct RepoInfo {
    path: String,
    branch: String,
    commits: Vec<Commit>,
    branches: Vec<Branch>,
}

fn run_git(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn open_repo(path: String) -> Result<RepoInfo, String> {
    let repo = PathBuf::from(&path);

    run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
        .map_err(|_| format!("'{path}' is not a git repository"))?;

    let branch = run_git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "HEAD".into());

    // Use an uncommon separator so commit subjects don't collide.
    let sep = "\x1f";
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s");

    let log = run_git(
        &repo,
        &[
            "log",
            "--max-count=200",
            "--all",
            "--date-order",
            &format!("--pretty=format:{format}"),
        ],
    )?;

    let commits = log
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(7, sep);
            let hash = parts.next()?.to_string();
            let short_hash = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let email = parts.next()?.to_string();
            let date = parts.next()?.to_string();
            let parents_str = parts.next()?;
            let subject = parts.next()?.to_string();
            let parents = parents_str
                .split_whitespace()
                .map(|s| s.to_string())
                .collect();
            Some(Commit {
                hash,
                short_hash,
                author,
                email,
                date,
                subject,
                parents,
            })
        })
        .collect();

    let branches = list_branches(&repo).unwrap_or_default();

    Ok(RepoInfo {
        path: repo.to_string_lossy().to_string(),
        branch,
        commits,
        branches,
    })
}

#[derive(Serialize)]
struct GitAccount {
    id: String,
    name: String,
    host: String,
    username: Option<String>,
    signed_in: bool,
    builtin: bool,
}

const BUILTIN_PROVIDERS: &[(&str, &str, &str)] = &[
    ("github", "GitHub", "github.com"),
    ("gitlab", "GitLab", "gitlab.com"),
    ("bitbucket", "Bitbucket", "bitbucket.org"),
    ("azure", "Azure DevOps", "dev.azure.com"),
];

fn git_credential(
    action: &str,
    input: &str,
    forbid_interactive: bool,
    max_wait: Duration,
) -> Result<String, String> {
    let mut cmd = Command::new("git");
    if forbid_interactive {
        cmd.arg("-c")
            .arg("credential.interactive=false")
            .env("GCM_INTERACTIVE", "false");
    }
    let mut child = cmd
        .args(["credential", action])
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| format!("failed to write credential input: {e}"))?;
    }

    let deadline = Instant::now() + max_wait;
    loop {
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "Git Credential: Zeitüberschreitung oder Fenster geschlossen bevor die Anmeldung fertig war."
                    .into(),
            );
        }
        match child
            .try_wait()
            .map_err(|e| format!("Git Credential: {e}"))?
        {
            Some(status) => {
                let mut stdout_buf = Vec::new();
                let mut stderr_buf = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    let _ = out.read_to_end(&mut stdout_buf);
                }
                if let Some(mut err) = child.stderr.take() {
                    let _ = err.read_to_end(&mut stderr_buf);
                }
                if !status.success() {
                    let msg = String::from_utf8_lossy(&stderr_buf).trim().to_string();
                    if msg.is_empty() {
                        return Err(
                            "Git Credential abgebrochen (z. B. Credential-Manager geschlossen)."
                                .into(),
                        );
                    }
                    return Err(msg);
                }
                return Ok(String::from_utf8_lossy(&stdout_buf).to_string());
            }
            None => thread::sleep(Duration::from_millis(80)),
        }
    }
}

fn credential_lookup(host: &str) -> Option<String> {
    let input = format!("protocol=https\nhost={host}\n\n");
    let out = git_credential("fill", &input, true, Duration::from_secs(25))
        .ok()?;
    let mut username = None;
    let mut has_password = false;
    for line in out.lines() {
        if let Some(u) = line.strip_prefix("username=") {
            username = Some(u.to_string());
        } else if line.starts_with("password=") {
            has_password = true;
        }
    }
    if has_password {
        Some(username.unwrap_or_default())
    } else {
        None
    }
}

#[tauri::command]
fn list_git_accounts() -> Vec<GitAccount> {
    let handles: Vec<_> = BUILTIN_PROVIDERS
        .iter()
        .enumerate()
        .map(|(i, (id, name, host))| {
            let id = id.to_string();
            let name = name.to_string();
            let host = host.to_string();
            thread::spawn(move || {
                let username = credential_lookup(&host);
                (
                    i,
                    GitAccount {
                        id,
                        name,
                        host,
                        signed_in: username.is_some(),
                        username,
                        builtin: true,
                    },
                )
            })
        })
        .collect();
    let mut pairs: Vec<(usize, GitAccount)> = handles
        .into_iter()
        .map(|h| h.join().expect("credential lookup thread"))
        .collect();
    pairs.sort_by_key(|(i, _)| *i);
    pairs.into_iter().map(|(_, a)| a).collect()
}

#[tauri::command]
fn probe_git_account(id: String, name: String, host: String) -> GitAccount {
    let username = credential_lookup(&host);
    GitAccount {
        id,
        name,
        host,
        signed_in: username.is_some(),
        username,
        builtin: false,
    }
}

#[tauri::command]
fn git_sign_in(host: String, username: String, token: String) -> Result<(), String> {
    let host = host.trim();
    if host.is_empty() {
        return Err("Host darf nicht leer sein".into());
    }
    if username.trim().is_empty() {
        return Err("Benutzername darf nicht leer sein".into());
    }
    if token.is_empty() {
        return Err("Token darf nicht leer sein".into());
    }
    let input = format!("protocol=https\nhost={host}\nusername={username}\npassword={token}\n\n");
    git_credential("approve", &input, true, Duration::from_secs(45))?;
    Ok(())
}

#[tauri::command]
fn git_sign_in_via_credential_manager(host: String) -> Result<(), String> {
    let host = host.trim();
    if host.is_empty() {
        return Err("Host darf nicht leer sein".into());
    }
    let input = format!("protocol=https\nhost={host}\n\n");
    let filled = git_credential(
        "fill",
        &input,
        false,
        Duration::from_secs(180),
    )?;
    let mut has_password = false;
    for line in filled.lines() {
        if line.starts_with("password=") && line.len() > "password=".len() {
            has_password = true;
            break;
        }
    }
    if !has_password {
        return Err(
            "Keine Zugangsdaten erhalten. Bitte Anmeldung im Credential Manager abschließen oder abbrechen."
                .into(),
        );
    }
    git_credential("approve", &filled, true, Duration::from_secs(45))?;
    Ok(())
}

#[tauri::command]
fn git_sign_out(host: String, username: Option<String>) -> Result<(), String> {
    let mut input = format!("protocol=https\nhost={host}\n");
    if let Some(u) = username.filter(|u| !u.is_empty()) {
        input.push_str(&format!("username={u}\n"));
    }
    input.push('\n');
    git_credential("reject", &input, true, Duration::from_secs(45))?;
    Ok(())
}

#[tauri::command]
fn git_credential_helper() -> Option<String> {
    let out = Command::new("git")
        .args(["config", "--get", "credential.helper"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn encode_image_data_url(bytes: &[u8], mime: &str) -> String {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{mime};base64,{b64}")
}

fn mime_for_path(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "image/x-icon",
    }
}

fn parse_size_value(s: &str) -> u32 {
    s.split_whitespace()
        .filter_map(|token| {
            if token.eq_ignore_ascii_case("any") {
                return Some(u32::MAX);
            }
            let (w, _) = token.split_once(|c: char| c == 'x' || c == 'X')?;
            w.parse::<u32>().ok()
        })
        .max()
        .unwrap_or(0)
}

fn favicon_from_manifest(manifest_path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(manifest_path).ok()?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let icons = json.get("icons")?.as_array()?;

    let mut best: Option<(u32, String, Option<String>)> = None;
    for icon in icons {
        let src = icon.get("src").and_then(|v| v.as_str())?.to_string();
        let size = icon
            .get("sizes")
            .and_then(|v| v.as_str())
            .map(parse_size_value)
            .unwrap_or(0);
        let icon_type = icon
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if best.as_ref().map(|(s, _, _)| size > *s).unwrap_or(true) {
            best = Some((size, src, icon_type));
        }
    }

    let (_, src, icon_type) = best?;
    let base_dir = manifest_path.parent()?;
    let trimmed = src.trim_start_matches('/');
    let icon_path = base_dir.join(trimmed);
    let icon_bytes = std::fs::read(&icon_path).ok()?;
    if icon_bytes.is_empty() {
        return None;
    }
    let path_mime = mime_for_path(&icon_path);
    let mime = if path_mime != "image/x-icon" {
        path_mime.to_string()
    } else {
        icon_type
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| path_mime.to_string())
    };
    Some(encode_image_data_url(&icon_bytes, &mime))
}

#[tauri::command]
fn read_repo_favicon(path: String) -> Option<String> {
    let root = PathBuf::from(&path);
    let favicon_candidates = [
        "favicon.ico",
        "public/favicon.ico",
        "static/favicon.ico",
        "src/favicon.ico",
        "assets/favicon.ico",
        "app/favicon.ico",
    ];

    for rel in favicon_candidates {
        let p = root.join(rel);
        if let Ok(bytes) = std::fs::read(&p) {
            if !bytes.is_empty() {
                return Some(encode_image_data_url(&bytes, "image/x-icon"));
            }
        }
    }

    let manifest_candidates = [
        "manifest.json",
        "manifest.webmanifest",
        "public/manifest.json",
        "public/manifest.webmanifest",
        "static/manifest.json",
        "static/manifest.webmanifest",
        "src/manifest.json",
        "src/manifest.webmanifest",
        "app/manifest.json",
        "app/manifest.webmanifest",
        "assets/manifest.json",
        "assets/manifest.webmanifest",
    ];

    for rel in manifest_candidates {
        let p = root.join(rel);
        if let Some(icon) = favicon_from_manifest(&p) {
            return Some(icon);
        }
    }

    let expo_candidates = ["app.json", "app.config.json"];
    for rel in expo_candidates {
        let p = root.join(rel);
        if let Some(icon) = favicon_from_expo_config(&p) {
            return Some(icon);
        }
    }

    None
}

fn favicon_from_expo_config(config_path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(config_path).ok()?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let expo = json.get("expo").unwrap_or(&json);

    let candidates = [
        expo.pointer("/web/favicon").and_then(|v| v.as_str()),
        expo.pointer("/icon").and_then(|v| v.as_str()),
        expo.pointer("/ios/icon").and_then(|v| v.as_str()),
        expo.pointer("/android/icon").and_then(|v| v.as_str()),
        expo.pointer("/android/adaptiveIcon/foregroundImage")
            .and_then(|v| v.as_str()),
    ];

    let base_dir = config_path.parent()?;
    for rel in candidates.into_iter().flatten() {
        let icon_path = base_dir.join(rel.trim_start_matches("./").trim_start_matches('/'));
        let Ok(icon_bytes) = std::fs::read(&icon_path) else {
            continue;
        };
        if icon_bytes.is_empty() {
            continue;
        }
        let mime = mime_for_path(&icon_path);
        return Some(encode_image_data_url(&icon_bytes, mime));
    }
    None
}

#[tauri::command]
fn delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    let repo = PathBuf::from(&path);
    let flag = if force { "-D" } else { "-d" };
    run_git(&repo, &["branch", flag, &name])?;
    Ok(())
}

fn list_branches(repo: &PathBuf) -> Result<Vec<Branch>, String> {
    let sep = "\x1f";
    let format = format!("%(HEAD){sep}%(refname)");
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            &format!("--format={format}"),
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    let branches = out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, sep);
            let head = parts.next()?;
            let refname = parts.next()?;
            let is_current = head.trim() == "*";

            let (name, is_remote) = if let Some(rest) = refname.strip_prefix("refs/heads/") {
                (rest.to_string(), false)
            } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
                if rest.ends_with("/HEAD") {
                    return None;
                }
                (rest.to_string(), true)
            } else {
                return None;
            };

            Some(Branch {
                name,
                is_current,
                is_remote,
            })
        })
        .collect();

    Ok(branches)
}

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
            open_repo,
            read_repo_favicon,
            delete_branch,
            list_git_accounts,
            probe_git_account,
            git_sign_in,
            git_sign_in_via_credential_manager,
            git_sign_out,
            git_credential_helper
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
