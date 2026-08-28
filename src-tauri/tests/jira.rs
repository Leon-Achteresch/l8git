use l8git_lib::jira::{
    adf_to_text, build_api_url, clamp_limit, describe_http_error, issue_browse_url,
    normalize_base_url, redact_secret, status_of, summarize_comment, summarize_issue, token_hint,
    truncate_text, validate_api_token, validate_email, validate_issue_key, validate_jql,
    JiraCredentials, MAX_BODY_CHARS, MAX_COMMENTS, MAX_SEARCH_RESULTS,
};
use serde_json::json;

// ---------------------------------------------------------------------------
// Base URL normalisation
// ---------------------------------------------------------------------------

#[test]
fn normalizes_common_base_url_shapes() {
    assert_eq!(
        normalize_base_url("https://acme.atlassian.net").unwrap(),
        "https://acme.atlassian.net"
    );
    assert_eq!(
        normalize_base_url("  https://ACME.atlassian.net/  ").unwrap(),
        "https://acme.atlassian.net"
    );
    // A bare host is assumed to be HTTPS rather than rejected.
    assert_eq!(
        normalize_base_url("acme.atlassian.net").unwrap(),
        "https://acme.atlassian.net"
    );
    // Server / Data Center installs living under a context path keep it.
    assert_eq!(
        normalize_base_url("https://jira.example.com/jira/").unwrap(),
        "https://jira.example.com/jira"
    );
    assert_eq!(
        normalize_base_url("https://jira.example.com:8443").unwrap(),
        "https://jira.example.com:8443"
    );
}

#[test]
fn rejects_plaintext_http_except_on_loopback() {
    assert!(normalize_base_url("http://jira.example.com").is_err());
    assert_eq!(
        normalize_base_url("http://localhost:8080").unwrap(),
        "http://localhost:8080"
    );
    assert_eq!(
        normalize_base_url("http://127.0.0.1:2990/jira").unwrap(),
        "http://127.0.0.1:2990/jira"
    );
}

#[test]
fn rejects_dangerous_base_urls() {
    // Non-HTTP schemes would let the credential reach a local file or command.
    assert!(normalize_base_url("file:///etc/passwd").is_err());
    assert!(normalize_base_url("javascript:alert(1)").is_err());
    // Embedded credentials would be sent to whoever owns the host.
    assert!(normalize_base_url("https://user:pw@jira.example.com").is_err());
    assert!(normalize_base_url("https://jira.example.com?next=x").is_err());
    assert!(normalize_base_url("https://jira.example.com#frag").is_err());
    assert!(normalize_base_url("https://jira.example.com/../other").is_err());
    assert!(normalize_base_url("").is_err());
    assert!(normalize_base_url("   ").is_err());
    assert!(normalize_base_url("https://jira.example.com/\u{0}").is_err());
    assert!(normalize_base_url(&format!("https://{}.com", "a".repeat(600))).is_err());
}

// ---------------------------------------------------------------------------
// Agent-supplied input
// ---------------------------------------------------------------------------

#[test]
fn accepts_well_formed_issue_keys() {
    assert_eq!(validate_issue_key("abc-123").unwrap(), "ABC-123");
    assert_eq!(validate_issue_key(" PROJ-1 ").unwrap(), "PROJ-1");
    assert_eq!(validate_issue_key("A1_B-9999").unwrap(), "A1_B-9999");
}

#[test]
fn rejects_issue_keys_that_could_escape_the_url_path() {
    for hostile in [
        "../../rest/api/3/myself",
        "PROJ-1/../../admin",
        "PROJ-1?expand=all",
        "PROJ-1#x",
        "PROJ-1 OR 1=1",
        "PROJ-1%2F..",
        "-123",
        "1PROJ-1",
        "PROJ-",
        "PROJ",
        "PROJ-abc",
        "PROJ-12345678901",
        "",
        "PROJ-1\nX-Injected: 1",
    ] {
        assert!(
            validate_issue_key(hostile).is_err(),
            "expected {hostile:?} to be rejected"
        );
    }
}

