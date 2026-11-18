//! Test-only server authority and execution path. The production workspace
//! is renderer-owned, so no desktop or release daemon command is exposed.
use super::*;
use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::sync::{Arc, RwLock};

#[derive(Default)]
pub(crate) struct WorkspaceFetchAuthority {
    state: RwLock<WorkspaceFetchState>,
    before_spawn: FixtureBarrier,
    before_publish: FixtureBarrier,
}

#[derive(Default)]
struct FixtureBarrier(
    std::sync::Mutex<Option<(std::sync::mpsc::Sender<()>, std::sync::mpsc::Receiver<()>)>>,
);

impl FixtureBarrier {
    fn pause(&self) -> Result<(), String> {
        let barrier = self.0.lock().map_err(|error| error.to_string())?.take();
        if let Some((arrived, release)) = barrier {
            arrived.send(()).map_err(|error| error.to_string())?;
            release
                .recv_timeout(std::time::Duration::from_secs(5))
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn arm(&self) -> (std::sync::mpsc::Receiver<()>, std::sync::mpsc::Sender<()>) {
        let (arrived, arrival) = std::sync::mpsc::channel();
        let (resume, release) = std::sync::mpsc::channel();
        assert!(self.0.lock().unwrap().replace((arrived, release)).is_none());
        (arrival, resume)
    }
}

#[derive(Default)]
struct WorkspaceFetchState {
    sessions: HashMap<u64, WorkspaceFetchSession>,
    revision: u64,
}

#[derive(Default)]
struct WorkspaceFetchSession {
    revision: u64,
    membership: Option<WorkspaceFetchMembership>,
}

struct WorkspaceFetchMembership {
    workspace: String,
    approvals: Vec<Arc<WorkspaceFetchApproval>>,
}

pub(crate) struct RegisteredWorkspaceSession<'a> {
    authority: &'a WorkspaceFetchAuthority,
    id: u64,
}

impl Drop for RegisteredWorkspaceSession<'_> {
    fn drop(&mut self) {
        self.authority
            .state
            .write()
            .unwrap_or_else(|err| err.into_inner())
            .sessions
            .remove(&self.id);
    }
}

impl WorkspaceFetchAuthority {
    pub(crate) fn register(&self, id: u64) -> Result<RegisteredWorkspaceSession<'_>, String> {
        use std::collections::hash_map::Entry;
        let mut state = self.state.write().map_err(|err| err.to_string())?;
        let Entry::Vacant(entry) = state.sessions.entry(id) else {
            return Err("Workspace fetch session already registered".into());
        };
        entry.insert(WorkspaceFetchSession::default());
        Ok(RegisteredWorkspaceSession {
            authority: self,
            id,
        })
    }

    pub(crate) fn is_registered(&self, id: u64) -> bool {
        self.state.read().unwrap().sessions.contains_key(&id)
    }

    pub(crate) fn pause_before_spawn(
        &self,
    ) -> (std::sync::mpsc::Receiver<()>, std::sync::mpsc::Sender<()>) {
        self.before_spawn.arm()
    }

    // Only the native host calls these methods. IPC receives the revision of
    // a host decision, never a membership list or permission to modify it.
    pub(crate) fn replace_membership(
        &self,
        id: u64,
        workspace: &str,
        opened: Vec<PathBuf>,
    ) -> Result<u64, String> {
        // Fail closed while resolving the replacement. A close, revoke or
        // newer host update during capture prevents publication.
        let revision = self.invalidate(id)?;
        let mut approvals = Vec::with_capacity(opened.len());
        let mut common_dirs = HashSet::new();
        for path in opened {
            let approval = WorkspaceFetchApproval::capture(path)?;
            if !common_dirs.insert(approval.common_dir.clone()) {
                return Err("Workspace fetch membership is ambiguous".into());
            }
            approvals.push(Arc::new(approval));
        }
        self.before_publish.pause()?;
        let mut state = self.state.write().map_err(|err| err.to_string())?;
        let session = state
            .sessions
            .get_mut(&id)
            .ok_or("Workspace fetch session is closed")?;
        if session.revision != revision {
            return Err("Workspace fetch host update was superseded".into());
        }
        session.membership = Some(WorkspaceFetchMembership {
            workspace: workspace.into(),
            approvals,
        });
        Ok(revision)
    }

    pub(crate) fn revoke(&self, id: u64) -> Result<(), String> {
        self.invalidate(id).map(|_| ())
    }

    fn invalidate(&self, id: u64) -> Result<u64, String> {
        let mut state = self.state.write().map_err(|err| err.to_string())?;
        let WorkspaceFetchState { sessions, revision } = &mut *state;
        let session = sessions
            .get_mut(&id)
            .ok_or("Workspace fetch session is closed")?;
        session.membership = None;
        *revision = revision
            .checked_add(1)
            .ok_or("Workspace fetch revision exhausted")?;
        session.revision = *revision;
        Ok(*revision)
    }
}

