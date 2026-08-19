use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{broadcast, mpsc, Notify};

use crate::agent_transport::AgentTransportState;
use crate::pty::PtyState;
use crate::server::crypto::PSK_LEN;
use crate::server::resources::ConnResources;

pub const EVENT_CAPACITY: usize = 1024;
pub const OUTBOX_CAPACITY: usize = 2048;
pub const MAX_SESSIONS: usize = 64;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInfo {
    pub name: String,
    pub version: String,
    pub platform: String,
}

impl HostInfo {
    pub fn detect() -> Self {
        Self {
            name: hostname(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        }
    }
}

pub fn hostname() -> String {
    #[cfg(unix)]
    {
        let mut buf = [0u8; 256];
        let rc = unsafe { libc::gethostname(buf.as_mut_ptr() as *mut libc::c_char, buf.len()) };
        if rc == 0 {
            let end = buf.iter().position(|b| *b == 0).unwrap_or(buf.len());
            if let Ok(name) = std::str::from_utf8(&buf[..end]) {
                if !name.is_empty() {
                    return name.to_string();
                }
            }
        }
    }
    #[cfg(windows)]
    {
        if let Ok(name) = std::env::var("COMPUTERNAME") {
            if !name.is_empty() {
                return name;
            }
        }
    }
    "l8git-host".to_string()
}

#[derive(Clone, Debug)]
pub struct BroadcastEvent {
    pub name: String,
    pub payload: Value,
}

pub struct ServerState {
    pub agents: AgentTransportState,
    pub pty: PtyState,
    pub host: HostInfo,
    pub host_id: String,
    pub psk: [u8; PSK_LEN],
    pub relay: Option<String>,
    pub roots: RwLock<Vec<PathBuf>>,
    pub events: broadcast::Sender<BroadcastEvent>,
    watched: Mutex<HashMap<String, HashSet<u64>>>,
    next_connection: AtomicU64,
    sessions: AtomicUsize,
}

pub struct SessionSlot(Arc<ServerState>);

impl Drop for SessionSlot {
    fn drop(&mut self) {
        self.0.sessions.fetch_sub(1, Ordering::AcqRel);
    }
}

impl ServerState {
    pub fn new(
        host_id: String,
        psk: [u8; PSK_LEN],
        roots: Vec<PathBuf>,
        relay: Option<String>,
    ) -> Arc<Self> {
        let (events, _) = broadcast::channel(EVENT_CAPACITY);
        Arc::new(Self {
            agents: AgentTransportState::default(),
            pty: PtyState::default(),
            host: HostInfo::detect(),
            host_id,
            psk,
            relay,
            roots: RwLock::new(roots),
            events,
            watched: Mutex::new(HashMap::new()),
            next_connection: AtomicU64::new(1),
            sessions: AtomicUsize::new(0),
        })
    }

    pub fn next_connection_id(&self) -> u64 {
        self.next_connection.fetch_add(1, Ordering::Relaxed)
    }

    pub fn acquire_session(self: &Arc<Self>) -> Option<SessionSlot> {
        let mut current = self.sessions.load(Ordering::Acquire);
        loop {
            if current >= MAX_SESSIONS {
                return None;
            }
            match self.sessions.compare_exchange_weak(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return Some(SessionSlot(self.clone())),
                Err(actual) => current = actual,
            }
        }
    }

    pub fn open_sessions(&self) -> usize {
        self.sessions.load(Ordering::Acquire)
    }

    pub fn allowed_roots(&self) -> Vec<PathBuf> {
        self.roots
            .read()
            .map(|r| r.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }

    pub fn ensure_allowed(&self, args: &Value) -> Result<(), String> {
        super::config::ensure_allowed(&self.allowed_roots(), args)
    }

    pub fn watch(&self, connection: u64, path: &str) -> Result<(), String> {
        crate::watcher::watch_repo_inner(path.to_string())?;
        self.watched
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(path.to_string())
            .or_default()
            .insert(connection);
        Ok(())
    }

    pub fn unwatch(&self, connection: u64, path: &str) -> Result<(), String> {
        let orphaned = {
            let mut watched = self.watched.lock().unwrap_or_else(|e| e.into_inner());
            match watched.get_mut(path) {
                Some(owners) => {
                    owners.remove(&connection);
                    let orphaned = owners.is_empty();
                    if orphaned {
                        watched.remove(path);
                    }
                    orphaned
                }
                None => true,
            }
        };
        if orphaned {
            crate::watcher::unwatch_repo_inner(path.to_string())?;
        }
        Ok(())
    }

    pub fn unwatch_connection(&self, connection: u64) {
        let orphaned: Vec<String> = {
            let mut watched = self.watched.lock().unwrap_or_else(|e| e.into_inner());
            let mut orphaned = Vec::new();
            watched.retain(|path, owners| {
                owners.remove(&connection);
                if owners.is_empty() {
                    orphaned.push(path.clone());
                    return false;
                }
                true
            });
            orphaned
        };
        for path in orphaned {
            let _ = crate::watcher::unwatch_repo_inner(path);
        }
    }

    pub fn watched(&self) -> Vec<String> {
        self.watched
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .keys()
            .cloned()
            .collect()
    }

    pub fn unwatch_all(&self) {
        let watched: Vec<String> = {
            let mut watched = self.watched.lock().unwrap_or_else(|e| e.into_inner());
            watched.drain().map(|(path, _)| path).collect()
        };
        for path in watched {
            let _ = crate::watcher::unwatch_repo_inner(path);
        }
    }

    pub fn ready_frame(&self) -> Value {
        json!({ "type": "ready", "host": self.host })
    }
}

pub struct ConnectionHandle {
    pub id: u64,
    outbox: mpsc::Sender<Value>,
    resources: Mutex<ConnResources>,
    dropped: Notify,
}

impl ConnectionHandle {
    pub fn new(id: u64, outbox: mpsc::Sender<Value>) -> Self {
        Self {
            id,
            outbox,
            resources: Mutex::new(ConnResources::default()),
            dropped: Notify::new(),
        }
    }

