use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;

use tauri::ipc::Channel;

use serde::{Deserialize, Serialize};

use crate::shell::resolve_cli_path;

/// A byte-transparent JSONL process transport. Provider-specific JSON-RPC
/// semantics deliberately live in the frontend adapters so additional CLIs can
/// reuse the lifecycle, buffering and shutdown behavior without touching UI.
pub struct AgentTransportState {
    sessions: RwLock<HashMap<u32, Arc<AgentTransport>>>,
    next_id: AtomicU32,
}

impl Default for AgentTransportState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

struct AgentTransport {
    session_id: String,
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    closed: AtomicBool,
    sequence: AtomicU64,
}

impl AgentTransport {
    fn stop(&self) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        let mut child = self.child.lock().unwrap();
        if child.try_wait().ok().flatten().is_none() {
            if let Err(error) = child.kill() {
                log::debug!("agent transport kill returned {error}");
            }
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTransportHandle {
    id: u32,
    session_id: String,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTransportOptions {
    cwd: Option<String>,
    resume: Option<bool>,
    resume_session_id: Option<String>,
    fork_session: Option<bool>,
    persist_session: Option<bool>,
    model: Option<String>,
    effort: Option<String>,
    permission_mode: Option<String>,
    prompt: Option<String>,
    sandbox: Option<String>,
    add_dirs: Option<Vec<String>>,
    worktree: Option<String>,
}

/// Ordered envelope used on the Tauri channel. `payload` is kept as JSON all
/// the way from the CLI stdout stream to the provider adapter; no terminal
/// parsing or global event bus is involved.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStreamEvent {
    session_id: String,
    sequence: u64,
    stream: &'static str,
    payload: serde_json::Value,
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    if session_id.is_empty()
        || session_id.len() > 256
        || !session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err("Ungültige Agent-Session-ID.".into());
    }
    Ok(())
}

fn encode_json_line(message: &serde_json::Value) -> Result<Vec<u8>, String> {
    let mut encoded = serde_json::to_vec(message)
        .map_err(|error| format!("Agent-Nachricht ist kein gültiges JSON: {error}"))?;
    encoded.push(b'\n');
    Ok(encoded)
}

fn stream_event(
    transport: &AgentTransport,
    stream: &'static str,
    payload: serde_json::Value,
) -> AgentStreamEvent {
    AgentStreamEvent {
        session_id: transport.session_id.clone(),
        sequence: transport.sequence.fetch_add(1, Ordering::Relaxed),
        stream,
        payload,
    }
}

impl Drop for AgentTransport {
    fn drop(&mut self) {
        self.stop();
    }
}

fn safe_argument(value: &str, label: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(format!("Ungültiger Wert für {label}."));
    }
    Ok(value.to_string())
}

/// Prompts are passed as a single argv entry, so newlines stay valid; only
/// NUL bytes and absurd sizes are rejected.
fn safe_prompt(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 200_000 || value.contains('\0') {
        return Err("Ungültiger Prompt für die Cursor CLI.".into());
    }
    Ok(value.to_string())
}

