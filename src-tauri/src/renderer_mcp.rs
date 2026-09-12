//! Stdio MCP server for UI-only renderers used by providers without a native
//! host-tool channel. The renderer itself stays in the webview; this process
//! only advertises the schema and acknowledges calls.

use std::io::{BufRead, Write};

use serde_json::{json, Value};

pub const SUBCOMMAND: &str = "mcp-renderers";
pub const SERVER_NAME: &str = "l8git-renderers";
pub const TOOL_RENDER_BARCODE: &str = "render_barcode";
pub const TOOL_RENDER_CHART: &str = "render_chart";
const PROTOCOL_VERSION: &str = "2024-11-05";

const CHART_TYPES: &[&str] = &["bar", "line", "area"];

const CODE_METHOD_NOT_FOUND: i64 = -32601;
const CODE_INVALID_PARAMS: i64 = -32602;

const BARCODE_FORMATS: &[&str] = &[
    "code128",
    "gs1-128",
    "code39",
    "code93",
    "rationalizedCodabar",
    "interleaved2of5",
    "itf14",
    "ean13",
    "ean8",
    "upca",
    "upce",
    "isbn",
    "sscc18",
    "pzn",
    "code32",
    "pharmacode",
    "msi",
    "code11",
    "identcode",
    "leitcode",
    "databaromni",
    "databarexpanded",
    "qrcode",
    "microqrcode",
    "gs1qrcode",
    "datamatrix",
    "gs1datamatrix",
    "pdf417",
    "micropdf417",
    "azteccode",
    "dotcode",
    "hanxin",
    "swissqrcode",
    "onecode",
    "postnet",
    "royalmail",
    "kix",
    "auspost",
    "japanpost",
];

