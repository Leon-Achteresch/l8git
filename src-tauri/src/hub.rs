//! Hub: multi-account access to hosting providers (GitHub, GitLab, Bitbucket,
//! Gitea). Tokens live only in the OS keychain; the renderer talks to the
//! provider through `hub_api`, which pins every request to the account's API
//! base so a token can never be sent to a foreign host.

use crate::coded;
use crate::error::{required, Label};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::credentials::HttpsCredential;
use crate::pr::{detect_provider, Provider, RemoteHandle};
use crate::providers::http_client;
use crate::secrets::{delete_secret, get_secret, set_secret};

#[derive(Serialize, Clone)]
pub struct HubAccount {
    host: String,
    provider: &'static str,
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct StoredSecret {
    token: String,
    /// Bitbucket app passwords need Basic auth with the account username/email.
    #[serde(default)]
    username: Option<String>,
    /// Imported from git's own credential store: git owns it, never erase it on disconnect.
    #[serde(default)]
    from_git: bool,
    /// Chosen at connect time, so GitHub Enterprise works on any domain.
    #[serde(default)]
    provider: Option<String>,
}

#[derive(Serialize)]
pub struct HubResponse {
    status: u16,
    data: Value,
}

fn norm_host(host: &str) -> Result<String, String> {
    let h = host.trim().trim_end_matches('/').to_ascii_lowercase();
    if h.is_empty() || h.contains('/') || h.contains('@') || h.contains(char::is_whitespace) {
        return Err(coded!(HubInvalidHost));
    }
    Ok(h)
}

fn provider_for(host: &str) -> Result<Provider, String> {
    match detect_provider(host) {
        Provider::Unsupported => Err(crate::pr::unsupported_provider_err(host)),
        p => Ok(p),
    }
}

fn account_provider(host: &str, secret: &StoredSecret) -> Result<Provider, String> {
    match secret.provider.as_deref().and_then(Provider::from_id) {
        Some(p) => Ok(p),
        None => provider_for(host),
    }
}

fn secret_key(host: &str, login: &str) -> String {
    format!("hub:{host}:{login}")
}

fn api_base(host: &str, provider: Provider) -> String {
    match provider {
        Provider::GitHub => crate::pr::github_api_base(host),
        Provider::GitLab => format!("https://{host}/api/v4"),
        Provider::Bitbucket if host == "bitbucket.org" => "https://api.bitbucket.org/2.0".into(),
        Provider::Bitbucket => format!("https://{host}/rest/api/1.0"),
        Provider::Gitea | Provider::Unsupported => format!("https://{host}/api/v1"),
    }
}

fn api_url(host: &str, provider: Provider, path: &str) -> Result<String, String> {
    if !path.starts_with('/')
        || path.starts_with("//")
        || path.contains("://")
        || path.contains('\\')
        || path.split(['/', '?']).any(|seg| seg == ".." || seg == ".")
    {
        return Err(coded!(HubInvalidApiPath));
    }
    if provider == Provider::GitHub && path == "/graphql" {
        return Ok(crate::pr::github_graphql_endpoint(host));
    }
    Ok(format!("{}{path}", api_base(host, provider)))
}

fn authed(
    req: reqwest::RequestBuilder,
    provider: Provider,
    secret: &StoredSecret,
) -> reqwest::RequestBuilder {
    use base64::Engine;
    let req = req.header("User-Agent", "l8git");
    match (provider, secret.username.as_deref().filter(|u| !u.is_empty())) {
        (Provider::Bitbucket, Some(user)) => {
            let b64 = base64::engine::general_purpose::STANDARD
                .encode(format!("{user}:{}", secret.token));
            req.header("Authorization", format!("Basic {b64}"))
        }
        (Provider::Gitea, _) => req.header("Authorization", format!("token {}", secret.token)),
        (Provider::GitHub, _) => req
            .header("Authorization", format!("Bearer {}", secret.token))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28"),
        _ => req.header("Authorization", format!("Bearer {}", secret.token)),
    }
}

async fn send(
    host: &str,
    provider: Provider,
    secret: &StoredSecret,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<HubResponse, String> {
    let url = api_url(host, provider, path)?;
    let method = match method.to_ascii_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        other => return Err(coded!(HubMethodNotAllowed, method = other)),
    };
    let client = http_client()?;
    let mut req = authed(client.request(method, &url), provider, secret);
    req = match body {
        Some(b) => req.json(&b),
        // GitHub's star/follow endpoints require an explicit zero length on PUT.
        None => req.header("Content-Length", "0"),
    };
    let res = req.send().await.map_err(|e| format!("{host}: {e}"))?;
    let status = res.status();
    if !status.is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&res) {
            return Err(error);
        }
        let text = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(status, &text) {
            return Err(error);
        }
        let msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| {
                v["message"]
                    .as_str()
                    .or_else(|| v["error"]["message"].as_str())
                    .or_else(|| v["error"].as_str())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| crate::pr::trunc_chars(text.trim(), 300));
        return Err(format!("{host} {}: {msg}", status.as_u16()));
    }
    let text = res.text().await.map_err(|e| format!("{host}: {e}"))?;
    let data = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::String(text))
    };
    if let Some(errors) = data["errors"].as_array().filter(|e| !e.is_empty()) {
        // GraphQL reports partial failures with 200; surface them when nothing came back.
        if data["data"].is_null() {
            return Err(match errors[0]["message"].as_str() {
                Some(msg) => format!("{host}: {msg}"),
                None => coded!(HubGraphqlFailed, host = host),
            });
        }
    }
    Ok(HubResponse { status: status.as_u16(), data })
}

