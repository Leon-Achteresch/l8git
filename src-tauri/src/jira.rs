//! Read-only Jira integration (BYOK).
//!
//! Security model — every rule here is load-bearing, because the *agent*
//! controls the inputs (issue key, JQL) while the *user* controls the
//! credentials:
//!
//! * Only `GET` is ever issued. There is no code path in this module that can
//!   create, edit, transition or delete anything in Jira.
//! * The API token lives in the OS keychain and never crosses back into the
//!   renderer; the UI only ever sees a masked hint.
//! * Request URLs are assembled from a normalised base URL plus a static path
//!   plus strictly validated segments, and the finished URL is re-checked
//!   against the configured origin before it is sent (SSRF / path-traversal).
//! * Redirects are disabled so a hostile redirect cannot replay the
//!   `Authorization` header to a third-party host.
//! * Responses are size-capped and projected down to a compact shape, which
//!   also keeps agent token usage small.
//! * Errors are redacted so a token can never end up in a log or a chat
//!   transcript.

use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::secrets::{delete_secret, get_secret, set_secret};

/// Keychain entry holding the full credential record as JSON.
const KEYRING_KEY: &str = "jira_credentials";

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// Hard cap on a Jira response body. Jira descriptions can be large; anything
/// beyond this is a sign of a misconfigured host rather than a real issue.
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;

const MAX_BASE_URL_LEN: usize = 512;
const MAX_EMAIL_LEN: usize = 254;
const MAX_TOKEN_LEN: usize = 4096;
const MAX_ISSUE_KEY_LEN: usize = 64;
const MAX_JQL_LEN: usize = 2000;

/// Description / comment bodies are truncated before they reach the agent.
pub const MAX_BODY_CHARS: usize = 6000;
pub const MAX_SEARCH_RESULTS: u32 = 25;
pub const MAX_COMMENTS: u32 = 25;

/// Field projection sent to Jira so the API itself returns less data.
const ISSUE_FIELDS: &str = "summary,status,issuetype,priority,assignee,reporter,labels,components,fixVersions,parent,subtasks,project,resolution,duedate,created,updated,description";
const SEARCH_FIELDS: &str = "summary,status,issuetype,priority,assignee,labels,updated";

// ---------------------------------------------------------------------------
// Credential record
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraCredentials {
    pub base_url: String,
    pub email: String,
    pub api_token: String,
}

