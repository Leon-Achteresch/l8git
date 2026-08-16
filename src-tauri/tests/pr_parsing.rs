mod common;

use common::{json, TestRepo};
use l8git_lib::pr::{
    bb_commit_status_to_pr_check, bb_inline_comment_payload, bb_map_comment, bb_map_pr,
    current_branch, detect_provider, encode_uri_component, first_non_empty, gh_map_pr,
    gh_map_review_comment, gh_map_review_threads, gh_review_payload, gitea_api_base, gitea_review_payload,
    github_api_base, github_repo_api_url, gitlab_api_base, gitlab_auth_header, gitlab_project_id,
    gitlab_project_url, gl_approvals_to_reviews, gl_commit_status_to_pr_check, gl_diff_counts,
    gl_diff_patch, gl_diff_status, gl_discussion_position, gl_job_to_pr_check, gl_map_commit,
    gl_map_detail, gl_map_discussion, gl_map_file, gl_map_mr, gl_map_note, gl_mergeable,
    gl_pipeline_to_pr_check, gl_status_to_check_state, origin_default_branch, parse_origin_url,
    pr_create_web_url, provider_api_base, provider_capabilities, split_unified_diff_by_file,
    str_or_empty, strip_remote_prefix, trunc_chars, unsupported_provider_err, Provider,
    RemoteHandle, ReviewDraftComment, PROVIDER_UNKNOWN_CODE,
};
use serde_json::json as jval;

fn repo_with_origin(tag: &str, url: &str) -> TestRepo {
    let repo = TestRepo::new(tag);
    repo.commit("a.txt", "1\n", "c1");
    repo.git(&["remote", "add", "origin", url]);
    repo
}

fn handle(repo: &TestRepo, url: &str) -> RemoteHandle {
    repo.git(&["config", "remote.origin.url", url]);
    parse_origin_url(&repo.path).unwrap()
}

fn handle_err(repo: &TestRepo, url: &str) -> String {
    repo.git(&["config", "remote.origin.url", url]);
    err_of(parse_origin_url(&repo.path), url)
}

fn err_of(result: Result<RemoteHandle, String>, context: &str) -> String {
    match result {
        Ok(h) => panic!("expected {context} to be rejected, got {}/{}", h.owner, h.repo),
        Err(e) => e,
    }
}

#[test]
fn parse_origin_url_understands_the_common_github_url_shapes() {
    let repo = repo_with_origin("origin-github", "git@github.com:acme/app.git");

    for url in [
        "git@github.com:acme/app.git",
        "git@github.com:acme/app",
        "https://github.com/acme/app.git",
        "https://github.com/acme/app/",
        "http://github.com/acme/app",
        "ssh://git@github.com/acme/app.git",
        "https://token:x-oauth-basic@github.com/acme/app.git",
    ] {
        let h = handle(&repo, url);
        assert_eq!(h.host, "github.com", "{url}");
        assert_eq!(h.owner, "acme", "{url}");
        assert_eq!(h.repo, "app", "{url}");
        assert_eq!(h.provider.as_str(), "github", "{url}");
    }
}

#[test]
fn parse_origin_url_recognises_github_enterprise_hosts() {
    let repo = repo_with_origin("origin-ghe", "git@github.com:acme/app.git");

    let scp = handle(&repo, "git@github.corp.example:platform/service.git");
    assert_eq!(scp.host, "github.corp.example");
    assert_eq!(scp.provider.as_str(), "github");
    assert_eq!(scp.owner, "platform");
    assert_eq!(scp.repo, "service");

    let generic_scp = handle(&repo, "storelogix@storelogix.ghe.com:team/repo.git");
    assert_eq!(generic_scp.host, "storelogix.ghe.com");
    assert_eq!(generic_scp.owner, "team");
    assert_eq!(generic_scp.repo, "repo");
    assert_eq!(generic_scp.provider.as_str(), "github");
}

#[test]
fn parse_origin_url_no_longer_falls_back_to_github_for_unknown_hosts() {
    let repo = repo_with_origin("origin-unknown", "git@github.com:acme/app.git");

    let https = handle(&repo, "https://git.internal.example/group/tool.git");
    assert_eq!(https.host, "git.internal.example");
    assert_eq!(
        https.provider.as_str(),
        "unsupported",
        "an unknown host must not silently use the GitHub API"
    );
    assert_eq!(https.owner, "group");
    assert_eq!(https.repo, "tool");
}

#[test]
fn parse_origin_url_honours_the_l8git_provider_override() {
    let repo = repo_with_origin("origin-override", "https://git.internal.example/group/tool.git");
    assert_eq!(parse_origin_url(&repo.path).unwrap().provider.as_str(), "unsupported");

    repo.git(&["config", "l8git.provider", "gitea"]);
    assert_eq!(parse_origin_url(&repo.path).unwrap().provider.as_str(), "gitea");

    repo.git(&["config", "l8git.provider", "GitLab"]);
    assert_eq!(parse_origin_url(&repo.path).unwrap().provider.as_str(), "gitlab");

    repo.git(&["config", "l8git.provider", "nonsense"]);
    assert_eq!(
        parse_origin_url(&repo.path).unwrap().provider.as_str(),
        "unsupported",
        "an unparsable override falls back to host detection"
    );
}

#[test]
fn detect_provider_covers_the_known_hosting_families() {
    for (host, expected) in [
        ("github.com", "github"),
        ("GitHub.com", "github"),
        ("github.corp.example", "github"),
        ("storelogix.ghe.com", "github"),
        ("bitbucket.org", "bitbucket"),
        ("gitlab.com", "gitlab"),
        ("gitlab.internal.example", "gitlab"),
        ("gitea.com", "gitea"),
        ("codeberg.org", "gitea"),
        ("gitea.internal.example", "gitea"),
        ("forgejo.example.org", "gitea"),
        ("git.internal.example", "unsupported"),
        ("dev.azure.com", "unsupported"),
    ] {
        assert_eq!(detect_provider(host).as_str(), expected, "host {host}");
    }
}

#[test]
fn parse_origin_url_detects_bitbucket_and_gitlab() {
    let repo = repo_with_origin("origin-mixed", "git@github.com:acme/app.git");

    let bb = handle(&repo, "git@bitbucket.org:team/repo.git");
    assert_eq!(bb.provider.as_str(), "bitbucket");
    assert_eq!(bb.owner, "team");
    assert_eq!(bb.repo, "repo");

    let bb_https = handle(&repo, "https://user@bitbucket.org/team/repo.git");
    assert_eq!(bb_https.provider.as_str(), "bitbucket");
    assert_eq!(bb_https.host, "bitbucket.org");

    assert_eq!(
        handle(&repo, "https://gitlab.com/group/project.git").provider.as_str(),
        "gitlab"
    );
    let self_hosted = handle(&repo, "https://gitlab.internal.example/group/team/project.git");
    assert_eq!(self_hosted.provider.as_str(), "gitlab");
    assert_eq!(self_hosted.owner, "group");
    assert_eq!(
        self_hosted.repo, "team/project",
        "nested groups belong to the repo part"
    );
}