impl WorkspaceFetchSession {
    fn approval(
        &self,
        revision: u64,
        workspace: &str,
        repo: &Path,
    ) -> Result<&Arc<WorkspaceFetchApproval>, String> {
        let membership = self
            .membership
            .as_ref()
            .filter(|membership| membership.workspace == workspace)
            .ok_or("Workspace fetch requires active, open membership")?;
        if revision != self.revision {
            return Err("Workspace fetch approval is stale".into());
        }
        membership
            .approvals
            .iter()
            .find(|entry| entry.path == repo)
            .ok_or_else(|| "Workspace fetch requires active, open membership".into())
    }
}

struct WorkspaceFetchApproval {
    path: PathBuf,
    checkout: File,
    common_dir: PathBuf,
    common_directory: File,
    target: ResolvedFetchTarget,
}

fn open_directory(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
        .map_err(|error| error.to_string())
}

fn same_directory(first: &File, second: &File) -> Result<bool, String> {
    let identity = |file: &File| {
        file.metadata()
            .map(|metadata| (metadata.dev(), metadata.ino()))
            .map_err(|error| error.to_string())
    };
    Ok(identity(first)? == identity(second)?)
}

fn resolved_target(repo: &PathBuf) -> Result<ResolvedFetchTarget, String> {
    workspace_fetch_target(repo, &workspace_remotes(repo)?)
        .ok_or_else(|| "Workspace fetch has no unambiguous target".into())
}

impl WorkspaceFetchApproval {
    // The fixture administrator calls this directly. Neither preview IPC nor
    // the workspace fetch request can create or update an approval.
    fn capture(path: PathBuf) -> Result<Self, String> {
        let target = resolved_target(&path)?;
        let top = run_git(
            &target.checkout,
            &["rev-parse", "--path-format=absolute", "--show-toplevel"],
        )?;
        if Path::new(top.strip_suffix('\n').unwrap_or(&top))
            .canonicalize()
            .ok()
            .as_ref()
            != Some(&target.checkout)
        {
            return Err("Workspace fetch requires an opened checkout root".into());
        }
        let common_dir = coordination::repo_common_dir(&target.checkout)?;
        Ok(Self {
            path,
            checkout: open_directory(&target.checkout)?,
            common_directory: open_directory(&common_dir)?,
            common_dir,
            target,
        })
    }

    fn verify_identity(
        &self,
        path: &Path,
        common_dir: &Path,
        lock: &RemoteProcessLock,
    ) -> Result<(), String> {
        let checkout = path.canonicalize().map_err(|error| error.to_string())?;
        if checkout != self.target.checkout
            || common_dir != self.common_dir
            || !same_directory(&self.checkout, &open_directory(&checkout)?)?
            || !same_directory(&self.common_directory, lock.directory())?
            || !same_directory(lock.directory(), &open_directory(common_dir)?)?
            || coordination::repo_common_dir(&checkout)? != common_dir
        {
            return Err("Workspace fetch repository identity changed".into());
        }
        Ok(())
    }
}

