//! Provider-specific HTTP reads and response mapping. Shared IPC models live in the parent.
use super::*;

pub(super) async fn bb_read_json(res: reqwest::Response, host: &str) -> Result<Value, String> {
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "Bitbucket: 401. Bitte unter Einstellungen bei {host} anmelden."
        ));
    }
    if !res.status().is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&res) { return Err(error); }
        let status = res.status();
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        return Err(format!("Bitbucket {status}: {}", body.trim()));
    }
    res.json::<Value>()
        .await
        .map_err(|e| format!("Bitbucket: {e}"))
}

pub(super) async fn bb_post_json(
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
        .header("User-Agent", "l8git")
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

pub fn bb_map_pr(v: &Value) -> PullRequest {
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
        node_id: None,
    }
}

pub(super) async fn bb_detail(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PullRequestDetail, String> {
    let api = bitbucket_api_base(&h.host)?;
    let url = format!(
        "{api}/repositories/{}/{}/pullrequests/{number}",
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
        auto_merge_method: None,
        base,
    })
}

pub(super) async fn bb_commits(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCommit>, String> {
    let api = bitbucket_api_base(&h.host)?;
    let url = format!(
        "{api}/repositories/{}/{}/pullrequests/{number}/commits?pagelen=50",
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

pub fn split_unified_diff_by_file(diff_text: &str) -> Vec<(String, String)> {
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

pub(super) async fn bb_files(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrFile>, String> {
    let api = bitbucket_api_base(&h.host)?;
    let diffstat_url = format!(
        "{api}/repositories/{}/{}/pullrequests/{number}/diffstat?pagelen=100",
        h.owner, h.repo
    );
    let stats = bitbucket_collect_paginated_values(client, cred, &diffstat_url, &h.host).await?;

    // Patches are fetched lazily via `pr_file_patch`; only metadata is
    // needed in the list response.
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
        let previous_path = s["old"]["path"].as_str().filter(|previous| !previous.is_empty() && *previous != path).map(str::to_string);
        out.push(PrFile {
            path,
            previous_path,
            status,
            additions,
            deletions,
            patch: None,
        });
    }
    Ok(out)
}

pub(super) async fn bb_file_patch(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
    target_path: &str,
) -> Result<Option<String>, String> {
    let api = bitbucket_api_base(&h.host)?;
    let diff_url = format!(
        "{api}/repositories/{}/{}/pullrequests/{number}/diff",
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
        if let Some(error) = crate::provider_rate_limit::response_error(&diff_res) { return Err(error); }
        let body = diff_res.text().await.unwrap_or_default();
        return Err(format!("Bitbucket: {}", body.trim()));
    }
    let diff_text = diff_res
        .text()
        .await
        .map_err(|e| format!("Bitbucket: {e}"))?;
    let per_file = split_unified_diff_by_file(&diff_text);
    Ok(per_file
        .into_iter()
        .find(|(p, _)| p == target_path)
        .map(|(_, d)| d))
}

pub fn bb_map_comment(c: &Value) -> Option<PrComment> {
    if c["deleted"].as_bool().unwrap_or(false) {
        return None;
    }
    let file_path = c["inline"]["path"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let line = c["inline"]["to"]
        .as_u64()
        .or_else(|| c["inline"]["from"].as_u64());
    let kind = if file_path.is_some() { "inline" } else { "issue" };
    let id = c["id"].as_u64().map(|n| n.to_string()).unwrap_or_default();
    let in_reply_to = c["parent"]["id"].as_u64().map(|n| n.to_string());
    let thread_id = in_reply_to
        .clone()
        .or_else(|| Some(id.clone()))
        .filter(|s| !s.is_empty());
    Some(PrComment {
        id,
        author: str_or_empty(&c["user"]["display_name"]),
        author_avatar: c["user"]["links"]["avatar"]["href"]
            .as_str()
            .map(|s| s.to_string()),
        created_at: str_or_empty(&c["created_on"]),
        body: c["content"]["raw"].as_str().unwrap_or("").to_string(),
        kind: kind.into(),
        file_path,
        line,
        in_reply_to,
        thread_id,
    })
}

pub fn bb_inline_comment_payload(
    body: &str,
    file_path: Option<&str>,
    line: Option<u64>,
    parent: Option<&str>,
) -> Value {
    let mut payload = json!({ "content": { "raw": body } });
    if let (Some(p), Some(l)) = (file_path, line) {
        payload["inline"] = json!({ "path": p, "to": l });
    }
    if let Some(parent_id) = parent.and_then(|p| p.trim().parse::<u64>().ok()) {
        payload["parent"] = json!({ "id": parent_id });
    }
    payload
}

pub(super) async fn bb_conversation(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PrConversation, String> {
    let api = bitbucket_api_base(&h.host)?;
    let url = format!(
        "{api}/repositories/{}/{}/pullrequests/{number}/comments?pagelen=50",
        h.owner, h.repo
    );
    let values = bitbucket_collect_paginated_values(client, cred, &url, &h.host).await?;
    let comments: Vec<PrComment> = values.iter().filter_map(bb_map_comment).collect();
    Ok(PrConversation {
        comments,
        reviews: Vec::new(),
    })
}

pub fn bb_commit_status_to_pr_check(v: &Value) -> PrCheck {
    let key = str_or_empty(&v["key"]);
    let nm = str_or_empty(&v["name"]);
    let display = first_non_empty(nm, key.clone());
    let st = str_or_empty(&v["state"]);
    let link = v["url"]
        .as_str()
        .filter(|u| !u.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            v["links"]["html"]["href"]
                .as_str()
                .filter(|u| !u.is_empty())
                .map(|s| s.to_string())
        });
    let commit_hash = v["commit"]["hash"]
        .as_str()
        .filter(|u| !u.is_empty())
        .map(|s| s.to_string());
    let status_uuid = v.get("uuid").and_then(|u| u.as_str().map(|s| s.to_string()));
    PrCheck {
        name: display,
        status: st.clone(),
        conclusion: Some(st),
        html_url: link.clone(),
        details_url: link,
        ci_kind: Some("bitbucket_commit_status".into()),
        key: if key.is_empty() { None } else { Some(key) },
        head_sha: commit_hash,
        started_at: None,
        completed_at: None,
        created_at: v["created_on"].as_str().map(|s| s.to_string()),
        updated_at: v["updated_on"].as_str().map(|s| s.to_string()),
        description: v["description"].as_str().map(|s| s.to_string()),
        output_title: None,
        output_summary: None,
        output_text: None,
        app_name: None,
        app_slug: None,
        check_suite_id: None,
        check_run_id: None,
        external_id: None,
        annotations_count: None,
        status_uuid,
    }
}

pub(super) async fn bb_checks(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCheck>, String> {
    let api = bitbucket_api_base(&h.host)?;
    let url = format!(
        "{api}/repositories/{}/{}/pullrequests/{number}/statuses?pagelen=100",
        h.owner, h.repo
    );
    let values = bitbucket_collect_paginated_values(client, cred, &url, &h.host).await?;
    Ok(values.iter().map(bb_commit_status_to_pr_check).collect())
}

pub(super) async fn bb_checks_for_commit(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    commit_hash: &str,
) -> Result<Vec<PrCheck>, String> {
    let enc = encode_uri_component(commit_hash);
    let api = bitbucket_api_base(&h.host)?;
    let url = format!(
        "{api}/repositories/{}/{}/commit/{enc}/statuses?pagelen=100",
        h.owner, h.repo
    );
    let values = bitbucket_collect_paginated_values(client, cred, &url, &h.host).await?;
    Ok(values.iter().map(bb_commit_status_to_pr_check).collect())
}
