use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};

use crate::cmd::cli_command;
use crate::shell::resolve_cli_path;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionSummary {
    id: String,
    path: String,
    title: String,
    preview: String,
    created_at: u64,
    updated_at: u64,
    model: Option<String>,
    permission_mode: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionTranscript {
    summary: ClaudeSessionSummary,
    entries: Vec<Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSkill {
    name: String,
    description: String,
    path: String,
    scope: String,
    enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCapabilityFile {
    name: String,
    description: String,
    path: String,
    scope: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHook {
    key: String,
    event_name: String,
    enabled: bool,
    trust_status: String,
    command: Option<String>,
    matcher: Option<String>,
    source: String,
}

fn unix_seconds(value: Result<SystemTime, std::io::Error>) -> u64 {
    value
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn claude_projects_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".claude").join("projects"))
        .ok_or_else(|| "Claude-Projektverzeichnis konnte nicht bestimmt werden.".into())
}

fn project_dir_name(path: &str) -> String {
    path.chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
        .collect()
}

fn valid_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn is_regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
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

fn scan_skills(root: &Path, scope: &str, depth: usize, output: &mut Vec<ClaudeSkill>) {
    if depth > 8 || output.len() >= 2_000 || !root.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        if output.len() >= 2_000 {
            break;
        }
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let skill_file = path.join("SKILL.md");
        if is_regular_file(&skill_file) {
            let contents = fs::read_to_string(&skill_file).unwrap_or_default();
            let fallback = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("skill");
            output.push(ClaudeSkill {
                name: frontmatter_value(&contents, "name").unwrap_or_else(|| fallback.into()),
                description: frontmatter_value(&contents, "description").unwrap_or_default(),
                path: skill_file.to_string_lossy().into_owned(),
                scope: scope.into(),
                enabled: true,
            });
        } else {
            scan_skills(&path, scope, depth + 1, output);
        }
    }
}

pub(crate) fn hooks_from_file(path: &Path, source: &str, output: &mut Vec<ClaudeHook>) {
    if !is_regular_file(path) {
        return;
    }
    let Ok(contents) = fs::read(path) else {
        return;
    };
    let Ok(settings) = serde_json::from_slice::<Value>(&contents) else {
        return;
    };
    let Some(events) = settings.get("hooks").and_then(Value::as_object) else {
        return;
    };
    for (event_name, groups) in events {
        for (group_index, group) in groups.as_array().into_iter().flatten().enumerate() {
            let matcher = group.get("matcher").and_then(Value::as_str).map(str::to_string);
            let handlers = group
                .get("hooks")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(std::slice::from_ref(group));
            for (handler_index, handler) in handlers.iter().enumerate() {
                output.push(ClaudeHook {
                    key: format!("{source}:{event_name}:{group_index}:{handler_index}"),
                    event_name: event_name.clone(),
                    enabled: handler.get("disabled").and_then(Value::as_bool) != Some(true),
                    trust_status: source.into(),
                    command: handler.get("command").and_then(Value::as_str).map(str::to_string),
                    matcher: matcher.clone(),
                    source: path.to_string_lossy().into_owned(),
                });
            }
        }
    }
}

fn text_from_content(content: &Value) -> Option<String> {
    if let Some(text) = content.as_str() {
        return Some(text.trim().to_string()).filter(|value| !value.is_empty());
    }
    let text = content
        .as_array()?
        .iter()
        .filter_map(|part| {
            (part.get("type").and_then(Value::as_str) == Some("text"))
                .then(|| part.get("text").and_then(Value::as_str))
                .flatten()
        })
        .collect::<Vec<_>>()
        .join("\n");
    Some(text.trim().to_string()).filter(|value| !value.is_empty())
}

fn sanitize_entry(mut entry: Value) -> Value {
    if let Some(content) = entry
        .get_mut("message")
        .and_then(|message| message.get_mut("content"))
        .and_then(Value::as_array_mut)
    {
        for block in content {
            if let Some(object) = block.as_object_mut() {
                object.remove("signature");
            }
        }
    }
    if let Some(message) = entry.get_mut("message").and_then(Value::as_object_mut) {
        if let Some(usage) = message.get_mut("usage").and_then(Value::as_object_mut) {
            usage.remove("iterations");
            usage.remove("server_tool_use");
        }
    }
    entry
}

const SUMMARY_EDGE_BYTES: usize = 512 * 1024;

#[derive(Default)]
struct SummaryFields {
    cwd: Option<String>,
    title: Option<String>,
    preview: Option<String>,
    model: Option<String>,
    permission_mode: Option<String>,
}

fn update_summary_fields(entry: &Value, fields: &mut SummaryFields) {
    if fields.cwd.is_none() {
        fields.cwd = entry
            .get("cwd")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    if matches!(
        entry.get("type").and_then(Value::as_str),
        Some("ai-title") | Some("custom-title")
    ) {
        fields.title = entry
            .get("aiTitle")
            .or_else(|| entry.get("customTitle"))
            .or_else(|| entry.get("title"))
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    if fields.preview.is_none()
        && entry.get("type").and_then(Value::as_str) == Some("user")
        && entry.get("userType").and_then(Value::as_str) != Some("tool")
    {
        fields.preview = entry
            .get("message")
            .and_then(|message| message.get("content"))
            .and_then(text_from_content);
    }
    if entry.get("type").and_then(Value::as_str) == Some("assistant") {
        fields.model = entry
            .get("message")
            .and_then(|message| message.get("model"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| fields.model.take());
    }
    fields.permission_mode = entry
        .get("permissionMode")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| fields.permission_mode.take());
}

fn scan_summary_bytes(
    bytes: &[u8],
    skip_first_partial: bool,
    skip_last_partial: bool,
    fields: &mut SummaryFields,
) {
    let line_count = bytes.split(|byte| *byte == b'\n').count();
    for (index, line) in bytes.split(|byte| *byte == b'\n').enumerate() {
        if (skip_first_partial && index == 0)
            || (skip_last_partial && index + 1 == line_count && !bytes.ends_with(b"\n"))
            || line.is_empty()
        {
            continue;
        }
        if let Ok(entry) = serde_json::from_slice::<Value>(line) {
            update_summary_fields(&entry, fields);
        }
    }
}

fn summarize_file(file_path: &Path, accepted_paths: &[String]) -> Option<ClaudeSessionSummary> {
    let id = file_path.file_stem()?.to_str()?.to_string();
    if !valid_session_id(&id) {
        return None;
    }
    let metadata = fs::metadata(file_path).ok()?;
    let file_len = metadata.len() as usize;
    let mut file = File::open(file_path).ok()?;
    let mut fields = SummaryFields::default();

    if file_len <= SUMMARY_EDGE_BYTES * 2 {
        let mut contents = Vec::with_capacity(file_len);
        file.read_to_end(&mut contents).ok()?;
        scan_summary_bytes(&contents, false, false, &mut fields);
    } else {
        let mut head = Vec::with_capacity(SUMMARY_EDGE_BYTES);
        std::io::Read::by_ref(&mut file)
            .take(SUMMARY_EDGE_BYTES as u64)
            .read_to_end(&mut head)
            .ok()?;
        scan_summary_bytes(&head, false, true, &mut fields);

        let cwd = fields.cwd.as_deref()?;
        if !accepted_paths.iter().any(|path| path == cwd) {
            return None;
        }

        file.seek(SeekFrom::End(-(SUMMARY_EDGE_BYTES as i64))).ok()?;
        let mut tail = Vec::with_capacity(SUMMARY_EDGE_BYTES);
        file.read_to_end(&mut tail).ok()?;
        scan_summary_bytes(&tail, true, false, &mut fields);
    }

    let cwd = fields.cwd?;
    if !accepted_paths.iter().any(|path| path == &cwd) {
        return None;
    }
    let created_at = unix_seconds(metadata.created());
    let updated_at = unix_seconds(metadata.modified());
    let preview = fields.preview.unwrap_or_default();
    let title = fields.title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| preview.chars().take(80).collect());
    Some(ClaudeSessionSummary {
        id,
        path: cwd,
        title: if title.is_empty() { "Neue Unterhaltung".into() } else { title },
        preview,
        created_at: if created_at == 0 { updated_at } else { created_at },
        updated_at,
        model: fields.model,
        permission_mode: fields.permission_mode,
    })
}

fn read_session_cwd(file_path: &Path) -> Option<String> {
    let file = File::open(file_path).ok()?;
    let mut head = Vec::with_capacity(SUMMARY_EDGE_BYTES);
    file.take(SUMMARY_EDGE_BYTES as u64)
        .read_to_end(&mut head)
        .ok()?;
    for line in head.split(|byte| *byte == b'\n') {
        let Ok(entry) = serde_json::from_slice::<Value>(line) else {
            continue;
        };
        if let Some(cwd) = entry.get("cwd").and_then(Value::as_str) {
            return Some(cwd.to_string());
        }
    }

    // Extremely large first records are unusual, but retaining a slow fallback
    // keeps old/hand-edited Claude histories discoverable.
    for line in BufReader::new(File::open(file_path).ok()?)
        .lines()
        .map_while(Result::ok)
    {
        let Ok(entry) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(cwd) = entry.get("cwd").and_then(Value::as_str) {
            return Some(cwd.to_string());
        }
    }
    None
}

fn session_file(session_id: &str, path: &str) -> Result<PathBuf, String> {
    if !valid_session_id(session_id) {
        return Err("Ungültige Claude-Session-ID.".into());
    }
    let projects = claude_projects_dir()?;
    let direct = projects.join(project_dir_name(path)).join(format!("{session_id}.jsonl"));
    if is_regular_file(&direct) && read_session_cwd(&direct).as_deref() == Some(path) {
        return Ok(direct);
    }
    let directories = fs::read_dir(projects).map_err(|error| error.to_string())?;
    for directory in directories.flatten() {
        let candidate = directory.path().join(format!("{session_id}.jsonl"));
        if is_regular_file(&candidate) && read_session_cwd(&candidate).as_deref() == Some(path) {
            return Ok(candidate);
        }
    }
    Err("Claude-Unterhaltung wurde nicht gefunden.".into())
}

type SummaryCacheKey = (PathBuf, u64, u64);
static SUMMARY_CACHE: once_cell::sync::Lazy<
    std::sync::Mutex<std::collections::HashMap<SummaryCacheKey, Option<ClaudeSessionSummary>>>,
> = once_cell::sync::Lazy::new(Default::default);

fn cached_summary(
    path: &Path,
    modified: u64,
    size: u64,
    accepted_paths: &[String],
) -> Option<ClaudeSessionSummary> {
    let key = (path.to_path_buf(), modified, size);
    if let Some(hit) = SUMMARY_CACHE.lock().ok().and_then(|cache| cache.get(&key).cloned()) {
        return hit;
    }
    let summary = summarize_file(path, accepted_paths);
    if let Ok(mut cache) = SUMMARY_CACHE.lock() {
        if cache.len() > 4_000 {
            cache.clear();
        }
        cache.insert(key, summary.clone());
    }
    summary
}

#[tauri::command]
pub async fn claude_list_sessions(paths: Vec<String>) -> Result<Vec<ClaudeSessionSummary>, String> {
    tokio::task::spawn_blocking(move || {
        let projects = claude_projects_dir()?;
        if !projects.is_dir() {
            return Ok(Vec::new());
        }
        let mut candidates = Vec::new();
        let directories: std::collections::BTreeSet<PathBuf> = paths
            .iter()
            .map(|path| projects.join(project_dir_name(path)))
            .collect();
        for directory in directories {
            for file in fs::read_dir(&directory).into_iter().flatten().flatten() {
                let path = file.path();
                if path.extension().and_then(|value| value.to_str()) != Some("jsonl")
                    || !is_regular_file(&path)
                {
                    continue;
                }
                let Ok(metadata) = fs::metadata(&path) else {
                    continue;
                };
                candidates.push((unix_seconds(metadata.modified()), metadata.len(), path));
            }
        }
        candidates.sort_unstable_by(|a, b| b.0.cmp(&a.0));
        candidates.truncate(500);

        let workers = std::thread::available_parallelism()
            .map(|value| value.get())
            .unwrap_or(4)
            .min(candidates.len().max(1));
        let paths = &paths;
        let mut sessions: Vec<ClaudeSessionSummary> = std::thread::scope(|scope| {
            candidates
                .chunks(candidates.len().div_ceil(workers).max(1))
                .map(|chunk| {
                    scope.spawn(move || {
                        chunk
                            .iter()
                            .filter_map(|(modified, size, path)| {
                                cached_summary(path, *modified, *size, paths)
                            })
                            .collect::<Vec<_>>()
                    })
                })
                .collect::<Vec<_>>()
                .into_iter()
                .filter_map(|handle| handle.join().ok())
                .flatten()
                .collect()
        });
        sessions.sort_unstable_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(sessions)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_read_session(path: String, session_id: String) -> Result<ClaudeSessionTranscript, String> {
    tokio::task::spawn_blocking(move || {
        let file_path = session_file(&session_id, &path)?;
        let metadata = fs::metadata(&file_path).map_err(|error| error.to_string())?;
        let summary = cached_summary(
            &file_path,
            unix_seconds(metadata.modified()),
            metadata.len(),
            &[path],
        )
        .ok_or_else(|| "Claude-Unterhaltung konnte nicht gelesen werden.".to_string())?;
        let file = File::open(file_path).map_err(|error| error.to_string())?;
        let entries = BufReader::new(file)
            .lines()
            .map_while(Result::ok)
            .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
            .filter(|entry| {
                matches!(
                    entry.get("type").and_then(Value::as_str),
                    Some("user") | Some("assistant") | Some("system") | Some("result")
                )
            })
            .map(sanitize_entry)
            .collect();
        Ok(ClaudeSessionTranscript { summary, entries })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_rename_session(path: String, session_id: String, title: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let title = title.trim();
        if title.is_empty() || title.len() > 300 || title.chars().any(char::is_control) {
            return Err("Ungültiger Claude-Unterhaltungstitel.".into());
        }
        let file_path = session_file(&session_id, &path)?;
        let mut file = OpenOptions::new()
            .append(true)
            .open(file_path)
            .map_err(|error| error.to_string())?;
        let record = json!({
            "type": "custom-title",
            "customTitle": title,
            "sessionId": session_id,
        });
        serde_json::to_writer(&mut file, &record).map_err(|error| error.to_string())?;
        file.write_all(b"\n").map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_delete_session(path: String, session_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let file_path = session_file(&session_id, &path)?;
        let trash = dirs::home_dir()
            .ok_or_else(|| "Home-Verzeichnis wurde nicht gefunden.".to_string())?
            .join(".claude")
            .join("l8git-trash");
        fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
        let target = trash.join(format!("{}-{session_id}.jsonl", unix_seconds(Ok(SystemTime::now()))));
        fs::rename(file_path, target).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn claude_json(args: &[&str], cwd: Option<&str>) -> Result<Value, String> {
    let executable = resolve_cli_path("claude")
        .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
    let mut command = cli_command(executable);
    command.args(args).stdin(Stdio::null());
    if let Some(cwd) = cwd {
        if !Path::new(cwd).is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        command.current_dir(cwd);
    }
    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn claude_auth_status() -> Result<Value, String> {
    tokio::task::spawn_blocking(|| claude_json(&["auth", "status", "--json"], None))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_start_login() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let executable = resolve_cli_path("claude")
            .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
        cli_command(executable)
            .args(["auth", "login"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(String::new())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_logout() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        let executable = resolve_cli_path("claude")
            .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
        let status = cli_command(executable)
            .args(["auth", "logout"])
            .status()
            .map_err(|error| error.to_string())?;
        status.success().then_some(()).ok_or_else(|| "Claude-Abmeldung ist fehlgeschlagen.".into())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_list_plugins(path: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        let plugins = claude_json(&["plugin", "list", "--json"], Some(&path))?;
        let filtered = plugins
            .as_array()
            .into_iter()
            .flatten()
            .filter(|plugin| {
                plugin.get("scope").and_then(Value::as_str) != Some("local")
                    || plugin.get("projectPath").and_then(Value::as_str) == Some(path.as_str())
            })
            .cloned()
            .collect::<Vec<_>>();
        Ok(Value::Array(filtered))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_list_skills(path: String) -> Result<Vec<ClaudeSkill>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        let mut skills = Vec::new();
        if let Some(home) = dirs::home_dir() {
            scan_skills(&home.join(".claude").join("skills"), "user", 0, &mut skills);
        }
        scan_skills(&repo.join(".claude").join("skills"), "project", 0, &mut skills);
        if let Ok(plugins) = claude_json(&["plugin", "list", "--json"], repo.to_str()) {
            for plugin in plugins.as_array().into_iter().flatten() {
                if plugin.get("enabled").and_then(Value::as_bool) == Some(false) {
                    continue;
                }
                let scope = plugin.get("scope").and_then(Value::as_str).unwrap_or("plugin");
                let belongs_to_repo = plugin
                    .get("projectPath")
                    .and_then(Value::as_str)
                    .map(|candidate| candidate == repo.to_string_lossy())
                    .unwrap_or(true);
                if scope == "local" && !belongs_to_repo {
                    continue;
                }
                if let Some(install_path) = plugin.get("installPath").and_then(Value::as_str) {
                    scan_skills(&PathBuf::from(install_path).join("skills"), "plugin", 0, &mut skills);
                }
            }
        }
        skills.sort_by(|a, b| a.name.cmp(&b.name).then(a.path.cmp(&b.path)));
        skills.dedup_by(|a, b| a.path == b.path);
        Ok(skills)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_list_hooks(path: String) -> Result<Vec<ClaudeHook>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        let mut hooks = Vec::new();
        if let Some(home) = dirs::home_dir() {
            hooks_from_file(&home.join(".claude").join("settings.json"), "user", &mut hooks);
        }
        hooks_from_file(&repo.join(".claude").join("settings.json"), "project", &mut hooks);
        hooks_from_file(&repo.join(".claude").join("settings.local.json"), "local", &mut hooks);
        Ok(hooks)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn managed_roots(repo: &Path) -> Vec<PathBuf> {
    let mut roots = vec![repo.join(".claude")];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".claude"));
    }
    roots
        .iter()
        .filter_map(|root| fs::canonicalize(root).ok())
        .collect()
}

fn managed_path(repo: &Path, target: &str) -> Result<PathBuf, String> {
    let target = PathBuf::from(target.trim());
    let canonical = fs::canonicalize(&target)
        .map_err(|_| "Die Datei existiert nicht mehr.".to_string())?;
    let allowed = managed_roots(repo)
        .into_iter()
        .any(|root| canonical.starts_with(&root));
    if !allowed {
        return Err("Nur Dateien in .claude dürfen bearbeitet werden.".into());
    }
    Ok(canonical)
}

fn scan_markdown(
    root: &Path,
    scope: &str,
    prefix: &str,
    depth: usize,
    output: &mut Vec<ClaudeCapabilityFile>,
) {
    if depth > 6 || output.len() >= 2_000 || !root.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if metadata.is_dir() {
            scan_markdown(&path, scope, &format!("{prefix}{file_name}:"), depth + 1, output);
            continue;
        }
        let Some(stem) = file_name.strip_suffix(".md") else {
            continue;
        };
        let contents = fs::read_to_string(&path).unwrap_or_default();
        output.push(ClaudeCapabilityFile {
            name: format!("{prefix}{stem}"),
            description: frontmatter_value(&contents, "description").unwrap_or_default(),
            path: path.to_string_lossy().into_owned(),
            scope: scope.into(),
        });
    }
}

#[tauri::command]
pub async fn claude_list_capability_files(
    path: String,
    kind: String,
) -> Result<Vec<ClaudeCapabilityFile>, String> {
    tokio::task::spawn_blocking(move || {
        if kind != "commands" && kind != "agents" {
            return Err("Unbekannte Capability-Art.".into());
        }
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        let mut files = Vec::new();
        if let Some(home) = dirs::home_dir() {
            scan_markdown(&home.join(".claude").join(&kind), "user", "", 0, &mut files);
        }
        scan_markdown(&repo.join(".claude").join(&kind), "project", "", 0, &mut files);
        files.sort_by(|a, b| a.name.cmp(&b.name).then(a.path.cmp(&b.path)));
        Ok(files)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_read_capability_file(path: String, file: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let target = managed_path(&PathBuf::from(path.trim()), &file)?;
        fs::read_to_string(target).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_write_capability_file(
    path: String,
    file: String,
    contents: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let target = managed_path(&PathBuf::from(path.trim()), &file)?;
        if !is_regular_file(&target) {
            return Err("Nur reguläre Dateien können geschrieben werden.".into());
        }
        fs::write(target, contents).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_delete_capability_file(path: String, file: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let target = managed_path(&PathBuf::from(path.trim()), &file)?;
        let skill_directory = target
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name == "SKILL.md")
            .unwrap_or(false)
            .then(|| target.parent().map(Path::to_path_buf))
            .flatten();
        match skill_directory {
            Some(directory) => fs::remove_dir_all(directory).map_err(|error| error.to_string()),
            None => fs::remove_file(target).map_err(|error| error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_set_hook_disabled(
    path: String,
    source: String,
    key: String,
    disabled: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let target = managed_path(&PathBuf::from(path.trim()), &source)?;
        let parts = key.split(':').collect::<Vec<_>>();
        let [_, event_name, group_index, handler_index] = parts.as_slice() else {
            return Err("Ungültiger Hook-Schlüssel.".into());
        };
        let group_index = group_index.parse::<usize>().map_err(|_| "Ungültiger Hook-Schlüssel.".to_string())?;
        let handler_index = handler_index.parse::<usize>().map_err(|_| "Ungültiger Hook-Schlüssel.".to_string())?;
        let contents = fs::read(&target).map_err(|error| error.to_string())?;
        let mut settings: Value = serde_json::from_slice(&contents).map_err(|error| error.to_string())?;
        let group = settings
            .get_mut("hooks")
            .and_then(|hooks| hooks.get_mut(*event_name))
            .and_then(|groups| groups.get_mut(group_index))
            .ok_or_else(|| "Hook wurde nicht gefunden.".to_string())?;
        let handler = match group.get_mut("hooks").and_then(Value::as_array_mut) {
            Some(handlers) => handlers
                .get_mut(handler_index)
                .ok_or_else(|| "Hook wurde nicht gefunden.".to_string())?,
            None => group,
        };
        let object = handler
            .as_object_mut()
            .ok_or_else(|| "Hook wurde nicht gefunden.".to_string())?;
        if disabled {
            object.insert("disabled".into(), Value::Bool(true));
        } else {
            object.remove("disabled");
        }
        let serialized = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
        fs::write(target, format!("{serialized}\n")).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn claude_cli(args: &[&str], repo: &Path) -> Result<(), String> {
    let executable = resolve_cli_path("claude")
        .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
    let output = cli_command(executable)
        .args(args)
        .current_dir(repo)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if message.is_empty() { "Claude-CLI-Befehl ist fehlgeschlagen.".into() } else { message })
}

fn cli_argument(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 200
        || value.starts_with('-')
        || value.chars().any(char::is_control)
    {
        return Err("Ungültiger Name.".into());
    }
    Ok(value)
}

#[tauri::command]
pub async fn claude_set_plugin_enabled(
    path: String,
    plugin: String,
    enabled: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        let plugin = cli_argument(&plugin)?;
        claude_cli(&["plugin", if enabled { "enable" } else { "disable" }, plugin], &repo)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_uninstall_plugin(path: String, plugin: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        let plugin = cli_argument(&plugin)?;
        claude_cli(&["plugin", "uninstall", plugin], &repo)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_mcp_remove(path: String, name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        let name = cli_argument(&name)?;
        claude_cli(&["mcp", "remove", name], &repo)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_mcp_login(path: String, name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        if !repo.is_dir() {
            return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
        }
        let name = cli_argument(&name)?;
        let executable = resolve_cli_path("claude")
            .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
        cli_command(executable)
            .args(["mcp", "login", name])
            .current_dir(repo)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        hooks_from_file, managed_path, project_dir_name, sanitize_entry, scan_skills,
        summarize_file, SUMMARY_EDGE_BYTES,
    };
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn managed_path_only_accepts_dot_claude_files() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let repo = std::env::temp_dir().join(format!("l8git-managed-{suffix}"));
        let inside = repo.join(".claude").join("commands");
        fs::create_dir_all(&inside).unwrap();
        let allowed = inside.join("demo.md");
        fs::write(&allowed, "demo").unwrap();
        let outside = repo.join("secrets.md");
        fs::write(&outside, "nope").unwrap();

        assert!(managed_path(&repo, allowed.to_str().unwrap()).is_ok());
        assert!(managed_path(&repo, outside.to_str().unwrap()).is_err());
        assert!(managed_path(
            &repo,
            inside.join("..").join("..").join("secrets.md").to_str().unwrap()
        )
        .is_err());
        assert!(managed_path(&repo, allowed.join("missing.md").to_str().unwrap()).is_err());

        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn maps_cwd_to_claude_project_directory() {
        assert_eq!(
            project_dir_name("/Users/leon/Repositories/l8git"),
            "-Users-leon-Repositories-l8git"
        );
        assert_eq!(
            project_dir_name("/Users/leon/Library/com.apple.CloudDocs"),
            "-Users-leon-Library-com-apple-CloudDocs"
        );
    }

    #[test]
    fn reads_claude_history_and_strips_thinking_signatures() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("l8git-claude-test-{suffix}"));
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("12345678-1234-1234-1234-123456789abc.jsonl");
        fs::write(
            &file,
            concat!(
                "{\"type\":\"user\",\"cwd\":\"/repo\",\"message\":{\"content\":\"Build it\"}}\n",
                "{\"type\":\"assistant\",\"message\":{\"model\":\"claude-test\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"x\",\"signature\":\"secret\"}]}}\n",
                "{\"type\":\"custom-title\",\"customTitle\":\"Test chat\"}\n"
            ),
        )
        .unwrap();

        let summary = summarize_file(&file, &["/repo".into()]).unwrap();
        assert_eq!(summary.title, "Test chat");
        assert_eq!(summary.preview, "Build it");
        assert_eq!(summary.model.as_deref(), Some("claude-test"));

        let large_file = directory.join("87654321-4321-4321-4321-cba987654321.jsonl");
        let mut large_history = String::from(
            "{\"type\":\"user\",\"cwd\":\"/repo\",\"message\":{\"content\":\"Large history\"}}\n",
        );
        while large_history.len() <= SUMMARY_EDGE_BYTES * 2 {
            large_history.push_str(
                "{\"type\":\"system\",\"message\":{\"content\":\"padding-padding-padding-padding-padding\"}}\n",
            );
        }
        large_history.push_str(
            "{\"type\":\"assistant\",\"message\":{\"model\":\"claude-tail\",\"content\":[{\"type\":\"text\",\"text\":\"Done\"}]}}\n{\"type\":\"custom-title\",\"customTitle\":\"Large chat\"}\n",
        );
        fs::write(&large_file, large_history).unwrap();
        let large_summary = summarize_file(&large_file, &["/repo".into()]).unwrap();
        assert_eq!(large_summary.preview, "Large history");
        assert_eq!(large_summary.title, "Large chat");
        assert_eq!(large_summary.model.as_deref(), Some("claude-tail"));
        let sanitized = sanitize_entry(serde_json::json!({
            "message": { "content": [{ "type": "thinking", "signature": "secret" }] }
        }));
        assert!(sanitized["message"]["content"][0].get("signature").is_none());

        let skill_dir = directory.join("skills").join("test-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: test-skill\ndescription: Test description\n---\nInstructions\n",
        )
        .unwrap();
        let mut skills = Vec::new();
        scan_skills(&directory.join("skills"), "project", 0, &mut skills);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "test-skill");

        let settings = directory.join("settings.json");
        fs::write(
            &settings,
            r#"{"hooks":{"PostToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"echo ok"}]}]}}"#,
        )
        .unwrap();
        let mut hooks = Vec::new();
        hooks_from_file(&settings, "project", &mut hooks);
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].event_name, "PostToolUse");
        assert_eq!(hooks[0].command.as_deref(), Some("echo ok"));

        let cursor_hooks = directory.join("hooks.json");
        fs::write(
            &cursor_hooks,
            r#"{"version":1,"hooks":{"sessionStart":[{"command":"run.sh SessionStart"}],"stop":[{"command":"run.sh Stop"}]}}"#,
        )
        .unwrap();
        let mut flat = Vec::new();
        hooks_from_file(&cursor_hooks, "user", &mut flat);
        assert_eq!(flat.len(), 2);
        assert_eq!(flat[0].event_name, "sessionStart");
        assert_eq!(flat[0].command.as_deref(), Some("run.sh SessionStart"));
        assert_eq!(flat[1].event_name, "stop");
        fs::remove_file(cursor_hooks).unwrap();

        fs::remove_file(file).unwrap();
        fs::remove_file(large_file).unwrap();
        fs::remove_file(settings).unwrap();
        fs::remove_file(skill_dir.join("SKILL.md")).unwrap();
        fs::remove_dir(skill_dir).unwrap();
        fs::remove_dir(directory.join("skills")).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
