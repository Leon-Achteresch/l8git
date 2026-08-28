//! Stdio MCP server exposing the read-only Jira tools to the CLIs that cannot
//! use l8git's in-process server.
//!
//! Claude Code gets its tools over the SDK MCP channel inside the app
//! (`providers/claude/chat-store.ts`). Codex, OpenCode and Cursor have no such
//! channel, so l8git re-executes itself as `l8git <SUBCOMMAND> --repo <path>`
//! and speaks MCP over stdin/stdout.
//!
//! The child is not a way around the gate. It applies the same rules as the
//! frontend, read from `jira_policy.rs` on every request, and it reaches Jira
//! through the same read-only functions in `jira.rs`.

use std::io::{BufRead, Write};

use serde_json::{json, Value};

use crate::jira::{
    self, clamp_limit, validate_issue_key, validate_jql, MAX_BODY_CHARS, MAX_COMMENTS,
    MAX_SEARCH_RESULTS,
};
use crate::jira_policy::{load_policy, JiraPolicy};

/// Argv marker that turns the app binary into an MCP server instead of a GUI.
pub const SUBCOMMAND: &str = "mcp-jira";
pub const SERVER_NAME: &str = "l8git-jira";
const PROTOCOL_VERSION: &str = "2024-11-05";

const DEFAULT_COMMENT_LIMIT: u32 = 10;
const DEFAULT_SEARCH_LIMIT: u32 = 10;
const MAX_ENUM_KEYS: usize = 20;

const TOOL_GET_ISSUE: &str = "jira_get_issue";
const TOOL_GET_COMMENTS: &str = "jira_get_comments";
const TOOL_SEARCH_ISSUES: &str = "jira_search_issues";

const CODE_METHOD_NOT_FOUND: i64 = -32601;
const CODE_INVALID_PARAMS: i64 = -32602;

// ---------------------------------------------------------------------------
// Tool declarations — the same gate as `jiraToolsFor` in the frontend
// ---------------------------------------------------------------------------

fn key_schema(policy: &JiraPolicy, repo: &str) -> Value {
    let keys = policy.keys_for(repo);
    if !policy.allow_search && !keys.is_empty() && keys.len() <= MAX_ENUM_KEYS {
        return json!({
            "type": "string",
            "enum": keys,
            "description": "Schlüssel eines verknüpften Tickets.",
        });
    }
    json!({
        "type": "string",
        "pattern": "^[A-Za-z][A-Za-z0-9_]{0,49}-[0-9]{1,10}$",
        "description": "Ticket-Schlüssel wie ABC-123.",
    })
}

fn ticket_roster(policy: &JiraPolicy, repo: &str) -> String {
    let keys = policy.keys_for(repo);
    if keys.is_empty() {
        return String::new();
    }
    format!(
        " Verknüpfte Tickets: {}.",
        keys.iter()
            .take(MAX_ENUM_KEYS)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    )
}

/// The tools this repository may see right now. Empty whenever Jira cannot
/// help, so an unused integration costs no context tokens.
pub fn tools_for(policy: &JiraPolicy, repo: &str) -> Vec<Value> {
    if !policy.offers_tools(repo) {
        return Vec::new();
    }
    let key = key_schema(policy, repo);
    let mut tools = vec![json!({
        "name": TOOL_GET_ISSUE,
        "description": format!(
            "Liest ein Jira-Ticket (Titel, Status, Typ, Priorität, Zuweisung, Labels, Beschreibung). Nur lesend.{}",
            ticket_roster(policy, repo)
        ),
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["key"],
            "properties": { "key": key },
        },
    })];

    if policy.allow_comments {
        tools.push(json!({
            "name": TOOL_GET_COMMENTS,
            "description": "Liest die neuesten Kommentare eines Jira-Tickets. Nur nutzen, wenn die Ticket-Beschreibung die Frage nicht beantwortet.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["key"],
                "properties": {
                    "key": key_schema(policy, repo),
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_COMMENTS, "description": "Anzahl Kommentare (Standard 10)." },
                },
            },
        }));
    }

    if policy.allow_search {
        tools.push(json!({
            "name": TOOL_SEARCH_ISSUES,
            "description": "Sucht Jira-Tickets per JQL und liefert eine kompakte Trefferliste ohne Beschreibungen. Nur lesend.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["jql"],
                "properties": {
                    "jql": { "type": "string", "maxLength": 2000, "description": "JQL, z. B. project = ABC AND status = \"In Progress\"." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_SEARCH_RESULTS, "description": "Anzahl Treffer (Standard 10)." },
                },
            },
        }));
    }

    tools
}

// ---------------------------------------------------------------------------
// Rendering — same compact text the in-process server produces
// ---------------------------------------------------------------------------

