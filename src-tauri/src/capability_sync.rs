//! Capability-Sync: Skills, Slash-Commands, Subagents, MCP-Server und Hooks
//! zwischen den installierten Agent-CLIs inventarisieren, kopieren, löschen
//! und abgleichen.
//!
//! Jede CLI legt ihre Capabilities an einer anderen Stelle und teilweise in
//! einem anderen Format ab. Dieses Modul beschreibt das Layout pro CLI
//! deklarativ (`CliLayout`) und übersetzt beim Kopieren zwischen den
//! Formaten – Dateien werden kopiert, MCP-Server werden in das Zielformat
//! (JSON, OpenCode-JSON oder Codex-TOML) übersetzt.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

const MAX_ITEMS_PER_KIND: usize = 1_000;
const MAX_SCAN_DEPTH: usize = 5;
const MAX_COPY_FILES: usize = 400;
const MAX_COPY_BYTES: u64 = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Layout-Beschreibung der CLIs
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum McpFormat {
    /// `{ "mcpServers": { name: { command, args, env, url, headers } } }`
    JsonServers,
    /// `{ "mcp": { name: { type, command: [..], environment, url, enabled } } }`
    OpenCodeJson,
    /// `[mcp_servers.name]` Blöcke in einer TOML-Datei
    CodexToml,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum HookFormat {
    /// `{ "hooks": { "PreToolUse": [ { matcher, hooks: [..] } ] } }`
    ClaudeSettings,
}

pub(crate) struct CliLayout {
    pub id: &'static str,
    pub label: &'static str,
    pub command: &'static str,
    /// Verzeichnis im Home-Ordner (User-Ebene)
    pub user_rel: &'static str,
    /// Verzeichnis im Repository (Projekt-Ebene)
    pub repo_rel: &'static str,
    /// Verzeichnisname unterhalb von `/etc` (Linux/BSD, globale Ebene)
    pub global_unix: &'static str,
    /// Verzeichnisname unter macOS bzw. Windows (globale Ebene)
    pub global_named: &'static str,
    pub skills_dir: Option<&'static str>,
    pub commands_dir: Option<&'static str>,
    pub agents_dir: Option<&'static str>,
    /// (Format, Pfad ab Home, Pfad ab Repository, Dateiname ab globalem Ordner)
    pub mcp: Option<(McpFormat, &'static str, &'static str, &'static str)>,
    pub hooks: Option<(HookFormat, &'static str, &'static str, &'static str)>,
}

pub(crate) const LAYOUTS: &[CliLayout] = &[
    CliLayout {
        id: "claude",
        label: "Claude Code",
        command: "claude",
        user_rel: ".claude",
        repo_rel: ".claude",
        global_unix: "claude-code",
        global_named: "ClaudeCode",
        skills_dir: Some("skills"),
        commands_dir: Some("commands"),
        agents_dir: Some("agents"),
        mcp: Some((
            McpFormat::JsonServers,
            ".claude.json",
            ".mcp.json",
            "managed-settings.json",
        )),
        hooks: Some((
            HookFormat::ClaudeSettings,
            ".claude/settings.json",
            ".claude/settings.json",
            "managed-settings.json",
        )),
    },
    CliLayout {
        id: "codex",
        label: "Codex",
        command: "codex",
        user_rel: ".codex",
        repo_rel: ".codex",
        global_unix: "codex",
        global_named: "Codex",
        skills_dir: Some("skills"),
        commands_dir: Some("prompts"),
        agents_dir: Some("agents"),
        mcp: Some((
            McpFormat::CodexToml,
            ".codex/config.toml",
            ".codex/config.toml",
            "config.toml",
        )),
        hooks: None,
    },
    CliLayout {
        id: "opencode",
        label: "OpenCode",
        command: "opencode",
        user_rel: ".config/opencode",
        repo_rel: ".opencode",
        global_unix: "opencode",
        global_named: "OpenCode",
        skills_dir: Some("skill"),
        commands_dir: Some("command"),
        agents_dir: Some("agent"),
        mcp: Some((
            McpFormat::OpenCodeJson,
            ".config/opencode/opencode.json",
            "opencode.json",
            "opencode.json",
        )),
        hooks: None,
    },
    CliLayout {
        id: "cursor",
        label: "Cursor CLI",
        command: "cursor-agent",
        user_rel: ".cursor",
        repo_rel: ".cursor",
        global_unix: "cursor",
        global_named: "Cursor",
        skills_dir: Some("skills"),
        commands_dir: Some("commands"),
        agents_dir: Some("rules"),
        mcp: Some((
            McpFormat::JsonServers,
            ".cursor/mcp.json",
            ".cursor/mcp.json",
            "mcp.json",
        )),
        hooks: None,
    },
    CliLayout {
        id: "gemini",
        label: "Gemini CLI",
        command: "gemini",
        user_rel: ".gemini",
        repo_rel: ".gemini",
        global_unix: "gemini",
        global_named: "Gemini",
        skills_dir: None,
        commands_dir: Some("commands"),
        agents_dir: None,
        mcp: Some((
            McpFormat::JsonServers,
            ".gemini/settings.json",
            ".gemini/settings.json",
            "settings.json",
        )),
        hooks: None,
    },
    CliLayout {
        id: "copilot",
        label: "Copilot CLI",
        command: "copilot",
        user_rel: ".copilot",
        repo_rel: ".github",
        global_unix: "copilot",
        global_named: "Copilot",
        skills_dir: None,
        commands_dir: Some("prompts"),
        agents_dir: None,
        mcp: Some((
            McpFormat::JsonServers,
            ".copilot/mcp-config.json",
            ".github/mcp-config.json",
            "mcp-config.json",
        )),
        hooks: None,
    },
];

pub(crate) fn layout(id: &str) -> Option<&'static CliLayout> {
    LAYOUTS.iter().find(|entry| entry.id == id)
}

fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

/// Basisordner für maschinenweite ("globale") Konfiguration.
fn global_base() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        Some(PathBuf::from("/Library/Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("ProgramData").map(PathBuf::from)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Some(PathBuf::from("/etc"))
    }
}

fn global_root(layout: &CliLayout) -> Option<PathBuf> {
    let name = if cfg!(any(target_os = "macos", target_os = "windows")) {
        layout.global_named
    } else {
        layout.global_unix
    };
    global_base().map(|base| base.join(name))
}

/// Wurzelverzeichnis einer CLI auf der gewünschten Ebene.
pub(crate) fn cli_root(layout: &CliLayout, scope: &str, repo: &Path) -> Option<PathBuf> {
    match scope {
        "user" => home().map(|home| home.join(layout.user_rel)),
        "repo" => Some(repo.join(layout.repo_rel)),
        "global" => global_root(layout),
        _ => None,
    }
}

/// Absoluter Pfad einer Konfigurationsdatei je Ebene.
fn config_path(
    layout: &CliLayout,
    scope: &str,
    repo: &Path,
    user_rel: &str,
    repo_rel: &str,
    global_rel: &str,
) -> Option<PathBuf> {
    match scope {
        "user" => home().map(|home| home.join(user_rel)),
        "repo" => Some(repo.join(repo_rel)),
        "global" => global_root(layout).map(|root| root.join(global_rel)),
        _ => None,
    }
}

pub(crate) const SCOPES: [&str; 3] = ["global", "user", "repo"];

/// Prüft, ob in diese Ebene geschrieben werden darf (globale Ordner brauchen
/// oft Administratorrechte).
fn writable_root(root: &Path) -> bool {
    if !root.is_dir() {
        return false;
    }
    let probe = root.join(".l8git-write-probe");
    match fs::write(&probe, b"") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

pub(crate) fn kind_dir(layout: &CliLayout, kind: &str) -> Option<&'static str> {
    match kind {
        "skill" => layout.skills_dir,
        "command" => layout.commands_dir,
        "agent" => layout.agents_dir,
        _ => None,
    }
}

pub(crate) fn supports_kind(layout: &CliLayout, kind: &str) -> bool {
    match kind {
        "skill" | "command" | "agent" => kind_dir(layout, kind).is_some(),
        "mcp" => layout.mcp.is_some(),
        "hook" => layout.hooks.is_some(),
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Datenmodelle
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityTargetInfo {
    pub cli: String,
    pub label: String,
    pub command: String,
    pub installed: bool,
    pub kinds: Vec<String>,
    /// Eine Zeile pro Ebene: global, user, repo
    pub scopes: Vec<CapabilityScopeInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityScopeInfo {
    pub scope: String,
    pub root: Option<String>,
    pub exists: bool,
    pub writable: bool,
    pub item_count: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityItem {
    pub id: String,
    pub cli: String,
    pub scope: String,
    pub kind: String,
    /// Anzeigename (Skill-Ordner, Command-Name, MCP-Server-Name, Hook-Event)
    pub name: String,
    /// Relativer Pfad innerhalb des Kind-Verzeichnisses bzw. Schlüssel in der Config
    pub rel: String,
    pub description: String,
    pub path: String,
    pub is_directory: bool,
    pub file_count: u32,
    pub size_bytes: u64,
    pub updated_at_ms: u64,
    /// Inhalts-Fingerabdruck für den Abgleich
    pub fingerprint: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityInventory {
    pub targets: Vec<CapabilityTargetInfo>,
    pub items: Vec<CapabilityItem>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityRef {
    pub cli: String,
    pub scope: String,
    pub kind: String,
    pub rel: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityTargetRef {
    pub cli: String,
    pub scope: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityOpResult {
    pub kind: String,
    pub name: String,
    pub source: String,
    pub target: String,
    pub status: String,
    pub message: String,
    pub path: Option<String>,
    pub backup: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityPlanEntry {
    pub kind: String,
    pub name: String,
    pub rel: String,
    pub source_cli: String,
    pub source_scope: String,
    pub target_cli: String,
    pub target_scope: String,
    /// `create` | `update` | `same` | `extra` | `unsupported`
    pub action: String,
    pub detail: String,
}

#[derive(Serialize, Clone, Deserialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpSpec {
    pub name: String,
    pub transport: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

fn fingerprint(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x1000_0000_01b3);
    }
    hash
}

fn fingerprint_hex(bytes: &[u8]) -> String {
    format!("{:016x}", fingerprint(bytes))
}

fn modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|delta| delta.as_millis() as u64)
        .unwrap_or(0)
}

fn stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|delta| delta.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

fn frontmatter_value(contents: &str, key: &str) -> Option<String> {
    let mut lines = contents.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    for line in lines {
        let line = line.trim();
        if line == "---" {
            break;
        }
        if let Some(value) = line.strip_prefix(&format!("{key}:")) {
            return Some(value.trim().trim_matches(['\'', '"']).to_string());
        }
    }
    None
}

fn first_paragraph(contents: &str) -> String {
    contents
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with("---"))
        .unwrap_or("")
        .chars()
        .take(220)
        .collect()
}

fn markdown_description(path: &Path) -> String {
    let contents = fs::read_to_string(path).unwrap_or_default();
    frontmatter_value(&contents, "description").unwrap_or_else(|| first_paragraph(&contents))
}

/// Verhindert, dass `rel` aus dem Zielverzeichnis ausbricht.
pub(crate) fn safe_relative(rel: &str) -> Result<PathBuf, String> {
    let trimmed = rel.trim().trim_matches(['/', '\\']);
    if trimmed.is_empty() {
        return Err("Leerer Pfad.".into());
    }
    let mut out = PathBuf::new();
    for part in trimmed.split(['/', '\\']) {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains(':') || part.chars().any(char::is_control) {
            return Err(format!("Unsicherer Pfad: {rel}"));
        }
        out.push(part);
    }
    if out.as_os_str().is_empty() {
        return Err("Leerer Pfad.".into());
    }
    Ok(out)
}

fn walk_files(root: &Path, base: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > MAX_SCAN_DEPTH || out.len() >= MAX_COPY_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(base) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            walk_files(root, &path, depth + 1, out);
        } else if meta.is_file() {
            out.push(path);
        }
        if out.len() >= MAX_COPY_FILES {
            return;
        }
    }
}

fn directory_stats(root: &Path) -> (u32, u64, String) {
    let mut files = Vec::new();
    walk_files(root, root, 0, &mut files);
    files.sort();
    let mut hash_input = Vec::new();
    let mut size = 0_u64;
    for file in &files {
        if let Ok(rel) = file.strip_prefix(root) {
            hash_input.extend_from_slice(rel.to_string_lossy().as_bytes());
        }
        if let Ok(bytes) = fs::read(file) {
            size += bytes.len() as u64;
            hash_input.extend_from_slice(&fingerprint(&bytes).to_be_bytes());
        }
    }
    (files.len() as u32, size, fingerprint_hex(&hash_input))
}

fn copy_directory(source: &Path, target: &Path) -> Result<u32, String> {
    let mut files = Vec::new();
    walk_files(source, source, 0, &mut files);
    if files.len() >= MAX_COPY_FILES {
        return Err(format!(
            "Zu viele Dateien ({}+). Bitte den Ordner manuell kopieren.",
            MAX_COPY_FILES
        ));
    }
    let mut total = 0_u64;
    for file in &files {
        total += fs::metadata(file).map(|meta| meta.len()).unwrap_or(0);
    }
    if total > MAX_COPY_BYTES {
        return Err("Der Ordner ist größer als 20 MB.".into());
    }
    for file in &files {
        let rel = file
            .strip_prefix(source)
            .map_err(|_| "Unerwarteter Pfad beim Kopieren.".to_string())?;
        let destination = target.join(rel);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::copy(file, &destination).map_err(|error| error.to_string())?;
    }
    Ok(files.len() as u32)
}

/// Sichert eine Konfigurationsdatei, bevor sie umgeschrieben wird – die
/// betroffenen Dateien (z. B. `~/.claude.json`) enthalten weit mehr als nur
/// MCP-Server oder Hooks.
fn backup_config(path: &Path) -> Result<Option<String>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("config");
    backup_existing(parent, path, &name)
}

fn backup_root(root: &Path) -> PathBuf {
    root.join(".l8git-backups")
}

pub(crate) fn backup_existing(root: &Path, target: &Path, name: &str) -> Result<Option<String>, String> {
    if !target.exists() {
        return Ok(None);
    }
    let directory = backup_root(root).join(format!("{name}-{}", stamp()));
    if let Some(parent) = directory.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if target.is_dir() {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        copy_directory(target, &directory)?;
    } else {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let file_name = target
            .file_name()
            .map(|name| name.to_os_string())
            .unwrap_or_else(|| std::ffi::OsString::from("backup"));
        fs::copy(target, directory.join(file_name)).map_err(|error| error.to_string())?;
    }
    Ok(Some(directory.to_string_lossy().into_owned()))
}

// ---------------------------------------------------------------------------
// MCP: lesen und schreiben je Zielformat
// ---------------------------------------------------------------------------

pub(crate) fn read_json_file(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if contents.trim().is_empty() {
        return Ok(Value::Object(Map::new()));
    }
    serde_json::from_str(&contents)
        .map_err(|error| format!("{} ist kein gültiges JSON: {error}", path.display()))
}

pub(crate) fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, format!("{serialized}\n")).map_err(|error| error.to_string())
}

fn string_map(value: Option<&Value>) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    if let Some(Value::Object(object)) = value {
        for (key, entry) in object {
            if let Some(text) = entry.as_str() {
                out.insert(key.clone(), text.to_string());
            }
        }
    }
    out
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

fn spec_from_json_servers(name: &str, config: &Value) -> McpSpec {
    let url = config
        .get("url")
        .or_else(|| config.get("serverUrl"))
        .and_then(Value::as_str)
        .map(str::to_string);
    McpSpec {
        name: name.to_string(),
        transport: if url.is_some() { "http".into() } else { "stdio".into() },
        command: config.get("command").and_then(Value::as_str).map(str::to_string),
        args: string_list(config.get("args")),
        env: string_map(config.get("env")),
        url,
        headers: string_map(config.get("headers")),
        enabled: config
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true),
    }
}

