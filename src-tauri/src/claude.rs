use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};

use crate::agent_transport::redact;
use crate::cmd::cli_command;
use crate::shell::resolve_cli_path;

const RECENT_STDERR_CAPACITY: usize = 20;

fn recent_stderr_buffer() -> &'static Mutex<VecDeque<String>> {
    static BUF: OnceLock<Mutex<VecDeque<String>>> = OnceLock::new();
    BUF.get_or_init(|| Mutex::new(VecDeque::with_capacity(RECENT_STDERR_CAPACITY)))
}

fn record_stderr(raw: &str) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }
    let mut buffer = recent_stderr_buffer().lock().unwrap_or_else(|e| e.into_inner());
    if buffer.len() >= RECENT_STDERR_CAPACITY {
        buffer.pop_front();
    }
    buffer.push_back(redact(trimmed));
}

fn recent_stderr_snapshot() -> Vec<String> {
    recent_stderr_buffer()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .cloned()
        .collect()
}

fn login_process_key(config_dir: Option<&str>) -> String {
    config_dir.map(str::trim).filter(|value| !value.is_empty()).unwrap_or("").to_string()
}

fn login_processes() -> &'static Mutex<std::collections::HashMap<String, Child>> {
    static MAP: OnceLock<Mutex<std::collections::HashMap<String, Child>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

fn stop_login_process(child: &mut Child) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        unsafe { libc::kill(-pid, libc::SIGTERM) };
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        if std::time::Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        unsafe { libc::kill(-pid, libc::SIGKILL) };
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn stop_login_process_for(config_dir: Option<&str>) {
    let key = login_process_key(config_dir);
    let mut child = {
        let mut processes = login_processes().lock().unwrap_or_else(|e| e.into_inner());
        processes.remove(&key)
    };
    if let Some(child) = child.as_mut() {
        stop_login_process(child);
    }
}

fn skip_zero(value: &u32) -> bool {
    *value == 0
}

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
    #[serde(skip_serializing_if = "skip_zero")]
    additions: u32,
    #[serde(skip_serializing_if = "skip_zero")]
    deletions: u32,
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

fn claude_home_dir(config_dir: Option<&str>) -> Result<PathBuf, String> {
    match config_dir.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => Ok(PathBuf::from(value)),
        None => dirs::home_dir()
            .map(|home| home.join(".claude"))
            .ok_or_else(|| "Claude-Konfigurationsverzeichnis konnte nicht bestimmt werden.".into()),
    }
}

fn claude_projects_dir(config_dir: Option<&str>) -> Result<PathBuf, String> {
    Ok(claude_home_dir(config_dir)?.join("projects"))
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

/// Blocks Claude Code injects into user entries that carry nothing a reader
/// wants to see in a chat title or preview.
const CLI_META_DROP_TAGS: [&str; 7] = [
    "system-reminder",
    "local-command-caveat",
    "command-message",
    "user-prompt-submit-hook",
    "ide_opened_file",
    "ide_selection",
    "ide_diagnostics",
];

/// Blocks naming the slash or bash command that produced the entry.
const CLI_META_COMMAND_TAGS: [&str; 4] = [
    "command-name",
    "bash-input",
    "command-args",
    "command-contents",
];

/// Blocks holding the local output of an executed command.
const CLI_META_OUTPUT_TAGS: [&str; 4] = [
    "local-command-stdout",
    "local-command-stderr",
    "bash-stdout",
    "bash-stderr",
];

const BARE_CAVEAT_PREFIX: &str =
    "Caveat: The messages below were generated by the user while running local commands.";

fn meta_tag_at(rest: &str) -> Option<&'static str> {
    CLI_META_DROP_TAGS
        .iter()
        .chain(CLI_META_COMMAND_TAGS.iter())
        .chain(CLI_META_OUTPUT_TAGS.iter())
        .find(|tag| {
            // Compare bytes: the text after `<` may start mid-way through a
            // multi-byte character, which would make string slicing panic.
            let bytes = rest.as_bytes();
            bytes.len() > tag.len() + 1
                && bytes[tag.len() + 1] == b'>'
                && bytes[1..=tag.len()].eq_ignore_ascii_case(tag.as_bytes())
        })
        .copied()
}