pub fn tools() -> Vec<Value> {
    vec![json!({
        "name": TOOL_RENDER_CHART,
        "description": "Rendert ein interaktives Diagramm direkt in der l8git-Chat-UI. Nutze das immer, wenn Zahlenreihen anschaulicher als Tabelle oder Prosa sind (Trends, Vergleiche, Verteilungen). Nach dem Tool-Call folgt ein Satz Interpretation.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["type", "series"],
            "properties": {
                "type": { "type": "string", "enum": CHART_TYPES, "description": "Diagrammtyp." },
                "title": { "type": "string" },
                "xLabel": { "type": "string" },
                "yLabel": { "type": "string" },
                "stacked": { "type": "boolean", "description": "Stapelt Bar-Serien." },
                "series": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 8,
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["label", "data"],
                        "properties": {
                            "label": { "type": "string" },
                            "data": {
                                "type": "array",
                                "minItems": 1,
                                "items": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["x", "y"],
                                    "properties": {
                                        "x": { "type": ["string", "number"] },
                                        "y": { "type": "number" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }), json!({
        "name": TOOL_RENDER_BARCODE,
        "description": "Rendert scannbare Barcodes direkt in der l8git-Chat-UI. Nutze das, sobald ein Wert an einem Scanner abgegriffen werden soll (Auftrags-, Artikel-, Seriennummern, GTINs, Ladungsträger, URLs). Daten dafür dürfen aus jeder Quelle kommen, auch aus MCP-Tools. Nach dem Tool-Call folgt ein Satz, der sagt, was codiert ist.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["items"],
            "properties": {
                "title": { "type": "string", "description": "Überschrift über der Barcode-Gruppe." },
                "items": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 24,
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["format", "value"],
                        "properties": {
                            "format": {
                                "type": "string",
                                "enum": BARCODE_FORMATS,
                                "description": "Symbologie, z. B. code128, ean13, qrcode, gs1datamatrix."
                            },
                            "value": { "type": "string", "description": "Exakte Nutzlast, die codiert wird." },
                            "label": { "type": "string", "description": "Kurze Bezeichnung über dem Code." },
                            "caption": { "type": "string", "description": "Zusatzzeile unter dem Code." },
                            "scale": { "type": "number", "minimum": 1, "maximum": 10 },
                            "height": { "type": "number", "minimum": 4, "maximum": 60, "description": "Strichhöhe bei 1D-Codes." },
                            "includeText": { "type": "boolean", "description": "Klartext unter dem Code." }
                        }
                    }
                }
            }
        }
    })]
}

fn text_content(text: &str, is_error: bool) -> Value {
    let mut result = json!({ "content": [{ "type": "text", "text": text }] });
    if is_error {
        result["isError"] = Value::Bool(true);
    }
    result
}

fn only_has_keys(obj: &serde_json::Map<String, Value>, allowed: &[&str]) -> bool {
    obj.keys().all(|key| allowed.contains(&key.as_str()))
}

fn is_valid_chart_args(args: &Value) -> bool {
    let Some(obj) = args.as_object() else { return false };
    if !only_has_keys(obj, &["type", "title", "xLabel", "yLabel", "stacked", "series"]) {
        return false;
    }
    let Some(chart_type) = obj.get("type").and_then(Value::as_str) else { return false };
    if !CHART_TYPES.contains(&chart_type) {
        return false;
    }
    if let Some(title) = obj.get("title") {
        if !title.is_string() {
            return false;
        }
    }
    if let Some(stacked) = obj.get("stacked") {
        if !stacked.is_boolean() {
            return false;
        }
    }
    let Some(series) = obj.get("series").and_then(Value::as_array) else { return false };
    if series.is_empty() || series.len() > 8 {
        return false;
    }
    series.iter().all(|entry| {
        let Some(entry) = entry.as_object() else { return false };
        if !only_has_keys(entry, &["label", "data"]) {
            return false;
        }
        let label_ok = entry
            .get("label")
            .and_then(Value::as_str)
            .is_some_and(|label| !label.is_empty());
        let Some(data) = entry.get("data").and_then(Value::as_array) else { return false };
        label_ok
            && !data.is_empty()
            && data.iter().all(|point| {
                let Some(point) = point.as_object() else { return false };
                if !only_has_keys(point, &["x", "y"]) {
                    return false;
                }
                let x_ok = point
                    .get("x")
                    .is_some_and(|x| x.is_string() || x.is_number());
                let y_ok = point.get("y").and_then(Value::as_f64).is_some();
                x_ok && y_ok
            })
    })
}

fn is_valid_barcode_args(args: &Value) -> bool {
    let Some(obj) = args.as_object() else { return false };
    if !only_has_keys(obj, &["title", "items"]) {
        return false;
    }
    if let Some(title) = obj.get("title") {
        if !title.is_string() {
            return false;
        }
    }
    let Some(items) = obj.get("items").and_then(Value::as_array) else { return false };
    if items.is_empty() || items.len() > 24 {
        return false;
    }
    items.iter().all(|item| {
        let Some(item) = item.as_object() else { return false };
        if !only_has_keys(
            item,
            &["format", "value", "label", "caption", "scale", "height", "includeText"],
        ) {
            return false;
        }
        let format_ok = item
            .get("format")
            .and_then(Value::as_str)
            .is_some_and(|format| BARCODE_FORMATS.contains(&format));
        let value_ok = item
            .get("value")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty());
        let scale_ok = item.get("scale").is_none_or(|scale| {
            scale.as_f64().is_some_and(|scale| (1.0..=10.0).contains(&scale))
        });
        let height_ok = item.get("height").is_none_or(|height| {
            height.as_f64().is_some_and(|height| (4.0..=60.0).contains(&height))
        });
        format_ok && value_ok && scale_ok && height_ok
    })
}

fn strip_tool_prefix(name: &str) -> &str {
    name.strip_prefix("mcp__")
        .and_then(|rest| rest.split_once("__"))
        .map(|(_, tool)| tool)
        .unwrap_or(name)
}

fn success_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error_response(id: Value, code: i64, message: String) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Handles one request separately from the stdio loop for focused tests.
pub fn handle_request(request: &Value) -> Option<Value> {
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    let id = request.get("id").cloned()?;
    let params = request.get("params").cloned().unwrap_or(Value::Null);

    match method {
        "initialize" => Some(success_response(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") }
            }),
        )),
        "ping" => Some(success_response(id, json!({}))),
        "tools/list" => Some(success_response(id, json!({ "tools": tools() }))),
        "tools/call" => {
            let name = strip_tool_prefix(params.get("name").and_then(Value::as_str).unwrap_or(""));
            if name.is_empty() {
                return Some(error_response(
                    id,
                    CODE_INVALID_PARAMS,
                    "Es fehlt der Tool-Name.".into(),
                ));
            }
            let arguments = params.get("arguments").cloned().unwrap_or(Value::Null);
            let result = if name == TOOL_RENDER_BARCODE {
                if is_valid_barcode_args(&arguments) {
                    text_content("Barcode wurde in der l8git-UI gerendert.", false)
                } else {
                    text_content("Ungültige Barcode-Daten.", true)
                }
            } else if name == TOOL_RENDER_CHART {
                if is_valid_chart_args(&arguments) {
                    text_content("Diagramm wurde in der l8git-UI gerendert.", false)
                } else {
                    text_content("Ungültige Chart-Daten.", true)
                }
            } else {
                text_content(&format!("Unbekanntes Renderer-Tool: {name}"), true)
            };
            Some(success_response(id, result))
        }
        other => Some(error_response(
            id,
            CODE_METHOD_NOT_FOUND,
            format!("Unbekannte Methode: {other}"),
        )),
    }
}

