use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

use crate::cmd::cli_command;
use crate::shell::resolve_cli_path;

const ALLOWED_COMMANDS: [&str; 7] = [
    "models",
    "status",
    "about",
    "create-chat",
    "mcp",
    "plugin",
    "update",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorSessionSummary {
    id: String,
    path: String,
    title: String,
    preview: String,
    created_at: u64,
    updated_at: u64,
}

pub fn cursor_executable() -> Result<PathBuf, String> {
    resolve_cli_path("cursor-agent")
        .or_else(|| resolve_cli_path("agent"))
        .ok_or_else(|| "Cursor CLI wurde nicht gefunden.".to_string())
}

fn chats_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".cursor").join("chats"))
        .ok_or_else(|| "Cursor-Chatverzeichnis konnte nicht bestimmt werden.".into())
}

fn valid_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn millis_to_seconds(value: Option<&Value>) -> u64 {
    value
        .and_then(Value::as_u64)
        .map(|millis| millis / 1_000)
        .unwrap_or(0)
}

fn first_prompt(directory: &Path) -> String {
    let Ok(contents) = fs::read_to_string(directory.join("prompt_history.json")) else {
        return String::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&contents) else {
        return String::new();
    };
    let entries = value
        .as_array()
        .cloned()
        .or_else(|| value.get("prompts").and_then(Value::as_array).cloned())
        .unwrap_or_default();
    entries
        .iter()
        .find_map(|entry| match entry {
            Value::String(text) => Some(text.clone()),
            Value::Object(_) => entry
                .get("text")
                .or_else(|| entry.get("prompt"))
                .and_then(Value::as_str)
                .map(str::to_string),
            _ => None,
        })
        .map(|text| text.trim().replace('\n', " "))
        .unwrap_or_default()
}

fn summarize_chat(directory: &Path, paths: &[String]) -> Option<CursorSessionSummary> {
    let id = directory.file_name()?.to_str()?.to_string();
    if !valid_session_id(&id) {
        return None;
    }
    let meta: Value = serde_json::from_str(&fs::read_to_string(directory.join("meta.json")).ok()?).ok()?;
    let cwd = meta.get("cwd").and_then(Value::as_str)?.to_string();
    if !paths.is_empty() && !paths.iter().any(|candidate| candidate == &cwd) {
        return None;
    }
    if meta.get("hasConversation").and_then(Value::as_bool) == Some(false) {
        return None;
    }
    let prompt = first_prompt(directory);
    let title = meta
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| {
            if prompt.is_empty() {
                "Cursor-Unterhaltung".to_string()
            } else {
                prompt.chars().take(80).collect()
            }
        });
    Some(CursorSessionSummary {
        id,
        path: cwd,
        title,
        preview: prompt,
        created_at: millis_to_seconds(meta.get("createdAtMs")),
        updated_at: millis_to_seconds(meta.get("updatedAtMs")),
    })
}