fn load_secret(host: &str, login: &str) -> Result<StoredSecret, String> {
    let raw = get_secret(&secret_key(host, login))?
        .ok_or_else(|| coded!(HubNoToken, login = login, host = host))?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// `login@host/owner/repo` → that hub account's repo, for the shared PR commands.
pub(crate) fn remote_handle(spec: &str) -> Result<RemoteHandle, String> {
    let bad = || coded!(HubInvalidRepo, spec = spec);
    let (login, rest) = spec.split_once('@').ok_or_else(bad)?;
    let (host, full) = rest.split_once('/').ok_or_else(bad)?;
    let host = norm_host(host)?;
    let segs: Vec<&str> = full.split('/').collect();
    let unsafe_seg = |s: &&str| {
        s.is_empty() || *s == "." || *s == ".." || s.contains(['?', '#', '%', '\\']) || s.contains(char::is_whitespace)
    };
    if login.is_empty() || login.contains('/') || segs.len() < 2 || segs.iter().any(unsafe_seg) {
        return Err(bad());
    }
    let provider = account_provider(&host, &load_secret(&host, login)?)?;
    Ok(RemoteHandle {
        host,
        provider,
        owner: segs[0].to_string(),
        repo: segs[1..].join("/"),
        account: Some(login.to_string()),
    })
}

pub(crate) fn credential(host: &str, login: &str) -> Result<HttpsCredential, String> {
    let s = load_secret(host, login)?;
    Ok(HttpsCredential { username: s.username, password: s.token })
}

async fn viewer(host: &str, provider: Provider, secret: &StoredSecret) -> Result<HubAccount, String> {
    let path = if provider == Provider::Bitbucket && host != "bitbucket.org" {
        return Err(crate::pr::BITBUCKET_SERVER_UNSUPPORTED.into());
    } else {
        "/user"
    };
    let v = send(host, provider, secret, "GET", path, None).await?.data;
    let s = |k: &str| v[k].as_str().filter(|s| !s.is_empty()).map(str::to_string);
    let (login, name, avatar) = match provider {
        Provider::GitLab => (s("username"), s("name"), s("avatar_url")),
        Provider::Bitbucket => (
            s("username").or_else(|| s("nickname")),
            s("display_name"),
            v["links"]["avatar"]["href"].as_str().map(str::to_string),
        ),
        Provider::Gitea => (s("login"), s("full_name"), s("avatar_url")),
        _ => (s("login"), s("name"), s("avatar_url")),
    };
    Ok(HubAccount {
        host: host.to_string(),
        provider: provider.as_str(),
        login: login.ok_or_else(|| coded!(HubNoUsername))?,
        name,
        avatar_url: avatar,
    })
}

async fn store_account(
    host: &str,
    provider: Provider,
    secret: StoredSecret,
) -> Result<HubAccount, String> {
    let account = viewer(host, provider, &secret).await?;
    let key = secret_key(host, &account.login);
    let raw = serde_json::to_string(&secret).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || set_secret(&key, &raw))
        .await
        .map_err(|e| e.to_string())??;
    Ok(account)
}

