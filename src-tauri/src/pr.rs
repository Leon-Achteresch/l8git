mod github;
mod gitlab;
mod bitbucket;
pub use github::*;
pub use gitlab::*;
pub use bitbucket::*;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use crate::credentials::{read_https_credential, HttpsCredential};
use crate::git::{run_git, run_git_merged_output};
use crate::providers::{bitbucket_collect_paginated_values, bitbucket_send_authed, http_client};

#[derive(Serialize, Clone)]
pub struct PullRequest {
    number: u64,
    title: String,
    state: String,
    is_draft: bool,
    author: String,
    author_avatar: Option<String>,
    source_branch: String,
    target_branch: String,
    html_url: String,
    created_at: String,
    updated_at: String,
    labels: Vec<String>,
    reviewers: Vec<Reviewer>,
    provider: String,
    /// GraphQL global node ID — required for auto-merge mutations.
    #[serde(skip_serializing_if = "Option::is_none")]
    node_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct Reviewer {
    login: String,
    avatar: Option<String>,
}

#[derive(Serialize)]
pub struct PullRequestDetail {
    #[serde(flatten)]
    base: PullRequest,
    body_markdown: String,
    mergeable: Option<bool>,
    merge_commit_sha: Option<String>,
    head_sha: String,
    /// Auto-merge method if currently enabled ("merge", "squash", "rebase"),
    /// or `None` if auto-merge is not set.
    #[serde(skip_serializing_if = "Option::is_none")]
    auto_merge_method: Option<String>,
}

#[derive(Serialize)]
pub struct PrCommit {
    hash: String,
    short_hash: String,
    author: String,
    email: String,
    date: String,
    subject: String,
    author_avatar: Option<String>,
}

#[derive(Serialize)]
pub struct CommitAvatarEntry {
    pub hash: String,
    pub author_avatar: Option<String>,
}

#[derive(Serialize)]
pub struct PrFile {
    path: String,
    status: String,
    additions: u64,
    deletions: u64,
    // Patches are loaded lazily via `pr_file_patch` to keep the list
    // payload small (large PRs can carry 10+ MB of embedded diffs).
    #[serde(skip_serializing_if = "Option::is_none")]
    patch: Option<String>,
}

#[derive(Serialize)]
pub struct PrComment {
    id: String,
    author: String,
    author_avatar: Option<String>,
    created_at: String,
    body: String,
    kind: String,
    file_path: Option<String>,
    line: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    in_reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thread_id: Option<String>,
}

#[derive(Deserialize, Clone)]
pub struct ReviewDraftComment {
    pub path: String,
    pub line: u64,
    pub body: String,
    #[serde(default)]
    pub side: Option<String>,
}

#[derive(Serialize)]
pub struct PrReview {
    id: String,
    author: String,
    author_avatar: Option<String>,
    state: String,
    submitted_at: String,
    body: String,
}

#[derive(Serialize)]
pub struct PrConversation {
    comments: Vec<PrComment>,
    reviews: Vec<PrReview>,
}

#[derive(Serialize)]
pub struct PrCheck {
    name: String,
    status: String,
    conclusion: Option<String>,
    html_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ci_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    head_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    check_suite_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    check_run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    annotations_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_uuid: Option<String>,
}

#[derive(Serialize)]
pub struct RepoCommitChecks {
    pub head_sha: String,
    pub checks: Vec<PrCheck>,
}

#[derive(Serialize)]
pub struct PrMergeResult {
    sha: Option<String>,
    merged: bool,
    message: Option<String>,
}

#[derive(Serialize)]
pub struct PrCheckoutResult {
    branch: String,
}

pub struct RemoteHandle {
    pub host: String,
    pub provider: Provider,
    pub owner: String,
    pub repo: String,
    /// Hub account login: the credential comes from the hub keychain, not git.
    pub account: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    GitHub,
    Gitea,
    Bitbucket,
    GitLab,
    Unsupported,
}

impl Provider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Provider::GitHub => "github",
            Provider::Gitea => "gitea",
            Provider::Bitbucket => "bitbucket",
            Provider::GitLab => "gitlab",
            Provider::Unsupported => "unsupported",
        }
    }

    pub fn from_id(id: &str) -> Option<Provider> {
        match id.trim().to_ascii_lowercase().as_str() {
            "github" | "ghe" | "github-enterprise" => Some(Provider::GitHub),
            "gitea" | "forgejo" | "codeberg" => Some(Provider::Gitea),
            "bitbucket" => Some(Provider::Bitbucket),
            "gitlab" => Some(Provider::GitLab),
            _ => None,
        }
    }
}

pub fn detect_provider(host: &str) -> Provider {
    let host_lc = host.trim().trim_end_matches('/').to_ascii_lowercase();
    match host_lc.as_str() {
        "github.com" | "www.github.com" => Provider::GitHub,
        "bitbucket.org" => Provider::Bitbucket,
        "gitlab.com" | "www.gitlab.com" => Provider::GitLab,
        "gitea.com" | "codeberg.org" => Provider::Gitea,
        _ if host_lc.contains("gitlab") => Provider::GitLab,
        _ if host_lc.contains("github") || host_lc.ends_with(".ghe.com") => Provider::GitHub,
        _ if host_lc.contains("gitea") || host_lc.contains("forgejo") => Provider::Gitea,
        _ if host_lc.contains("bitbucket") => Provider::Bitbucket,
        _ => Provider::Unsupported,
    }
}

#[derive(Serialize, Clone, PartialEq, Eq)]
pub struct ProviderCapabilities {
    pub provider: String,
    pub label: String,
    pub host: String,
    pub can_approve: bool,
    pub can_request_changes: bool,
    pub can_auto_merge: bool,
    pub can_draft: bool,
    pub can_delete_source_branch: bool,
    pub can_rerun_checks: bool,
    pub can_workflows: bool,
    pub can_inline_comments: bool,
    pub can_draft_reviews: bool,
    pub can_resolve_threads: bool,
    pub merge_strategies: Vec<String>,
}

pub fn provider_capabilities(provider: Provider, host: &str) -> ProviderCapabilities {
    let (label, can_request_changes, can_auto_merge, can_draft, can_delete, can_rerun, strategies) =
        match provider {
            Provider::GitHub => (
                "GitHub",
                true,
                true,
                true,
                false,
                true,
                vec!["merge", "squash", "rebase"],
            ),
            Provider::Gitea => (
                "Gitea/Forgejo",
                true,
                false,
                true,
                true,
                false,
                vec!["merge", "squash", "rebase"],
            ),
            Provider::GitLab => (
                "GitLab",
                false,
                false,
                true,
                true,
                false,
                vec!["merge", "squash"],
            ),
            Provider::Bitbucket => (
                "Bitbucket",
                true,
                false,
                false,
                true,
                false,
                vec!["merge", "squash", "rebase"],
            ),
            Provider::Unsupported => ("", false, false, false, false, false, vec![]),
        };
    ProviderCapabilities {
        provider: provider.as_str().to_string(),
        label: label.to_string(),
        host: host.to_string(),
        can_approve: provider != Provider::Unsupported,
        can_request_changes,
        can_auto_merge,
        can_draft,
        can_delete_source_branch: can_delete,
        can_rerun_checks: can_rerun,
        can_workflows: provider == Provider::GitHub,
        can_inline_comments: provider != Provider::Unsupported,
        can_draft_reviews: matches!(provider, Provider::GitHub | Provider::Gitea),
        can_resolve_threads: provider == Provider::GitHub,
        merge_strategies: strategies.into_iter().map(|s| s.to_string()).collect(),
    }
}

