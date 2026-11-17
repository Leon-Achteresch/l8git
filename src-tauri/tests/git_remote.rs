mod common;

use common::{clone_of, repo_with_remote, TestRepo};
use l8git_lib::git;

fn remote_head(bare: &TestRepo, branch: &str) -> String {
    bare.git(&["rev-parse", &format!("refs/heads/{branch}")])
}

#[tokio::test]
async fn fetch_scope_groups_linked_worktrees_and_reads_only_configured_remote_names() {
    let repo = TestRepo::new("fetch-scope");
    let source = TestRepo::new("fetch-scope-source");
    repo.commit("local.txt", "local\n", "local");
    source.commit("remote.txt", "remote\n", "remote");
    repo.git(&["remote", "add", "origin", &source.file_url()]);
    let alias_path = common::scratch_path("fetch-scope-alias");
    repo.git(&["worktree", "add", "--detach", alias_path.to_str().unwrap()]);
    let alias = TestRepo::adopt(alias_path);
    let isolated = TestRepo::new("fetch-scope-isolated");
    let config = repo.read(".git/config");
    let refs = repo.git(&["show-ref"]);

    let primary = common::json(&git::repo_fetch_scope(repo.s()).await.unwrap());
    assert_eq!(primary["remotes"], serde_json::json!(["origin"]));
    assert_eq!(primary["target"]["remote"], "origin");
    let linked = common::json(&git::repo_fetch_scope(alias.s()).await.unwrap());
    assert_eq!(primary["commonDir"], linked["commonDir"]);
    assert_ne!(primary["target"]["fingerprint"], linked["target"]["fingerprint"]);
    let unrelated = common::json(&git::repo_fetch_scope(isolated.s()).await.unwrap());
    assert_eq!(unrelated["remotes"], serde_json::json!([]));
    assert_ne!(unrelated["commonDir"], primary["commonDir"]);
    assert!(git::repo_fetch_scope(repo.path.join("missing").to_string_lossy().into())
        .await
        .is_err());
    assert_eq!(repo.read(".git/config"), config);
    assert_eq!(repo.git(&["show-ref"]), refs);
    assert!(!repo.exists(".git/FETCH_HEAD"));
}

#[tokio::test]
async fn fetch_target_tracks_effective_url_and_refspecs_without_contacting_remotes() {
    async fn scope(repo: &TestRepo) -> serde_json::Value {
        common::json(&git::repo_fetch_scope(repo.s()).await.unwrap())
    }

    let repo = TestRepo::new("target-repo");
    let first = TestRepo::bare("target-first");
    let second = TestRepo::bare("target-second");
    repo.commit("base.txt", "base\n", "base");
    assert!(scope(&repo).await["target"].is_null());
    repo.git(&["remote", "add", "origin", &first.file_url()]);
    let baseline = scope(&repo).await;
    assert_eq!(baseline["target"]["remote"], "origin");
    assert_eq!(
        baseline["target"]["fingerprint"].as_str().unwrap().len(),
        64
    );
    assert!(!baseline.to_string().contains(&first.file_url()));

    repo.git(&["remote", "set-url", "--push", "origin", &second.file_url()]);
    assert_eq!(scope(&repo).await, baseline);
    repo.git(&[
        "config",
        &format!("url.{}.insteadOf", second.file_url()),
        &first.file_url(),
    ]);
    let rewritten = scope(&repo).await;
    assert_eq!(rewritten["commonDir"], baseline["commonDir"]);
    assert_ne!(rewritten["target"], baseline["target"]);
    assert!(!rewritten.to_string().contains(&second.file_url()));

    repo.git(&[
        "config",
        "remote.origin.fetch",
        "+refs/heads/main:refs/remotes/origin/main",
    ]);
    let changed_refspec = scope(&repo).await;
    assert_ne!(changed_refspec["target"], rewritten["target"]);
    assert_eq!(changed_refspec, scope(&repo).await);
    let refs = repo.git(&["show-ref"]);
    let config = repo.read(".git/config");
    assert_eq!(scope(&repo).await, changed_refspec);
    assert_eq!(repo.git(&["show-ref"]), refs);
    assert_eq!(repo.read(".git/config"), config);
    assert!(!repo.exists(".git/FETCH_HEAD"));

    repo.git(&["remote", "add", "mirror", &second.file_url()]);
    assert!(scope(&repo).await["target"].is_null());
    repo.git(&["remote", "remove", "mirror"]);
    repo.git(&["config", "--add", "remote.origin.url", &second.file_url()]);
    assert!(scope(&repo).await["target"].is_null());
    repo.git(&["config", "--unset-all", "remote.origin.url"]);
    assert_eq!(scope(&repo).await["remotes"], serde_json::json!(["origin"]));
    assert!(scope(&repo).await["target"].is_null());
    repo.git(&[
        "config",
        "remote.origin.url",
        &format!("{}\n{}", first.file_url(), second.file_url()),
    ]);
    assert!(scope(&repo).await["target"].is_null());
    repo.git(&["config", "remote.origin.url", &first.file_url()]);
    repo.git(&["config", "--unset-all", "remote.origin.fetch"]);
    assert!(scope(&repo).await["target"].is_null());
    assert!(!repo.exists(".git/FETCH_HEAD"));
}