#[test]
fn parse_origin_url_detects_gitlab_across_url_shapes_and_subgroups() {
    let repo = repo_with_origin("origin-gitlab", "git@github.com:acme/app.git");

    for url in [
        "git@gitlab.com:group/project.git",
        "https://gitlab.com/group/project.git",
        "ssh://git@gitlab.com/group/project.git",
        "https://oauth2:token@gitlab.com/group/project.git",
    ] {
        let h = handle(&repo, url);
        assert_eq!(h.provider.as_str(), "gitlab", "{url}");
        assert_eq!(h.host, "gitlab.com", "{url}");
        assert_eq!(h.owner, "group", "{url}");
        assert_eq!(h.repo, "project", "{url}");
    }

    let deep = handle(&repo, "git@gitlab.example.com:top/middle/inner/service.git");
    assert_eq!(deep.provider.as_str(), "gitlab");
    assert_eq!(deep.owner, "top");
    assert_eq!(
        deep.repo, "middle/inner/service",
        "nested subgroups stay part of the project path"
    );
}

#[test]
fn parse_origin_url_detects_gitea_and_forgejo_hosts() {
    let repo = repo_with_origin("origin-gitea", "git@github.com:acme/app.git");

    for url in [
        "https://codeberg.org/team/tool.git",
        "git@gitea.com:team/tool.git",
        "https://gitea.internal.example/team/tool.git",
        "https://forgejo.example.org/team/tool.git",
    ] {
        let h = handle(&repo, url);
        assert_eq!(h.provider.as_str(), "gitea", "{url}");
        assert_eq!(h.owner, "team", "{url}");
        assert_eq!(h.repo, "tool", "{url}");
    }
}

#[test]
fn parse_origin_url_uppercase_host_still_matches_the_provider_table() {
    let repo = repo_with_origin("origin-case", "git@github.com:acme/app.git");
    let h = handle(&repo, "https://BitBucket.ORG/team/repo.git");
    assert_eq!(h.provider.as_str(), "bitbucket");
    assert_eq!(h.host, "BitBucket.ORG", "the original host casing is preserved");
}

#[test]
fn parse_origin_url_rejects_unusable_remotes() {
    let repo = repo_with_origin("origin-bad", "git@github.com:acme/app.git");

    assert!(handle_err(&repo, "ftp://example.com/acme/app.git").contains("nicht erkannt"));
    assert!(handle_err(&repo, "https://github.com/acme").contains("Unerwartetes Remote-URL-Format"));
    assert!(handle_err(&repo, "git@github.com:acme.git").contains("Unerwartetes Remote-URL-Format"));

    let bare = TestRepo::new("origin-missing");
    bare.commit("a.txt", "1\n", "c1");
    assert!(err_of(parse_origin_url(&bare.path), "a repo without origin")
        .contains("Kein Remote 'origin' konfiguriert"));
}

#[test]
fn github_api_base_switches_between_dotcom_and_enterprise() {
    assert_eq!(github_api_base("github.com"), "https://api.github.com");
    assert_eq!(github_api_base("GitHub.com"), "https://api.github.com");
    assert_eq!(
        github_api_base("github.corp.example"),
        "https://github.corp.example/api/v3"
    );
    assert_eq!(
        github_api_base("github.corp.example/"),
        "https://github.corp.example/api/v3"
    );
}

#[test]
fn github_repo_api_url_joins_owner_repo_and_suffix() {
    let dotcom = RemoteHandle {
        host: "github.com".into(),
        provider: Provider::GitHub,
        owner: "acme".into(),
        repo: "app".into(),
    };
    assert_eq!(
        github_repo_api_url(&dotcom, "pulls?state=open"),
        "https://api.github.com/repos/acme/app/pulls?state=open"
    );
    assert_eq!(
        github_repo_api_url(&dotcom, "/pulls/7/files"),
        "https://api.github.com/repos/acme/app/pulls/7/files",
        "a leading slash in the suffix must not produce a double slash"
    );

    let ghe = RemoteHandle {
        host: "github.corp.example".into(),
        provider: Provider::GitHub,
        owner: "platform".into(),
        repo: "service".into(),
    };
    assert_eq!(
        github_repo_api_url(&ghe, "commits/abc123/check-runs?per_page=100"),
        "https://github.corp.example/api/v3/repos/platform/service/commits/abc123/check-runs?per_page=100"
    );
}

#[test]
fn unsupported_provider_error_is_a_structured_code_with_the_host() {
    let msg = unsupported_provider_err("git.internal.example");
    assert_eq!(msg, "__PROVIDER_UNKNOWN__|git.internal.example");
    assert!(msg.starts_with(PROVIDER_UNKNOWN_CODE), "{msg}");
    assert_eq!(
        msg.split('|').nth(1),
        Some("git.internal.example"),
        "the frontend splits the host off the marker"
    );
    assert_eq!(
        unsupported_provider_err("  spaced.example  "),
        "__PROVIDER_UNKNOWN__|spaced.example"
    );
}

#[test]
fn encode_uri_component_escapes_everything_outside_the_unreserved_set() {
    assert_eq!(encode_uri_component("aZ0-_.~"), "aZ0-_.~");
    assert_eq!(encode_uri_component("feature/new thing"), "feature%2Fnew%20thing");
    assert_eq!(encode_uri_component("team/repo:branch"), "team%2Frepo%3Abranch");
    assert_eq!(encode_uri_component("ä"), "%C3%A4");
    assert_eq!(encode_uri_component(""), "");
}

#[test]
fn trunc_chars_counts_characters_not_bytes() {
    assert_eq!(trunc_chars("abc", 3), "abc");
    assert_eq!(trunc_chars("abc", 10), "abc");
    assert_eq!(
        trunc_chars("abcdef", 3),
        "abc\n\n… (6 Zeichen gesamt, gekürzt auf 3)"
    );
    assert_eq!(
        trunc_chars("äöüßx", 2),
        "äö\n\n… (5 Zeichen gesamt, gekürzt auf 2)",
        "multi-byte input must not be cut mid-character"
    );
}

#[test]
fn value_helpers_fall_back_to_empty_strings() {
    assert_eq!(str_or_empty(&jval!("text")), "text");
    assert_eq!(str_or_empty(&jval!(null)), "");
    assert_eq!(str_or_empty(&jval!(42)), "");
    assert_eq!(first_non_empty("a".into(), "b".into()), "a");
    assert_eq!(first_non_empty("".into(), "b".into()), "b");
}

#[test]
fn gh_map_pr_maps_an_open_pull_request() {
    let raw = jval!({
        "number": 42,
        "title": "Add search",
        "state": "open",
        "draft": false,
        "node_id": "PR_kwDO",
        "user": { "login": "octocat", "avatar_url": "https://avatars/octocat" },
        "head": { "ref": "feature/search" },
        "base": { "ref": "main" },
        "html_url": "https://github.com/acme/app/pull/42",
        "created_at": "2024-01-01T10:00:00Z",
        "updated_at": "2024-01-02T10:00:00Z",
        "labels": [ { "name": "enhancement" }, { "name": "ui" } ],
        "requested_reviewers": [ { "login": "reviewer", "avatar_url": "https://avatars/reviewer" } ]
    });

    let pr = json(&gh_map_pr(&raw));
    assert_eq!(pr["number"], 42);
    assert_eq!(pr["title"], "Add search");
    assert_eq!(pr["state"], "open");
    assert_eq!(pr["is_draft"], false);
    assert_eq!(pr["author"], "octocat");
    assert_eq!(pr["author_avatar"], "https://avatars/octocat");
    assert_eq!(pr["source_branch"], "feature/search");
    assert_eq!(pr["target_branch"], "main");
    assert_eq!(pr["provider"], "github");
    assert_eq!(pr["node_id"], "PR_kwDO");
    assert_eq!(pr["labels"], jval!(["enhancement", "ui"]));
    assert_eq!(pr["reviewers"][0]["login"], "reviewer");
    assert_eq!(pr["reviewers"][0]["avatar"], "https://avatars/reviewer");
}