fn cursor_process(options: &AgentTransportOptions) -> Result<Command, String> {
    let executable = crate::cursor::cursor_executable()?;
    let mut command = Command::new(executable);
    command.args([
        "--print",
        "--output-format",
        "stream-json",
        "--stream-partial-output",
        "--trust",
        "--approve-mcps",
    ]);
    match options.permission_mode.as_deref() {
        Some("plan") => command.arg("--plan"),
        Some("ask") => command.args(["--mode", "ask"]),
        Some("auto-review") => command.arg("--auto-review"),
        // Without an explicit policy the headless run would stall on the first
        // approval prompt, so full access is the deliberate default here.
        _ => command.arg("--force"),
    };
    if let Some(sandbox) = options.sandbox.as_deref() {
        let sandbox = safe_argument(sandbox, "Cursor-Sandbox")?;
        if sandbox != "enabled" && sandbox != "disabled" {
            return Err("Ungültiger Wert für Cursor-Sandbox.".into());
        }
        command.args(["--sandbox", &sandbox]);
    }
    if let Some(model) = options.model.as_deref() {
        command.args(["--model", &safe_argument(model, "Cursor-Modell")?]);
    }
    if options.resume.unwrap_or(false) {
        let resume_session_id = options
            .resume_session_id
            .as_deref()
            .ok_or_else(|| "Cursor-Resume ohne Session-ID.".to_string())?;
        command.args(["--resume", &safe_argument(resume_session_id, "Cursor-Session")?]);
    }
    for directory in options.add_dirs.iter().flatten() {
        let directory = safe_argument(directory, "Cursor-Zusatzverzeichnis")?;
        if !PathBuf::from(&directory).is_dir() {
            return Err("Ein zusätzliches Cursor-Verzeichnis existiert nicht.".into());
        }
        command.args(["--add-dir", &directory]);
    }
    if let Some(worktree) = options.worktree.as_deref() {
        command.args(["--worktree", &safe_argument(worktree, "Cursor-Worktree")?]);
    }
    if let Some(cwd) = options.cwd.as_deref() {
        let cwd = PathBuf::from(cwd);
        if !cwd.is_dir() {
            return Err("Das Arbeitsverzeichnis für die Cursor CLI existiert nicht.".into());
        }
        command.current_dir(cwd);
    }
    let prompt = options
        .prompt
        .as_deref()
        .ok_or_else(|| "Cursor benötigt einen Prompt.".to_string())?;
    command.arg(safe_prompt(prompt)?);
    Ok(command)
}

fn provider_process(
    provider: &str,
    session_id: &str,
    options: &AgentTransportOptions,
) -> Result<(Command, &'static str), String> {
    match provider {
        "codex" => {
            let executable = resolve_cli_path("codex")
                .ok_or_else(|| "Codex CLI wurde nicht gefunden.".to_string())?;
            let mut command = Command::new(executable);
            command.args(["app-server", "--listen", "stdio://"]);
            Ok((command, "Codex"))
        }
        "claude" => {
            let executable = resolve_cli_path("claude")
                .ok_or_else(|| "Claude Code CLI wurde nicht gefunden.".to_string())?;
            let mut command = Command::new(executable);
            command.args([
                "--output-format",
                "stream-json",
                "--verbose",
                "--input-format",
                "stream-json",
                "--permission-prompt-tool",
                "stdio",
                "--include-partial-messages",
                "--include-hook-events",
                "--replay-user-messages",
                "--forward-subagent-text",
                "--setting-sources",
                "user,project,local",
                "--prompt-suggestions",
                "true",
                "--allow-dangerously-skip-permissions",
            ]);
            if options.resume.unwrap_or(false) {
                let resume_session_id = match options.resume_session_id.as_deref() {
                    Some(value) => safe_argument(value, "Claude-Resume-Session")?,
                    None => session_id.to_string(),
                };
                command.args(["--resume", &resume_session_id]);
                if options.fork_session.unwrap_or(false) {
                    command.arg("--fork-session");
                    command.args(["--session-id", session_id]);
                }
            } else {
                command.args(["--session-id", session_id]);
            }
            if options.persist_session == Some(false) {
                command.arg("--no-session-persistence");
            }
            if let Some(model) = options.model.as_deref() {
                command.args(["--model", &safe_argument(model, "Claude-Modell")?]);
            }
            if let Some(effort) = options.effort.as_deref() {
                command.args(["--effort", &safe_argument(effort, "Claude-Effort")?]);
            }
            if let Some(mode) = options.permission_mode.as_deref() {
                command.args([
                    "--permission-mode",
                    &safe_argument(mode, "Claude-Berechtigungsmodus")?,
                ]);
            }
            if let Some(cwd) = options.cwd.as_deref() {
                let cwd = PathBuf::from(cwd);
                if !cwd.is_dir() {
                    return Err("Das Arbeitsverzeichnis für Claude Code existiert nicht.".into());
                }
                command.current_dir(cwd);
            }
            command.env("CLAUDE_CODE_ENTRYPOINT", "l8git");
            command.env("CLAUDE_AGENT_SDK_CLIENT_APP", "l8git/0.4.0");
            Ok((command, "Claude Code"))
        }
        "cursor" => Ok((cursor_process(options)?, "Cursor CLI")),
        "opencode" => {
            let executable = resolve_cli_path("opencode")
                .ok_or_else(|| "OpenCode CLI wurde nicht gefunden.".to_string())?;
            let mut command = Command::new(executable);
            // ACP multiplexes every session of a repository over one process,
            // so model, mode and session lifecycle are negotiated in-band.
            command.arg("acp");
            if let Some(cwd) = options.cwd.as_deref() {
                let cwd = PathBuf::from(cwd);
                if !cwd.is_dir() {
                    return Err("Das Arbeitsverzeichnis für OpenCode existiert nicht.".into());
                }
                command.current_dir(cwd);
            }
            Ok((command, "OpenCode"))
        }
        _ => Err(format!("Unbekannter Agent-Provider: {provider}")),
    }
}