#[cfg(feature = "headless")]
#[tokio::test]
async fn fetch_scope_dispatch_checks_the_repository_root_and_returns_the_same_target() {
    use l8git_lib::server::{
        dispatch,
        state::{ConnectionHandle, DispatchCtx, ServerState},
    };
    use serde_json::json;
    use std::sync::Arc;

    let repo = TestRepo::new("target-ipc");
    let source = TestRepo::bare("target-ipc-source");
    repo.git(&["remote", "add", "origin", &source.file_url()]);
    let state = ServerState::new("test".into(), [0; 32], vec![repo.path.clone()]);
    let (tx, _rx) = tokio::sync::mpsc::channel(1);
    let command = "repo_fetch_scope";
    let ctx = DispatchCtx::new(
        state.clone(),
        Arc::new(ConnectionHandle::new(1, tx)),
        1,
        command,
    );
    let args = json!({ "path": repo.s() });
    state.ensure_command_allowed(command, &args).unwrap();
    let result = dispatch::dispatch(command, args, &ctx).await.unwrap();
    assert_eq!(
        result,
        common::json(&git::repo_fetch_scope(repo.s()).await.unwrap())
    );
    assert_eq!(result["target"]["remote"], "origin");
    assert!(!result.to_string().contains(&source.file_url()));
    assert!(state
        .ensure_command_allowed(command, &json!({ "path": source.s() }))
        .is_err());
}

#[tokio::test]
async fn separate_fetches_keep_success_when_another_local_remote_fails() {
    let source = TestRepo::new("fetch-results-source");
    let head = source.commit("remote.txt", "remote\n", "fixture remote commit");
    let good = TestRepo::new("fetch-results-good");
    let bad = TestRepo::new("fetch-results-bad");
    let good_head = good.commit("app.txt", "good\n", "local good");
    let bad_head = bad.commit("app.txt", "bad\n", "local bad");
    good.git(&["remote", "add", "origin", &source.file_url()]);
    bad.git(&["remote", "add", "origin", &format!("{}/missing.git", source.file_url())]);
    let fetch = |path, id: &str| git::git_fetch(path, Some(true), Some(false),
        Some("origin".into()), None, Some(id.into()));
    assert!(fetch(good.s(), "f02-local-good").await.is_ok());
    assert!(fetch(bad.s(), "f02-local-bad").await.is_err());
    assert_eq!(good.rev("refs/remotes/origin/main"), head);
    assert!(!bad.try_git(&["rev-parse", "--verify", "refs/remotes/origin/main"]).0);
    assert_eq!(good.head(), good_head);
    assert_eq!(bad.head(), bad_head);
    assert!(good.porcelain().is_empty() && bad.porcelain().is_empty());

    bad.git(&["remote", "set-url", "origin", &source.file_url()]);
    fetch(bad.s(), "f02-local-retry").await.unwrap();
    assert_eq!(bad.rev("refs/remotes/origin/main"), head);
    assert_eq!(bad.head(), bad_head);
    assert!(bad.porcelain().is_empty());
}

