use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tokio::sync::mpsc;

use crate::frame::RelayFrame;

pub type HostTx = mpsc::UnboundedSender<String>;
pub type ClientTx = mpsc::UnboundedSender<Vec<u8>>;

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

fn digest(token: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.finalize().into()
}

pub struct HostLink {
    pub host_id: String,
    pub epoch: u64,
    tx: HostTx,
    conns: Mutex<HashMap<String, ClientTx>>,
}

impl HostLink {
    pub fn send(&self, frame: &RelayFrame) -> bool {
        self.tx.send(frame.encode()).is_ok()
    }

    pub fn add_conn(&self, conn_id: &str, tx: ClientTx) {
        lock(&self.conns).insert(conn_id.to_string(), tx);
    }

    pub fn conn(&self, conn_id: &str) -> Option<ClientTx> {
        lock(&self.conns).get(conn_id).cloned()
    }

    pub fn remove_conn(&self, conn_id: &str) -> Option<ClientTx> {
        lock(&self.conns).remove(conn_id)
    }

    pub fn drain_conns(&self) -> Vec<ClientTx> {
        lock(&self.conns).drain().map(|(_, tx)| tx).collect()
    }

    pub fn conn_count(&self) -> usize {
        lock(&self.conns).len()
    }
}

#[derive(Default)]
pub struct RelayState {
    tokens: Mutex<HashMap<String, [u8; 32]>>,
    hosts: Mutex<HashMap<String, Arc<HostLink>>>,
    next_epoch: AtomicU64,
    next_conn: AtomicU64,
}

impl RelayState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn register_token(&self, host_id: &str, token: &str) -> bool {
        let provided = digest(token);
        let mut tokens = lock(&self.tokens);
        match tokens.get(host_id) {
            Some(known) => known.ct_eq(&provided).into(),
            None => {
                tokens.insert(host_id.to_string(), provided);
                true
            }
        }
    }

    pub fn check_token(&self, host_id: &str, token: &str) -> bool {
        let provided = digest(token);
        match lock(&self.tokens).get(host_id) {
            Some(known) => known.ct_eq(&provided).into(),
            None => false,
        }
    }

    pub fn attach_host(&self, host_id: &str, tx: HostTx) -> (Arc<HostLink>, Option<Arc<HostLink>>) {
        let link = Arc::new(HostLink {
            host_id: host_id.to_string(),
            epoch: self.next_epoch.fetch_add(1, Ordering::Relaxed),
            tx,
            conns: Mutex::new(HashMap::new()),
        });
        let previous = lock(&self.hosts).insert(host_id.to_string(), link.clone());
        (link, previous)
    }

    pub fn detach_host(&self, host_id: &str, epoch: u64) {
        let mut hosts = lock(&self.hosts);
        if hosts.get(host_id).is_some_and(|link| link.epoch == epoch) {
            hosts.remove(host_id);
        }
    }

    pub fn host(&self, host_id: &str) -> Option<Arc<HostLink>> {
        lock(&self.hosts).get(host_id).cloned()
    }

    pub fn host_count(&self) -> usize {
        lock(&self.hosts).len()
    }

    pub fn next_conn_id(&self) -> String {
        format!("c{}", self.next_conn.fetch_add(1, Ordering::Relaxed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_token_for_a_host_id_wins_and_later_ones_must_match() {
        let state = RelayState::new();
        assert!(state.register_token("host-a", "token-a"));
        assert!(state.register_token("host-a", "token-a"));
        assert!(!state.register_token("host-a", "token-b"));
        assert!(state.register_token("host-b", "token-b"));
    }

    #[test]
    fn clients_are_only_accepted_for_known_host_ids() {
        let state = RelayState::new();
        assert!(!state.check_token("host-a", "token-a"));
        state.register_token("host-a", "token-a");
        assert!(state.check_token("host-a", "token-a"));
        assert!(!state.check_token("host-a", "token-b"));
    }

    #[test]
    fn reconnecting_hosts_replace_the_previous_link_and_stale_detach_is_ignored() {
        let state = RelayState::new();
        let (first_tx, _first_rx) = mpsc::unbounded_channel();
        let (second_tx, _second_rx) = mpsc::unbounded_channel();
        let (first, previous) = state.attach_host("host-a", first_tx);
        assert!(previous.is_none());
        let (second, previous) = state.attach_host("host-a", second_tx);
        assert_eq!(previous.map(|link| link.epoch), Some(first.epoch));
        state.detach_host("host-a", first.epoch);
        assert_eq!(state.host("host-a").map(|link| link.epoch), Some(second.epoch));
        state.detach_host("host-a", second.epoch);
        assert!(state.host("host-a").is_none());
        assert_eq!(state.host_count(), 0);
    }

    #[test]
    fn connections_are_tracked_per_host_link() {
        let state = RelayState::new();
        let (host_tx, mut host_rx) = mpsc::unbounded_channel();
        let (link, _) = state.attach_host("host-a", host_tx);
        let (client_tx, _client_rx) = mpsc::unbounded_channel();
        let id = state.next_conn_id();
        assert_ne!(id, state.next_conn_id());
        link.add_conn(&id, client_tx);
        assert_eq!(link.conn_count(), 1);
        assert!(link.conn(&id).is_some());
        assert!(link.send(&RelayFrame::open(&id)));
        assert_eq!(host_rx.try_recv().unwrap(), RelayFrame::open(&id).encode());
        assert!(link.remove_conn(&id).is_some());
        assert!(link.remove_conn(&id).is_none());
        assert!(link.drain_conns().is_empty());
    }
}
