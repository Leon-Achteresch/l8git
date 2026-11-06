//! Provider-specific HTTP reads and response mapping. Shared IPC models live in the parent.
use super::*;

pub fn gitlab_api_base(host: &str) -> String {
    format!("https://{}/api/v4", host.trim().trim_end_matches('/'))
}

pub fn gitlab_project_id(h: &RemoteHandle) -> String {
    encode_uri_component(&format!("{}/{}", h.owner, h.repo))
}

pub fn gitlab_project_url(h: &RemoteHandle, suffix: &str) -> String {
    format!(
        "{}/projects/{}/{}",
        gitlab_api_base(&h.host),
        gitlab_project_id(h),
        suffix.trim_start_matches('/')
    )
}

pub fn gitlab_auth_header(username: Option<&str>, token: &str) -> (&'static str, String) {
    let user = username.unwrap_or("").trim().to_ascii_lowercase();
    let token = token.trim().to_string();
    let use_bearer = user == "oauth2" || user == "bearer" || token.starts_with("gloas-");
    if use_bearer {
        ("Authorization", format!("Bearer {token}"))
    } else {
        ("PRIVATE-TOKEN", token)
    }
}

pub(super) async fn gl_request(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> Result<reqwest::Response, String> {
    let (header, value) = gitlab_auth_header(cred.username.as_deref(), &cred.password);
    let mut req = client
        .request(method, url)
        .header("User-Agent", "l8git")
        .header("Accept", "application/json")
        .header(header, value);
    if let Some(b) = body {
        req = req.json(&b);
    }
    req.send().await.map_err(|e| format!("GitLab: {e}"))
}

pub(super) async fn gl_read_json(res: reqwest::Response, host: &str) -> Result<Value, String> {
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "GitLab: 401. Bitte unter Einstellungen bei {host} anmelden."
        ));
    }
    if !res.status().is_success() {
        if let Some(error) = crate::provider_rate_limit::response_error(&res) { return Err(error); }
        let status = res.status();
        let response_status = res.status();
        let body = res.text().await.unwrap_or_default();
        if let Some(error) = crate::provider_rate_limit::body_error(response_status, &body) { return Err(error); }
        let msg = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| {
                v["message"]
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| v["error"].as_str().map(|s| s.to_string()))
            })
            .unwrap_or_else(|| body.trim().to_string());
        return Err(format!("GitLab {status}: {msg}"));
    }
    res.json::<Value>().await.map_err(|e| format!("GitLab: {e}"))
}

pub(super) async fn gl_get_json(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    suffix: &str,
) -> Result<Value, String> {
    let url = gitlab_project_url(h, suffix);
    let res = gl_request(client, cred, reqwest::Method::GET, &url, None).await?;
    gl_read_json(res, &h.host).await
}

pub(super) async fn gl_get_paginated(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    suffix: &str,
    per_page: usize,
    max_pages: u32,
) -> Result<Vec<Value>, String> {
    let sep = if suffix.contains('?') { '&' } else { '?' };
    let mut out: Vec<Value> = Vec::new();
    for page in 1..=max_pages {
        let paged = format!("{suffix}{sep}per_page={per_page}&page={page}");
        let v = gl_get_json(client, cred, h, &paged).await?;
        let arr = v.as_array().cloned().unwrap_or_default();
        let len = arr.len();
        out.extend(arr);
        if len < per_page {
            break;
        }
    }
    Ok(out)
}

pub(super) fn gl_user_name(v: &Value) -> String {
    first_non_empty(str_or_empty(&v["name"]), str_or_empty(&v["username"]))
}

