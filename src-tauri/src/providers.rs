use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use serde_json::Value;

use crate::credentials::{read_https_credential, HttpsCredential};

#[derive(Serialize)]
pub struct RemoteRepo {
    pub name: String,
    pub full_name: String,
    pub clone_url: String,
    pub description: Option<String>,
    pub private: bool,
    pub default_branch: Option<String>,
}

pub(crate) fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP-Client: {e}"))
}

fn github_api_base(host: &str) -> String {
    if crate::pr::detect_provider(host) == crate::pr::Provider::Gitea {
        return crate::pr::gitea_api_base(host);
    }
    if host.eq_ignore_ascii_case("github.com") {
        "https://api.github.com".to_string()
    } else {
        format!("https://{}/api/v3", host.trim_end_matches('/'))
    }
}

fn bitbucket_secret_likely_jwt(secret: &str) -> bool {
    let parts: Vec<&str> = secret.split('.').collect();
    parts.len() >= 3
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.len() <= 2048
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        })
}

pub(crate) async fn bitbucket_send_authed(
    client: &reqwest::Client,
    url: &str,
    cred: &HttpsCredential,
    host: &str,
) -> Result<reqwest::Response, String> {
    let basic_b64 = cred.username.as_ref().filter(|u| !u.is_empty()).map(|user| {
        base64::engine::general_purpose::STANDARD.encode(format!("{user}:{}", cred.password))
    });
    let mut res = if let Some(ref b64) = basic_b64 {
        client
            .get(url)
            .header("User-Agent", "l8git")
            .header("Authorization", format!("Basic {b64}"))
            .send()
            .await
            .map_err(|e| format!("Bitbucket: {e}"))?
    } else if bitbucket_secret_likely_jwt(&cred.password) {
        client
            .get(url)
            .header("User-Agent", "l8git")
            .header("Authorization", format!("Bearer {}", cred.password))
            .send()
            .await
            .map_err(|e| format!("Bitbucket: {e}"))?
    } else {
        return Err(format!(
            "Bitbucket: Benutzername fehlt. Bitte unter Einstellungen bei {host} mit Benutzername und App-Passwort anmelden."
        ));
    };
    if res.status() == reqwest::StatusCode::UNAUTHORIZED && basic_b64.is_some() {
        res = client
            .get(url)
            .header("User-Agent", "l8git")
            .header("Authorization", format!("Bearer {}", cred.password))
            .send()
            .await
            .map_err(|e| format!("Bitbucket: {e}"))?;
    }
    Ok(res)
}

pub(crate) async fn bitbucket_collect_paginated_values(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    start_url: &str,
    host: &str,
) -> Result<Vec<Value>, String> {
    const MAX_PAGES: usize = 500;
    let expected_host = reqwest::Url::parse(start_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
        .ok_or_else(|| "Bitbucket: Ungültige API-URL.".to_string())?;
    let mut out: Vec<Value> = Vec::new();
    let mut next: Option<String> = Some(start_url.to_string());
    let mut pages = 0usize;
    while let Some(url) = next.take() {
        pages += 1;
        if pages > MAX_PAGES {
            return Err("Bitbucket: Seitenlimit bei der API-Pagination erreicht.".into());
        }
        let page_host = reqwest::Url::parse(&url)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()));
        if page_host.as_deref() != Some(expected_host.as_str()) {
            return Err("Bitbucket: Pagination verweist auf einen fremden Host; abgebrochen.".into());
        }
        let res = bitbucket_send_authed(client, &url, cred, host).await?;
        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(format!(
                "Bitbucket: 401. Zugangsdaten passen nicht zur REST-API (App-Passwort/API-Token mit Atlassian-E-Mail als Benutzername, oder gültiger OAuth-Access-Token). Bitte unter Einstellungen bei {host} prüfen oder neu anmelden."
            ));
        }
        if !res.status().is_success() {
            let body = res.text().await.unwrap_or_default();
            return Err(format!("Bitbucket: {}", body.trim()));
        }
        let root: Value = res.json().await.map_err(|e| format!("Bitbucket: {e}"))?;
        if let Some(arr) = root["values"].as_array() {
            out.extend(arr.iter().cloned());
        }
        if let Some(n) = root["next"].as_str() {
            if !n.is_empty() {
                next = Some(n.to_string());
            }
        }
    }
    Ok(out)
}

