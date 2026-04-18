use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;

use reqwest::StatusCode;
use serde::Serialize;
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
    patch: String,
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

struct RemoteHandle {
    host: String,
    provider: Provider,
    owner: String,
    repo: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Provider {
    GitHub,
    Bitbucket,
    Unsupported,
}

impl Provider {
    fn as_str(&self) -> &'static str {
        match self {
            Provider::GitHub => "github",
            Provider::Bitbucket => "bitbucket",
            Provider::Unsupported => "unsupported",
        }
    }
}

fn parse_origin_url(path: &PathBuf) -> Result<RemoteHandle, String> {
    let raw = run_git(path, &["config", "--get", "remote.origin.url"])
        .map_err(|_| "Kein Remote 'origin' konfiguriert.".to_string())?;
    let url = raw.trim().to_string();
    if url.is_empty() {
        return Err("Kein Remote 'origin' konfiguriert.".into());
    }

    let (host, path_part) = if let Some(rest) = url.strip_prefix("git@") {
        let mut split = rest.splitn(2, ':');
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
    let host_lc = host.to_ascii_lowercase();
    let provider = match host_lc.as_str() {
        "github.com" => Provider::GitHub,
        "bitbucket.org" => Provider::Bitbucket,
        _ => Provider::Unsupported,
    };
    let owner = segments[0].to_string();
    let repo = segments[1..].join("/");
    Ok(RemoteHandle {
        host,
        provider,
        owner,
        repo,
    })
}

fn unsupported_provider_err(host: &str) -> String {
    format!(
        "Pull Requests für den Host {host} werden noch nicht unterstützt (nur GitHub und Bitbucket)."
    )
}

async fn github_request(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> Result<reqwest::Response, String> {
    let mut req = client
        .request(method, url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "gitit")
        .header("Authorization", format!("Bearer {}", cred.password));
    if let Some(b) = body {
        req = req.json(&b);
    }
    req.send().await.map_err(|e| format!("GitHub: {e}"))
}

async fn github_read_json(res: reqwest::Response, host: &str) -> Result<Value, String> {
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!("GitHub: 401. Bitte unter Einstellungen bei {host} anmelden."));
    }
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("GitHub {status}: {}", body.trim()));
    }
    res.json::<Value>().await.map_err(|e| format!("GitHub: {e}"))
}

async fn bb_read_json(res: reqwest::Response, host: &str) -> Result<Value, String> {
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "Bitbucket: 401. Bitte unter Einstellungen bei {host} anmelden."
        ));
    }
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Bitbucket {status}: {}", body.trim()));
    }
    res.json::<Value>()
        .await
        .map_err(|e| format!("Bitbucket: {e}"))
}

async fn bb_post_json(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    url: &str,
    host: &str,
    body: Value,
) -> Result<Value, String> {
    let basic_b64 = cred
        .username
        .as_ref()
        .filter(|u| !u.is_empty())
        .map(|user| {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(format!("{user}:{}", cred.password))
        });
    let mut req = client
        .post(url)
        .header("User-Agent", "gitit")
        .header("Content-Type", "application/json");
    req = if let Some(ref b) = basic_b64 {
        req.header("Authorization", format!("Basic {b}"))
    } else {
        req.header("Authorization", format!("Bearer {}", cred.password))
    };
    let res = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Bitbucket: {e}"))?;
    bb_read_json(res, host).await
}

