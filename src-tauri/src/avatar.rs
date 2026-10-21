//! `avatar://localhost/<url-encoded https URL>` serves avatars from known avatar CDNs through Rust, so the
//! webview never opens HTTPS connections for them: WebKit's network process would load its TLS/HTTP stack
//! (about 9 MB with a repo open) just for the history's avatars. Cached on disk in the app cache dir.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::{Duration, SystemTime};

use sha2::{Digest, Sha256};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

/// Dedicated avatar CDNs only, so the scheme is no open proxy. Must match PROXIED_HOSTS in
/// src/lib/avatar-src.ts; other hosts (self-hosted GitLab/Gitea/GHE) load directly in the webview.
const HOSTS: &[&str] = &[
    "www.gravatar.com",
    "secure.gravatar.com",
    "gravatar.com",
    "avatars.githubusercontent.com",
    // Bitbucket's Gravatar URLs redirect here for users without a Gravatar.
    "avatar-management--avatars.us-west-2.prod.public.atl-paas.net",
];
const MAX_BYTES: usize = 1 << 20;
const FRESH: Duration = Duration::from_secs(24 * 3600);
/// A 404 (no Gravatar for this email) is rechecked sooner than a found image is refreshed.
const MISSING_FRESH: Duration = Duration::from_secs(3600);
const PRUNE_AFTER: Duration = Duration::from_secs(30 * 24 * 3600);

/// `Some(image)` or `None` for "this avatar does not exist".
type Entry = Option<(String, Vec<u8>)>;

fn allowed(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|host| HOSTS.contains(&host))
}

fn parse(path: &str) -> Option<reqwest::Url> {
    let raw = percent_encoding::percent_decode_str(path.trim_start_matches('/')).decode_utf8().ok()?;
    reqwest::Url::parse(&raw).ok().filter(allowed)
}