/// Path of this executable plus the marker used by OpenCode's ACP transport.
#[tauri::command]
pub fn renderer_mcp_command() -> Result<Vec<String>, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("Programmpfad konnte nicht bestimmt werden: {error}"))?;
    let exe = exe
        .to_str()
        .ok_or_else(|| "Programmpfad ist kein gültiges UTF-8.".to_string())?;
    Ok(vec![exe.to_string(), SUBCOMMAND.to_string()])
}

/// Runs until the provider closes stdin. Stdout is reserved for JSON-RPC.
pub fn serve_stdio() -> ! {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(trimmed) {
            Ok(request) => handle_request(&request),
            Err(error) => Some(error_response(
                Value::Null,
                -32700,
                format!("Ungültiges JSON: {error}"),
            )),
        };
        let Some(response) = response else { continue };
        let Ok(encoded) = serde_json::to_string(&response) else { continue };
        if writeln!(stdout, "{encoded}").is_err() || stdout.flush().is_err() {
            break;
        }
    }
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_both_render_tools() {
        let listed = tools();
        let names: Vec<_> = listed
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&TOOL_RENDER_BARCODE));
        assert!(names.contains(&TOOL_RENDER_CHART));
    }

    #[test]
    fn calls_the_chart_tool_successfully() {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": TOOL_RENDER_CHART,
                "arguments": { "type": "bar", "series": [{ "label": "A", "data": [{ "x": "Jan", "y": 1 }] }] }
            }
        });
        let response = handle_request(&request).unwrap();
        assert!(response["result"]["isError"].is_null());
    }

    #[test]
    fn rejects_invalid_chart_arguments_instead_of_a_silent_success() {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": TOOL_RENDER_CHART, "arguments": {} }
        });
        let response = handle_request(&request).unwrap();
        assert_eq!(response["result"]["isError"], Value::Bool(true));
    }

    #[test]
    fn rejects_invalid_barcode_arguments_instead_of_a_silent_success() {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": TOOL_RENDER_BARCODE, "arguments": { "items": [{ "format": "nope", "value": "A" }] } }
        });
        let response = handle_request(&request).unwrap();
        assert_eq!(response["result"]["isError"], Value::Bool(true));
    }

    #[test]
    fn rejects_empty_barcode_arguments_instead_of_a_silent_success() {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": TOOL_RENDER_BARCODE, "arguments": {} }
        });
        let response = handle_request(&request).unwrap();
        assert_eq!(response["result"]["isError"], Value::Bool(true));
    }

    #[test]
    fn calls_the_barcode_tool_successfully() {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": TOOL_RENDER_BARCODE,
                "arguments": { "items": [{ "format": "code128", "value": "ORDER-4711" }] }
            }
        });
        let response = handle_request(&request).unwrap();
        assert!(response["result"]["isError"].is_null());
    }

    #[test]
    fn unknown_tool_name_is_an_explicit_error_not_a_silent_success() {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": "does_not_exist", "arguments": {} }
        });
        let response = handle_request(&request).unwrap();
        assert_eq!(response["result"]["isError"], Value::Bool(true));
    }
}