fn str_or_empty(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

fn first_non_empty(a: String, b: String) -> String {
    if a.is_empty() { b } else { a }
}

// ---------- GitHub mapping ----------

fn gh_map_pr(v: &Value) -> PullRequest {
    let labels = v["labels"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|l| l["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let reviewers = v["requested_reviewers"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|r| Reviewer {
                    login: str_or_empty(&r["login"]),
                    avatar: r["avatar_url"].as_str().map(|s| s.to_string()),
                })
                .collect()
        })
        .unwrap_or_default();
    let is_draft = v["draft"].as_bool().unwrap_or(false);
    let merged = v["merged_at"].is_string();
    let state_raw = str_or_empty(&v["state"]);
    let state = if merged {
        "merged".to_string()
    } else if is_draft && state_raw == "open" {
        "draft".to_string()
    } else {
        state_raw
    };
    PullRequest {
        number: v["number"].as_u64().unwrap_or(0),
        title: str_or_empty(&v["title"]),
        state,
        is_draft,
        author: str_or_empty(&v["user"]["login"]),
        author_avatar: v["user"]["avatar_url"].as_str().map(|s| s.to_string()),
        source_branch: str_or_empty(&v["head"]["ref"]),
        target_branch: str_or_empty(&v["base"]["ref"]),
        html_url: str_or_empty(&v["html_url"]),
        created_at: str_or_empty(&v["created_at"]),
        updated_at: str_or_empty(&v["updated_at"]),
        labels,
        reviewers,
        provider: Provider::GitHub.as_str().to_string(),
    }
}

async fn gh_list(client: &reqwest::Client, cred: &HttpsCredential, h: &RemoteHandle) -> Result<Vec<PullRequest>, String> {
    let mut out = Vec::new();
    for page in 1..=10 {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls?state=all&per_page=50&page={page}&sort=updated&direction=desc",
            h.owner, h.repo
        );
        let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
        let val = github_read_json(res, &h.host).await?;
        let arr = val.as_array().cloned().unwrap_or_default();
        let count = arr.len();
        for v in arr {
            out.push(gh_map_pr(&v));
        }
        if count < 50 {
            break;
        }
    }
    Ok(out)
}

async fn gh_detail(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PullRequestDetail, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{number}",
        h.owner, h.repo
    );
    let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
    let v = github_read_json(res, &h.host).await?;
    let base = gh_map_pr(&v);
    Ok(PullRequestDetail {
        body_markdown: v["body"].as_str().unwrap_or("").to_string(),
        mergeable: v["mergeable"].as_bool(),
        merge_commit_sha: v["merge_commit_sha"].as_str().map(|s| s.to_string()),
        head_sha: str_or_empty(&v["head"]["sha"]),
        base,
    })
}

async fn gh_commits(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCommit>, String> {
    let mut out = Vec::new();
    for page in 1..=20 {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{number}/commits?per_page=100&page={page}",
            h.owner, h.repo
        );
        let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
        let v = github_read_json(res, &h.host).await?;
        let arr = v.as_array().cloned().unwrap_or_default();
        let count = arr.len();
        for c in arr {
            let hash = str_or_empty(&c["sha"]);
            let short_hash = hash.chars().take(7).collect();
            out.push(PrCommit {
                short_hash,
                hash,
                author: str_or_empty(&c["commit"]["author"]["name"]),
                email: str_or_empty(&c["commit"]["author"]["email"]),
                date: str_or_empty(&c["commit"]["author"]["date"]),
                subject: c["commit"]["message"]
                    .as_str()
                    .unwrap_or("")
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string(),
                author_avatar: c["author"]["avatar_url"].as_str().map(|s| s.to_string()),
            });
        }
        if count < 100 {
            break;
        }
    }
    Ok(out)
}

async fn gh_files(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrFile>, String> {
    let mut out = Vec::new();
    for page in 1..=20 {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{number}/files?per_page=100&page={page}",
            h.owner, h.repo
        );
        let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
        let v = github_read_json(res, &h.host).await?;
        let arr = v.as_array().cloned().unwrap_or_default();
        let count = arr.len();
        for f in arr {
            out.push(PrFile {
                path: str_or_empty(&f["filename"]),
                status: str_or_empty(&f["status"]),
                additions: f["additions"].as_u64().unwrap_or(0),
                deletions: f["deletions"].as_u64().unwrap_or(0),
                patch: f["patch"].as_str().unwrap_or("").to_string(),
            });
        }
        if count < 100 {
            break;
        }
    }
    Ok(out)
}