/// What the renderer is allowed to know about the stored credentials. The
/// token itself is deliberately absent — only a masked hint is exposed so the
/// settings UI can show that *something* is stored.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraCredentialStatus {
    pub configured: bool,
    pub base_url: String,
    pub email: String,
    pub token_hint: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraAccount {
    pub account_id: String,
    pub display_name: String,
    pub email: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssue {
    pub key: String,
    pub summary: String,
    pub status: String,
    pub status_category: String,
    pub issue_type: String,
    pub priority: String,
    pub assignee: String,
    pub reporter: String,
    pub resolution: String,
    pub labels: Vec<String>,
    pub components: Vec<String>,
    pub fix_versions: Vec<String>,
    pub parent: String,
    pub subtasks: Vec<String>,
    pub project: String,
    pub due_date: String,
    pub created: String,
    pub updated: String,
    pub description: String,
    pub url: String,
    pub truncated: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraComment {
    pub id: String,
    pub author: String,
    pub created: String,
    pub updated: String,
    pub body: String,
    pub truncated: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraSearchResult {
    pub issues: Vec<JiraIssue>,
    pub total: u32,
    pub truncated: bool,
}

// ---------------------------------------------------------------------------
// Validation — pure, unit-tested
// ---------------------------------------------------------------------------

fn has_control_chars(value: &str) -> bool {
    value.chars().any(|c| c.is_control())
}

/// Normalises a user-supplied Jira base URL into a canonical origin (+ optional
/// context path for Server/Data Center installs under e.g. `/jira`).
///
/// Rejects anything that would let a request escape the configured host or
/// leak the credential: non-HTTP(S) schemes, embedded userinfo, query strings,
/// fragments and traversal segments. Plain `http://` is only tolerated for
/// loopback hosts.
pub fn normalize_base_url(input: &str) -> Result<String, String> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err("Jira: Die Base-URL darf nicht leer sein.".into());
    }
    if raw.len() > MAX_BASE_URL_LEN {
        return Err("Jira: Die Base-URL ist zu lang.".into());
    }
    if has_control_chars(raw) {
        return Err("Jira: Die Base-URL enthält ungültige Zeichen.".into());
    }
    // Checked on the raw input: `Url::parse` would silently resolve `..` away,
    // which turns a typo (or a paste of a crafted link) into a different,
    // silently accepted target path.
    if raw.contains("..") {
        return Err("Jira: Der Pfad der Base-URL ist ungültig.".into());
    }
    let candidate = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    };
    let url = reqwest::Url::parse(&candidate)
        .map_err(|_| "Jira: Die Base-URL ist keine gültige URL.".to_string())?;

    let host = url
        .host_str()
        .ok_or_else(|| "Jira: Die Base-URL enthält keinen Host.".to_string())?
        .to_ascii_lowercase();
    let loopback = host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]";
    match url.scheme() {
        "https" => {}
        "http" if loopback => {}
        "http" => {
            return Err(
                "Jira: Nur HTTPS ist erlaubt — sonst würde der API-Token unverschlüsselt übertragen."
                    .into(),
            )
        }
        other => return Err(format!("Jira: Das Schema \"{other}\" wird nicht unterstützt.")),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Jira: Die Base-URL darf keine Zugangsdaten enthalten.".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("Jira: Die Base-URL darf keine Query oder Fragment enthalten.".into());
    }

    let path = url.path().trim_end_matches('/');
    if path.contains("..") || path.contains('%') {
        return Err("Jira: Der Pfad der Base-URL ist ungültig.".into());
    }

    let mut origin = format!("{}://{}", url.scheme(), host);
    if let Some(port) = url.port() {
        origin.push_str(&format!(":{port}"));
    }
    Ok(format!("{origin}{path}"))
}

/// Validates an agent-supplied issue key. Only `PROJECT-123` shapes pass, which
/// is what makes it safe to splice the value straight into a URL path.
pub fn validate_issue_key(input: &str) -> Result<String, String> {
    let key = input.trim().to_ascii_uppercase();
    if key.is_empty() || key.len() > MAX_ISSUE_KEY_LEN {
        return Err("Jira: Ungültiger Ticket-Schlüssel.".into());
    }
    let Some((project, number)) = key.split_once('-') else {
        return Err("Jira: Ticket-Schlüssel müssen die Form PROJECT-123 haben.".into());
    };
    let project_ok = !project.is_empty()
        && project.starts_with(|c: char| c.is_ascii_uppercase())
        && project
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    let number_ok =
        !number.is_empty() && number.len() <= 10 && number.chars().all(|c| c.is_ascii_digit());
    if !project_ok || !number_ok {
        return Err("Jira: Ticket-Schlüssel müssen die Form PROJECT-123 haben.".into());
    }
    Ok(key)
}

/// Validates an agent-supplied JQL query. JQL is a read-only query language, so
/// the checks are about size and header/log hygiene rather than about writes.
pub fn validate_jql(input: &str) -> Result<String, String> {
    let jql = input.trim();
    if jql.is_empty() {
        return Err("Jira: Die JQL-Abfrage darf nicht leer sein.".into());
    }
    if jql.chars().count() > MAX_JQL_LEN {
        return Err("Jira: Die JQL-Abfrage ist zu lang.".into());
    }
    if jql.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
        return Err("Jira: Die JQL-Abfrage enthält ungültige Zeichen.".into());
    }
    Ok(jql.replace(['\n', '\t'], " ").trim().to_string())
}