pub fn parse_origin_url(path: &PathBuf) -> Result<RemoteHandle, String> {
    if let Some(spec) = path.to_str().and_then(|p| p.strip_prefix(HUB_PATH_PREFIX)) {
        return crate::hub::remote_handle(spec);
    }
    let raw = run_git(path, &["config", "--get", "remote.origin.url"])
        .map_err(|_| "Kein Remote 'origin' konfiguriert.".to_string())?;
    let url = raw.trim().to_string();
    if url.is_empty() {
        return Err("Kein Remote 'origin' konfiguriert.".into());
    }

    let (host, path_part) = if let Some(rest) = url.strip_prefix("git@") {
        // Standard SCP-SSH: git@host:org/repo.git
        let mut split = rest.splitn(2, ':');
        let host = split.next().unwrap_or("").to_string();
        let path_part = split.next().unwrap_or("").to_string();
        (host, path_part)
    } else if url.contains('@') && !url.starts_with("http") && url.contains(':') && !url.contains("://") {
        // Generisches SCP-SSH: user@host:org/repo.git  (z. B. storelogix@storelogix.ghe.com:...)
        let after_at = url.splitn(2, '@').nth(1).unwrap_or("");
        let mut split = after_at.splitn(2, ':');
        let host = split.next().unwrap_or("").to_string();
        let path_part = split.next().unwrap_or("").to_string();
        (host, path_part)
    } else if let Some(rest) = url.strip_prefix("ssh://") {
        let rest = rest.trim_start_matches("git@");
        let mut split = rest.splitn(2, '/');
        let host = split.next().unwrap_or("").to_string();
        let path_part = split.next().unwrap_or("").to_string();
        (host, path_part)
    } else if let Some(rest) = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))
    {
        let rest = match rest.split_once('@') {
            Some((_, r)) => r,
            None => rest,
        };
        let mut split = rest.splitn(2, '/');
        let host = split.next().unwrap_or("").to_string();
        let path_part = split.next().unwrap_or("").to_string();
        (host, path_part)
    } else {
        return Err(format!("Remote-URL nicht erkannt: {url}"));
    };

    let path_part = path_part.trim_end_matches(".git").trim_end_matches('/');
    let segments: Vec<&str> = path_part.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 2 {
        return Err(format!("Unerwartetes Remote-URL-Format: {url}"));
    }
    let provider = run_git(path, &["config", "--get", "l8git.provider"])
        .ok()
        .and_then(|raw| Provider::from_id(raw.trim()))
        .unwrap_or_else(|| detect_provider(&host));
    let owner = segments[0].to_string();
    let repo = segments[1..].join("/");
    Ok(RemoteHandle {
        host,
        provider,
        owner,
        repo,
        account: None,
    })
}

/// `path` prefix that addresses a hub account's repo (`hub:login@host/owner/repo`)
/// instead of a local checkout. Local-only: the remote server rejects it.
pub const HUB_PATH_PREFIX: &str = "hub:";

fn is_hub_path(path: &str) -> bool {
    path.starts_with(HUB_PATH_PREFIX)
}

fn credential(h: &RemoteHandle) -> Result<HttpsCredential, String> {
    match &h.account {
        Some(login) => crate::hub::credential(&h.host, login),
        None => read_https_credential(&h.host),
    }
}

pub const PROVIDER_UNKNOWN_CODE: &str = "__PROVIDER_UNKNOWN__";

pub fn unsupported_provider_err(host: &str) -> String {
    format!("{PROVIDER_UNKNOWN_CODE}|{}", host.trim())
}

pub fn github_api_base(host: &str) -> String {
    let host = host.trim().trim_end_matches('/');
    if host.eq_ignore_ascii_case("github.com") {
        "https://api.github.com".to_string()
    } else if host.to_ascii_lowercase().ends_with(".ghe.com") {
        // GHE.com (data residency) serves its API from an `api.` subdomain, not /api/v3.
        format!("https://api.{host}")
    } else {
        format!("https://{host}/api/v3")
    }
}

pub fn gitea_api_base(host: &str) -> String {
    format!("https://{}/api/v1", host.trim().trim_end_matches('/'))
}

pub const BITBUCKET_SERVER_UNSUPPORTED: &str = "__BITBUCKET_SERVER_UNSUPPORTED__";

pub fn is_bitbucket_cloud_host(host: &str) -> bool {
    let host = host.trim().trim_end_matches('/').to_ascii_lowercase();
    host == "bitbucket.org" || host.ends_with(".bitbucket.org")
}

pub fn bitbucket_api_base(host: &str) -> Result<String, String> {
    if is_bitbucket_cloud_host(host) {
        Ok("https://api.bitbucket.org/2.0".to_string())
    } else {
        Err(BITBUCKET_SERVER_UNSUPPORTED.to_string())
    }
}

pub fn provider_api_base(h: &RemoteHandle) -> String {
    match h.provider {
        Provider::Gitea => gitea_api_base(&h.host),
        _ => github_api_base(&h.host),
    }
}

pub fn github_repo_api_url(h: &RemoteHandle, suffix: &str) -> String {
    format!(
        "{}/repos/{}/{}/{}",
        provider_api_base(h),
        h.owner,
        h.repo,
        suffix.trim_start_matches('/')
    )
}

pub fn str_or_empty(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

pub fn first_non_empty(a: String, b: String) -> String {
    if a.is_empty() { b } else { a }
}

pub fn trunc_chars(s: &str, max: usize) -> String {
    let n = s.chars().count();
    if n <= max {
        s.to_string()
    } else {
        let head: String = s.chars().take(max).collect();
        format!("{head}\n\n… ({n} Zeichen gesamt, gekürzt auf {max})")
    }
}

// ---------- GitHub mapping ----------

async fn github_commit_author_avatar_for_sha(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    api_base: &str,
    owner: &str,
    repo: &str,
    sha: String,
) -> CommitAvatarEntry {
    let url = format!(
        "{api_base}/repos/{owner}/{repo}/commits/{sha}"
    );
    let res = match github_request(client, cred, reqwest::Method::GET, &url, None).await {
        Ok(r) => r,
        Err(_) => {
            return CommitAvatarEntry {
                hash: sha,
                author_avatar: None,
            };
        }
    };
    if res.status() == StatusCode::NOT_FOUND || !res.status().is_success() {
        return CommitAvatarEntry {
            hash: sha,
            author_avatar: None,
        };
    }
    let body = match res.text().await {
        Ok(t) => t,
        Err(_) => {
            return CommitAvatarEntry {
                hash: sha,
                author_avatar: None,
            };
        }
    };
    let v: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => {
            return CommitAvatarEntry {
                hash: sha,
                author_avatar: None,
            };
        }
    };
    let author_avatar = v["author"]["avatar_url"].as_str().map(|s| s.to_string());
    CommitAvatarEntry {
        hash: sha,
        author_avatar,
    }
}

async fn bitbucket_commit_author_avatar_for_sha(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    host: &str,
    owner: &str,
    repo: &str,
    sha: String,
) -> CommitAvatarEntry {
    let api = match bitbucket_api_base(host) {
        Ok(api) => api,
        Err(_) => {
            return CommitAvatarEntry {
                hash: sha,
                author_avatar: None,
            };
        }
    };
    let url = format!(
        "{api}/repositories/{}/{}/commit/{}",
        owner, repo, sha
    );
    let res = match bitbucket_send_authed(client, &url, cred, host).await {
        Ok(r) => r,
        Err(_) => {
            return CommitAvatarEntry {
                hash: sha,
                author_avatar: None,
            };
        }
    };
    if !res.status().is_success() {
        return CommitAvatarEntry {
            hash: sha,
            author_avatar: None,
        };
    }
    let v: Value = match res.json().await {
        Ok(v) => v,
        Err(_) => {
            return CommitAvatarEntry {
                hash: sha,
                author_avatar: None,
            };
        }
    };
    let author_avatar = v["author"]["user"]["links"]["avatar"]["href"]
        .as_str()
        .map(|s| s.to_string());
    CommitAvatarEntry {
        hash: sha,
        author_avatar,
    }
}

async fn resolve_unique_commit_avatars_github(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    hashes: Vec<String>,
) -> Vec<CommitAvatarEntry> {
    let sem = Arc::new(Semaphore::new(14));
    let mut set = JoinSet::new();
    for sha in hashes {
        let sem = sem.clone();
        let client = client.clone();
        let cred = HttpsCredential {
            username: cred.username.clone(),
            password: cred.password.clone(),
        };
        let api_base = provider_api_base(h);
        let owner = h.owner.clone();
        let repo = h.repo.clone();
        set.spawn(async move {
            let _permit = sem.acquire().await.ok();
            github_commit_author_avatar_for_sha(&client, &cred, &api_base, &owner, &repo, sha).await
        });
    }
    let mut out = Vec::new();
    while let Some(joined) = set.join_next().await {
        if let Ok(entry) = joined {
            out.push(entry);
        }
    }
    out
}

async fn resolve_unique_commit_avatars_bitbucket(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    hashes: Vec<String>,
) -> Vec<CommitAvatarEntry> {
    let sem = Arc::new(Semaphore::new(10));
    let mut set = JoinSet::new();
    for sha in hashes {
        let sem = sem.clone();
        let client = client.clone();
        let cred = HttpsCredential {
            username: cred.username.clone(),
            password: cred.password.clone(),
        };
        let host = h.host.clone();
        let owner = h.owner.clone();
        let repo = h.repo.clone();
        set.spawn(async move {
            let _permit = sem.acquire().await.ok();
            bitbucket_commit_author_avatar_for_sha(&client, &cred, &host, &owner, &repo, sha).await
        });
    }
    let mut out = Vec::new();
    while let Some(joined) = set.join_next().await {
        if let Ok(entry) = joined {
            out.push(entry);
        }
    }
    out
}