#[tauri::command]
pub async fn cursor_list_sessions(paths: Vec<String>) -> Result<Vec<CursorSessionSummary>, String> {
    tokio::task::spawn_blocking(move || {
        let chats = chats_dir()?;
        if !chats.is_dir() {
            return Ok(Vec::new());
        }
        let mut sessions = Vec::new();
        for workspace in fs::read_dir(chats).map_err(|error| error.to_string())?.flatten() {
            if !workspace.path().is_dir() {
                continue;
            }
            for chat in fs::read_dir(workspace.path()).into_iter().flatten().flatten() {
                if !chat.path().is_dir() {
                    continue;
                }
                if let Some(summary) = summarize_chat(&chat.path(), &paths) {
                    sessions.push(summary);
                }
            }
        }
        sessions.sort_unstable_by(|a, b| b.updated_at.cmp(&a.updated_at));
        sessions.truncate(500);
        Ok(sessions)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn chat_directory(session_id: &str) -> Result<PathBuf, String> {
    if !valid_session_id(session_id) {
        return Err("Ungültige Cursor-Session-ID.".into());
    }
    let chats = chats_dir()?;
    for workspace in fs::read_dir(chats).map_err(|error| error.to_string())?.flatten() {
        let candidate = workspace.path().join(session_id);
        if candidate.join("meta.json").is_file() {
            return Ok(candidate);
        }
    }
    Err("Cursor-Unterhaltung wurde nicht gefunden.".into())
}

#[tauri::command]
pub async fn cursor_delete_session(session_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let directory = chat_directory(&session_id)?;
        let trash = dirs::home_dir()
            .ok_or_else(|| "Home-Verzeichnis wurde nicht gefunden.".to_string())?
            .join(".cursor")
            .join("l8git-trash");
        fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_secs())
            .unwrap_or(0);
        fs::rename(directory, trash.join(format!("{stamp}-{session_id}")))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn cursor_rename_session(session_id: String, title: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let title = title.trim().to_string();
        if title.is_empty() || title.len() > 300 || title.chars().any(char::is_control) {
            return Err("Ungültiger Cursor-Unterhaltungstitel.".into());
        }
        let meta_path = chat_directory(&session_id)?.join("meta.json");
        let mut meta: Value = serde_json::from_str(
            &fs::read_to_string(&meta_path).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        let Some(object) = meta.as_object_mut() else {
            return Err("Cursor-Metadaten sind ungültig.".into());
        };
        object.insert("title".into(), Value::String(title));
        fs::write(
            &meta_path,
            serde_json::to_vec(&meta).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Cursor stores its hooks in the same shape Claude Code uses, so the parser
/// is shared. Only the file locations differ.
#[tauri::command]
pub async fn cursor_list_hooks(path: String) -> Result<Vec<crate::claude::ClaudeHook>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Cursor-Arbeitsverzeichnis existiert nicht.".into());
        }
        let mut hooks = Vec::new();
        if let Some(home) = dirs::home_dir() {
            crate::claude::hooks_from_file(&home.join(".cursor").join("hooks.json"), "user", &mut hooks);
        }
        crate::claude::hooks_from_file(&repo.join(".cursor").join("hooks.json"), "project", &mut hooks);
        Ok(hooks)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Runs one of the non-interactive Cursor subcommands and returns stdout.
/// The allowlist keeps this away from `agent`/`login`, which need a TTY.
#[tauri::command]
pub async fn cursor_cli(args: Vec<String>, cwd: Option<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let Some(first) = args.first() else {
            return Err("Cursor-Befehl fehlt.".into());
        };
        if !ALLOWED_COMMANDS.contains(&first.as_str()) {
            return Err(format!("Cursor-Befehl ist nicht erlaubt: {first}"));
        }
        if args.iter().any(|argument| {
            argument.len() > 256 || argument.chars().any(char::is_control)
        }) {
            return Err("Ungültiges Argument für die Cursor CLI.".into());
        }
        let mut command = cli_command(cursor_executable()?);
        command.args(&args).stdin(Stdio::null());
        if let Some(cwd) = cwd.as_deref() {
            if !Path::new(cwd).is_dir() {
                return Err("Cursor-Arbeitsverzeichnis existiert nicht.".into());
            }
            command.current_dir(cwd);
        }
        let output = command.output().map_err(|error| error.to_string())?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if message.is_empty() {
                format!("Cursor CLI ist fehlgeschlagen: {first}")
            } else {
                message
            });
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{summarize_chat, valid_session_id, ALLOWED_COMMANDS};
    use std::fs;

    #[test]
    fn rejects_unsafe_session_ids() {
        assert!(valid_session_id("070e9764-d2ca-4466-bd7e-a68e8d96e090"));
        assert!(!valid_session_id("../escape"));
        assert!(!valid_session_id(""));
    }

    #[test]
    fn keeps_interactive_commands_out_of_the_allowlist() {
        assert!(!ALLOWED_COMMANDS.contains(&"login"));
        assert!(!ALLOWED_COMMANDS.contains(&"ls"));
        assert!(ALLOWED_COMMANDS.contains(&"models"));
    }

    #[test]
    fn summarizes_chat_metadata_and_filters_by_cwd() {
        let base = std::env::temp_dir().join(format!(
            "l8git-cursor-test-{}",
            std::process::id()
        ));
        let chat = base.join("aaaa-bbbb-cccc");
        fs::create_dir_all(&chat).unwrap();
        fs::write(
            chat.join("meta.json"),
            r#"{"cwd":"/repo","createdAtMs":2000,"updatedAtMs":5000,"hasConversation":true}"#,
        )
        .unwrap();
        fs::write(chat.join("prompt_history.json"), r#"["Fix the parser"]"#).unwrap();

        let summary = summarize_chat(&chat, &["/repo".to_string()]).unwrap();
        assert_eq!(summary.title, "Fix the parser");
        assert_eq!(summary.created_at, 2);
        assert_eq!(summary.updated_at, 5);
        assert!(summarize_chat(&chat, &["/other".to_string()]).is_none());
        fs::remove_dir_all(base).ok();
    }
}