fn gh_output(args: &[&str]) -> Result<String, String> {
    let gh = crate::shell::resolve_cli_path("gh").ok_or("__GH_MISSING__")?;
    let out = crate::cmd::cli_command(gh)
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .output()
        .map_err(|e| format!("gh: {e}"))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if !out.status.success() {
        return Err(format!("gh: {}", text.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// `gh auth status` prints "Logged in to <host> account <login> (...)" per user.
fn parse_gh_logins(status: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in status.lines() {
        if let Some((_, rest)) = line.split_once(" account ") {
            if let Some(login) = rest.split_whitespace().next() {
                if !out.iter().any(|l| l == login) {
                    out.push(login.to_string());
                }
            }
        }
    }
    out
}

fn gh_tokens(host: &str) -> Result<Vec<String>, String> {
    let gh = crate::shell::resolve_cli_path("gh").ok_or("__GH_MISSING__")?;
    // gh writes status to stderr and exits non-zero when any account is stale.
    let status = crate::cmd::cli_command(gh)
        .args(["auth", "status", "--hostname", host])
        .output()
        .map_err(|e| format!("gh: {e}"))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&status.stdout),
        String::from_utf8_lossy(&status.stderr)
    );
    let mut tokens = Vec::new();
    for login in parse_gh_logins(&text) {
        if let Ok(t) = gh_output(&["auth", "token", "--hostname", host, "--user", &login]) {
            tokens.push(t);
        }
    }
    if tokens.is_empty() {
        tokens.push(gh_output(&["auth", "token", "--hostname", host])?);
    }
    Ok(tokens.into_iter().filter(|t| !t.is_empty()).collect())
}

/// Connects one or more accounts for `host`.
/// `method`: "token" (uses `token`/`username`), "gh" (every GitHub CLI login),
/// "git" (the credential git already has for the host).
#[tauri::command]
pub async fn hub_connect(
    host: String,
    method: String,
    token: Option<String>,
    username: Option<String>,
    provider: Option<String>,
) -> Result<Vec<HubAccount>, String> {
    let host = norm_host(&host)?;
    let provider = match provider.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(id) => Provider::from_id(id).ok_or_else(|| coded!(HubUnknownProvider, provider = id))?,
        None => provider_for(&host)?,
    };
    let chosen = Some(provider.as_str().to_string());
    let secrets: Vec<StoredSecret> = match method.as_str() {
        "token" => {
            let token = token.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
            vec![StoredSecret {
                token: token.ok_or_else(|| required(Label::Token))?,
                username: username.map(|u| u.trim().to_string()).filter(|u| !u.is_empty()),
                from_git: false,
                provider: chosen,
            }]
        }
        "gh" => {
            let h = host.clone();
            tokio::task::spawn_blocking(move || gh_tokens(&h))
                .await
                .map_err(|e| e.to_string())??
                .into_iter()
                .map(|token| StoredSecret { token, username: None, from_git: false, provider: chosen.clone() })
                .collect()
        }
        "git" => {
            let h = host.clone();
            let cred = tokio::task::spawn_blocking(move || {
                crate::credentials::read_https_credential(&h)
            })
            .await
            .map_err(|e| e.to_string())??;
            vec![StoredSecret {
                token: cred.password,
                username: if provider == Provider::Bitbucket { cred.username } else { None },
                from_git: true,
                provider: chosen,
            }]
        }
        other => return Err(coded!(HubUnknownSignInMethod, method = other)),
    };
    let mut out = Vec::new();
    for secret in secrets {
        out.push(store_account(&host, provider, secret).await?);
    }
    Ok(out)
}

#[tauri::command]
pub async fn hub_disconnect(host: String, login: String) -> Result<(), String> {
    let host = norm_host(&host)?;
    let key = secret_key(&host, &login);
    tokio::task::spawn_blocking(move || {
        let secret = load_secret(&host, &login).ok();
        delete_secret(&key)?;
        // Best effort: drop git's credential only when the hub put this account's
        // token there, so logins made outside the hub (or for others) survive.
        if let Some(secret) = secret.filter(|s| !s.from_git) {
            if let Ok(cred) = crate::credentials::read_https_credential(&host) {
                if cred.password == secret.token {
                    let user = cred.username.or(secret.username).unwrap_or(login);
                    let _ = crate::credentials::reject_https_credential(&host, &user);
                }
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Makes `login` the credential git uses for pushes/pulls on `host`.
#[tauri::command]
pub async fn hub_use_for_git(host: String, login: String) -> Result<(), String> {
    let host = norm_host(&host)?;
    let (h, l) = (host.clone(), login.clone());
    let secret = tokio::task::spawn_blocking(move || load_secret(&h, &l))
        .await
        .map_err(|e| e.to_string())??;
    let user = secret.username.clone().unwrap_or(login);
    crate::credentials::git_sign_in(host, user, secret.token).await
}

#[tauri::command]
pub async fn hub_api(
    host: String,
    login: String,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<HubResponse, String> {
    let host = norm_host(&host)?;
    let (h, l) = (host.clone(), login);
    let secret = tokio::task::spawn_blocking(move || load_secret(&h, &l))
        .await
        .map_err(|e| e.to_string())??;
    let provider = account_provider(&host, &secret)?;
    send(&host, provider, &secret, &method, &path, body).await
}

#[derive(Serialize)]
pub struct HubDownload {
    base64: String,
    content_type: String,
    file_name: String,
    size: usize,
}

fn download_path(full_name: &str, kind: &str, id: u64) -> Result<(String, String), String> {
    let parts: Vec<_> = full_name.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|p| {
            p.is_empty()
                || *p == "."
                || *p == ".."
                || p.chars()
                    .any(|c| c.is_control() || c.is_whitespace() || "\\?#".contains(c))
        })
        || id == 0
    {
        return Err("Invalid repository or download ID".into());
    }
    let repo = format!(
        "/repos/{}/{}",
        crate::pr::encode_uri_component(parts[0]),
        crate::pr::encode_uri_component(parts[1])
    );
    match kind {
        "job_logs" => Ok((
            format!("{repo}/actions/jobs/{id}/logs"),
            format!("job-{id}.txt"),
        )),
        "run_logs" => Ok((
            format!("{repo}/actions/runs/{id}/logs"),
            format!("run-{id}-logs.zip"),
        )),
        "artifact" => Ok((
            format!("{repo}/actions/artifacts/{id}/zip"),
            format!("artifact-{id}.zip"),
        )),
        _ => Err("Unsupported download kind".into()),
    }
}

/// Bounded local-only download. Authenticate only the API request; signed storage
/// redirects are fetched with a fresh unauthenticated client and HTTPS only.
#[tauri::command]
pub async fn hub_download(
    host: String,
    login: String,
    full_name: String,
    kind: String,
    id: u64,
) -> Result<HubDownload, String> {
    use base64::Engine;
    use std::time::Duration;
    const LIMIT: usize = 64 * 1024 * 1024;
    let host = norm_host(&host)?;
    let (path, file_name) = download_path(&full_name, &kind, id)?;
    let (h, l) = (host.clone(), login);
    let secret = tokio::task::spawn_blocking(move || load_secret(&h, &l))
        .await
        .map_err(|e| e.to_string())??;
    let provider = account_provider(&host, &secret)?;
    if provider != Provider::GitHub {
        return Err("Downloads are only supported on GitHub".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;
    let url = api_url(&host, provider, &path)?;
    let mut response = authed(client.get(&url), provider, &secret)
        .send()
        .await
        .map_err(|_| "GitHub download request failed".to_string())?;
    if response.status().is_redirection() {
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .ok_or("Download redirect is missing a location")?;
        let target = reqwest::Url::parse(&url)
            .map_err(|e| e.to_string())?
            .join(location)
            .map_err(|_| "Invalid download redirect")?;
        if target.scheme() != "https"
            || !target.username().is_empty()
            || target.password().is_some()
        {
            return Err("Download redirect must use HTTPS without credentials".into());
        }
        let unsigned = reqwest::Client::builder()
            .timeout(Duration::from_secs(90))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5
                    || attempt.url().scheme() != "https"
                    || !attempt.url().username().is_empty()
                    || attempt.url().password().is_some()
                {
                    attempt.error("Unsafe or excessive download redirects")
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .map_err(|e| e.to_string())?;
        response = unsigned
            .get(target)
            .send()
            .await
            .map_err(|_| "Artifact storage download failed".to_string())?;
    }
    if !response.status().is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&response) {
            return Err(error);
        }
        return Err(format!(
            "GitHub download failed with status {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > LIMIT as u64)
    {
        return Err("Download exceeds the 64 MiB in-app limit; open GitHub to download it".into());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Download interrupted".to_string())?
    {
        if bytes.len().saturating_add(chunk.len()) > LIMIT {
            return Err(
                "Download exceeds the 64 MiB in-app limit; open GitHub to download it".into(),
            );
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(HubDownload {
        size: bytes.len(),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        content_type,
        file_name,
    })
}

#[derive(Serialize, Debug)]
pub struct TaskWorktree {
    path: String,
    branch: String,
    head: String,
    source_pr: Option<u64>,
    cleanup_warning: Option<String>,
}

fn create_task_worktree(
    repo: &std::path::PathBuf,
    worktree_path: String,
    branch: String,
    expected_head_sha: String,
    pr_number: Option<u64>,
) -> Result<TaskWorktree, String> {
    use crate::git_expansion::git as safe_git;
    if !matches!(expected_head_sha.len(), 40 | 64)
        || !expected_head_sha.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Worktree creation requires a full pinned commit ID".into());
    }
    let target = std::path::PathBuf::from(&worktree_path);
    if !target.is_absolute() || target.exists() || branch.trim() != branch || branch.is_empty() {
        return Err("Choose a new absolute worktree path and a valid new branch name".into());
    }
    if safe_git(repo, &["check-ref-format", "--branch", &branch])?.trim() != branch {
        return Err("Branch shorthand is not allowed".into());
    }
    let coordination = crate::git::repo_coordination_mutex(repo)?;
    let _coordination = coordination.lock().map_err(|e| e.to_string())?;
    let mutation = crate::git::repo_mutation_mutex(repo)?;
    let _mutation = mutation.lock().map_err(|e| e.to_string())?;
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temporary_ref = format!("refs/l8git/task-{}-{unique}", std::process::id());
    let mut fetched_head: Option<String> = None;
    let result = (|| {
        let head = if let Some(number) = pr_number {
            if number == 0 {
                return Err("Invalid pull request number".into());
            }
            let refspec = format!("refs/pull/{number}/head:{temporary_ref}");
            safe_git(
                repo,
                &[
                    "fetch",
                    "--no-tags",
                    "--no-write-fetch-head",
                    "--",
                    "origin",
                    &refspec,
                ],
            )?;
            let head = crate::git::resolve_git_commit(repo, &temporary_ref)?;
            fetched_head = Some(head.clone());
            head
        } else {
            crate::git::resolve_git_commit(repo, &expected_head_sha)?
        };
        if !head.eq_ignore_ascii_case(&expected_head_sha) {
            return Err("The PR head changed. Refresh and review the new commit before creating its worktree".into());
        }
        safe_git(
            repo,
            &[
                "worktree",
                "add",
                "-b",
                &branch,
                "--",
                &worktree_path,
                &head,
            ],
        )?;
        Ok(TaskWorktree {
            path: worktree_path,
            branch,
            head,
            source_pr: pr_number,
            cleanup_warning: None,
        })
    })();
    let cleanup = fetched_head
        .and_then(|head| safe_git(repo, &["update-ref", "-d", &temporary_ref, &head]).err());
    match result {
        Ok(mut worktree) => {
            worktree.cleanup_warning = cleanup;
            Ok(worktree)
        }
        Err(error) => Err(match cleanup {
            Some(cleanup) => format!("{error}\nTemporary reference cleanup failed: {cleanup}"),
            None => error,
        }),
    }
}

/// Creates a separate task/review checkout without changing the active worktree.
/// The explicit opt-in applies to all PR code, including code from external forks.
#[tauri::command]
pub async fn hub_task_worktree(
    path: String,
    expected_host: String,
    expected_full_name: String,
    worktree_path: String,
    branch: String,
    expected_head_sha: String,
    pr_number: Option<u64>,
    allow_external_code: bool,
) -> Result<TaskWorktree, String> {
    if pr_number.is_some() && !allow_external_code {
        return Err("Confirm checkout of PR code before creating a review worktree. Project commands will not run automatically".into());
    }
    tokio::task::spawn_blocking(move || {
        let repo = std::path::PathBuf::from(path);
        let origin = crate::pr::parse_origin_url(&repo)?;
        if origin.provider != Provider::GitHub
            || !origin.host.eq_ignore_ascii_case(&expected_host)
            || !format!("{}/{}", origin.owner, origin.repo)
                .eq_ignore_ascii_case(&expected_full_name)
        {
            return Err(
                "Selected local origin does not match this GitHub issue or pull request".into(),
            );
        }
        create_task_worktree(&repo, worktree_path, branch, expected_head_sha, pr_number)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct SuggestionFileEdit {
    file: String,
    expected_content: String,
    content: String,
}

fn suggestion_patch(edits: &[SuggestionFileEdit]) -> Result<String, String> {
    if edits.is_empty() || edits.len() > 100 {
        return Err("Select between 1 and 100 suggestion files".into());
    }
    let mut patch = String::new();
    let mut files = std::collections::HashSet::new();
    for edit in edits {
        if !files.insert(&edit.file)
            || edit.expected_content.contains('\0')
            || edit.content.contains('\0')
        {
            return Err("Duplicate files or binary suggestions are not supported".into());
        }
        if edit.expected_content == edit.content {
            continue;
        }
        let before =
            serde_json::to_string(&format!("a/{}", edit.file)).map_err(|e| e.to_string())?;
        let after =
            serde_json::to_string(&format!("b/{}", edit.file)).map_err(|e| e.to_string())?;
        let old_count = edit.expected_content.split_inclusive('\n').count();
        let new_count = edit.content.split_inclusive('\n').count();
        patch.push_str(&format!(
            "diff --git {before} {after}\n--- {before}\n+++ {after}\n@@ -{},{} +{},{} @@\n",
            usize::from(old_count > 0),
            old_count,
            usize::from(new_count > 0),
            new_count
        ));
        for (prefix, text) in [('-', &edit.expected_content), ('+', &edit.content)] {
            for line in text.split_inclusive('\n') {
                patch.push(prefix);
                patch.push_str(line);
                if !line.ends_with('\n') {
                    patch.push_str("\n\\ No newline at end of file\n");
                }
            }
        }
        if patch.len() > 4 * 1024 * 1024 {
            return Err("Suggestion batch exceeds the 4 MiB limit".into());
        }
    }
    if patch.is_empty() {
        return Err("Suggestion batch has no changes".into());
    }
    Ok(patch)
}

fn apply_suggestions(
    repo: &std::path::PathBuf,
    expected_head: &str,
    edits: &[SuggestionFileEdit],
) -> Result<(), String> {
    if !matches!(expected_head.len(), 40 | 64)
        || !expected_head.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Suggestions require a full reviewed commit ID".into());
    }
    let patch = suggestion_patch(edits)?;
    let lock = crate::git::repo_mutation_mutex(repo)?;
    let _lock = lock.lock().map_err(|e| e.to_string())?;
    if crate::git::resolve_git_commit(repo, "HEAD")? != expected_head {
        return Err("HEAD changed since reviewing suggestions".into());
    }
    let guard = crate::git::WorktreePathGuard::new(repo)?;
    for edit in edits {
        let file = guard.regular_file(&edit.file)?;
        if std::fs::read_to_string(file).map_err(|e| e.to_string())? != edit.expected_content {
            return Err(format!("__FILE_CHANGED__|{}", edit.file));
        }
    }
    crate::git_expansion::git_input(
        repo,
        &["apply", "--check", "--unidiff-zero", "--whitespace=nowarn"],
        patch.as_bytes(),
    )?;
    // One Git invocation validates the whole batch before updating any file.
    // The index is not changed; the user can review and commit the suggestions.
    crate::git_expansion::git_input(
        repo,
        &["apply", "--unidiff-zero", "--whitespace=nowarn"],
        patch.as_bytes(),
    )?;
    Ok(())
}

#[tauri::command]
pub async fn hub_apply_suggestions(
    path: String,
    expected_head: String,
    edits: Vec<SuggestionFileEdit>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        apply_suggestions(&std::path::PathBuf::from(path), &expected_head, &edits)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct IdentityProfileInput {
    name: String,
    email: String,
    signing_format: String,
    signing_key: String,
    sign_commits: bool,
}

#[derive(Serialize)]
pub struct IdentityInfo {
    effective: std::collections::BTreeMap<String, String>,
    local: std::collections::BTreeMap<String, String>,
    fingerprint: String,
}

fn identity_info(repo: &std::path::PathBuf) -> Result<IdentityInfo, String> {
    use sha2::{Digest, Sha256};
    let mut effective = std::collections::BTreeMap::new();
    let mut local = std::collections::BTreeMap::new();
    for key in ["user.name", "user.email", "gpg.format", "user.signingkey", "commit.gpgsign"] {
        // Read actual configuration, not safe_git's deliberate command-line overrides.
        effective.insert(key.to_string(), crate::git::run_git(repo, &["config", "--get", "--default", "", key])?.trim_end_matches(['\r', '\n']).to_string());
        local.insert(key.to_string(), crate::git::run_git(repo, &["config", "--local", "--get", "--default", "", key])?.trim_end_matches(['\r', '\n']).to_string());
    }
    let bytes = serde_json::to_vec(&(&effective, &local)).map_err(|e| e.to_string())?;
    Ok(IdentityInfo { effective, local, fingerprint: format!("{:x}", Sha256::digest(bytes)) })
}

#[derive(Serialize)]
pub struct IdentityApplyResult {
    info: IdentityInfo,
    completed_keys: Vec<String>,
    error: Option<String>,
}

fn apply_identity_profile(repo: &std::path::PathBuf, profile: Option<IdentityProfileInput>, expected_fingerprint: Option<String>) -> Result<IdentityApplyResult, String> {
    let lock = crate::git::repo_mutation_mutex(repo)?;
    let _lock = lock.lock().map_err(|e| e.to_string())?;
    let before = identity_info(repo)?;
    let Some(profile) = profile else { return Ok(IdentityApplyResult { info: before, completed_keys: vec![], error: None }); };
    if expected_fingerprint.as_deref() != Some(before.fingerprint.as_str()) { return Err("Git identity changed since preview; refresh before applying this profile".into()); }
    if profile.name.trim().is_empty() || profile.name.contains(['\r', '\n', '\0', '<', '>'])
        || !profile.email.contains('@') || profile.email.chars().any(|c| c.is_control() || c.is_whitespace() || matches!(c, '<' | '>'))
        || !matches!(profile.signing_format.as_str(), "openpgp" | "ssh" | "x509")
        || profile.signing_key.contains(['\r', '\n', '\0']) || profile.sign_commits && profile.signing_key.trim().is_empty() {
        return Err("Invalid author identity or signing configuration".into());
    }
    let fields = [
        ("user.name", profile.name.trim().to_string()), ("user.email", profile.email),
        ("gpg.format", profile.signing_format), ("user.signingkey", profile.signing_key),
        ("commit.gpgsign", profile.sign_commits.to_string()),
    ];
    let mut completed_keys = Vec::new();
    for (key, value) in fields {
        if let Err(error) = crate::git::run_git(repo, &["config", "--local", "--replace-all", key, &value]) {
            return Ok(IdentityApplyResult { info: identity_info(repo)?, completed_keys, error: Some(format!("Could not update {key}: {error}. Some earlier keys may already have changed.")) });
        }
        completed_keys.push(key.to_string());
    }
    Ok(IdentityApplyResult { info: identity_info(repo)?, completed_keys, error: None })
}

#[tauri::command]
pub async fn hub_identity_profile(path: String, profile: Option<IdentityProfileInput>, expected_fingerprint: Option<String>) -> Result<IdentityApplyResult, String> {
    tokio::task::spawn_blocking(move || apply_identity_profile(&std::path::PathBuf::from(path), profile, expected_fingerprint))
        .await.map_err(|e| e.to_string())?
}

// GitHub OAuth device flow. Needs an OAuth App with device flow enabled; its
// public client id is baked in at build time via L8GIT_GITHUB_CLIENT_ID.
const GITHUB_CLIENT_ID: Option<&str> = option_env!("L8GIT_GITHUB_CLIENT_ID");
const GITHUB_SCOPES: &str = "repo read:org read:user user:email workflow notifications gist";

#[derive(Serialize)]
pub struct DeviceCode {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

#[tauri::command]
pub fn hub_oauth_available() -> bool {
    GITHUB_CLIENT_ID.is_some_and(|id| !id.is_empty())
}

async fn github_oauth_post(url: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    http_client()?
        .post(url)
        .header("Accept", "application/json")
        .header("User-Agent", "l8git")
        .form(form)
        .send()
        .await
        .map_err(|e| format!("GitHub: {e}"))?
        .json()
        .await
        .map_err(|e| format!("GitHub: {e}"))
}

#[tauri::command]
pub async fn hub_oauth_start() -> Result<DeviceCode, String> {
    let id = GITHUB_CLIENT_ID.filter(|s| !s.is_empty()).ok_or_else(|| coded!(HubOauthNotConfigured))?;
    let v = github_oauth_post(
        "https://github.com/login/device/code",
        &[("client_id", id), ("scope", GITHUB_SCOPES)],
    )
    .await?;
    if let Some(err) = v["error_description"].as_str() {
        return Err(format!("GitHub: {err}"));
    }
    Ok(DeviceCode {
        device_code: v["device_code"].as_str().unwrap_or_default().into(),
        user_code: v["user_code"].as_str().unwrap_or_default().into(),
        verification_uri: v["verification_uri"].as_str().unwrap_or("https://github.com/login/device").into(),
        interval: v["interval"].as_u64().unwrap_or(5),
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
    })
}

#[derive(Serialize)]
pub struct OauthPoll {
    account: Option<HubAccount>,
    /// GitHub asked us to poll less often; the caller adds 5 s to its interval.
    slow_down: bool,
}

#[tauri::command]
pub async fn hub_oauth_poll(device_code: String) -> Result<OauthPoll, String> {
    let id = GITHUB_CLIENT_ID.filter(|s| !s.is_empty()).ok_or_else(|| coded!(HubOauthNotConfigured))?;
    let v = github_oauth_post(
        "https://github.com/login/oauth/access_token",
        &[
            ("client_id", id),
            ("device_code", &device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ],
    )
    .await?;
    if let Some(token) = v["access_token"].as_str() {
        let secret = StoredSecret {
            token: token.to_string(),
            username: None,
            from_git: false,
            provider: Some(Provider::GitHub.as_str().into()),
        };
        let account = store_account("github.com", Provider::GitHub, secret).await?;
        return Ok(OauthPoll { account: Some(account), slow_down: false });
    }
    match v["error"].as_str() {
        Some("authorization_pending") => Ok(OauthPoll { account: None, slow_down: false }),
        Some("slow_down") => Ok(OauthPoll { account: None, slow_down: true }),
        _ => Err(match v["error_description"].as_str() {
            Some(description) => format!("GitHub: {description}"),
            None => coded!(HubSignInFailed),
        }),
    }
}

/// Hands a PR task to a T3 Code webhook task, which starts a T3 thread for it.
/// Posted from Rust because the webview's fetch would be blocked by CORS.
#[tauri::command]
pub async fn hub_t3_send(url: String, payload: Value) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|_| coded!(T3InvalidWebhookUrl))?;
    let local = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && local) {
        return Err(coded!(T3WebhookHttps));
    }
    // No redirects: they could downgrade to plain http after the check above.
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP-Client: {e}"))?;
    let res = client
        .post(parsed)
        .json(&payload)
        .send()
        .await
        // The URL is the webhook secret; keep it out of the error toast.
        .map_err(|e| format!("T3: {}", e.without_url()))?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("T3: {status} {}", body.chars().take(300).collect::<String>()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct WorktreeFixture(std::path::PathBuf);
    impl WorktreeFixture {
        fn new() -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "l8git-task-worktree-{}-{stamp}",
                std::process::id()
            ));
            std::fs::create_dir_all(&root).unwrap();
            let repo = root.join("repo");
            std::fs::create_dir(&repo).unwrap();
            let fixture = Self(root);
            fixture.git(&repo, &["init", "-b", "main"]);
            fixture.git(&repo, &["config", "user.name", "Fixture"]);
            fixture.git(&repo, &["config", "user.email", "fixture@example.test"]);
            fixture.git(&repo, &["config", "commit.gpgsign", "false"]);
            fixture.git(&repo, &["config", "core.autocrlf", "false"]);
            std::fs::write(repo.join("file.txt"), "initial\n").unwrap();
            fixture.git(&repo, &["add", "file.txt"]);
            fixture.git(&repo, &["commit", "-m", "initial"]);
            fixture
        }
        fn git(&self, repo: &std::path::PathBuf, args: &[&str]) -> String {
            crate::git::run_git(repo, args).unwrap()
        }
    }
    impl Drop for WorktreeFixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn issue_worktree_preserves_dirty_main_head_and_index() {
        let fixture = WorktreeFixture::new();
        let repo = fixture.0.join("repo");
        let head = fixture
            .git(&repo, &["rev-parse", "HEAD"])
            .trim()
            .to_string();
        std::fs::write(repo.join("file.txt"), "staged\n").unwrap();
        fixture.git(&repo, &["add", "file.txt"]);
        std::fs::write(repo.join("file.txt"), "unstaged\n").unwrap();
        let index = fixture.git(&repo, &["write-tree"]);
        let destination = fixture.0.join("task");
        let created = create_task_worktree(
            &repo,
            destination.to_string_lossy().into(),
            "issue-1".into(),
            head.clone(),
            None,
        )
        .unwrap();
        assert_eq!(created.head, head);
        assert_eq!(fixture.git(&repo, &["rev-parse", "HEAD"]).trim(), head);
        assert_eq!(fixture.git(&repo, &["write-tree"]), index);
        assert_eq!(
            std::fs::read_to_string(repo.join("file.txt")).unwrap(),
            "unstaged\n"
        );
        assert_eq!(
            std::fs::read_to_string(destination.join("file.txt")).unwrap(),
            "initial\n"
        );
    }

    #[test]
    fn review_worktree_fetches_pinned_head_and_rejects_changed_pr() {
        let fixture = WorktreeFixture::new();
        let repo = fixture.0.join("repo");
        let head = fixture
            .git(&repo, &["rev-parse", "HEAD"])
            .trim()
            .to_string();
        fixture.git(&repo, &["update-ref", "refs/pull/7/head", &head]);
        fixture.git(&repo, &["remote", "add", "origin", repo.to_str().unwrap()]);
        let destination = fixture.0.join("review");
        let created = create_task_worktree(
            &repo,
            destination.to_string_lossy().into(),
            "review-7".into(),
            head.clone(),
            Some(7),
        )
        .unwrap();
        assert_eq!(created.head, head);
        assert_eq!(
            fixture.git(&repo, &["symbolic-ref", "HEAD"]).trim(),
            "refs/heads/main"
        );
        assert!(fixture
            .git(&repo, &["for-each-ref", "refs/l8git/task-"])
            .trim()
            .is_empty());
        let stale = create_task_worktree(
            &repo,
            fixture.0.join("stale").to_string_lossy().into(),
            "stale-review".into(),
            "a".repeat(40),
            Some(7),
        );
        assert!(stale.unwrap_err().contains("head changed"));
        assert!(!fixture.0.join("stale").exists());
        assert!(fixture
            .git(&repo, &["for-each-ref", "refs/l8git/task-"])
            .trim()
            .is_empty());
    }

    #[test]
    fn suggestion_batch_validates_every_file_before_writing_and_preserves_index() {
        let fixture = WorktreeFixture::new();
        let repo = fixture.0.join("repo");
        let head = fixture
            .git(&repo, &["rev-parse", "HEAD"])
            .trim()
            .to_string();
        let index = fixture.git(&repo, &["write-tree"]);
        std::fs::write(repo.join("second.txt"), "original\n").unwrap();
        let invalid = vec![
            SuggestionFileEdit {
                file: "file.txt".into(),
                expected_content: "initial\n".into(),
                content: "changed\n".into(),
            },
            SuggestionFileEdit {
                file: "second.txt".into(),
                expected_content: "stale\n".into(),
                content: "changed\n".into(),
            },
        ];
        assert!(apply_suggestions(&repo, &head, &invalid).is_err());
        assert_eq!(
            std::fs::read_to_string(repo.join("file.txt")).unwrap(),
            "initial\n"
        );
        let valid = vec![
            SuggestionFileEdit {
                file: "file.txt".into(),
                expected_content: "initial\n".into(),
                content: "changed\n".into(),
            },
            SuggestionFileEdit {
                file: "second.txt".into(),
                expected_content: "original\n".into(),
                content: "no final newline".into(),
            },
        ];
        apply_suggestions(&repo, &head, &valid).unwrap();
        assert_eq!(
            std::fs::read_to_string(repo.join("file.txt")).unwrap(),
            "changed\n"
        );
        assert_eq!(
            std::fs::read_to_string(repo.join("second.txt")).unwrap(),
            "no final newline"
        );
        assert_eq!(fixture.git(&repo, &["write-tree"]), index);
    }

    #[test]
    fn multiline_reviews_preserve_side_and_start_anchor() {
        let draft = crate::pr::ReviewDraftComment {
            path: "f.txt".into(),
            line: 8,
            body: "review".into(),
            side: Some("LEFT".into()),
            start_line: Some(3),
            start_side: None,
        };
        let payload = crate::pr::gh_review_payload("COMMENT", "", &[draft]);
        assert_eq!(payload["comments"][0]["start_line"], 3);
        assert_eq!(payload["comments"][0]["start_side"], "LEFT");
        assert_eq!(payload["comments"][0]["side"], "LEFT");
    }

    #[test]
    fn identity_profiles_require_fresh_preview_and_apply_only_local_config() {
        let fixture = WorktreeFixture::new(); let repo = fixture.0.join("repo");
        let before = identity_info(&repo).unwrap();
        fixture.git(&repo, &["config", "--local", "user.name", "External change"]);
        let profile = || IdentityProfileInput { name: "Alice".into(), email: "alice@example.test".into(), signing_format: "ssh".into(), signing_key: "key.pub".into(), sign_commits: true };
        assert!(apply_identity_profile(&repo, Some(profile()), Some(before.fingerprint)).is_err());
        assert_eq!(fixture.git(&repo, &["config", "--local", "user.name"]).trim(), "External change");
        let current = identity_info(&repo).unwrap();
        let applied = apply_identity_profile(&repo, Some(profile()), Some(current.fingerprint)).unwrap();
        assert!(applied.error.is_none());
        assert_eq!(applied.completed_keys.len(), 5);
        assert_eq!(applied.info.effective["user.name"], "Alice");
        assert_eq!(applied.info.local["gpg.format"], "ssh");
        assert_eq!(applied.info.local["commit.gpgsign"], "true");
    }

    #[test]
    fn download_routes_are_fixed_and_require_valid_identifiers() {
        assert_eq!(
            download_path("owner/repo", "job_logs", 4).unwrap(),
            (
                "/repos/owner/repo/actions/jobs/4/logs".into(),
                "job-4.txt".into()
            )
        );
        assert_eq!(
            download_path("owner/repo", "artifact", 5).unwrap().0,
            "/repos/owner/repo/actions/artifacts/5/zip"
        );
        for repo in ["a/..", "a/b/c", "a/b?x", "a/", "a/ b"] {
            assert!(download_path(repo, "artifact", 1).is_err());
        }
        assert!(download_path("a/b", "https://evil.test", 1).is_err());
        assert!(download_path("a/b", "artifact", 0).is_err());
    }



    #[test]
    fn api_url_stays_on_account_host() {
        let gh = Provider::GitHub;
        assert_eq!(api_url("github.com", gh, "/user").unwrap(), "https://api.github.com/user");
        assert_eq!(api_url("ghe.acme.io", gh, "/graphql").unwrap(), "https://ghe.acme.io/api/graphql");
        assert_eq!(api_url("ghe.acme.io", gh, "/user").unwrap(), "https://ghe.acme.io/api/v3/user");
        assert_eq!(api_url("octo.ghe.com", gh, "/user").unwrap(), "https://api.octo.ghe.com/user");
        assert_eq!(api_url("octo.ghe.com", gh, "/graphql").unwrap(), "https://api.octo.ghe.com/graphql");
        for bad in ["user", "//evil.com/x", "/x/../../y", "/a?u=http://evil", "/a\\b"] {
            assert!(api_url("github.com", gh, bad).is_err(), "{bad}");
        }
        assert!(norm_host("evil.com/x").is_err());
        assert!(norm_host("a@b").is_err());
        for bad in ["alice", "alice@github.com/x", "@github.com/o/r", "alice@github.com/o/../r", "alice@github.com/o/r?x", "alice@github.com//r"] {
            assert!(remote_handle(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn parses_gh_status_logins() {
        let s = "github.com\n  ✓ Logged in to github.com account alice (keyring)\n  - Active account: true\n  ✓ Logged in to github.com account bob (GH_TOKEN)\n";
        assert_eq!(parse_gh_logins(s), vec!["alice", "bob"]);
    }
}