#[test]
fn validates_jql_size_and_flattens_whitespace() {
    assert_eq!(
        validate_jql(" project = ABC\n\tORDER BY created ").unwrap(),
        "project = ABC  ORDER BY created"
    );
    assert!(validate_jql("").is_err());
    assert!(validate_jql("   ").is_err());
    assert!(validate_jql(&"a".repeat(2001)).is_err());
    assert!(validate_jql("project = \u{0}ABC").is_err());
}

#[test]
fn validates_credential_fields() {
    assert_eq!(validate_email(" me@example.com ").unwrap(), "me@example.com");
    assert!(validate_email("me").is_err());
    assert!(validate_email("me@localhost").is_err());
    assert!(validate_email("").is_err());
    // A colon would corrupt the `email:token` basic-auth pair.
    assert!(validate_email("me:x@example.com").is_err());
    assert!(validate_email("me@exa\nmple.com").is_err());

    assert_eq!(validate_api_token(" tok ").unwrap(), "tok");
    assert!(validate_api_token("  ").is_err());
    // A newline in a header value is a header-injection primitive.
    assert!(validate_api_token("tok\r\nX-Evil: 1").is_err());
    assert!(validate_api_token(&"t".repeat(4097)).is_err());
}

#[test]
fn clamps_result_limits() {
    assert_eq!(clamp_limit(None, MAX_SEARCH_RESULTS), MAX_SEARCH_RESULTS);
    assert_eq!(clamp_limit(Some(0), MAX_COMMENTS), 1);
    assert_eq!(clamp_limit(Some(5), MAX_COMMENTS), 5);
    assert_eq!(clamp_limit(Some(9999), MAX_SEARCH_RESULTS), MAX_SEARCH_RESULTS);
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

#[test]
fn builds_urls_inside_the_configured_instance() {
    assert_eq!(
        build_api_url("https://acme.atlassian.net", "/rest/api/3/issue/ABC-1").unwrap(),
        "https://acme.atlassian.net/rest/api/3/issue/ABC-1"
    );
    assert_eq!(
        build_api_url("https://jira.example.com/jira", "/rest/api/3/myself").unwrap(),
        "https://jira.example.com/jira/rest/api/3/myself"
    );
}

#[test]
fn refuses_urls_that_leave_the_configured_instance() {
    // Protocol-relative and absolute paths are the classic ways an unvalidated
    // segment redirects an authenticated request at a foreign host.
    assert!(build_api_url("https://acme.atlassian.net", "//evil.example.com/x").is_err());
    assert!(build_api_url("https://acme.atlassian.net", "/rest/../../evil").is_err());
    assert!(build_api_url("https://acme.atlassian.net", "rest/api/3/myself").is_err());
    assert!(build_api_url("https://acme.atlassian.net", "/rest\u{0}/x").is_err());
    // A context-path install must not be able to reach the host root either.
    assert!(build_api_url("https://jira.example.com/jira", "/../rest/api/3/myself").is_err());
}

#[test]
fn builds_browse_urls_for_the_ui() {
    assert_eq!(
        issue_browse_url("https://acme.atlassian.net/", "ABC-1"),
        "https://acme.atlassian.net/browse/ABC-1"
    );
}

// ---------------------------------------------------------------------------
// Secret hygiene
// ---------------------------------------------------------------------------

#[test]
fn masks_tokens_for_display() {
    assert_eq!(token_hint("abcdefgh"), "••••efgh");
    assert_eq!(token_hint("abc"), "••••");
    assert_eq!(token_hint(""), "••••");
}

#[test]
fn redacts_raw_and_base64_encoded_secrets() {
    let token = "super-secret-token";
    let encoded = {
        use base64::Engine as _;
        base64::engine::general_purpose::STANDARD.encode(token.as_bytes())
    };
    let text = format!("failed with {token} / header Basic {encoded}");
    let redacted = redact_secret(&text, token);
    assert!(!redacted.contains(token));
    assert!(!redacted.contains(&encoded));
    assert_eq!(redact_secret("nothing", ""), "nothing");
}

#[test]
fn credential_status_never_exposes_the_token() {
    let credentials = JiraCredentials {
        base_url: "https://acme.atlassian.net".into(),
        email: "me@example.com".into(),
        api_token: "super-secret-token".into(),
    };
    let status = status_of(Some(&credentials));
    assert!(status.configured);
    assert_eq!(status.base_url, "https://acme.atlassian.net");
    assert_eq!(status.email, "me@example.com");
    assert_eq!(status.token_hint, "••••oken");

    let serialized = serde_json::to_string(&status).unwrap();
    assert!(!serialized.contains("super-secret-token"));
    assert!(serialized.contains("tokenHint"));

    let empty = status_of(None);
    assert!(!empty.configured);
    assert_eq!(empty.token_hint, "");
}

#[test]
fn http_errors_are_actionable_and_redacted() {
    let token = "tok-123";
    assert!(describe_http_error(401, "whatever", token).starts_with("Jira 401"));
    assert!(describe_http_error(403, "", token).starts_with("Jira 403"));
    assert!(describe_http_error(404, "", token).starts_with("Jira 404"));
    assert!(describe_http_error(429, "", token).starts_with("Jira 429"));
    let leaked = describe_http_error(500, "boom tok-123 boom", token);
    assert!(!leaked.contains(token));
    assert!(leaked.contains("500"));
    // A huge body must not blow up the message shown in chat.
    let long = describe_http_error(500, &"x".repeat(5000), token);
    assert!(long.chars().count() < 500);
}

// ---------------------------------------------------------------------------
// ADF flattening + projection
// ---------------------------------------------------------------------------

#[test]
fn flattens_plain_string_bodies_from_api_v2_hosts() {
    assert_eq!(adf_to_text(&json!("just text")), "just text");
}

#[test]
fn flattens_adf_documents_to_readable_text() {
    let doc = json!({
        "type": "doc",
        "version": 1,
        "content": [
            { "type": "heading", "attrs": { "level": 2 },
              "content": [{ "type": "text", "text": "Ziel" }] },
            { "type": "paragraph", "content": [
                { "type": "text", "text": "Hallo " },
                { "type": "mention", "attrs": { "text": "@Lea" } },
                { "type": "text", "text": " bitte pruefen." }
            ]},
            { "type": "bulletList", "content": [
                { "type": "listItem", "content": [
                    { "type": "paragraph", "content": [{ "type": "text", "text": "erstens" }] }]},
                { "type": "listItem", "content": [
                    { "type": "paragraph", "content": [{ "type": "text", "text": "zweitens" }] }]}
            ]},
            { "type": "codeBlock", "attrs": { "language": "ts" },
              "content": [{ "type": "text", "text": "const a = 1;" }] }
        ]
    });
    let text = adf_to_text(&doc);
    assert!(text.contains("## Ziel"));
    assert!(text.contains("Hallo @Lea bitte pruefen."));
    assert!(text.contains("- erstens"));
    assert!(text.contains("- zweitens"));
    assert!(text.contains("```ts"));
    assert!(text.contains("const a = 1;"));
    // No raw ADF plumbing leaks into the agent's context.
    assert!(!text.contains("\"type\""));
}

#[test]
fn adf_flattening_terminates_on_deeply_nested_documents() {
    let mut node = json!({ "type": "paragraph", "content": [{ "type": "text", "text": "deep" }] });
    for _ in 0..200 {
        node = json!({ "type": "blockquote", "content": [node] });
    }
    // Recursion is depth-capped, so a hostile / generated document cannot blow
    // the stack.
    let _ = adf_to_text(&node);
}

#[test]
fn truncates_by_characters_not_bytes() {
    let (text, truncated) = truncate_text("äöüß", 2);
    assert_eq!(text, "äö");
    assert!(truncated);
    let (text, truncated) = truncate_text("abc", 10);
    assert_eq!(text, "abc");
    assert!(!truncated);
}

fn sample_issue() -> serde_json::Value {
    json!({
        "key": "ABC-42",
        "fields": {
            "summary": "Login schlaegt fehl",
            "status": { "name": "In Progress", "statusCategory": { "name": "In Progress" } },
            "issuetype": { "name": "Bug" },
            "priority": { "name": "High" },
            "assignee": { "displayName": "Lea" },
            "reporter": { "displayName": "Sam" },
            "resolution": null,
            "labels": ["auth", "regression"],
            "components": [{ "name": "api" }],
            "fixVersions": [{ "name": "1.2.0" }],
            "parent": { "key": "ABC-1" },
            "subtasks": [{ "key": "ABC-43" }],
            "project": { "key": "ABC" },
            "duedate": "2026-01-31",
            "created": "2026-01-01T10:00:00.000+0100",
            "updated": "2026-01-05T10:00:00.000+0100",
            "description": { "type": "doc", "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Kaputt." }] }
            ]}
        }
    })
}