pub fn validate_email(input: &str) -> Result<String, String> {
    let email = input.trim();
    if email.is_empty() || email.len() > MAX_EMAIL_LEN || has_control_chars(email) {
        return Err("Jira: Die E-Mail-Adresse ist ungültig.".into());
    }
    let Some((local, domain)) = email.split_once('@') else {
        return Err("Jira: Die E-Mail-Adresse ist ungültig.".into());
    };
    if local.is_empty() || domain.is_empty() || !domain.contains('.') || email.contains(':') {
        return Err("Jira: Die E-Mail-Adresse ist ungültig.".into());
    }
    Ok(email.to_string())
}

pub fn validate_api_token(input: &str) -> Result<String, String> {
    let token = input.trim();
    if token.is_empty() {
        return Err("Jira: Der API-Token darf nicht leer sein.".into());
    }
    if token.len() > MAX_TOKEN_LEN {
        return Err("Jira: Der API-Token ist zu lang.".into());
    }
    if has_control_chars(token) {
        return Err("Jira: Der API-Token enthält ungültige Zeichen.".into());
    }
    Ok(token.to_string())
}

pub fn clamp_limit(requested: Option<u32>, max: u32) -> u32 {
    requested.unwrap_or(max).clamp(1, max)
}

/// Masks a token for display: keeps the last four characters at most.
pub fn token_hint(token: &str) -> String {
    let tail: String = token.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    if token.chars().count() <= 4 {
        return "••••".into();
    }
    format!("••••{tail}")
}

/// Strips the credential (raw and base64-encoded) out of any string that may be
/// surfaced to the user, the log or an agent transcript.
pub fn redact_secret(text: &str, secret: &str) -> String {
    if secret.is_empty() {
        return text.to_string();
    }
    let mut out = text.replace(secret, "***");
    let encoded = B64.encode(secret.as_bytes());
    if !encoded.is_empty() {
        out = out.replace(&encoded, "***");
    }
    out
}

/// Builds a request URL from a normalised base plus a static, already-safe
/// path, and re-verifies that the result still points at the configured base.
/// The second check is redundant given the input validation — that is the
/// point: it turns any future validation gap into a rejected request instead of
/// a credential leak.
pub fn build_api_url(base: &str, path: &str) -> Result<String, String> {
    // `//host/x` parses as a path here but reads as protocol-relative
    // elsewhere, so it is rejected outright rather than reasoned about.
    if !path.starts_with('/')
        || path.starts_with("//")
        || path.contains("..")
        || has_control_chars(path)
    {
        return Err("Jira: Ungültiger API-Pfad.".into());
    }
    let base = base.trim_end_matches('/');
    let candidate = format!("{base}{path}");
    let parsed = reqwest::Url::parse(&candidate)
        .map_err(|_| "Jira: Die angeforderte URL ist ungültig.".to_string())?;
    let base_parsed = reqwest::Url::parse(base)
        .map_err(|_| "Jira: Die gespeicherte Base-URL ist ungültig.".to_string())?;
    let same_origin = parsed.scheme() == base_parsed.scheme()
        && parsed.host_str() == base_parsed.host_str()
        && parsed.port_or_known_default() == base_parsed.port_or_known_default();
    let base_path = base_parsed.path().trim_end_matches('/');
    if !same_origin || !parsed.path().starts_with(base_path) {
        return Err("Jira: Die angeforderte URL verlässt die konfigurierte Jira-Instanz.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Jira: Die angeforderte URL ist ungültig.".into());
    }
    Ok(parsed.to_string())
}

/// Browse link for a ticket, used by the UI (never by the API layer).
pub fn issue_browse_url(base: &str, key: &str) -> String {
    format!("{}/browse/{}", base.trim_end_matches('/'), key)
}

// ---------------------------------------------------------------------------
// Response projection — pure, unit-tested
// ---------------------------------------------------------------------------

