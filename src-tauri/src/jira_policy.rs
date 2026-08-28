//! Gating policy for the Jira tools, shared between the app and the stdio MCP
//! server it spawns for Codex, OpenCode and Cursor.
//!
//! The in-process server used by Claude Code reads the policy straight from the
//! frontend store. The other three CLIs talk to a separate process, which has
//! no access to that store — so the UI mirrors the same decisions into a small
//! JSON file that the child re-reads on every call. Re-reading (rather than
//! taking the policy as a spawn argument) is what makes pinning or unpinning a
//! ticket take effect immediately in a session that is already running.
//!
//! Tickets are pinned per conversation, but the child is spawned per
//! repository — Codex and Cursor never tell it which chat is asking. So the
//! file also records which conversation each repository currently has open,
//! and the child resolves repository → conversation → keys. A background
//! conversation therefore reads the tickets of the one on screen; that is a
//! deliberate limit of those two CLIs, not of the gate. Claude Code and
//! OpenCode are unaffected, because they are handed the conversation directly.
//!
//! The file holds no secrets: only switches, the active conversation and issue
//! keys. The credential stays in the OS keychain, which the child opens itself.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const POLICY_VERSION: u32 = 2;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraPolicy {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub allow_search: bool,
    #[serde(default)]
    pub allow_comments: bool,
    /// Repository path → the conversation it currently has open.
    #[serde(default)]
    pub active_thread_by_path: BTreeMap<String, String>,
    /// `provider:threadId` → the issue keys pinned to that conversation.
    #[serde(default)]
    pub keys_by_thread: BTreeMap<String, Vec<String>>,
}

impl JiraPolicy {
    /// The conversation a repository currently has open, if any.
    pub fn thread_for(&self, repo: &str) -> Option<&str> {
        self.active_thread_by_path.get(repo).map(String::as_str)
    }

    pub fn keys_for_thread(&self, thread: &str) -> &[String] {
        self.keys_by_thread.get(thread).map(Vec::as_slice).unwrap_or(&[])
    }

    /// Keys reachable from a repository: those of the conversation it has open.
    pub fn keys_for(&self, repo: &str) -> &[String] {
        self.thread_for(repo).map(|thread| self.keys_for_thread(thread)).unwrap_or(&[])
    }

    /// True while this repository could reach a ticket right now. Used by the
    /// UI and by tests — deliberately *not* by `tools_for`, because the CLI
    /// asks for the tool list once per session and a list that depended on the
    /// pinned set could never catch up with a ticket linked later.
    pub fn offers_tools(&self, repo: &str) -> bool {
        self.enabled && (self.allow_search || !self.keys_for(repo).is_empty())
    }

    /// Mirrors `resolveIssueKeyArg`: without search permission the agent may
    /// only reach the keys the user pinned to this repository.
    pub fn allows_key(&self, repo: &str, key: &str) -> bool {
        if !self.enabled {
            return false;
        }
        self.allow_search || self.keys_for(repo).iter().any(|pinned| pinned == key)
    }
}

pub fn policy_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .ok_or_else(|| "Kein Konfigurationsverzeichnis gefunden.".to_string())?;
    Ok(base.join("l8git").join("jira-policy.json"))
}

/// A missing or unreadable policy reads as "everything closed" — the tool
/// surface must fail shut, never open.
pub fn load_policy() -> JiraPolicy {
    policy_path()
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<JiraPolicy>(&raw).ok())
        .map(normalize_policy)
        .unwrap_or_default()
}

/// Drops anything that is not a well-formed issue key, so a hand-edited file
/// cannot widen the allow-list into a path segment.
pub fn normalize_policy(mut policy: JiraPolicy) -> JiraPolicy {
    policy.version = POLICY_VERSION;
    policy.keys_by_thread = policy
        .keys_by_thread
        .into_iter()
        .filter(|(thread, _)| !thread.is_empty())
        .map(|(thread, keys)| {
            let mut valid: Vec<String> = keys
                .iter()
                .filter_map(|key| crate::jira::validate_issue_key(key).ok())
                .collect();
            valid.sort();
            valid.dedup();
            (thread, valid)
        })
        .filter(|(_, keys)| !keys.is_empty())
        .collect();
    policy.active_thread_by_path = policy
        .active_thread_by_path
        .into_iter()
        .filter(|(path, thread)| !path.is_empty() && !thread.is_empty())
        .collect();
    policy
}