async fn gh_conversation(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PrConversation, String> {
    let issue_url = format!(
        "https://api.github.com/repos/{}/{}/issues/{number}/comments?per_page=100",
        h.owner, h.repo
    );
    let review_comments_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{number}/comments?per_page=100",
        h.owner, h.repo
    );
    let reviews_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{number}/reviews?per_page=100",
        h.owner, h.repo
    );

    let issue_res = github_request(client, cred, reqwest::Method::GET, &issue_url, None).await?;
    let issue_v = github_read_json(issue_res, &h.host).await?;
    let rc_res = github_request(client, cred, reqwest::Method::GET, &review_comments_url, None).await?;
    let rc_v = github_read_json(rc_res, &h.host).await?;
    let rv_res = github_request(client, cred, reqwest::Method::GET, &reviews_url, None).await?;
    let rv_v = github_read_json(rv_res, &h.host).await?;

    let mut comments = Vec::new();
    for c in issue_v.as_array().cloned().unwrap_or_default() {
        comments.push(PrComment {
            id: c["id"].as_u64().map(|n| n.to_string()).unwrap_or_default(),
            author: str_or_empty(&c["user"]["login"]),
            author_avatar: c["user"]["avatar_url"].as_str().map(|s| s.to_string()),
            created_at: str_or_empty(&c["created_at"]),
            body: str_or_empty(&c["body"]),
            kind: "issue".into(),
            file_path: None,
            line: None,
        });
    }
    for c in rc_v.as_array().cloned().unwrap_or_default() {
        comments.push(PrComment {
            id: c["id"].as_u64().map(|n| n.to_string()).unwrap_or_default(),
            author: str_or_empty(&c["user"]["login"]),
            author_avatar: c["user"]["avatar_url"].as_str().map(|s| s.to_string()),
            created_at: str_or_empty(&c["created_at"]),
            body: str_or_empty(&c["body"]),
            kind: "inline".into(),
            file_path: c["path"].as_str().map(|s| s.to_string()),
            line: c["line"].as_u64().or_else(|| c["original_line"].as_u64()),
        });
    }

    let mut reviews = Vec::new();
    for r in rv_v.as_array().cloned().unwrap_or_default() {
        reviews.push(PrReview {
            id: r["id"].as_u64().map(|n| n.to_string()).unwrap_or_default(),
            author: str_or_empty(&r["user"]["login"]),
            author_avatar: r["user"]["avatar_url"].as_str().map(|s| s.to_string()),
            state: str_or_empty(&r["state"]),
            submitted_at: str_or_empty(&r["submitted_at"]),
            body: str_or_empty(&r["body"]),
        });
    }

    Ok(PrConversation { comments, reviews })
}

async fn gh_checks(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    head_sha: &str,
) -> Result<Vec<PrCheck>, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/commits/{head_sha}/check-runs?per_page=100",
        h.owner, h.repo
    );
    let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
    let v = github_read_json(res, &h.host).await?;
    let arr = v["check_runs"].as_array().cloned().unwrap_or_default();
    let mut out = Vec::new();
    for c in arr {
        out.push(PrCheck {
            name: str_or_empty(&c["name"]),
            status: str_or_empty(&c["status"]),
            conclusion: c["conclusion"].as_str().map(|s| s.to_string()),
            html_url: c["html_url"].as_str().map(|s| s.to_string()),
        });
    }
    Ok(out)
}

// ---------- Bitbucket mapping ----------

fn bb_map_pr(v: &Value) -> PullRequest {
    let state_raw = str_or_empty(&v["state"]).to_lowercase();
    let state = match state_raw.as_str() {
        "open" => "open".to_string(),
        "merged" => "merged".to_string(),
        "declined" | "superseded" => "closed".to_string(),
        other => other.to_string(),
    };
    let reviewers = v["reviewers"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|r| Reviewer {
                    login: str_or_empty(&r["display_name"]),
                    avatar: r["links"]["avatar"]["href"].as_str().map(|s| s.to_string()),
                })
                .collect()
        })
        .unwrap_or_default();
    PullRequest {
        number: v["id"].as_u64().unwrap_or(0),
        title: str_or_empty(&v["title"]),
        state,
        is_draft: v["draft"].as_bool().unwrap_or(false),
        author: str_or_empty(&v["author"]["display_name"]),
        author_avatar: v["author"]["links"]["avatar"]["href"]
            .as_str()
            .map(|s| s.to_string()),
        source_branch: str_or_empty(&v["source"]["branch"]["name"]),
        target_branch: str_or_empty(&v["destination"]["branch"]["name"]),
        html_url: str_or_empty(&v["links"]["html"]["href"]),
        created_at: str_or_empty(&v["created_on"]),
        updated_at: str_or_empty(&v["updated_on"]),
        labels: Vec::new(),
        reviewers,
        provider: Provider::Bitbucket.as_str().to_string(),
    }
}