pub fn gl_map_mr(v: &Value) -> PullRequest {
    let title = str_or_empty(&v["title"]);
    let title_lc = title.trim().to_lowercase();
    let is_draft = v["draft"]
        .as_bool()
        .or_else(|| v["work_in_progress"].as_bool())
        .unwrap_or_else(|| title_lc.starts_with("draft:") || title_lc.starts_with("wip:"));
    let state_raw = str_or_empty(&v["state"]).to_lowercase();
    let state = match state_raw.as_str() {
        "opened" | "open" | "locked" => {
            if is_draft {
                "draft".to_string()
            } else {
                "open".to_string()
            }
        }
        "merged" => "merged".to_string(),
        "closed" => "closed".to_string(),
        other => other.to_string(),
    };
    let labels = v["labels"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|l| {
                    l.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| l["name"].as_str().map(|s| s.to_string()))
                })
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();
    let reviewers = v["reviewers"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|r| Reviewer {
                    login: gl_user_name(r),
                    avatar: r["avatar_url"].as_str().map(|s| s.to_string()),
                })
                .collect()
        })
        .unwrap_or_default();
    let number = v["iid"]
        .as_u64()
        .or_else(|| v["number"].as_u64())
        .unwrap_or(0);
    PullRequest {
        number,
        title,
        state,
        is_draft,
        author: gl_user_name(&v["author"]),
        author_avatar: v["author"]["avatar_url"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        source_branch: str_or_empty(&v["source_branch"]),
        target_branch: str_or_empty(&v["target_branch"]),
        html_url: str_or_empty(&v["web_url"]),
        created_at: str_or_empty(&v["created_at"]),
        updated_at: str_or_empty(&v["updated_at"]),
        labels,
        reviewers,
        provider: Provider::GitLab.as_str().to_string(),
        node_id: None,
    }
}

pub fn gl_mergeable(v: &Value) -> Option<bool> {
    let detailed = str_or_empty(&v["detailed_merge_status"]).to_lowercase();
    if !detailed.is_empty() {
        return match detailed.as_str() {
            "mergeable" => Some(true),
            "checking" | "unchecked" | "preparing" | "ci_still_running" => None,
            _ => Some(false),
        };
    }
    match str_or_empty(&v["merge_status"]).to_lowercase().as_str() {
        "can_be_merged" => Some(true),
        "cannot_be_merged" | "cannot_be_merged_recheck" => Some(false),
        _ => None,
    }
}