#[test]
fn gh_map_pr_derives_merged_and_draft_states() {
    let merged = json(&gh_map_pr(&jval!({
        "number": 1, "state": "closed", "draft": false, "merged_at": "2024-02-01T00:00:00Z"
    })));
    assert_eq!(merged["state"], "merged");

    let draft = json(&gh_map_pr(&jval!({ "number": 2, "state": "open", "draft": true })));
    assert_eq!(draft["state"], "draft");
    assert_eq!(draft["is_draft"], true);

    let closed = json(&gh_map_pr(&jval!({ "number": 3, "state": "closed", "draft": true })));
    assert_eq!(
        closed["state"], "closed",
        "a closed draft keeps the closed state"
    );

    let sparse = json(&gh_map_pr(&jval!({})));
    assert_eq!(sparse["number"], 0);
    assert_eq!(sparse["title"], "");
    assert_eq!(sparse["labels"], jval!([]));
    assert_eq!(sparse["reviewers"], jval!([]));
    assert!(sparse.get("node_id").is_none(), "empty node_id is skipped");
    assert!(sparse["author_avatar"].is_null());
}

#[test]
fn bb_map_pr_normalises_bitbucket_states_and_nested_fields() {
    let raw = jval!({
        "id": 7,
        "title": "Bitbucket change",
        "state": "DECLINED",
        "author": {
            "display_name": "Jane Doe",
            "links": { "avatar": { "href": "https://bb/avatar" } }
        },
        "source": { "branch": { "name": "feature" } },
        "destination": { "branch": { "name": "develop" } },
        "links": { "html": { "href": "https://bitbucket.org/team/repo/pull-requests/7" } },
        "created_on": "2024-03-01T00:00:00Z",
        "updated_on": "2024-03-02T00:00:00Z",
        "reviewers": [ { "display_name": "Rev Iewer", "links": { "avatar": { "href": "https://bb/rev" } } } ]
    });

    let pr = json(&bb_map_pr(&raw));
    assert_eq!(pr["number"], 7);
    assert_eq!(pr["state"], "closed", "DECLINED maps onto closed");
    assert_eq!(pr["author"], "Jane Doe");
    assert_eq!(pr["author_avatar"], "https://bb/avatar");
    assert_eq!(pr["source_branch"], "feature");
    assert_eq!(pr["target_branch"], "develop");
    assert_eq!(pr["html_url"], "https://bitbucket.org/team/repo/pull-requests/7");
    assert_eq!(pr["provider"], "bitbucket");
    assert_eq!(pr["labels"], jval!([]));
    assert_eq!(pr["reviewers"][0]["login"], "Rev Iewer");
    assert!(pr.get("node_id").is_none());

    for (raw_state, expected) in [
        ("OPEN", "open"),
        ("MERGED", "merged"),
        ("SUPERSEDED", "closed"),
        ("WEIRD", "weird"),
    ] {
        let mapped = json(&bb_map_pr(&jval!({ "id": 1, "state": raw_state })));
        assert_eq!(mapped["state"], expected, "state {raw_state}");
    }
}

#[test]
fn bb_commit_status_maps_onto_a_pr_check() {
    let full = json(&bb_commit_status_to_pr_check(&jval!({
        "key": "PIPELINE",
        "name": "Build",
        "state": "SUCCESSFUL",
        "url": "https://ci.example/build/1",
        "commit": { "hash": "deadbeef" },
        "uuid": "{1234}",
        "created_on": "2024-04-01T00:00:00Z",
        "updated_on": "2024-04-01T01:00:00Z",
        "description": "all good"
    })));
    assert_eq!(full["name"], "Build");
    assert_eq!(full["status"], "SUCCESSFUL");
    assert_eq!(full["conclusion"], "SUCCESSFUL");
    assert_eq!(full["html_url"], "https://ci.example/build/1");
    assert_eq!(full["details_url"], "https://ci.example/build/1");
    assert_eq!(full["ci_kind"], "bitbucket_commit_status");
    assert_eq!(full["key"], "PIPELINE");
    assert_eq!(full["head_sha"], "deadbeef");
    assert_eq!(full["description"], "all good");
    assert_eq!(full["status_uuid"], "{1234}");

    let fallback = json(&bb_commit_status_to_pr_check(&jval!({
        "key": "PIPELINE",
        "state": "FAILED",
        "links": { "html": { "href": "https://bb/status" } }
    })));
    assert_eq!(fallback["name"], "PIPELINE", "name falls back to the key");
    assert_eq!(fallback["html_url"], "https://bb/status");

    let empty = json(&bb_commit_status_to_pr_check(&jval!({ "state": "INPROGRESS" })));
    assert_eq!(empty["name"], "");
    assert!(empty.get("key").is_none(), "an empty key is omitted");
    assert!(empty["html_url"].is_null());
}

#[test]
fn split_unified_diff_by_file_splits_on_diff_headers() {
    let diff = "diff --git a/src/a.ts b/src/a.ts\nindex 111..222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/docs/b.md b/docs/b.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/b.md\n@@ -0,0 +1 @@\n+hello\n";

    let files = split_unified_diff_by_file(diff);
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].0, "src/a.ts");
    assert!(files[0].1.contains("+new"));
    assert!(!files[0].1.contains("+hello"), "hunks must not bleed across files");
    assert_eq!(files[1].0, "docs/b.md");
    assert!(files[1].1.starts_with("diff --git a/docs/b.md"));
    assert!(files[1].1.contains("+hello"));

    assert!(split_unified_diff_by_file("").is_empty());
    assert!(
        split_unified_diff_by_file("garbage without a header\n").is_empty(),
        "content before the first header is dropped"
    );
}

#[test]
fn origin_default_branch_prefers_the_remote_head_symref() {
    let repo = repo_with_origin("default-branch-symref", "git@github.com:acme/app.git");
    repo.git(&["update-ref", "refs/remotes/origin/develop", "HEAD"]);
    repo.git(&["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"]);

    assert_eq!(origin_default_branch(&repo.path).unwrap(), "develop");
}

#[test]
fn origin_default_branch_falls_back_to_known_names_then_main() {
    let repo = repo_with_origin("default-branch-fallback", "git@github.com:acme/app.git");
    assert_eq!(
        origin_default_branch(&repo.path).unwrap(),
        "main",
        "without any remote ref the fallback is main"
    );

    repo.git(&["update-ref", "refs/remotes/origin/master", "HEAD"]);
    assert_eq!(origin_default_branch(&repo.path).unwrap(), "master");
}

#[test]
fn current_branch_rejects_a_detached_head() {
    let repo = repo_with_origin("current-branch", "git@github.com:acme/app.git");
    assert_eq!(current_branch(&repo.path).unwrap(), "main");

    let head = repo.head();
    repo.git(&["checkout", "-q", &head]);
    assert!(current_branch(&repo.path)
        .unwrap_err()
        .contains("Aktueller Branch"));
}

