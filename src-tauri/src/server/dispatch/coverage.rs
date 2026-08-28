pub const EXPECTED_COMMAND_COUNT: usize = 221;

const LIB_RS: &str = include_str!("../../lib.rs");

const SOURCES: [&str; 5] = [
    include_str!("agents.rs"),
    include_str!("git.rs"),
    include_str!("gitops.rs"),
    include_str!("pr.rs"),
    include_str!("system.rs"),
];

fn is_command_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

pub fn handler_commands() -> Vec<String> {
    let start = LIB_RS
        .find("tauri::generate_handler![")
        .expect("lib.rs contains a generate_handler! invocation");
    let block = &LIB_RS[start..];
    let end = block
        .find("])")
        .expect("generate_handler! invocation is closed");
    block[..end]
        .lines()
        .skip(1)
        .filter_map(|line| {
            let entry = line.trim().trim_end_matches(',').trim();
            let name = entry.rsplit("::").next()?;
            is_command_name(name).then(|| name.to_string())
        })
        .collect()
}

#[derive(Debug, Clone)]
pub struct Arm {
    pub name: String,
    pub first_required_arg: Option<String>,
}

fn split_params(signature: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    for (index, ch) in signature.char_indices() {
        match ch {
            '<' | '(' | '[' => depth += 1,
            '>' | ')' | ']' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&signature[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    parts.push(&signature[start..]);
    parts
        .into_iter()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect()
}

fn first_required_arg(signature: &str) -> Option<String> {
    for param in split_params(signature) {
        let (name, ty) = param.split_once(':')?;
        let ty = ty.trim();
        let optional = ty.starts_with("Option<")
            || ty.starts_with("chan")
            || ty == "Value"
            || ty == "serde_json::Value";
        if !optional {
            return Some(name.trim().to_string());
        }
    }
    None
}

pub fn dispatch_arms() -> Vec<Arm> {
    let mut arms = Vec::new();
    for source in SOURCES {
        let bytes = source.as_bytes();
        let mut cursor = 0usize;
        while let Some(offset) = source[cursor..].find('"') {
            let open = cursor + offset;
            let Some(rel_close) = source[open + 1..].find('"') else {
                break;
            };
            let close = open + 1 + rel_close;
            let name = &source[open + 1..close];
            cursor = close + 1;
            let line_start = source[..open].rfind('\n').map_or(0, |i| i + 1);
            if source[line_start..open].trim_start() != "" {
                continue;
            }
            if !is_command_name(name) {
                continue;
            }
            let mut probe = close + 1;
            while probe < bytes.len() && (bytes[probe] as char).is_whitespace() {
                probe += 1;
            }
            if probe >= bytes.len() || bytes[probe] != b'(' {
                continue;
            }
            let mut depth = 0i32;
            let mut end = probe;
            for (index, ch) in source[probe..].char_indices() {
                match ch {
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            end = probe + index;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let signature = &source[probe + 1..end];
            arms.push(Arm {
                name: name.to_string(),
                first_required_arg: first_required_arg(signature),
            });
            cursor = end;
        }
    }
    arms
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::dispatch::{camel_case, dispatch};
    use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState};
    use serde_json::{json, Value};
    use std::collections::BTreeSet;
    use std::sync::Arc;
    use tokio::sync::mpsc;

    fn ctx(cmd: &str) -> (DispatchCtx, mpsc::Receiver<Value>) {
        let state = ServerState::new("host".into(), [5u8; 32], vec![], None);
        let (tx, rx) = mpsc::channel(crate::server::state::OUTBOX_CAPACITY);
        let conn = Arc::new(ConnectionHandle::new(1, tx));
        (DispatchCtx::new(state, conn, 1, cmd), rx)
    }

    #[test]
    fn every_tauri_command_is_registered_in_the_dispatcher() {
        let handler: Vec<String> = handler_commands();
        let arms = dispatch_arms();
        let registered: Vec<String> = arms.iter().map(|a| a.name.clone()).collect();

        let handler_set: BTreeSet<&str> = handler.iter().map(String::as_str).collect();
        let registered_set: BTreeSet<&str> = registered.iter().map(String::as_str).collect();

        assert_eq!(handler.len(), handler_set.len(), "lib.rs lists a duplicate");
        assert_eq!(
            registered.len(),
            registered_set.len(),
            "a command is registered twice in server/dispatch"
        );

        let missing: Vec<&&str> = handler_set.difference(&registered_set).collect();
        assert!(missing.is_empty(), "not reachable through dispatch: {missing:?}");

        let extra: Vec<&&str> = registered_set.difference(&handler_set).collect();
        assert!(extra.is_empty(), "dispatched but not a tauri command: {extra:?}");

        assert_eq!(handler.len(), EXPECTED_COMMAND_COUNT);
    }

    #[tokio::test]
    async fn dispatch_claims_every_command_that_has_a_required_argument() {
        let mut claimed = 0usize;
        for arm in dispatch_arms() {
            let Some(required) = arm.first_required_arg.clone() else {
                continue;
            };
            let (c, _rx) = ctx(&arm.name);
            let result = dispatch(&arm.name, json!({}), &c).await;
            assert_eq!(
                result,
                Err(format!(
                    "Fehlendes Argument \"{}\".",
                    camel_case(&required)
                )),
                "{} did not report its first required argument",
                arm.name
            );
            claimed += 1;
        }
        assert_eq!(claimed, 212, "unexpected number of probed commands");
    }

    #[tokio::test]
    async fn unknown_commands_are_not_claimed_by_any_module() {
        let (c, _rx) = ctx("l8git_no_such_command");
        assert!(dispatch("l8git_no_such_command", json!({}), &c)
            .await
            .unwrap_err()
            .contains("Unbekannter Befehl"));
    }
}