fn bitbucket_remote_repo_from_value(v: &Value) -> Option<RemoteRepo> {
    let slug = v["slug"].as_str().unwrap_or("").to_string();
    let full_name = v["full_name"].as_str().unwrap_or("").to_string();
    let description = v["description"].as_str().map(|s| s.to_string());
    let private = v["is_private"].as_bool().unwrap_or(false);
    let default_branch = v["mainbranch"]["name"]
        .as_str()
        .map(|s| s.to_string());
    let mut clone_url = String::new();
    if let Some(clones) = v["links"]["clone"].as_array() {
        for c in clones {
            if c["name"].as_str() == Some("https") {
                if let Some(h) = c["href"].as_str() {
                    clone_url = h.to_string();
                    break;
                }
            }
        }
        if clone_url.is_empty() {
            if let Some(c) = clones.first() {
                if let Some(h) = c["href"].as_str() {
                    clone_url = h.to_string();
                }
            }
        }
    }
    if clone_url.is_empty() {
        return None;
    }
    Some(RemoteRepo {
        name: slug,
        full_name,
        clone_url,
        description,
        private,
        default_branch,
    })
}

async fn github_list(host: &str) -> Result<Vec<RemoteRepo>, String> {
    let cred = read_https_credential(host)?;
    let client = http_client()?;
    let mut out: Vec<RemoteRepo> = Vec::new();
    // Paginate: GitHub returns max 100 per page; large GHE installations can
    // have thousands of repos. We fetch up to 20 pages (2 000 repos) which
    // covers virtually all real-world cases.
    const MAX_PAGES: u32 = 20;
    for page in 1..=MAX_PAGES {
        let url = format!(
            "{}/user/repos?per_page=100&sort=updated&page={page}",
            github_api_base(host)
        );
        let res = client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "l8git")
            .header("Authorization", format!("Bearer {}", cred.password))
            .send()
            .await
            .map_err(|e| format!("GitHub: {e}"))?;
        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(format!(
                "GitHub: 401. Bitte unter Einstellungen bei {host} anmelden."
            ));
        }
        if !res.status().is_success() {
            let body = res.text().await.unwrap_or_default();
            return Err(format!("GitHub: {}", body.trim()));
        }
        let arr: Vec<serde_json::Value> =
            res.json().await.map_err(|e| format!("GitHub: {e}"))?;
        let page_len = arr.len();
        for v in arr {
            let name = v["name"].as_str().unwrap_or("").to_string();
            let full_name = v["full_name"].as_str().unwrap_or("").to_string();
            let clone_url = v["clone_url"].as_str().unwrap_or("").to_string();
            if clone_url.is_empty() {
                continue;
            }
            let description = v["description"].as_str().map(|s| s.to_string());
            let private = v["private"].as_bool().unwrap_or(false);
            let default_branch = v["default_branch"].as_str().map(|s| s.to_string());
            out.push(RemoteRepo {
                name,
                full_name,
                clone_url,
                description,
                private,
                default_branch,
            });
        }
        // GitHub returns fewer than 100 items on the last page.
        if page_len < 100 {
            break;
        }
    }
    Ok(out)
}