/// Turns a raw transcript message into the text worth showing as a chat
/// preview: the human prompt when there is one, otherwise the command that ran.
fn summary_preview(raw: &str) -> String {
    let mut text = String::with_capacity(raw.len());
    let mut command = Vec::new();
    let mut rest = raw;

    while let Some(offset) = rest.find('<') {
        text.push_str(&rest[..offset]);
        rest = &rest[offset..];
        let Some(tag) = meta_tag_at(rest) else {
            text.push('<');
            rest = &rest[1..];
            continue;
        };
        let body_start = tag.len() + 2;
        let closing = format!("</{tag}>");
        // ASCII-lowercasing keeps byte offsets intact, so the closing tag can be
        // matched case-insensitively without shifting the body boundaries.
        let haystack = rest[body_start..].to_ascii_lowercase();
        // A truncated transcript can leave the block unterminated; drop the tail.
        let Some(body_end) = haystack.find(&closing) else {
            rest = "";
            break;
        };
        let body = rest[body_start..body_start + body_end].trim();
        if !body.is_empty() && CLI_META_COMMAND_TAGS.contains(&tag) {
            command.push(if tag == "bash-input" {
                format!("!{body}")
            } else {
                body.to_string()
            });
        }
        rest = &rest[body_start + body_end + closing.len()..];
    }
    text.push_str(rest);

    let cleaned = text
        .lines()
        .filter(|line| !line.trim_start().starts_with(BARE_CAVEAT_PREFIX))
        .collect::<Vec<_>>()
        .join("\n");
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        command.join(" ")
    } else {
        cleaned.to_string()
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
    additions: u32,
    deletions: u32,
}