#[test]
fn projects_issues_onto_the_compact_shape() {
    let issue = summarize_issue(&sample_issue(), "https://acme.atlassian.net", MAX_BODY_CHARS);
    assert_eq!(issue.key, "ABC-42");
    assert_eq!(issue.summary, "Login schlaegt fehl");
    assert_eq!(issue.status, "In Progress");
    assert_eq!(issue.status_category, "In Progress");
    assert_eq!(issue.issue_type, "Bug");
    assert_eq!(issue.priority, "High");
    assert_eq!(issue.assignee, "Lea");
    assert_eq!(issue.reporter, "Sam");
    assert_eq!(issue.resolution, "");
    assert_eq!(issue.labels, vec!["auth", "regression"]);
    assert_eq!(issue.components, vec!["api"]);
    assert_eq!(issue.fix_versions, vec!["1.2.0"]);
    assert_eq!(issue.parent, "ABC-1");
    assert_eq!(issue.subtasks, vec!["ABC-43"]);
    assert_eq!(issue.project, "ABC");
    assert_eq!(issue.due_date, "2026-01-31");
    assert_eq!(issue.description, "Kaputt.");
    assert!(!issue.truncated);
    assert_eq!(issue.url, "https://acme.atlassian.net/browse/ABC-42");
}

#[test]
fn projection_survives_missing_and_null_fields() {
    let issue = summarize_issue(&json!({ "key": "X-1" }), "", MAX_BODY_CHARS);
    assert_eq!(issue.key, "X-1");
    assert_eq!(issue.summary, "");
    assert!(issue.labels.is_empty());
    assert_eq!(issue.url, "");
    assert_eq!(summarize_issue(&json!({}), "", MAX_BODY_CHARS).key, "");
}