#[test]
fn strip_remote_prefix_only_strips_configured_remote_names() {
    let repo = repo_with_origin("strip-prefix", "git@github.com:acme/app.git");

    assert_eq!(strip_remote_prefix(&repo.path, "origin/feature").unwrap(), "feature");
    assert_eq!(
        strip_remote_prefix(&repo.path, "feature/login").unwrap(),
        "feature/login",
        "a slash alone must not be treated as a remote prefix"
    );
    assert_eq!(strip_remote_prefix(&repo.path, "  main  ").unwrap(), "main");
    assert_eq!(strip_remote_prefix(&repo.path, "   ").unwrap(), "");
    assert_eq!(
        strip_remote_prefix(&repo.path, "origin/feature/deep").unwrap(),
        "feature/deep"
    );
}

#[test]
fn pr_create_web_url_builds_a_github_compare_link() {
    let repo = repo_with_origin("web-url-github", "git@github.com:acme/app.git");
    repo.git(&["checkout", "-q", "-b", "feature/ä-b"]);

    assert_eq!(
        pr_create_web_url(repo.s(), "feature/ä-b".into()).unwrap(),
        "https://github.com/acme/app/compare/main...feature%2F%C3%A4-b"
    );
    assert_eq!(
        pr_create_web_url(repo.s(), "origin/feature".into()).unwrap(),
        "https://github.com/acme/app/compare/main...feature",
        "a remote-qualified branch is stripped before comparing"
    );
}

#[test]
fn pr_create_web_url_builds_a_bitbucket_link() {
    let repo = repo_with_origin("web-url-bitbucket", "https://bitbucket.org/team/repo.git");

    assert_eq!(
        pr_create_web_url(repo.s(), "feature".into()).unwrap(),
        "https://bitbucket.org/team/repo/pull-requests/new?source=team%2Frepo%3Afeature&dest=team%2Frepo%3Amain"
    );
}

#[test]
fn pr_create_web_url_reports_the_unusable_cases() {
    let repo = repo_with_origin("web-url-errors", "git@github.com:acme/app.git");

    assert!(pr_create_web_url(repo.s(), "main".into())
        .unwrap_err()
        .contains("Standard-Branch"));
    assert!(pr_create_web_url(repo.s(), "  ".into())
        .unwrap_err()
        .contains("Branch-Name leer"));
    assert!(pr_create_web_url(
        repo.path.join("a.txt").to_string_lossy().to_string(),
        "feature".into()
    )
    .unwrap_err()
    .contains("kein Verzeichnis"));

    repo.git(&["config", "remote.origin.url", "https://git.internal.example/group/project.git"]);
    assert_eq!(
        pr_create_web_url(repo.s(), "feature".into()).unwrap_err(),
        "__PROVIDER_UNKNOWN__|git.internal.example"
    );
}

#[test]
fn pr_create_web_url_builds_gitlab_and_gitea_links() {
    let repo = repo_with_origin("web-url-gitlab", "https://gitlab.com/group/sub/project.git");
    assert_eq!(
        pr_create_web_url(repo.s(), "feature/login".into()).unwrap(),
        "https://gitlab.com/group/sub/project/-/merge_requests/new?merge_request%5Bsource_branch%5D=feature%2Flogin&merge_request%5Btarget_branch%5D=main"
    );

    repo.git(&["config", "remote.origin.url", "https://codeberg.org/team/tool.git"]);
    assert_eq!(
        pr_create_web_url(repo.s(), "feature".into()).unwrap(),
        "https://codeberg.org/team/tool/compare/main...feature",
        "Gitea reuses the GitHub compare route"
    );
}


fn gitlab_handle(owner: &str, repo: &str) -> RemoteHandle {
    RemoteHandle {
        host: "gitlab.example.com".into(),
        provider: Provider::GitLab,
        owner: owner.into(),
        repo: repo.into(),
    }
}

fn gitlab_mr_fixture() -> serde_json::Value {
    jval!({
        "id": 9001,
        "iid": 12,
        "title": "Add pipelines",
        "description": "Adds the pipeline view.\n\nCloses #3",
        "state": "opened",
        "draft": false,
        "work_in_progress": false,
        "merge_status": "can_be_merged",
        "detailed_merge_status": "mergeable",
        "sha": "abc123def456",
        "merge_commit_sha": null,
        "squash": false,
        "merge_when_pipeline_succeeds": false,
        "source_branch": "feature/pipelines",
        "target_branch": "main",
        "web_url": "https://gitlab.example.com/group/sub/project/-/merge_requests/12",
        "created_at": "2024-05-01T10:00:00.000Z",
        "updated_at": "2024-05-02T11:00:00.000Z",
        "labels": ["ci", "feature"],
        "author": {
            "name": "Ada Lovelace",
            "username": "ada",
            "avatar_url": "https://gitlab.example.com/uploads/ada.png"
        },
        "reviewers": [
            { "name": "Grace Hopper", "username": "grace", "avatar_url": "https://gl/grace.png" },
            { "username": "onlyuser" }
        ]
    })
}

#[test]
fn gitlab_api_urls_encode_subgroup_project_paths() {
    assert_eq!(
        gitlab_api_base("gitlab.com"),
        "https://gitlab.com/api/v4"
    );
    assert_eq!(
        gitlab_api_base("gitlab.example.com/"),
        "https://gitlab.example.com/api/v4",
        "a trailing slash must not produce a double slash"
    );

    let flat = gitlab_handle("group", "project");
    assert_eq!(gitlab_project_id(&flat), "group%2Fproject");
    assert_eq!(
        gitlab_project_url(&flat, "merge_requests/12/notes"),
        "https://gitlab.example.com/api/v4/projects/group%2Fproject/merge_requests/12/notes"
    );
    assert_eq!(
        gitlab_project_url(&flat, "/merge_requests"),
        "https://gitlab.example.com/api/v4/projects/group%2Fproject/merge_requests",
        "a leading slash in the suffix is trimmed"
    );

    let nested = gitlab_handle("top", "middle/inner/service");
    assert_eq!(
        gitlab_project_id(&nested),
        "top%2Fmiddle%2Finner%2Fservice",
        "every subgroup separator has to be percent-encoded"
    );
}

#[test]
fn gitlab_auth_header_picks_private_token_or_bearer() {
    assert_eq!(
        gitlab_auth_header(Some("git"), "glpat-secret"),
        ("PRIVATE-TOKEN", "glpat-secret".to_string())
    );
    assert_eq!(
        gitlab_auth_header(None, "  glpat-secret  "),
        ("PRIVATE-TOKEN", "glpat-secret".to_string()),
        "the token is trimmed before it is sent"
    );
    assert_eq!(
        gitlab_auth_header(Some("oauth2"), "abc"),
        ("Authorization", "Bearer abc".to_string())
    );
    assert_eq!(
        gitlab_auth_header(Some("OAuth2"), "abc"),
        ("Authorization", "Bearer abc".to_string())
    );
    assert_eq!(
        gitlab_auth_header(Some("git"), "gloas-abc"),
        ("Authorization", "Bearer gloas-abc".to_string()),
        "an OAuth application token is recognised by its prefix"
    );
}

#[test]
fn gitea_api_base_uses_api_v1_on_the_github_code_path() {
    assert_eq!(gitea_api_base("codeberg.org"), "https://codeberg.org/api/v1");
    assert_eq!(
        gitea_api_base("gitea.internal.example/"),
        "https://gitea.internal.example/api/v1"
    );

    let gitea = RemoteHandle {
        host: "codeberg.org".into(),
        provider: Provider::Gitea,
        owner: "team".into(),
        repo: "tool".into(),
    };
    assert_eq!(provider_api_base(&gitea), "https://codeberg.org/api/v1");
    assert_eq!(
        github_repo_api_url(&gitea, "pulls/4/commits"),
        "https://codeberg.org/api/v1/repos/team/tool/pulls/4/commits"
    );

    let gh = RemoteHandle {
        host: "github.com".into(),
        provider: Provider::GitHub,
        owner: "acme".into(),
        repo: "app".into(),
    };
    assert_eq!(provider_api_base(&gh), github_api_base("github.com"));
}