fn json_servers_from_spec(spec: &McpSpec) -> Value {
    let mut object = Map::new();
    if spec.transport == "http" {
        object.insert("type".into(), Value::String("http".into()));
        object.insert(
            "url".into(),
            Value::String(spec.url.clone().unwrap_or_default()),
        );
        if !spec.headers.is_empty() {
            object.insert(
                "headers".into(),
                Value::Object(
                    spec.headers
                        .iter()
                        .map(|(key, value)| (key.clone(), Value::String(value.clone())))
                        .collect(),
                ),
            );
        }
    } else {
        object.insert("type".into(), Value::String("stdio".into()));
        object.insert(
            "command".into(),
            Value::String(spec.command.clone().unwrap_or_default()),
        );
        if !spec.args.is_empty() {
            object.insert(
                "args".into(),
                Value::Array(spec.args.iter().map(|arg| Value::String(arg.clone())).collect()),
            );
        }
        if !spec.env.is_empty() {
            object.insert(
                "env".into(),
                Value::Object(
                    spec.env
                        .iter()
                        .map(|(key, value)| (key.clone(), Value::String(value.clone())))
                        .collect(),
                ),
            );
        }
    }
    if !spec.enabled {
        object.insert("enabled".into(), Value::Bool(false));
    }
    Value::Object(object)
}

