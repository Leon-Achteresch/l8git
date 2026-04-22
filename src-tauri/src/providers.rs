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
    let mut out: Vec<Value> = Vec::new();
    let mut next: Option<String> = Some(start_url.to_string());
    let mut pages = 0usize;
    while let Some(url) = next.take() {
        pages += 1;
        if pages > MAX_PAGES {
            return Err("Bitbucket: Seitenlimit bei der API-Pagination erreicht.".into());
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
    let url = "https://api.github.com/user/repos?per_page=100&sort=updated";
    let res = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "l8git")
        .header(
            "Authorization",
            format!("Bearer {}", cred.password),
        )
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
    let arr: Vec<Value> = res.json().await.map_err(|e| format!("GitHub: {e}"))?;
    let mut out = Vec::new();
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

#[tauri::command]
pub async fn list_remote_repos(host: String) -> Result<Vec<RemoteRepo>, String> {
    let h = host.trim();
    if h.is_empty() {
        return Err("Host darf nicht leer sein".into());
    }
    let host_lc = h.to_ascii_lowercase();
    match host_lc.as_str() {
        "github.com" => github_list(h).await,
        "bitbucket.org" => bitbucket_list(h).await,
        "dev.azure.com" => Err(
            "Azure DevOps: Repo-Liste wird hier noch nicht unterstützt.".into(),
        ),
        _ => gitlab_list(h).await,
    }
}