pub(crate) async fn workspace_fetch_fixture(
    authority: Arc<WorkspaceFetchAuthority>,
    session_id: u64,
    path: String,
    workspace_id: String,
    revision: u64,
    op_id: Option<String>,
    cancellation: Arc<ScopedRemoteCancellation>,
) -> Result<String, String> {
    let approval = {
        let state = authority.state.read().map_err(|err| err.to_string())?;
        state
            .sessions
            .get(&session_id)
            .ok_or("Workspace fetch session is closed")?
            .approval(revision, &workspace_id, Path::new(&path))?
            .clone()
    };
    spawn_repo_remote(path, move |repo, common_dir, lock| {
        approval.verify_identity(&repo, common_dir, lock)?;
        let checkout = &approval.target.checkout;
        let target = resolved_target(checkout)?;
        if target.remote != approval.target.remote
            || target.url != approval.target.url
            || target.refspecs != approval.target.refspecs
        {
            return Err("Workspace fetch target changed".into());
        }
        if !target.url.starts_with("file:///") {
            return Err("Workspace fetch fixture requires a local file URL".into());
        }
        // Passing the expanded URL back to Git must not apply a second
        // insteadOf rewrite. This check is local and never opens a transport.
        let literal = run_git_command_bytes(
            git_command(),
            checkout,
            &["ls-remote", "--get-url", "--", &target.url],
        )?;
        if literal.strip_suffix(b"\n") != Some(target.url.as_bytes()) {
            return Err("Workspace fetch URL would be rewritten again".into());
        }

        let mut args = [
            "fetch",
            "--no-recurse-submodules",
            "--no-auto-maintenance",
            "--no-tags",
            "--no-prune",
            "--no-prune-tags",
            "--refmap=",
            "--",
        ]
        .map(str::to_owned)
        .to_vec();
        args.push(target.url);
        let refspecs = std::str::from_utf8(&target.refspecs).map_err(|error| error.to_string())?;
        args.extend(
            refspecs
                .trim_end_matches('\0')
                .split('\0')
                .map(str::to_owned),
        );
        approval.verify_identity(&repo, common_dir, lock)?;
        // An update or disconnect during local Git validation invalidates the
        // earlier approval. Serialize the last check with actual child spawn,
        // releasing the session guard before waiting for the child.
        authority.before_spawn.pause()?;
        let state = authority.state.read().map_err(|err| err.to_string())?;
        state
            .sessions
            .get(&session_id)
            .ok_or("Workspace fetch session is closed")?
            .approval(revision, &workspace_id, &repo)?;
        run_remote_op_with_spawn_guard(
            "fetch",
            &repo.to_string_lossy(),
            Some(checkout),
            args,
            op_id,
            Some(lock),
            Some(&cancellation),
            state,
        )
    })
    .await
}

#[path = "../../../tests/common/mod.rs"]
mod test_repos;

mod tests {
    use super::test_repos::TestRepo;
    use super::*;
    use crate::server::{
        dispatch::dispatch,
        state::{ConnectionHandle, DispatchCtx, ServerState},
    };
    use serde_json::{json, Value};

    const COMMAND: &str = "__test_workspace_fetch";
    const WORKSPACE: &str = "fixture-workspace";
    const FETCH_REFSPEC: &str = "+refs/heads/*:refs/remotes/origin/*";

    struct Fixture {
        ctx: DispatchCtx,
        repo: TestRepo,
        source: TestRepo,
        alias: String,
    }

    impl Fixture {
        fn new() -> Self {
            let repo = TestRepo::new("workspace-fetch-binding");
            let source = TestRepo::new("workspace-fetch-file-remote");
            source.commit("story.txt", "first\n", "first");
            let alias = format!("{}/target-alias", source.file_url());
            let state = ServerState::new("fixture".into(), [0; 32], vec![repo.path.clone()]);
            let (tx, _rx) = tokio::sync::mpsc::channel(1);
            let ctx = DispatchCtx::new(state, Arc::new(ConnectionHandle::new(1, tx)), 1, COMMAND);
            let fixture = Self {
                ctx,
                repo,
                source,
                alias,
            };
            fixture.configure_target();
            fixture
        }

