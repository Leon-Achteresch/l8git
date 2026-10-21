//! `avatar://localhost/<url-encoded https URL>` serves avatars from known avatar CDNs through Rust, so the
//! webview never opens HTTPS connections for them: WebKit's network process would load its TLS/HTTP stack
//! (about 9 MB with a repo open) just for the history's avatars. Cached on disk in the app cache dir.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::{Duration, Instant, SystemTime};

use sha2::{Digest, Sha256};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

/// Dedicated avatar CDNs only, so the scheme is no open proxy (their redirects may leave them, see
/// `public_https`). Must match PROXIED_HOSTS in src/lib/avatar-src.ts; other hosts (self-hosted GitLab/Gitea/GHE)
/// load directly in the webview.
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
/// How long a failed fetch (or an image the disk cache could not keep) answers for its URL, so a hanging host
/// or a full disk doesn't mean a fetch per row.
const HOLD_FOR: Duration = Duration::from_secs(60);

/// `Some(image)` or `None` for "this avatar does not exist".
type Entry = Option<(String, Vec<u8>)>;

/// Where a redirect may lead: https on the default port without credentials, and not to this machine or the
/// local network by address, which Rust could reach outside the webview's rules.
fn public_https(url: &reqwest::Url) -> bool {
    let Some(host) = url.host_str() else { return false };
    let public = match host.trim_start_matches('[').trim_end_matches(']').parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V4(ip)) => {
            !(ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified() || ip.is_broadcast())
        }
        // Loopback, unspecified, unique local (fc00::/7), link-local (fe80::/10) and IPv4-mapped.
        Ok(std::net::IpAddr::V6(ip)) => {
            let first = ip.segments()[0];
            !(ip.is_loopback() || ip.is_unspecified() || first & 0xfe00 == 0xfc00 || first & 0xffc0 == 0xfe80)
                && ip.to_ipv4_mapped().is_none()
        }
        Err(_) => host != "localhost" && !host.ends_with(".localhost"),
    };
    public && url.scheme() == "https" && url.port().is_none() && url.username().is_empty() && url.password().is_none()
}

