mod common;

use common::{json, TestRepo};
use l8git_lib::pr::{
    bb_commit_status_to_pr_check, bb_map_pr, current_branch, encode_uri_component, first_non_empty,
    gh_map_pr, github_api_base, github_repo_api_url, origin_default_branch, parse_origin_url,
    pr_create_web_url, split_unified_diff_by_file, str_or_empty, strip_remote_prefix, trunc_chars,
    unsupported_provider_err, Provider, RemoteHandle,
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
fn parse_origin_url_treats_unknown_and_enterprise_hosts_as_github() {
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

    let https = handle(&repo, "https://git.internal.example/group/tool.git");
    assert_eq!(https.host, "git.internal.example");
    assert_eq!(https.provider.as_str(), "github");
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
        "unsupported"
    );
    let self_hosted = handle(&repo, "https://gitlab.internal.example/group/team/project.git");
    assert_eq!(self_hosted.provider.as_str(), "unsupported");
    assert_eq!(self_hosted.owner, "group");
    assert_eq!(
        self_hosted.repo, "team/project",
        "nested groups belong to the repo part"
    );
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
fn unsupported_provider_error_names_the_host() {
    let msg = unsupported_provider_err("gitlab.com");
    assert!(msg.contains("gitlab.com"), "{msg}");
    assert!(msg.contains("Bitbucket"), "{msg}");
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

    repo.git(&["config", "remote.origin.url", "https://gitlab.com/group/project.git"]);
    assert!(pr_create_web_url(repo.s(), "feature".into())
        .unwrap_err()
        .contains("noch nicht unterstützt"));
}