#[tauri::command]
pub async fn agent_transport_open(
    state: tauri::State<'_, AgentTransportState>,
    provider: String,
    session_id: String,
    options: Option<AgentTransportOptions>,
    on_event: Channel<AgentStreamEvent>,
) -> Result<AgentTransportHandle, String> {
    let provider = provider.trim().to_ascii_lowercase();
    let session_id = session_id.trim().to_string();
    validate_session_id(&session_id)?;
    let options = options.unwrap_or_default();
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);

    let (transport, label) = tauri::async_runtime::spawn_blocking(move || {
        let (mut command, label) = provider_process(&provider, &session_id, &options)?;
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("{label} konnte nicht gestartet werden: {error}"))?;

        let Some(stdin) = child.stdin.take() else {
            let _ = child.kill();
            return Err(format!("{label}: stdin ist nicht verfügbar."));
        };
        let Some(stdout) = child.stdout.take() else {
            let _ = child.kill();
            return Err(format!("{label}: stdout ist nicht verfügbar."));
        };
        let Some(stderr) = child.stderr.take() else {
            let _ = child.kill();
            return Err(format!("{label}: stderr ist nicht verfügbar."));
        };

        let transport = Arc::new(AgentTransport {
            session_id,
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            closed: AtomicBool::new(false),
            sequence: AtomicU64::new(1),
        });

        let stdout_process = Arc::clone(&transport);
        let stdout_events = on_event.clone();
        thread::Builder::new()
            .name(format!("l8git-agent-{id}-stdout"))
            .spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    match line {
                        Ok(line) => {
                            let event = match serde_json::from_str(&line) {
                                Ok(payload) => stream_event(&stdout_process, "json", payload),
                                Err(error) => stream_event(
                                    &stdout_process,
                                    "diagnostic",
                                    serde_json::Value::String(format!(
                                        "Ungültige JSON-Stream-Antwort: {error}"
                                    )),
                                ),
                            };
                            if stdout_events.send(event).is_err() {
                                stdout_process.stop();
                                break;
                            }
                        }
                        Err(error) => {
                            log::warn!("agent transport id={id} stdout failed: {error}");
                            stdout_process.stop();
                            break;
                        }
                    }
                }
            })
            .map_err(|error| {
                transport.stop();
                error.to_string()
            })?;

        let stderr_process = Arc::clone(&transport);
        let stderr_events = on_event.clone();
        thread::Builder::new()
            .name(format!("l8git-agent-{id}-stderr"))
            .spawn(move || {
                for line in BufReader::new(stderr).lines() {
                    match line {
                        Ok(line) => {
                            let event = stream_event(
                                &stderr_process,
                                "diagnostic",
                                serde_json::Value::String(line),
                            );
                            if stderr_events.send(event).is_err() {
                                stderr_process.stop();
                                break;
                            }
                        }
                        Err(error) => {
                            log::debug!("agent transport id={id} stderr failed: {error}");
                            stderr_process.stop();
                            break;
                        }
                    }
                }
            })
            .map_err(|error| {
                transport.stop();
                error.to_string()
            })?;

        let process = Arc::clone(&transport);
        let exit_events = on_event;
        thread::Builder::new()
            .name(format!("l8git-agent-{id}-wait"))
            .spawn(move || loop {
                let status = process.child.lock().unwrap().try_wait();
                match status {
                    Ok(Some(status)) => {
                        process.closed.store(true, Ordering::Release);
                        let _ = exit_events.send(stream_event(
                            &process,
                            "exit",
                            serde_json::Value::from(status.code().unwrap_or(-1)),
                        ));
                        break;
                    }
                    Ok(None) => thread::sleep(Duration::from_millis(120)),
                    Err(error) => {
                        log::warn!("agent transport id={id} wait failed: {error}");
                        let _ = exit_events.send(stream_event(
                            &process,
                            "exit",
                            serde_json::Value::from(-1),
                        ));
                        break;
                    }
                }
            })
            .map_err(|error| {
                transport.stop();
                error.to_string()
            })?;

        Ok::<_, String>((transport, label))
    })
    .await
    .map_err(|error| error.to_string())??;

    state.sessions.write().unwrap().insert(id, transport);
    let session_id = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .map(|session| session.session_id.clone())
        .ok_or_else(|| "Agent-Transport konnte nicht registriert werden.".to_string())?;
    log::info!("agent transport opened id={id} session={session_id} provider={label}");
    Ok(AgentTransportHandle { id, session_id })
}