#[cfg(all(unix, feature = "headless"))]
#[tokio::test]
async fn remote_reservation_covers_aliases_and_dispatch_until_git_exits() {
    use l8git_lib::server::{
        dispatch,
        state::{ConnectionHandle, DispatchCtx, ServerState, OUTBOX_CAPACITY},
    };
    use serde_json::{json, Value};
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::{fs, sync::Arc, time::Duration};
    use tokio::time::{sleep, timeout};

    async fn daemon(ctx: &DispatchCtx, cmd: &str, args: Value) -> Result<Value, String> {
        ctx.state.ensure_command_allowed(cmd, &args)?;
        dispatch::dispatch(cmd, args, ctx).await
    }

    async fn wait_for_upload(repo: &TestRepo) {
        timeout(Duration::from_secs(5), async {
            while !repo.exists(".git/upload-started") {
                sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("Git did not reach the fixture's file transport");
    }

    fn assert_busy<T: std::fmt::Debug>(result: Result<T, String>) {
        let error = result.unwrap_err();
        assert!(error.contains(r#""code":"git.remoteBusy""#), "{error}");
    }

    let source = TestRepo::new("reserve-source");
    let first = source.commit("remote.txt", "first\n", "remote first");
    let repo = TestRepo::new("reserve-repo");
    repo.commit("local.txt", "local\n", "local");
    repo.git(&["remote", "add", "origin", &source.file_url()]);
    let linked_path = common::scratch_path("reserve-linked");
    repo.git(&["worktree", "add", "--detach", linked_path.to_str().unwrap()]);
    let linked = TestRepo::adopt(linked_path);
    let independent = TestRepo::new("reserve-independent");
    independent.git(&["remote", "add", "origin", &source.file_url()]);
    let alias = independent.path.join("alias");
    symlink(&repo.path, &alias).unwrap();
    let alias = alias.to_str().unwrap().to_owned();

    // Gate the actual file transport before Git touches tracking refs.
    let upload = repo.path.join(".git/gate-upload-pack");
    repo.write(
        ".git/gate-upload-pack",
        r#"#!/bin/sh
dir=${0%/*}
: > "$dir/upload-started"
for attempt in $(seq 1 750); do
    if [ ! -f "$dir/hold-upload" ]; then
        exec git-upload-pack "$@"
    fi
    sleep 0.02
done
exit 1
"#,
    );
    fs::set_permissions(&upload, fs::Permissions::from_mode(0o700)).unwrap();
    let command = format!("'{}'", upload.to_str().unwrap().replace('\'', "'\\''"));
    repo.git(&["config", "remote.origin.uploadpack", &command]);

    let state = ServerState::new(
        "test".into(),
        [0; 32],
        vec![repo.path.clone(), linked.path.clone()],
    );
    let (tx, _rx) = tokio::sync::mpsc::channel(OUTBOX_CAPACITY);
    let ctx = DispatchCtx::new(
        state,
        Arc::new(ConnectionHandle::new(1, tx)),
        1,
        "git_fetch",
    );

    let fetch = |path, op_id: Option<&str>| {
        git::git_fetch(
            path,
            None,
            None,
            Some("origin".into()),
            None,
            op_id.map(str::to_owned),
        )
    };
    let deadline = Duration::from_secs(5);
    let hold = repo.path.join(".git/hold-upload");
    fs::write(&hold, "").unwrap();
    let direct = tokio::spawn(fetch(repo.s(), None));
    wait_for_upload(&repo).await;

    timeout(deadline, async {
        assert_busy(fetch(alias.clone(), Some("reservation-rejected")).await);
        let pull = json!({ "path": linked.s(), "remote": "origin", "opId": "reservation-pull" });
        assert_busy(daemon(&ctx, "git_pull", pull).await);
        let push =
            json!({ "path": linked.s(), "remote": "origin", "setUpstream": false, "dryRun": true });
        assert_busy(daemon(&ctx, "git_push", push).await);
        assert!(!git::git_remote_cancel("reservation-rejected".into())
            .await
            .unwrap());
        fetch(independent.s(), None).await.unwrap();
        assert_eq!(independent.rev("refs/remotes/origin/main"), first);
    })
    .await
    .expect("competing operations waited for the active checkout");
    assert!(!direct.is_finished());
    fs::remove_file(&hold).unwrap();
    timeout(deadline, direct).await.unwrap().unwrap().unwrap();
    assert_eq!(repo.rev("refs/remotes/origin/main"), first);

    let second = source.commit("remote.txt", "second\n", "remote second");
    fs::remove_file(repo.path.join(".git/upload-started")).unwrap();
    fs::write(&hold, "").unwrap();
    let daemon_fetch =
        json!({ "path": linked.s(), "remote": "origin", "opId": "reservation-cancel" });
    let ctx = Arc::new(ctx);
    let running = {
        let ctx = ctx.clone();
        tokio::spawn(async move { daemon(&ctx, "git_fetch", daemon_fetch).await })
    };
    wait_for_upload(&repo).await;
    assert_busy(timeout(deadline, fetch(alias, None)).await.unwrap());
    let cancel = json!({ "opId": "reservation-cancel" });
    assert_eq!(
        daemon(&ctx, "git_remote_cancel", cancel).await.unwrap(),
        true
    );
    let error = timeout(deadline, running)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert_eq!(error, git::REMOTE_CANCELED);
    assert_eq!(repo.rev("refs/remotes/origin/main"), first);
    assert!(!git::git_remote_cancel("reservation-cancel".into())
        .await
        .unwrap());

    fs::remove_file(&hold).unwrap();
    let retry = json!({ "path": linked.s(), "remote": "origin", "opId": "reservation-retry" });
    daemon(&ctx, "git_fetch", retry).await.unwrap();
    assert_eq!(repo.rev("refs/remotes/origin/main"), second);
}

#[tokio::test]
async fn list_git_remotes_returns_one_entry_per_remote() {
    let repo = TestRepo::new("remotes-list");
    repo.commit("a.txt", "1\n", "c1");
    repo.git(&["remote", "add", "origin", "git@github.com:acme/app.git"]);
    repo.git(&[
        "remote",
        "add",
        "upstream",
        "https://github.com/upstream/app.git",
    ]);

    let remotes = git::list_git_remotes(repo.s()).await.unwrap();
    assert_eq!(
        remotes.len(),
        2,
        "fetch and push URLs must not be listed twice"
    );
    assert_eq!(remotes[0].name, "origin");
    assert_eq!(remotes[0].url, "git@github.com:acme/app.git");
    assert_eq!(remotes[1].name, "upstream");
    assert_eq!(remotes[1].url, "https://github.com/upstream/app.git");
}

#[tokio::test]
async fn add_and_set_remote_url_change_the_configured_remote() {
    let repo = TestRepo::new("remotes-edit");
    repo.commit("a.txt", "1\n", "c1");

    git::add_git_remote(
        repo.s(),
        " origin ".into(),
        " git@github.com:acme/app.git ".into(),
    )
    .await
    .unwrap();
    assert_eq!(
        git::list_git_remotes(repo.s()).await.unwrap()[0].url,
        "git@github.com:acme/app.git"
    );

    git::set_git_remote_url(
        repo.s(),
        "origin".into(),
        "https://github.com/acme/app.git".into(),
    )
    .await
    .unwrap();
    assert_eq!(
        git::list_git_remotes(repo.s()).await.unwrap()[0].url,
        "https://github.com/acme/app.git"
    );

    assert!(git::add_git_remote(repo.s(), "  ".into(), "url".into())
        .await
        .is_err());
    assert!(git::add_git_remote(repo.s(), "x".into(), "  ".into())
        .await
        .is_err());
    assert!(git::set_git_remote_url(repo.s(), "  ".into(), "url".into())
        .await
        .is_err());
    assert!(
        git::set_git_remote_url(repo.s(), "nope".into(), "url".into())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn push_with_set_upstream_publishes_the_branch_and_records_tracking() {
    let bare = TestRepo::bare("push-upstream-bare");
    let work = TestRepo::new("push-upstream-work");
    work.commit("README.md", "hello\n", "initial");
    work.git(&["remote", "add", "origin", &bare.file_url()]);

    assert_eq!(git::branch_has_upstream(work.s()).await.unwrap(), false);

    git::git_push(work.s(), true, None, None, None, None, None, None, None)
        .await
        .unwrap();

    assert_eq!(remote_head(&bare, "main"), work.head());
    assert_eq!(git::branch_has_upstream(work.s()).await.unwrap(), true);
    assert_eq!(
        work.git(&[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}"
        ]),
        "origin/main"
    );
}

#[tokio::test]
async fn push_dry_run_leaves_the_remote_untouched() {
    let (work, bare) = repo_with_remote("push-dry");
    let before = remote_head(&bare, "main");
    work.commit("b.txt", "2\n", "second");

    git::git_push(
        work.s(),
        false,
        None,
        None,
        None,
        None,
        None,
        Some(true),
        None,
    )
    .await
    .unwrap();
    assert_eq!(remote_head(&bare, "main"), before);

    git::git_push(work.s(), false, None, None, None, None, None, None, None)
        .await
        .unwrap();
    assert_eq!(remote_head(&bare, "main"), work.head());
}

#[tokio::test]
async fn push_force_with_lease_is_rejected_while_the_remote_is_ahead() {
    let (work, bare) = repo_with_remote("push-lease");
    let other = clone_of(&bare, "push-lease-other");
    other.commit("other.txt", "x\n", "from the other clone");
    other.git(&["push", "-q", "origin", "main"]);
    let other_head = other.head();

    work.write("README.md", "rewritten\n");
    work.git(&["add", "-A"]);
    work.git(&["commit", "-q", "--amend", "-m", "amended locally"]);

    let err = git::git_push(
        work.s(),
        false,
        None,
        Some("lease".into()),
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap_err();
    assert!(
        err.contains("rejected") || err.contains("stale info"),
        "{err}"
    );
    assert_eq!(remote_head(&bare, "main"), other_head);

    git::git_fetch(work.s(), None, None, None, None, None)
        .await
        .unwrap();
    git::git_push(
        work.s(),
        false,
        None,
        Some("lease".into()),
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(remote_head(&bare, "main"), work.head());
}

#[tokio::test]
async fn push_tags_mode_all_publishes_tags_and_delete_remote_tag_removes_them() {
    let (work, bare) = repo_with_remote("push-tags");
    work.git(&["tag", "v1.2.3"]);

    git::git_push(
        work.s(),
        false,
        None,
        None,
        Some("all".into()),
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(bare.git(&["tag", "--list"]), "v1.2.3");

    git::delete_remote_tag(work.s(), "v1.2.3".into(), "origin".into())
        .await
        .unwrap();
    assert_eq!(bare.git(&["tag", "--list"]), "");

    assert!(
        git::delete_remote_tag(work.s(), "  ".into(), "origin".into())
            .await
            .is_err()
    );
    assert!(git::delete_remote_tag(work.s(), "v1".into(), "  ".into())
        .await
        .is_err());
}

#[tokio::test]
async fn fetch_updates_remote_tracking_refs_and_prunes_deleted_branches() {
    let (work, bare) = repo_with_remote("fetch-prune");
    let other = clone_of(&bare, "fetch-prune-other");
    other.git(&["checkout", "-q", "-b", "tmp"]);
    other.commit("tmp.txt", "x\n", "tmp work");
    other.git(&["push", "-q", "origin", "tmp"]);

    git::git_fetch(work.s(), None, None, None, None, None)
        .await
        .unwrap();
    assert!(
        work.try_git(&["rev-parse", "--verify", "refs/remotes/origin/tmp"])
            .0
    );

    other.git(&["push", "-q", "origin", "--delete", "tmp"]);
    git::git_fetch(work.s(), Some(true), None, None, None, None)
        .await
        .unwrap();
    assert!(
        !work
            .try_git(&["rev-parse", "--verify", "refs/remotes/origin/tmp"])
            .0,
        "prune must drop the stale remote-tracking ref"
    );
    assert!(bare.git(&["branch", "--list"]).contains("main"));
}

#[tokio::test]
async fn pull_fast_forwards_the_local_branch() {
    let (work, bare) = repo_with_remote("pull-ff");
    let other = clone_of(&bare, "pull-ff-other");
    other.commit("other.txt", "x\n", "remote work");
    other.git(&["push", "-q", "origin", "main"]);

    git::git_pull(work.s(), None, None, None).await.unwrap();
    assert_eq!(work.head(), other.head());
    assert_eq!(work.read("other.txt"), "x\n");
    assert_eq!(remote_head(&bare, "main"), work.head());
}

#[tokio::test]
async fn pull_is_blocked_by_dirty_tracked_files_unless_autostash_is_requested() {
    let (work, bare) = repo_with_remote("pull-dirty");
    work.commit("local.txt", "keep\n", "local file");
    work.git(&["push", "-q", "origin", "main"]);
    let other = clone_of(&bare, "pull-dirty-other");
    other.commit("other.txt", "x\n", "remote work");
    other.git(&["push", "-q", "origin", "main"]);

    work.write("local.txt", "dirty edit\n");
    let err = git::git_pull(work.s(), None, None, None).await.unwrap_err();
    assert_eq!(err, "__LOCAL_CHANGES_BLOCK__|local.txt");
    assert!(!work.exists("other.txt"));

    git::git_pull(work.s(), Some("autostash".into()), None, None)
        .await
        .unwrap();
    assert!(work.exists("other.txt"));
    assert_eq!(work.read("local.txt"), "dirty edit\n");
}

#[tokio::test]
async fn pull_ff_only_fails_when_the_history_diverged() {
    let (work, bare) = repo_with_remote("pull-ff-only");
    let other = clone_of(&bare, "pull-ff-only-other");
    other.commit("other.txt", "x\n", "remote work");
    other.git(&["push", "-q", "origin", "main"]);
    work.commit("local.txt", "y\n", "local work");

    let err = git::git_pull(work.s(), Some("ff-only".into()), None, None)
        .await
        .unwrap_err();
    assert!(
        err.to_lowercase().contains("fast-forward") || err.contains("diverg"),
        "{err}"
    );
    assert_eq!(work.subjects()[0], "local work");
}

#[tokio::test]
async fn upstream_sync_counts_report_ahead_and_behind() {
    let (work, bare) = repo_with_remote("sync-counts");
    let zero = git::repo_upstream_sync_counts(work.s()).await.unwrap();
    assert_eq!((zero.ahead, zero.behind), (0, 0));

    let other = clone_of(&bare, "sync-counts-other");
    other.commit("r1.txt", "x\n", "remote one");
    other.git(&["push", "-q", "origin", "main"]);
    work.commit("l1.txt", "x\n", "local one");
    work.commit("l2.txt", "x\n", "local two");
    git::git_fetch(work.s(), None, None, None, None, None)
        .await
        .unwrap();

    let counts = git::repo_upstream_sync_counts(work.s()).await.unwrap();
    assert_eq!(counts.ahead, 2);
    assert_eq!(counts.behind, 1);

    let full = git::repo_full_status(work.s()).await.unwrap();
    assert!(full.has_upstream);
    assert_eq!(full.upstream_sync.ahead, 2);
    assert_eq!(full.upstream_sync.behind, 1);
}

#[tokio::test]
async fn checkout_from_remote_creates_a_tracking_branch() {
    let (work, bare) = repo_with_remote("checkout-remote");
    let other = clone_of(&bare, "checkout-remote-other");
    other.git(&["checkout", "-q", "-b", "feature"]);
    other.commit("feature.txt", "x\n", "feature work");
    other.git(&["push", "-q", "origin", "feature"]);
    git::git_fetch(work.s(), None, None, None, None, None)
        .await
        .unwrap();

    git::git_checkout(
        work.s(),
        "feature".into(),
        false,
        Some("origin/feature".into()),
        None,
    )
    .await
    .unwrap();

    assert_eq!(work.branch(), "feature");
    assert_eq!(work.read("feature.txt"), "x\n");
    assert_eq!(
        work.git(&[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}"
        ]),
        "origin/feature"
    );
}

#[tokio::test]
async fn delete_remote_branch_removes_the_branch_and_its_tracking_ref() {
    let (work, bare) = repo_with_remote("delete-remote-branch");
    work.git(&["checkout", "-q", "-b", "doomed"]);
    work.commit("d.txt", "x\n", "doomed work");
    work.git(&["push", "-q", "origin", "doomed"]);
    work.git(&["checkout", "-q", "main"]);
    assert!(
        bare.try_git(&["rev-parse", "--verify", "refs/heads/doomed"])
            .0
    );

    git::delete_remote_branch(work.s(), "origin/doomed".into())
        .await
        .unwrap();

    assert!(
        !bare
            .try_git(&["rev-parse", "--verify", "refs/heads/doomed"])
            .0
    );
    assert!(
        !work
            .try_git(&["rev-parse", "--verify", "refs/remotes/origin/doomed"])
            .0
    );

    let err = git::delete_remote_branch(work.s(), "noslash".into())
        .await
        .unwrap_err();
    assert!(err.contains("Invalid remote ref"), "{err}");
}

#[tokio::test]
async fn git_clone_materialises_a_working_copy() {
    let (work, bare) = repo_with_remote("clone");
    work.commit("second.txt", "2\n", "second");
    work.git(&["push", "-q", "origin", "main"]);

    let dest = common::scratch_path("clone-dest");
    git::git_clone(bare.file_url(), dest.to_string_lossy().to_string(), None)
        .await
        .unwrap();

    assert!(dest.join("README.md").exists());
    assert!(dest.join("second.txt").exists());
    let (ok, head) = common::git_raw(&dest, &["rev-parse", "HEAD"]);
    assert!(ok);
    assert_eq!(head, work.head());
    let _ = std::fs::remove_dir_all(&dest);

    assert!(git::git_clone("  ".into(), "/tmp/x".into(), None)
        .await
        .is_err());
    assert!(git::git_clone("url".into(), "  ".into(), None)
        .await
        .is_err());
}

#[cfg(unix)]
#[tokio::test]
async fn clone_preserves_the_exact_destination_including_trailing_whitespace() {
    let source = TestRepo::new("clone-exact-source");
    let head = source.commit("a.txt", "cloned contents\n", "source commit");
    for suffix in [" ", "\n"] {
        let neighbor = common::scratch_path("clone-exact-neighbor");
        std::fs::create_dir_all(&neighbor).unwrap();
        std::fs::write(neighbor.join("keep.txt"), "unrelated contents\n").unwrap();
        let destination =
            std::path::PathBuf::from(format!("{}{suffix}", neighbor.to_string_lossy()));
        git::git_clone(
            source.file_url(),
            destination.to_string_lossy().into_owned(),
            None,
        )
        .await
        .unwrap();
        let cloned = TestRepo::adopt(destination);
        assert_eq!(cloned.head(), head);
        assert_eq!(
            std::fs::read_to_string(cloned.path.join("a.txt")).unwrap(),
            "cloned contents\n"
        );
        assert_eq!(
            std::fs::read_to_string(neighbor.join("keep.txt")).unwrap(),
            "unrelated contents\n"
        );
        assert!(!neighbor.join(".git").exists());
        std::fs::remove_dir_all(neighbor).unwrap();
    }
}

#[tokio::test]
async fn list_submodules_reports_the_registered_submodule() {
    let (sub_work, sub_bare) = repo_with_remote("submodule-src");
    sub_work.commit("lib.txt", "lib\n", "library commit");
    sub_work.git(&["push", "-q", "origin", "main"]);

    let host = TestRepo::new("submodule-host");
    host.commit("app.txt", "app\n", "initial");
    // `git submodule add` shells out to a fresh `git clone`, which does not
    // inherit the repo-local protocol.file.allow, hence the explicit -c here.
    host.git(&[
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "-q",
        &sub_bare.file_url(),
        "vendor/lib",
    ]);
    host.commit_all("add submodule");

    let subs = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(subs.len(), 1);
    assert_eq!(subs[0].path, "vendor/lib");
    assert_eq!(subs[0].url, sub_bare.file_url());
    assert_eq!(subs[0].commit, sub_work.head());
    assert_eq!(subs[0].is_detached, false);
    assert_eq!(subs[0].name, "vendor/lib");
    assert!(
        subs[0].gitmodules_raw.contains("vendor/lib"),
        "{}",
        subs[0].gitmodules_raw
    );
    assert!(host.exists("vendor/lib/lib.txt"));

    let commits = git::get_submodule_commits(host.s(), "vendor/lib".into(), sub_work.head())
        .await
        .unwrap();
    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0].hash, sub_work.head());
    assert_eq!(commits[0].message, "library commit");
    assert_eq!(commits[0].author, "Test User");
    assert_eq!(commits[0].is_pinned, true);
    assert_eq!(commits[1].is_pinned, false);
}

#[tokio::test]
async fn push_sets_upstream_on_the_requested_non_origin_remote() {
    let origin = TestRepo::bare("multi-origin-bare");
    let fork = TestRepo::bare("multi-fork-bare");
    let work = TestRepo::new("multi-push-work");
    work.commit("README.md", "hello\n", "initial");
    work.git(&["remote", "add", "origin", &origin.file_url()]);
    work.git(&["remote", "add", "fork", &fork.file_url()]);

    assert_eq!(git::branch_push_remote(work.s()).await.unwrap(), "origin");

    git::git_push(
        work.s(),
        true,
        Some("fork".into()),
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    assert_eq!(remote_head(&fork, "main"), work.head());
    assert_eq!(fork.try_git(&["rev-parse", "refs/heads/main"]).0, true);
    assert_eq!(origin.try_git(&["rev-parse", "refs/heads/main"]).0, false);
    assert_eq!(work.git(&["config", "branch.main.remote"]), "fork");
    assert_eq!(git::branch_has_upstream(work.s()).await.unwrap(), true);
    assert_eq!(git::branch_push_remote(work.s()).await.unwrap(), "fork");
}

#[tokio::test]
async fn push_without_upstream_targets_the_selected_remote() {
    let origin = TestRepo::bare("target-origin-bare");
    let fork = TestRepo::bare("target-fork-bare");
    let work = TestRepo::new("target-push-work");
    work.commit("README.md", "hello\n", "initial");
    work.git(&["remote", "add", "origin", &origin.file_url()]);
    work.git(&["remote", "add", "fork", &fork.file_url()]);
    work.git(&["push", "-q", "-u", "origin", "main"]);

    work.commit("next.txt", "more\n", "second");
    git::git_push(
        work.s(),
        false,
        Some("fork".into()),
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    assert_eq!(remote_head(&fork, "main"), work.head());
    assert_eq!(work.git(&["config", "branch.main.remote"]), "origin");
}

#[tokio::test]
async fn push_upstream_falls_back_to_the_tracking_remote_when_none_is_given() {
    let origin = TestRepo::bare("fallback-origin-bare");
    let fork = TestRepo::bare("fallback-fork-bare");
    let work = TestRepo::new("fallback-push-work");
    work.commit("README.md", "hello\n", "initial");
    work.git(&["remote", "add", "origin", &origin.file_url()]);
    work.git(&["remote", "add", "fork", &fork.file_url()]);
    work.git(&["config", "branch.main.remote", "fork"]);
    work.git(&["config", "branch.main.merge", "refs/heads/main"]);

    assert_eq!(git::branch_push_remote(work.s()).await.unwrap(), "fork");

    git::git_push(work.s(), true, None, None, None, None, None, None, None)
        .await
        .unwrap();

    assert_eq!(remote_head(&fork, "main"), work.head());
    assert_eq!(origin.try_git(&["rev-parse", "refs/heads/main"]).0, false);
}

#[tokio::test]
async fn fetch_can_target_a_single_remote_or_all_remotes() {
    let origin = TestRepo::bare("fetch-origin-bare");
    let fork = TestRepo::bare("fetch-fork-bare");
    let work = TestRepo::new("fetch-multi-work");
    work.commit("README.md", "hello\n", "initial");
    work.git(&["remote", "add", "origin", &origin.file_url()]);
    work.git(&["remote", "add", "fork", &fork.file_url()]);
    work.git(&["push", "-q", "-u", "origin", "main"]);
    work.git(&["push", "-q", "fork", "main"]);

    let other = clone_of(&fork, "fetch-fork-clone");
    other.commit("fork.txt", "fork\n", "fork commit");
    other.git(&["push", "-q", "origin", "main"]);

    git::git_fetch(work.s(), None, None, None, None, None)
        .await
        .unwrap();
    assert_eq!(
        work.try_git(&["rev-parse", "refs/remotes/fork/main"]).1,
        work.head()
    );

    git::git_fetch(work.s(), None, None, Some("fork".into()), None, None)
        .await
        .unwrap();
    assert_eq!(
        work.git(&["rev-parse", "refs/remotes/fork/main"]),
        other.head()
    );

    other.commit("fork2.txt", "fork2\n", "fork commit 2");
    other.git(&["push", "-q", "origin", "main"]);
    git::git_fetch(work.s(), None, None, None, Some(true), None)
        .await
        .unwrap();
    assert_eq!(
        work.git(&["rev-parse", "refs/remotes/fork/main"]),
        other.head()
    );
}

#[tokio::test]
async fn fetch_rejects_argument_injection_via_remote_name() {
    let (work, _bare) = repo_with_remote("fetch-inject");
    work.commit("a.txt", "1\n", "c1");

    let marker = common::scratch_path("pwned-marker").join("pwned");
    let evil = format!("--upload-pack=touch {}", marker.display());
    let config = work.path.join(".git").join("config");
    let mut cfg = std::fs::read_to_string(&config).unwrap();
    cfg.push_str(&format!("[remote \"{evil}\"]\n\turl = git@github.com:acme/app.git\n\tfetch = +refs/heads/*:refs/remotes/evil/*\n"));
    std::fs::write(&config, cfg).unwrap();

    let err = git::git_fetch(work.s(), None, None, Some(evil.clone()), None, None)
        .await
        .expect_err("dash remote must be rejected");
    assert!(err.contains("starting with '-'"), "err: {err}");
    assert!(!marker.exists(), "injected command must not run");

    let unknown = git::git_fetch(work.s(), None, None, Some("nope".into()), None, None).await;
    assert!(unknown.is_err(), "unknown remote must be rejected");
}

#[tokio::test]
async fn push_and_pull_reject_dash_and_unknown_remotes() {
    let (work, _bare) = repo_with_remote("push-inject");
    work.commit("a.txt", "1\n", "c1");

    assert!(git::git_push(
        work.s(),
        false,
        Some("--force".into()),
        None,
        None,
        None,
        None,
        None,
        None
    )
    .await
    .is_err());
    assert!(git::git_push(
        work.s(),
        false,
        Some("nope".into()),
        None,
        None,
        None,
        None,
        None,
        None
    )
    .await
    .is_err());
    assert!(
        git::git_pull(work.s(), None, Some("--upload-pack=touch x".into()), None)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn delete_branch_and_tag_are_injection_safe() {
    let repo = TestRepo::new("delete-inject");
    repo.commit("a.txt", "1\n", "c1");
    let marker = common::scratch_path("del-marker").join("pwned");

    repo.git(&["update-ref", "refs/heads/-evil", "HEAD"]);
    git::delete_branch(repo.s(), "-evil".into(), true)
        .await
        .unwrap();
    assert!(
        !repo.try_git(&["rev-parse", "refs/heads/-evil"]).0,
        "branch must be gone"
    );
    assert!(!marker.exists());

    repo.git(&["update-ref", "refs/tags/-eviltag", "HEAD"]);
    git::delete_tag(repo.s(), "-eviltag".into()).await.unwrap();
    assert!(
        !repo.try_git(&["rev-parse", "refs/tags/-eviltag"]).0,
        "tag must be gone"
    );
    assert!(!marker.exists());
}