    pub async fn overflowed(&self) {
        self.dropped.notified().await;
    }

    pub fn record_resource(&self, cmd: &str, args: &Value, data: &Value) {
        self.resources
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .record(cmd, args, data);
    }

    pub fn release_resources(&self, state: &ServerState) {
        let resources = std::mem::take(
            &mut *self
                .resources
                .lock()
                .unwrap_or_else(|e| e.into_inner()),
        );
        resources.close(state);
        state.unwatch_connection(self.id);
    }

    pub fn send(&self, frame: Value) -> bool {
        match self.outbox.try_send(frame) {
            Ok(()) => true,
            Err(mpsc::error::TrySendError::Full(_)) => {
                log::warn!(
                    "l8gitd connection {} is too far behind, dropping it",
                    self.id
                );
                self.dropped.notify_one();
                false
            }
            Err(mpsc::error::TrySendError::Closed(_)) => false,
        }
    }

    pub fn send_response(&self, id: i64, result: Result<Value, String>) -> bool {
        match result {
            Ok(data) => self.send(json!({ "type": "res", "id": id, "ok": true, "data": data })),
            Err(error) => {
                self.send(json!({ "type": "res", "id": id, "ok": false, "error": error }))
            }
        }
    }

    pub fn send_chan(&self, id: i64, arg: &str, payload: Value) -> bool {
        self.send(json!({ "type": "chan", "id": id, "arg": arg, "payload": payload }))
    }

    pub fn send_event(&self, name: &str, payload: Value) -> bool {
        self.send(json!({ "type": "event", "name": name, "payload": payload }))
    }

    pub fn send_pong(&self, t: Value) -> bool {
        self.send(json!({ "type": "pong", "t": t }))
    }
}

pub struct DispatchCtx {
    pub state: Arc<ServerState>,
    pub conn: Arc<ConnectionHandle>,
    pub req_id: i64,
    pub cmd: String,
}

impl DispatchCtx {
    pub fn new(state: Arc<ServerState>, conn: Arc<ConnectionHandle>, req_id: i64, cmd: &str) -> Self {
        Self {
            state,
            conn,
            req_id,
            cmd: cmd.to_string(),
        }
    }

    pub fn send_chan(&self, arg: &str, payload: Value) -> bool {
        self.conn.send_chan(self.req_id, arg, payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> Arc<ServerState> {
        ServerState::new("host".into(), [9u8; PSK_LEN], vec![], None)
    }

    #[test]
    fn concurrent_sessions_are_capped_and_slots_come_back_on_drop() {
        let state = state();
        let slots: Vec<SessionSlot> = (0..MAX_SESSIONS)
            .map(|_| state.acquire_session().expect("slot below the cap"))
            .collect();
        assert_eq!(state.open_sessions(), MAX_SESSIONS);
        assert!(state.acquire_session().is_none());
        drop(slots);
        assert_eq!(state.open_sessions(), 0);
        assert!(state.acquire_session().is_some());
    }

    #[tokio::test]
    async fn a_full_outbox_reports_failure_and_wakes_the_read_loop() {
        let (tx, _rx) = mpsc::channel(2);
        let conn = ConnectionHandle::new(1, tx);
        assert!(conn.send(json!(1)));
        assert!(conn.send(json!(2)));
        assert!(!conn.send(json!(3)));
        tokio::time::timeout(std::time::Duration::from_secs(2), conn.overflowed())
            .await
            .expect("the overflow wakes the connection up");
    }

    #[tokio::test]
    async fn a_closed_outbox_reports_failure_without_signalling_an_overflow() {
        let (tx, rx) = mpsc::channel(2);
        drop(rx);
        let conn = ConnectionHandle::new(1, tx);
        assert!(!conn.send(json!(1)));
        assert!(tokio::time::timeout(
            std::time::Duration::from_millis(50),
            conn.overflowed()
        )
        .await
        .is_err());
    }
}
