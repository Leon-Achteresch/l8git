#![cfg(all(feature = "headless", any(target_os = "macos", target_os = "linux")))]

mod common;

use common::{json, TestRepo};
use l8git_lib::{
    git,
    server::{
        dispatch::dispatch,
        state::{ConnectionHandle, DispatchCtx, ServerState},
    },
    sink::{set_sink, EventSink},
};
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{mpsc, Arc},
    time::Duration,
};

struct CatalogSink(mpsc::Sender<String>);

impl EventSink for CatalogSink {
    fn emit(&self, name: &str, payload: Value) {
        if name == "repo-worktrees-changed" {
            self.0.send(payload.as_str().unwrap().to_owned()).ok();
        }
    }
}

#[tokio::test]
async fn linked_worktree_reports_external_catalog_changes_but_stays_quiet_otherwise() {
    let parent = TestRepo::new("watch-main");
    parent.commit("fixture.txt", "fixture\n", "initial");
    let linked_path = common::scratch_path("watch-linked");
    parent.git(&["worktree", "add", "--detach", linked_path.to_str().unwrap()]);
    let linked = TestRepo::adopt(linked_path);
    assert!(linked.path.join(".git").is_file());

    struct Cleanup(Vec<PathBuf>);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            for path in &self.0 {
                let _ = std::fs::remove_dir_all(path);
            }
        }
    }
    let extras = Cleanup(
        (0..3)
            .map(|_| common::scratch_path("watch-extra"))
            .collect(),
    );
    let (tx, rx) = mpsc::channel();
    set_sink(Arc::new(CatalogSink(tx)));
    let path = linked.s();

    let state = ServerState::new("fixture".into(), [0; 32], vec![linked.path.clone()]);
    let (tx, _rx) = tokio::sync::mpsc::channel(8);
    let context = DispatchCtx::new(
        state.clone(),
        Arc::new(ConnectionHandle::new(1, tx)),
        1,
        "watch_repo",
    );
    dispatch("watch_repo", serde_json::json!({ "path": path }), &context)
        .await
        .unwrap();

    struct Watch(Arc<ServerState>, String);
    impl Drop for Watch {
        fn drop(&mut self) {
            let _ = self.0.unwatch(1, &self.1);
        }
    }
    let _watch = Watch(state, path.clone());

    let quiet = |phase: &str, millis: u64| {
        assert!(
            matches!(
                rx.recv_timeout(Duration::from_millis(millis)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ),
            "{phase}"
        );
    };
    let changed = |phase: &str| {
        assert_eq!(rx.recv_timeout(Duration::from_secs(6)).expect(phase), path);
    };
    quiet("initial", 950);
    linked.write("fixture.txt", "normal edit\n");
    linked.git(&["add", "fixture.txt"]);
    quiet("edit", 950);

    for extra in &extras.0 {
        parent.git(&["worktree", "add", "--detach", extra.to_str().unwrap()]);
    }
    changed("add burst");
    let list = json(&git::list_worktrees(path.clone()).await.unwrap());
    assert_eq!(list.as_array().unwrap().len(), 5);
    quiet("add burst", 950);

    for extra in &extras.0 {
        parent.git(&["worktree", "remove", extra.to_str().unwrap()]);
    }
    changed("remove burst");
    let list = json(&git::list_worktrees(path.clone()).await.unwrap());
    assert_eq!(list.as_array().unwrap().len(), 2);
    quiet("remove burst and following stat probe", 3350);
}