        fn configure_target(&self) {
            self.repo.git(&["remote", "add", "origin", &self.alias]);
            self.repo.git(&[
                "config",
                &format!("url.{}.insteadOf", self.source.file_url()),
                &self.alias,
            ]);
        }

        fn approve(&self) -> u64 {
            self.ctx
                .state
                .workspace_fetch_authority
                .replace_membership(self.ctx.conn.id, WORKSPACE, vec![self.repo.path.clone()])
                .unwrap()
        }

        async fn fetch(&self, revision: u64, op_id: Option<&str>) -> Result<Value, String> {
            dispatch(
                COMMAND,
                json!({
                    "path": self.repo.s(), "workspaceId": WORKSPACE, "workspaceRevision": revision, "opId": op_id,
                    "target": { "remote": "origin", "fingerprint": "client-value" },
                    "remote": self.alias,
                    "sessionId": self.ctx.conn.id + 1,
                }),
                &self.ctx,
            )
            .await
        }

        fn fetch_commands(&self) -> Vec<Vec<String>> {
            let canonical = self.repo.path.canonicalize().unwrap();
            crate::cmdlog::git_command_log(None)
                .into_iter()
                .filter_map(|entry| {
                    let path = Path::new(&entry.repo_path);
                    (entry.args.first().is_some_and(|arg| arg == "fetch")
                        && (path == self.repo.path || path == canonical))
                        .then_some(entry.args)
                })
                .collect()
        }

        async fn reject(&self, revision: u64, op_id: Option<&str>, expected: &str) {
            let before = self.fetch_commands();
            let error = self.fetch(revision, op_id).await.unwrap_err();
            assert!(error.contains(expected), "{error}");
            assert_eq!(
                self.fetch_commands(),
                before,
                "rejection reached the fetch runner"
            );
        }
    }

    #[tokio::test]
    async fn workspace_fetch_ipc_binds_start_and_retry_to_server_approval() {
        let fixture = Fixture::new();
        let _session = fixture
            .ctx
            .state
            .workspace_fetch_authority
            .register(fixture.ctx.conn.id)
            .unwrap();
        let preview = dispatch(
            "repo_fetch_scope",
            json!({ "path": fixture.repo.s() }),
            &fixture.ctx,
        )
        .await
        .unwrap();
        assert_eq!(preview["remotes"], json!(["origin"]));
        assert_eq!(
            preview["commonDir"],
            coordination::repo_common_dir(&fixture.repo.path)
                .unwrap()
                .to_str()
                .unwrap()
        );
        assert_eq!(preview["target"]["remote"], "origin");
        assert_eq!(preview["target"]["fingerprint"].as_str().unwrap().len(), 64);
        assert_eq!(preview["target"].as_object().unwrap().len(), 2);
        assert!(!preview.to_string().contains("file://"));

        fixture.reject(0, None, "active, open membership").await;
        let revision = fixture.approve();
        fixture.fetch(revision, None).await.unwrap();
        assert_eq!(
            fixture.repo.rev("refs/remotes/origin/main"),
            fixture.source.head()
        );
        let next = fixture.source.commit("story.txt", "second\n", "second");
        let metadata = fixture.source.path.join(".git");
        let offline = fixture.source.path.join("offline-git");
        std::fs::rename(&metadata, &offline).unwrap();
        let failed = fixture
            .fetch(revision, Some("workspace-first-attempt"))
            .await;
        std::fs::rename(&offline, &metadata).unwrap();
        assert!(
            failed.is_err(),
            "an offline file remote unexpectedly fetched"
        );
        fixture
            .fetch(revision, Some("workspace-retry"))
            .await
            .unwrap();
        assert_eq!(fixture.repo.rev("refs/remotes/origin/main"), next);
        let commands = fixture.fetch_commands();
        assert_eq!(commands.len(), 3);
        for args in &commands {
            assert_eq!(
                &args[args.len() - 2..],
                &[fixture.source.file_url(), FETCH_REFSPEC.into()]
            );
        }
        assert!(commands
            .iter()
            .any(|args| args.iter().any(|arg| arg == "--progress")));
        assert!(commands
            .iter()
            .any(|args| !args.iter().any(|arg| arg == "--progress")));
    }