#[test]
fn gl_map_mr_maps_an_open_merge_request() {
    let mr = json(&gl_map_mr(&gitlab_mr_fixture()));
    assert_eq!(mr["number"], 12, "the iid is the user-facing number");
    assert_eq!(mr["title"], "Add pipelines");
    assert_eq!(mr["state"], "open");
    assert_eq!(mr["is_draft"], false);
    assert_eq!(mr["author"], "Ada Lovelace");
    assert_eq!(mr["author_avatar"], "https://gitlab.example.com/uploads/ada.png");
    assert_eq!(mr["source_branch"], "feature/pipelines");
    assert_eq!(mr["target_branch"], "main");
    assert_eq!(
        mr["html_url"],
        "https://gitlab.example.com/group/sub/project/-/merge_requests/12"
    );
    assert_eq!(mr["created_at"], "2024-05-01T10:00:00.000Z");
    assert_eq!(mr["provider"], "gitlab");
    assert_eq!(mr["labels"], jval!(["ci", "feature"]));
    assert_eq!(mr["reviewers"][0]["login"], "Grace Hopper");
    assert_eq!(mr["reviewers"][0]["avatar"], "https://gl/grace.png");
    assert_eq!(
        mr["reviewers"][1]["login"], "onlyuser",
        "a reviewer without a display name falls back to the username"
    );
    assert!(mr.get("node_id").is_none(), "GitLab has no GraphQL node id");
}

#[test]
fn gl_map_mr_normalises_states_and_draft_flavours() {
    for (state, expected) in [
        ("opened", "open"),
        ("locked", "open"),
        ("merged", "merged"),
        ("closed", "closed"),
        ("weird", "weird"),
    ] {
        let mapped = json(&gl_map_mr(&jval!({ "iid": 1, "state": state })));
        assert_eq!(mapped["state"], expected, "state {state}");
    }

    let flagged = json(&gl_map_mr(&jval!({ "iid": 2, "state": "opened", "draft": true })));
    assert_eq!(flagged["state"], "draft");
    assert_eq!(flagged["is_draft"], true);

    let wip = json(&gl_map_mr(&jval!({
        "iid": 3, "state": "opened", "title": "WIP: not ready"
    })));
    assert_eq!(wip["is_draft"], true, "the WIP title prefix marks a draft");
    assert_eq!(wip["state"], "draft");

    let draft_prefix = json(&gl_map_mr(&jval!({
        "iid": 4, "state": "opened", "title": "Draft: still cooking"
    })));
    assert_eq!(draft_prefix["state"], "draft");

    let merged_draft = json(&gl_map_mr(&jval!({
        "iid": 5, "state": "merged", "title": "Draft: shipped anyway"
    })));
    assert_eq!(
        merged_draft["state"], "merged",
        "a merged MR keeps the merged state even when the title says draft"
    );

    let sparse = json(&gl_map_mr(&jval!({})));
    assert_eq!(sparse["number"], 0);
    assert_eq!(sparse["labels"], jval!([]));
    assert_eq!(sparse["reviewers"], jval!([]));
    assert!(sparse["author_avatar"].is_null());
}

#[test]
fn gl_map_mr_reads_label_objects_as_well_as_plain_strings() {
    let mapped = json(&gl_map_mr(&jval!({
        "iid": 8,
        "state": "opened",
        "labels": [{ "name": "bug" }, { "name": "ui" }]
    })));
    assert_eq!(mapped["labels"], jval!(["bug", "ui"]));
}

#[test]
fn gl_mergeable_reads_both_merge_status_fields() {
    assert_eq!(gl_mergeable(&jval!({ "detailed_merge_status": "mergeable" })), Some(true));
    assert_eq!(gl_mergeable(&jval!({ "detailed_merge_status": "broken_status" })), Some(false));
    assert_eq!(gl_mergeable(&jval!({ "detailed_merge_status": "checking" })), None);
    assert_eq!(gl_mergeable(&jval!({ "detailed_merge_status": "ci_still_running" })), None);
    assert_eq!(gl_mergeable(&jval!({ "merge_status": "can_be_merged" })), Some(true));
    assert_eq!(gl_mergeable(&jval!({ "merge_status": "cannot_be_merged" })), Some(false));
    assert_eq!(gl_mergeable(&jval!({ "merge_status": "unchecked" })), None);
    assert_eq!(gl_mergeable(&jval!({})), None);
}

#[test]
fn gl_map_detail_carries_description_head_sha_and_auto_merge() {
    let detail = json(&gl_map_detail(&gitlab_mr_fixture()));
    assert_eq!(detail["number"], 12, "the base PR fields are flattened in");
    assert_eq!(detail["body_markdown"], "Adds the pipeline view.\n\nCloses #3");
    assert_eq!(detail["mergeable"], true);
    assert_eq!(detail["head_sha"], "abc123def456");
    assert!(detail["merge_commit_sha"].is_null());
    assert!(
        detail.get("auto_merge_method").is_none(),
        "auto merge is omitted when it is not armed"
    );

    let armed = json(&gl_map_detail(&jval!({
        "iid": 4,
        "state": "opened",
        "merge_when_pipeline_succeeds": true,
        "squash": true,
        "diff_refs": { "head_sha": "fallbacksha" },
        "squash_commit_sha": "squashed"
    })));
    assert_eq!(armed["auto_merge_method"], "squash");
    assert_eq!(armed["merge_commit_sha"], "squashed");
    assert_eq!(
        armed["head_sha"], "fallbacksha",
        "diff_refs.head_sha backs up a missing sha"
    );
}

#[test]
fn gl_map_commit_maps_the_gitlab_commit_shape() {
    let c = json(&gl_map_commit(&jval!({
        "id": "0123456789abcdef",
        "short_id": "01234567",
        "title": "Fix pipeline",
        "message": "Fix pipeline\n\nlong body",
        "author_name": "Ada",
        "author_email": "ada@example.com",
        "authored_date": "2024-05-01T09:00:00.000Z",
        "created_at": "2024-05-01T09:30:00.000Z"
    })));
    assert_eq!(c["hash"], "0123456789abcdef");
    assert_eq!(c["short_hash"], "01234567");
    assert_eq!(c["author"], "Ada");
    assert_eq!(c["email"], "ada@example.com");
    assert_eq!(c["date"], "2024-05-01T09:00:00.000Z");
    assert_eq!(c["subject"], "Fix pipeline");
    assert!(c["author_avatar"].is_null());

    let sparse = json(&gl_map_commit(&jval!({
        "id": "abcdef1234567890",
        "message": "Only a message\nsecond line"
    })));
    assert_eq!(
        sparse["short_hash"], "abcdef1",
        "a missing short_id is derived from the hash"
    );
    assert_eq!(
        sparse["subject"], "Only a message",
        "a missing title falls back to the first message line"
    );
}