async fn bb_list(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
) -> Result<Vec<PullRequest>, String> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests?pagelen=50&state=OPEN&state=MERGED&state=DECLINED",
        h.owner, h.repo
    );
    let values = bitbucket_collect_paginated_values(client, cred, &url, &h.host).await?;
    let mut out = Vec::new();
    for v in values {
        out.push(bb_map_pr(&v));
    }
    Ok(out)
}

async fn bb_detail(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PullRequestDetail, String> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}",
        h.owner, h.repo
    );
    let res = bitbucket_send_authed(client, &url, cred, &h.host).await?;
    let v = bb_read_json(res, &h.host).await?;
    let base = bb_map_pr(&v);
    let body = v["summary"]["raw"].as_str().unwrap_or("").to_string();
    let head_sha = str_or_empty(&v["source"]["commit"]["hash"]);
    Ok(PullRequestDetail {
        body_markdown: body,
        mergeable: None,
        merge_commit_sha: v["merge_commit"]["hash"].as_str().map(|s| s.to_string()),
        head_sha,
        base,
    })
}

async fn bb_commits(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCommit>, String> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/commits?pagelen=50",
        h.owner, h.repo
    );
    let values = bitbucket_collect_paginated_values(client, cred, &url, &h.host).await?;
    let mut out = Vec::new();
    for c in values {
        let hash = str_or_empty(&c["hash"]);
        let short_hash = hash.chars().take(7).collect();
        let author_avatar = c["author"]["user"]["links"]["avatar"]["href"]
            .as_str()
            .map(|s| s.to_string());
        out.push(PrCommit {
            short_hash,
            hash,
            author: first_non_empty(
                str_or_empty(&c["author"]["user"]["display_name"]),
                str_or_empty(&c["author"]["raw"]),
            ),
            email: String::new(),
            date: str_or_empty(&c["date"]),
            subject: c["message"]
                .as_str()
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
                .to_string(),
            author_avatar,
        });
    }
    Ok(out)
}

fn split_unified_diff_by_file(diff_text: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut current: Option<(String, String)> = None;
    for line in diff_text.split_inclusive('\n') {
        if line.starts_with("diff --git ") {
            if let Some(entry) = current.take() {
                out.push(entry);
            }
            let rest = line.trim_end().trim_start_matches("diff --git ");
            let path = rest
                .split_whitespace()
                .nth(1)
                .unwrap_or("")
                .trim_start_matches("b/")
                .to_string();
            current = Some((path, line.to_string()));
        } else if let Some(entry) = current.as_mut() {
            entry.1.push_str(line);
        }
    }
    if let Some(entry) = current.take() {
        out.push(entry);
    }
    out
}