fn push_line(out: &mut Vec<String>, label: &str, value: &str) {
    if !value.is_empty() {
        out.push(format!("{label}: {value}"));
    }
}

fn push_list(out: &mut Vec<String>, label: &str, values: &[String]) {
    if !values.is_empty() {
        out.push(format!("{label}: {}", values.join(", ")));
    }
}

pub fn format_issue(issue: &jira::JiraIssue) -> String {
    let mut lines = vec![format!(
        "{}: {}",
        issue.key,
        if issue.summary.is_empty() { "(ohne Titel)" } else { issue.summary.as_str() }
    )];
    push_line(&mut lines, "Status", &issue.status);
    push_line(&mut lines, "Typ", &issue.issue_type);
    push_line(&mut lines, "Priorität", &issue.priority);
    push_line(&mut lines, "Zuweisung", &issue.assignee);
    push_line(&mut lines, "Melder", &issue.reporter);
    push_line(&mut lines, "Resolution", &issue.resolution);
    push_list(&mut lines, "Labels", &issue.labels);
    push_list(&mut lines, "Komponenten", &issue.components);
    push_list(&mut lines, "Fix-Versionen", &issue.fix_versions);
    push_line(&mut lines, "Parent", &issue.parent);
    push_list(&mut lines, "Subtasks", &issue.subtasks);
    push_line(&mut lines, "Fällig", &issue.due_date);
    push_line(&mut lines, "Aktualisiert", &issue.updated);
    push_line(&mut lines, "URL", &issue.url);
    if !issue.description.is_empty() {
        lines.push(String::new());
        lines.push("Beschreibung:".into());
        lines.push(issue.description.clone());
        if issue.truncated {
            lines.push("(Beschreibung gekürzt)".into());
        }
    }
    lines.join("\n")
}

pub fn format_comments(key: &str, comments: &[jira::JiraComment]) -> String {
    if comments.is_empty() {
        return format!("{key}: keine Kommentare.");
    }
    let mut blocks = vec![format!(
        "{key} — {} Kommentar(e), neueste zuerst:",
        comments.len()
    )];
    for comment in comments {
        let author = if comment.author.is_empty() { "Unbekannt" } else { comment.author.as_str() };
        let created = if comment.created.is_empty() { "?" } else { comment.created.as_str() };
        let body = if comment.body.is_empty() { "(leer)" } else { comment.body.as_str() };
        let suffix = if comment.truncated { "\n(gekürzt)" } else { "" };
        blocks.push(format!("— {author} ({created})\n{body}{suffix}"));
    }
    blocks.join("\n\n")
}

pub fn format_search(result: &jira::JiraSearchResult) -> String {
    if result.issues.is_empty() {
        return "Keine Treffer.".into();
    }
    let rows: Vec<String> = result
        .issues
        .iter()
        .map(|issue| {
            [
                issue.key.as_str(),
                if issue.summary.is_empty() { "(ohne Titel)" } else { issue.summary.as_str() },
                issue.status.as_str(),
                issue.assignee.as_str(),
            ]
            .iter()
            .filter(|value| !value.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join(" | ")
        })
        .collect();
    let footer = if result.truncated || result.total as usize > result.issues.len() {
        format!(
            "\n({} von {} gezeigt — JQL verfeinern)",
            result.issues.len(),
            result.total
        )
    } else {
        String::new()
    };
    format!(
        "Treffer (Key | Titel | Status | Zuweisung):\n{}{footer}",
        rows.join("\n")
    )
}

fn text_content(text: String, is_error: bool) -> Value {
    let mut result = json!({ "content": [{ "type": "text", "text": text }] });
    if is_error {
        result["isError"] = Value::Bool(true);
    }
    result
}

// ---------------------------------------------------------------------------
// Argument checks — the boundary the schema only hints at
// ---------------------------------------------------------------------------

pub fn resolve_key(policy: &JiraPolicy, repo: &str, arguments: &Value) -> Result<String, String> {
    let raw = arguments
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| "Jira: Es fehlt der Parameter \"key\".".to_string())?;
    let key = validate_issue_key(raw)?;
    if !policy.allows_key(repo, &key) {
        let available = policy.keys_for(repo).join(", ");
        return Err(format!(
            "Jira: {key} ist mit diesem Repository nicht verknüpft. Verfügbar: {}. \
             Der Nutzer kann das Ticket im Agents-Fenster verknüpfen oder die JQL-Suche in den Einstellungen freischalten.",
            if available.is_empty() { "keine" } else { available.as_str() }
        ));
    }
    Ok(key)
}

fn limit_arg(arguments: &Value, fallback: u32, max: u32) -> u32 {
    let requested = arguments
        .get("limit")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok());
    clamp_limit(Some(requested.unwrap_or(fallback)), max)
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

