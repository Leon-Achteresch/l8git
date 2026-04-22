use std::io::{Read, Write};
use std::process::Stdio;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::cmd::git_command;

#[derive(Serialize)]
pub struct GitAccount {
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
    let mut cmd = git_command();
    if forbid_interactive {
        cmd.arg("-c")
            .arg("credential.interactive=never")
            .env("GCM_INTERACTIVE", "Never")
            .env("GIT_ASKPASS", "echo")
            .env("SSH_ASKPASS", "echo");
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

pub struct HttpsCredential {
    pub username: Option<String>,
    pub password: String,
}

pub fn read_https_credential(host: &str) -> Result<HttpsCredential, String> {
    let h = host.trim();
    if h.is_empty() {
        return Err("Host darf nicht leer sein".into());
    }
    let input = format!("protocol=https\nhost={h}\n\n");
    let out = git_credential("fill", &input, true, Duration::from_secs(25))?;
    let mut username = None;
    let mut password = None;
    for line in out.lines() {
        if let Some(u) = line.strip_prefix("username=") {
            if !u.is_empty() {
                username = Some(u.to_string());
            }
        } else if let Some(p) = line.strip_prefix("password=") {
            if !p.is_empty() {
                password = Some(p.to_string());
            }
        }
    }
    let password = password.ok_or_else(|| {
        format!(
            "Keine Zugangsdaten für {h}. Bitte unter Einstellungen bei {h} anmelden."
        )
    })?;
    Ok(HttpsCredential { username, password })
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
pub fn list_git_accounts() -> Vec<GitAccount> {
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
pub fn probe_git_account(id: String, name: String, host: String) -> GitAccount {
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
pub fn git_sign_in(host: String, username: String, token: String) -> Result<(), String> {
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
pub fn git_sign_in_via_credential_manager(host: String) -> Result<(), String> {
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
pub fn git_sign_out(host: String, username: Option<String>) -> Result<(), String> {
    let mut input = format!("protocol=https\nhost={host}\n");
    if let Some(u) = username.filter(|u| !u.is_empty()) {
        input.push_str(&format!("username={u}\n"));
    }
    input.push('\n');
    git_credential("reject", &input, true, Duration::from_secs(45))?;
    Ok(())
}

#[tauri::command]
pub fn git_credential_helper() -> Option<String> {
    let out = git_command()
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
