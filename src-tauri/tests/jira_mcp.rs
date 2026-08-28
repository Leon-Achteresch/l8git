use std::collections::BTreeMap;

use l8git_lib::jira::{JiraComment, JiraIssue, JiraSearchResult};
use l8git_lib::jira_mcp::{
    format_comments, format_issue, format_search, handle_request, repo_from_args, resolve_key,
    tools_for, SERVER_NAME, SUBCOMMAND,
};
use l8git_lib::jira_policy::{
    cursor_mcp_entry, merge_cursor_mcp, normalize_policy, JiraPolicy, CURSOR_SERVER_KEY,
    POLICY_VERSION,
};
use serde_json::{json, Value};

const REPO: &str = "/repos/app";
const THREAD: &str = "claude:thread-1";

fn policy(enabled: bool, search: bool, comments: bool, keys: &[&str]) -> JiraPolicy {
    let mut keys_by_thread = BTreeMap::new();
    let mut active_thread_by_path = BTreeMap::new();
    active_thread_by_path.insert(REPO.to_string(), THREAD.to_string());
    if !keys.is_empty() {
        keys_by_thread.insert(
            THREAD.to_string(),
            keys.iter().map(|key| key.to_string()).collect(),
        );
    }
    JiraPolicy {
        version: POLICY_VERSION,
        enabled,
        allow_search: search,
        allow_comments: comments,
        active_thread_by_path,
        keys_by_thread,
    }
}

fn names(tools: &[Value]) -> Vec<String> {
    tools
        .iter()
        .map(|tool| tool["name"].as_str().unwrap_or("").to_string())
        .collect()
}

// ---------------------------------------------------------------------------
// The gate — must match `jiraToolsFor` in the frontend
// ---------------------------------------------------------------------------

#[test]
fn offers_nothing_while_the_feature_is_off() {
    assert!(tools_for(&policy(false, false, true, &["ABC-1"]), REPO).is_empty());
    assert!(tools_for(&policy(false, true, true, &[]), REPO).is_empty());
}

#[test]
fn offers_nothing_without_a_pinned_ticket_or_search() {
    assert!(tools_for(&policy(true, false, true, &[]), REPO).is_empty());
    // A ticket pinned in a *different* repository's conversation does not open
    // this one.
    assert!(tools_for(&policy(true, false, true, &["ABC-1"]), "/repos/other").is_empty());
}

#[test]
fn offers_the_read_tools_once_a_ticket_is_pinned() {
    let tools = tools_for(&policy(true, false, true, &["ABC-1"]), REPO);
    assert_eq!(names(&tools), vec!["jira_get_issue", "jira_get_comments"]);
}

#[test]
fn drops_the_comment_tool_when_comments_are_off() {
    let tools = tools_for(&policy(true, false, false, &["ABC-1"]), REPO);
    assert_eq!(names(&tools), vec!["jira_get_issue"]);
}

#[test]
fn adds_search_only_when_search_is_allowed() {
    let tools = tools_for(&policy(true, true, true, &[]), REPO);
    assert_eq!(
        names(&tools),
        vec!["jira_get_issue", "jira_get_comments", "jira_search_issues"]
    );
}

#[test]
fn never_offers_a_write_shaped_tool() {
    for tool in tools_for(&policy(true, true, true, &["ABC-1"]), REPO) {
        let name = tool["name"].as_str().unwrap();
        assert!(
            name.starts_with("jira_get_") || name.starts_with("jira_search_"),
            "unexpected tool {name}"
        );
    }
}

#[test]
fn narrows_the_key_to_an_enum_of_pinned_tickets() {
    let tools = tools_for(&policy(true, false, true, &["ABC-1", "DEF-2"]), REPO);
    let key = &tools[0]["inputSchema"]["properties"]["key"];
    assert_eq!(key["enum"], json!(["ABC-1", "DEF-2"]));
    assert!(tools[0]["description"]
        .as_str()
        .unwrap()
        .contains("ABC-1, DEF-2"));
}

#[test]
fn widens_the_key_once_search_is_allowed() {
    let tools = tools_for(&policy(true, true, true, &["ABC-1"]), REPO);
    let key = &tools[0]["inputSchema"]["properties"]["key"];
    assert!(key.get("enum").is_none());
    assert!(key["pattern"].is_string());
}

#[test]
fn falls_back_to_a_pattern_when_the_enum_would_grow_too_large() {
    let many: Vec<String> = (1..=40).map(|index| format!("ABC-{index}")).collect();
    let keys: Vec<&str> = many.iter().map(String::as_str).collect();
    let tools = tools_for(&policy(true, false, true, &keys), REPO);
    assert!(tools[0]["inputSchema"]["properties"]["key"]
        .get("enum")
        .is_none());
}