pub fn save_policy(policy: &JiraPolicy) -> Result<(), String> {
    let path = policy_path()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&normalize_policy(policy.clone()))
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn jira_write_policy(policy: JiraPolicy) -> Result<(), String> {
    tokio::task::spawn_blocking(move || save_policy(&policy))
        .await
        .map_err(|e| e.to_string())?
}

/// Path of the running executable, used to register the MCP server with the
/// CLIs that expect a command to spawn.
#[tauri::command]
pub fn jira_mcp_command() -> Result<Vec<String>, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Programmpfad konnte nicht bestimmt werden: {e}"))?;
    let exe = exe
        .to_str()
        .ok_or_else(|| "Programmpfad ist kein gültiges UTF-8.".to_string())?;
    Ok(vec![exe.to_string(), crate::jira_mcp::SUBCOMMAND.to_string()])
}

// ---------------------------------------------------------------------------
// Cursor CLI registration
// ---------------------------------------------------------------------------
//
// Cursor reads MCP servers only from `~/.cursor/mcp.json` (global) or
// `<repo>/.cursor/mcp.json` (project) — there is no per-invocation flag. The
// global file is the lesser evil: the project file would land inside the user's
// repository and show up in `git status`.
//
// This means the entry is visible to the user's own Cursor sessions too, not
// just to l8git's. That is why it is a separate, clearly labelled switch in the
// settings, and why disabling it removes the entry again instead of leaving it
// behind.

pub const CURSOR_SERVER_KEY: &str = "l8git-jira";

pub fn cursor_mcp_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".cursor").join("mcp.json"))
        .ok_or_else(|| "Kein Home-Verzeichnis gefunden.".to_string())
}

/// Merges (or removes) the l8git entry inside an existing `mcp.json`, leaving
/// every other server and every unknown field untouched. Returns `None` when
/// the file would end up unchanged, so a no-op never rewrites the user's file.
pub fn merge_cursor_mcp(
    existing: Option<&str>,
    entry: Option<&serde_json::Value>,
) -> Result<Option<String>, String> {
    let mut root = match existing {
        Some(raw) if !raw.trim().is_empty() => serde_json::from_str::<serde_json::Value>(raw)
            .map_err(|_| {
                "Cursor: ~/.cursor/mcp.json ist kein gültiges JSON — bitte manuell prüfen."
                    .to_string()
            })?,
        _ => serde_json::json!({}),
    };
    if !root.is_object() {
        return Err("Cursor: ~/.cursor/mcp.json enthält kein Objekt.".into());
    }
    let servers = root
        .as_object_mut()
        .expect("checked above")
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));
    if !servers.is_object() {
        return Err("Cursor: mcpServers in ~/.cursor/mcp.json ist kein Objekt.".into());
    }
    let servers = servers.as_object_mut().expect("checked above");
    let before = servers.get(CURSOR_SERVER_KEY).cloned();
    match entry {
        Some(entry) => {
            if before.as_ref() == Some(entry) {
                return Ok(None);
            }
            servers.insert(CURSOR_SERVER_KEY.to_string(), entry.clone());
        }
        None => {
            if before.is_none() {
                return Ok(None);
            }
            servers.remove(CURSOR_SERVER_KEY);
        }
    }
    Ok(Some(
        serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?,
    ))
}

pub fn cursor_mcp_entry(repo: &str) -> Result<serde_json::Value, String> {
    let command = jira_mcp_command()?;
    let (executable, subcommand) = command
        .split_first()
        .ok_or_else(|| "Programmpfad konnte nicht bestimmt werden.".to_string())?;
    let mut args: Vec<String> = subcommand.to_vec();
    if !repo.is_empty() {
        args.push("--repo".into());
        args.push(repo.to_string());
    }
    Ok(serde_json::json!({ "command": executable, "args": args }))
}

/// Writes or removes the Cursor entry. `repo` scopes the gate for the spawned
/// server; Cursor has one global config, so the most recently opened repository
/// wins — which is also the one the user is looking at.
#[tauri::command]
pub async fn jira_sync_cursor_mcp(enabled: bool, repo: String) -> Result<bool, String> {
    let entry = if enabled { Some(cursor_mcp_entry(&repo)?) } else { None };
    tokio::task::spawn_blocking(move || {
        let path = cursor_mcp_path()?;
        let existing = std::fs::read_to_string(&path).ok();
        let Some(next) = merge_cursor_mcp(existing.as_deref(), entry.as_ref())? else {
            return Ok(false);
        };
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, next).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}
