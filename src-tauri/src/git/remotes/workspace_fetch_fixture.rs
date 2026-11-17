//! Test-only server authority and execution path. The production workspace
//! is renderer-owned, so no desktop or release daemon command is exposed.
use super::*;
use std::fs::{File, OpenOptions};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::sync::{Arc, RwLock};

#[derive(Default)]
pub(crate) struct WorkspaceFetchFixture {
    pub(crate) active_workspace: Option<String>,
    pub(crate) opened: Vec<PathBuf>,
    pub(crate) approvals: Vec<WorkspaceFetchApproval>,
}

pub(crate) struct WorkspaceFetchApproval {
    workspace: String,
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
    pub(crate) fn capture(workspace: &str, path: PathBuf) -> Result<Self, String> {
        let target = resolved_target(&path)?;
        let common_dir = coordination::repo_common_dir(&target.checkout)?;
        Ok(Self {
            workspace: workspace.into(),
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
    authority: Arc<RwLock<WorkspaceFetchFixture>>,
    path: String,
    workspace_id: String,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_repo_remote(path, move |repo, common_dir, lock| {
        // Keep the trusted membership stable through this fixture operation.
        let authority = authority.read().map_err(|error| error.to_string())?;
        if authority.active_workspace.as_deref() != Some(&workspace_id)
            || !authority.opened.contains(&repo)
        {
            return Err("Workspace fetch requires active, open membership".into());
        }
        let mut approved = authority
            .approvals
            .iter()
            .filter(|entry| entry.workspace == workspace_id && entry.path == repo);
        let approval = approved
            .next()
            .ok_or("Workspace fetch has no approved membership")?;
        if approved.next().is_some() {
            return Err("Workspace fetch membership is ambiguous".into());
        }

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
        run_remote_op(
            "fetch",
            &repo.to_string_lossy(),
            Some(checkout),
            args,
            op_id,
            Some(lock),
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

        fn approve(&self) {
            let mut authority = self.ctx.state.workspace_fetch_fixture.write().unwrap();
            authority.active_workspace = Some(WORKSPACE.into());
            authority.opened = vec![self.repo.path.clone()];
            authority.approvals =
                vec![WorkspaceFetchApproval::capture(WORKSPACE, self.repo.path.clone()).unwrap()];
        }

        async fn fetch(&self, op_id: Option<&str>) -> Result<Value, String> {
            dispatch(
                COMMAND,
                json!({
                    "path": self.repo.s(), "workspaceId": WORKSPACE, "opId": op_id,
                    // A caller cannot supply its own approval using preview data
                    // or request a different transport through extra fields.
                    "target": { "remote": "origin", "fingerprint": "client-value" },
                    "remote": self.alias,
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

        async fn reject(&self, op_id: Option<&str>, expected: &str) {
            let before = self.fetch_commands();
            let error = self.fetch(op_id).await.unwrap_err();
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

        fixture.reject(None, "active, open membership").await;
        fixture.approve();
        fixture.fetch(None).await.unwrap();
        assert_eq!(
            fixture.repo.rev("refs/remotes/origin/main"),
            fixture.source.head()
        );
        let next = fixture.source.commit("story.txt", "second\n", "second");
        let metadata = fixture.source.path.join(".git");
        let offline = fixture.source.path.join("offline-git");
        std::fs::rename(&metadata, &offline).unwrap();
        let failed = fixture.fetch(Some("workspace-first-attempt")).await;
        std::fs::rename(&offline, &metadata).unwrap();
        assert!(
            failed.is_err(),
            "an offline file remote unexpectedly fetched"
        );
        fixture.fetch(Some("workspace-retry")).await.unwrap();
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
        fixture.approve();
        let authority = &fixture.ctx.state.workspace_fetch_fixture;
        let preview_args = json!({ "path": fixture.repo.s() });
        let original_preview = dispatch("repo_fetch_scope", preview_args.clone(), &fixture.ctx)
            .await
            .unwrap();

        authority.write().unwrap().opened.clear();
        fixture.reject(None, "active, open membership").await;
        fixture.approve();
        authority.write().unwrap().active_workspace = Some("different-workspace".into());
        fixture
            .reject(Some("retry-workspace"), "active, open membership")
            .await;
        fixture.approve();
        authority.write().unwrap().approvals.clear();
        fixture
            .reject(Some("retry-removed"), "no approved membership")
            .await;
        fixture.approve();
        authority
            .write()
            .unwrap()
            .approvals
            .push(WorkspaceFetchApproval::capture(WORKSPACE, fixture.repo.path.clone()).unwrap());
        fixture.reject(None, "membership is ambiguous").await;
        fixture.approve();

        let other = TestRepo::new("workspace-fetch-other-remote");
        other.commit("different.txt", "different\n", "other");
        fixture
            .repo
            .git(&["remote", "set-url", "origin", &other.file_url()]);
        fixture.reject(None, "target changed").await;
        fixture
            .repo
            .git(&["remote", "set-url", "origin", &fixture.alias]);
        fixture.repo.git(&[
            "config",
            "remote.origin.fetch",
            "refs/heads/main:refs/remotes/alternate/main",
        ]);
        fixture
            .reject(Some("retry-refspec"), "target changed")
            .await;
        fixture
            .repo
            .git(&["config", "remote.origin.fetch", FETCH_REFSPEC]);

        let rewrite = format!("url.{}.insteadOf", other.file_url());
        fixture
            .repo
            .git(&["config", &rewrite, &fixture.source.file_url()]);
        fixture
            .reject(Some("retry-rewritten"), "would be rewritten again")
            .await;
        fixture.repo.git(&["config", "--unset", &rewrite]);

        let common_dir = coordination::repo_common_dir(&fixture.repo.path).unwrap();
        let lock = RemoteProcessLock::acquire(&common_dir).unwrap();
        fixture.reject(Some("retry-busy"), "git.remoteBusy").await;
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
            .reject(Some("retry-replaced"), "repository identity changed")
            .await;
        assert!(!fixture.repo.exists(".git/FETCH_HEAD"));
    }
}