// ---------------------------------------------------------------------------
// The allow-list the schema only hints at
// ---------------------------------------------------------------------------

#[test]
fn resolves_a_pinned_key() {
    let policy = policy(true, false, true, &["ABC-1"]);
    assert_eq!(
        resolve_key(&policy, REPO, &json!({ "key": "abc-1" })).unwrap(),
        "ABC-1"
    );
}

#[test]
fn refuses_an_unpinned_key_while_search_is_off() {
    let policy = policy(true, false, true, &["ABC-1"]);
    let error = resolve_key(&policy, REPO, &json!({ "key": "XYZ-9" })).unwrap_err();
    assert!(error.contains("XYZ-9"));
    assert!(error.contains("ABC-1"));
}

#[test]
fn accepts_any_valid_key_once_search_is_allowed() {
    let policy = policy(true, true, true, &[]);
    assert_eq!(
        resolve_key(&policy, REPO, &json!({ "key": "XYZ-9" })).unwrap(),
        "XYZ-9"
    );
}

#[test]
fn refuses_malformed_and_missing_keys() {
    let wide = policy(true, true, true, &[]);
    for bad in [
        json!({ "key": "../../admin" }),
        json!({ "key": "ABC-1/../x" }),
        json!({ "key": "" }),
        json!({ "key": 42 }),
        json!({}),
    ] {
        assert!(resolve_key(&wide, REPO, &bad).is_err(), "accepted {bad}");
    }
}

#[test]
fn refuses_everything_while_disabled() {
    let off = policy(false, true, true, &["ABC-1"]);
    assert!(resolve_key(&off, REPO, &json!({ "key": "ABC-1" })).is_err());
}

// ---------------------------------------------------------------------------
// JSON-RPC surface
// ---------------------------------------------------------------------------

#[tokio::test]
async fn answers_initialize_with_the_server_identity() {
    let response = handle_request(REPO, &json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize" }))
        .await
        .expect("initialize is a request, not a notification");
    assert_eq!(response["id"], json!(1));
    assert_eq!(response["result"]["serverInfo"]["name"], json!(SERVER_NAME));
    assert!(response["result"]["capabilities"]["tools"].is_object());
}

#[tokio::test]
async fn stays_silent_on_notifications() {
    assert!(handle_request(REPO, &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))
        .await
        .is_none());
}

#[tokio::test]
async fn reports_unknown_methods_as_method_not_found() {
    let response = handle_request(REPO, &json!({ "jsonrpc": "2.0", "id": 7, "method": "resources/list" }))
        .await
        .unwrap();
    assert_eq!(response["error"]["code"], json!(-32601));
}

#[tokio::test]
async fn rejects_a_tool_call_without_a_name() {
    let response = handle_request(
        REPO,
        &json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {} }),
    )
    .await
    .unwrap();
    assert_eq!(response["error"]["code"], json!(-32602));
}

#[tokio::test]
async fn lists_no_tools_when_no_policy_file_exists() {
    // The policy file is absent in the test environment, which must read as
    // "everything closed" rather than as "no restrictions".
    let response = handle_request(REPO, &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }))
        .await
        .unwrap();
    assert_eq!(response["result"]["tools"], json!([]));
}

#[tokio::test]
async fn refuses_a_tool_call_when_the_gate_is_closed() {
    let response = handle_request(
        REPO,
        &json!({
            "jsonrpc": "2.0", "id": 4, "method": "tools/call",
            "params": { "name": "jira_get_issue", "arguments": { "key": "ABC-1" } },
        }),
    )
    .await
    .unwrap();
    assert_eq!(response["result"]["isError"], json!(true));
}

// ---------------------------------------------------------------------------
// Policy file
// ---------------------------------------------------------------------------

#[test]
fn policy_defaults_are_closed() {
    let empty = JiraPolicy::default();
    assert!(!empty.enabled);
    assert!(!empty.allow_search);
    assert!(!empty.offers_tools(REPO));
    assert!(!empty.allows_key(REPO, "ABC-1"));
}

#[test]
fn policy_normalisation_drops_keys_that_are_not_issue_keys() {
    let mut keys_by_thread = BTreeMap::new();
    keys_by_thread.insert(
        THREAD.to_string(),
        vec![
            "abc-1".to_string(),
            "../etc/passwd".to_string(),
            "ABC-1".to_string(),
            "DEF-2".to_string(),
        ],
    );
    keys_by_thread.insert("".to_string(), vec!["ABC-1".to_string()]);
    keys_by_thread.insert("codex:empty".to_string(), vec!["nope".to_string()]);
    let mut active_thread_by_path = BTreeMap::new();
    active_thread_by_path.insert(REPO.to_string(), THREAD.to_string());
    active_thread_by_path.insert("".to_string(), THREAD.to_string());
    active_thread_by_path.insert("/repos/blank".to_string(), String::new());
    let normalized = normalize_policy(JiraPolicy {
        keys_by_thread,
        active_thread_by_path,
        ..Default::default()
    });
    assert_eq!(normalized.keys_for(REPO), ["ABC-1", "DEF-2"]);
    assert!(normalized.keys_by_thread.get("").is_none());
    assert!(normalized.keys_by_thread.get("codex:empty").is_none());
    assert!(normalized.active_thread_by_path.get("").is_none());
    assert!(normalized.active_thread_by_path.get("/repos/blank").is_none());
    assert_eq!(normalized.version, POLICY_VERSION);
}

