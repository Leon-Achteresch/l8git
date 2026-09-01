//! Capability-Marktplatz: durchsucht GitHub nach Skills, MCP-Servern, Hooks,
//! Slash-Commands und Plugins, zeigt Sterne/Popularität und installiert die
//! gefundenen Bausteine direkt in die gewünschte Agent-CLI.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::capability_sync::{
    backup_existing, cli_root, kind_dir, label_of, layout, merge_hook, normalized_rel, repo_path,
    result, safe_relative, supports_kind, write_mcp_spec, CapabilityOpResult, CapabilityTargetRef,
    McpSpec,
};

const SEARCH_TTL: Duration = Duration::from_secs(300);
const DETAIL_TTL: Duration = Duration::from_secs(600);
const TOKEN_TTL: Duration = Duration::from_secs(900);
const MAX_INSTALL_FILES: usize = 300;
const MAX_FILE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 20 * 1024 * 1024;
const MAX_ASSETS_PER_KIND: usize = 80;

// ---------------------------------------------------------------------------
// Datenmodelle
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketRepo {
    pub full_name: String,
    pub name: String,
    pub owner: String,
    pub avatar_url: String,
    pub description: String,
    pub html_url: String,
    pub homepage: String,
    pub stars: u64,
    pub forks: u64,
    pub open_issues: u64,
    pub topics: Vec<String>,
    pub language: String,
    pub license: String,
    pub updated_at: String,
    pub pushed_at: String,
    pub archived: bool,
    pub default_branch: String,
    /// Grobe Einordnung der Popularität: `hot` | `popular` | `growing` | `fresh`
    pub popularity: String,
    /// Warum dieser Treffer zur gesuchten Art passt
    pub kind: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketSearchResult {
    pub items: Vec<MarketRepo>,
    pub queries: Vec<String>,
    pub total_count: u64,
    pub authenticated: bool,
    pub cached: bool,
    pub rate_limited: bool,
    pub notes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketAsset {
    /// `skill` | `command` | `agent` | `mcp` | `hook` | `hookScript` | `pluginMarketplace`
    pub kind: String,
    pub name: String,
    pub path: String,
    pub description: String,
    pub file_count: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketDetail {
    pub repo: MarketRepo,
    pub ref_name: String,
    pub assets: Vec<MarketAsset>,
    pub readme_excerpt: String,
    pub mcp_suggestion: Option<McpSpec>,
    pub truncated: bool,
    pub cached: bool,
}

// ---------------------------------------------------------------------------
// GitHub-Zugriff
// ---------------------------------------------------------------------------

static SEARCH_CACHE: Lazy<Mutex<HashMap<String, (Instant, MarketSearchResult)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static DETAIL_CACHE: Lazy<Mutex<HashMap<String, (Instant, MarketDetail)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static TREE_CACHE: Lazy<Mutex<HashMap<String, (Instant, Vec<(String, String, u64)>)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static TOKEN_CACHE: Lazy<Mutex<Option<(Instant, Option<String>)>>> = Lazy::new(|| Mutex::new(None));

async fn github_token() -> Option<String> {
    if let Ok(cache) = TOKEN_CACHE.lock() {
        if let Some((fetched, token)) = cache.as_ref() {
            if fetched.elapsed() < TOKEN_TTL {
                return token.clone();
            }
        }
    }
    let token = tokio::task::spawn_blocking(|| {
        crate::credentials::read_https_credential("github.com")
            .ok()
            .map(|credential| credential.password)
    })
    .await
    .ok()
    .flatten();
    if let Ok(mut cache) = TOKEN_CACHE.lock() {
        *cache = Some((Instant::now(), token.clone()));
    }
    token
}

async fn github_get(url: &str, token: Option<&str>) -> Result<(u16, Value), String> {
    let client = crate::providers::http_client()?;
    let mut request = client
        .get(url)
        .header("User-Agent", "l8git")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(token) = token {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("GitHub: {error}"))?;
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    let value = serde_json::from_str::<Value>(&body).unwrap_or(Value::Null);
    Ok((status, value))
}

async fn github_raw(full_name: &str, ref_name: &str, path: &str) -> Result<Vec<u8>, String> {
    let client = crate::providers::http_client()?;
    let url = format!("https://raw.githubusercontent.com/{full_name}/{ref_name}/{path}");
    let response = client
        .get(&url)
        .header("User-Agent", "l8git")
        .send()
        .await
        .map_err(|error| format!("Download: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Download fehlgeschlagen ({}).", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Download: {error}"))?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(format!("{path} ist größer als 2 MB."));
    }
    Ok(bytes.to_vec())
}

fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn number(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn popularity(stars: u64, pushed_at: &str) -> String {
    let recent = pushed_at
        .get(0..4)
        .and_then(|year| year.parse::<i32>().ok())
        .map(|year| year >= 2025)
        .unwrap_or(false);
    match stars {
        _ if stars >= 5_000 => "hot".into(),
        _ if stars >= 500 => "popular".into(),
        _ if stars >= 50 => "growing".into(),
        _ if recent => "fresh".into(),
        _ => "small".into(),
    }
}

fn map_repo(value: &Value, kind: &str) -> MarketRepo {
    let full_name = text(value, "full_name");
    let owner = value
        .get("owner")
        .map(|owner| text(owner, "login"))
        .unwrap_or_default();
    let pushed_at = text(value, "pushed_at");
    let stars = number(value, "stargazers_count");
    MarketRepo {
        name: text(value, "name"),
        owner: owner.clone(),
        avatar_url: value
            .get("owner")
            .map(|owner| text(owner, "avatar_url"))
            .unwrap_or_default(),
        description: text(value, "description"),
        html_url: text(value, "html_url"),
        homepage: text(value, "homepage"),
        stars,
        forks: number(value, "forks_count"),
        open_issues: number(value, "open_issues_count"),
        topics: value
            .get("topics")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        language: text(value, "language"),
        license: value
            .get("license")
            .and_then(|license| license.get("spdx_id"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        updated_at: text(value, "updated_at"),
        archived: value.get("archived").and_then(Value::as_bool).unwrap_or(false),
        default_branch: text(value, "default_branch"),
        popularity: popularity(stars, &pushed_at),
        pushed_at,
        kind: kind.to_string(),
        full_name,
    }
}

/// Suchanfragen pro Capability-Art. Mehrere Anfragen, damit sowohl
/// Topic-getaggte als auch nur beschriebene Repositories gefunden werden.
fn kind_queries(kind: &str) -> Vec<String> {
    let base: Vec<&str> = match kind {
        "skill" => vec![
            "topic:claude-skills",
            "topic:agent-skills",
            "claude skills in:name,description,readme",
        ],
        "mcp" => vec![
            "topic:mcp-server",
            "topic:model-context-protocol",
            "mcp server in:name,description",
        ],
        "plugin" => vec![
            "topic:claude-code-plugin",
            "topic:claude-plugins",
            "claude code plugin in:name,description",
        ],
        "hook" => vec![
            "topic:claude-code-hooks",
            "topic:claude-hooks",
            "claude code hooks in:name,description",
        ],
        "command" => vec![
            "topic:claude-commands",
            "topic:slash-commands",
            "claude code commands in:name,description",
        ],
        _ => vec![
            "topic:claude-skills",
            "topic:mcp-server",
            "topic:claude-code-plugin",
        ],
    };
    base.into_iter().map(str::to_string).collect()
}

fn sanitize_query(query: &str) -> String {
    query
        .chars()
        .filter(|character| {
            character.is_alphanumeric()
                || matches!(character, ' ' | '-' | '_' | '.' | '/' | '+' | '#')
        })
        .take(120)
        .collect::<String>()
        .trim()
        .to_string()
}

// ---------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn agent_market_search(
    kind: String,
    query: String,
    sort: String,
    min_stars: Option<u64>,
) -> Result<MarketSearchResult, String> {
    let cleaned = sanitize_query(&query);
    let sort = match sort.as_str() {
        "updated" => "updated",
        "forks" => "forks",
        _ => "stars",
    };
    let cache_key = format!("{kind}|{cleaned}|{sort}|{}", min_stars.unwrap_or(0));
    if let Ok(cache) = SEARCH_CACHE.lock() {
        if let Some((fetched, cached)) = cache.get(&cache_key) {
            if fetched.elapsed() < SEARCH_TTL {
                let mut hit = cached.clone();
                hit.cached = true;
                return Ok(hit);
            }
        }
    }

    let token = github_token().await;
    let mut items: Vec<MarketRepo> = Vec::new();
    let mut queries = Vec::new();
    let mut notes = Vec::new();
    let mut rate_limited = false;
    let mut total_count = 0_u64;

    for base in kind_queries(&kind) {
        let mut parts = vec![base.clone()];
        if !cleaned.is_empty() {
            parts.push(cleaned.clone());
        }
        if let Some(stars) = min_stars.filter(|value| *value > 0) {
            parts.push(format!("stars:>={stars}"));
        }
        let full_query = parts.join(" ");
        let url = format!(
            "https://api.github.com/search/repositories?q={}&sort={sort}&order=desc&per_page=25",
            urlencode(&full_query)
        );
        queries.push(full_query);
        let (status, value) = match github_get(&url, token.as_deref()).await {
            Ok(response) => response,
            Err(error) => {
                notes.push(error);
                continue;
            }
        };
        if status == 403 || status == 429 {
            rate_limited = true;
            notes.push(if token.is_some() {
                "GitHub-Suchlimit erreicht – bitte kurz warten.".to_string()
            } else {
                "GitHub-Suchlimit erreicht. Mit einem GitHub-Login in den Einstellungen sind deutlich mehr Suchen möglich.".to_string()
            });
            continue;
        }
        if status >= 400 {
            notes.push(format!(
                "GitHub antwortete mit {status}: {}",
                text(&value, "message")
            ));
            continue;
        }
        total_count = total_count.max(number(&value, "total_count"));
        let Some(entries) = value.get("items").and_then(Value::as_array) else {
            continue;
        };
        for entry in entries {
            let repo = map_repo(entry, &kind);
            if repo.full_name.is_empty() {
                continue;
            }
            if !items.iter().any(|existing| existing.full_name == repo.full_name) {
                items.push(repo);
            }
        }
    }

    match sort {
        "updated" => items.sort_by(|a, b| b.pushed_at.cmp(&a.pushed_at)),
        "forks" => items.sort_by(|a, b| b.forks.cmp(&a.forks)),
        _ => items.sort_by(|a, b| b.stars.cmp(&a.stars)),
    }
    items.truncate(60);

    let outcome = MarketSearchResult {
        items,
        queries,
        total_count,
        authenticated: token.is_some(),
        cached: false,
        rate_limited,
        notes,
    };
    if !outcome.items.is_empty() {
        if let Ok(mut cache) = SEARCH_CACHE.lock() {
            if cache.len() > 60 {
                cache.clear();
            }
            cache.insert(cache_key, (Instant::now(), outcome.clone()));
        }
    }
    Ok(outcome)
}

fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Repository untersuchen
// ---------------------------------------------------------------------------

fn safe_full_name(full_name: &str) -> Result<String, String> {
    let trimmed = full_name.trim();
    let mut parts = trimmed.split('/');
    let (Some(owner), Some(repo), None) = (parts.next(), parts.next(), parts.next()) else {
        return Err("Ungültiger Repository-Name (erwartet: owner/repo).".into());
    };
    let valid = |value: &str| {
        !value.is_empty()
            && value.len() <= 100
            && value
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    };
    if !valid(owner) || !valid(repo) {
        return Err("Ungültiger Repository-Name.".into());
    }
    Ok(format!("{owner}/{repo}"))
}

fn safe_ref(ref_name: &str) -> Result<String, String> {
    let trimmed = ref_name.trim();
    if trimmed.is_empty()
        || trimmed.len() > 100
        || !trimmed
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/'))
        || trimmed.contains("..")
    {
        return Err("Ungültiger Branch oder Tag.".into());
    }
    Ok(trimmed.to_string())
}

async fn repo_tree(full_name: &str, ref_name: &str) -> Result<(Vec<(String, String, u64)>, bool), String> {
    let key = format!("{full_name}@{ref_name}");
    if let Ok(cache) = TREE_CACHE.lock() {
        if let Some((fetched, entries)) = cache.get(&key) {
            if fetched.elapsed() < DETAIL_TTL {
                return Ok((entries.clone(), false));
            }
        }
    }
    let token = github_token().await;
    let url = format!("https://api.github.com/repos/{full_name}/git/trees/{ref_name}?recursive=1");
    let (status, value) = github_get(&url, token.as_deref()).await?;
    if status >= 400 {
        return Err(format!(
            "Repository-Inhalt konnte nicht gelesen werden ({status}): {}",
            text(&value, "message")
        ));
    }
    let truncated = value.get("truncated").and_then(Value::as_bool).unwrap_or(false);
    let entries: Vec<(String, String, u64)> = value
        .get("tree")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    (
                        text(item, "path"),
                        text(item, "type"),
                        number(item, "size"),
                    )
                })
                .filter(|(path, _, _)| !path.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if let Ok(mut cache) = TREE_CACHE.lock() {
        if cache.len() > 30 {
            cache.clear();
        }
        cache.insert(key, (Instant::now(), entries.clone()));
    }
    Ok((entries, truncated))
}

fn segment_matches(path: &str, folder: &str) -> bool {
    path.split('/').any(|segment| segment == folder)
}

fn detect_assets(entries: &[(String, String, u64)]) -> Vec<MarketAsset> {
    let mut assets: Vec<MarketAsset> = Vec::new();
    let files: Vec<&String> = entries
        .iter()
        .filter(|(_, kind, _)| kind == "blob")
        .map(|(path, _, _)| path)
        .collect();

    let push = |asset: MarketAsset, assets: &mut Vec<MarketAsset>| {
        if assets.iter().filter(|entry| entry.kind == asset.kind).count() >= MAX_ASSETS_PER_KIND {
            return;
        }
        if assets
            .iter()
            .any(|entry| entry.kind == asset.kind && entry.path == asset.path)
        {
            return;
        }
        assets.push(asset);
    };

    for path in &files {
        let lower = path.to_lowercase();
        if path.ends_with("SKILL.md") {
            let directory = path.rsplit_once('/').map(|(head, _)| head).unwrap_or("");
            let name = directory.rsplit('/').next().unwrap_or(directory);
            if name.is_empty() {
                continue;
            }
            let file_count = files
                .iter()
                .filter(|candidate| candidate.starts_with(&format!("{directory}/")))
                .count() as u32;
            push(
                MarketAsset {
                    kind: "skill".into(),
                    name: name.to_string(),
                    path: directory.to_string(),
                    description: format!("Skill-Ordner mit {file_count} Datei(en)"),
                    file_count,
                },
                &mut assets,
            );
        } else if lower.ends_with(".md")
            && (segment_matches(path, "commands") || segment_matches(path, "prompts"))
        {
            push(
                MarketAsset {
                    kind: "command".into(),
                    name: file_stem(path),
                    path: (*path).clone(),
                    description: "Slash-Command".into(),
                    file_count: 1,
                },
                &mut assets,
            );
        } else if lower.ends_with(".md")
            && (segment_matches(path, "agents") || segment_matches(path, "subagents"))
        {
            push(
                MarketAsset {
                    kind: "agent".into(),
                    name: file_stem(path),
                    path: (*path).clone(),
                    description: "Subagent".into(),
                    file_count: 1,
                },
                &mut assets,
            );
        } else if lower.ends_with(".mcp.json")
            || lower.ends_with("/mcp.json")
            || lower == "mcp.json"
            || lower == ".mcp.json"
        {
            push(
                MarketAsset {
                    kind: "mcp".into(),
                    name: file_stem(path),
                    path: (*path).clone(),
                    description: "MCP-Server-Definitionen".into(),
                    file_count: 1,
                },
                &mut assets,
            );
        } else if lower.ends_with("settings.json") && segment_matches(path, ".claude") {
            push(
                MarketAsset {
                    kind: "hook".into(),
                    name: file_stem(path),
                    path: (*path).clone(),
                    description: "Hook-Definitionen aus settings.json".into(),
                    file_count: 1,
                },
                &mut assets,
            );
        } else if segment_matches(path, "hooks")
            && (lower.ends_with(".sh")
                || lower.ends_with(".py")
                || lower.ends_with(".js")
                || lower.ends_with(".ts"))
        {
            push(
                MarketAsset {
                    kind: "hookScript".into(),
                    name: path.rsplit('/').next().unwrap_or(path).to_string(),
                    path: (*path).clone(),
                    description: "Hook-Skript".into(),
                    file_count: 1,
                },
                &mut assets,
            );
        } else if lower.ends_with(".claude-plugin/marketplace.json")
            || lower == "marketplace.json"
        {
            push(
                MarketAsset {
                    kind: "pluginMarketplace".into(),
                    name: "Plugin-Marktplatz".into(),
                    path: (*path).clone(),
                    description: "Als Plugin-Quelle in der CLI registrieren".into(),
                    file_count: 1,
                },
                &mut assets,
            );
        } else if lower.ends_with(".claude-plugin/plugin.json") {
            push(
                MarketAsset {
                    kind: "pluginMarketplace".into(),
                    name: "Plugin".into(),
                    path: (*path).clone(),
                    description: "Plugin-Repository als Quelle registrieren".into(),
                    file_count: 1,
                },
                &mut assets,
            );
        }
    }

    assets.sort_by(|a, b| a.kind.cmp(&b.kind).then(a.name.cmp(&b.name)));
    assets
}

fn file_stem(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".prompt.md")
        .or_else(|| name.strip_suffix(".md"))
        .or_else(|| name.strip_suffix(".json"))
        .unwrap_or(name)
        .to_string()
}

fn readme_excerpt(markdown: &str) -> String {
    markdown
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && !trimmed.starts_with("![")
                && !trimmed.starts_with("<img")
                && !trimmed.starts_with("<p")
                && !trimmed.starts_with("<div")
                && !trimmed.starts_with("[![")
        })
        .map(|line| line.trim_start_matches('#').trim())
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(1_200)
        .collect()
}

#[tauri::command]
pub async fn agent_market_inspect(
    full_name: String,
    ref_name: Option<String>,
) -> Result<MarketDetail, String> {
    let full_name = safe_full_name(&full_name)?;
    let cache_key = format!("{full_name}@{}", ref_name.clone().unwrap_or_default());
    if let Ok(cache) = DETAIL_CACHE.lock() {
        if let Some((fetched, cached)) = cache.get(&cache_key) {
            if fetched.elapsed() < DETAIL_TTL {
                let mut hit = cached.clone();
                hit.cached = true;
                return Ok(hit);
            }
        }
    }

    let token = github_token().await;
    let (status, value) = github_get(
        &format!("https://api.github.com/repos/{full_name}"),
        token.as_deref(),
    )
    .await?;
    if status >= 400 {
        return Err(format!(
            "Repository konnte nicht geladen werden ({status}): {}",
            text(&value, "message")
        ));
    }
    let repo = map_repo(&value, "repo");
    let reference = match ref_name {
        Some(candidate) if !candidate.trim().is_empty() => safe_ref(&candidate)?,
        _ => {
            if repo.default_branch.is_empty() {
                "main".to_string()
            } else {
                safe_ref(&repo.default_branch)?
            }
        }
    };
    let (entries, truncated) = repo_tree(&full_name, &reference).await?;
    let assets = detect_assets(&entries);

    let readme = match github_get(
        &format!("https://api.github.com/repos/{full_name}/readme?ref={reference}"),
        token.as_deref(),
    )
    .await
    {
        Ok((status, value)) if status < 400 => {
            let encoded = text(&value, "content").replace(['\n', '\r'], "");
            base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
                .map(|markdown| readme_excerpt(&markdown))
                .unwrap_or_default()
        }
        _ => String::new(),
    };

    let mcp_suggestion = if entries
        .iter()
        .any(|(path, kind, _)| path == "package.json" && kind == "blob")
    {
        match github_raw(&full_name, &reference, "package.json").await {
            Ok(bytes) => serde_json::from_slice::<Value>(&bytes)
                .ok()
                .and_then(|manifest| {
                    let name = text(&manifest, "name");
                    let has_bin = manifest.get("bin").is_some();
                    if name.is_empty() || !has_bin {
                        return None;
                    }
                    Some(McpSpec {
                        name: name.rsplit('/').next().unwrap_or(&name).to_string(),
                        transport: "stdio".into(),
                        command: Some("npx".into()),
                        args: vec!["-y".into(), name],
                        enabled: true,
                        ..McpSpec::default()
                    })
                }),
            Err(_) => None,
        }
    } else {
        None
    };

    let detail = MarketDetail {
        repo,
        ref_name: reference,
        assets,
        readme_excerpt: readme,
        mcp_suggestion,
        truncated,
        cached: false,
    };
    if let Ok(mut cache) = DETAIL_CACHE.lock() {
        if cache.len() > 30 {
            cache.clear();
        }
        cache.insert(cache_key, (Instant::now(), detail.clone()));
    }
    Ok(detail)
}

// ---------------------------------------------------------------------------
// Installation in eine CLI
// ---------------------------------------------------------------------------

struct InstallBudget {
    files: usize,
    bytes: usize,
}

impl InstallBudget {
    fn charge(&mut self, size: usize) -> Result<(), String> {
        self.files += 1;
        self.bytes += size;
        if self.files > MAX_INSTALL_FILES {
            return Err(format!("Mehr als {MAX_INSTALL_FILES} Dateien – Installation abgebrochen."));
        }
        if self.bytes > MAX_TOTAL_BYTES {
            return Err("Mehr als 20 MB – Installation abgebrochen.".into());
        }
        Ok(())
    }
}

fn target_directory(
    target: &CapabilityTargetRef,
    repo: &Path,
    kind: &str,
) -> Result<PathBuf, String> {
    let layout = layout(&target.cli).ok_or_else(|| "Unbekannte CLI.".to_string())?;
    let root = cli_root(layout, &target.scope, repo)
        .ok_or_else(|| "Zielverzeichnis nicht gefunden.".to_string())?;
    match kind {
        "hookScript" => Ok(root.join("hooks")),
        _ => {
            let directory = kind_dir(layout, kind)
                .ok_or_else(|| format!("{} kennt diese Capability-Art nicht.", layout.label))?;
            Ok(root.join(directory))
        }
    }
}

async fn install_files(
    full_name: &str,
    ref_name: &str,
    asset: &MarketAsset,
    target: &CapabilityTargetRef,
    repo: &Path,
    overwrite: bool,
    budget: &mut InstallBudget,
) -> Result<(String, u32), String> {
    let target_layout = layout(&target.cli).ok_or_else(|| "Unbekannte CLI.".to_string())?;
    let directory = target_directory(target, repo, &asset.kind)?;
    let root = cli_root(target_layout, &target.scope, repo)
        .ok_or_else(|| "Zielverzeichnis nicht gefunden.".to_string())?;

    if asset.kind == "skill" {
        let (entries, _) = repo_tree(full_name, ref_name).await?;
        let prefix = format!("{}/", asset.path.trim_end_matches('/'));
        let files: Vec<String> = entries
            .iter()
            .filter(|(path, kind, _)| kind == "blob" && path.starts_with(&prefix))
            .map(|(path, _, _)| path.clone())
            .collect();
        if files.is_empty() {
            return Err("Der Skill-Ordner ist leer.".into());
        }
        let destination = directory.join(safe_relative(&asset.name)?);
        if destination.exists() && !overwrite {
            return Err("Skill existiert bereits – Überschreiben ist nicht aktiviert.".into());
        }
        backup_existing(&root, &destination, &asset.name)?;
        let mut written = 0_u32;
        for file in files {
            let relative = file.trim_start_matches(&prefix).to_string();
            let bytes = github_raw(full_name, ref_name, &file).await?;
            budget.charge(bytes.len())?;
            let path = destination.join(safe_relative(&relative)?);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
            written += 1;
        }
        return Ok((destination.to_string_lossy().into_owned(), written));
    }

    let file_name = asset.path.rsplit('/').next().unwrap_or(&asset.path).to_string();
    let relative = if asset.kind == "hookScript" {
        file_name
    } else {
        normalized_rel(target_layout, &asset.kind, &file_name)
    };
    let destination = directory.join(safe_relative(&relative)?);
    if destination.exists() && !overwrite {
        return Err("Datei existiert bereits – Überschreiben ist nicht aktiviert.".into());
    }
    let bytes = github_raw(full_name, ref_name, &asset.path).await?;
    budget.charge(bytes.len())?;
    backup_existing(&root, &destination, &asset.name)?;
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(&destination, &bytes).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    if asset.kind == "hookScript" {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&destination, std::fs::Permissions::from_mode(0o755));
    }
    Ok((destination.to_string_lossy().into_owned(), 1))
}

fn specs_from_bundle(value: &Value) -> Vec<McpSpec> {
    let mut specs = Vec::new();
    for key in ["mcpServers", "mcp", "servers"] {
        let Some(object) = value.get(key).and_then(Value::as_object) else {
            continue;
        };
        for (name, config) in object {
            let url = config
                .get("url")
                .and_then(Value::as_str)
                .map(str::to_string);
            let command_list: Vec<String> = config
                .get("command")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let command = config
                .get("command")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| command_list.first().cloned());
            let args = if command_list.len() > 1 {
                command_list[1..].to_vec()
            } else {
                config
                    .get("args")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|item| item.as_str().map(str::to_string))
                            .collect()
                    })
                    .unwrap_or_default()
            };
            let env = config
                .get("env")
                .or_else(|| config.get("environment"))
                .and_then(Value::as_object)
                .map(|object| {
                    object
                        .iter()
                        .filter_map(|(key, value)| {
                            value.as_str().map(|text| (key.clone(), text.to_string()))
                        })
                        .collect()
                })
                .unwrap_or_default();
            specs.push(McpSpec {
                name: name.clone(),
                transport: if url.is_some() { "http".into() } else { "stdio".into() },
                command,
                args,
                env,
                url,
                headers: Default::default(),
                enabled: true,
            });
        }
        if !specs.is_empty() {
            break;
        }
    }
    specs
}