#[test]
fn gl_diff_entries_map_onto_the_pr_file_shape() {
    let modified = jval!({
        "old_path": "src/app.ts",
        "new_path": "src/app.ts",
        "new_file": false,
        "renamed_file": false,
        "deleted_file": false,
        "diff": "@@ -1,3 +1,4 @@\n context\n-old line\n+new line\n+another\n"
    });
    let file = json(&gl_map_file(&modified));
    assert_eq!(file["path"], "src/app.ts");
    assert_eq!(file["status"], "modified");
    assert_eq!(file["additions"], 2);
    assert_eq!(file["deletions"], 1);
    assert!(
        file.get("patch").is_none(),
        "patches stay lazy, exactly like the GitHub and Bitbucket paths"
    );

    assert_eq!(gl_diff_status(&jval!({ "new_file": true })), "added");
    assert_eq!(gl_diff_status(&jval!({ "deleted_file": true })), "removed");
    assert_eq!(gl_diff_status(&jval!({ "renamed_file": true })), "renamed");
    assert_eq!(gl_diff_status(&jval!({})), "modified");

    assert_eq!(
        gl_diff_counts("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n"),
        (1, 1),
        "the file headers must not be counted as added or removed lines"
    );
    assert_eq!(gl_diff_counts(""), (0, 0));

    let deleted = json(&gl_map_file(&jval!({
        "old_path": "docs/old.md",
        "new_path": "docs/old.md",
        "deleted_file": true,
        "diff": "@@ -1 +0,0 @@\n-gone\n"
    })));
    assert_eq!(deleted["status"], "removed");
    assert_eq!(deleted["path"], "docs/old.md");
}

#[test]
fn gl_diff_patch_rebuilds_the_unified_diff_header() {
    let modified = gl_diff_patch(&jval!({
        "old_path": "src/app.ts",
        "new_path": "src/app.ts",
        "diff": "@@ -1 +1 @@\n-old\n+new\n"
    }));
    assert_eq!(
        modified,
        "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n"
    );
    assert_eq!(
        split_unified_diff_by_file(&modified)[0].0,
        "src/app.ts",
        "the rebuilt patch stays parsable by the shared diff splitter"
    );

    let added = gl_diff_patch(&jval!({
        "old_path": "new.txt",
        "new_path": "new.txt",
        "new_file": true,
        "diff": "@@ -0,0 +1 @@\n+hello"
    }));
    assert!(added.contains("--- /dev/null"), "{added}");
    assert!(added.contains("+++ b/new.txt"), "{added}");
    assert!(added.ends_with('\n'), "a trailing newline is added: {added}");

    let deleted = gl_diff_patch(&jval!({
        "old_path": "gone.txt",
        "new_path": "gone.txt",
        "deleted_file": true,
        "diff": "@@ -1 +0,0 @@\n-bye\n"
    }));
    assert!(deleted.contains("--- a/gone.txt"), "{deleted}");
    assert!(deleted.contains("+++ /dev/null"), "{deleted}");

    let renamed = gl_diff_patch(&jval!({
        "old_path": "old/name.ts",
        "new_path": "new/name.ts",
        "renamed_file": true,
        "diff": ""
    }));
    assert!(
        renamed.starts_with("diff --git a/old/name.ts b/new/name.ts\n"),
        "{renamed}"
    );
}

#[test]
fn gl_map_note_skips_system_notes_and_keeps_inline_positions() {
    let plain = gl_map_note(&jval!({
        "id": 55,
        "system": false,
        "body": "Looks good",
        "created_at": "2024-05-03T08:00:00.000Z",
        "author": { "name": "Grace Hopper", "username": "grace", "avatar_url": "https://gl/g.png" }
    }))
    .expect("a regular note becomes a comment");
    let plain = json(&plain);
    assert_eq!(plain["id"], "55");
    assert_eq!(plain["author"], "Grace Hopper");
    assert_eq!(plain["author_avatar"], "https://gl/g.png");
    assert_eq!(plain["body"], "Looks good");
    assert_eq!(plain["kind"], "issue");
    assert!(plain["file_path"].is_null());
    assert!(plain["line"].is_null());

    let inline = json(&gl_map_note(&jval!({
        "id": 56,
        "body": "nit: rename this",
        "created_at": "2024-05-03T09:00:00.000Z",
        "author": { "username": "ada" },
        "position": { "new_path": "src/app.ts", "old_path": "src/app.ts", "new_line": 42 }
    }))
    .expect("a positioned note is an inline comment"));
    assert_eq!(inline["kind"], "inline");
    assert_eq!(inline["file_path"], "src/app.ts");
    assert_eq!(inline["line"], 42);
    assert_eq!(inline["author"], "ada");

    let old_line_only = json(&gl_map_note(&jval!({
        "id": 57,
        "body": "removed here",
        "position": { "old_path": "src/gone.ts", "old_line": 7 }
    }))
    .unwrap());
    assert_eq!(old_line_only["file_path"], "src/gone.ts");
    assert_eq!(old_line_only["line"], 7);

    assert!(
        gl_map_note(&jval!({ "id": 1, "system": true, "body": "assigned to @ada" })).is_none(),
        "system notes are activity noise, not conversation"
    );
    assert!(
        gl_map_note(&jval!({ "id": 2, "body": "   " })).is_none(),
        "empty bodies are dropped"
    );
}

#[test]
fn gl_approvals_become_approved_reviews() {
    let reviews = gl_approvals_to_reviews(&jval!({
        "updated_at": "2024-05-04T10:00:00.000Z",
        "approved_by": [
            { "user": { "name": "Grace Hopper", "username": "grace", "avatar_url": "https://gl/g.png" } },
            { "user": { "username": "ada" } }
        ]
    }));
    assert_eq!(reviews.len(), 2);
    let first = json(&reviews[0]);
    assert_eq!(first["state"], "APPROVED");
    assert_eq!(first["author"], "Grace Hopper");
    assert_eq!(first["author_avatar"], "https://gl/g.png");
    assert_eq!(first["submitted_at"], "2024-05-04T10:00:00.000Z");
    assert_eq!(first["id"], "approval-grace");
    assert_eq!(first["body"], "");
    assert_eq!(json(&reviews[1])["author"], "ada");

    assert!(gl_approvals_to_reviews(&jval!({ "approved_by": [] })).is_empty());
    assert!(gl_approvals_to_reviews(&jval!({})).is_empty());
}

#[test]
fn gl_status_to_check_state_maps_pipeline_states_onto_the_check_model() {
    for (raw, status, conclusion) in [
        ("success", "completed", Some("success")),
        ("failed", "completed", Some("failure")),
        ("canceled", "completed", Some("cancelled")),
        ("cancelled", "completed", Some("cancelled")),
        ("skipped", "completed", Some("skipped")),
        ("manual", "completed", Some("action_required")),
        ("running", "in_progress", None),
        ("pending", "queued", None),
        ("created", "queued", None),
        ("waiting_for_resource", "queued", None),
        ("SUCCESS", "completed", Some("success")),
        ("something_new", "something_new", None),
    ] {
        let (mapped_status, mapped_conclusion) = gl_status_to_check_state(raw);
        assert_eq!(mapped_status, status, "status for {raw}");
        assert_eq!(
            mapped_conclusion.as_deref(),
            conclusion,
            "conclusion for {raw}"
        );
    }
}