fn count_structured_patch(value: &Value, additions: &mut u32, deletions: &mut u32) {
    let Some(patch) = value.get("structuredPatch").and_then(Value::as_array) else {
        return;
    };
    for hunk in patch {
        let Some(lines) = hunk.get("lines").and_then(Value::as_array) else {
            continue;
        };
        for line in lines {
            let Some(text) = line.as_str() else {
                continue;
            };
            if text.starts_with('+') {
                *additions += 1;
            } else if text.starts_with('-') {
                *deletions += 1;
            }
        }
    }
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
            .and_then(text_from_content)
            .map(|text| summary_preview(&text))
            .filter(|text| !text.is_empty());
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
    if let Some(result) = entry.get("toolUseResult") {
        count_structured_patch(result, &mut fields.additions, &mut fields.deletions);
    }
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
        additions: fields.additions,
        deletions: fields.deletions,
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

fn session_file(session_id: &str, path: &str, config_dir: Option<&str>) -> Result<PathBuf, String> {
    if !valid_session_id(session_id) {
        return Err("Ungültige Claude-Session-ID.".into());
    }
    let projects = claude_projects_dir(config_dir)?;
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
pub async fn claude_list_sessions(
    paths: Vec<String>,
    config_dir: Option<String>,
) -> Result<Vec<ClaudeSessionSummary>, String> {
    tokio::task::spawn_blocking(move || {
        let projects = claude_projects_dir(config_dir.as_deref())?;
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
pub async fn claude_read_session(
    path: String,
    session_id: String,
    config_dir: Option<String>,
) -> Result<ClaudeSessionTranscript, String> {
    tokio::task::spawn_blocking(move || {
        let file_path = session_file(&session_id, &path, config_dir.as_deref())?;
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
pub async fn claude_rename_session(
    path: String,
    session_id: String,
    title: String,
    config_dir: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let title = title.trim();
        if title.is_empty() || title.len() > 300 || title.chars().any(char::is_control) {
            return Err("Ungültiger Claude-Unterhaltungstitel.".into());
        }
        let file_path = session_file(&session_id, &path, config_dir.as_deref())?;
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
pub async fn claude_delete_session(
    path: String,
    session_id: String,
    config_dir: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let file_path = session_file(&session_id, &path, config_dir.as_deref())?;
        let trash = claude_home_dir(config_dir.as_deref())?.join("l8git-trash");
        fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
        let target = trash.join(format!("{}-{session_id}.jsonl", unix_seconds(Ok(SystemTime::now()))));
        fs::rename(file_path, target).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn claude_json(args: &[&str], cwd: Option<&str>, config_dir: Option<&str>) -> Result<Value, String> {
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
    if let Some(config_dir) = config_dir.map(str::trim).filter(|value| !value.is_empty()) {
        command.env("CLAUDE_CONFIG_DIR", config_dir);
    }
    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        record_stderr(&message);
        return Err(message);
    }
    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

const MIN_TESTED_CLAUDE_VERSION: (u32, u32, u32) = (1, 0, 0);

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeVersionStatus {
    status: &'static str,
    version: Option<String>,
    minimum_tested: String,
}

fn parse_claude_version(raw: &str) -> Option<(u32, u32, u32)> {
    let digits = raw.trim().split(|c: char| !c.is_ascii_digit() && c != '.').next()?;
    let mut parts = digits.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

fn claude_version_status_from_output(raw: &str) -> ClaudeVersionStatus {
    let minimum_tested = format!(
        "{}.{}.{}",
        MIN_TESTED_CLAUDE_VERSION.0, MIN_TESTED_CLAUDE_VERSION.1, MIN_TESTED_CLAUDE_VERSION.2
    );
    match parse_claude_version(raw) {
        Some(version) if version >= MIN_TESTED_CLAUDE_VERSION => ClaudeVersionStatus {
            status: "ok",
            version: Some(format!("{}.{}.{}", version.0, version.1, version.2)),
            minimum_tested,
        },
        Some(version) => ClaudeVersionStatus {
            status: "outdated",
            version: Some(format!("{}.{}.{}", version.0, version.1, version.2)),
            minimum_tested,
        },
        None => ClaudeVersionStatus {
            status: "unknown",
            version: None,
            minimum_tested,
        },
    }
}

#[tauri::command]
pub async fn claude_version_status() -> Result<ClaudeVersionStatus, String> {
    tokio::task::spawn_blocking(|| {
        let executable = resolve_cli_path("claude")
            .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
        let output = cli_command(executable)
            .arg("--version")
            .stdin(Stdio::null())
            .output()
            .map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Ok(claude_version_status_from_output(""));
        }
        let raw = String::from_utf8_lossy(&output.stdout);
        Ok(claude_version_status_from_output(&raw))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallOwnerInfo {
    kind: &'static str,
    update_command: Option<String>,
}

fn classify_install_owner(binary_path: &str) -> &'static str {
    let normalized = binary_path.replace('\\', "/");
    if normalized.contains("/node_modules/.bin/") || normalized.contains("npm-global") || normalized.contains("/.npm/") {
        "npm-global"
    } else if normalized.contains("/opt/homebrew/") || normalized.contains("/usr/local/Cellar/") || normalized.contains("/Cellar/") {
        "homebrew"
    } else if normalized.contains("/.claude/local/") || normalized.contains("native-installer") {
        "native-installer"
    } else {
        "unknown"
    }
}

fn path_is_writable(path: &Path) -> bool {
    let target = if path.exists() {
        path.to_path_buf()
    } else {
        match path.parent() {
            Some(parent) => parent.to_path_buf(),
            None => return false,
        }
    };
    match fs::metadata(&target) {
        Ok(metadata) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                metadata.permissions().mode() & 0o200 != 0
            }
            #[cfg(not(unix))]
            {
                !metadata.permissions().readonly()
            }
        }
        Err(_) => false,
    }
}

fn update_command_for_kind(kind: &str) -> Option<String> {
    match kind {
        "npm-global" => Some("npm install -g @anthropic-ai/claude-code@latest".to_string()),
        "homebrew" => Some("brew upgrade claude-code".to_string()),
        "native-installer" => Some("claude update".to_string()),
        _ => None,
    }
}

fn claude_install_owner_info(binary_path: &str) -> Result<InstallOwnerInfo, String> {
    let path = PathBuf::from(binary_path.trim());
    let kind = classify_install_owner(binary_path);
    if kind == "unknown" {
        return Err("Unbekannte Installationsquelle: Update kann nicht automatisch ausgeführt werden.".into());
    }
    if !path_is_writable(&path) {
        return Err("Binary-Pfad ist nicht beschreibbar: Update kann nicht ausgeführt werden.".into());
    }
    Ok(InstallOwnerInfo {
        kind,
        update_command: update_command_for_kind(kind),
    })
}

#[tauri::command]
pub async fn claude_install_owner(binary_path: String) -> Result<InstallOwnerInfo, String> {
    tokio::task::spawn_blocking(move || claude_install_owner_info(&binary_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_auth_status(config_dir: Option<String>) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        claude_json(&["auth", "status", "--json"], None, config_dir.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_start_login(config_dir: Option<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let executable = resolve_cli_path("claude")
            .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
        stop_login_process_for(config_dir.as_deref());
        let mut command = cli_command(executable);
        command.args(["auth", "login"]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                command.pre_exec(|| {
                    libc::setpgid(0, 0);
                    Ok(())
                });
            }
        }
        if let Some(config_dir) = config_dir.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            command.env("CLAUDE_CONFIG_DIR", config_dir);
        }
        let child = command.spawn().map_err(|error| error.to_string())?;
        let key = login_process_key(config_dir.as_deref());
        login_processes().lock().unwrap_or_else(|e| e.into_inner()).insert(key, child);
        Ok(String::new())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_cancel_login(config_dir: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        stop_login_process_for(config_dir.as_deref());
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_logout(config_dir: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        stop_login_process_for(config_dir.as_deref());
        let executable = resolve_cli_path("claude")
            .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
        let mut command = cli_command(executable);
        command.args(["auth", "logout"]);
        if let Some(config_dir) = config_dir.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            command.env("CLAUDE_CONFIG_DIR", config_dir);
        }
        let output = command.output().map_err(|error| error.to_string())?;
        if output.status.success() {
            return Ok(());
        }
        record_stderr(&String::from_utf8_lossy(&output.stderr));
        Err("Claude-Abmeldung ist fehlgeschlagen.".to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn managed_settings_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        Some(PathBuf::from("/Library/Application Support/ClaudeCode/managed-settings.json"))
    }
    #[cfg(target_os = "linux")]
    {
        Some(PathBuf::from("/etc/claude-code/managed-settings.json"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("ProgramData")
            .map(|root| PathBuf::from(root).join("ClaudeCode").join("managed-settings.json"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

fn read_settings_json(path: &Path) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_else(|| json!({}))
}

fn merge_settings(base: &mut Value, overlay: &Value) {
    let (Value::Object(base_map), Value::Object(overlay_map)) = (base, overlay) else {
        return;
    };
    for (key, value) in overlay_map {
        base_map.insert(key.clone(), value.clone());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSource {
    scope: String,
    path: String,
    exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveSettings {
    settings: Value,
    sources: Vec<SettingsSource>,
}

fn settings_scope_paths(config_dir: Option<&str>, repo: &str) -> Result<Vec<(&'static str, PathBuf)>, String> {
    let repo = PathBuf::from(repo.trim());
    if !repo.is_dir() {
        return Err("Claude-Arbeitsverzeichnis existiert nicht.".into());
    }
    let mut paths = Vec::new();
    if let Some(managed) = managed_settings_path() {
        paths.push(("managed", managed));
    }
    paths.push(("user", claude_home_dir(config_dir)?.join("settings.json")));
    paths.push(("project", repo.join(".claude").join("settings.json")));
    paths.push(("local", repo.join(".claude").join("settings.local.json")));
    Ok(paths)
}

/// Precedence, weakest to strongest: managed < user < project < local.
/// `managed` still wins per key it defines because it is re-applied last below.
#[tauri::command]
pub async fn claude_effective_settings(config_dir: Option<String>, repo: String) -> Result<EffectiveSettings, String> {
    tokio::task::spawn_blocking(move || {
        let paths = settings_scope_paths(config_dir.as_deref(), &repo)?;
        let mut merged = json!({});
        let mut sources = Vec::new();
        let mut managed = None;
        for (scope, path) in &paths {
            let exists = path.is_file();
            if exists {
                let value = read_settings_json(path);
                if *scope == "managed" {
                    managed = Some(value.clone());
                } else {
                    merge_settings(&mut merged, &value);
                }
            }
            sources.push(SettingsSource {
                scope: (*scope).to_string(),
                path: path.to_string_lossy().into_owned(),
                exists,
            });
        }
        if let Some(managed) = managed {
            merge_settings(&mut merged, &managed);
        }
        Ok(EffectiveSettings { settings: merged, sources })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_write_settings(
    scope: String,
    config_dir: Option<String>,
    repo: String,
    json: Value,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if !json.is_object() {
            return Err("Settings müssen ein JSON-Objekt sein.".into());
        }
        if scope == "managed" {
            return Err("Managed-Settings sind schreibgeschützt.".into());
        }
        let paths = settings_scope_paths(config_dir.as_deref(), &repo)?;
        let target = paths
            .into_iter()
            .find(|(candidate, _)| *candidate == scope)
            .map(|(_, path)| path)
            .ok_or_else(|| "Unbekannter Settings-Bereich.".to_string())?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut existing = read_settings_json(&target);
        merge_settings(&mut existing, &json);
        let contents = serde_json::to_vec_pretty(&existing).map_err(|error| error.to_string())?;
        atomic_write(&target, &contents)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDiagnosticsReport {
    binary_path: Option<String>,
    version: Option<String>,
    version_status: &'static str,
    config_dir: String,
    settings_sources: Vec<SettingsSource>,
    recent_stderr: Vec<String>,
    env_keys: Vec<String>,
}

const DIAGNOSTIC_ENV_PREFIXES: [&str; 2] = ["CLAUDE_", "ANTHROPIC_"];

#[tauri::command]
pub async fn agent_diagnostics_report(config_dir: Option<String>, repo: Option<String>) -> Result<AgentDiagnosticsReport, String> {
    tokio::task::spawn_blocking(move || {
        let binary_path = resolve_cli_path("claude").map(|path| path.to_string_lossy().into_owned());
        let version_output = binary_path.as_ref().and_then(|_| {
            resolve_cli_path("claude").and_then(|executable| {
                cli_command(executable)
                    .arg("--version")
                    .stdin(Stdio::null())
                    .output()
                    .ok()
            })
        });
        let (version, version_status) = match version_output {
            Some(output) if output.status.success() => {
                let raw = String::from_utf8_lossy(&output.stdout);
                let status = claude_version_status_from_output(&raw);
                (status.version, status.status)
            }
            _ => (None, "unknown"),
        };
        let resolved_config_dir = claude_home_dir(config_dir.as_deref())?.to_string_lossy().into_owned();
        let settings_sources = repo
            .as_deref()
            .and_then(|repo| settings_scope_paths(config_dir.as_deref(), repo).ok())
            .map(|paths| {
                paths
                    .into_iter()
                    .map(|(scope, path)| SettingsSource {
                        scope: scope.to_string(),
                        exists: path.is_file(),
                        path: path.to_string_lossy().into_owned(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let env_keys = std::env::vars()
            .map(|(key, _)| key)
            .filter(|key| DIAGNOSTIC_ENV_PREFIXES.iter().any(|prefix| key.starts_with(prefix)))
            .collect();
        Ok(AgentDiagnosticsReport {
            binary_path,
            version,
            version_status,
            config_dir: resolved_config_dir,
            settings_sources,
            recent_stderr: recent_stderr_snapshot(),
            env_keys,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn claude_list_plugins(path: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        let plugins = claude_json(&["plugin", "list", "--json"], Some(&path), None)?;
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
        if let Ok(plugins) = claude_json(&["plugin", "list", "--json"], repo.to_str(), None) {
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

fn atomic_write(target: &Path, contents: &[u8]) -> Result<(), String> {
    let directory = target
        .parent()
        .ok_or_else(|| "Ungültiger Zielpfad.".to_string())?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_name = format!(
        ".{}.{}-{}.tmp",
        target.file_name().and_then(|name| name.to_str()).unwrap_or("l8git"),
        std::process::id(),
        nanos
    );
    let tmp_path = directory.join(tmp_name);
    fs::write(&tmp_path, contents).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    if let Ok(metadata) = fs::metadata(target) {
        let _ = fs::set_permissions(&tmp_path, metadata.permissions());
    }
    let result = fs::rename(&tmp_path, target).map_err(|error| error.to_string());
    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }
    result
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
        atomic_write(&target, contents.as_bytes())
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
        let current = fs::read(&target).map_err(|error| error.to_string())?;
        if current != contents {
            return Err("Datei wurde zwischenzeitlich geändert.".into());
        }
        atomic_write(&target, format!("{serialized}\n").as_bytes())
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
        atomic_write, claude_install_owner_info, claude_version_status_from_output, classify_install_owner,
        hooks_from_file, login_process_key, managed_path, merge_settings, parse_claude_version, project_dir_name,
        record_stderr, recent_stderr_snapshot, sanitize_entry, scan_skills, settings_scope_paths, summarize_file,
        summary_preview, BARE_CAVEAT_PREFIX, SUMMARY_EDGE_BYTES,
    };
    use serde_json::json;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn atomic_write_replaces_contents_without_leaving_a_temp_file() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("l8git-atomic-{suffix}"));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("settings.json");
        fs::write(&target, "{\"old\":true}").unwrap();

        atomic_write(&target, b"{\"new\":true}").unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"new\":true}");
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path() != target)
            .collect();
        assert!(leftovers.is_empty(), "no temp file should remain: {leftovers:?}");
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_existing_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("l8git-atomic-perm-{suffix}"));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("settings.local.json");
        fs::write(&target, "{\"old\":true}").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();

        atomic_write(&target, b"{\"new\":true}").unwrap();

        let mode = fs::metadata(&target).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

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
    fn summary_preview_strips_cli_scaffolding() {
        assert_eq!(summary_preview("Build it"), "Build it");
        assert_eq!(
            summary_preview(
                "<command-name>/model</command-name><command-message>model</command-message><command-args>opus</command-args>"
            ),
            "/model opus"
        );
        assert_eq!(
            summary_preview("<local-command-stdout>Set model to Fable 5</local-command-stdout>"),
            ""
        );
        assert_eq!(
            summary_preview("<system-reminder>hidden</system-reminder>\nEchter Prompt"),
            "Echter Prompt"
        );
        assert_eq!(summary_preview("<bash-input>git status</bash-input>"), "!git status");
        // Unterminated blocks from truncated transcripts drop their tail.
        assert_eq!(summary_preview("Prompt<system-reminder>abgeschnitten"), "Prompt");
        // Angle brackets that are not scaffolding survive untouched, even when
        // multi-byte characters follow them.
        assert_eq!(summary_preview("a < b und <div>"), "a < b und <div>");
        assert_eq!(summary_preview("<ätä>üöä<system-reminder>x</system-reminder>"), "<ätä>üöä");
        assert_eq!(summary_preview("<SYSTEM-REMINDER>x</SYSTEM-REMINDER>Prompt"), "Prompt");
        assert_eq!(
            summary_preview(&format!("{BARE_CAVEAT_PREFIX} DO NOT respond.\nEchter Prompt")),
            "Echter Prompt"
        );
    }

    #[test]
    fn summary_preview_skips_command_only_entries() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("l8git-claude-meta-{suffix}"));
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("11111111-1111-1111-1111-111111111111.jsonl");
        fs::write(
            &file,
            concat!(
                "{\"type\":\"user\",\"cwd\":\"/repo\",\"message\":{\"content\":\"<local-command-stdout>Set model to Fable 5</local-command-stdout>\"}}\n",
                "{\"type\":\"user\",\"cwd\":\"/repo\",\"message\":{\"content\":\"Bitte aufräumen\"}}\n"
            ),
        )
        .unwrap();

        let summary = summarize_file(&file, &["/repo".into()]).unwrap();
        assert_eq!(summary.preview, "Bitte aufräumen");
        assert_eq!(summary.title, "Bitte aufräumen");
        fs::remove_dir_all(&directory).ok();
    }

    #[test]
    fn summary_counts_structured_patch_lines() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("l8git-claude-diff-{suffix}"));
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("22222222-2222-2222-2222-222222222222.jsonl");
        fs::write(
            &file,
            concat!(
                "{\"type\":\"user\",\"cwd\":\"/repo\",\"message\":{\"content\":\"Edit\"}}\n",
                "{\"type\":\"user\",\"cwd\":\"/repo\",\"toolUseResult\":{\"structuredPatch\":[{\"lines\":[\" context\",\"-old\",\"+new\",\"+more\"]}]}}\n"
            ),
        )
        .unwrap();
        let summary = summarize_file(&file, &["/repo".into()]).unwrap();
        assert_eq!(summary.additions, 2);
        assert_eq!(summary.deletions, 1);
        fs::remove_dir_all(&directory).ok();
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

    #[test]
    fn version_status_reports_ok_for_current_versions() {
        let status = claude_version_status_from_output("2.4.10 (Claude Code)");
        assert_eq!(status.status, "ok");
        assert_eq!(status.version.as_deref(), Some("2.4.10"));
    }

    #[test]
    fn version_status_reports_outdated_for_versions_below_minimum() {
        let status = claude_version_status_from_output("0.9.5\n");
        assert_eq!(status.status, "outdated");
        assert_eq!(status.version.as_deref(), Some("0.9.5"));
    }

    #[test]
    fn version_status_reports_unknown_for_unparseable_output() {
        let status = claude_version_status_from_output("");
        assert_eq!(status.status, "unknown");
        assert_eq!(status.version, None);
    }

    #[test]
    fn parses_bare_major_minor_versions() {
        assert_eq!(parse_claude_version("1.2"), Some((1, 2, 0)));
    }

    #[test]
    fn login_process_key_scopes_by_config_dir_and_defaults_when_empty() {
        assert_eq!(login_process_key(Some("/tmp/l8git-account-a")), "/tmp/l8git-account-a");
        assert_eq!(login_process_key(Some("  ")), "");
        assert_eq!(login_process_key(None), "");
        assert_ne!(login_process_key(Some("/tmp/a")), login_process_key(Some("/tmp/b")));
    }

    #[test]
    fn effective_settings_merge_precedence_is_user_then_project_then_local() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let repo = std::env::temp_dir().join(format!("l8git-settings-{suffix}"));
        let claude_dir = repo.join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        fs::write(claude_dir.join("settings.json"), r#"{"model":"project","foo":"bar"}"#).unwrap();
        fs::write(claude_dir.join("settings.local.json"), r#"{"model":"local"}"#).unwrap();

        let paths = settings_scope_paths(None, repo.to_str().unwrap()).unwrap();
        assert!(paths.iter().any(|(scope, _)| *scope == "user"));
        assert!(paths.iter().any(|(scope, _)| *scope == "project"));
        assert!(paths.iter().any(|(scope, _)| *scope == "local"));

        let mut merged = json!({});
        for (scope, path) in &paths {
            if *scope == "managed" || !path.is_file() {
                continue;
            }
            let value: serde_json::Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
            merge_settings(&mut merged, &value);
        }
        assert_eq!(merged["model"], "local");
        assert_eq!(merged["foo"], "bar");

        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn recent_stderr_is_redacted_and_capped() {
        record_stderr("Authorization: Bearer sk-ant-secretvalue1234567890");
        let snapshot = recent_stderr_snapshot();
        let last = snapshot.last().unwrap();
        assert!(!last.contains("sk-ant-secretvalue1234567890"));
    }

    #[test]
    fn classify_install_owner_recognizes_known_locations() {
        assert_eq!(classify_install_owner("/home/user/.npm-global/bin/claude"), "npm-global");
        assert_eq!(classify_install_owner("/usr/lib/node_modules/.bin/claude"), "npm-global");
        assert_eq!(classify_install_owner("/opt/homebrew/bin/claude"), "homebrew");
        assert_eq!(classify_install_owner("/usr/local/Cellar/claude-code/1.0.0/bin/claude"), "homebrew");
        assert_eq!(classify_install_owner("/home/user/.claude/local/claude"), "native-installer");
        assert_eq!(classify_install_owner("/opt/weird/place/claude"), "unknown");
    }

    #[test]
    fn install_owner_info_rejects_unknown_and_unwritable_paths() {
        let unknown = claude_install_owner_info("/opt/weird/place/claude");
        assert!(unknown.is_err());

        let suffix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("l8git-owner-{suffix}"));
        fs::create_dir_all(&dir).unwrap();
        let bin = dir.join(".npm-global").join("bin").join("claude");
        fs::create_dir_all(bin.parent().unwrap()).unwrap();
        fs::write(&bin, b"#!/bin/sh\n").unwrap();

        let info = claude_install_owner_info(bin.to_str().unwrap()).unwrap();
        assert_eq!(info.kind, "npm-global");
        assert!(info.update_command.is_some());

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o444)).unwrap();
            let readonly = claude_install_owner_info(bin.to_str().unwrap());
            assert!(readonly.is_err());
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o644)).unwrap();
        }

        fs::remove_dir_all(&dir).ok();
    }
}