#[test]
fn policy_round_trips_through_json_in_the_frontends_wire_shape() {
    let raw = r#"{"version":2,"enabled":true,"allowSearch":false,"allowComments":true,"activeThreadByPath":{"/repos/app":"claude:thread-1"},"keysByThread":{"claude:thread-1":["ABC-1"]}}"#;
    let parsed: JiraPolicy = serde_json::from_str(raw).unwrap();
    assert!(parsed.enabled);
    assert!(!parsed.allow_search);
    assert!(parsed.allow_comments);
    assert_eq!(parsed.thread_for("/repos/app"), Some("claude:thread-1"));
    assert_eq!(parsed.keys_for("/repos/app"), ["ABC-1"]);
    assert!(parsed.offers_tools("/repos/app"));
    assert!(parsed.allows_key("/repos/app", "ABC-1"));
    assert!(!parsed.allows_key("/repos/app", "XYZ-9"));
}

#[test]
fn a_repository_reaches_only_the_conversation_it_has_open() {
    let mut policy = policy(true, false, true, &["ABC-1"]);
    policy
        .keys_by_thread
        .insert("claude:thread-2".to_string(), vec!["DEF-2".to_string()]);

    // The open conversation's ticket is reachable, the other chat's is not.
    assert!(policy.allows_key(REPO, "ABC-1"));
    assert!(!policy.allows_key(REPO, "DEF-2"));

    // Switching the open conversation switches the reachable set with it.
    policy
        .active_thread_by_path
        .insert(REPO.to_string(), "claude:thread-2".to_string());
    assert_eq!(policy.keys_for(REPO), ["DEF-2"]);
    assert!(!policy.allows_key(REPO, "ABC-1"));
}

#[test]
fn a_repository_with_no_open_conversation_reaches_nothing() {
    let mut policy = policy(true, false, true, &["ABC-1"]);
    policy.active_thread_by_path.clear();
    assert!(policy.keys_for(REPO).is_empty());
    assert!(!policy.offers_tools(REPO));
    assert!(!policy.allows_key(REPO, "ABC-1"));
    assert!(tools_for(&policy, REPO).is_empty());
}

// ---------------------------------------------------------------------------
// Cursor registration
// ---------------------------------------------------------------------------

fn entry() -> Value {
    json!({ "command": "/apps/l8git", "args": ["mcp-jira", "--repo", REPO] })
}

#[test]
fn creates_the_cursor_entry_when_the_file_is_missing() {
    let written = merge_cursor_mcp(None, Some(&entry())).unwrap().unwrap();
    let parsed: Value = serde_json::from_str(&written).unwrap();
    assert_eq!(parsed["mcpServers"][CURSOR_SERVER_KEY], entry());
}

#[test]
fn keeps_every_other_cursor_server_and_unknown_field() {
    let existing = r#"{"mcpServers":{"other":{"command":"x"}},"someOtherSetting":true}"#;
    let written = merge_cursor_mcp(Some(existing), Some(&entry())).unwrap().unwrap();
    let parsed: Value = serde_json::from_str(&written).unwrap();
    assert_eq!(parsed["mcpServers"]["other"]["command"], json!("x"));
    assert_eq!(parsed["someOtherSetting"], json!(true));
    assert_eq!(parsed["mcpServers"][CURSOR_SERVER_KEY], entry());
}

#[test]
fn removes_only_the_l8git_entry() {
    let existing = format!(
        r#"{{"mcpServers":{{"other":{{"command":"x"}},"{CURSOR_SERVER_KEY}":{{"command":"old"}}}}}}"#
    );
    let written = merge_cursor_mcp(Some(&existing), None).unwrap().unwrap();
    let parsed: Value = serde_json::from_str(&written).unwrap();
    assert!(parsed["mcpServers"].get(CURSOR_SERVER_KEY).is_none());
    assert_eq!(parsed["mcpServers"]["other"]["command"], json!("x"));
}

