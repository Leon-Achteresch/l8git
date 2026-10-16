//! Hub: multi-account access to hosting providers (GitHub, GitLab, Bitbucket,
//! Gitea). Tokens live only in the OS keychain; the renderer talks to the
//! provider through `hub_api`, which pins every request to the account's API
//! base so a token can never be sent to a foreign host.

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
        return Err("Ungültiger Host".into());
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
        return Err("Ungültiger API-Pfad".into());
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
        other => return Err(format!("HTTP-Methode {other} nicht erlaubt")),
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
            let msg = errors[0]["message"].as_str().unwrap_or("GraphQL-Fehler");
            return Err(format!("{host}: {msg}"));
        }
    }
    Ok(HubResponse { status: status.as_u16(), data })
}

fn load_secret(host: &str, login: &str) -> Result<StoredSecret, String> {
    let raw = get_secret(&secret_key(host, login))?
        .ok_or_else(|| format!("Kein Token für {login}@{host}. Bitte erneut verbinden."))?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// `login@host/owner/repo` → that hub account's repo, for the shared PR commands.
pub(crate) fn remote_handle(spec: &str) -> Result<RemoteHandle, String> {
    let bad = || format!("Ungültiges Hub-Repo: {spec}");
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
        login: login.ok_or("Anbieter lieferte keinen Benutzernamen")?,
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
        Some(id) => Provider::from_id(id).ok_or_else(|| format!("Unbekannter Anbieter {id}"))?,
        None => provider_for(&host)?,
    };
    let chosen = Some(provider.as_str().to_string());
    let secrets: Vec<StoredSecret> = match method.as_str() {
        "token" => {
            let token = token.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
            vec![StoredSecret {
                token: token.ok_or("Token darf nicht leer sein")?,
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
        other => return Err(format!("Unbekannte Anmeldemethode {other}")),
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
    let id = GITHUB_CLIENT_ID.filter(|s| !s.is_empty()).ok_or("OAuth nicht konfiguriert")?;
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
    let id = GITHUB_CLIENT_ID.filter(|s| !s.is_empty()).ok_or("OAuth nicht konfiguriert")?;
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
        _ => Err(format!(
            "GitHub: {}",
            v["error_description"].as_str().unwrap_or("Anmeldung fehlgeschlagen")
        )),
    }
}

/// Hands a PR task to a T3 Code webhook task, which starts a T3 thread for it.
/// Posted from Rust because the webview's fetch would be blocked by CORS.
#[tauri::command]
pub async fn hub_t3_send(url: String, payload: Value) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|_| "T3: ungültige Webhook-URL".to_string())?;
    let local = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && local) {
        return Err("T3: Webhook-URL muss https sein".into());
    }
    let res = http_client()?
        .post(parsed)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("T3: {e}"))?;
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