async fn call_tool(policy: &JiraPolicy, repo: &str, name: &str, arguments: &Value) -> Value {
    if !policy.enabled {
        return text_content("Jira: Die Integration ist deaktiviert.".into(), true);
    }
    match name {
        TOOL_GET_ISSUE => match resolve_key(policy, repo, arguments) {
            Err(error) => text_content(error, true),
            Ok(key) => match jira::fetch_issue(&key, MAX_BODY_CHARS).await {
                Ok(issue) => text_content(format_issue(&issue), false),
                Err(error) => text_content(error, true),
            },
        },
        TOOL_GET_COMMENTS => {
            if !policy.allow_comments {
                return text_content("Jira: Das Lesen von Kommentaren ist deaktiviert.".into(), true);
            }
            match resolve_key(policy, repo, arguments) {
                Err(error) => text_content(error, true),
                Ok(key) => {
                    let limit = limit_arg(arguments, DEFAULT_COMMENT_LIMIT, MAX_COMMENTS);
                    match jira::fetch_comments(&key, limit).await {
                        Ok(comments) => text_content(format_comments(&key, &comments), false),
                        Err(error) => text_content(error, true),
                    }
                }
            }
        }
        TOOL_SEARCH_ISSUES => {
            if !policy.allow_search {
                return text_content("Jira: Die JQL-Suche ist deaktiviert.".into(), true);
            }
            let raw = arguments.get("jql").and_then(Value::as_str).unwrap_or("");
            match validate_jql(raw) {
                Err(error) => text_content(error, true),
                Ok(jql) => {
                    let limit = limit_arg(arguments, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_RESULTS);
                    match jira::search_issues(&jql, limit).await {
                        Ok(result) => text_content(format_search(&result), false),
                        Err(error) => text_content(error, true),
                    }
                }
            }
        }
        other => text_content(format!("Jira: Unbekanntes Tool \"{other}\"."), true),
    }
}

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------

fn error_response(id: Value, code: i64, message: String) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn success_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

/// Handles one JSON-RPC request. Returns `None` for notifications, which must
/// stay unanswered. Kept separate from the stdio loop so it can be tested.
pub async fn handle_request(repo: &str, request: &Value) -> Option<Value> {
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    let id = request.get("id").cloned();
    let params = request.get("params").cloned().unwrap_or(Value::Null);
    // No id means a notification: acknowledge by staying silent.
    let id = id?;

    // Re-read per request so pinning a ticket takes effect in a running session.
    let policy = load_policy();

    match method {
        "initialize" => Some(success_response(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
            }),
        )),
        "ping" => Some(success_response(id, json!({}))),
        "tools/list" => Some(success_response(id, json!({ "tools": tools_for(&policy, repo) }))),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            if name.is_empty() {
                return Some(error_response(
                    id,
                    CODE_INVALID_PARAMS,
                    "Es fehlt der Tool-Name.".into(),
                ));
            }
            let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
            Some(success_response(
                id,
                call_tool(&policy, repo, name, &arguments).await,
            ))
        }
        other => Some(error_response(
            id,
            CODE_METHOD_NOT_FOUND,
            format!("Unbekannte Methode: {other}"),
        )),
    }
}

/// Reads `--repo <path>` out of the argv tail after the subcommand marker.
pub fn repo_from_args<I: IntoIterator<Item = String>>(args: I) -> String {
    let mut args = args.into_iter().skip_while(|arg| arg != SUBCOMMAND).skip(1);
    while let Some(arg) = args.next() {
        if arg == "--repo" {
            return args.next().unwrap_or_default();
        }
        if let Some(value) = arg.strip_prefix("--repo=") {
            return value.to_string();
        }
    }
    String::new()
}

/// Runs the MCP server on stdin/stdout until the client closes the pipe.
/// Diagnostics go to stderr — stdout carries protocol frames only.
pub fn serve_stdio(args: Vec<String>) -> ! {
    let repo = repo_from_args(args);
    let runtime = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("l8git {SUBCOMMAND}: Runtime konnte nicht gestartet werden: {error}");
            std::process::exit(1);
        }
    };
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(trimmed) {
            Ok(request) => runtime.block_on(handle_request(&repo, &request)),
            Err(error) => Some(error_response(
                Value::Null,
                -32700,
                format!("Ungültiges JSON: {error}"),
            )),
        };
        let Some(response) = response else { continue };
        let Ok(encoded) = serde_json::to_string(&response) else { continue };
        if writeln!(stdout, "{encoded}").is_err() || stdout.flush().is_err() {
            break;
        }
    }
    std::process::exit(0);
}