#[tauri::command]
pub fn agent_transport_send(
    state: tauri::State<AgentTransportState>,
    id: u32,
    session_id: String,
    message: serde_json::Value,
) -> Result<(), String> {
    let transport = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| "Agent-Transport existiert nicht mehr.".to_string())?;
    if transport.session_id != session_id {
        return Err("Agent-Session stimmt nicht mit dem Transport überein.".into());
    }
    if transport.closed.load(Ordering::Acquire) {
        return Err("Agent-Transport wurde beendet.".into());
    }
    let message = encode_json_line(&message)?;
    let mut stdin = transport.stdin.lock().unwrap();
    stdin
        .write_all(&message)
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("Agent-Nachricht konnte nicht gesendet werden: {error}"))
}

#[tauri::command]
pub fn agent_transport_close(
    state: tauri::State<AgentTransportState>,
    id: u32,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.write().unwrap();
    if let Some(transport) = sessions.get(&id) {
        if transport.session_id != session_id {
            return Err("Agent-Session stimmt nicht mit dem Transport überein.".into());
        }
    }
    if let Some(transport) = sessions.remove(&id) {
        let session_id = transport.session_id.clone();
        drop(sessions);
        transport.stop();
        log::info!("agent transport closed id={id} session={session_id}");
    }
    Ok(())
}

#[tauri::command]
pub fn agent_transport_close_all(
    state: tauri::State<AgentTransportState>,
) -> Result<usize, String> {
    let sessions: Vec<Arc<AgentTransport>> = {
        let mut guard = state.sessions.write().unwrap();
        guard.drain().map(|(_, session)| session).collect()
    };
    let count = sessions.len();
    for session in sessions {
        session.stop();
    }
    Ok(count)
}

const OPENCODE_ALLOWED_COMMANDS: [&str; 4] = ["mcp", "agent", "models", "stats"];