#[test]
fn never_rewrites_the_file_for_a_no_op() {
    // Removing what is not there, or writing what is already there.
    assert!(merge_cursor_mcp(Some(r#"{"mcpServers":{}}"#), None).unwrap().is_none());
    assert!(merge_cursor_mcp(None, None).unwrap().is_none());
    let existing = serde_json::to_string(&json!({ "mcpServers": { CURSOR_SERVER_KEY: entry() } })).unwrap();
    assert!(merge_cursor_mcp(Some(&existing), Some(&entry())).unwrap().is_none());
}

#[test]
fn refuses_to_touch_a_cursor_config_it_cannot_parse() {
    // Silently replacing a broken config would destroy the user's other servers.
    assert!(merge_cursor_mcp(Some("{not json"), Some(&entry())).is_err());
    assert!(merge_cursor_mcp(Some("[1,2]"), Some(&entry())).is_err());
    assert!(merge_cursor_mcp(Some(r#"{"mcpServers":42}"#), Some(&entry())).is_err());
    // An empty file is treated as "no config yet", not as an error.
    assert!(merge_cursor_mcp(Some("   "), Some(&entry())).unwrap().is_some());
}

#[test]
fn cursor_entry_points_at_this_binary_and_scopes_the_repo() {
    let value = cursor_mcp_entry(REPO).unwrap();
    let args: Vec<&str> = value["args"]
        .as_array()
        .unwrap()
        .iter()
        .map(|arg| arg.as_str().unwrap())
        .collect();
    assert_eq!(args, [SUBCOMMAND, "--repo", REPO]);
    let command = value["command"].as_str().unwrap();
    assert_eq!(command, std::env::current_exe().unwrap().to_str().unwrap());
    assert!(std::path::Path::new(command).is_absolute());

    let without_repo = cursor_mcp_entry("").unwrap();
    assert_eq!(without_repo["args"], json!([SUBCOMMAND]));
}

// ---------------------------------------------------------------------------
// argv parsing
// ---------------------------------------------------------------------------

#[test]
fn reads_the_repo_out_of_argv() {
    let argv = |args: &[&str]| args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
    assert_eq!(
        repo_from_args(argv(&["l8git", SUBCOMMAND, "--repo", REPO])),
        REPO
    );
    assert_eq!(
        repo_from_args(argv(&["l8git", SUBCOMMAND, &format!("--repo={REPO}")])),
        REPO
    );
    assert_eq!(repo_from_args(argv(&["l8git", SUBCOMMAND])), "");
    assert_eq!(repo_from_args(argv(&["l8git", SUBCOMMAND, "--repo"])), "");
    // `--repo` before the subcommand marker belongs to something else.
    assert_eq!(repo_from_args(argv(&["l8git", "--repo", REPO])), "");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

fn issue() -> JiraIssue {
    JiraIssue {
        key: "ABC-1".into(),
        summary: "Login schlaegt fehl".into(),
        status: "In Progress".into(),
        issue_type: "Bug".into(),
        assignee: "Lea".into(),
        labels: vec!["auth".into()],
        description: "Kaputt.".into(),
        ..Default::default()
    }
}

#[test]
fn renders_an_issue_without_empty_fields() {
    let rendered = format_issue(&issue());
    assert!(rendered.contains("ABC-1: Login schlaegt fehl"));
    assert!(rendered.contains("Status: In Progress"));
    assert!(rendered.contains("Labels: auth"));
    assert!(rendered.contains("Beschreibung:"));
    assert!(!rendered.contains("Komponenten:"));
    assert!(!rendered.contains("Resolution:"));
}

#[test]
fn marks_a_truncated_description_and_an_empty_issue() {
    let mut truncated = issue();
    truncated.truncated = true;
    assert!(format_issue(&truncated).contains("gekürzt"));
    let bare = format_issue(&JiraIssue { key: "X-1".into(), ..Default::default() });
    assert!(bare.contains("X-1: (ohne Titel)"));
}

#[test]
fn renders_comments_and_the_empty_case() {
    assert!(format_comments("ABC-1", &[]).contains("keine Kommentare"));
    let rendered = format_comments(
        "ABC-1",
        &[
            JiraComment { author: "Lea".into(), created: "2026-01-02".into(), body: "Erst".into(), ..Default::default() },
            JiraComment { author: "Sam".into(), created: "2026-01-01".into(), truncated: true, ..Default::default() },
        ],
    );
    assert!(rendered.contains("2 Kommentar(e)"));
    assert!(rendered.find("Lea") < rendered.find("Sam"));
    assert!(rendered.contains("(gekürzt)"));
    assert!(rendered.contains("(leer)"));
}

#[test]
fn renders_a_search_and_flags_truncation() {
    assert_eq!(
        format_search(&JiraSearchResult::default()),
        "Keine Treffer."
    );
    let rendered = format_search(&JiraSearchResult {
        issues: vec![issue()],
        total: 42,
        truncated: true,
    });
    assert!(rendered.contains("ABC-1 | Login schlaegt fehl | In Progress | Lea"));
    assert!(rendered.contains("1 von 42"));
}
