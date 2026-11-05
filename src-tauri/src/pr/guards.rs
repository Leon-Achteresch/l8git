//! Revision conditions shared by the actual provider requests and their race fixtures.
use super::*;
use std::future::Future;

fn full_sha(value: &str) -> Result<String, String> {
    if !matches!(value.len(), 40 | 64) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Expected a full 40- or 64-character commit SHA".into());
    }
    Ok(value.to_ascii_lowercase())
}

pub(super) fn merge_precondition(provider: Provider, expected: Option<&str>) -> Result<Option<String>, String> {
    let Some(expected) = expected else { return Ok(None); };
    let expected = full_sha(expected)?;
    if !matches!(provider, Provider::GitHub | Provider::GitLab) {
        return Err("This provider cannot condition a merge on the reviewed head SHA; pinned merge refused".into());
    }
    Ok(Some(expected))
}

/// The `sha` is checked by the provider in the merge mutation, not a racy preceding GET.
pub(super) async fn send_merge_request(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    provider: Provider,
    host: &str,
    url: &str,
    mut body: Value,
    expected_head: Option<&str>,
) -> Result<Value, String> {
    if let Some(expected) = merge_precondition(provider, expected_head)? {
        body["sha"] = Value::String(expected);
    }
    match provider {
        Provider::GitHub => {
            let response = github_request(client, cred, reqwest::Method::PUT, url, Some(body)).await?;
            github_read_json(response, host).await
        }
        Provider::GitLab => {
            let response = gl_request(client, cred, reqwest::Method::PUT, url, Some(body)).await?;
            gl_read_json(response, host).await
        }
        _ => Err("Unsupported conditional merge provider".into()),
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct PatchPins { head: String, base: String }

pub(super) fn patch_precondition(expected_head: Option<&str>, expected_base: Option<&str>) -> Result<Option<PatchPins>, String> {
    match (expected_head, expected_base) {
        (None, None) => Ok(None),
        (Some(head), Some(base)) => Ok(Some(PatchPins { head: full_sha(head)?, base: full_sha(base)? })),
        _ => Err("Pinned PR patches require both expected head and base SHAs".into()),
    }
}

pub(super) async fn read_github_patch_pins(client: &reqwest::Client, cred: &HttpsCredential, host: &str, url: &str) -> Result<PatchPins, String> {
    let response = github_request(client, cred, reqwest::Method::GET, url, None).await?;
    let detail = github_read_json(response, host).await?;
    Ok(PatchPins {
        head: full_sha(detail["head"]["sha"].as_str().ok_or("PR head revision is unavailable")?)?,
        base: full_sha(detail["base"]["sha"].as_str().ok_or("PR base revision is unavailable")?)?,
    })
}

/// Check before reading and again before returning. A late old request can never
/// be represented as a successful patch for a newer displayed revision.
pub(super) async fn with_pinned_patch<R, RF, P, PF>(expected: &PatchPins, mut read_revisions: R, read_patch: P) -> Result<Option<String>, String>
where
    R: FnMut() -> RF,
    RF: Future<Output = Result<PatchPins, String>>,
    P: FnOnce() -> PF,
    PF: Future<Output = Result<Option<String>, String>>,
{
    if read_revisions().await? != *expected { return Err("PR revisions changed before patch load; refresh the review".into()); }
    let patch = read_patch().await?;
    if read_revisions().await? != *expected { return Err("PR revisions changed while loading the patch; stale result discarded".into()); }
    Ok(patch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn credential() -> HttpsCredential { HttpsCredential { username: None, password: "fixture-not-a-secret".into() } }
    fn client() -> reqwest::Client { reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(5)).build().unwrap() }
    fn request(stream: &mut TcpStream) -> (String, Value) {
        stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut bytes = Vec::new();
        let boundary = loop {
            let mut buffer = [0u8; 1024];
            let count = stream.read(&mut buffer).unwrap();
            assert!(count > 0, "HTTP request ended before headers");
            bytes.extend_from_slice(&buffer[..count]);
            assert!(bytes.len() < 64 * 1024);
            if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") { break index + 4; }
        };
        let headers = String::from_utf8(bytes[..boundary].to_vec()).unwrap();
        let size = headers.lines().filter_map(|line| line.split_once(':'))
            .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
            .map(|(_, value)| value.trim().parse::<usize>().unwrap()).unwrap_or(0);
        while bytes.len() < boundary + size {
            let mut buffer = [0u8; 1024]; let count = stream.read(&mut buffer).unwrap();
            assert!(count > 0); bytes.extend_from_slice(&buffer[..count]);
        }
        let body = if size == 0 { Value::Null } else { serde_json::from_slice(&bytes[boundary..boundary + size]).unwrap() };
        (headers.lines().next().unwrap().to_string(), body)
    }
    fn server<F>(count: usize, mut respond: F) -> (String, std::thread::JoinHandle<()>)
    where F: FnMut(usize, String, Value) -> (u16, Value) + Send + 'static {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let thread = std::thread::spawn(move || {
            for index in 0..count {
                let deadline = Instant::now() + Duration::from_secs(8);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(Instant::now() < deadline, "Expected HTTP request was never sent");
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        Err(error) => panic!("{error}"),
                    }
                };
                let (line, request) = request(&mut stream);
                let (status, body) = respond(index, line, request);
                let body = body.to_string();
                write!(stream, "HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            }
        });
        (url, thread)
    }

    #[tokio::test]
    async fn provider_rejects_push_between_read_and_conditional_merge_before_mutation() {
        for provider in [Provider::GitHub, Provider::GitLab] {
            let merged = Arc::new(AtomicUsize::new(0)); let counter = merged.clone();
            let reviewed = "a".repeat(40); let expected = reviewed.clone();
            let pushed = "b".repeat(40);
            let (url, server) = server(2, move |index, line, body| {
                if index == 0 {
                    assert!(line.starts_with("GET "));
                    // The provider advances from A to B immediately after this read.
                    return (200, json!({"head":{"sha":reviewed}}));
                }
                assert!(line.starts_with("PUT "));
                assert_eq!(body["sha"], expected, "actual merge request must carry the reviewed SHA");
                if body["sha"].as_str() != Some(pushed.as_str()) {
                    return (409, json!({"message":"SHA does not match HEAD of source branch"}));
                }
                counter.fetch_add(1, Ordering::SeqCst);
                (200, json!({"merged":true,"state":"merged","sha":pushed}))
            });
            let client = client();
            let read: Value = client.get(format!("{url}/pulls/1")).send().await.unwrap().json().await.unwrap();
            let result = send_merge_request(&client, &credential(), provider, "fixture", &format!("{url}/pulls/1/merge"), json!({"merge_method":"merge"}), read["head"]["sha"].as_str()).await;
            assert!(result.unwrap_err().contains("409"));
            server.join().unwrap();
            assert_eq!(merged.load(Ordering::SeqCst), 0, "unreviewed B must never merge");
        }
    }

    #[tokio::test]
    async fn unchanged_heads_merge_and_legacy_requests_do_not_gain_a_precondition() {
        for pinned in [true, false] {
            let head = "a".repeat(40); let expected = head.clone();
            let (url, server) = server(1, move |_, _, body| {
                if pinned { assert_eq!(body["sha"], expected); }
                else { assert!(body.get("sha").is_none()); }
                (200, json!({"merged":true,"sha":expected}))
            });
            let result = send_merge_request(&client(), &credential(), Provider::GitHub, "fixture", &url, json!({"merge_method":"squash"}), pinned.then_some(head.as_str())).await.unwrap();
            assert_eq!(result["merged"], true); server.join().unwrap();
        }
    }

    #[test]
    fn invalid_or_unsupported_pins_fail_closed_and_legacy_pins_are_optional() {
        for invalid in ["main", "", "a123", &"a".repeat(41), &"z".repeat(40)] {
            assert!(merge_precondition(Provider::GitHub, Some(invalid)).is_err());
        }
        assert_eq!(merge_precondition(Provider::GitHub, Some(&"A".repeat(64))).unwrap(), Some("a".repeat(64)));
        for provider in [Provider::Gitea, Provider::Bitbucket, Provider::Unsupported] {
            assert!(merge_precondition(provider, Some(&"a".repeat(40))).is_err());
            assert!(merge_precondition(provider, None).unwrap().is_none());
        }
        assert!(patch_precondition(Some(&"a".repeat(40)), None).is_err());
        assert!(patch_precondition(None, Some(&"b".repeat(40))).is_err());
        assert!(patch_precondition(None, None).unwrap().is_none());
    }

    #[tokio::test]
    async fn pinned_patch_checks_actual_http_revisions_before_and_after_loading() {
        for drift in ["none", "head", "base"] {
            let head = "a".repeat(40); let base = "c".repeat(40);
            let expected = patch_precondition(Some(&head), Some(&base)).unwrap().unwrap();
            let (url, server) = server(3, move |index, line, _| {
                if index == 1 {
                    assert!(line.contains("/files "));
                    return (200, json!([{"filename":"f.ts","patch":"@@ old patch"}]));
                }
                assert!(line.contains("/pulls/1 "));
                let head = if index == 2 && drift == "head" { "b".repeat(40) } else { head.clone() };
                let base = if index == 2 && drift == "base" { "d".repeat(40) } else { base.clone() };
                (200, json!({"head":{"sha":head},"base":{"sha":base}}))
            });
            let client = client(); let cred = credential();
            let detail_url = format!("{url}/pulls/1"); let patch_url = format!("{url}/pulls/1/files");
            let result = with_pinned_patch(&expected,
                || read_github_patch_pins(&client, &cred, "fixture", &detail_url),
                || async {
                    let response = github_request(&client, &cred, reqwest::Method::GET, &patch_url, None).await?;
                    let files = github_read_json(response, "fixture").await?;
                    Ok(files[0]["patch"].as_str().map(str::to_string))
                },
            ).await;
            if drift == "none" { assert_eq!(result.unwrap(), Some("@@ old patch".into())); }
            else { assert!(result.unwrap_err().contains("stale result discarded")); }
            server.join().unwrap();
        }
    }

    #[tokio::test]
    async fn stale_revision_preflight_never_loads_a_patch() {
        let expected = patch_precondition(Some(&"a".repeat(40)), Some(&"c".repeat(40))).unwrap().unwrap();
        let (url, server) = server(1, |_, _, _| (200, json!({"head":{"sha":"b".repeat(40)},"base":{"sha":"c".repeat(40)}})));
        let client = client(); let cred = credential();
        let result = with_pinned_patch(&expected,
            || read_github_patch_pins(&client, &cred, "fixture", &url),
            || async { panic!("stale preflight must not request a patch"); },
        ).await;
        assert!(result.unwrap_err().contains("before patch load")); server.join().unwrap();
    }
}