    #[tokio::test]
    async fn workspace_fetch_ipc_holds_stale_requests_before_spawn() {
        let fixture = Fixture::new();
        let authority = &fixture.ctx.state.workspace_fetch_authority;
        let session = fixture.ctx.conn.id;
        let _session = authority.register(session).unwrap();
        let revision = fixture.approve();
        let preview_args = json!({ "path": fixture.repo.s() });
        let original_preview = dispatch("repo_fetch_scope", preview_args.clone(), &fixture.ctx)
            .await
            .unwrap();

        let closed = authority
            .replace_membership(session, WORKSPACE, vec![])
            .unwrap();
        fixture
            .reject(closed, None, "active, open membership")
            .await;
        let switched = authority
            .replace_membership(session, "other", vec![fixture.repo.path.clone()])
            .unwrap();
        fixture
            .reject(switched, Some("retry-workspace"), "active, open membership")
            .await;
        authority.revoke(session).unwrap();
        fixture
            .reject(revision, Some("retry-revoked"), "active, open membership")
            .await;
        let revision = fixture.approve();
        assert!(authority
            .replace_membership(
                session,
                WORKSPACE,
                vec![fixture.repo.path.clone(), fixture.repo.path.clone()]
            )
            .unwrap_err()
            .contains("ambiguous"));

        fixture
            .reject(revision, None, "active, open membership")
            .await;
        let revision = fixture.approve();

        let other = TestRepo::new("workspace-fetch-other-remote");
        other.commit("different.txt", "different\n", "other");
        fixture
            .repo
            .git(&["remote", "set-url", "origin", &other.file_url()]);
        fixture.reject(revision, None, "target changed").await;
        fixture
            .repo
            .git(&["remote", "set-url", "origin", &fixture.alias]);
        fixture.repo.git(&[
            "config",
            "remote.origin.fetch",
            "refs/heads/main:refs/remotes/alternate/main",
        ]);
        fixture
            .reject(revision, Some("retry-refspec"), "target changed")
            .await;
        fixture
            .repo
            .git(&["config", "remote.origin.fetch", FETCH_REFSPEC]);

        let rewrite = format!("url.{}.insteadOf", other.file_url());
        fixture
            .repo
            .git(&["config", &rewrite, &fixture.source.file_url()]);
        fixture
            .reject(
                revision,
                Some("retry-rewritten"),
                "would be rewritten again",
            )
            .await;
        fixture.repo.git(&["config", "--unset", &rewrite]);

        let common_dir = coordination::repo_common_dir(&fixture.repo.path).unwrap();
        let lock = RemoteProcessLock::acquire(&common_dir).unwrap();
        fixture
            .reject(revision, Some("retry-busy"), "git.remoteBusy")
            .await;
        drop(lock);

        // Reusing both Git paths and the exact remote/refspec metadata cannot
        // make a different common-directory inode pass the old approval.
        std::fs::rename(
            fixture.repo.path.join(".git"),
            fixture.repo.path.join("old-git"),
        )
        .unwrap();
        fixture.repo.git(&["init", "-q", "-b", "main"]);
        fixture.configure_target();
        assert_eq!(
            coordination::repo_common_dir(&fixture.repo.path).unwrap(),
            common_dir
        );
        assert_eq!(
            dispatch("repo_fetch_scope", preview_args, &fixture.ctx)
                .await
                .unwrap(),
            original_preview
        );
        fixture
            .reject(
                revision,
                Some("retry-replaced"),
                "repository identity changed",
            )
            .await;
        assert!(!fixture.repo.exists(".git/FETCH_HEAD"));
    }
    #[tokio::test]
    async fn host_retarget_requires_a_new_revision_and_disconnect_retires_it() {
        let fixture = Fixture::new();
        let authority = &fixture.ctx.state.workspace_fetch_authority;
        let session = authority.register(fixture.ctx.conn.id).unwrap();
        let original = fixture.approve();
        let other = TestRepo::new("workspace-host-retarget");
        other.commit("other.txt", "other content", "other");
        fixture
            .repo
            .git(&["remote", "set-url", "origin", &other.file_url()]);
        fixture.reject(original, None, "target changed").await;
        let updated = fixture.approve();
        fixture
            .reject(original, Some("retry-old-target"), "approval is stale")
            .await;
        fixture.fetch(updated, None).await.unwrap();
        assert_eq!(fixture.repo.rev("refs/remotes/origin/main"), other.head());
        assert_eq!(
            fixture.fetch_commands()[0].iter().rev().nth(1),
            Some(&other.file_url())
        );
        drop(session);
        fixture
            .reject(updated, Some("retry-disconnected"), "session is closed")
            .await;
        assert!(authority.revoke(fixture.ctx.conn.id).is_err());
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn workspace_fetch_rechecks_native_lifecycle_at_the_spawn_boundary() {
        use std::time::Duration;
        let fixture = Arc::new(Fixture::new());
        let authority = &fixture.ctx.state.workspace_fetch_authority;
        let id = fixture.ctx.conn.id;
        let mut session = Some(authority.register(id).unwrap());
        for change in ["switch", "close", "disconnect"] {
            let revision = fixture.approve();
            let (arrived, resume) = authority.pause_before_spawn();
            let queued = {
                let fixture = fixture.clone();
                tokio::spawn(async move { fixture.fetch(revision, Some("delayed")).await })
            };
            arrived.recv_timeout(Duration::from_secs(5)).unwrap();
            match change {
                "switch" => {
                    authority.replace_membership(id, "other", vec![]).unwrap();
                }
                "close" => {
                    authority.replace_membership(id, WORKSPACE, vec![]).unwrap();
                }
                "disconnect" => {
                    drop(session.take());
                }
                _ => unreachable!(),
            }
            resume.send(()).unwrap();
            assert!(queued.await.unwrap().is_err());
            assert!(fixture.fetch_commands().is_empty());
            assert!(!fixture.repo.exists(".git/FETCH_HEAD"));
        }
        let _reconnected = authority.register(id + 1).unwrap();
        let revision = authority
            .replace_membership(id + 1, WORKSPACE, vec![fixture.repo.path.clone()])
            .unwrap();
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let ctx = DispatchCtx::new(
            fixture.ctx.state.clone(),
            Arc::new(ConnectionHandle::new(id + 1, tx)),
            1,
            COMMAND,
        );
        dispatch(
            COMMAND,
            json!({
                "path": fixture.repo.s(), "workspaceId": WORKSPACE, "workspaceRevision": revision,
            }),
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(fixture.fetch_commands().len(), 1);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn workspace_fetch_overlapping_native_updates_keep_only_the_latest() {
        use std::time::Duration;
        let fixture = Fixture::new();
        let authority = fixture.ctx.state.workspace_fetch_authority.clone();
        let id = fixture.ctx.conn.id;
        let _session = authority.register(id).unwrap();
        let old = fixture.approve();
        let (arrived, resume) = authority.before_publish.arm();
        let delayed = {
            let authority = authority.clone();
            let repo = fixture.repo.path.clone();
            tokio::task::spawn_blocking(move || {
                authority.replace_membership(id, "older", vec![repo])
            })
        };
        arrived.recv_timeout(Duration::from_secs(5)).unwrap();
        fixture.reject(old, None, "active, open membership").await;
        let latest = fixture.approve();
        resume.send(()).unwrap();
        assert!(delayed.await.unwrap().unwrap_err().contains("superseded"));
        fixture.reject(old, Some("old-retry"), "stale").await;
        fixture.fetch(latest, None).await.unwrap();
        assert_eq!(fixture.fetch_commands().len(), 1);
    }
}