async fn gitlab_list(host: &str) -> Result<Vec<RemoteRepo>, String> {
    let cred = read_https_credential(host)?;
    let client = http_client()?;
    let base = format!("https://{host}");
    let url = format!(
        "{}/api/v4/projects?membership=true&per_page=100&order_by=last_activity_at",
        base.trim_end_matches('/')
    );
    let res = client
        .get(&url)
        .header("User-Agent", "l8git")
        .header("PRIVATE-TOKEN", cred.password)
        .send()
        .await
        .map_err(|e| format!("GitLab: {e}"))?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "GitLab: 401. Bitte unter Einstellungen bei {host} anmelden."
        ));
    }
    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("GitLab: {}", body.trim()));
    }
    let arr: Vec<Value> = res.json().await.map_err(|e| format!("GitLab: {e}"))?;
    let mut out = Vec::new();
    for v in arr {
        let name = v["name"].as_str().unwrap_or("").to_string();
        let full_name = v["path_with_namespace"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let clone_url = v["http_url_to_repo"].as_str().unwrap_or("").to_string();
        if clone_url.is_empty() {
            continue;
        }
        let description = v["description"].as_str().map(|s| s.to_string());
        let private = v["visibility"].as_str() == Some("private");
        let default_branch = v["default_branch"].as_str().map(|s| s.to_string());
        out.push(RemoteRepo {
            name,
            full_name,
            clone_url,
            description,
            private,
            default_branch,
        });
    }
    Ok(out)
}

async fn bitbucket_list(host: &str) -> Result<Vec<RemoteRepo>, String> {
    let cred = read_https_credential(host)?;
    let client = http_client()?;
    let workspaces_url = "https://api.bitbucket.org/2.0/user/workspaces?pagelen=100";
    let workspace_rows =
        bitbucket_collect_paginated_values(&client, &cred, workspaces_url, host).await?;
    let mut workspace_slugs: Vec<String> = Vec::new();
    for row in workspace_rows {
        let slug = row
            .get("workspace")
            .and_then(|w| w.get("slug"))
            .and_then(|s| s.as_str());
        if let Some(s) = slug {
            if !s.is_empty() {
                workspace_slugs.push(s.to_string());
            }
        }
    }
    workspace_slugs.sort();
    workspace_slugs.dedup();
    let mut out: Vec<RemoteRepo> = Vec::new();
    for ws in workspace_slugs {
        let repos_start = format!(
            "https://api.bitbucket.org/2.0/repositories/{ws}?pagelen=100"
        );
        let repo_values =
            bitbucket_collect_paginated_values(&client, &cred, &repos_start, host).await?;
        for v in repo_values {
            if let Some(repo) = bitbucket_remote_repo_from_value(&v) {
                out.push(repo);
            }
        }
    }
    out.sort_by(|a, b| a.full_name.cmp(&b.full_name));
    Ok(out)
}

#[derive(Serialize)]
pub struct CreatedRepo {
    pub clone_url: String,
    pub ssh_url: Option<String>,
    pub full_name: String,
    pub web_url: Option<String>,
}

fn validate_repo_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Repository-Name darf nicht leer sein.".into());
    }
    if name.len() > 100 {
        return Err("Repository-Name ist zu lang (max. 100 Zeichen).".into());
    }
    // Allow letters, digits and the characters commonly accepted as repo slugs.
    let ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if !ok {
        return Err(
            "Repository-Name darf nur Buchstaben, Ziffern sowie - _ . enthalten.".into(),
        );
    }
    Ok(())
}

async fn github_create(
    host: &str,
    name: &str,
    private: bool,
    description: Option<&str>,
) -> Result<CreatedRepo, String> {
    let cred = read_https_credential(host)?;
    let client = http_client()?;
    let url = format!("{}/user/repos", github_api_base(host));
    let mut body = serde_json::json!({
        "name": name,
        "private": private,
        "auto_init": false,
    });
    if let Some(d) = description.filter(|d| !d.is_empty()) {
        body["description"] = Value::String(d.to_string());
    }
    let res = client
        .post(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "l8git")
        .header("Authorization", format!("Bearer {}", cred.password))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GitHub: {e}"))?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "GitHub: 401. Bitte unter Einstellungen bei {host} anmelden."
        ));
    }
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| v["message"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| body.trim().to_string());
        return Err(format!("GitHub ({status}): {msg}"));
    }
    let v: Value = res.json().await.map_err(|e| format!("GitHub: {e}"))?;
    let clone_url = v["clone_url"].as_str().unwrap_or("").to_string();
    if clone_url.is_empty() {
        return Err("GitHub: Antwort enthielt keine Clone-URL.".into());
    }
    Ok(CreatedRepo {
        clone_url,
        ssh_url: v["ssh_url"].as_str().map(|s| s.to_string()),
        full_name: v["full_name"].as_str().unwrap_or(name).to_string(),
        web_url: v["html_url"].as_str().map(|s| s.to_string()),
    })
}