async fn install_mcp(
    full_name: &str,
    ref_name: &str,
    asset: &MarketAsset,
    target: &CapabilityTargetRef,
    repo: &Path,
) -> Result<(String, u32), String> {
    let target_layout = layout(&target.cli).ok_or_else(|| "Unbekannte CLI.".to_string())?;
    let bytes = github_raw(full_name, ref_name, &asset.path).await?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("{} ist kein gültiges JSON: {error}", asset.path))?;
    let specs = specs_from_bundle(&value);
    if specs.is_empty() {
        return Err("Keine MCP-Server in der Datei gefunden.".into());
    }
    let mut path = String::new();
    for spec in &specs {
        path = write_mcp_spec(target_layout, &target.scope, repo, spec)?
            .to_string_lossy()
            .into_owned();
    }
    Ok((path, specs.len() as u32))
}

async fn install_hooks(
    full_name: &str,
    ref_name: &str,
    asset: &MarketAsset,
    target: &CapabilityTargetRef,
    repo: &Path,
) -> Result<(String, u32), String> {
    let target_layout = layout(&target.cli).ok_or_else(|| "Unbekannte CLI.".to_string())?;
    if !supports_kind(target_layout, "hook") {
        return Err(format!("{} unterstützt keine Hooks.", target_layout.label));
    }
    let bytes = github_raw(full_name, ref_name, &asset.path).await?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("{} ist kein gültiges JSON: {error}", asset.path))?;
    let Some(hooks) = value.get("hooks").and_then(Value::as_object) else {
        return Err("Die Datei enthält keine Hook-Definitionen.".into());
    };
    let mut count = 0_u32;
    let mut path = String::new();
    for (event, groups) in hooks {
        let Some(groups) = groups.as_array() else {
            continue;
        };
        for group in groups {
            path = merge_hook(target_layout, &target.scope, repo, event, group)?
                .to_string_lossy()
                .into_owned();
            count += 1;
        }
    }
    if count == 0 {
        return Err("Keine übertragbaren Hooks gefunden.".into());
    }
    Ok((path, count))
}