/// Read-only OpenCode subcommands that ACP does not expose. The allowlist keeps
/// this away from `run`/`serve`/`upgrade`.
#[tauri::command]
pub async fn opencode_cli(args: Vec<String>, cwd: Option<String>) -> Result<String, String> {
    let Some(first) = args.first().cloned() else {
        return Err("OpenCode-Befehl fehlt.".into());
    };
    if !OPENCODE_ALLOWED_COMMANDS.contains(&first.as_str()) {
        return Err(format!("OpenCode-Befehl ist nicht erlaubt: {first}"));
    }
    if args
        .iter()
        .any(|argument| argument.len() > 256 || argument.chars().any(char::is_control))
    {
        return Err("Ungültiges Argument für die OpenCode CLI.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let executable = resolve_cli_path("opencode")
            .ok_or_else(|| "OpenCode CLI wurde nicht gefunden.".to_string())?;
        let mut command = Command::new(executable);
        command.args(&args).stdin(Stdio::null());
        if let Some(cwd) = cwd.as_deref() {
            if !Path::new(cwd).is_dir() {
                return Err("OpenCode-Arbeitsverzeichnis existiert nicht.".into());
            }
            command.current_dir(cwd);
        }
        let output = command
            .output()
            .map_err(|error| format!("OpenCode CLI ist fehlgeschlagen: {error}"))?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if message.is_empty() {
                format!("OpenCode CLI ist fehlgeschlagen: {first}")
            } else {
                message
            });
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// ACP has no delete verb, so removing a chat for good goes through the CLI.
#[tauri::command]
pub async fn opencode_delete_session(path: String, session_id: String) -> Result<(), String> {
    validate_session_id(&session_id)?;
    let cwd = PathBuf::from(&path);
    if !cwd.is_dir() {
        return Err("Das Arbeitsverzeichnis für OpenCode existiert nicht.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let executable = resolve_cli_path("opencode")
            .ok_or_else(|| "OpenCode CLI wurde nicht gefunden.".to_string())?;
        let output = Command::new(executable)
            .args(["session", "delete", &session_id])
            .current_dir(cwd)
            .output()
            .map_err(|error| format!("OpenCode-Session konnte nicht gelöscht werden: {error}"))?;
        if output.status.success() {
            return Ok(());
        }
        Err(format!(
            "OpenCode-Session konnte nicht gelöscht werden: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        cursor_process, encode_json_line, safe_prompt, validate_session_id, AgentStreamEvent,
        AgentTransportOptions,
    };

    #[test]
    fn validates_isolated_session_ids() {
        assert!(validate_session_id("codex-thread:7e96d8f8").is_ok());
        assert!(validate_session_id("").is_err());
        assert!(validate_session_id("thread\nother").is_err());
        assert!(validate_session_id("thread other").is_err());
        assert!(validate_session_id(&"x".repeat(257)).is_err());
    }

    #[test]
    fn encodes_exactly_one_jsonl_record() {
        let value = serde_json::json!({ "method": "turn/start", "params": { "text": "a\nb" } });
        let encoded = encode_json_line(&value).unwrap();
        assert_eq!(encoded.last(), Some(&b'\n'));
        assert_eq!(encoded[..encoded.len() - 1].iter().filter(|byte| **byte == b'\n').count(), 0);
        let decoded: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(decoded, value);
    }

    #[test]
    fn accepts_multiline_prompts_but_not_empty_ones() {
        assert_eq!(safe_prompt(" fix\nthe bug ").unwrap(), "fix\nthe bug");
        assert!(safe_prompt("   ").is_err());
        assert!(safe_prompt("a\0b").is_err());
    }

    #[test]
    fn cursor_command_forces_access_and_ends_with_the_prompt() {
        let options = AgentTransportOptions {
            prompt: Some("hallo".into()),
            model: Some("composer-2.5".into()),
            resume: Some(true),
            resume_session_id: Some("abc-123".into()),
            ..Default::default()
        };
        // Skipped on machines without the Cursor CLI installed.
        let Ok(command) = cursor_process(&options) else {
            return;
        };
        let args: Vec<String> = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"--force".to_string()));
        assert!(args.windows(2).any(|pair| pair == ["--model", "composer-2.5"]));
        assert!(args.windows(2).any(|pair| pair == ["--resume", "abc-123"]));
        assert_eq!(args.last().map(String::as_str), Some("hallo"));
    }

    #[test]
    fn cursor_plan_mode_replaces_force() {
        let options = AgentTransportOptions {
            prompt: Some("plane das".into()),
            permission_mode: Some("plan".into()),
            ..Default::default()
        };
        let Ok(command) = cursor_process(&options) else {
            return;
        };
        let args: Vec<String> = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"--plan".to_string()));
        assert!(!args.contains(&"--force".to_string()));
    }

    #[test]
    fn stream_envelope_keeps_session_and_sequence() {
        let event = AgentStreamEvent {
            session_id: "codex-thread:a".into(),
            sequence: 42,
            stream: "json",
            payload: serde_json::json!({ "id": 7, "result": {} }),
        };
        let json = serde_json::to_value(event).unwrap();
        assert_eq!(json["sessionId"], "codex-thread:a");
        assert_eq!(json["sequence"], 42);
        assert_eq!(json["stream"], "json");
        assert_eq!(json["payload"]["id"], 7);
    }
}