async fn gitlab_create(
    host: &str,
    name: &str,
    private: bool,
    description: Option<&str>,
) -> Result<CreatedRepo, String> {
    let cred = read_https_credential(host)?;
    let client = http_client()?;
    let base = format!("https://{host}");
    let url = format!("{}/api/v4/projects", base.trim_end_matches('/'));
    let mut body = serde_json::json!({
        "name": name,
        "visibility": if private { "private" } else { "public" },
    });
    if let Some(d) = description.filter(|d| !d.is_empty()) {
        body["description"] = Value::String(d.to_string());
    }
    let res = client
        .post(&url)
        .header("User-Agent", "l8git")
        .header("PRIVATE-TOKEN", cred.password)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GitLab: {e}"))?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "GitLab: 401. Bitte unter Einstellungen bei {host} anmelden."
        ));
    }
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| {
                v["message"]
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| v["error"].as_str().map(|s| s.to_string()))
            })
            .unwrap_or_else(|| body.trim().to_string());
        return Err(format!("GitLab ({status}): {msg}"));
    }
    let v: Value = res.json().await.map_err(|e| format!("GitLab: {e}"))?;
    let clone_url = v["http_url_to_repo"].as_str().unwrap_or("").to_string();
    if clone_url.is_empty() {
        return Err("GitLab: Antwort enthielt keine Clone-URL.".into());
    }
    Ok(CreatedRepo {
        clone_url,
        ssh_url: v["ssh_url_to_repo"].as_str().map(|s| s.to_string()),
        full_name: v["path_with_namespace"].as_str().unwrap_or(name).to_string(),
        web_url: v["web_url"].as_str().map(|s| s.to_string()),
    })
}

async fn bitbucket_first_workspace(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    host: &str,
) -> Result<String, String> {
    let workspaces_url = "https://api.bitbucket.org/2.0/user/workspaces?pagelen=100";
    let rows = bitbucket_collect_paginated_values(client, cred, workspaces_url, host).await?;
    for row in rows {
        if let Some(s) = row
            .get("workspace")
            .and_then(|w| w.get("slug"))
            .and_then(|s| s.as_str())
        {
            if !s.is_empty() {
                return Ok(s.to_string());
            }
        }
    }
    Err("Bitbucket: Kein Workspace gefunden, in dem das Repository angelegt werden könnte.".into())
}