fn add_plugin_marketplace(cli: &str, source: &str, repo: &Path) -> Result<String, String> {
    let layout = layout(cli).ok_or_else(|| "Unbekannte CLI.".to_string())?;
    if !crate::shell::cli_in_path(layout.command) {
        return Err(format!("{} ist nicht installiert.", layout.label));
    }
    if !matches!(cli, "claude" | "codex") {
        return Err(format!("{} kennt keine Plugin-Marktplätze.", layout.label));
    }
    let output = crate::cmd::cli_command(layout.command)
        .args(["plugin", "marketplace", "add", source])
        .current_dir(repo)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if message.is_empty() {
        "Der CLI-Befehl ist fehlgeschlagen.".into()
    } else {
        message
    })
}

#[tauri::command]
pub async fn agent_market_install(
    path: String,
    full_name: String,
    ref_name: String,
    assets: Vec<MarketAsset>,
    targets: Vec<CapabilityTargetRef>,
    overwrite: bool,
) -> Result<Vec<CapabilityOpResult>, String> {
    let full_name = safe_full_name(&full_name)?;
    let reference = safe_ref(&ref_name)?;
    let repo = repo_path(&path);
    let mut results = Vec::new();
    let mut budget = InstallBudget { files: 0, bytes: 0 };

    for target in &targets {
        let target_label = label_of(&target.cli, &target.scope);
        for asset in &assets {
            let outcome = match asset.kind.as_str() {
                "skill" | "command" | "agent" | "hookScript" => {
                    install_files(&full_name, &reference, asset, target, &repo, overwrite, &mut budget).await
                }
                "mcp" => install_mcp(&full_name, &reference, asset, target, &repo).await,
                "hook" => install_hooks(&full_name, &reference, asset, target, &repo).await,
                "pluginMarketplace" => {
                    let repo_clone = repo.clone();
                    let cli = target.cli.clone();
                    let source = full_name.clone();
                    tokio::task::spawn_blocking(move || {
                        add_plugin_marketplace(&cli, &source, &repo_clone)
                    })
                    .await
                    .map_err(|error| error.to_string())
                    .and_then(|inner| inner)
                    .map(|message| (message, 1))
                }
                other => Err(format!("Unbekannte Art: {other}")),
            };
            results.push(match outcome {
                Ok((location, count)) => result(
                    &asset.kind,
                    &asset.name,
                    &full_name,
                    &target_label,
                    "installed",
                    format!("{count} Element(e) installiert."),
                    Some(location),
                    None,
                ),
                Err(error) => result(
                    &asset.kind,
                    &asset.name,
                    &full_name,
                    &target_label,
                    "error",
                    error,
                    None,
                    None,
                ),
            });
        }
    }
    Ok(results)
}

