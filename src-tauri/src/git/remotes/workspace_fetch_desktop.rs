//! Desktop-owned confirmation for the existing Workspace Fetch preview.
use super::workspace_fetch_fixture::{
    workspace_fetch_checked, RegisteredWorkspaceSession, WorkspaceFetchAuthority,
    WorkspaceFetchExecution,
};
use super::ScopedProgress;
use crate::git::{GitProgressEvent, ScopedRemoteCancellation};
use std::sync::{Arc, Mutex};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tauri::{State, Window};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct DesktopWorkspaceFetch {
    authority: Arc<WorkspaceFetchAuthority>,
    windows: Arc<Mutex<DesktopWindows>>,
}

#[derive(Default)]
struct DesktopWindows {
    next_id: u64,
    sessions: HashMap<String, (u64, RegisteredWorkspaceSession)>,
    operations: HashMap<(u64, String), Arc<ScopedRemoteCancellation>>,
}

struct DesktopOperation {
    windows: Arc<Mutex<DesktopWindows>>,
    key: (u64, String),
    cancellation: Arc<ScopedRemoteCancellation>,
}

impl Drop for DesktopOperation {
    fn drop(&mut self) {
        self.windows
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .operations
            .remove(&self.key);
    }
}

#[derive(serde::Deserialize)]
pub struct DesktopFetchSelection {
    path: String,
    fingerprint: String,
}

const MAX_SELECTION: usize = 32;

impl DesktopWorkspaceFetch {
    fn begin(&self, window: &str) -> Result<(u64, u64), String> {
        let mut windows = self.windows.lock().map_err(|error| error.to_string())?;
        let id = match windows.sessions.get(window) {
            Some((id, _)) => *id,
            None => {
                windows.next_id = windows
                    .next_id
                    .checked_add(1)
                    .ok_or("Workspace session IDs exhausted")?;
                let id = windows.next_id;
                windows
                    .sessions
                    .insert(window.into(), (id, self.authority.register(id)?));
                id
            }
        };
        Ok((id, self.authority.invalidate(id)?))
    }

    fn session(&self, window: &str) -> Result<u64, String> {
        self.windows
            .lock()
            .map_err(|error| error.to_string())?
            .sessions
            .get(window)
            .map(|(id, _)| *id)
            .ok_or_else(|| "Confirm the repositories in the native picker first".into())
    }

    pub fn close(&self, window: &str) {
        let running = {
            let mut windows = self.windows.lock().unwrap_or_else(|err| err.into_inner());
            let Some((id, session)) = windows.sessions.remove(window) else {
                return;
            };
            drop(session);
            windows
                .operations
                .iter()
                .filter(|((session_id, _), _)| *session_id == id)
                .map(|(_, operation)| operation.clone())
                .collect::<Vec<_>>()
        };
        for operation in running {
            tauri::async_runtime::spawn_blocking(move || operation.cancel());
        }
    }

    fn operation(&self, window: &str, op_id: String) -> Result<DesktopOperation, String> {
        use std::collections::hash_map::Entry;
        if op_id.trim().is_empty()
            || op_id.len() > 128
            || op_id.trim() != op_id
            || op_id.chars().any(char::is_control)
        {
            return Err("Invalid workspace fetch operation ID".into());
        }
        let mut windows = self.windows.lock().map_err(|err| err.to_string())?;
        let (id, _) = windows
            .sessions
            .get(window)
            .ok_or("Confirm the repositories in the native picker first")?;
        let key = (*id, op_id);
        let Entry::Vacant(slot) = windows.operations.entry(key.clone()) else {
            return Err("Workspace fetch operation already active".into());
        };
        let cancellation = Arc::new(ScopedRemoteCancellation::default());
        slot.insert(cancellation.clone());
        Ok(DesktopOperation {
            windows: self.windows.clone(),
            key,
            cancellation,
        })
    }

    fn cancellation_for(
        &self,
        window: &str,
        op_id: String,
    ) -> Option<Arc<ScopedRemoteCancellation>> {
        let windows = self.windows.lock().ok()?;
        let (id, _) = windows.sessions.get(window)?;
        windows.operations.get(&(*id, op_id)).cloned()
    }