#[test]
fn search_projection_drops_descriptions_to_save_tokens() {
    let issue = summarize_issue(&sample_issue(), "https://acme.atlassian.net", 0);
    assert_eq!(issue.description, "");
    assert!(issue.truncated);
    assert_eq!(issue.summary, "Login schlaegt fehl");
}

#[test]
fn long_descriptions_are_truncated_and_flagged() {
    let mut raw = sample_issue();
    raw["fields"]["description"] = json!("x".repeat(MAX_BODY_CHARS + 500));
    let issue = summarize_issue(&raw, "https://acme.atlassian.net", MAX_BODY_CHARS);
    assert_eq!(issue.description.chars().count(), MAX_BODY_CHARS);
    assert!(issue.truncated);
}

#[test]
fn projects_comments() {
    let comment = summarize_comment(
        &json!({
            "id": "10001",
            "author": { "displayName": "Lea" },
            "created": "2026-01-02T09:00:00.000+0100",
            "updated": "2026-01-02T09:05:00.000+0100",
            "body": { "type": "doc", "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Ich schaue rein." }] }
            ]}
        }),
        MAX_BODY_CHARS,
    );
    assert_eq!(comment.id, "10001");
    assert_eq!(comment.author, "Lea");
    assert_eq!(comment.body, "Ich schaue rein.");
    assert!(!comment.truncated);
}
