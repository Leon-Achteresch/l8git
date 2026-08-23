use std::sync::{Arc, OnceLock};

use serde::Serialize;
use serde_json::Value;

pub trait EventSink: Send + Sync + 'static {
    fn emit(&self, name: &str, payload: Value);
}

fn slot() -> &'static OnceLock<Arc<dyn EventSink>> {
    static SINK: OnceLock<Arc<dyn EventSink>> = OnceLock::new();
    &SINK
}

pub fn set_sink(sink: Arc<dyn EventSink>) {
    let _ = slot().set(sink);
}

pub fn sink() -> Option<&'static Arc<dyn EventSink>> {
    slot().get()
}

pub fn emit<T: Serialize + ?Sized>(name: &str, payload: &T) {
    let Some(sink) = sink() else {
        return;
    };
    let Ok(value) = serde_json::to_value(payload) else {
        return;
    };
    sink.emit(name, value);
}