    async fn execute(
        &self,
        window: &str,
        path: String,
        workspace_id: String,
        revision: u64,
        op_id: String,
        progress: Option<ScopedProgress>,
    ) -> Result<String, String> {
        let operation = self.operation(window, op_id)?;
        let path = canonical_checkout(path).await?;
        workspace_fetch_checked(
            self.authority.clone(),
            operation.key.0,
            path,
            workspace_id,
            revision,
            Some(WorkspaceFetchExecution {
                op_id: Some(operation.key.1.clone()),
                cancellation: operation.cancellation.clone(),
                progress,
                fixture_file_only: false,
            }),
        )
        .await
    }

    fn revoke(&self, window: &str) -> Result<(), String> {
        let windows = self.windows.lock().map_err(|error| error.to_string())?;
        if let Some((id, _)) = windows.sessions.get(window) {
            self.authority.revoke(*id)?;
        }
        Ok(())
    }
}

fn approve_native_selection(
    authority: &WorkspaceFetchAuthority,
    id: u64,
    revision: u64,
    workspace: &str,
    selection: Vec<DesktopFetchSelection>,
    picked: Vec<PathBuf>,
) -> Result<u64, String> {
    if selection.len() != picked.len() || picked.is_empty() || picked.len() > MAX_SELECTION {
        return Err("Choose exactly the repositories in the Workspace Fetch preview".into());
    }
    // Renderer requests identify which rows to compare. Only paths selected
    // in the native dialog may become approved members.
    let mut claims = HashMap::new();
    for row in &selection {
        let canonical = Path::new(&row.path)
            .canonicalize()
            .map_err(|error| error.to_string())?;
        if claims.insert(canonical, row.fingerprint.as_str()).is_some() {
            return Err("Workspace fetch selection is ambiguous".into());
        }
    }
    let picked = picked
        .iter()
        .map(|path| path.canonicalize().map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    if picked.iter().any(|path| !claims.contains_key(path)) {
        return Err("Choose exactly the repositories in the Workspace Fetch preview".into());
    }
    let membership = WorkspaceFetchAuthority::capture_membership(workspace, picked)?;
    if membership
        .review()
        .into_iter()
        .any(|(path, _, fingerprint)| claims.get(&path) != Some(&fingerprint.as_str()))
    {
        return Err("Workspace fetch target changed; check the selection again".into());
    }
    // Bind the originally selected canonical paths. Aliases must not become
    // executable handles on a future start.
    authority.publish(id, revision, membership)
}

#[tauri::command]
pub async fn workspace_fetch_desktop_confirm(
    window: Window,
    state: State<'_, DesktopWorkspaceFetch>,
    workspace_id: String,
    selection: Vec<DesktopFetchSelection>,
) -> Result<Option<u64>, String> {
    if selection.is_empty() || selection.len() > MAX_SELECTION {
        return Err("Workspace Fetch requires between 1 and 32 repositories".into());
    }
    let (id, revision) = state.begin(window.label())?;
    let authority = state.authority.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut picker = window
            .dialog()
            .file()
            .set_title("Confirm repository folders for Workspace Fetch")
            .set_parent(&window);
        if let Some(parent) = Path::new(&selection[0].path)
            .canonicalize()
            .ok()
            .and_then(|checkout| checkout.parent().map(Path::to_path_buf))
        {
            picker = picker.set_directory(parent);
        }
        let Some(picked) = picker.blocking_pick_folders() else {
            return Ok(None);
        };
        let paths = picked
            .into_iter()
            .map(|path| path.into_path().map_err(|error| error.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        approve_native_selection(&authority, id, revision, &workspace_id, selection, paths)
            .map(Some)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn workspace_fetch_desktop_revoke(
    window: Window,
    state: State<'_, DesktopWorkspaceFetch>,
) -> Result<(), String> {
    state.revoke(window.label())
}

#[tauri::command]
pub async fn workspace_fetch_desktop_validate(
    window: Window,
    state: State<'_, DesktopWorkspaceFetch>,
    path: String,
    workspace_id: String,
    revision: u64,
) -> Result<(), String> {
    let id = state.session(window.label())?;
    let path = canonical_checkout(path).await?;
    workspace_fetch_checked(
        state.authority.clone(),
        id,
        path,
        workspace_id,
        revision,
        None,
    )
    .await
    .map(|_| ())
}

async fn canonical_checkout(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Path::new(&path)
            .canonicalize()
            .map_err(|error| error.to_string())?
            .into_os_string()
            .into_string()
            .map_err(|_| "Checkout is not valid UTF-8".to_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn workspace_fetch_desktop_start(
    window: Window,
    state: State<'_, DesktopWorkspaceFetch>,
    path: String,
    workspace_id: String,
    revision: u64,
    op_id: String,
    progress: tauri::ipc::Channel<GitProgressEvent>,
) -> Result<String, String> {
    state
        .execute(
            window.label(),
            path,
            workspace_id,
            revision,
            op_id,
            Some(Box::new(move |event| {
                let _ = progress.send(event);
            })),
        )
        .await
}

#[tauri::command]
pub async fn workspace_fetch_desktop_cancel(
    window: Window,
    state: State<'_, DesktopWorkspaceFetch>,
    op_id: String,
) -> Result<bool, String> {
    let Some(cancel) = state.cancellation_for(window.label(), op_id) else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || cancel.cancel())
        .await
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg(all(test, feature = "headless"))]
mod tests {
    use super::super::{
        workspace_fetch_fixture::test_repos::TestRepo, workspace_fetch_target, workspace_remotes,
    };
    use super::*;

    fn selection(repo: &TestRepo) -> DesktopFetchSelection {
        let target =
            workspace_fetch_target(&repo.path, &workspace_remotes(&repo.path).unwrap()).unwrap();
        DesktopFetchSelection {
            path: repo.s().to_owned(),
            fingerprint: target.summary().fingerprint,
        }
    }

    #[tokio::test]
    async fn desktop_workspace_fetch_uses_picker_membership_and_retires_window_revisions() {
        let desktop = DesktopWorkspaceFetch::default();
        let source = TestRepo::new("desktop-workspace-source");
        let repo = TestRepo::new("desktop-workspace-approved");
        let other = TestRepo::new("desktop-workspace-not-approved");
        source.commit(
            "fixture.txt",
            "local
",
            "file remote",
        );
        for fixture in [&repo, &other] {
            fixture.git(&["remote", "add", "origin", &source.file_url()]);
        }
        let path = repo
            .path
            .canonicalize()
            .unwrap()
            .into_os_string()
            .into_string()
            .unwrap();
        let check = |id, revision, path: String, fetch: bool| {
            workspace_fetch_checked(
                desktop.authority.clone(),
                id,
                path,
                "workspace".into(),
                revision,
                fetch.then(|| WorkspaceFetchExecution {
                    op_id: None,
                    cancellation: Arc::default(),
                    progress: None,
                    fixture_file_only: true,
                }),
            )
        };
        let approve = |id, revision| {
            approve_native_selection(
                &desktop.authority,
                id,
                revision,
                "workspace",
                vec![selection(&repo)],
                vec![repo.path.clone()],
            )
        };
        let (id, first) = desktop.begin("main").unwrap();
        assert!(check(id, first, path.clone(), false)
            .await
            .unwrap_err()
            .contains("active, open"));
        assert!(approve_native_selection(
            &desktop.authority,
            id,
            first,
            "workspace",
            vec![selection(&repo)],
            vec![other.path.clone()]
        )
        .is_err());
        assert!(!repo.exists(".git/FETCH_HEAD"));
        let (id, revision) = desktop.begin("main").unwrap();
        assert_eq!(approve(id, revision), Ok(revision));
        check(id, revision, path.clone(), false).await.unwrap();
        assert!(!repo.exists(".git/FETCH_HEAD"));
        let (second, _) = desktop.begin("other-window").unwrap();
        assert_ne!(id, second);
        assert!(check(second, revision, path.clone(), true).await.is_err());
        let other_path = other
            .path
            .canonicalize()
            .unwrap()
            .into_os_string()
            .into_string()
            .unwrap();
        assert!(check(id, revision, other_path, true).await.is_err());
        assert!(!other.exists(".git/FETCH_HEAD"));

        let (id, pending) = desktop.begin("main").unwrap();
        desktop.revoke("main").unwrap();
        assert!(approve(id, pending).unwrap_err().contains("superseded"));
        assert!(check(id, revision, path.clone(), true).await.is_err());
        assert!(!repo.exists(".git/FETCH_HEAD"));

        let (id, latest) = desktop.begin("main").unwrap();
        approve(id, latest).unwrap();
        let other_remote = TestRepo::new("desktop-workspace-retarget");
        repo.git(&["remote", "set-url", "origin", &other_remote.file_url()]);
        assert!(check(id, latest, path.clone(), false)
            .await
            .unwrap_err()
            .contains("target changed"));
        assert!(check(id, latest, path.clone(), true).await.is_err());
        assert!(!repo.exists(".git/FETCH_HEAD"));
        repo.git(&["remote", "set-url", "origin", &source.file_url()]);
        desktop
            .execute(
                "main",
                path.clone(),
                "workspace".into(),
                latest,
                "local-start".into(),
                None,
            )
            .await
            .unwrap();
        assert_eq!(repo.rev("refs/remotes/origin/main"), source.head());
        assert!(desktop
            .cancellation_for("main", "local-start".into())
            .is_none());
        desktop.close("main");
        assert!(check(id, latest, path, true)
            .await
            .unwrap_err()
            .contains("session is closed"));
        assert!(desktop.session("main").is_err());
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn desktop_workspace_fetch_cancel_is_window_bound_and_retry_rechecks_revision() {
        let desktop = Arc::new(DesktopWorkspaceFetch::default());
        let source = TestRepo::new("desktop-workspace-cancel-source");
        let repo = TestRepo::new("desktop-workspace-cancel-checkout");
        source.commit("fixture.txt", "fixture\n", "local");
        repo.git(&["remote", "add", "origin", &source.file_url()]);
        let (id, revision) = desktop.begin("main").unwrap();
        approve_native_selection(
            &desktop.authority,
            id,
            revision,
            "workspace",
            vec![selection(&repo)],
            vec![repo.path.clone()],
        )
        .unwrap();
        let (_other, _) = desktop.begin("other").unwrap();
        let execute = |state: Arc<DesktopWorkspaceFetch>, revision, op_id: &'static str| {
            let path = repo.s().to_owned();
            async move {
                state
                    .execute(
                        "main",
                        path,
                        "workspace".into(),
                        revision,
                        op_id.into(),
                        None,
                    )
                    .await
            }
        };
        let (arrived, resume) = desktop.authority.pause_before_spawn();
        let in_flight = tokio::spawn(execute(desktop.clone(), revision, "pending"));
        arrived
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert!(desktop
            .cancellation_for("other", "pending".into())
            .is_none());
        desktop
            .cancellation_for("main", "pending".into())
            .unwrap()
            .cancel();
        resume.send(()).unwrap();
        assert_eq!(
            in_flight.await.unwrap(),
            Err(crate::git::REMOTE_CANCELED.into())
        );
        assert!(desktop.cancellation_for("main", "pending".into()).is_none());
        assert!(!repo.exists(".git/FETCH_HEAD"));

        let original = source.path.join(".git");
        let offline = source.path.join("offline");
        std::fs::rename(&original, &offline).unwrap();
        let failed = execute(desktop.clone(), revision, "failed").await;
        std::fs::rename(&offline, &original).unwrap();
        assert!(failed.is_err());
        execute(desktop.clone(), revision, "retry").await.unwrap();
        assert_eq!(repo.rev("refs/remotes/origin/main"), source.head());

        let (arrived, resume) = desktop.authority.pause_before_spawn();
        let in_flight = tokio::spawn(execute(desktop.clone(), revision, "end"));
        arrived
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        desktop.revoke("main").unwrap();
        resume.send(()).unwrap();
        assert!(in_flight
            .await
            .unwrap()
            .unwrap_err()
            .contains("active, open membership"));
        assert!(execute(desktop.clone(), revision, "stale-retry")
            .await
            .is_err());

        repo.git(&["remote", "set-url", "origin", "ext::workspace-fixture"]);
        let (id, revision) = desktop.begin("main").unwrap();
        approve_native_selection(
            &desktop.authority,
            id,
            revision,
            "workspace",
            vec![selection(&repo)],
            vec![repo.path.clone()],
        )
        .unwrap();
        assert!(execute(desktop.clone(), revision, "network-refused")
            .await
            .unwrap_err()
            .contains("target type is unsupported"));
    }
}
