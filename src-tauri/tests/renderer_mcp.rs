use l8git_lib::renderer_mcp::{
    handle_request, tools, SERVER_NAME, SUBCOMMAND, TOOL_RENDER_BARCODE, TOOL_RENDER_CHART,
};
use serde_json::json;

#[test]
fn declares_the_barcode_renderer_schema() {
    let listed = tools();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0]["name"], TOOL_RENDER_CHART);
    let barcode = listed
        .iter()
        .find(|tool| tool["name"] == TOOL_RENDER_BARCODE)
        .expect("barcode tool");
    assert_eq!(barcode["inputSchema"]["required"], json!(["items"]));
    assert_eq!(barcode["inputSchema"]["properties"]["items"]["maxItems"], 24);
    let formats = barcode["inputSchema"]["properties"]["items"]["items"]["properties"]
        ["format"]["enum"]
        .as_array()
        .expect("format enum");
    assert!(formats.contains(&json!("code128")));
    assert!(formats.contains(&json!("qrcode")));
    assert!(formats.contains(&json!("gs1datamatrix")));
}

#[test]
fn serves_initialize_list_and_call() {
    let initialized = handle_request(&json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {}
    }))
    .expect("initialize response");
    assert_eq!(initialized["result"]["serverInfo"]["name"], SERVER_NAME);

    let listed = handle_request(&json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list"
    }))
    .expect("list response");
    assert_eq!(listed["result"]["tools"][0]["name"], TOOL_RENDER_CHART);
    assert_eq!(listed["result"]["tools"][1]["name"], TOOL_RENDER_BARCODE);

    let called = handle_request(&json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "mcp__l8git-renderers__render_barcode",
            "arguments": {
                "items": [{ "format": "code128", "value": "ORDER-4711" }]
            }
        }
    }))
    .expect("call response");
    assert_eq!(called["result"]["isError"], json!(null));
    assert!(called["result"]["content"][0]["text"]
        .as_str()
        .unwrap_or_default()
        .contains("gerendert"));
}

#[test]
fn rejects_unknown_calls_and_ignores_notifications() {
    let unknown = handle_request(&json!({
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": { "name": "not_a_renderer", "arguments": {} }
    }))
    .expect("unknown-tool response");
    assert_eq!(unknown["result"]["isError"], true);

    assert!(handle_request(&json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    }))
    .is_none());
    assert_eq!(SUBCOMMAND, "mcp-renderers");
}