/// Built on demand and dropped once no fetch holds it: its CA store and pooled TLS connections cost the UI
/// process about 2 MB, and the disk cache leaves only rare bursts of fetches.
fn client() -> Option<Arc<reqwest::Client>> {
    static CLIENT: Mutex<Weak<reqwest::Client>> = Mutex::new(Weak::new());
    let mut slot = CLIENT.lock().ok()?;
    if let Some(client) = slot.upgrade() {
        return Some(client);
    }
    let client = Arc::new(
        reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent(concat!("l8git/", env!("CARGO_PKG_VERSION")))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && allowed(attempt.url()) {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
            .ok()?,
    );
    *slot = Arc::downgrade(&client);
    Some(client)
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let dir = ctx.app_handle().path().app_cache_dir().ok().map(|dir| dir.join("avatars"));
    let url = parse(request.uri().path());
    tauri::async_runtime::spawn(async move {
        let response = match url {
            None => status(StatusCode::FORBIDDEN),
            Some(url) => match serve(dir.as_deref(), url).await {
                Some(Some((content_type, body))) => Response::builder()
                    .header(header::CONTENT_TYPE, content_type)
                    // Lets WebKit's memory cache serve rows that remount while scrolling without a round trip.
                    .header(header::CACHE_CONTROL, "max-age=3600")
                    .body(body)
                    .unwrap_or_else(|_| status(StatusCode::BAD_GATEWAY)),
                Some(None) => status(StatusCode::NOT_FOUND),
                None => status(StatusCode::BAD_GATEWAY),
            },
        };
        responder.respond(response);
    });
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = code;
    response
}

/// One fetch per URL at a time: a history view asks for the same author's avatar from many rows at once.
async fn serve(dir: Option<&Path>, url: reqwest::Url) -> Option<Entry> {
    static INFLIGHT: OnceLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    let inflight = INFLIGHT.get_or_init(Default::default);
    let key = Sha256::digest(url.as_str()).iter().map(|b| format!("{b:02x}")).collect::<String>();
    let lock = inflight.lock().ok()?.entry(key.clone()).or_default().clone();
    let entry = {
        let _turn = lock.lock().await;
        load_or_fetch(dir.map(|dir| dir.join(&key)), url).await
    };
    if let Ok(mut map) = inflight.lock() {
        // Only the map and this task hold it: nobody is waiting for this URL.
        if Arc::strong_count(&lock) == 2 {
            map.remove(&key);
        }
    }
    entry
}

async fn load_or_fetch(path: Option<PathBuf>, url: reqwest::Url) -> Option<Entry> {
    let cached = path.as_deref().and_then(read_entry);
    if let Some((age, entry)) = &cached {
        if *age < if entry.is_some() { FRESH } else { MISSING_FRESH } {
            return Some(entry.clone());
        }
    }
    match fetch(url).await {
        Some(entry) => {
            if let Some(path) = &path {
                write_entry(path, &entry);
            }
            Some(entry)
        }
        // Offline or the host failed: a stale copy beats no avatar.
        None => cached.map(|(_, entry)| entry),
    }
}

async fn fetch(url: reqwest::Url) -> Option<Entry> {
    // Taken before queueing, so the client lives through a whole burst of avatars.
    let client = client()?;
    // WebKit's per-host connection limit, for all hosts together: a long history opens no dozens of TLS sessions.
    static PERMITS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(6);
    let _permit = PERMITS.acquire().await.ok()?;
    let mut response = client.get(url).send().await.ok()?;
    if matches!(response.status(), StatusCode::NOT_FOUND | StatusCode::GONE) {
        return Some(None);
    }
    let content_type = response.headers().get(header::CONTENT_TYPE)?.to_str().ok()?.to_ascii_lowercase();
    if !response.status().is_success()
        || !content_type.starts_with("image/")
        // SVG can carry script; no avatar CDN serves it.
        || content_type.starts_with("image/svg")
        || response.content_length().is_some_and(|len| len > MAX_BYTES as u64)
    {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BYTES {
            return None;
        }
    }
    Some(Some((content_type, body)))
}

/// File format: empty = missing avatar, else `<content type>\n<image bytes>`.
fn read_entry(path: &Path) -> Option<(Duration, Entry)> {
    let age = std::fs::metadata(path).ok()?.modified().ok()?.elapsed().unwrap_or_default();
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() {
        return Some((age, None));
    }
    let split = bytes.iter().position(|&b| b == b'\n')?;
    let content_type = String::from_utf8(bytes[..split].to_vec()).ok()?;
    Some((age, Some((content_type, bytes[split + 1..].to_vec()))))
}

fn write_entry(path: &Path, entry: &Entry) {
    let Some(dir) = path.parent() else { return };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    static PRUNED: std::sync::Once = std::sync::Once::new();
    PRUNED.call_once(|| prune(dir));
    let bytes = match entry {
        None => Vec::new(),
        Some((content_type, body)) => [content_type.as_bytes(), b"\n", body].concat(),
    };
    // Write then rename, so a concurrent reader never sees half a file.
    let tmp = path.with_extension("tmp");
    if std::fs::write(&tmp, bytes).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Avatars not refreshed for a month belong to authors no longer viewed.
fn prune(dir: &Path) {
    let now = SystemTime::now();
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let old = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .is_ok_and(|modified| now.duration_since(modified).unwrap_or_default() > PRUNE_AFTER);
        if old {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_avatar_hosts_pass() {
        let ok = |url: &str| parse(&format!("/{}", url.replace(':', "%3A").replace('/', "%2F").replace('?', "%3F")));
        assert!(ok("https://www.gravatar.com/avatar/ab?s=64&d=404").is_some());
        assert!(ok("https://avatars.githubusercontent.com/u/1?v=4").is_some());
        assert!(ok("https://avatars.githubusercontent.com:443/u/1").is_some());
        assert!(ok("http://www.gravatar.com/avatar/ab").is_none());
        assert!(ok("https://evil.example/avatar").is_none());
        assert!(ok("https://www.gravatar.com.evil.example/x").is_none());
        assert!(ok("https://user@www.gravatar.com/x").is_none());
        assert!(ok("https://www.gravatar.com:8443/x").is_none());
        assert!(ok("file:///etc/passwd").is_none());
        assert!(parse("/not a url").is_none());
    }

    #[test]
    fn entries_round_trip() {
        let dir = std::env::temp_dir().join(format!("l8git-avatar-test-{}", std::process::id()));
        let path = dir.join("entry");
        write_entry(&path, &Some(("image/png".into(), vec![1, b'\n', 2])));
        assert_eq!(read_entry(&path).unwrap().1, Some(("image/png".into(), vec![1, b'\n', 2])));
        write_entry(&path, &None);
        assert_eq!(read_entry(&path).unwrap().1, None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