async fn bb_files(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrFile>, String> {
    let diffstat_url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/diffstat?pagelen=100",
        h.owner, h.repo
    );
    let stats = bitbucket_collect_paginated_values(client, cred, &diffstat_url, &h.host).await?;

    let diff_url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/diff",
        h.owner, h.repo
    );
    let diff_res = bitbucket_send_authed(client, &diff_url, cred, &h.host).await?;
    if diff_res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "Bitbucket: 401. Bitte unter Einstellungen bei {} anmelden.",
            h.host
        ));
    }
    if !diff_res.status().is_success() {
        let body = diff_res.text().await.unwrap_or_default();
        return Err(format!("Bitbucket: {}", body.trim()));
    }
    let diff_text = diff_res
        .text()
        .await
        .map_err(|e| format!("Bitbucket: {e}"))?;
    let per_file = split_unified_diff_by_file(&diff_text);

    let mut out: Vec<PrFile> = Vec::new();
    for s in stats {
        let path = s["new"]["path"]
            .as_str()
            .or_else(|| s["old"]["path"].as_str())
            .unwrap_or("")
            .to_string();
        let status = str_or_empty(&s["status"]);
        let additions = s["lines_added"].as_u64().unwrap_or(0);
        let deletions = s["lines_removed"].as_u64().unwrap_or(0);
        let patch = per_file
            .iter()
            .find(|(p, _)| p == &path)
            .map(|(_, d)| d.clone())
            .unwrap_or_default();
        out.push(PrFile {
            path,
            status,
            additions,
            deletions,
            patch,
        });
    }
    Ok(out)
}

async fn bb_conversation(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PrConversation, String> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/comments?pagelen=50",
        h.owner, h.repo
    );
    let values = bitbucket_collect_paginated_values(client, cred, &url, &h.host).await?;
    let mut comments = Vec::new();
    for c in values {
        if c["deleted"].as_bool().unwrap_or(false) {
            continue;
        }
        let file_path = c["inline"]["path"].as_str().map(|s| s.to_string());
        let line = c["inline"]["to"].as_u64().or_else(|| c["inline"]["from"].as_u64());
        let kind = if file_path.is_some() { "inline" } else { "issue" };
        comments.push(PrComment {
            id: c["id"].as_u64().map(|n| n.to_string()).unwrap_or_default(),
            author: str_or_empty(&c["user"]["display_name"]),
            author_avatar: c["user"]["links"]["avatar"]["href"].as_str().map(|s| s.to_string()),
            created_at: str_or_empty(&c["created_on"]),
            body: c["content"]["raw"].as_str().unwrap_or("").to_string(),
            kind: kind.into(),
            file_path,
            line,
        });
    }
    Ok(PrConversation {
        comments,
        reviews: Vec::new(),
    })
}

async fn bb_checks(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCheck>, String> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/statuses?pagelen=50",
        h.owner, h.repo
    );
    let values = bitbucket_collect_paginated_values(client, cred, &url, &h.host).await?;
    let mut out = Vec::new();
    for v in values {
        out.push(PrCheck {
            name: first_non_empty(str_or_empty(&v["name"]), str_or_empty(&v["key"])),
            status: str_or_empty(&v["state"]),
            conclusion: v["state"].as_str().map(|s| s.to_string()),
            html_url: v["url"].as_str().map(|s| s.to_string()),
        });
    }
    Ok(out)
}

