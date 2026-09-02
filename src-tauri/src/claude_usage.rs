use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

const OAUTH_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";
const USER_AGENT: &str = "claude-code/2.1.0";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "Claude Code-credentials";
#[cfg(target_os = "macos")]
const KEYCHAIN_FALLBACK_USER: &str = "claude-code-user";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUsageFetch {
    pub status: String,
    pub http_status: Option<u16>,
    pub body: Option<String>,
    pub error: Option<String>,
}

fn usage_result(
    status: &str,
    http_status: Option<u16>,
    body: Option<String>,
    error: Option<String>,
) -> ClaudeUsageFetch {
    ClaudeUsageFetch {
        status: status.into(),
        http_status,
        body,
        error,
    }
}

/// Reads the Claude Code OAuth token from the local credential store and asks
/// Anthropic for the 5-hour and weekly usage windows. The token never leaves
/// this process.
#[tauri::command]
pub async fn fetch_claude_usage() -> Result<ClaudeUsageFetch, String> {
    let Some(token) = read_claude_access_token() else {
        return Ok(usage_result(
            "unavailable",
            None,
            None,
            Some("Claude not signed in".into()),
        ));
    };

    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    let client = CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(HTTP_TIMEOUT)
            .build()
            .unwrap_or_default()
    });

    let response = client
        .get(OAUTH_USAGE_URL)
        .header("Authorization", format!("Bearer {token}"))
        .header("anthropic-beta", OAUTH_BETA)
        .header("User-Agent", USER_AGENT)
        .send()
        .await;

    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            if (200..300).contains(&status) {
                let body = response.text().await.unwrap_or_default();
                Ok(usage_result("ok", Some(status), Some(body), None))
            } else {
                Ok(usage_error(status))
            }
        }
        Err(error) => Ok(usage_result(
            "error",
            None,
            None,
            Some(format!("Claude usage request failed: {error}")),
        )),
    }
}

fn usage_error(status: u16) -> ClaudeUsageFetch {
    let message = if status == 401 {
        "Claude sign-in expired".to_string()
    } else if status == 403 {
        "Claude usage is unavailable for this account".to_string()
    } else {
        format!("Claude usage request failed ({status})")
    };
    usage_result("error", Some(status), None, Some(message))
}

fn read_claude_access_token() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(raw) = read_macos_keychain_blob() {
            if let Some(token) = extract_access_token(&raw) {
                return Some(token);
            }
        }
    }
    let path = claude_credentials_path()?;
    let raw = std::fs::read_to_string(path).ok()?;
    extract_access_token(&raw)
}

fn claude_credentials_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".claude/.credentials.json"))
}

pub(crate) fn extract_access_token(raw: &str) -> Option<String> {
    let value: Value = serde_json::from_str(raw.trim()).ok()?;
    let token = value
        .get("claudeAiOauth")
        .and_then(|oauth| oauth.get("accessToken"))
        .or_else(|| value.get("accessToken"))
        .and_then(Value::as_str)?
        .trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

#[cfg(target_os = "macos")]
fn read_macos_keychain_blob() -> Option<String> {
    let user = std::env::var("USER").unwrap_or_default();
    let accounts = [user.as_str(), KEYCHAIN_FALLBACK_USER];
    for account in accounts {
        if account.is_empty() {
            continue;
        }
        let output = std::process::Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                KEYCHAIN_SERVICE,
                "-a",
                account,
                "-w",
            ])
            .output();
        let Ok(output) = output else {
            continue;
        };
        if output.status.success() {
            let secret = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !secret.is_empty() {
                return Some(secret);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_token_from_oauth_blob() {
        let raw = r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat-abc"}}"#;
        assert_eq!(extract_access_token(raw).as_deref(), Some("sk-ant-oat-abc"));
    }

    #[test]
    fn reads_token_from_flat_blob() {
        assert_eq!(
            extract_access_token(r#"{"accessToken":"token-1"}"#).as_deref(),
            Some("token-1")
        );
    }

    #[test]
    fn rejects_blank_and_invalid() {
        assert_eq!(extract_access_token(r#"{"accessToken":"  "}"#), None);
        assert_eq!(extract_access_token("not json"), None);
    }
}
