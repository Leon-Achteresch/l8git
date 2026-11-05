//! Provider-specific HTTP reads and response mapping. Shared IPC models live in the parent.
use super::*;

pub(super) async fn github_request(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> Result<reqwest::Response, String> {
    let mut req = client
        .request(method, url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "l8git")
        .header("Authorization", format!("Bearer {}", cred.password));
    if let Some(b) = body {
        req = req.json(&b);
    }
    req.send().await.map_err(|e| format!("GitHub: {e}"))
}

pub(super) async fn github_read_json(res: reqwest::Response, host: &str) -> Result<Value, String> {
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!("GitHub: 401. Bitte unter Einstellungen bei {host} anmelden."));
    }
    if !res.status().is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&res) { return Err(error); }
        let status = res.status();
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        // Detect SAML SSO enforcement (GitHub Enterprise + github.com orgs with SAML)
        if status == reqwest::StatusCode::FORBIDDEN
            && (body.contains("SAML enforcement")
                || body.contains("saml_enforcement")
                || body.contains("organization SAML"))
        {
            return Err(format!(
                "GitHub 403: Das Personal Access Token ist nicht für SAML Single Sign-On autorisiert. \
                Bitte das Token unter {host} → Settings → Applications → Authorized OAuth Apps \
                für die Organisation freischalten."
            ));
        }
        return Err(format!("GitHub {status}: {}", body.trim()));
    }
    res.json::<Value>().await.map_err(|e| format!("GitHub: {e}"))
}

pub fn gh_map_pr(v: &Value) -> PullRequest {
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
        node_id: v["node_id"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string()),
    }
}