#[test]
fn gl_pipeline_and_job_map_onto_pr_checks() {
    let pipeline = json(&gl_pipeline_to_pr_check(&jval!({
        "id": 4711,
        "iid": 12,
        "sha": "abc123",
        "ref": "feature/pipelines",
        "status": "running",
        "source": "merge_request_event",
        "web_url": "https://gitlab.example.com/group/project/-/pipelines/4711",
        "created_at": "2024-05-05T10:00:00.000Z",
        "updated_at": "2024-05-05T10:05:00.000Z"
    })));
    assert_eq!(pipeline["name"], "Pipeline #4711");
    assert_eq!(pipeline["status"], "in_progress");
    assert!(pipeline["conclusion"].is_null());
    assert_eq!(pipeline["ci_kind"], "gitlab_pipeline");
    assert_eq!(pipeline["head_sha"], "abc123");
    assert_eq!(pipeline["key"], "merge_request_event");
    assert_eq!(pipeline["description"], "feature/pipelines");
    assert_eq!(pipeline["check_suite_id"], "4711");
    assert_eq!(
        pipeline["html_url"],
        "https://gitlab.example.com/group/project/-/pipelines/4711"
    );
    assert_eq!(pipeline["details_url"], pipeline["html_url"]);
    assert_eq!(pipeline["app_name"], "GitLab CI");

    let job = json(&gl_job_to_pr_check(&jval!({
        "id": 88,
        "name": "rspec",
        "stage": "test",
        "status": "failed",
        "web_url": "https://gitlab.example.com/group/project/-/jobs/88",
        "created_at": "2024-05-05T10:01:00.000Z",
        "started_at": "2024-05-05T10:02:00.000Z",
        "finished_at": "2024-05-05T10:04:00.000Z",
        "commit": { "id": "abc123" },
        "pipeline": { "id": 4711, "sha": "abc123" }
    })));
    assert_eq!(job["name"], "rspec");
    assert_eq!(job["status"], "completed");
    assert_eq!(job["conclusion"], "failure");
    assert_eq!(job["ci_kind"], "gitlab_job");
    assert_eq!(job["key"], "test");
    assert_eq!(job["head_sha"], "abc123");
    assert_eq!(job["started_at"], "2024-05-05T10:02:00.000Z");
    assert_eq!(job["completed_at"], "2024-05-05T10:04:00.000Z");
    assert_eq!(job["external_id"], "88");
    assert_eq!(job["check_suite_id"], "4711");

    let bare = json(&gl_pipeline_to_pr_check(&jval!({ "status": "success" })));
    assert_eq!(bare["name"], "Pipeline");
    assert_eq!(bare["conclusion"], "success");
    assert!(bare["html_url"].is_null());
    assert!(bare.get("key").is_none(), "an absent source is omitted");
}

#[test]
fn gl_commit_status_maps_onto_a_pr_check() {
    let status = json(&gl_commit_status_to_pr_check(&jval!({
        "id": 91,
        "sha": "deadbeef",
        "ref": "main",
        "status": "success",
        "name": "lint",
        "stage": "test",
        "description": "all good",
        "target_url": "https://gitlab.example.com/group/project/-/jobs/91",
        "created_at": "2024-05-06T10:00:00.000Z",
        "started_at": "2024-05-06T10:01:00.000Z",
        "finished_at": "2024-05-06T10:02:00.000Z"
    })));
    assert_eq!(status["name"], "lint");
    assert_eq!(status["status"], "completed");
    assert_eq!(status["conclusion"], "success");
    assert_eq!(status["ci_kind"], "gitlab_commit_status");
    assert_eq!(status["head_sha"], "deadbeef");
    assert_eq!(status["key"], "test");
    assert_eq!(status["description"], "all good");
    assert_eq!(status["external_id"], "91");
    assert_eq!(
        status["html_url"],
        "https://gitlab.example.com/group/project/-/jobs/91"
    );

    let fallback = json(&gl_commit_status_to_pr_check(&jval!({
        "status": "canceled", "stage": "build"
    })));
    assert_eq!(fallback["name"], "build", "the stage backs up a missing name");
    assert_eq!(fallback["conclusion"], "cancelled");
    assert!(fallback["html_url"].is_null());
}

#[test]
fn provider_capabilities_describe_what_each_forge_can_do() {
    let gh = json(&provider_capabilities(Provider::GitHub, "github.com"));
    assert_eq!(gh["provider"], "github");
    assert_eq!(gh["host"], "github.com");
    assert_eq!(gh["can_approve"], true);
    assert_eq!(gh["can_request_changes"], true);
    assert_eq!(gh["can_auto_merge"], true);
    assert_eq!(gh["can_workflows"], true);
    assert_eq!(gh["merge_strategies"], jval!(["merge", "squash", "rebase"]));

    let gl = json(&provider_capabilities(Provider::GitLab, "gitlab.com"));
    assert_eq!(gl["provider"], "gitlab");
    assert_eq!(gl["label"], "GitLab");
    assert_eq!(gl["can_approve"], true, "approve is GitLab's review equivalent");
    assert_eq!(gl["can_request_changes"], false);
    assert_eq!(gl["can_auto_merge"], false);
    assert_eq!(gl["can_draft"], true);
    assert_eq!(gl["can_delete_source_branch"], true);
    assert_eq!(gl["can_workflows"], false);
    assert_eq!(gl["merge_strategies"], jval!(["merge", "squash"]));

    let bb = json(&provider_capabilities(Provider::Bitbucket, "bitbucket.org"));
    assert_eq!(bb["can_draft"], false);
    assert_eq!(bb["can_auto_merge"], false);

    let gitea = json(&provider_capabilities(Provider::Gitea, "codeberg.org"));
    assert_eq!(gitea["provider"], "gitea");
    assert_eq!(gitea["can_rerun_checks"], false);
    assert_eq!(gitea["can_delete_source_branch"], true);

    let unknown = json(&provider_capabilities(Provider::Unsupported, "x.example"));
    assert_eq!(unknown["can_approve"], false);
    assert_eq!(unknown["merge_strategies"], jval!([]));
}

#[test]
fn provider_capabilities_expose_the_review_comment_surface() {
    let gh = json(&provider_capabilities(Provider::GitHub, "github.com"));
    assert_eq!(gh["can_inline_comments"], true);
    assert_eq!(gh["can_draft_reviews"], true);

    let gitea = json(&provider_capabilities(Provider::Gitea, "codeberg.org"));
    assert_eq!(gitea["can_draft_reviews"], true);

    for provider in [Provider::GitLab, Provider::Bitbucket] {
        let caps = json(&provider_capabilities(provider, "example.org"));
        assert_eq!(caps["can_inline_comments"], true);
        assert_eq!(
            caps["can_draft_reviews"], false,
            "comments have to be sent one by one there"
        );
    }

    let unknown = json(&provider_capabilities(Provider::Unsupported, "x.example"));
    assert_eq!(unknown["can_inline_comments"], false);
    assert_eq!(unknown["can_draft_reviews"], false);
}

#[test]
fn gh_review_comments_carry_their_thread_anchor() {
    let root = json(&gh_map_review_comment(&jval!({
        "id": 9001,
        "user": { "login": "ada", "avatar_url": "https://gh/a.png" },
        "created_at": "2024-06-01T10:00:00Z",
        "body": "this allocation looks hot",
        "path": "src/app.ts",
        "line": 42
    })));
    assert_eq!(root["id"], "9001");
    assert_eq!(root["kind"], "inline");
    assert_eq!(root["file_path"], "src/app.ts");
    assert_eq!(root["line"], 42);
    assert_eq!(root["thread_id"], "9001", "a root comment opens its own thread");
    assert!(root["in_reply_to"].is_null());

    let reply = json(&gh_map_review_comment(&jval!({
        "id": 9002,
        "in_reply_to_id": 9001,
        "user": { "login": "grace" },
        "created_at": "2024-06-01T11:00:00Z",
        "body": "agreed, will cache it",
        "path": "src/app.ts",
        "line": 42
    })));
    assert_eq!(reply["in_reply_to"], "9001");
    assert_eq!(reply["thread_id"], "9001", "replies join the root thread");

    let outdated = json(&gh_map_review_comment(&jval!({
        "id": 9003,
        "user": { "login": "ada" },
        "body": "stale hunk",
        "path": "src/old.ts",
        "original_line": 7
    })));
    assert_eq!(outdated["line"], 7, "falls back to the original line");
}