fn spec_from_opencode(name: &str, config: &Value) -> McpSpec {
    let remote = config.get("type").and_then(Value::as_str) == Some("remote");
    let command_parts = string_list(config.get("command"));
    McpSpec {
        name: name.to_string(),
        transport: if remote { "http".into() } else { "stdio".into() },
        command: command_parts.first().cloned(),
        args: command_parts.into_iter().skip(1).collect(),
        env: string_map(config.get("environment")),
        url: config.get("url").and_then(Value::as_str).map(str::to_string),
        headers: string_map(config.get("headers")),
        enabled: config.get("enabled").and_then(Value::as_bool).unwrap_or(true),
    }
}

fn opencode_from_spec(spec: &McpSpec) -> Value {
    let mut object = Map::new();
    if spec.transport == "http" {
        object.insert("type".into(), Value::String("remote".into()));
        object.insert(
            "url".into(),
            Value::String(spec.url.clone().unwrap_or_default()),
        );
        if !spec.headers.is_empty() {
            object.insert(
                "headers".into(),
                Value::Object(
                    spec.headers
                        .iter()
                        .map(|(key, value)| (key.clone(), Value::String(value.clone())))
                        .collect(),
                ),
            );
        }
    } else {
        object.insert("type".into(), Value::String("local".into()));
        let mut parts = vec![Value::String(spec.command.clone().unwrap_or_default())];
        parts.extend(spec.args.iter().map(|arg| Value::String(arg.clone())));
        object.insert("command".into(), Value::Array(parts));
        if !spec.env.is_empty() {
            object.insert(
                "environment".into(),
                Value::Object(
                    spec.env
                        .iter()
                        .map(|(key, value)| (key.clone(), Value::String(value.clone())))
                        .collect(),
                ),
            );
        }
    }
    object.insert("enabled".into(), Value::Bool(spec.enabled));
    Value::Object(object)
}

// --- Minimaler TOML-Support für Codex ---------------------------------------

fn toml_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn toml_unescape(value: &str) -> String {
    value.replace("\\\"", "\"").replace("\\\\", "\\")
}

fn toml_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        return Some(toml_unescape(&trimmed[1..trimmed.len() - 1]));
    }
    if trimmed.len() >= 2 && trimmed.starts_with('\'') && trimmed.ends_with('\'') {
        return Some(trimmed[1..trimmed.len() - 1].to_string());
    }
    None
}

fn toml_string_array(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return Vec::new();
    }
    split_top_level(&trimmed[1..trimmed.len() - 1])
        .iter()
        .filter_map(|part| toml_string(part))
        .collect()
}

fn toml_inline_table(value: &str) -> BTreeMap<String, String> {
    let trimmed = value.trim();
    let mut out = BTreeMap::new();
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return out;
    }
    for part in split_top_level(&trimmed[1..trimmed.len() - 1]) {
        if let Some((key, raw)) = part.split_once('=') {
            if let Some(text) = toml_string(raw) {
                out.insert(key.trim().trim_matches('"').to_string(), text);
            }
        }
    }
    out
}

/// Trennt an Kommas auf oberster Ebene (Strings und Klammern werden beachtet).
fn split_top_level(input: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut depth = 0_i32;
    let mut in_string = false;
    let mut escaped = false;
    for character in input.chars() {
        if in_string {
            current.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }
        match character {
            '"' => {
                in_string = true;
                current.push(character);
            }
            '[' | '{' => {
                depth += 1;
                current.push(character);
            }
            ']' | '}' => {
                depth -= 1;
                current.push(character);
            }
            ',' if depth == 0 => {
                parts.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(character),
        }
    }
    if !current.trim().is_empty() {
        parts.push(current.trim().to_string());
    }
    parts
}

fn toml_section_name(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') || trimmed.starts_with("[[") {
        return None;
    }
    Some(trimmed[1..trimmed.len() - 1].trim().to_string())
}

fn codex_server_name(section: &str) -> Option<String> {
    let rest = section.strip_prefix("mcp_servers.")?;
    let name = rest.trim().trim_matches('"');
    if name.is_empty() || name.contains('.') {
        return None;
    }
    Some(name.to_string())
}

fn read_codex_mcp(path: &Path) -> Vec<McpSpec> {
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut specs = Vec::new();
    let mut current: Option<McpSpec> = None;
    for line in contents.lines() {
        if let Some(section) = toml_section_name(line) {
            if let Some(spec) = current.take() {
                specs.push(spec);
            }
            if let Some(name) = codex_server_name(&section) {
                current = Some(McpSpec {
                    name,
                    transport: "stdio".into(),
                    enabled: true,
                    ..McpSpec::default()
                });
            }
            continue;
        }
        let Some(spec) = current.as_mut() else {
            continue;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, raw)) = trimmed.split_once('=') else {
            continue;
        };
        match key.trim() {
            "command" => spec.command = toml_string(raw),
            "args" => spec.args = toml_string_array(raw),
            "env" => spec.env = toml_inline_table(raw),
            "url" => {
                spec.url = toml_string(raw);
                spec.transport = "http".into();
            }
            "http_headers" => spec.headers = toml_inline_table(raw),
            "enabled" => spec.enabled = raw.trim() != "false",
            _ => {}
        }
    }
    if let Some(spec) = current.take() {
        specs.push(spec);
    }
    specs
}

fn codex_block(spec: &McpSpec) -> String {
    let mut lines = vec![format!("[mcp_servers.{}]", spec.name)];
    if spec.transport == "http" {
        lines.push(format!(
            "url = \"{}\"",
            toml_escape(spec.url.as_deref().unwrap_or(""))
        ));
        if !spec.headers.is_empty() {
            let inline = spec
                .headers
                .iter()
                .map(|(key, value)| format!("{key} = \"{}\"", toml_escape(value)))
                .collect::<Vec<_>>()
                .join(", ");
            lines.push(format!("http_headers = {{ {inline} }}"));
        }
    } else {
        lines.push(format!(
            "command = \"{}\"",
            toml_escape(spec.command.as_deref().unwrap_or(""))
        ));
        if !spec.args.is_empty() {
            let inline = spec
                .args
                .iter()
                .map(|arg| format!("\"{}\"", toml_escape(arg)))
                .collect::<Vec<_>>()
                .join(", ");
            lines.push(format!("args = [{inline}]"));
        }
        if !spec.env.is_empty() {
            let inline = spec
                .env
                .iter()
                .map(|(key, value)| format!("{key} = \"{}\"", toml_escape(value)))
                .collect::<Vec<_>>()
                .join(", ");
            lines.push(format!("env = {{ {inline} }}"));
        }
    }
    if !spec.enabled {
        lines.push("enabled = false".into());
    }
    lines.join("\n")
}