/// Fügt einen MCP-Server manuell (z. B. den Vorschlag aus `inspect`) hinzu.
#[tauri::command]
pub async fn agent_market_add_mcp(
    path: String,
    spec: McpSpec,
    targets: Vec<CapabilityTargetRef>,
) -> Result<Vec<CapabilityOpResult>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = repo_path(&path);
        targets
            .iter()
            .map(|target| {
                let target_label = label_of(&target.cli, &target.scope);
                let outcome = layout(&target.cli)
                    .ok_or_else(|| "Unbekannte CLI.".to_string())
                    .and_then(|entry| write_mcp_spec(entry, &target.scope, &repo, &spec));
                match outcome {
                    Ok(location) => result(
                        "mcp",
                        &spec.name,
                        "manuell",
                        &target_label,
                        "installed",
                        "MCP-Server eingetragen.",
                        Some(location.to_string_lossy().into_owned()),
                        None,
                    ),
                    Err(error) => result(
                        "mcp",
                        &spec.name,
                        "manuell",
                        &target_label,
                        "error",
                        error,
                        None,
                        None,
                    ),
                }
            })
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}

/// Liest eine Datei aus dem Repository, damit die UI vor der Installation
/// zeigen kann, was tatsächlich geschrieben wird.
#[tauri::command]
pub async fn agent_market_preview(
    full_name: String,
    ref_name: String,
    file: String,
) -> Result<String, String> {
    let full_name = safe_full_name(&full_name)?;
    let reference = safe_ref(&ref_name)?;
    let relative = safe_relative(&file)?;
    let normalized = relative.to_string_lossy().replace('\\', "/");
    let bytes = github_raw(&full_name, &reference, &normalized).await?;
    String::from_utf8(bytes).map_err(|_| "Die Datei ist keine Textdatei.".to_string())
}

