//! Stdio MCP server for UI-only renderers used by providers without a native
//! host-tool channel. The renderer itself stays in the webview; this process
//! only advertises the schema and acknowledges calls.

use std::io::{BufRead, Write};

use serde_json::{json, Value};

pub const SUBCOMMAND: &str = "mcp-renderers";
pub const SERVER_NAME: &str = "l8git-renderers";
pub const TOOL_RENDER_BARCODE: &str = "render_barcode";
const PROTOCOL_VERSION: &str = "2024-11-05";

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
            let result = if name == TOOL_RENDER_BARCODE {
                text_content("Barcode wurde in der l8git-UI gerendert.", false)
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