/// Ersetzt oder entfernt einen `[mcp_servers.NAME]`-Block.
fn rewrite_codex_mcp(path: &Path, name: &str, block: Option<&str>) -> Result<(), String> {
    let contents = if path.exists() {
        fs::read_to_string(path).map_err(|error| error.to_string())?
    } else {
        String::new()
    };
    let mut output: Vec<String> = Vec::new();
    let mut skipping = false;
    let mut replaced = false;
    for line in contents.lines() {
        if let Some(section) = toml_section_name(line) {
            let matches = codex_server_name(&section).as_deref() == Some(name);
            if matches {
                skipping = true;
                if let Some(block) = block {
                    output.push(block.to_string());
                    replaced = true;
                }
                continue;
            }
            skipping = false;
        }
        if !skipping {
            output.push(line.to_string());
        }
    }
    if !replaced {
        if let Some(block) = block {
            while output.last().map(|line| line.trim().is_empty()).unwrap_or(false) {
                output.pop();
            }
            if !output.is_empty() {
                output.push(String::new());
            }
            output.push(block.to_string());
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut body = output.join("\n");
    if !body.ends_with('\n') {
        body.push('\n');
    }
    fs::write(path, body).map_err(|error| error.to_string())
}

fn read_mcp_specs(layout: &CliLayout, scope: &str, repo: &Path) -> Vec<(McpSpec, PathBuf)> {
    let Some((format, user_rel, repo_rel, global_rel)) = layout.mcp else {
        return Vec::new();
    };
    let Some(path) = config_path(layout, scope, repo, user_rel, repo_rel, global_rel) else {
        return Vec::new();
    };
    if !path.exists() {
        return Vec::new();
    }
    let specs = match format {
        McpFormat::CodexToml => read_codex_mcp(&path),
        McpFormat::JsonServers | McpFormat::OpenCodeJson => {
            let key = if format == McpFormat::OpenCodeJson { "mcp" } else { "mcpServers" };
            let Ok(root) = read_json_file(&path) else {
                return Vec::new();
            };
            match root.get(key) {
                Some(Value::Object(servers)) => servers
                    .iter()
                    .map(|(name, config)| {
                        if format == McpFormat::OpenCodeJson {
                            spec_from_opencode(name, config)
                        } else {
                            spec_from_json_servers(name, config)
                        }
                    })
                    .collect(),
                _ => Vec::new(),
            }
        }
    };
    specs.into_iter().map(|spec| (spec, path.clone())).collect()
}

pub(crate) fn write_mcp_spec(
    layout: &CliLayout,
    scope: &str,
    repo: &Path,
    spec: &McpSpec,
) -> Result<PathBuf, String> {
    let (format, user_rel, repo_rel, global_rel) = layout
        .mcp
        .ok_or_else(|| format!("{} unterstützt keine MCP-Server.", layout.label))?;
    let path = config_path(layout, scope, repo, user_rel, repo_rel, global_rel)
        .ok_or_else(|| "Kein Zielpfad für die MCP-Konfiguration.".to_string())?;
    backup_config(&path)?;
    match format {
        McpFormat::CodexToml => {
            rewrite_codex_mcp(&path, &spec.name, Some(&codex_block(spec)))?;
        }
        McpFormat::JsonServers | McpFormat::OpenCodeJson => {
            let key = if format == McpFormat::OpenCodeJson { "mcp" } else { "mcpServers" };
            let mut root = read_json_file(&path)?;
            if !root.is_object() {
                root = Value::Object(Map::new());
            }
            let object = root.as_object_mut().expect("object");
            let servers = object
                .entry(key.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if !servers.is_object() {
                *servers = Value::Object(Map::new());
            }
            let entry = if format == McpFormat::OpenCodeJson {
                opencode_from_spec(spec)
            } else {
                json_servers_from_spec(spec)
            };
            servers
                .as_object_mut()
                .expect("object")
                .insert(spec.name.clone(), entry);
            write_json_file(&path, &root)?;
        }
    }
    Ok(path)
}

fn delete_mcp_spec(
    layout: &CliLayout,
    scope: &str,
    repo: &Path,
    name: &str,
) -> Result<PathBuf, String> {
    let (format, user_rel, repo_rel, global_rel) = layout
        .mcp
        .ok_or_else(|| format!("{} unterstützt keine MCP-Server.", layout.label))?;
    let path = config_path(layout, scope, repo, user_rel, repo_rel, global_rel)
        .ok_or_else(|| "Kein Zielpfad für die MCP-Konfiguration.".to_string())?;
    backup_config(&path)?;
    match format {
        McpFormat::CodexToml => rewrite_codex_mcp(&path, name, None)?,
        McpFormat::JsonServers | McpFormat::OpenCodeJson => {
            let key = if format == McpFormat::OpenCodeJson { "mcp" } else { "mcpServers" };
            let mut root = read_json_file(&path)?;
            if let Some(servers) = root.get_mut(key).and_then(Value::as_object_mut) {
                servers.remove(name);
            }
            write_json_file(&path, &root)?;
        }
    }
    Ok(path)
}

// ---------------------------------------------------------------------------
// Hooks (Claude-Settings-Format)
// ---------------------------------------------------------------------------

struct HookEntry {
    event: String,
    index: usize,
    description: String,
    group: Value,
}

fn hooks_path(layout: &CliLayout, scope: &str, repo: &Path) -> Option<PathBuf> {
    let (_, user_rel, repo_rel, global_rel) = layout.hooks?;
    config_path(layout, scope, repo, user_rel, repo_rel, global_rel)
}

fn hook_description(group: &Value) -> String {
    let matcher = group.get("matcher").and_then(Value::as_str).unwrap_or("*");
    let commands = group
        .get("hooks")
        .and_then(Value::as_array)
        .map(|handlers| {
            handlers
                .iter()
                .filter_map(|handler| handler.get("command").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(" · ")
        })
        .unwrap_or_default();
    if commands.is_empty() {
        matcher.to_string()
    } else {
        format!("{matcher} → {commands}")
    }
}

fn read_hooks(layout: &CliLayout, scope: &str, repo: &Path) -> Vec<(HookEntry, PathBuf)> {
    let Some(path) = hooks_path(layout, scope, repo) else {
        return Vec::new();
    };
    let Ok(root) = read_json_file(&path) else {
        return Vec::new();
    };
    let Some(hooks) = root.get("hooks").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (event, groups) in hooks {
        let Some(groups) = groups.as_array() else {
            continue;
        };
        for (index, group) in groups.iter().enumerate() {
            out.push((
                HookEntry {
                    event: event.clone(),
                    index,
                    description: hook_description(group),
                    group: group.clone(),
                },
                path.clone(),
            ));
        }
    }
    out
}

pub(crate) fn merge_hook(
    layout: &CliLayout,
    scope: &str,
    repo: &Path,
    event: &str,
    group: &Value,
) -> Result<PathBuf, String> {
    let path = hooks_path(layout, scope, repo)
        .ok_or_else(|| format!("{} unterstützt keine Hooks.", layout.label))?;
    backup_config(&path)?;
    let mut root = read_json_file(&path)?;
    if !root.is_object() {
        root = Value::Object(Map::new());
    }
    let object = root.as_object_mut().expect("object");
    let hooks = object
        .entry("hooks".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !hooks.is_object() {
        *hooks = Value::Object(Map::new());
    }
    let events = hooks.as_object_mut().expect("object");
    let list = events
        .entry(event.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    if !list.is_array() {
        *list = Value::Array(Vec::new());
    }
    let array = list.as_array_mut().expect("array");
    if !array.iter().any(|existing| existing == group) {
        array.push(group.clone());
    }
    write_json_file(&path, &root)?;
    Ok(path)
}

fn delete_hook(
    layout: &CliLayout,
    scope: &str,
    repo: &Path,
    event: &str,
    index: usize,
) -> Result<PathBuf, String> {
    let path = hooks_path(layout, scope, repo)
        .ok_or_else(|| format!("{} unterstützt keine Hooks.", layout.label))?;
    backup_config(&path)?;
    let mut root = read_json_file(&path)?;
    let removed = root
        .get_mut("hooks")
        .and_then(Value::as_object_mut)
        .and_then(|events| events.get_mut(event))
        .and_then(Value::as_array_mut)
        .map(|array| {
            if index < array.len() {
                array.remove(index);
                true
            } else {
                false
            }
        })
        .unwrap_or(false);
    if !removed {
        return Err("Hook wurde nicht gefunden.".into());
    }
    write_json_file(&path, &root)?;
    Ok(path)
}

// ---------------------------------------------------------------------------
// Inventar
// ---------------------------------------------------------------------------

fn skill_items(root: &Path, layout: &CliLayout, scope: &str, out: &mut Vec<CapabilityItem>) {
    fn collect(base: &Path, prefix: &str, depth: usize, found: &mut Vec<(String, PathBuf, bool)>) {
        if depth > 2 || found.len() >= MAX_ITEMS_PER_KIND {
            return;
        }
        let Ok(entries) = fs::read_dir(base) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if name.starts_with('.') {
                continue;
            }
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                if path.join("SKILL.md").is_file() {
                    found.push((format!("{prefix}{name}"), path, true));
                } else {
                    collect(&path, &format!("{prefix}{name}/"), depth + 1, found);
                }
            } else if name.ends_with(".md") && name != "README.md" {
                found.push((format!("{prefix}{name}"), path, false));
            }
        }
    }

    let mut found = Vec::new();
    collect(root, "", 0, &mut found);
    for (rel, path, is_directory) in found {
        let descriptor = if is_directory { path.join("SKILL.md") } else { path.clone() };
        let (file_count, size_bytes, fingerprint) = if is_directory {
            directory_stats(&path)
        } else {
            let bytes = fs::read(&path).unwrap_or_default();
            (1, bytes.len() as u64, fingerprint_hex(&bytes))
        };
        out.push(CapabilityItem {
            id: format!("{}:{}:skill:{}", layout.id, scope, rel),
            cli: layout.id.into(),
            scope: scope.into(),
            kind: "skill".into(),
            name: rel.trim_end_matches(".md").to_string(),
            rel: rel.clone(),
            description: markdown_description(&descriptor),
            path: path.to_string_lossy().into_owned(),
            is_directory,
            file_count,
            size_bytes,
            updated_at_ms: modified_ms(&descriptor),
            fingerprint,
        });
    }
}

fn markdown_items(
    root: &Path,
    layout: &CliLayout,
    scope: &str,
    kind: &str,
    out: &mut Vec<CapabilityItem>,
) {
    let mut files = Vec::new();
    walk_files(root, root, 0, &mut files);
    files.sort();
    for path in files.into_iter().take(MAX_ITEMS_PER_KIND) {
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with('.') || !(name.ends_with(".md") || name.ends_with(".mdc") || name.ends_with(".toml")) {
            continue;
        }
        let Ok(rel_path) = path.strip_prefix(root) else {
            continue;
        };
        let rel = rel_path.to_string_lossy().replace('\\', "/");
        let bytes = fs::read(&path).unwrap_or_default();
        out.push(CapabilityItem {
            id: format!("{}:{}:{kind}:{rel}", layout.id, scope),
            cli: layout.id.into(),
            scope: scope.into(),
            kind: kind.into(),
            name: display_name(&rel),
            rel,
            description: markdown_description(&path),
            path: path.to_string_lossy().into_owned(),
            is_directory: false,
            file_count: 1,
            size_bytes: bytes.len() as u64,
            updated_at_ms: modified_ms(&path),
            fingerprint: fingerprint_hex(&bytes),
        });
    }
}

fn display_name(rel: &str) -> String {
    let without_extension = rel
        .strip_suffix(".prompt.md")
        .or_else(|| rel.strip_suffix(".md"))
        .or_else(|| rel.strip_suffix(".mdc"))
        .or_else(|| rel.strip_suffix(".toml"))
        .unwrap_or(rel);
    without_extension.replace('/', ":")
}

/// Vergleichsschlüssel, der Dateinamens-Konventionen der CLIs ausblendet.
fn match_key(kind: &str, rel: &str) -> String {
    match kind {
        "skill" => rel.trim_end_matches(".md").trim_end_matches('/').to_lowercase(),
        "command" | "agent" => display_name(rel).to_lowercase(),
        _ => rel.to_lowercase(),
    }
}

fn inventory_for(repo: &Path, layout: &CliLayout, scope: &str, out: &mut Vec<CapabilityItem>) {
    let Some(root) = cli_root(layout, scope, repo) else {
        return;
    };
    for kind in ["skill", "command", "agent"] {
        let Some(directory) = kind_dir(layout, kind) else {
            continue;
        };
        let full = root.join(directory);
        if !full.is_dir() {
            continue;
        }
        if kind == "skill" {
            skill_items(&full, layout, scope, out);
        } else {
            markdown_items(&full, layout, scope, kind, out);
        }
    }
    for (spec, path) in read_mcp_specs(layout, scope, repo) {
        let serialized = serde_json::to_vec(&spec).unwrap_or_default();
        let description = if spec.transport == "http" {
            spec.url.clone().unwrap_or_default()
        } else {
            let mut parts = vec![spec.command.clone().unwrap_or_default()];
            parts.extend(spec.args.clone());
            parts.join(" ")
        };
        out.push(CapabilityItem {
            id: format!("{}:{}:mcp:{}", layout.id, scope, spec.name),
            cli: layout.id.into(),
            scope: scope.into(),
            kind: "mcp".into(),
            name: spec.name.clone(),
            rel: spec.name.clone(),
            description,
            path: path.to_string_lossy().into_owned(),
            is_directory: false,
            file_count: 1,
            size_bytes: 0,
            updated_at_ms: modified_ms(&path),
            fingerprint: fingerprint_hex(&serialized),
        });
    }
    for (hook, path) in read_hooks(layout, scope, repo) {
        let rel = format!("{}#{}", hook.event, hook.index);
        let serialized = serde_json::to_vec(&hook.group).unwrap_or_default();
        out.push(CapabilityItem {
            id: format!("{}:{}:hook:{rel}", layout.id, scope),
            cli: layout.id.into(),
            scope: scope.into(),
            kind: "hook".into(),
            name: hook.event.clone(),
            rel,
            description: hook.description,
            path: path.to_string_lossy().into_owned(),
            is_directory: false,
            file_count: 1,
            size_bytes: 0,
            updated_at_ms: modified_ms(&path),
            fingerprint: fingerprint_hex(&serialized),
        });
    }
}

fn cli_installed(command: &str) -> bool {
    crate::shell::cli_in_path(command)
}

fn build_inventory(repo: &Path) -> CapabilityInventory {
    let mut items = Vec::new();
    let mut targets = Vec::new();
    let mut warnings = Vec::new();
    if !repo.is_dir() {
        warnings.push("Repository-Pfad existiert nicht.".into());
    }
    for layout in LAYOUTS {
        let mut scopes = Vec::new();
        for scope in SCOPES {
            let before = items.len();
            inventory_for(repo, layout, scope, &mut items);
            let root = cli_root(layout, scope, repo);
            let exists = root.as_ref().map(|path| path.is_dir()).unwrap_or(false);
            scopes.push(CapabilityScopeInfo {
                scope: scope.into(),
                root: root.as_ref().map(|path| path.to_string_lossy().into_owned()),
                exists,
                writable: match (&root, exists) {
                    (Some(path), true) => writable_root(path),
                    // Nicht vorhandene Ordner unter Home/Repo legen wir bei Bedarf an.
                    (Some(_), false) => scope != "global",
                    _ => false,
                },
                item_count: (items.len() - before) as u32,
            });
        }
        targets.push(CapabilityTargetInfo {
            cli: layout.id.into(),
            label: layout.label.into(),
            command: layout.command.into(),
            installed: cli_installed(layout.command),
            kinds: ["skill", "command", "agent", "mcp", "hook"]
                .into_iter()
                .filter(|kind| supports_kind(layout, kind))
                .map(str::to_string)
                .collect(),
            scopes,
        });
    }
    items.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then(a.cli.cmp(&b.cli))
    });
    CapabilityInventory { targets, items, warnings }
}

// ---------------------------------------------------------------------------
// Kopieren, Löschen, Abgleichen
// ---------------------------------------------------------------------------

/// Passt den Dateinamen an die Konvention der Ziel-CLI an.
pub(crate) fn normalized_rel(target: &CliLayout, kind: &str, rel: &str) -> String {
    if kind == "skill" {
        return rel.to_string();
    }
    let base = rel
        .strip_suffix(".prompt.md")
        .or_else(|| rel.strip_suffix(".md"))
        .or_else(|| rel.strip_suffix(".mdc"))
        .unwrap_or(rel);
    match (target.id, kind) {
        ("cursor", "agent") => format!("{base}.mdc"),
        ("copilot", "command") => format!("{base}.prompt.md"),
        _ if rel.ends_with(".toml") => rel.to_string(),
        _ => format!("{base}.md"),
    }
}

fn permission_hint(error: &std::io::Error, scope: &str) -> String {
    if error.kind() == std::io::ErrorKind::PermissionDenied && scope == "global" {
        "Keine Schreibrechte auf der globalen Ebene – dafür sind Administratorrechte nötig.".into()
    } else {
        error.to_string()
    }
}

pub(crate) fn result(
    kind: &str,
    name: &str,
    source: &str,
    target: &str,
    status: &str,
    message: impl Into<String>,
    path: Option<String>,
    backup: Option<String>,
) -> CapabilityOpResult {
    CapabilityOpResult {
        kind: kind.into(),
        name: name.into(),
        source: source.into(),
        target: target.into(),
        status: status.into(),
        message: message.into(),
        path,
        backup,
    }
}

pub(crate) fn label_of(cli: &str, scope: &str) -> String {
    let label = layout(cli).map(|entry| entry.label).unwrap_or(cli);
    let scope_label = match scope {
        "global" => "global",
        "user" => "User",
        _ => "Projekt",
    };
    format!("{label} ({scope_label})")
}

fn copy_one(
    repo: &Path,
    item: &CapabilityRef,
    target: &CapabilityTargetRef,
    overwrite: bool,
) -> CapabilityOpResult {
    let source_label = label_of(&item.cli, &item.scope);
    let target_label = label_of(&target.cli, &target.scope);
    let name = display_name(&item.rel);
    let fail = |message: String| {
        result(&item.kind, &name, &source_label, &target_label, "error", message, None, None)
    };

    let (Some(source_layout), Some(target_layout)) = (layout(&item.cli), layout(&target.cli)) else {
        return fail("Unbekannte CLI.".into());
    };
    if item.cli == target.cli && item.scope == target.scope {
        return result(
            &item.kind,
            &name,
            &source_label,
            &target_label,
            "skipped",
            "Quelle und Ziel sind identisch.",
            None,
            None,
        );
    }
    if !supports_kind(target_layout, &item.kind) {
        return result(
            &item.kind,
            &name,
            &source_label,
            &target_label,
            "unsupported",
            format!("{} kennt diese Capability-Art nicht.", target_layout.label),
            None,
            None,
        );
    }

    match item.kind.as_str() {
        "skill" | "command" | "agent" => {
            let (Some(source_dir), Some(target_dir)) = (
                kind_dir(source_layout, &item.kind),
                kind_dir(target_layout, &item.kind),
            ) else {
                return fail("Capability-Art wird nicht unterstützt.".into());
            };
            let Some(source_root) = cli_root(source_layout, &item.scope, repo) else {
                return fail("Quellverzeichnis nicht gefunden.".into());
            };
            let Some(target_root) = cli_root(target_layout, &target.scope, repo) else {
                return fail("Zielverzeichnis nicht gefunden.".into());
            };
            let relative = match safe_relative(&item.rel) {
                Ok(value) => value,
                Err(error) => return fail(error),
            };
            let source_path = source_root.join(source_dir).join(&relative);
            if !source_path.exists() {
                return fail("Quelle existiert nicht mehr.".into());
            }
            let target_rel = match safe_relative(&normalized_rel(target_layout, &item.kind, &item.rel)) {
                Ok(value) => value,
                Err(error) => return fail(error),
            };
            let target_path = target_root.join(target_dir).join(&target_rel);
            if target_path.exists() && !overwrite {
                return result(
                    &item.kind,
                    &name,
                    &source_label,
                    &target_label,
                    "skipped",
                    "Existiert bereits – Überschreiben ist nicht aktiviert.",
                    Some(target_path.to_string_lossy().into_owned()),
                    None,
                );
            }
            let backup = match backup_existing(&target_root, &target_path, &name.replace([':', '/'], "-")) {
                Ok(value) => value,
                Err(error) => return fail(error),
            };
            if let Some(parent) = target_path.parent() {
                if let Err(error) = fs::create_dir_all(parent) {
                    return fail(permission_hint(&error, &target.scope));
                }
            }
            let outcome = if source_path.is_dir() {
                if target_path.exists() {
                    let _ = fs::remove_dir_all(&target_path);
                }
                fs::create_dir_all(&target_path)
                    .map_err(|error| error.to_string())
                    .and_then(|()| copy_directory(&source_path, &target_path).map(|_| ()))
            } else {
                fs::copy(&source_path, &target_path).map(|_| ()).map_err(|error| error.to_string())
            };
            match outcome {
                Ok(()) => result(
                    &item.kind,
                    &name,
                    &source_label,
                    &target_label,
                    "copied",
                    "Kopiert.",
                    Some(target_path.to_string_lossy().into_owned()),
                    backup,
                ),
                Err(error) => fail(error),
            }
        }
        "mcp" => {
            let Some((spec, _)) = read_mcp_specs(source_layout, &item.scope, repo)
                .into_iter()
                .find(|(spec, _)| spec.name == item.rel)
            else {
                return fail("MCP-Server wurde nicht gefunden.".into());
            };
            let existing = read_mcp_specs(target_layout, &target.scope, repo)
                .into_iter()
                .any(|(candidate, _)| candidate.name == spec.name);
            if existing && !overwrite {
                return result(
                    &item.kind,
                    &name,
                    &source_label,
                    &target_label,
                    "skipped",
                    "MCP-Server existiert bereits.",
                    None,
                    None,
                );
            }
            match write_mcp_spec(target_layout, &target.scope, repo, &spec) {
                Ok(path) => result(
                    &item.kind,
                    &name,
                    &source_label,
                    &target_label,
                    "copied",
                    "MCP-Server übernommen.",
                    Some(path.to_string_lossy().into_owned()),
                    None,
                ),
                Err(error) => fail(error),
            }
        }
        "hook" => {
            let Some((event, index)) = item.rel.split_once('#') else {
                return fail("Ungültiger Hook-Schlüssel.".into());
            };
            let index = index.parse::<usize>().unwrap_or(usize::MAX);
            let Some((hook, _)) = read_hooks(source_layout, &item.scope, repo)
                .into_iter()
                .find(|(hook, _)| hook.event == event && hook.index == index)
            else {
                return fail("Hook wurde nicht gefunden.".into());
            };
            match merge_hook(target_layout, &target.scope, repo, event, &hook.group) {
                Ok(path) => result(
                    &item.kind,
                    &name,
                    &source_label,
                    &target_label,
                    "copied",
                    "Hook übernommen.",
                    Some(path.to_string_lossy().into_owned()),
                    None,
                ),
                Err(error) => fail(error),
            }
        }
        _ => fail("Unbekannte Capability-Art.".into()),
    }
}

fn delete_one(repo: &Path, item: &CapabilityRef) -> CapabilityOpResult {
    let source_label = label_of(&item.cli, &item.scope);
    let name = display_name(&item.rel);
    let fail = |message: String| {
        result(&item.kind, &name, &source_label, &source_label, "error", message, None, None)
    };
    let Some(source_layout) = layout(&item.cli) else {
        return fail("Unbekannte CLI.".into());
    };
    let Some(root) = cli_root(source_layout, &item.scope, repo) else {
        return fail("Verzeichnis nicht gefunden.".into());
    };

    match item.kind.as_str() {
        "skill" | "command" | "agent" => {
            let Some(directory) = kind_dir(source_layout, &item.kind) else {
                return fail("Capability-Art wird nicht unterstützt.".into());
            };
            let relative = match safe_relative(&item.rel) {
                Ok(value) => value,
                Err(error) => return fail(error),
            };
            let target = root.join(directory).join(relative);
            if !target.exists() {
                return fail("Datei existiert nicht mehr.".into());
            }
            let backup = match backup_existing(&root, &target, &name.replace([':', '/'], "-")) {
                Ok(value) => value,
                Err(error) => return fail(error),
            };
            let outcome = if target.is_dir() {
                fs::remove_dir_all(&target)
            } else {
                fs::remove_file(&target)
            };
            match outcome {
                Ok(()) => result(
                    &item.kind,
                    &name,
                    &source_label,
                    &source_label,
                    "deleted",
                    "Gelöscht.",
                    Some(target.to_string_lossy().into_owned()),
                    backup,
                ),
                Err(error) => fail(error.to_string()),
            }
        }
        "mcp" => match delete_mcp_spec(source_layout, &item.scope, repo, &item.rel) {
            Ok(path) => result(
                &item.kind,
                &name,
                &source_label,
                &source_label,
                "deleted",
                "MCP-Server entfernt.",
                Some(path.to_string_lossy().into_owned()),
                None,
            ),
            Err(error) => fail(error),
        },
        "hook" => {
            let Some((event, index)) = item.rel.split_once('#') else {
                return fail("Ungültiger Hook-Schlüssel.".into());
            };
            let Ok(index) = index.parse::<usize>() else {
                return fail("Ungültiger Hook-Schlüssel.".into());
            };
            match delete_hook(source_layout, &item.scope, repo, event, index) {
                Ok(path) => result(
                    &item.kind,
                    &name,
                    &source_label,
                    &source_label,
                    "deleted",
                    "Hook entfernt.",
                    Some(path.to_string_lossy().into_owned()),
                    None,
                ),
                Err(error) => fail(error),
            }
        }
        _ => fail("Unbekannte Capability-Art.".into()),
    }
}

fn plan_for(
    repo: &Path,
    source: &CapabilityTargetRef,
    targets: &[CapabilityTargetRef],
    kinds: &[String],
    include_extras: bool,
) -> Vec<CapabilityPlanEntry> {
    let mut entries = Vec::new();
    let Some(source_layout) = layout(&source.cli) else {
        return entries;
    };
    let mut source_items = Vec::new();
    inventory_for(repo, source_layout, &source.scope, &mut source_items);
    source_items.retain(|item| kinds.iter().any(|kind| kind == &item.kind));

    for target in targets {
        let Some(target_layout) = layout(&target.cli) else {
            continue;
        };
        if target.cli == source.cli && target.scope == source.scope {
            continue;
        }
        let mut target_items = Vec::new();
        inventory_for(repo, target_layout, &target.scope, &mut target_items);
        target_items.retain(|item| kinds.iter().any(|kind| kind == &item.kind));

        for item in &source_items {
            if !supports_kind(target_layout, &item.kind) {
                entries.push(CapabilityPlanEntry {
                    kind: item.kind.clone(),
                    name: item.name.clone(),
                    rel: item.rel.clone(),
                    source_cli: source.cli.clone(),
                    source_scope: source.scope.clone(),
                    target_cli: target.cli.clone(),
                    target_scope: target.scope.clone(),
                    action: "unsupported".into(),
                    detail: format!("{} kennt diese Art nicht.", target_layout.label),
                });
                continue;
            }
            let key = match_key(&item.kind, &item.rel);
            let existing = target_items
                .iter()
                .find(|candidate| candidate.kind == item.kind && match_key(&candidate.kind, &candidate.rel) == key);
            let (action, detail) = match existing {
                None => ("create", "Fehlt im Ziel."),
                Some(candidate) if candidate.fingerprint == item.fingerprint => ("same", "Identisch."),
                Some(_) => ("update", "Unterscheidet sich vom Ziel."),
            };
            entries.push(CapabilityPlanEntry {
                kind: item.kind.clone(),
                name: item.name.clone(),
                rel: item.rel.clone(),
                source_cli: source.cli.clone(),
                source_scope: source.scope.clone(),
                target_cli: target.cli.clone(),
                target_scope: target.scope.clone(),
                action: action.into(),
                detail: detail.into(),
            });
        }

        if include_extras {
            for item in &target_items {
                let key = match_key(&item.kind, &item.rel);
                let known = source_items
                    .iter()
                    .any(|candidate| candidate.kind == item.kind && match_key(&candidate.kind, &candidate.rel) == key);
                if known {
                    continue;
                }
                entries.push(CapabilityPlanEntry {
                    kind: item.kind.clone(),
                    name: item.name.clone(),
                    rel: item.rel.clone(),
                    source_cli: source.cli.clone(),
                    source_scope: source.scope.clone(),
                    target_cli: target.cli.clone(),
                    target_scope: target.scope.clone(),
                    action: "extra".into(),
                    detail: "Nur im Ziel vorhanden.".into(),
                });
            }
        }
    }
    entries
}

// ---------------------------------------------------------------------------
// Tauri-Kommandos
// ---------------------------------------------------------------------------

pub(crate) fn repo_path(path: &str) -> PathBuf {
    PathBuf::from(path.trim())
}

#[tauri::command]
pub async fn agent_cap_inventory(path: String) -> Result<CapabilityInventory, String> {
    tokio::task::spawn_blocking(move || build_inventory(&repo_path(&path)))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_cap_copy(
    path: String,
    items: Vec<CapabilityRef>,
    targets: Vec<CapabilityTargetRef>,
    overwrite: bool,
) -> Result<Vec<CapabilityOpResult>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = repo_path(&path);
        let mut results = Vec::new();
        for item in &items {
            for target in &targets {
                results.push(copy_one(&repo, item, target, overwrite));
            }
        }
        results
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_cap_delete(
    path: String,
    items: Vec<CapabilityRef>,
) -> Result<Vec<CapabilityOpResult>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = repo_path(&path);
        items.iter().map(|item| delete_one(&repo, item)).collect()
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_cap_sync_plan(
    path: String,
    source: CapabilityTargetRef,
    targets: Vec<CapabilityTargetRef>,
    kinds: Vec<String>,
    include_extras: bool,
) -> Result<Vec<CapabilityPlanEntry>, String> {
    tokio::task::spawn_blocking(move || {
        plan_for(&repo_path(&path), &source, &targets, &kinds, include_extras)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_cap_sync_apply(
    path: String,
    entries: Vec<CapabilityPlanEntry>,
    delete_extras: bool,
) -> Result<Vec<CapabilityOpResult>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = repo_path(&path);
        let mut results = Vec::new();
        for entry in &entries {
            match entry.action.as_str() {
                "create" | "update" => {
                    results.push(copy_one(
                        &repo,
                        &CapabilityRef {
                            cli: entry.source_cli.clone(),
                            scope: entry.source_scope.clone(),
                            kind: entry.kind.clone(),
                            rel: entry.rel.clone(),
                        },
                        &CapabilityTargetRef {
                            cli: entry.target_cli.clone(),
                            scope: entry.target_scope.clone(),
                        },
                        true,
                    ));
                }
                "extra" if delete_extras => {
                    results.push(delete_one(
                        &repo,
                        &CapabilityRef {
                            cli: entry.target_cli.clone(),
                            scope: entry.target_scope.clone(),
                            kind: entry.kind.clone(),
                            rel: entry.rel.clone(),
                        },
                    ));
                }
                _ => {}
            }
        }
        results
    })
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("l8git-capsync-{tag}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn safe_relative_rejects_traversal() {
        assert!(safe_relative("../etc/passwd").is_err());
        assert!(safe_relative("skills/../../x").is_err());
        assert!(safe_relative("   ").is_err());
        assert_eq!(
            safe_relative("review/SKILL.md").unwrap(),
            PathBuf::from("review").join("SKILL.md")
        );
    }

    #[test]
    fn match_key_ignores_cli_file_conventions() {
        assert_eq!(match_key("command", "review.md"), match_key("command", "review.prompt.md"));
        assert_eq!(match_key("agent", "planner.md"), match_key("agent", "planner.mdc"));
        assert_ne!(match_key("command", "review.md"), match_key("command", "ship.md"));
    }

    #[test]
    fn normalized_rel_follows_target_convention() {
        let cursor = layout("cursor").unwrap();
        let copilot = layout("copilot").unwrap();
        let claude = layout("claude").unwrap();
        assert_eq!(normalized_rel(cursor, "agent", "planner.md"), "planner.mdc");
        assert_eq!(normalized_rel(copilot, "command", "review.md"), "review.prompt.md");
        assert_eq!(normalized_rel(claude, "command", "review.prompt.md"), "review.md");
        assert_eq!(normalized_rel(claude, "skill", "review/SKILL.md"), "review/SKILL.md");
    }

    #[test]
    fn codex_toml_round_trip_keeps_other_sections() {
        let dir = scratch("toml");
        let config = dir.join("config.toml");
        fs::write(&config, "model = \"gpt-5\"\n\n[mcp_servers.old]\ncommand = \"old\"\n").unwrap();
        let spec = McpSpec {
            name: "docs".into(),
            transport: "stdio".into(),
            command: Some("npx".into()),
            args: vec!["-y".into(), "@acme/docs".into()],
            env: BTreeMap::from([("TOKEN".to_string(), "abc".to_string())]),
            enabled: true,
            ..McpSpec::default()
        };
        rewrite_codex_mcp(&config, "docs", Some(&codex_block(&spec))).unwrap();
        let contents = fs::read_to_string(&config).unwrap();
        assert!(contents.contains("model = \"gpt-5\""));
        assert!(contents.contains("[mcp_servers.old]"));

        let parsed = read_codex_mcp(&config);
        let docs = parsed.iter().find(|entry| entry.name == "docs").unwrap();
        assert_eq!(docs.command.as_deref(), Some("npx"));
        assert_eq!(docs.args, vec!["-y".to_string(), "@acme/docs".to_string()]);
        assert_eq!(docs.env.get("TOKEN").map(String::as_str), Some("abc"));

        rewrite_codex_mcp(&config, "docs", None).unwrap();
        let after = read_codex_mcp(&config);
        assert!(after.iter().all(|entry| entry.name != "docs"));
        assert!(fs::read_to_string(&config).unwrap().contains("[mcp_servers.old]"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn opencode_and_json_specs_convert_both_ways() {
        let spec = McpSpec {
            name: "search".into(),
            transport: "stdio".into(),
            command: Some("uvx".into()),
            args: vec!["search-mcp".into()],
            env: BTreeMap::from([("KEY".to_string(), "1".to_string())]),
            enabled: true,
            ..McpSpec::default()
        };
        let opencode = opencode_from_spec(&spec);
        assert_eq!(spec_from_opencode("search", &opencode), spec);
        let json = json_servers_from_spec(&spec);
        assert_eq!(spec_from_json_servers("search", &json), spec);

        let remote = McpSpec {
            name: "api".into(),
            transport: "http".into(),
            url: Some("https://example.test/mcp".into()),
            enabled: true,
            ..McpSpec::default()
        };
        assert_eq!(
            spec_from_opencode("api", &opencode_from_spec(&remote)),
            remote
        );
    }

    #[test]
    fn mcp_written_into_repo_scope_is_found_again() {
        let repo = scratch("repo-mcp");
        let claude = layout("claude").unwrap();
        let spec = McpSpec {
            name: "docs".into(),
            transport: "stdio".into(),
            command: Some("npx".into()),
            args: vec!["-y".into(), "docs".into()],
            enabled: true,
            ..McpSpec::default()
        };
        write_mcp_spec(claude, "repo", &repo, &spec).unwrap();
        let found = read_mcp_specs(claude, "repo", &repo);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, spec);

        delete_mcp_spec(claude, "repo", &repo, "docs").unwrap();
        assert!(read_mcp_specs(claude, "repo", &repo).is_empty());
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn hooks_merge_is_idempotent_and_deletable() {
        let repo = scratch("repo-hooks");
        let claude = layout("claude").unwrap();
        let group = serde_json::json!({
            "matcher": "Bash",
            "hooks": [{ "type": "command", "command": "echo hi" }]
        });
        merge_hook(claude, "repo", &repo, "PreToolUse", &group).unwrap();
        merge_hook(claude, "repo", &repo, "PreToolUse", &group).unwrap();
        assert_eq!(read_hooks(claude, "repo", &repo).len(), 1);

        delete_hook(claude, "repo", &repo, "PreToolUse", 0).unwrap();
        assert!(read_hooks(claude, "repo", &repo).is_empty());
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn copy_between_repo_scoped_clis_translates_extension() {
        let repo = scratch("repo-copy");
        let source = repo.join(".claude").join("agents");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("planner.md"),
            "---\ndescription: Plans work\n---\nBody\n",
        )
        .unwrap();

        let outcome = copy_one(
            &repo,
            &CapabilityRef {
                cli: "claude".into(),
                scope: "repo".into(),
                kind: "agent".into(),
                rel: "planner.md".into(),
            },
            &CapabilityTargetRef { cli: "cursor".into(), scope: "repo".into() },
            false,
        );
        assert_eq!(outcome.status, "copied", "{}", outcome.message);
        assert!(repo.join(".cursor").join("rules").join("planner.mdc").is_file());

        let plan = plan_for(
            &repo,
            &CapabilityTargetRef { cli: "claude".into(), scope: "repo".into() },
            &[CapabilityTargetRef { cli: "cursor".into(), scope: "repo".into() }],
            &["agent".to_string()],
            false,
        );
        assert_eq!(plan.len(), 1);
        assert_eq!(plan[0].action, "same");
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn deleting_a_command_keeps_a_backup() {
        let repo = scratch("repo-delete");
        let commands = repo.join(".claude").join("commands");
        fs::create_dir_all(&commands).unwrap();
        fs::write(commands.join("ship.md"), "ship it\n").unwrap();

        let outcome = delete_one(
            &repo,
            &CapabilityRef {
                cli: "claude".into(),
                scope: "repo".into(),
                kind: "command".into(),
                rel: "ship.md".into(),
            },
        );
        assert_eq!(outcome.status, "deleted", "{}", outcome.message);
        assert!(!commands.join("ship.md").exists());
        let backup = PathBuf::from(outcome.backup.expect("backup path"));
        assert!(backup.join("ship.md").is_file());
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn plan_marks_missing_and_unsupported_entries() {
        let repo = scratch("repo-plan");
        let skills = repo.join(".claude").join("skills").join("review");
        fs::create_dir_all(&skills).unwrap();
        fs::write(skills.join("SKILL.md"), "---\ndescription: Review\n---\n").unwrap();

        let plan = plan_for(
            &repo,
            &CapabilityTargetRef { cli: "claude".into(), scope: "repo".into() },
            &[
                CapabilityTargetRef { cli: "codex".into(), scope: "repo".into() },
                CapabilityTargetRef { cli: "gemini".into(), scope: "repo".into() },
            ],
            &["skill".to_string()],
            false,
        );
        let codex = plan.iter().find(|entry| entry.target_cli == "codex").unwrap();
        let gemini = plan.iter().find(|entry| entry.target_cli == "gemini").unwrap();
        assert_eq!(codex.action, "create");
        assert_eq!(gemini.action, "unsupported");
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn rewriting_a_config_file_keeps_a_backup() {
        let repo = scratch("repo-config-backup");
        let claude = layout("claude").unwrap();
        let spec = McpSpec {
            name: "docs".into(),
            transport: "stdio".into(),
            command: Some("npx".into()),
            enabled: true,
            ..McpSpec::default()
        };
        // Erster Schreibvorgang: die Datei existiert noch nicht, also keine Sicherung.
        write_mcp_spec(claude, "repo", &repo, &spec).unwrap();
        assert!(!backup_root(&repo).exists());

        // Zweiter Schreibvorgang sichert den vorherigen Stand.
        write_mcp_spec(claude, "repo", &repo, &McpSpec { name: "other".into(), ..spec.clone() }).unwrap();
        let backups = fs::read_dir(backup_root(&repo)).unwrap().count();
        assert!(backups >= 1);
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn scopes_cover_global_user_and_project() {
        assert_eq!(SCOPES, ["global", "user", "repo"]);
        let claude = layout("claude").unwrap();
        let repo = PathBuf::from("/tmp/example-repo");
        assert_eq!(
            cli_root(claude, "repo", &repo),
            Some(repo.join(".claude"))
        );
        assert!(cli_root(claude, "global", &repo).is_some());
        assert!(cli_root(claude, "unknown", &repo).is_none());
    }
}