pub(super) async fn gh_detail(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PullRequestDetail, String> {
    let url = github_repo_api_url(h, &format!("pulls/{number}"));
    let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
    let v = github_read_json(res, &h.host).await?;
    let base = gh_map_pr(&v);
    Ok(PullRequestDetail {
        body_markdown: v["body"].as_str().unwrap_or("").to_string(),
        mergeable: v["mergeable"].as_bool(),
        merge_commit_sha: v["merge_commit_sha"].as_str().map(|s| s.to_string()),
        head_sha: str_or_empty(&v["head"]["sha"]),
        auto_merge_method: v["auto_merge"]["merge_method"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        base,
    })
}

pub(super) async fn gh_commits(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCommit>, String> {
    let fetch = |page: u64| async move {
        let url = github_repo_api_url(
            h,
            &format!("pulls/{number}/commits?per_page=100&page={page}"),
        );
        let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
        let v = github_read_json(res, &h.host).await?;
        Ok::<Vec<Value>, String>(v.as_array().cloned().unwrap_or_default())
    };
    let mut out = Vec::new();
    const MAX_PAGES: u64 = 20;
    let mut start: u64 = 1;
    'outer: while start <= MAX_PAGES {
        let (r1, r2, r3) = tokio::join!(fetch(start), fetch(start + 1), fetch(start + 2));
        let pages = [(start, r1), (start + 1, r2), (start + 2, r3)];
        for (page, r) in pages {
            if page > MAX_PAGES {
                break;
            }
            let arr = r?;
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
                break 'outer;
            }
        }
        start += 3;
    }
    Ok(out)
}

pub(super) async fn gh_files(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrFile>, String> {
    let fetch = |page: u64| async move {
        let url = github_repo_api_url(
            h,
            &format!("pulls/{number}/files?per_page=100&page={page}"),
        );
        let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
        let v = github_read_json(res, &h.host).await?;
        Ok::<Vec<Value>, String>(v.as_array().cloned().unwrap_or_default())
    };
    let mut out = Vec::new();
    const MAX_PAGES: u64 = 20;
    let mut start: u64 = 1;
    'outer: while start <= MAX_PAGES {
        let (r1, r2, r3) = tokio::join!(fetch(start), fetch(start + 1), fetch(start + 2));
        let pages = [(start, r1), (start + 1, r2), (start + 2, r3)];
        for (page, r) in pages {
            if page > MAX_PAGES {
                break;
            }
            let arr = r?;
            let count = arr.len();
            for f in arr {
                // Patch payload intentionally omitted — fetched on demand.
                out.push(PrFile {
                    path: str_or_empty(&f["filename"]),
                    previous_path: f["previous_filename"].as_str().filter(|previous| !previous.is_empty() && Some(*previous) != f["filename"].as_str()).map(str::to_string),
                    status: str_or_empty(&f["status"]),
                    additions: f["additions"].as_u64().unwrap_or(0),
                    deletions: f["deletions"].as_u64().unwrap_or(0),
                    patch: None,
                });
            }
            if count < 100 {
                break 'outer;
            }
        }
        start += 3;
    }
    Ok(out)
}

pub(super) async fn gh_file_patch(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
    target_path: &str,
) -> Result<Option<String>, String> {
    for page in 1..=20 {
        let url = github_repo_api_url(
            h,
            &format!("pulls/{number}/files?per_page=100&page={page}"),
        );
        let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
        let v = github_read_json(res, &h.host).await?;
        let arr = v.as_array().cloned().unwrap_or_default();
        let count = arr.len();
        for f in &arr {
            let name = str_or_empty(&f["filename"]);
            if name == target_path {
                let patch = f["patch"].as_str().unwrap_or("").to_string();
                return Ok(Some(patch));
            }
        }
        if count < 100 {
            break;
        }
    }
    Ok(None)
}

pub fn gh_map_review_comment(c: &Value) -> PrComment {
    let id = c["id"].as_u64().map(|n| n.to_string()).unwrap_or_default();
    let in_reply_to = c["in_reply_to_id"]
        .as_u64()
        .map(|n| n.to_string())
        .filter(|s| !s.is_empty());
    let thread_id = in_reply_to
        .clone()
        .or_else(|| Some(id.clone()))
        .filter(|s| !s.is_empty());
    PrComment {
        id,
        author: str_or_empty(&c["user"]["login"]),
        author_avatar: c["user"]["avatar_url"].as_str().map(|s| s.to_string()),
        created_at: str_or_empty(&c["created_at"]),
        body: str_or_empty(&c["body"]),
        kind: "inline".into(),
        file_path: c["path"].as_str().map(|s| s.to_string()),
        line: c["line"].as_u64().or_else(|| c["original_line"].as_u64()),
        in_reply_to,
        thread_id,
    }
}

pub fn gh_review_payload(event: &str, body: &str, comments: &[ReviewDraftComment]) -> Value {
    let mapped: Vec<Value> = comments
        .iter()
        .map(|c| {
            let mut value = json!({
                "path": c.path,
                "line": c.line,
                "side": c.side.clone().unwrap_or_else(|| "RIGHT".to_string()),
                "body": c.body,
            });
            if let Some(start) = c.start_line {
                value["start_line"] = json!(start);
                value["start_side"] = json!(c
                    .start_side
                    .as_deref()
                    .or(c.side.as_deref())
                    .unwrap_or("RIGHT"));
            }
            value
        })
        .collect();
    if mapped.is_empty() {
        json!({ "event": event, "body": body })
    } else {
        json!({ "event": event, "body": body, "comments": mapped })
    }
}

pub fn gitea_review_payload(event: &str, body: &str, comments: &[ReviewDraftComment]) -> Value {
    let mapped: Vec<Value> = comments
        .iter()
        .map(|c| {
            json!({
                "path": c.path,
                "body": c.body,
                "new_position": c.line,
            })
        })
        .collect();
    let event = if event == "APPROVE" { "APPROVED" } else { event };
    if mapped.is_empty() {
        json!({ "event": event, "body": body })
    } else {
        json!({ "event": event, "body": body, "comments": mapped })
    }
}

pub(super) async fn gh_conversation(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PrConversation, String> {
    let issue_url = github_repo_api_url(
        h,
        &format!("issues/{number}/comments?per_page=100"),
    );
    let review_comments_url = github_repo_api_url(
        h,
        &format!("pulls/{number}/comments?per_page=100"),
    );
    let reviews_url = github_repo_api_url(
        h,
        &format!("pulls/{number}/reviews?per_page=100"),
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
            in_reply_to: None,
            thread_id: None,
        });
    }
    for c in rc_v.as_array().cloned().unwrap_or_default() {
        comments.push(gh_map_review_comment(&c));
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

pub(super) async fn gh_legacy_commit_statuses(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    head_sha: &str,
) -> Result<Vec<PrCheck>, String> {
    let url = github_repo_api_url(h, &format!("commits/{head_sha}/status"));
    let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
    let v = github_read_json(res, &h.host).await?;
    let mut out = Vec::new();
    for s in v["statuses"].as_array().cloned().unwrap_or_default() {
        let ctx = str_or_empty(&s["context"]);
        if ctx.is_empty() {
            continue;
        }
        let st = str_or_empty(&s["state"]);
        let target = s["target_url"]
            .as_str()
            .filter(|u| !u.is_empty())
            .map(|u| u.to_string());
        let ext = s["id"]
            .as_i64()
            .map(|n| n.to_string())
            .or_else(|| s["id"].as_u64().map(|n| n.to_string()));
        out.push(PrCheck {
            name: ctx,
            status: st.clone(),
            conclusion: Some(st),
            html_url: target.clone(),
            details_url: target,
            ci_kind: Some("github_legacy_status".into()),
            key: None,
            head_sha: Some(head_sha.to_string()),
            started_at: None,
            completed_at: None,
            created_at: s["created_at"].as_str().map(|x| x.to_string()),
            updated_at: s["updated_at"].as_str().map(|x| x.to_string()),
            description: s["description"].as_str().map(|x| x.to_string()),
            output_title: None,
            output_summary: None,
            output_text: None,
            app_name: None,
            app_slug: None,
            check_suite_id: None,
            check_run_id: None,
            external_id: ext,
            annotations_count: None,
            status_uuid: None,
        });
    }
    Ok(out)
}

pub(super) async fn gh_checks(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    head_sha: &str,
) -> Result<Vec<PrCheck>, String> {
    let mut out = Vec::new();
    for page in 1..=40u32 {
        let url = github_repo_api_url(
            h,
            &format!("commits/{head_sha}/check-runs?per_page=100&page={page}"),
        );
        let res = github_request(client, cred, reqwest::Method::GET, &url, None).await?;
        let v = github_read_json(res, &h.host).await?;
        let arr = v["check_runs"].as_array().cloned().unwrap_or_default();
        let page_len = arr.len();
        for c in arr {
            let outv = &c["output"];
            let text_raw = outv["text"].as_str().unwrap_or("");
            let output_text = if text_raw.is_empty() {
                None
            } else {
                Some(trunc_chars(text_raw, 80_000))
            };
            let ann = outv["annotations_count"].as_u64();
            let suite_id = c
                .get("check_suite")
                .and_then(|cs| cs.get("id"))
                .and_then(|id| id.as_u64().map(|n| n.to_string()).or_else(|| id.as_i64().map(|n| n.to_string())));
            let run_id = c["id"]
                .as_u64()
                .map(|n| n.to_string())
                .or_else(|| c["id"].as_i64().map(|n| n.to_string()));
            out.push(PrCheck {
                name: str_or_empty(&c["name"]),
                status: str_or_empty(&c["status"]),
                conclusion: c["conclusion"].as_str().map(|s| s.to_string()),
                html_url: c["html_url"].as_str().map(|s| s.to_string()),
                details_url: c["details_url"]
                    .as_str()
                    .filter(|u| !u.is_empty())
                    .map(|s| s.to_string()),
                ci_kind: Some("github_check_run".into()),
                key: None,
                head_sha: c["head_sha"].as_str().map(|s| s.to_string()),
                started_at: c["started_at"].as_str().map(|s| s.to_string()),
                completed_at: c["completed_at"].as_str().map(|s| s.to_string()),
                created_at: None,
                updated_at: None,
                description: None,
                output_title: outv["title"]
                    .as_str()
                    .filter(|t| !t.is_empty())
                    .map(|s| s.to_string()),
                output_summary: outv["summary"]
                    .as_str()
                    .filter(|t| !t.is_empty())
                    .map(|s| s.to_string()),
                output_text,
                app_name: c["app"]["name"]
                    .as_str()
                    .filter(|t| !t.is_empty())
                    .map(|s| s.to_string()),
                app_slug: c["app"]["slug"]
                    .as_str()
                    .filter(|t| !t.is_empty())
                    .map(|s| s.to_string()),
                check_suite_id: suite_id,
                check_run_id: run_id,
                external_id: c["external_id"]
                    .as_str()
                    .filter(|t| !t.is_empty())
                    .map(|s| s.to_string()),
                annotations_count: ann,
                status_uuid: None,
            });
        }
        if page_len < 100 {
            break;
        }
    }
    if let Ok(mut legacy) = gh_legacy_commit_statuses(client, cred, h, head_sha).await {
        out.append(&mut legacy);
    }
    Ok(out)
}

// ---------- Bitbucket mapping ----------