pub fn truncate_text(text: &str, max_chars: usize) -> (String, bool) {
    let mut out = String::new();
    for (index, ch) in text.chars().enumerate() {
        if index >= max_chars {
            return (out, true);
        }
        out.push(ch);
    }
    (out, false)
}

fn str_field(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn nested_str(value: &Value, path: &[&str]) -> String {
    let mut cursor = value;
    for segment in path {
        match cursor.get(segment) {
            Some(next) => cursor = next,
            None => return String::new(),
        }
    }
    cursor.as_str().unwrap_or("").to_string()
}

fn names(value: Option<&Value>, key: &str) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| match item {
                    Value::String(text) => Some(text.clone()),
                    other => other.get(key).and_then(Value::as_str).map(str::to_string),
                })
                .filter(|text| !text.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Flattens Atlassian Document Format into readable plain text. ADF is deeply
/// nested JSON; handing it to an agent verbatim would waste a large number of
/// tokens for no benefit.
pub fn adf_to_text(value: &Value) -> String {
    // API v2 hosts return a plain string body instead of ADF.
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    let mut out = String::new();
    render_adf(value, &mut out, 0);
    out.split('\n')
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn render_children(value: &Value, out: &mut String, depth: usize) {
    if let Some(children) = value.get("content").and_then(Value::as_array) {
        for child in children {
            render_adf(child, out, depth);
        }
    }
}

fn render_adf(value: &Value, out: &mut String, depth: usize) {
    if depth > 24 {
        return;
    }
    let node_type = value.get("type").and_then(Value::as_str).unwrap_or("");
    match node_type {
        "text" => out.push_str(value.get("text").and_then(Value::as_str).unwrap_or("")),
        "hardBreak" => out.push('\n'),
        "mention" => {
            let name = nested_str(value, &["attrs", "text"]);
            out.push_str(if name.is_empty() { "@user" } else { name.as_str() });
        }
        "emoji" => out.push_str(&nested_str(value, &["attrs", "shortName"])),
        "date" => out.push_str(&nested_str(value, &["attrs", "timestamp"])),
        "inlineCard" | "blockCard" | "embedCard" => {
            out.push_str(&nested_str(value, &["attrs", "url"]))
        }
        "rule" => out.push_str("\n---\n"),
        "heading" => {
            let level = value
                .get("attrs")
                .and_then(|attrs| attrs.get("level"))
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6) as usize;
            out.push('\n');
            out.push_str(&"#".repeat(level));
            out.push(' ');
            render_children(value, out, depth + 1);
            out.push('\n');
        }
        "paragraph" => {
            render_children(value, out, depth + 1);
            out.push('\n');
        }
        "codeBlock" => {
            let language = nested_str(value, &["attrs", "language"]);
            out.push_str(&format!("\n```{language}\n"));
            render_children(value, out, depth + 1);
            out.push_str("\n```\n");
        }
        "blockquote" => {
            let mut inner = String::new();
            render_children(value, &mut inner, depth + 1);
            for line in inner.trim_end().split('\n') {
                out.push_str("> ");
                out.push_str(line);
                out.push('\n');
            }
        }
        "bulletList" | "orderedList" => {
            let ordered = node_type == "orderedList";
            if let Some(items) = value.get("content").and_then(Value::as_array) {
                for (index, item) in items.iter().enumerate() {
                    let mut inner = String::new();
                    render_adf(item, &mut inner, depth + 1);
                    let marker = if ordered {
                        format!("{}. ", index + 1)
                    } else {
                        "- ".to_string()
                    };
                    let indent = "  ".repeat(depth.min(6));
                    for (line_index, line) in inner.trim().split('\n').enumerate() {
                        out.push_str(&indent);
                        out.push_str(if line_index == 0 { marker.as_str() } else { "  " });
                        out.push_str(line);
                        out.push('\n');
                    }
                }
            }
        }
        "listItem" | "doc" | "tableCell" | "tableHeader" => render_children(value, out, depth + 1),
        "tableRow" => {
            let mut cells: Vec<String> = Vec::new();
            if let Some(children) = value.get("content").and_then(Value::as_array) {
                for child in children {
                    let mut inner = String::new();
                    render_adf(child, &mut inner, depth + 1);
                    cells.push(inner.trim().replace('\n', " "));
                }
            }
            out.push_str(&format!("| {} |\n", cells.join(" | ")));
        }
        "table" => {
            out.push('\n');
            render_children(value, out, depth + 1);
            out.push('\n');
        }
        "mediaSingle" | "media" | "mediaGroup" => {
            let alt = nested_str(value, &["attrs", "alt"]);
            out.push_str(&format!("[Anhang{}]", if alt.is_empty() { String::new() } else { format!(": {alt}") }));
            out.push('\n');
        }
        _ => render_children(value, out, depth + 1),
    }
}

/// Projects a raw Jira issue onto the compact shape the UI and the agent see.
pub fn summarize_issue(raw: &Value, base_url: &str, max_body_chars: usize) -> JiraIssue {
    let key = str_field(raw, "key");
    let fields = raw.get("fields").cloned().unwrap_or(Value::Null);
    let description = fields
        .get("description")
        .map(adf_to_text)
        .unwrap_or_default();
    let (description, truncated) = truncate_text(&description, max_body_chars);
    JiraIssue {
        summary: nested_str(&fields, &["summary"]),
        status: nested_str(&fields, &["status", "name"]),
        status_category: nested_str(&fields, &["status", "statusCategory", "name"]),
        issue_type: nested_str(&fields, &["issuetype", "name"]),
        priority: nested_str(&fields, &["priority", "name"]),
        assignee: nested_str(&fields, &["assignee", "displayName"]),
        reporter: nested_str(&fields, &["reporter", "displayName"]),
        resolution: nested_str(&fields, &["resolution", "name"]),
        labels: names(fields.get("labels"), "name"),
        components: names(fields.get("components"), "name"),
        fix_versions: names(fields.get("fixVersions"), "name"),
        parent: nested_str(&fields, &["parent", "key"]),
        subtasks: names(fields.get("subtasks"), "key"),
        project: nested_str(&fields, &["project", "key"]),
        due_date: nested_str(&fields, &["duedate"]),
        created: nested_str(&fields, &["created"]),
        updated: nested_str(&fields, &["updated"]),
        url: if key.is_empty() || base_url.is_empty() {
            String::new()
        } else {
            issue_browse_url(base_url, &key)
        },
        key,
        description,
        truncated,
    }
}

pub fn summarize_comment(raw: &Value, max_body_chars: usize) -> JiraComment {
    let body = raw.get("body").map(adf_to_text).unwrap_or_default();
    let (body, truncated) = truncate_text(&body, max_body_chars);
    JiraComment {
        id: str_field(raw, "id"),
        author: nested_str(raw, &["author", "displayName"]),
        created: str_field(raw, "created"),
        updated: str_field(raw, "updated"),
        body,
        truncated,
    }
}

/// Turns an HTTP failure into a message that names the cause without ever
/// echoing the credential back.
pub fn describe_http_error(status: u16, body: &str, token: &str) -> String {
    let detail = redact_secret(body.trim(), token);
    let (detail, _) = truncate_text(&detail, 400);
    match status {
        401 => "Jira 401: Anmeldung fehlgeschlagen. Bitte E-Mail und API-Token in den Einstellungen prüfen.".into(),
        403 => "Jira 403: Der Zugriff wurde verweigert. Fehlen dem Konto Leserechte für dieses Projekt?".into(),
        404 => "Jira 404: Nicht gefunden. Existiert das Ticket und ist es für dieses Konto sichtbar?".into(),
        429 => "Jira 429: Rate-Limit erreicht. Bitte später erneut versuchen.".into(),
        _ if detail.is_empty() => format!("Jira {status}."),
        _ => format!("Jira {status}: {detail}"),
    }
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        // A redirect would replay the Authorization header at whatever host the
        // response points to. Never follow one.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Jira HTTP-Client: {e}"))
}

fn basic_auth(credentials: &JiraCredentials) -> String {
    format!(
        "Basic {}",
        B64.encode(format!("{}:{}", credentials.email, credentials.api_token))
    )
}

/// The single outbound call site. Hardcoded `GET`, no body, no redirects.
async fn jira_get(
    credentials: &JiraCredentials,
    path: &str,
    query: &[(&str, String)],
) -> Result<Value, String> {
    let url = build_api_url(&credentials.base_url, path)?;
    let client = http_client()?;
    let response = client
        .get(&url)
        .query(query)
        .header("Accept", "application/json")
        .header("User-Agent", "l8git")
        .header("Authorization", basic_auth(credentials))
        .send()
        .await
        .map_err(|e| {
            format!(
                "Jira: {}",
                redact_secret(&e.to_string(), &credentials.api_token)
            )
        })?;

    let status = response.status();
    if status.is_redirection() {
        return Err("Jira: Die Instanz hat eine Weiterleitung angefordert — abgebrochen, damit der Token die konfigurierte Domain nicht verlässt.".into());
    }
    if let Some(length) = response.content_length() {
        if length > MAX_RESPONSE_BYTES {
            return Err("Jira: Die Antwort ist zu groß.".into());
        }
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Jira: {}", redact_secret(&e.to_string(), &credentials.api_token)))?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("Jira: Die Antwort ist zu groß.".into());
    }
    if !status.is_success() {
        let body = String::from_utf8_lossy(&bytes);
        return Err(describe_http_error(
            status.as_u16(),
            &body,
            &credentials.api_token,
        ));
    }
    serde_json::from_slice::<Value>(&bytes).map_err(|_| {
        "Jira: Die Antwort war kein JSON. Zeigt die Base-URL wirklich auf eine Jira-Instanz?".into()
    })
}

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

fn load_credentials_blocking() -> Result<Option<JiraCredentials>, String> {
    let Some(raw) = get_secret(KEYRING_KEY)? else {
        return Ok(None);
    };
    match serde_json::from_str::<JiraCredentials>(&raw) {
        Ok(credentials) => Ok(Some(credentials)),
        // A corrupt record is treated as "not configured" rather than as a hard
        // error, so the user can simply save again.
        Err(_) => Ok(None),
    }
}

async fn load_credentials() -> Result<JiraCredentials, String> {
    tokio::task::spawn_blocking(load_credentials_blocking)
        .await
        .map_err(|e| e.to_string())??
        .ok_or_else(|| {
            "Jira ist nicht konfiguriert. Bitte Base-URL, E-Mail und API-Token in den Einstellungen hinterlegen.".to_string()
        })
}

pub fn status_of(credentials: Option<&JiraCredentials>) -> JiraCredentialStatus {
    match credentials {
        Some(credentials) => JiraCredentialStatus {
            configured: true,
            base_url: credentials.base_url.clone(),
            email: credentials.email.clone(),
            token_hint: token_hint(&credentials.api_token),
        },
        None => JiraCredentialStatus::default(),
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn jira_save_credentials(
    base_url: String,
    email: String,
    api_token: String,
) -> Result<JiraCredentialStatus, String> {
    let credentials = JiraCredentials {
        base_url: normalize_base_url(&base_url)?,
        email: validate_email(&email)?,
        api_token: validate_api_token(&api_token)?,
    };
    let payload = serde_json::to_string(&credentials)
        .map_err(|_| "Jira: Zugangsdaten konnten nicht serialisiert werden.".to_string())?;
    tokio::task::spawn_blocking(move || set_secret(KEYRING_KEY, &payload))
        .await
        .map_err(|e| e.to_string())??;
    Ok(status_of(Some(&credentials)))
}

#[tauri::command]
pub async fn jira_credentials_status() -> Result<JiraCredentialStatus, String> {
    let credentials = tokio::task::spawn_blocking(load_credentials_blocking)
        .await
        .map_err(|e| e.to_string())??;
    Ok(status_of(credentials.as_ref()))
}

#[tauri::command]
pub async fn jira_delete_credentials() -> Result<(), String> {
    tokio::task::spawn_blocking(|| delete_secret(KEYRING_KEY))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn jira_test_connection() -> Result<JiraAccount, String> {
    let credentials = load_credentials().await?;
    let value = jira_get(&credentials, "/rest/api/3/myself", &[]).await?;
    Ok(JiraAccount {
        account_id: str_field(&value, "accountId"),
        display_name: str_field(&value, "displayName"),
        email: str_field(&value, "emailAddress"),
    })
}

/// Reads one issue. Shared by the Tauri command and the stdio MCP server.
pub async fn fetch_issue(key: &str, max_body_chars: usize) -> Result<JiraIssue, String> {
    let credentials = load_credentials().await?;
    let key = validate_issue_key(key)?;
    let value = jira_get(
        &credentials,
        &format!("/rest/api/3/issue/{key}"),
        &[("fields", ISSUE_FIELDS.to_string())],
    )
    .await?;
    Ok(summarize_issue(&value, &credentials.base_url, max_body_chars))
}

pub async fn fetch_comments(key: &str, limit: u32) -> Result<Vec<JiraComment>, String> {
    let credentials = load_credentials().await?;
    let key = validate_issue_key(key)?;
    let limit = clamp_limit(Some(limit), MAX_COMMENTS);
    let value = jira_get(
        &credentials,
        &format!("/rest/api/3/issue/{key}/comment"),
        &[
            ("maxResults", limit.to_string()),
            ("orderBy", "-created".to_string()),
        ],
    )
    .await?;
    Ok(value
        .get("comments")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .take(limit as usize)
                .map(|item| summarize_comment(item, MAX_BODY_CHARS))
                .collect()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub async fn jira_fetch_issue(key: String) -> Result<JiraIssue, String> {
    fetch_issue(&key, MAX_BODY_CHARS).await
}

#[tauri::command]
pub async fn jira_fetch_comments(key: String, limit: Option<u32>) -> Result<Vec<JiraComment>, String> {
    fetch_comments(&key, clamp_limit(limit, MAX_COMMENTS)).await
}

#[tauri::command]
pub async fn jira_search_issues(
    jql: String,
    limit: Option<u32>,
) -> Result<JiraSearchResult, String> {
    search_issues(&jql, clamp_limit(limit, MAX_SEARCH_RESULTS)).await
}

pub async fn search_issues(jql: &str, limit: u32) -> Result<JiraSearchResult, String> {
    let credentials = load_credentials().await?;
    let jql = validate_jql(jql)?;
    let limit = clamp_limit(Some(limit), MAX_SEARCH_RESULTS);
    let query = [
        ("jql", jql),
        ("maxResults", limit.to_string()),
        ("fields", SEARCH_FIELDS.to_string()),
    ];
    // Jira Cloud replaced /search with /search/jql; Server/Data Center still
    // only knows the old route.
    let value = match jira_get(&credentials, "/rest/api/3/search/jql", &query).await {
        Ok(value) => value,
        Err(error) if error.contains("404") || error.contains("410") => {
            jira_get(&credentials, "/rest/api/3/search", &query).await?
        }
        Err(error) => return Err(error),
    };
    let issues: Vec<JiraIssue> = value
        .get("issues")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .take(limit as usize)
                .map(|item| summarize_issue(item, &credentials.base_url, 0))
                .collect()
        })
        .unwrap_or_default();
    let total = value
        .get("total")
        .and_then(Value::as_u64)
        .unwrap_or(issues.len() as u64) as u32;
    Ok(JiraSearchResult {
        truncated: total as usize > issues.len(),
        total,
        issues,
    })
}