#[test]
fn gh_review_payload_bundles_draft_comments() {
    let empty = gh_review_payload("APPROVE", "ship it", &[]);
    assert_eq!(empty, jval!({ "event": "APPROVE", "body": "ship it" }));
    assert!(empty.get("comments").is_none(), "no empty comments array");

    let drafts = vec![
        ReviewDraftComment {
            path: "src/app.ts".into(),
            line: 12,
            body: "rename this".into(),
            side: None,
        },
        ReviewDraftComment {
            path: "src/old.ts".into(),
            line: 3,
            body: "why removed?".into(),
            side: Some("LEFT".into()),
        },
    ];
    let payload = gh_review_payload("REQUEST_CHANGES", "two nits", &drafts);
    assert_eq!(payload["event"], "REQUEST_CHANGES");
    assert_eq!(payload["body"], "two nits");
    assert_eq!(
        payload["comments"],
        jval!([
            { "path": "src/app.ts", "line": 12, "side": "RIGHT", "body": "rename this" },
            { "path": "src/old.ts", "line": 3, "side": "LEFT", "body": "why removed?" }
        ])
    );

    let gitea = gitea_review_payload("APPROVE", "", &drafts);
    assert_eq!(gitea["event"], "APPROVED", "Gitea spells approval differently");
    assert_eq!(
        gitea["comments"],
        jval!([
            { "path": "src/app.ts", "body": "rename this", "new_position": 12 },
            { "path": "src/old.ts", "body": "why removed?", "new_position": 3 }
        ])
    );
}

#[test]
fn bb_comments_keep_inline_anchor_and_parent() {
    let root = json(&bb_map_comment(&jval!({
        "id": 11,
        "user": { "display_name": "Ada", "links": { "avatar": { "href": "https://bb/a.png" } } },
        "created_on": "2024-06-02T10:00:00Z",
        "content": { "raw": "off by one" },
        "inline": { "path": "src/app.ts", "to": 42 }
    }))
    .expect("a live comment survives"));
    assert_eq!(root["kind"], "inline");
    assert_eq!(root["file_path"], "src/app.ts");
    assert_eq!(root["line"], 42);
    assert_eq!(root["thread_id"], "11");

    let reply = json(&bb_map_comment(&jval!({
        "id": 12,
        "parent": { "id": 11 },
        "user": { "display_name": "Grace" },
        "content": { "raw": "fixed" },
        "inline": { "path": "src/app.ts", "from": 40 }
    }))
    .unwrap());
    assert_eq!(reply["in_reply_to"], "11");
    assert_eq!(reply["thread_id"], "11");
    assert_eq!(reply["line"], 40, "falls back to the from-side line");

    assert!(
        bb_map_comment(&jval!({ "id": 13, "deleted": true, "content": { "raw": "oops" } })).is_none(),
        "deleted comments stay hidden"
    );
}

#[test]
fn bb_inline_comment_payload_only_adds_what_it_knows() {
    assert_eq!(
        bb_inline_comment_payload("plain", None, None, None),
        jval!({ "content": { "raw": "plain" } })
    );
    assert_eq!(
        bb_inline_comment_payload("anchored", Some("src/app.ts"), Some(9), None),
        jval!({ "content": { "raw": "anchored" }, "inline": { "path": "src/app.ts", "to": 9 } })
    );
    assert_eq!(
        bb_inline_comment_payload("reply", None, None, Some("42")),
        jval!({ "content": { "raw": "reply" }, "parent": { "id": 42 } })
    );
    assert_eq!(
        bb_inline_comment_payload("bad parent", None, None, Some("not-a-number")),
        jval!({ "content": { "raw": "bad parent" } }),
        "unparsable ids are dropped instead of breaking the request"
    );
}

#[test]
fn gl_discussions_become_threaded_comments() {
    let comments = gl_map_discussion(&jval!({
        "id": "abc123",
        "notes": [
            {
                "id": 1,
                "body": "please extract this",
                "created_at": "2024-06-03T10:00:00Z",
                "author": { "username": "ada" },
                "position": { "new_path": "src/app.ts", "new_line": 12 }
            },
            { "id": 2, "system": true, "body": "changed the description" },
            {
                "id": 3,
                "body": "done",
                "created_at": "2024-06-03T11:00:00Z",
                "author": { "username": "grace" },
                "position": { "new_path": "src/app.ts", "new_line": 12 }
            }
        ]
    }));
    assert_eq!(comments.len(), 2, "system notes are skipped");
    let first = json(&comments[0]);
    let second = json(&comments[1]);
    assert_eq!(first["thread_id"], "abc123");
    assert!(first["in_reply_to"].is_null());
    assert_eq!(second["thread_id"], "abc123");
    assert_eq!(second["in_reply_to"], "1", "later notes reply to the root note");
    assert_eq!(second["file_path"], "src/app.ts");
}

#[test]
fn gl_discussion_position_needs_the_full_diff_refs() {
    let mr = jval!({
        "diff_refs": {
            "base_sha": "aaa",
            "head_sha": "bbb",
            "start_sha": "ccc"
        }
    });
    assert_eq!(
        gl_discussion_position(&mr, "src/app.ts", 12).unwrap(),
        jval!({
            "base_sha": "aaa",
            "head_sha": "bbb",
            "start_sha": "ccc",
            "position_type": "text",
            "new_path": "src/app.ts",
            "old_path": "src/app.ts",
            "new_line": 12
        })
    );

    assert!(
        gl_discussion_position(&jval!({ "diff_refs": { "base_sha": "aaa" } }), "a.ts", 1).is_none(),
        "an incomplete position would be rejected by GitLab"
    );
    assert!(gl_discussion_position(&jval!({}), "a.ts", 1).is_none());
}

#[test]
fn gh_review_threads_map_graphql_nodes_to_comment_ids() {
    let threads = gh_map_review_threads(&jval!({
        "data": { "repository": { "pullRequest": { "reviewThreads": { "nodes": [
            {
                "id": "PRRT_kw1",
                "isResolved": false,
                "comments": { "nodes": [ { "databaseId": 9001 }, { "databaseId": 9002 } ] }
            },
            {
                "id": "PRRT_kw2",
                "isResolved": true,
                "comments": { "nodes": [ { "databaseId": 9003 } ] }
            },
            { "isResolved": false, "comments": { "nodes": [] } }
        ] } } } }
    }));

    assert_eq!(threads.len(), 2, "a node without an id is unusable");
    assert_eq!(threads[0].id, "PRRT_kw1");
    assert!(!threads[0].resolved);
    assert_eq!(threads[0].comment_ids, vec!["9001", "9002"]);
    assert_eq!(threads[1].id, "PRRT_kw2");
    assert!(threads[1].resolved);
    assert_eq!(threads[1].comment_ids, vec!["9003"]);

    assert!(
        gh_map_review_threads(&jval!({ "data": { "repository": null } })).is_empty(),
        "an empty response yields no threads instead of an error"
    );
}
