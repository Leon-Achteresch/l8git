use std::sync::Arc;

use serde_json::Value;
use tokio::sync::broadcast;

use crate::server::state::{BroadcastEvent, ServerState};

pub struct BroadcastSink {
    events: broadcast::Sender<BroadcastEvent>,
}

impl crate::sink::EventSink for BroadcastSink {
    fn emit(&self, name: &str, payload: Value) {
        let _ = self.events.send(BroadcastEvent {
            name: name.to_string(),
            payload,
        });
    }
}

pub fn install(state: &Arc<ServerState>) {
    crate::sink::set_sink(Arc::new(BroadcastSink {
        events: state.events.clone(),
    }));
}