/// Kleiner Helfer für die UI: JSON-Datei einer CLI direkt lesen/schreiben ist
/// nicht nötig – hier reicht der Hinweis, wo etwas landen würde.
#[tauri::command]
pub async fn agent_market_target_path(
    path: String,
    target: CapabilityTargetRef,
    kind: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let repo = repo_path(&path);
        target_directory(&target, &repo, &kind).map(|value| value.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(paths: &[&str]) -> Vec<(String, String, u64)> {
        paths
            .iter()
            .map(|path| ((*path).to_string(), "blob".to_string(), 10))
            .collect()
    }

    #[test]
    fn repo_and_ref_names_are_validated() {
        assert_eq!(safe_full_name(" anthropics/skills ").unwrap(), "anthropics/skills");
        assert!(safe_full_name("anthropics").is_err());
        assert!(safe_full_name("anthropics/skills/extra").is_err());
        assert!(safe_full_name("anthropics/../etc").is_err());
        assert_eq!(safe_ref("release/v1.2").unwrap(), "release/v1.2");
        assert!(safe_ref("../secrets").is_err());
        assert!(safe_ref("branch;rm -rf").is_err());
    }

    #[test]
    fn assets_are_detected_by_layout() {
        let assets = detect_assets(&tree(&[
            "skills/code-review/SKILL.md",
            "skills/code-review/reference.md",
            "commands/ship.md",
            "agents/planner.md",
            ".mcp.json",
            ".claude/settings.json",
            "hooks/format.sh",
            ".claude-plugin/marketplace.json",
            "README.md",
        ]));
        let kinds: Vec<&str> = assets.iter().map(|asset| asset.kind.as_str()).collect();
        assert!(kinds.contains(&"skill"));
        assert!(kinds.contains(&"command"));
        assert!(kinds.contains(&"agent"));
        assert!(kinds.contains(&"mcp"));
        assert!(kinds.contains(&"hook"));
        assert!(kinds.contains(&"hookScript"));
        assert!(kinds.contains(&"pluginMarketplace"));

        let skill = assets.iter().find(|asset| asset.kind == "skill").unwrap();
        assert_eq!(skill.name, "code-review");
        assert_eq!(skill.path, "skills/code-review");
        assert_eq!(skill.file_count, 2);
        assert!(!assets.iter().any(|asset| asset.path == "README.md"));
    }

    #[test]
    fn mcp_bundles_are_normalized() {
        let bundle = serde_json::json!({
            "mcpServers": {
                "docs": { "command": "npx", "args": ["-y", "docs-mcp"], "env": { "TOKEN": "x" } },
                "api": { "url": "https://example.test/mcp" }
            }
        });
        let mut specs = specs_from_bundle(&bundle);
        specs.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(specs.len(), 2);
        assert_eq!(specs[0].name, "api");
        assert_eq!(specs[0].transport, "http");
        assert_eq!(specs[1].command.as_deref(), Some("npx"));
        assert_eq!(specs[1].env.get("TOKEN").map(String::as_str), Some("x"));

        let opencode = serde_json::json!({
            "mcp": { "local": { "type": "local", "command": ["bun", "server.ts"] } }
        });
        let specs = specs_from_bundle(&opencode);
        assert_eq!(specs[0].command.as_deref(), Some("bun"));
        assert_eq!(specs[0].args, vec!["server.ts".to_string()]);
    }

    #[test]
    fn search_queries_cover_topics_and_free_text() {
        assert_eq!(kind_queries("skill").len(), 3);
        assert!(kind_queries("mcp").iter().any(|query| query.contains("topic:mcp-server")));
        assert_eq!(sanitize_query("  rust  "), "rust");
        assert_eq!(sanitize_query("drop; rm -rf /"), "drop rm -rf /");
        assert_eq!(urlencode("topic:mcp-server rust"), "topic%3Amcp-server+rust");
    }

    #[test]
    fn popularity_buckets_reflect_stars() {
        assert_eq!(popularity(9_000, "2025-01-01T00:00:00Z"), "hot");
        assert_eq!(popularity(600, "2025-01-01T00:00:00Z"), "popular");
        assert_eq!(popularity(60, "2024-01-01T00:00:00Z"), "growing");
        assert_eq!(popularity(2, "2025-06-01T00:00:00Z"), "fresh");
        assert_eq!(popularity(2, "2019-06-01T00:00:00Z"), "small");
    }

    #[test]
    fn readme_excerpt_drops_badges_and_images() {
        let markdown = "# Title\n\n[![build](badge)](link)\n\n![logo](logo.png)\n\nDoes useful things.\n";
        let excerpt = readme_excerpt(markdown);
        assert!(excerpt.contains("Does useful things."));
        assert!(!excerpt.contains("badge"));
        assert!(!excerpt.contains("logo.png"));
    }
}
