use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::server::state::ServerState;

pub fn tracked(cmd: &str) -> bool {
    matches!(
        cmd,
        "pty_open"
            | "pty_close"
            | "pty_close_all"
            | "agent_transport_open"
            | "agent_transport_close"
            | "agent_transport_close_all"
    )
}

fn as_u32(value: Option<&Value>) -> Option<u32> {
    value
        .and_then(Value::as_u64)
        .and_then(|id| u32::try_from(id).ok())
}

#[derive(Default)]
pub struct ConnResources {
    ptys: HashSet<u32>,
    agents: HashMap<u32, String>,
}

impl ConnResources {
    pub fn record(&mut self, cmd: &str, args: &Value, data: &Value) {
        match cmd {
            "pty_open" => {
                if let Some(id) = as_u32(Some(data)) {
                    self.ptys.insert(id);
                }
            }
            "pty_close" => {
                if let Some(id) = as_u32(args.get("id")) {
                    self.ptys.remove(&id);
                }
            }
            "pty_close_all" => self.ptys.clear(),
            "agent_transport_open" => {
                let id = as_u32(data.get("id"));
                let session_id = data.get("sessionId").and_then(Value::as_str);
                if let (Some(id), Some(session_id)) = (id, session_id) {
                    self.agents.insert(id, session_id.to_string());
                }
            }
            "agent_transport_close" => {
                if let Some(id) = as_u32(args.get("id")) {
                    self.agents.remove(&id);
                }
            }
            "agent_transport_close_all" => self.agents.clear(),
            _ => {}
        }
    }

    pub fn close(self, state: &ServerState) {
        for id in self.ptys {
            if let Err(error) = crate::pty::pty_close_inner(&state.pty, id) {
                log::debug!("l8gitd cleanup: pty {id} close failed: {error}");
            }
        }
        for (id, session_id) in self.agents {
            if let Err(error) =
                crate::agent_transport::agent_transport_close_inner(&state.agents, id, session_id)
            {
                log::debug!("l8gitd cleanup: agent transport {id} close failed: {error}");
            }
        }
    }

    #[cfg(test)]
    pub fn ptys(&self) -> Vec<u32> {
        let mut ids: Vec<u32> = self.ptys.iter().copied().collect();
        ids.sort_unstable();
        ids
    }

    #[cfg(test)]
    pub fn agents(&self) -> Vec<(u32, String)> {
        let mut sessions: Vec<(u32, String)> = self
            .agents
            .iter()
            .map(|(id, session)| (*id, session.clone()))
            .collect();
        sessions.sort_unstable();
        sessions
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_resource_commands_are_tracked() {
        assert!(tracked("pty_open"));
        assert!(tracked("agent_transport_close_all"));
        assert!(!tracked("repo_status"));
        assert!(!tracked("watch_repo"));
    }

    #[test]
    fn opened_ptys_are_remembered_until_their_owner_closes_them() {
        let mut resources = ConnResources::default();
        resources.record("pty_open", &json!({}), &json!(4));
        resources.record("pty_open", &json!({}), &json!(7));
        assert_eq!(resources.ptys(), vec![4, 7]);

        resources.record("pty_close", &json!({ "id": 4 }), &json!(null));
        assert_eq!(resources.ptys(), vec![7]);

        resources.record("pty_close_all", &json!({}), &json!(1));
        assert!(resources.ptys().is_empty());
    }

    #[test]
    fn opened_agent_transports_are_remembered_with_their_session_id() {
        let mut resources = ConnResources::default();
        resources.record(
            "agent_transport_open",
            &json!({}),
            &json!({ "id": 2, "sessionId": "s-2" }),
        );
        assert_eq!(resources.agents(), vec![(2, "s-2".to_string())]);

        resources.record(
            "agent_transport_close",
            &json!({ "id": 2, "sessionId": "s-2" }),
            &json!(null),
        );
        assert!(resources.agents().is_empty());
    }

    #[test]
    fn malformed_results_do_not_register_anything() {
        let mut resources = ConnResources::default();
        resources.record("pty_open", &json!({}), &json!("nope"));
        resources.record("agent_transport_open", &json!({}), &json!({ "id": 3 }));
        assert!(resources.ptys().is_empty());
        assert!(resources.agents().is_empty());
    }
}