fn allowed(url: &reqwest::Url) -> bool {
    public_https(url) && url.host_str().is_some_and(|host| HOSTS.contains(&host))
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
            // Follows what the webview followed before: Gravatar sends `d=<url>` defaults through i*.wp.com.
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && public_https(attempt.url()) {
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
            Some(url) => match serve(dir, url).await {
                Some((Some((content_type, body)), fresh)) => {
                    Response::builder()
                        .header(header::CONTENT_TYPE, content_type)
                        // Lets WebKit's memory cache serve rows that remount while scrolling without a round trip;
                        // a stale copy only until the background refresh (or its held failure) is through.
                        .header(header::CACHE_CONTROL, if fresh { "max-age=3600" } else { "max-age=60" })
                        .body(body)
                        .unwrap_or_else(|_| status(StatusCode::BAD_GATEWAY))
                }
                Some((None, _)) => status(StatusCode::NOT_FOUND),
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

/// The avatar and whether it is fresh. A stale copy is served at once while it is refreshed in the background.
async fn serve(dir: Option<PathBuf>, url: reqwest::Url) -> Option<(Entry, bool)> {
    let key = Sha256::digest(url.as_str()).iter().map(|b| format!("{b:02x}")).collect::<String>();
    if let Some(dir) = &dir {
        static PRUNED: std::sync::Once = std::sync::Once::new();
        PRUNED.call_once(|| {
            let dir = dir.clone();
            tokio::task::spawn_blocking(move || prune(&dir));
        });
    }
    let path = dir.map(|dir| dir.join(&key));
    let cached = match path.clone() {
        Some(path) => tokio::task::spawn_blocking(move || read_entry(&path)).await.ok().flatten(),
        None => None,
    };
    if let Some((age, entry)) = cached {
        let fresh = age < if entry.is_some() { FRESH } else { MISSING_FRESH };
        if !fresh {
            tauri::async_runtime::spawn(fetch_shared(key, path, url));
        }
        return Some((entry, fresh));
    }
    fetch_shared(key, path, url).await.map(|entry| (entry, true))
}

/// One fetch per URL at a time: a history view asks for the same author's avatar from many rows at once, and
/// they all get its result.
async fn fetch_shared(key: String, path: Option<PathBuf>, url: reqwest::Url) -> Option<Entry> {
    static INFLIGHT: OnceLock<Shared<Option<Entry>>> = OnceLock::new();
    let fetch = || async move {
        let entry = fetch_url(url).await;
        let saved = match (entry.clone(), path) {
            (Some(entry), Some(path)) => {
                tokio::task::spawn_blocking(move || write_entry(&path, &entry)).await.unwrap_or(false)
            }
            _ => false,
        };
        (entry, !saved)
    };
    INFLIGHT.get_or_init(|| Shared::new(HOLD_FOR)).get(key, fetch).await
}

/// Fetches shared by key: callers asking while one runs get its result. A result marked "hold" keeps answering
/// for `hold` after it arrived; others leave once done, so the next caller fetches (or reads the disk) again.
struct Shared<T> {
    hold: Duration,
    map: Mutex<HashMap<String, (Instant, Arc<tokio::sync::OnceCell<(T, bool)>>)>>,
}

impl<T: Clone> Shared<T> {
    fn new(hold: Duration) -> Self {
        Self { hold, map: Mutex::default() }
    }

    async fn get<F: std::future::Future<Output = (T, bool)>>(&'static self, key: String, fetch: impl FnOnce() -> F) -> T
    where
        T: Send + Sync,
    {
        let cell = {
            let Ok(mut map) = self.map.lock() else { return fetch().await.0 };
            map.retain(|_, (since, cell)| cell.get().is_none() || since.elapsed() < self.hold);
            map.entry(key.clone()).or_insert_with(|| (Instant::now(), Default::default())).1.clone()
        };
        let mut ran = false;
        let (value, hold) = cell
            .get_or_init(|| {
                ran = true;
                fetch()
            })
            .await
            .clone();
        // Only the caller that fetched dates the result, so steady requests don't keep a failure alive.
        if ran {
            if let Ok(mut map) = self.map.lock() {
                if map.get(&key).is_some_and(|(_, current)| Arc::ptr_eq(current, &cell)) {
                    if hold {
                        map.insert(key, (Instant::now(), cell));
                        // Held images would otherwise stay until the next request.
                        tokio::spawn(async move {
                            tokio::time::sleep(self.hold).await;
                            if let Ok(mut map) = self.map.lock() {
                                map.retain(|_, (since, cell)| cell.get().is_none() || since.elapsed() < self.hold);
                            }
                        });
                    } else {
                        map.remove(&key);
                    }
                }
            }
        }
        value
    }
}

async fn fetch_url(url: reqwest::Url) -> Option<Entry> {
    // Taken before queueing, so the client lives through a whole burst of avatars.
    let client = client()?;
    // WebKit's per-host connection limit, for all hosts together: a long history opens no dozens of TLS sessions.
    static PERMITS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(6);
    let _permit = PERMITS.acquire().await.ok()?;
    let mut response = client.get(url).send().await.ok()?;
    if matches!(response.status(), StatusCode::NOT_FOUND | StatusCode::GONE) {
        return Some(None);
    }
    if !response.status().is_success() || response.content_length().is_some_and(|len| len > MAX_BYTES as u64) {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BYTES {
            return None;
        }
    }
    // Like WebKit's image decoders, trust the bytes over the declared type. No SVG: it can carry script, and
    // redirects may come from any public host.
    Some(Some((sniff(&body)?.to_owned(), body)))
}

fn sniff(body: &[u8]) -> Option<&'static str> {
    let at = |offset: usize, magic: &[u8]| body.get(offset..offset + magic.len()) == Some(magic);
    Some(match () {
        _ if at(0, b"\x89PNG\r\n\x1a\n") => "image/png",
        _ if at(0, b"\xff\xd8\xff") => "image/jpeg",
        _ if at(0, b"GIF8") => "image/gif",
        _ if at(0, b"RIFF") && at(8, b"WEBP") => "image/webp",
        // shortcut: AVIF only by its "avif" brand (not mif1/avis); add brands if such avatars show initials.
        _ if at(4, b"ftypavif") => "image/avif",
        _ if at(0, b"\0\0\x01\0") => "image/x-icon",
        _ if at(0, b"BM") => "image/bmp",
        _ => return None,
    })
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

fn write_entry(path: &Path, entry: &Entry) -> bool {
    let Some(dir) = path.parent() else { return false };
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let bytes = match entry {
        None => Vec::new(),
        Some((content_type, body)) => [content_type.as_bytes(), b"\n", body].concat(),
    };
    // Write then rename, so a concurrent reader never sees half a file.
    let tmp = path.with_extension("tmp");
    let saved = std::fs::write(&tmp, bytes).is_ok() && std::fs::rename(&tmp, path).is_ok();
    if !saved {
        let _ = std::fs::remove_file(&tmp);
    }
    saved
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
        // Redirects may leave the CDNs, but only to what the webview could load itself.
        assert!(public_https(&reqwest::Url::parse("https://i0.wp.com/x.png").unwrap()));
        assert!(!public_https(&reqwest::Url::parse("http://i0.wp.com/x.png").unwrap()));
        assert!(!public_https(&reqwest::Url::parse("https://127.0.0.1:8080/x").unwrap()));
        for local in ["https://127.0.0.1/x", "https://192.168.1.1/x", "https://169.254.169.254/x", "https://[::1]/x", "https://[fd00::1]/x", "https://[::ffff:10.0.0.1]/x", "https://localhost/x"] {
            assert!(!public_https(&reqwest::Url::parse(local).unwrap()), "{local}");
        }
        assert!(public_https(&reqwest::Url::parse("https://8.8.8.8/x").unwrap()));
    }

    #[test]
    fn hosts_match_the_frontend() {
        let ts = include_str!("../../src/lib/avatar-src.ts");
        let list = &ts[ts.find("new Set([").unwrap()..];
        let list = &list[..list.find("])").unwrap()];
        let ts_hosts = list.split('"').skip(1).step_by(2).collect::<Vec<_>>();
        assert_eq!(ts_hosts, HOSTS);
    }

    #[test]
    fn sniffs_image_bytes() {
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
        assert_eq!(sniff(b"\xff\xd8\xff\xe0"), Some("image/jpeg"));
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff(b"<html>"), None);
        assert_eq!(sniff(b""), None);
    }

    #[tokio::test]
    async fn shared_fetches_run_once_and_held_results_answer_until_they_expire() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let calls = AtomicUsize::new(0);
        let fetch = |value: u8, hold: bool| {
            let calls = &calls;
            move || async move {
                calls.fetch_add(1, Ordering::SeqCst);
                tokio::task::yield_now().await;
                (value, hold)
            }
        };
        let shared: &'static _ = Box::leak(Box::new(Shared::new(Duration::from_secs(60))));
        let (a, b) = tokio::join!(shared.get("k".into(), fetch(1, false)), shared.get("k".into(), fetch(2, false)));
        assert_eq!((a, b, calls.load(Ordering::SeqCst)), (1, 1, 1));
        // Done and not held: the next caller fetches again.
        assert_eq!(shared.get("k".into(), fetch(3, false)).await, 3);
        // Held (a failure, or an image the disk could not keep): answers without fetching.
        assert_eq!(shared.get("f".into(), fetch(4, true)).await, 4);
        assert_eq!(shared.get("f".into(), fetch(5, true)).await, 4);
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        let expired: &'static _ = Box::leak(Box::new(Shared::new(Duration::ZERO)));
        assert_eq!(expired.get("f".into(), fetch(6, true)).await, 6);
        assert_eq!(expired.get("f".into(), fetch(7, true)).await, 7);
    }

    #[test]
    fn entries_round_trip() {
        let dir = std::env::temp_dir().join(format!("l8git-avatar-test-{}", std::process::id()));
        let path = dir.join("entry");
        assert!(write_entry(&path, &Some(("image/png".into(), vec![1, b'\n', 2]))));
        assert_eq!(read_entry(&path).unwrap().1, Some(("image/png".into(), vec![1, b'\n', 2])));
        write_entry(&path, &None);
        assert_eq!(read_entry(&path).unwrap().1, None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