// ---------- Tauri commands ----------

fn repo_path(path: &str) -> PathBuf {
    PathBuf::from(path)
}

pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

pub fn origin_default_branch(repo: &PathBuf) -> Result<String, String> {
    if let Ok(raw) = run_git(
        repo,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    ) {
        let raw = raw.trim();
        if let Some(rest) = raw.strip_prefix("refs/remotes/") {
            if let Some(i) = rest.find('/') {
                let tail = rest[i + 1..].trim();
                if !tail.is_empty() {
                    return Ok(tail.to_string());
                }
            }
        }
    }
    for candidate in ["main", "master", "develop"] {
        if run_git(
            repo,
            &[
                "rev-parse",
                "--verify",
                &format!("refs/remotes/origin/{candidate}"),
            ],
        )
        .is_ok()
        {
            return Ok(candidate.to_string());
        }
    }
    Ok("main".to_string())
}

pub fn current_branch(repo: &PathBuf) -> Result<String, String> {
    let branch = run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    if branch.is_empty() || branch == "HEAD" {
        return Err("Aktueller Branch konnte nicht bestimmt werden.".into());
    }
    Ok(branch)
}

pub fn strip_remote_prefix(repo: &PathBuf, name: &str) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty() {
        return Ok(String::new());
    }
    let remotes = run_git(repo, &["remote"])?;
    let names: HashSet<&str> = remotes
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    if let Some((first, rest)) = n.split_once('/') {
        if names.contains(first) {
            return Ok(rest.to_string());
        }
    }
    Ok(n.to_string())
}