async fn github_commit_author_avatar_for_sha(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    owner: &str,
    repo: &str,
    sha: String,
) -> CommitAvatarEntry {
    let url = format!(
        "https://api.github.com/repos/{}/{}/commits/{}",
        owner, repo, sha
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
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/commit/{}",
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
        let owner = h.owner.clone();
        let repo = h.repo.clone();
        set.spawn(async move {
            let _permit = sem.acquire().await.ok();
            github_commit_author_avatar_for_sha(&client, &cred, &owner, &repo, sha).await
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

fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn origin_default_branch(repo: &PathBuf) -> Result<String, String> {
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

fn strip_remote_prefix(repo: &PathBuf, name: &str) -> Result<String, String> {
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
        Provider::GitHub => Ok(format!(
            "https://{}/{}/{}/compare/{}...{}",
            h.host, h.owner, h.repo, enc_base, enc_head
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
pub async fn resolve_repo_commit_avatars(
    path: String,
    hashes: Vec<String>,
) -> Result<Vec<CommitAvatarEntry>, String> {
    let p = repo_path(&path);
    if !p.is_dir() {
        return Err("Pfad ist kein Verzeichnis.".into());
    }
    let remote = match parse_origin_url(&p) {
        Ok(h) => h,
        Err(_) => return Ok(vec![]),
    };
    let cred = match read_https_credential(&remote.host) {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };
    let client = match http_client() {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };
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
    let entries = match remote.provider {
        Provider::GitHub => {
            resolve_unique_commit_avatars_github(&client, &cred, &remote, unique).await
        }
        Provider::Bitbucket => {
            resolve_unique_commit_avatars_bitbucket(&client, &cred, &remote, unique).await
        }
        Provider::Unsupported => vec![],
    };
    Ok(entries)
}

#[tauri::command]
pub async fn pr_list(path: String) -> Result<Vec<PullRequest>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => gh_list(&client, &cred, &h).await,
        Provider::Bitbucket => bb_list(&client, &cred, &h).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_detail(path: String, number: u64) -> Result<PullRequestDetail, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => gh_detail(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_detail(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_commits(path: String, number: u64) -> Result<Vec<PrCommit>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => gh_commits(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_commits(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_files(path: String, number: u64) -> Result<Vec<PrFile>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => gh_files(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_files(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_conversation(path: String, number: u64) -> Result<PrConversation, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => gh_conversation(&client, &cred, &h, number).await,
        Provider::Bitbucket => bb_conversation(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_checks(path: String, number: u64) -> Result<Vec<PrCheck>, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => {
            let d = gh_detail(&client, &cred, &h, number).await?;
            gh_checks(&client, &cred, &h, &d.head_sha).await
        }
        Provider::Bitbucket => bb_checks(&client, &cred, &h, number).await,
        Provider::Unsupported => Err(unsupported_provider_err(&h.host)),
    }
}

#[tauri::command]
pub async fn pr_add_comment(path: String, number: u64, body: String) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => {
            let url = format!(
                "https://api.github.com/repos/{}/{}/issues/{number}/comments",
                h.owner, h.repo
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
            Ok(())
        }
        Provider::Bitbucket => {
            let url = format!(
                "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/comments",
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
            Ok(())
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
) -> Result<(), String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    let ev = event.to_uppercase();
    match h.provider {
        Provider::GitHub => {
            let url = format!(
                "https://api.github.com/repos/{}/{}/pulls/{number}/reviews",
                h.owner, h.repo
            );
            let payload = json!({ "event": ev, "body": body });
            let res = github_request(&client, &cred, reqwest::Method::POST, &url, Some(payload))
                .await?;
            github_read_json(res, &h.host).await?;
            Ok(())
        }
        Provider::Bitbucket => {
            let endpoint = match ev.as_str() {
                "APPROVE" => "approve",
                "REQUEST_CHANGES" => "request-changes",
                _ => {
                    if !body.trim().is_empty() {
                        let url = format!(
                            "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/comments",
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
            let url = format!(
                "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/{endpoint}",
                h.owner, h.repo
            );
            bb_post_json(&client, &cred, &url, &h.host, json!({})).await?;
            if !body.trim().is_empty() {
                let c_url = format!(
                    "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/comments",
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
) -> Result<PrMergeResult, String> {
    let p = repo_path(&path);
    let h = parse_origin_url(&p)?;
    let cred = read_https_credential(&h.host)?;
    let client = http_client()?;
    match h.provider {
        Provider::GitHub => {
            let gh_strat = match strategy.as_str() {
                "squash" => "squash",
                "rebase" => "rebase",
                _ => "merge",
            };
            let url = format!(
                "https://api.github.com/repos/{}/{}/pulls/{number}/merge",
                h.owner, h.repo
            );
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
        Provider::Bitbucket => {
            let bb_strat = match strategy.as_str() {
                "squash" => "squash",
                "rebase" => "fast_forward",
                _ => "merge_commit",
            };
            let url = format!(
                "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests/{number}/merge",
                h.owner, h.repo
            );
            let mut body = json!({ "merge_strategy": bb_strat });
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
        Provider::GitHub => (
            format!("pull/{number}/head"),
            format!("pr-{number}"),
        ),
        Provider::Bitbucket => {
            let client = http_client()?;
            let cred = read_https_credential(&h.host)?;
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