pub fn gl_map_detail(v: &Value) -> PullRequestDetail {
    let base = gl_map_mr(v);
    PullRequestDetail {
        body_markdown: v["description"].as_str().unwrap_or("").to_string(),
        mergeable: gl_mergeable(v),
        merge_commit_sha: v["merge_commit_sha"]
            .as_str()
            .or_else(|| v["squash_commit_sha"].as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        head_sha: first_non_empty(
            str_or_empty(&v["sha"]),
            str_or_empty(&v["diff_refs"]["head_sha"]),
        ),
        auto_merge_method: if v["merge_when_pipeline_succeeds"].as_bool().unwrap_or(false) {
            Some(if v["squash"].as_bool().unwrap_or(false) {
                "squash".to_string()
            } else {
                "merge".to_string()
            })
        } else {
            None
        },
        base,
    }
}

pub fn gl_map_commit(v: &Value) -> PrCommit {
    let hash = str_or_empty(&v["id"]);
    let short_hash = first_non_empty(str_or_empty(&v["short_id"]), hash.chars().take(7).collect());
    PrCommit {
        hash,
        short_hash,
        author: str_or_empty(&v["author_name"]),
        email: str_or_empty(&v["author_email"]),
        date: first_non_empty(
            str_or_empty(&v["authored_date"]),
            str_or_empty(&v["created_at"]),
        ),
        subject: first_non_empty(
            str_or_empty(&v["title"]),
            v["message"]
                .as_str()
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
                .to_string(),
        ),
        author_avatar: None,
    }
}

pub fn gl_diff_path(v: &Value) -> String {
    first_non_empty(str_or_empty(&v["new_path"]), str_or_empty(&v["old_path"]))
}

pub fn gl_diff_status(v: &Value) -> String {
    if v["new_file"].as_bool().unwrap_or(false) {
        "added".into()
    } else if v["deleted_file"].as_bool().unwrap_or(false) {
        "removed".into()
    } else if v["renamed_file"].as_bool().unwrap_or(false) {
        "renamed".into()
    } else {
        "modified".into()
    }
}

pub fn gl_diff_counts(diff: &str) -> (u64, u64) {
    let mut additions = 0u64;
    let mut deletions = 0u64;
    for line in diff.lines() {
        if line.starts_with("+++") || line.starts_with("---") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }
    (additions, deletions)
}

pub fn gl_diff_patch(v: &Value) -> String {
    let new_path = first_non_empty(str_or_empty(&v["new_path"]), str_or_empty(&v["old_path"]));
    let old_path = first_non_empty(str_or_empty(&v["old_path"]), new_path.clone());
    let is_new = v["new_file"].as_bool().unwrap_or(false);
    let is_deleted = v["deleted_file"].as_bool().unwrap_or(false);
    let left = if is_new {
        "/dev/null".to_string()
    } else {
        format!("a/{old_path}")
    };
    let right = if is_deleted {
        "/dev/null".to_string()
    } else {
        format!("b/{new_path}")
    };
    let body = v["diff"].as_str().unwrap_or("");
    let mut out = format!("diff --git a/{old_path} b/{new_path}\n--- {left}\n+++ {right}\n");
    out.push_str(body);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

pub fn gl_map_file(v: &Value) -> PrFile {
    let (additions, deletions) = gl_diff_counts(v["diff"].as_str().unwrap_or(""));
    PrFile {
        path: gl_diff_path(v),
        previous_path: v["old_path"].as_str().filter(|previous| !previous.is_empty() && *previous != gl_diff_path(v)).map(str::to_string),
        status: gl_diff_status(v),
        additions,
        deletions,
        patch: None,
    }
}

pub fn gl_map_note(v: &Value) -> Option<PrComment> {
    if v["system"].as_bool().unwrap_or(false) {
        return None;
    }
    let body = str_or_empty(&v["body"]);
    if body.trim().is_empty() {
        return None;
    }
    let position = &v["position"];
    let file_path = position["new_path"]
        .as_str()
        .or_else(|| position["old_path"].as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let line = position["new_line"].as_u64().or_else(|| position["old_line"].as_u64());
    let kind = if file_path.is_some() { "inline" } else { "issue" };
    Some(PrComment {
        id: v["id"]
            .as_u64()
            .map(|n| n.to_string())
            .unwrap_or_else(|| str_or_empty(&v["id"])),
        author: gl_user_name(&v["author"]),
        author_avatar: v["author"]["avatar_url"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        created_at: str_or_empty(&v["created_at"]),
        body,
        kind: kind.into(),
        file_path,
        line,
        in_reply_to: None,
        thread_id: None,
    })
}

pub fn gl_map_discussion(d: &Value) -> Vec<PrComment> {
    let discussion_id = d["id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let mut out: Vec<PrComment> = Vec::new();
    let mut root: Option<String> = None;
    for note in d["notes"].as_array().cloned().unwrap_or_default() {
        let Some(mut c) = gl_map_note(&note) else {
            continue;
        };
        c.thread_id = discussion_id.clone().or_else(|| Some(c.id.clone()));
        c.in_reply_to = root.clone();
        if root.is_none() {
            root = Some(c.id.clone());
        }
        out.push(c);
    }
    out
}

pub fn gl_discussion_position(mr: &Value, path: &str, line: u64) -> Option<Value> {
    let refs = &mr["diff_refs"];
    let base = refs["base_sha"].as_str().filter(|s| !s.is_empty())?;
    let head = refs["head_sha"].as_str().filter(|s| !s.is_empty())?;
    let start = refs["start_sha"].as_str().filter(|s| !s.is_empty())?;
    Some(json!({
        "base_sha": base,
        "head_sha": head,
        "start_sha": start,
        "position_type": "text",
        "new_path": path,
        "old_path": path,
        "new_line": line,
    }))
}

pub fn gl_approvals_to_reviews(v: &Value) -> Vec<PrReview> {
    let at = first_non_empty(str_or_empty(&v["updated_at"]), str_or_empty(&v["created_at"]));
    v["approved_by"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|entry| {
                    let user = if entry["user"].is_object() {
                        &entry["user"]
                    } else {
                        entry
                    };
                    PrReview {
                        id: format!("approval-{}", str_or_empty(&user["username"])),
                        author: gl_user_name(user),
                        author_avatar: user["avatar_url"]
                            .as_str()
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string()),
                        state: "APPROVED".into(),
                        submitted_at: at.clone(),
                        body: String::new(),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn gl_status_to_check_state(raw: &str) -> (String, Option<String>) {
    match raw.trim().to_lowercase().as_str() {
        "success" | "passed" => ("completed".into(), Some("success".into())),
        "failed" => ("completed".into(), Some("failure".into())),
        "canceled" | "cancelled" | "canceling" => ("completed".into(), Some("cancelled".into())),
        "skipped" => ("completed".into(), Some("skipped".into())),
        "manual" => ("completed".into(), Some("action_required".into())),
        "running" => ("in_progress".into(), None),
        "created" | "pending" | "preparing" | "scheduled" | "waiting_for_resource"
        | "waiting_for_callback" => ("queued".into(), None),
        other => (other.to_string(), None),
    }
}

pub(super) fn gl_empty_check(name: String, status: String, conclusion: Option<String>, kind: &str) -> PrCheck {
    PrCheck {
        name,
        status,
        conclusion,
        html_url: None,
        details_url: None,
        ci_kind: Some(kind.to_string()),
        key: None,
        head_sha: None,
        started_at: None,
        completed_at: None,
        created_at: None,
        updated_at: None,
        description: None,
        output_title: None,
        output_summary: None,
        output_text: None,
        app_name: None,
        app_slug: None,
        check_suite_id: None,
        check_run_id: None,
        external_id: None,
        annotations_count: None,
        status_uuid: None,
    }
}

pub(super) fn opt_str(v: &Value) -> Option<String> {
    v.as_str().filter(|s| !s.is_empty()).map(|s| s.to_string())
}

pub fn gl_pipeline_to_pr_check(v: &Value) -> PrCheck {
    let (status, conclusion) = gl_status_to_check_state(&str_or_empty(&v["status"]));
    let id = v["id"].as_u64();
    let name = match id {
        Some(n) => format!("Pipeline #{n}"),
        None => "Pipeline".to_string(),
    };
    let link = opt_str(&v["web_url"]);
    let mut check = gl_empty_check(name, status, conclusion, "gitlab_pipeline");
    check.html_url = link.clone();
    check.details_url = link;
    check.key = opt_str(&v["source"]);
    check.head_sha = opt_str(&v["sha"]);
    check.created_at = opt_str(&v["created_at"]);
    check.updated_at = opt_str(&v["updated_at"]);
    check.description = opt_str(&v["ref"]);
    check.check_suite_id = id.map(|n| n.to_string());
    check.app_name = Some("GitLab CI".into());
    check
}

pub fn gl_job_to_pr_check(v: &Value) -> PrCheck {
    let (status, conclusion) = gl_status_to_check_state(&str_or_empty(&v["status"]));
    let link = opt_str(&v["web_url"]);
    let mut check = gl_empty_check(str_or_empty(&v["name"]), status, conclusion, "gitlab_job");
    check.html_url = link.clone();
    check.details_url = link;
    check.key = opt_str(&v["stage"]);
    check.head_sha = opt_str(&v["commit"]["id"])
        .or_else(|| opt_str(&v["pipeline"]["sha"]));
    check.started_at = opt_str(&v["started_at"]);
    check.completed_at = opt_str(&v["finished_at"]);
    check.created_at = opt_str(&v["created_at"]);
    check.external_id = v["id"].as_u64().map(|n| n.to_string());
    check.check_suite_id = v["pipeline"]["id"].as_u64().map(|n| n.to_string());
    check.app_name = Some("GitLab CI".into());
    check
}

pub fn gl_commit_status_to_pr_check(v: &Value) -> PrCheck {
    let (status, conclusion) = gl_status_to_check_state(&str_or_empty(&v["status"]));
    let link = opt_str(&v["target_url"]);
    let name = first_non_empty(str_or_empty(&v["name"]), str_or_empty(&v["stage"]));
    let mut check = gl_empty_check(name, status, conclusion, "gitlab_commit_status");
    check.html_url = link.clone();
    check.details_url = link;
    check.key = opt_str(&v["stage"]);
    check.head_sha = opt_str(&v["sha"]);
    check.started_at = opt_str(&v["started_at"]);
    check.completed_at = opt_str(&v["finished_at"]);
    check.created_at = opt_str(&v["created_at"]);
    check.description = opt_str(&v["description"]);
    check.external_id = v["id"].as_u64().map(|n| n.to_string());
    check.app_name = Some("GitLab CI".into());
    check
}

pub(super) async fn gl_detail(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PullRequestDetail, String> {
    let v = gl_get_json(client, cred, h, &format!("merge_requests/{number}")).await?;
    Ok(gl_map_detail(&v))
}

pub(super) async fn gl_commits(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCommit>, String> {
    let values = gl_get_paginated(
        client,
        cred,
        h,
        &format!("merge_requests/{number}/commits"),
        100,
        20,
    )
    .await?;
    Ok(values.iter().map(gl_map_commit).collect())
}

pub(super) async fn gl_diffs(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<Value>, String> {
    let paged = gl_get_paginated(
        client,
        cred,
        h,
        &format!("merge_requests/{number}/diffs"),
        100,
        20,
    )
    .await;
    match paged {
        Ok(v) => Ok(v),
        Err(error) if error.contains("__PROVIDER_RATE_LIMIT__:") => Err(error),
        Err(_) => {
            let v = gl_get_json(client, cred, h, &format!("merge_requests/{number}/changes")).await?;
            Ok(v["changes"].as_array().cloned().unwrap_or_default())
        }
    }
}

pub(super) async fn gl_files(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrFile>, String> {
    let values = gl_diffs(client, cred, h, number).await?;
    Ok(values.iter().map(gl_map_file).collect())
}

pub(super) async fn gl_file_patch(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
    target_path: &str,
) -> Result<Option<String>, String> {
    let values = gl_diffs(client, cred, h, number).await?;
    Ok(values
        .iter()
        .find(|v| gl_diff_path(v) == target_path)
        .map(gl_diff_patch))
}

pub(super) async fn gl_conversation(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<PrConversation, String> {
    let discussions = gl_get_paginated(
        client,
        cred,
        h,
        &format!("merge_requests/{number}/discussions"),
        100,
        10,
    )
    .await?;
    let mut comments: Vec<PrComment> = discussions.iter().flat_map(gl_map_discussion).collect();
    comments.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    let reviews = match gl_get_json(client, cred, h, &format!("merge_requests/{number}/approvals"))
        .await
    {
        Ok(v) => gl_approvals_to_reviews(&v),
        Err(_) => Vec::new(),
    };
    Ok(PrConversation { comments, reviews })
}

pub(super) async fn gl_checks(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    number: u64,
) -> Result<Vec<PrCheck>, String> {
    let pipelines = gl_get_paginated(
        client,
        cred,
        h,
        &format!("merge_requests/{number}/pipelines"),
        50,
        2,
    )
    .await?;
    let mut out: Vec<PrCheck> = pipelines.iter().map(gl_pipeline_to_pr_check).collect();
    if let Some(latest) = pipelines.first().and_then(|p| p["id"].as_u64()) {
        if let Ok(jobs) = gl_get_paginated(
            client,
            cred,
            h,
            &format!("pipelines/{latest}/jobs"),
            100,
            2,
        )
        .await
        {
            out.extend(jobs.iter().map(gl_job_to_pr_check));
        }
    }
    Ok(out)
}

pub(super) async fn gl_checks_for_commit(
    client: &reqwest::Client,
    cred: &HttpsCredential,
    h: &RemoteHandle,
    sha: &str,
) -> Result<Vec<PrCheck>, String> {
    let enc = encode_uri_component(sha);
    let values = gl_get_paginated(
        client,
        cred,
        h,
        &format!("repository/commits/{enc}/statuses"),
        100,
        2,
    )
    .await?;
    Ok(values.iter().map(gl_commit_status_to_pr_check).collect())
}