#[tauri::command]
pub fn pr_create_web_url(path: String, branch: String) -> Result<String, String> {
    let p = repo_path(&path);
    if !p.is_dir() {
        return Err("Pfad ist kein Verzeichnis.".into());
    }
    let h = parse_origin_url(&p)?;
    let base = origin_default_branch(&p)?;
    let head = strip_remote_prefix(&p, &branch)?;
    if head.is_empty() {
        return Err("Branch-Name leer.".into());
    }
    if head == base {
        return Err("Für den Standard-Branch gibt es keinen sinnvollen PR-Vergleich.".into());
    }
    let enc_base = encode_uri_component(&base);
    let enc_head = encode_uri_component(&head);
    match h.provider {
        Provider::GitHub | Provider::Gitea => Ok(format!(
            "https://{}/{}/{}/compare/{}...{}",
            h.host, h.owner, h.repo, enc_base, enc_head
        )),
        Provider::GitLab => Ok(format!(
            "https://{}/{}/{}/-/merge_requests/new?merge_request%5Bsource_branch%5D={}&merge_request%5Btarget_branch%5D={}",
            h.host, h.owner, h.repo, enc_head, enc_base
        )),
        Provider::Bitbucket => {
            let source_val = format!("{}/{}:{}", h.owner, h.repo, head);
            let dest_val = format!("{}/{}:{}", h.owner, h.repo, base);
            Ok(format!(
                "https://bitbucket.org/{}/{}/pull-requests/new?source={}&dest={}",
                h.owner,
                h.repo,
                encode_uri_component(&source_val),
                encode_uri_component(&dest_val),
            ))
        }
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_create(
    path: String,
    title: String,
    body: String,
    head: String,
    base: String,
    draft: bool,
) -> Result<PullRequest, String> {
    let p = repo_path(&path);
    if !p.is_dir() {
        return Err("Pfad ist kein Verzeichnis.".into());
    }
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Titel darf nicht leer sein.".into());
    }
    let h = parse_origin_url(&p)?;
    let head_source = if head.trim().is_empty() {
        current_branch(&p)?
    } else {
        head.trim().to_string()
    };
    let head = strip_remote_prefix(&p, &head_source)?;
    if head.is_empty() {
        return Err("Head-Branch darf nicht leer sein.".into());
    }
    let base = if base.trim().is_empty() {
        origin_default_branch(&p)?
    } else {
        strip_remote_prefix(&p, &base)?
    };
    if base.is_empty() {
        return Err("Base-Branch darf nicht leer sein.".into());
    }
    if head == base {
        return Err("Head- und Base-Branch müssen unterschiedlich sein.".into());
    }

    let cred = credential(&h)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub | Provider::Gitea => {
            let url = github_repo_api_url(&h, "pulls");
            let gitea = h.provider == Provider::Gitea;
            let title = if gitea && draft {
                format!("WIP: {title}")
            } else {
                title
            };
            let res = github_request(
                &client,
                &cred,
                reqwest::Method::POST,
                &url,
                Some(json!({
                    "title": title,
                    "body": body,
                    "head": head,
                    "base": base,
                    "draft": draft && !gitea
                })),
            )
            .await?;
            let v = github_read_json(res, &h.host).await?;
            let mut pr = gh_map_pr(&v);
            if gitea {
                pr.provider = Provider::Gitea.as_str().to_string();
            }
            Ok(pr)
        }
        Provider::GitLab => {
            let title = if draft {
                format!("Draft: {title}")
            } else {
                title
            };
            let url = gitlab_project_url(&h, "merge_requests");
            let res = gl_request(
                &client,
                &cred,
                reqwest::Method::POST,
                &url,
                Some(json!({
                    "source_branch": head,
                    "target_branch": base,
                    "title": title,
                    "description": body
                })),
            )
            .await?;
            let v = gl_read_json(res, &h.host).await?;
            Ok(gl_map_mr(&v))
        }
        Provider::Bitbucket => {
            if draft {
                return Err("Bitbucket unterstützt Draft-Pull-Requests hier nicht.".into());
            }
            let api = bitbucket_api_base(&h.host)?;
            let url = format!(
                "{api}/repositories/{}/{}/pullrequests",
                h.owner, h.repo
            );
            let v = bb_post_json(
                &client,
                &cred,
                &url,
                &h.host,
                json!({
                    "title": title,
                    "description": body,
                    "source": { "branch": { "name": head } },
                    "destination": { "branch": { "name": base } }
                }),
            )
            .await?;
            Ok(bb_map_pr(&v))
        }
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

// Per-session avatar cache. Keys are `(repo_path, commit_hash)`; entries
// expire after 24h so long-running instances re-verify occasionally.
// `Option<String>` preserves "known to have no avatar" so we don't retry the
// API for those hashes every reload.
struct AvatarCacheEntry {
    url: Option<String>,
    fetched_at: Instant,
}

fn avatar_cache() -> &'static Mutex<HashMap<(String, String), AvatarCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<(String, String), AvatarCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

const AVATAR_CACHE_TTL: Duration = Duration::from_secs(60 * 60 * 24);

#[tauri::command]
pub async fn resolve_repo_commit_avatars(
    path: String,
    hashes: Vec<String>,
) -> Result<Vec<CommitAvatarEntry>, String> {
    let p = repo_path(&path);
    if !p.is_dir() {
        return Err("Pfad ist kein Verzeichnis.".into());
    }

    // Dedup hashes while partitioning into cached/missing.
    let mut seen = HashSet::new();
    let mut unique: Vec<String> = Vec::new();
    for raw in hashes {
        let t = raw.trim().to_string();
        if t.is_empty() {
            continue;
        }
        if seen.insert(t.clone()) {
            unique.push(t);
        }
        if unique.len() >= 220 {
            break;
        }
    }

    let mut cached: Vec<CommitAvatarEntry> = Vec::new();
    let mut missing: Vec<String> = Vec::new();
    let now = Instant::now();
    {
        let mut cache = avatar_cache().lock().map_err(|e| e.to_string())?;
        for h in &unique {
            let key = (path.clone(), h.clone());
            if let Some(entry) = cache.get(&key) {
                if now.duration_since(entry.fetched_at) < AVATAR_CACHE_TTL {
                    cached.push(CommitAvatarEntry {
                        hash: h.clone(),
                        author_avatar: entry.url.clone(),
                    });
                    continue;
                }
            }
            missing.push(h.clone());
        }
        // Drop expired entries opportunistically to cap memory growth.
        cache.retain(|_, v| now.duration_since(v.fetched_at) < AVATAR_CACHE_TTL);
    }

    if missing.is_empty() {
        return Ok(cached);
    }

    let remote = match parse_origin_url(&p) {
        Ok(h) => h,
        Err(_) => return Ok(cached),
    };
    let cred = match credential(&remote) {
        Ok(c) => c,
        Err(_) => return Ok(cached),
    };
    let client = match http_client() {
        Ok(c) => c,
        Err(_) => return Ok(cached),
    };

    let fetched = match remote.provider {
        Provider::GitHub | Provider::Gitea => {
            resolve_unique_commit_avatars_github(&client, &cred, &remote, missing.clone()).await
        }
        Provider::Bitbucket => {
            resolve_unique_commit_avatars_bitbucket(&client, &cred, &remote, missing.clone()).await
        }
        Provider::GitLab | Provider::Unsupported => vec![],
    };

    // Record every hash we attempted (even those without an avatar) so we
    // don't spam the API on subsequent reloads.
    {
        let mut cache = avatar_cache().lock().map_err(|e| e.to_string())?;
        let answered: HashSet<&str> = fetched.iter().map(|e| e.hash.as_str()).collect();
        for entry in &fetched {
            cache.insert(
                (path.clone(), entry.hash.clone()),
                AvatarCacheEntry {
                    url: entry.author_avatar.clone(),
                    fetched_at: now,
                },
            );
        }
        for h in &missing {
            if !answered.contains(h.as_str()) {
                cache.insert(
                    (path.clone(), h.clone()),
                    AvatarCacheEntry {
                        url: None,
                        fetched_at: now,
                    },
                );
            }
        }
    }

    let mut out = cached;
    out.extend(fetched);
    Ok(out)
}

pub fn provider_default_branch(provider: Provider, v: &Value) -> Option<String> {
    let raw = match provider {
        Provider::GitHub | Provider::Gitea | Provider::GitLab => str_or_empty(&v["default_branch"]),
        Provider::Bitbucket => str_or_empty(&v["mainbranch"]["name"]),
        Provider::Unsupported => String::new(),
    };
    let trimmed = raw.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn default_branch_cache() -> &'static Mutex<HashMap<String, (Option<String>, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Option<String>, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

const DEFAULT_BRANCH_CACHE_TTL: Duration = Duration::from_secs(60 * 60 * 6);

fn origin_head_ref(repo: &PathBuf) -> Option<String> {
    let raw = run_git(
        repo,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    )
    .ok()?;
    let rest = raw.trim().strip_prefix("refs/remotes/")?;
    let tail = rest[rest.find('/')? + 1..].trim();
    (!tail.is_empty()).then(|| tail.to_string())
}

async fn fetch_default_branch(p: &PathBuf) -> Option<String> {
    let h = parse_origin_url(p).ok()?;
    let cred = credential(&h).ok()?;
    let client = http_client().ok()?;
    let value = match h.provider {
        Provider::GitHub | Provider::Gitea => {
            let url = format!("{}/repos/{}/{}", provider_api_base(&h), h.owner, h.repo);
            let res = github_request(&client, &cred, reqwest::Method::GET, &url, None)
                .await
                .ok()?;
            github_read_json(res, &h.host).await.ok()?
        }
        Provider::GitLab => {
            let url = format!(
                "{}/projects/{}",
                gitlab_api_base(&h.host),
                gitlab_project_id(&h)
            );
            let res = gl_request(&client, &cred, reqwest::Method::GET, &url, None)
                .await
                .ok()?;
            gl_read_json(res, &h.host).await.ok()?
        }
        Provider::Bitbucket => {
            let api = bitbucket_api_base(&h.host).ok()?;
            let url = format!(
                "{api}/repositories/{}/{}",
                h.owner, h.repo
            );
            let res = bitbucket_send_authed(&client, &url, &cred, &h.host).await.ok()?;
            bb_read_json(res, &h.host).await.ok()?
        }
        Provider::Unsupported => return None,
    };
    provider_default_branch(h.provider, &value)
}

#[tauri::command]
pub async fn pr_default_branch(path: String) -> Result<Option<String>, String> {
    let p = repo_path(&path);
    let key = p.to_string_lossy().to_string();
    let now = Instant::now();
    {
        let mut cache = default_branch_cache().lock().map_err(|e| e.to_string())?;
        cache.retain(|_, (_, at)| now.duration_since(*at) < DEFAULT_BRANCH_CACHE_TTL);
        if let Some((value, _)) = cache.get(&key) {
            return Ok(value.clone());
        }
    }

    let resolved = match fetch_default_branch(&p).await {
        Some(branch) => Some(branch),
        None => origin_head_ref(&p),
    };
    if let Ok(mut cache) = default_branch_cache().lock() {
        cache.insert(key, (resolved.clone(), now));
    }
    Ok(resolved)
}

#[derive(Serialize)]
pub struct PullRequestPage {
    pub items: Vec<PullRequest>,
    pub next_page: Option<u64>,
}

async fn list_page(client: &reqwest::Client, cred: &HttpsCredential, h: &RemoteHandle, page: u64, history: bool) -> Result<PullRequestPage, String> {
    let (items, more): (Vec<PullRequest>, bool) = match h.provider {
        Provider::GitHub | Provider::Gitea => {
            let state = if history { "closed" } else { "open" };
            let url = github_repo_api_url(h, &format!("pulls?state={state}&per_page=50&page={page}&sort=updated&direction=desc"));
            let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
            let val = github_read_json(res, &h.host).await?;
            let arr = val.as_array().ok_or("Invalid pull request response")?;
            (arr.iter().map(gh_map_pr).collect(), arr.len() == 50)
        }
        Provider::GitLab => {
            let state = if history { "all" } else { "opened" };
            let val = gl_get_json(client, cred, h, &format!("merge_requests?state={state}&order_by=updated_at&sort=desc&scope=all&per_page=50&page={page}")).await?;
            let arr = val.as_array().ok_or("Invalid merge request response")?;
            (arr.iter().map(gl_map_mr).collect(), arr.len() == 50)
        }
        Provider::Bitbucket => {
            let api = bitbucket_api_base(&h.host)?;
            let state = if history { "state=MERGED&state=DECLINED&state=SUPERSEDED" } else { "state=OPEN" };
            let url = format!("{api}/repositories/{}/{}/pullrequests?pagelen=50&page={page}&{state}&sort=-updated_on", h.owner, h.repo);
            let res = bitbucket_send_authed(client, &url, cred, &h.host).await?;
            let val = bb_read_json(res, &h.host).await?;
            let arr = val["values"].as_array().ok_or("Invalid pull request response")?;
            (arr.iter().map(bb_map_pr).collect(), val["next"].as_str().is_some_and(|s| !s.is_empty()))
        }
        Provider::Unsupported => return Err(unsupported_provider_err(&h.host)),
    };
    Ok(PullRequestPage { items, next_page: more.then_some(page + 1) })
}

/// Explicit history pagination; no silent 500-entry cutoff or speculative requests.
#[tauri::command]
pub async fn pr_list_page(path: String, page: u64, history: bool) -> Result<PullRequestPage, String> {
    if page == 0 || page > 1_000_000 { return Err("Invalid page".into()); }
    let h = parse_origin_url(&repo_path(&path))?;
    let cred = credential(&h)?;
    list_page(&http_client()?, &cred, &h, page, history).await
}

#[tauri::command]
pub async fn pr_list(path: String) -> Result<Vec<PullRequest>, String> {
    let h = parse_origin_url(&repo_path(&path))?;
    let cred = credential(&h)?;
    let client = http_client()?;
    let mut out = Vec::new();
    let mut page = 1;
    loop {
        let result = list_page(&client, &cred, &h, page, false).await?;
        out.extend(result.items);
        match result.next_page { Some(next) => page = next, None => break }
    }
    let recent = list_page(&client, &cred, &h, 1, true).await?;
    let mut seen: std::collections::HashSet<u64> = out.iter().map(|pr| pr.number).collect();
    out.extend(recent.items.into_iter().filter(|pr| seen.insert(pr.number)));
    Ok(out)
}

#[tauri::command]
pub async fn pr_detail(path: String, number: u64) -> Result<PullRequestDetail, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub | Provider::Gitea => gh_detail(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_detail(&client, &cred, &h, number).await,
        Provider::GitLab => gl_detail(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_commits(path: String, number: u64) -> Result<Vec<PrCommit>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub | Provider::Gitea => gh_commits(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_commits(&client, &cred, &h, number).await,
        Provider::GitLab => gl_commits(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_files(path: String, number: u64) -> Result<Vec<PrFile>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub | Provider::Gitea => gh_files(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_files(&client, &cred, &h, number).await,
        Provider::GitLab => gl_files(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

/// Load the patch for a single PR file on demand. Combined with the
/// slimmed-down `pr_files` response (no embedded patches) this keeps the
/// initial PR open cheap — a 100-file PR previously shipped ~5-10 MB across
/// IPC, now it ships under 200 KB and the patch arrives only when needed.
#[tauri::command]
pub async fn pr_file_patch(
    path: String,
    number: u64,
    file: String,
) -> Result<Option<String>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub | Provider::Gitea => {
            gh_file_patch(&client, &cred, &h, number, &file).await
        }
        Provider::Bitbucket => bb_file_patch(&client, &cred, &h, number, &file).await,
        Provider::GitLab => gl_file_patch(&client, &cred, &h, number, &file).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_conversation(path: String, number: u64) -> Result<PrConversation, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub | Provider::Gitea => gh_conversation(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_conversation(&client, &cred, &h, number).await,
        Provider::GitLab => gl_conversation(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_checks(path: String, number: u64) -> Result<Vec<PrCheck>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => {
            let d = gh_detail(&client, &cred, &h, number).await?;
            gh_checks(&client, &cred, &h, &d.head_sha).await
        }
        Provider::Gitea => {
            let d = gh_detail(&client, &cred, &h, number).await?;
            gh_legacy_commit_statuses(&client, &cred, &h, &d.head_sha).await
        }
        Provider::Bitbucket => bb_checks(&client, &cred, &h, number).await,
        Provider::GitLab => gl_checks(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn repo_commit_checks(path: String) -> Result<RepoCommitChecks, String> {
    let p = repo_path(&path);
    if !is_hub_path(&path) && !p.is_dir() {
        return Err("Pfad ist kein Verzeichnis.".into());
    }
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    let head_sha = if is_hub_path(&path) {
        // No clone in the hub: use the default branch tip.
        if h.provider != Provider::GitHub {
            return Err("Checks im Hub sind nur für GitHub verfügbar.".into());
        }
        let url = github_repo_api_url(&h, "commits/HEAD");
        let res = github_request(&client, &cred, reqwest::Method::GET, &url, None).await?;
        str_or_empty(&github_read_json(res, &h.host).await?["sha"])
    } else {
        run_git_merged_output(&p, &["rev-parse", "HEAD"])?
            .trim()
            .to_string()
    };
    if head_sha.is_empty() {
        return Err("Kein HEAD-Commit.".into());
    }
    let checks = match h.provider {
        Provider::GitHub => {
            match gh_checks(&client, &cred, &h, &head_sha).await {
                Ok(c) => c,
                // 422 = commit not yet pushed; return empty without error
                Err(e) if e.contains("422") || e.contains("No commit found") => vec![],
                Err(e) => return Err(e),
            }
        }
        Provider::Gitea => match gh_legacy_commit_statuses(&client, &cred, &h, &head_sha).await {
            Ok(c) => c,
            Err(e) if e.contains("404") || e.contains("422") => vec![],
            Err(e) => return Err(e),
        },
        Provider::Bitbucket => bb_checks_for_commit(&client, &cred, &h, &head_sha).await?,
        Provider::GitLab => match gl_checks_for_commit(&client, &cred, &h, &head_sha).await {
            Ok(c) => c,
            Err(e) if e.contains("404") => vec![],
            Err(e) => return Err(e),
        },
        Provider::Unsupported => return Err(unsupported_provider_err(&h.host)),
    };
    Ok(RepoCommitChecks { head_sha, checks })
}

async fn gl_post_inline_comment(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
    comment: &ReviewDraftComment,
) -> Result<(), String> {
    let mr = gl_get_json(client, cred, h, &format!("merge_requests/{number}")).await?;
    let url = gitlab_project_url(h, &format!("merge_requests/{number}/discussions"));
    let payload = match gl_discussion_position(&mr, &comment.path, comment.line) {
        Some(position) => json!({ "body": comment.body, "position": position }),
        None => json!({ "body": comment.body }),
    };
    let res = gl_request(client, cred, reqwest::Method::POST, &url, Some(payload)).await?;
    gl_read_json(res, &h.host).await?;
    Ok(())
}

async fn bb_post_comment(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
    body: &str,
    file_path: Option<&str>,
    line: Option<u64>,
    parent: Option<&str>,
) -> Result<(), String> {
    let api = bitbucket_api_base(&h.host)?;
    let url = format!(
        "{api}/repositories/{}/{}/pullrequests/{number}/comments",
        h.owner, h.repo
    );
    bb_post_json(
        client,
        cred,
        &url,
        &h.host,
        bb_inline_comment_payload(body, file_path, line, parent),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn pr_add_comment(
    path: String,
    number: u64,
    body: String,
    in_reply_to: Option<String>,
    file_path: Option<String>,
    line: Option<u64>,
) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    let reply = in_reply_to.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let anchor = match (file_path.as_deref(), line) {
        (Some(fp), Some(l)) if !fp.trim().is_empty() => Some(ReviewDraftComment {
            path: fp.to_string(),
            line: l,
            body: body.clone(),
            side: None,
        }),
        _ => None,
    };
    match h.provider {
        Provider::GitHub => {
            if let Some(reply_id) = reply {
                let url = github_repo_api_url(
                    &h,
                    &format!("pulls/{number}/comments/{reply_id}/replies"),
                );
                let res = github_request(
                    &client,
                    &cred,
                    reqwest::Method::POST,
                    &url,
                    Some(json!({ "body": body })),
                )
                .await?;
                github_read_json(res, &h.host).await?;
                return Ok(());
            }
            if let Some(comment) = anchor {
                let url = github_repo_api_url(&h, &format!("pulls/{number}/reviews"));
                let payload = gh_review_payload("COMMENT", "", std::slice::from_ref(&comment));
                let res =
                    github_request(&client, &cred, reqwest::Method::POST, &url, Some(payload))
                        .await?;
                github_read_json(res, &h.host).await?;
                return Ok(());
            }
            let url = github_repo_api_url(&h, &format!("issues/{number}/comments"));
            let res = github_request(
                &client,
                &cred,
                reqwest::Method::POST,
                &url,
                Some(json!({ "body": body })),
            )
            .await?;
            github_read_json(res, &h.host).await?;
            Ok(())
        }
        Provider::Gitea => {
            if let Some(comment) = anchor {
                let url = github_repo_api_url(&h, &format!("pulls/{number}/reviews"));
                let payload = gitea_review_payload("COMMENT", "", std::slice::from_ref(&comment));
                let res =
                    github_request(&client, &cred, reqwest::Method::POST, &url, Some(payload))
                        .await?;
                github_read_json(res, &h.host).await?;
                return Ok(());
            }
            let url = github_repo_api_url(&h, &format!("issues/{number}/comments"));
            let res = github_request(
                &client,
                &cred,
                reqwest::Method::POST,
                &url,
                Some(json!({ "body": body })),
            )
            .await?;
            github_read_json(res, &h.host).await?;
            Ok(())
        }
        Provider::GitLab => {
            if let Some(discussion_id) = reply {
                let url = gitlab_project_url(
                    &h,
                    &format!("merge_requests/{number}/discussions/{discussion_id}/notes"),
                );
                let res = gl_request(
                    &client,
                    &cred,
                    reqwest::Method::POST,
                    &url,
                    Some(json!({ "body": body })),
                )
                .await?;
                gl_read_json(res, &h.host).await?;
                return Ok(());
            }
            if let Some(comment) = anchor {
                return gl_post_inline_comment(&client, &cred, &h, number, &comment).await;
            }
            let url = gitlab_project_url(&h, &format!("merge_requests/{number}/notes"));
            let res = gl_request(
                &client,
                &cred,
                reqwest::Method::POST,
                &url,
                Some(json!({ "body": body })),
            )
            .await?;
            gl_read_json(res, &h.host).await?;
            Ok(())
        }
        Provider::Bitbucket => {
            bb_post_comment(
                &client,
                &cred,
                &h,
                number,
                &body,
                anchor.as_ref().map(|c| c.path.as_str()),
                anchor.as_ref().map(|c| c.line),
                reply.as_deref(),
            )
            .await
        }
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_submit_review(
    path: String,
    number: u64,
    event: String,
    body: String,
    comments: Option<Vec<ReviewDraftComment>>,
) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    let ev = event.to_uppercase();
    let drafts = comments.unwrap_or_default();
    match h.provider {
        Provider::GitHub | Provider::Gitea => {
            let url = github_repo_api_url(&h, &format!("pulls/{number}/reviews"));
            let payload = if h.provider == Provider::Gitea {
                gitea_review_payload(&ev, &body, &drafts)
            } else {
                gh_review_payload(&ev, &body, &drafts)
            };
            let res = github_request(&client, &cred, reqwest::Method::POST, &url, Some(payload))
                .await?;
            github_read_json(res, &h.host).await?;
            Ok(())
        }
        Provider::GitLab => {
            for comment in &drafts {
                gl_post_inline_comment(&client, &cred, &h, number, comment).await?;
            }
            let action = match ev.as_str() {
                "APPROVE" | "APPROVED" => Some("approve"),
                "UNAPPROVE" | "REQUEST_CHANGES" => Some("unapprove"),
                _ => None,
            };
            if !body.trim().is_empty() {
                let url = gitlab_project_url(&h, &format!("merge_requests/{number}/notes"));
                let res = gl_request(
                    &client,
                    &cred,
                    reqwest::Method::POST,
                    &url,
                    Some(json!({ "body": body })),
                )
                .await?;
                gl_read_json(res, &h.host).await?;
            }
            if let Some(action) = action {
                let url = gitlab_project_url(&h, &format!("merge_requests/{number}/{action}"));
                let res =
                    gl_request(&client, &cred, reqwest::Method::POST, &url, Some(json!({}))).await?;
                if res.status() != reqwest::StatusCode::NO_CONTENT {
                    gl_read_json(res, &h.host).await?;
                }
            }
            Ok(())
        }
        Provider::Bitbucket => {
            for comment in &drafts {
                bb_post_comment(
                    &client,
                    &cred,
                    &h,
                    number,
                    &comment.body,
                    Some(comment.path.as_str()),
                    Some(comment.line),
                    None,
                )
                .await?;
            }
            let endpoint = match ev.as_str() {
                "APPROVE" => "approve",
                "REQUEST_CHANGES" => "request-changes",
                _ => {
                    if !body.trim().is_empty() {
                        let api = bitbucket_api_base(&h.host)?;
                        let url = format!(
                            "{api}/repositories/{}/{}/pullrequests/{number}/comments",
                            h.owner, h.repo
                        );
                        bb_post_json(
                            &client,
                            &cred,
                            &url,
                            &h.host,
                            json!({ "content": { "raw": body } }),
                        )
                        .await?;
                    }
                    return Ok(());
                }
            };
            let api = bitbucket_api_base(&h.host)?;
            let url = format!(
                "{api}/repositories/{}/{}/pullrequests/{number}/{endpoint}",
                h.owner, h.repo
            );
            bb_post_json(&client, &cred, &url, &h.host, json!({})).await?;
            if !body.trim().is_empty() {
                let api = bitbucket_api_base(&h.host)?;
                let c_url = format!(
                    "{api}/repositories/{}/{}/pullrequests/{number}/comments",
                    h.owner, h.repo
                );
                bb_post_json(
                    &client,
                    &cred,
                    &c_url,
                    &h.host,
                    json!({ "content": { "raw": body } }),
                )
                .await?;
            }
            Ok(())
        }
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_merge(
    path: String,
    number: u64,
    strategy: String,
    message: Option<String>,
    delete_source_branch: Option<bool>,
) -> Result<PrMergeResult, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = credential(&h)?;
    let client = http_client()?;
    let delete_source = delete_source_branch.unwrap_or(false);
    match h.provider {
        Provider::GitHub => {
            let gh_strat = match strategy.as_str() {
                "squash" => "squash",
                "rebase" => "rebase",
                _ => "merge",
            };
            let url = github_repo_api_url(&h, &format!("pulls/{number}/merge"));
            let mut body = json!({ "merge_method": gh_strat });
            if let Some(m) = message.filter(|s| !s.trim().is_empty()) {
                body["commit_message"] = Value::String(m);
            }
            let res = github_request(&client, &cred, reqwest::Method::PUT, &url, Some(body)).await?;
            let v = github_read_json(res, &h.host).await?;
            Ok(PrMergeResult {
                sha: v["sha"].as_str().map(|s| s.to_string()),
                merged: v["merged"].as_bool().unwrap_or(false),
                message: v["message"].as_str().map(|s| s.to_string()),
            })
        }
        Provider::Gitea => {
            let do_strat = match strategy.as_str() {
                "squash" => "squash",
                "rebase" => "rebase",
                _ => "merge",
            };
            let url = github_repo_api_url(&h, &format!("pulls/{number}/merge"));
            let mut body = json!({ "Do": do_strat, "delete_branch_after_merge": delete_source });
            if let Some(m) = message.filter(|s| !s.trim().is_empty()) {
                body["MergeMessageField"] = Value::String(m);
            }
            let res =
                github_request(&client, &cred, reqwest::Method::POST, &url, Some(body)).await?;
            if !res.status().is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&res) { return Err(error); }
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                return Err(format!("Gitea {status}: {}", text.trim()));
            }
            Ok(PrMergeResult {
                sha: None,
                merged: true,
                message: None,
            })
        }
        Provider::GitLab => {
            let url = gitlab_project_url(&h, &format!("merge_requests/{number}/merge"));
            let squash = strategy.as_str() == "squash";
            let mut body = json!({
                "squash": squash,
                "should_remove_source_branch": delete_source
            });
            if let Some(m) = message.filter(|s| !s.trim().is_empty()) {
                if squash {
                    body["squash_commit_message"] = Value::String(m);
                } else {
                    body["merge_commit_message"] = Value::String(m);
                }
            }
            let res = gl_request(&client, &cred, reqwest::Method::PUT, &url, Some(body)).await?;
            let v = gl_read_json(res, &h.host).await?;
            let state = str_or_empty(&v["state"]).to_lowercase();
            Ok(PrMergeResult {
                sha: v["merge_commit_sha"]
                    .as_str()
                    .or_else(|| v["squash_commit_sha"].as_str())
                    .map(|s| s.to_string()),
                merged: state == "merged",
                message: v["merge_error"].as_str().map(|s| s.to_string()),
            })
        }
        Provider::Bitbucket => {
            let bb_strat = match strategy.as_str() {
                "squash" => "squash",
                "rebase" => "fast_forward",
                _ => "merge_commit",
            };
            let api = bitbucket_api_base(&h.host)?;
            let url = format!(
                "{api}/repositories/{}/{}/pullrequests/{number}/merge",
                h.owner, h.repo
            );
            let mut body = json!({ "merge_strategy": bb_strat, "close_source_branch": delete_source });
            if let Some(m) = message.filter(|s| !s.trim().is_empty()) {
                body["message"] = Value::String(m);
            }
            let v = bb_post_json(&client, &cred, &url, &h.host, body).await?;
            Ok(PrMergeResult {
                sha: v["merge_commit"]["hash"].as_str().map(|s| s.to_string()),
                merged: str_or_empty(&v["state"]).to_lowercase() == "merged",
                message: v["description"].as_str().map(|s| s.to_string()),
            })
        }
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_checkout(path: String, number: u64) -> Result<PrCheckoutResult, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let (ref_spec, local_branch) = match h.provider {
        Provider::GitHub | Provider::Gitea => (
            format!("pull/{number}/head"),
            format!("pr-{number}"),
        ),
        Provider::GitLab => (
            format!("merge-requests/{number}/head"),
            format!("mr-{number}"),
        ),
        Provider::Bitbucket => {
            let client = http_client()?;
            let cred = credential(&h)?;
            let detail = bb_detail(&client, &cred, &h, number).await?;
            let src = detail.base.source_branch.clone();
            if src.is_empty() {
                return Err("Bitbucket: Source-Branch konnte nicht ermittelt werden.".into());
            }
            (src.clone(), format!("pr-{number}"))
        }
        Provider::Unsupported => return Err(unsupported_provider_err(&h.host)),
    };

    run_git_merged_output(
        &p,
        &[
            "fetch",
            "origin",
            &format!("{ref_spec}:{local_branch}"),
        ],
    )
    .or_else(|e| {
        // branch may already exist; retry with force update
        if e.contains("already exists") || e.contains("rejected") {
            run_git_merged_output(
                &p,
                &[
                    "fetch",
                    "origin",
                    &format!("+{ref_spec}:{local_branch}"),
                ],
            )
        } else {
            Err(e)
        }
    })?;
    run_git_merged_output(&p, &["checkout", &local_branch])?;
    Ok(PrCheckoutResult {
        branch: local_branch,
    })
}

// ========= GitHub Actions – Workflow Runs =========

#[derive(Serialize)]
pub struct WorkflowRun {
    id: u64,
    name: String,
    status: String,
    conclusion: Option<String>,
    workflow_id: u64,
    head_branch: Option<String>,
    head_sha: String,
    run_number: u64,
    event: String,
    created_at: String,
    updated_at: String,
    html_url: String,
    run_started_at: Option<String>,
    actor_login: Option<String>,
    actor_avatar: Option<String>,
    display_title: Option<String>,
    run_attempt: Option<u64>,
    /// e.g. ".github/workflows/release.yml@refs/heads/main"
    workflow_path: Option<String>,
}

#[derive(Serialize)]
pub struct WorkflowStep {
    name: String,
    status: String,
    conclusion: Option<String>,
    number: u64,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Serialize)]
pub struct WorkflowJob {
    id: u64,
    run_id: u64,
    name: String,
    status: String,
    conclusion: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
    html_url: Option<String>,
    steps: Vec<WorkflowStep>,
}

#[tauri::command]
pub async fn list_workflow_runs(path: String) -> Result<Vec<WorkflowRun>, String> {
    let p = repo_path(&path);
    if !is_hub_path(&path) && !p.is_dir() {
        return Err("Pfad ist kein Verzeichnis.".into());
    }
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Workflow Runs sind nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let url = github_repo_api_url(&h, "actions/runs?per_page=30");
    let res = github_request(&client, &cred, reqwest::Method::GET, &url, None).await?;
    let v = github_read_json(res, &h.host).await?;
    let runs = v["workflow_runs"].as_array().cloned().unwrap_or_default();
    let mut out = Vec::with_capacity(runs.len());
    for r in &runs {
        out.push(WorkflowRun {
            id: r["id"].as_u64().unwrap_or(0),
            name: str_or_empty(&r["name"]),
            status: str_or_empty(&r["status"]),
            conclusion: r["conclusion"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            workflow_id: r["workflow_id"].as_u64().unwrap_or(0),
            head_branch: r["head_branch"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            head_sha: str_or_empty(&r["head_sha"]),
            run_number: r["run_number"].as_u64().unwrap_or(0),
            event: str_or_empty(&r["event"]),
            created_at: str_or_empty(&r["created_at"]),
            updated_at: str_or_empty(&r["updated_at"]),
            html_url: str_or_empty(&r["html_url"]),
            run_started_at: r["run_started_at"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            actor_login: r["actor"]["login"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            actor_avatar: r["actor"]["avatar_url"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            display_title: r["display_title"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            run_attempt: r["run_attempt"].as_u64(),
            workflow_path: r["path"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_workflow_jobs(path: String, run_id: u64) -> Result<Vec<WorkflowJob>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Workflow Jobs sind nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let url = github_repo_api_url(&h, &format!("actions/runs/{run_id}/jobs?per_page=100"));
    let res = github_request(&client, &cred, reqwest::Method::GET, &url, None).await?;
    let v = github_read_json(res, &h.host).await?;
    let jobs = v["jobs"].as_array().cloned().unwrap_or_default();
    let mut out = Vec::with_capacity(jobs.len());
    for j in &jobs {
        let steps: Vec<WorkflowStep> = j["steps"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|s| WorkflowStep {
                        name: str_or_empty(&s["name"]),
                        status: str_or_empty(&s["status"]),
                        conclusion: s["conclusion"]
                            .as_str()
                            .filter(|v| !v.is_empty())
                            .map(|v| v.to_string()),
                        number: s["number"].as_u64().unwrap_or(0),
                        started_at: s["started_at"]
                            .as_str()
                            .filter(|v| !v.is_empty())
                            .map(|v| v.to_string()),
                        completed_at: s["completed_at"]
                            .as_str()
                            .filter(|v| !v.is_empty())
                            .map(|v| v.to_string()),
                    })
                    .collect()
            })
            .unwrap_or_default();
        out.push(WorkflowJob {
            id: j["id"].as_u64().unwrap_or(0),
            run_id: j["run_id"].as_u64().unwrap_or(0),
            name: str_or_empty(&j["name"]),
            status: str_or_empty(&j["status"]),
            conclusion: j["conclusion"]
                .as_str()
                .filter(|v| !v.is_empty())
                .map(|v| v.to_string()),
            started_at: j["started_at"]
                .as_str()
                .filter(|v| !v.is_empty())
                .map(|v| v.to_string()),
            completed_at: j["completed_at"]
                .as_str()
                .filter(|v| !v.is_empty())
                .map(|v| v.to_string()),
            html_url: j["html_url"]
                .as_str()
                .filter(|v| !v.is_empty())
                .map(|v| v.to_string()),
            steps,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn rerun_workflow(path: String, run_id: u64) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Re-run ist nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let url = github_repo_api_url(&h, &format!("actions/runs/{run_id}/rerun"));
    let res =
        github_request(&client, &cred, reqwest::Method::POST, &url, Some(json!({}))).await?;
    if res.status().is_success() {
        Ok(())
    } else {
        let status = res.status();
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        Err(format!("Re-run fehlgeschlagen ({status}): {}", body.trim()))
    }
}

#[tauri::command]
pub async fn cancel_workflow(path: String, run_id: u64) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Abbrechen ist nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let url = github_repo_api_url(&h, &format!("actions/runs/{run_id}/cancel"));
    let res = github_request(&client, &cred, reqwest::Method::POST, &url, None).await?;
    if res.status().is_success() {
        Ok(())
    } else {
        let status = res.status();
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        Err(format!("Cancel failed ({status}): {}", body.trim()))
    }
}

// ========= GitHub Enterprise — Check Runs Re-run =========

/// Re-request (re-run) a single Check Run.
/// Works on github.com and GitHub Enterprise (any host treated as GitHub).
/// The API requires the "checks:write" permission on the token.
#[tauri::command]
pub async fn pr_rerun_check(path: String, check_run_id: String) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Check-Run Re-run ist nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let url = github_repo_api_url(&h, &format!("check-runs/{check_run_id}/rerequest"));
    let res =
        github_request(&client, &cred, reqwest::Method::POST, &url, Some(json!({}))).await?;
    let status = res.status();
    if status.is_success() || status == reqwest::StatusCode::NO_CONTENT {
        Ok(())
    } else {
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        Err(format!("Check Re-run fehlgeschlagen ({status}): {}", body.trim()))
    }
}

/// Re-request (re-run) all Check Runs belonging to a Check Suite.
#[tauri::command]
pub async fn pr_rerun_check_suite(path: String, suite_id: String) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Check-Suite Re-run ist nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let url = github_repo_api_url(&h, &format!("check-suites/{suite_id}/rerequest"));
    let res =
        github_request(&client, &cred, reqwest::Method::POST, &url, Some(json!({}))).await?;
    let status = res.status();
    if status.is_success() || status == reqwest::StatusCode::NO_CONTENT {
        Ok(())
    } else {
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        Err(format!("Suite Re-run fehlgeschlagen ({status}): {}", body.trim()))
    }
}

// ========= GitHub Enterprise — Check Run Annotations =========

#[derive(Serialize)]
pub struct CheckAnnotation {
    path: String,
    start_line: u64,
    end_line: u64,
    annotation_level: String,
    title: Option<String>,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    raw_details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blob_href: Option<String>,
}

/// Fetch inline annotations for a specific Check Run.
/// Annotations are file-level comments produced by CI tools (ESLint, TypeScript,
/// test reporters, etc.) and displayed in the PR diff view on GitHub.
#[tauri::command]
pub async fn pr_check_annotations(
    path: String,
    check_run_id: String,
) -> Result<Vec<CheckAnnotation>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Annotationen sind nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let mut out = Vec::new();
    for page in 1..=10u32 {
        let url = github_repo_api_url(
            &h,
            &format!("check-runs/{check_run_id}/annotations?per_page=100&page={page}"),
        );
        let res = github_request(&client, &cred, reqwest::Method::GET, &url, None).await?;
        let v = github_read_json(res, &h.host).await?;
        let arr = v.as_array().cloned().unwrap_or_default();
        let len = arr.len();
        for a in arr {
            out.push(CheckAnnotation {
                path: str_or_empty(&a["path"]),
                start_line: a["start_line"].as_u64().unwrap_or(0),
                end_line: a["end_line"].as_u64().unwrap_or(0),
                annotation_level: str_or_empty(&a["annotation_level"]),
                title: a["title"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
                message: str_or_empty(&a["message"]),
                raw_details: a["raw_details"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
                blob_href: a["blob_href"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
            });
        }
        if len < 100 {
            break;
        }
    }
    Ok(out)
}

// ========= GitHub Enterprise — Branch Protection =========

#[derive(Serialize)]
pub struct BranchProtection {
    required_status_checks: Vec<String>,
    required_approving_review_count: Option<u64>,
    dismiss_stale_reviews: bool,
    require_code_owner_reviews: bool,
    enforce_admins: bool,
    allow_force_pushes: bool,
    allow_deletions: bool,
}

/// Fetch branch protection rules for the given branch.
/// Returns an error when no rules are configured (HTTP 404) or the token
/// lacks sufficient access (HTTP 403).
#[tauri::command]
pub async fn pr_branch_protection(
    path: String,
    branch: String,
) -> Result<BranchProtection, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Branch-Protection ist nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let enc_branch = encode_uri_component(&branch);
    let url = github_repo_api_url(&h, &format!("branches/{enc_branch}/protection"));
    let res = github_request(&client, &cred, reqwest::Method::GET, &url, None).await?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(format!(
            "Kein Branch-Protection-Regelwerk für '{branch}' konfiguriert."
        ));
    }
    let v = github_read_json(res, &h.host).await?;

    // GHE 2.x uses "contexts" (plain strings); GHE 3.x / github.com use "checks"
    // (objects with "context" key). We support both.
    let required_status_checks: Vec<String> = v["required_status_checks"]["checks"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|c| c["context"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .or_else(|| {
            v["required_status_checks"]["contexts"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|c| c.as_str().map(|s| s.to_string()))
                        .collect()
                })
        })
        .unwrap_or_default();

    Ok(BranchProtection {
        required_status_checks,
        required_approving_review_count: v["required_pull_request_reviews"]
            ["required_approving_review_count"]
            .as_u64(),
        dismiss_stale_reviews: v["required_pull_request_reviews"]["dismiss_stale_reviews"]
            .as_bool()
            .unwrap_or(false),
        require_code_owner_reviews: v["required_pull_request_reviews"]
            ["require_code_owner_reviews"]
            .as_bool()
            .unwrap_or(false),
        enforce_admins: v["enforce_admins"]["enabled"].as_bool().unwrap_or(false),
        allow_force_pushes: v["allow_force_pushes"]["enabled"].as_bool().unwrap_or(false),
        allow_deletions: v["allow_deletions"]["enabled"].as_bool().unwrap_or(false),
    })
}

// ========= GitHub Enterprise — Auto-Merge (GraphQL) =========

pub(crate) fn github_graphql_endpoint(host: &str) -> String {
    let base = github_api_base(host);
    match base.strip_suffix("/api/v3") {
        Some(server) => format!("{server}/api/graphql"),
        None => format!("{base}/graphql"),
    }
}

/// Enable or disable GitHub auto-merge for a pull request.
///
/// - `enable = true` + `merge_method` ("merge" | "squash" | "rebase") → enable auto-merge.
/// - `enable = false` → disable auto-merge.
///
/// Requires the PR's `node_id` (GraphQL global ID) returned by `pr_detail`.
/// Needs the "pull_requests:write" scope on the Personal Access Token.
/// Available on github.com and GitHub Enterprise 3.1+.
#[tauri::command]
pub async fn pr_set_auto_merge(
    path: String,
    pr_node_id: String,
    enable: bool,
    merge_method: Option<String>,
) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Auto-Merge ist nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let gql_url = github_graphql_endpoint(&h.host);

    let query_body = if enable {
        let method_str = match merge_method.as_deref().unwrap_or("merge") {
            "squash" => "SQUASH",
            "rebase" => "REBASE",
            _ => "MERGE",
        };
        json!({
            "query": "mutation($id: ID!, $method: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method }) { pullRequest { autoMergeRequest { mergeMethod } } } }",
            "variables": { "id": pr_node_id, "method": method_str }
        })
    } else {
        json!({
            "query": "mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { pullRequest { id } } }",
            "variables": { "id": pr_node_id }
        })
    };

    let res = client
        .post(&gql_url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "l8git")
        .header("Authorization", format!("Bearer {}", cred.password))
        .json(&query_body)
        .send()
        .await
        .map_err(|e| format!("GitHub GraphQL: {e}"))?;

    if !res.status().is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&res) { return Err(error); }
        let status = res.status();
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        return Err(format!("GitHub GraphQL {status}: {}", body.trim()));
    }

    let v: Value = res
        .json()
        .await
        .map_err(|e| format!("GitHub GraphQL: {e}"))?;
    if let Some(errors) = v["errors"].as_array() {
        if !errors.is_empty() {
            let msg = errors
                .iter()
                .filter_map(|e| e["message"].as_str())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(format!("GitHub GraphQL Fehler: {msg}"));
        }
    }
    Ok(())
}

// ========= GitHub — Review Threads (GraphQL) =========

#[derive(Serialize)]
pub struct GhReviewThread {
    pub id: String,
    pub resolved: bool,
    pub comment_ids: Vec<String>,
}

pub fn gh_map_review_threads(v: &Value) -> Vec<GhReviewThread> {
    v["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|node| {
            let id = node["id"].as_str().filter(|s| !s.is_empty())?.to_string();
            let comment_ids = node["comments"]["nodes"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .filter_map(|c| {
                    c["databaseId"]
                        .as_u64()
                        .map(|n| n.to_string())
                        .or_else(|| c["databaseId"].as_str().map(|s| s.to_string()))
                })
                .filter(|s| !s.is_empty())
                .collect();
            Some(GhReviewThread {
                id,
                resolved: node["isResolved"].as_bool().unwrap_or(false),
                comment_ids,
            })
        })
        .collect()
}

async fn github_graphql(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    host: &str,
    body: Value,
) -> Result<Value, String> {
    let res = client
        .post(github_graphql_endpoint(host))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "l8git")
        .header("Authorization", format!("Bearer {}", cred.password))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GitHub GraphQL: {e}"))?;

    if !res.status().is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&res) { return Err(error); }
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("GitHub GraphQL {status}: {}", text.trim()));
    }

    let v: Value = res
        .json()
        .await
        .map_err(|e| format!("GitHub GraphQL: {e}"))?;
    if let Some(errors) = v["errors"].as_array() {
        if !errors.is_empty() {
            let msg = errors
                .iter()
                .filter_map(|e| e["message"].as_str())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(format!("GitHub GraphQL Fehler: {msg}"));
        }
    }
    Ok(v)
}

#[tauri::command]
pub async fn pr_review_threads(path: String, number: u64) -> Result<Vec<GhReviewThread>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Ok(Vec::new());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let body = json!({
        "query": "query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100) { nodes { id isResolved comments(first: 100) { nodes { databaseId } } } } } } }",
        "variables": { "owner": h.owner, "name": h.repo, "number": number }
    });
    let v = github_graphql(&client, &cred, &h.host, body).await?;
    Ok(gh_map_review_threads(&v))
}

#[tauri::command]
pub async fn pr_resolve_thread(
    path: String,
    thread_id: String,
    resolved: bool,
) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider != Provider::GitHub {
        return Err("Threads auflösen ist nur für GitHub verfügbar.".into());
    }
    let cred = credential(&h)?;
    let client = http_client()?;
    let query = if resolved {
        "mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id isResolved } } }"
    } else {
        "mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { id isResolved } } }"
    };
    github_graphql(
        &client,
        &cred,
        &h.host,
        json!({ "query": query, "variables": { "id": thread_id } }),
    )
    .await?;
    Ok(())
}

// ========= Workflow File I/O =========

/// Returns sorted list of .yml/.yaml filenames inside .github/workflows/
#[tauri::command]
pub fn list_workflow_files(path: String) -> Result<Vec<String>, String> {
    let p = repo_path(&path);
    let dir = p.join(".github").join("workflows");
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut files: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| format!("Konnte Workflows-Verzeichnis nicht lesen: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".yml") || n.ends_with(".yaml"))
        .collect();
    files.sort();
    Ok(files)
}

/// Read a workflow file from .github/workflows/<filename>
#[tauri::command]
pub fn read_workflow_file(path: String, filename: String) -> Result<String, String> {
    let p = repo_path(&path);
    let safe = std::path::Path::new(&filename)
        .file_name()
        .ok_or("Ungültiger Dateiname.")?
        .to_string_lossy()
        .to_string();
    if !safe.ends_with(".yml") && !safe.ends_with(".yaml") {
        return Err("Nur .yml/.yaml Dateien erlaubt.".into());
    }
    let file_path = p.join(".github").join("workflows").join(&safe);
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))
}

/// Write a workflow file back to .github/workflows/<filename>
#[tauri::command]
pub fn save_workflow_file(path: String, filename: String, content: String) -> Result<(), String> {
    let p = repo_path(&path);
    let safe = std::path::Path::new(&filename)
        .file_name()
        .ok_or("Ungültiger Dateiname.")?
        .to_string_lossy()
        .to_string();
    if !safe.ends_with(".yml") && !safe.ends_with(".yaml") {
        return Err("Nur .yml/.yaml Dateien erlaubt.".into());
    }
    let file_path = p.join(".github").join("workflows").join(&safe);
    std::fs::write(&file_path, content)
        .map_err(|e| format!("Datei konnte nicht gespeichert werden: {e}"))
}

#[tauri::command]
pub fn pr_provider_capabilities(path: String) -> Result<ProviderCapabilities, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    if h.provider == Provider::Unsupported {
        return Err(unsupported_provider_err(&h.host));
    }
    Ok(provider_capabilities(h.provider, &h.host))
}