async fn bitbucket_create(
    host: &str,
    name: &str,
    private: bool,
    description: Option<&str>,
) -> Result<CreatedRepo, String> {
    let cred = read_https_credential(host)?;
    let client = http_client()?;
    let workspace = bitbucket_first_workspace(&client, &cred, host).await?;
    // Bitbucket uses a slug in the URL; lowercase is the safest normalisation.
    let slug = name.to_ascii_lowercase();
    let url = format!("https://api.bitbucket.org/2.0/repositories/{workspace}/{slug}");
    let mut body = serde_json::json!({
        "scm": "git",
        "is_private": private,
        "name": name,
    });
    if let Some(d) = description.filter(|d| !d.is_empty()) {
        body["description"] = Value::String(d.to_string());
    }

    let basic_b64 = cred
        .username
        .as_ref()
        .filter(|u| !u.is_empty())
        .map(|user| {
            base64::engine::general_purpose::STANDARD
                .encode(format!("{user}:{}", cred.password))
        });
    let req = client
        .post(&url)
        .header("User-Agent", "l8git")
        .header("Accept", "application/json")
        .json(&body);
    let req = if let Some(ref b64) = basic_b64 {
        req.header("Authorization", format!("Basic {b64}"))
    } else if bitbucket_secret_likely_jwt(&cred.password) {
        req.header("Authorization", format!("Bearer {}", cred.password))
    } else {
        return Err(format!(
            "Bitbucket: Benutzername fehlt. Bitte unter Einstellungen bei {host} mit Benutzername und App-Passwort anmelden."
        ));
    };
    let res = req.send().await.map_err(|e| format!("Bitbucket: {e}"))?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "Bitbucket: 401. Bitte unter Einstellungen bei {host} anmelden."
        ));
    }
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| body.trim().to_string());
        return Err(format!("Bitbucket ({status}): {msg}"));
    }
    let v: Value = res.json().await.map_err(|e| format!("Bitbucket: {e}"))?;
    let repo = bitbucket_remote_repo_from_value(&v)
        .ok_or_else(|| "Bitbucket: Antwort enthielt keine Clone-URL.".to_string())?;
    let ssh_url = v["links"]["clone"].as_array().and_then(|clones| {
        clones.iter().find_map(|c| {
            if c["name"].as_str() == Some("ssh") {
                c["href"].as_str().map(|s| s.to_string())
            } else {
                None
            }
        })
    });
    let web_url = v["links"]["html"]["href"].as_str().map(|s| s.to_string());
    Ok(CreatedRepo {
        clone_url: repo.clone_url,
        ssh_url,
        full_name: repo.full_name,
        web_url,
    })
}

/// Create a new repository on the provider hosted at `host` and return its
/// clone URL so the caller can wire it up as a git remote.
#[tauri::command]
pub async fn create_remote_repo(
    host: String,
    name: String,
    private: bool,
    description: Option<String>,
) -> Result<CreatedRepo, String> {
    let h = host.trim();
    if h.is_empty() {
        return Err("Host darf nicht leer sein".into());
    }
    let name = name.trim().to_string();
    validate_repo_name(&name)?;
    let description = description.map(|d| d.trim().to_string());
    let desc = description.as_deref();
    if h.eq_ignore_ascii_case("dev.azure.com") {
        return Err(
            "Azure DevOps: Das Anlegen von Repositories wird hier noch nicht unterstützt.".into(),
        );
    }
    match crate::pr::detect_provider(h) {
        crate::pr::Provider::GitLab => gitlab_create(h, &name, private, desc).await,
        crate::pr::Provider::Bitbucket => bitbucket_create(h, &name, private, desc).await,
        crate::pr::Provider::GitHub | crate::pr::Provider::Gitea => {
            github_create(h, &name, private, desc).await
        }
        crate::pr::Provider::Unsupported => match github_create(h, &name, private, desc).await {
            Ok(repo) => Ok(repo),
            Err(_) => gitlab_create(h, &name, private, desc).await,
        },
    }
}

#[tauri::command]
pub async fn list_remote_repos(host: String) -> Result<Vec<RemoteRepo>, String> {
    let h = host.trim();
    if h.is_empty() {
        return Err("Host darf nicht leer sein".into());
    }
    if h.eq_ignore_ascii_case("dev.azure.com") {
        return Err("Azure DevOps: Repo-Liste wird hier noch nicht unterstützt.".into());
    }
    match crate::pr::detect_provider(h) {
        crate::pr::Provider::GitLab => gitlab_list(h).await,
        crate::pr::Provider::Bitbucket => bitbucket_list(h).await,
        crate::pr::Provider::GitHub | crate::pr::Provider::Gitea => github_list(h).await,
        crate::pr::Provider::Unsupported => match github_list(h).await {
            Ok(repos) => Ok(repos),
            Err(_) => gitlab_list(h).await,
        },
    }
}
