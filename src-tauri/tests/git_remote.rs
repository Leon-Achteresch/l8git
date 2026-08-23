mod common;

use common::{clone_of, repo_with_remote, TestRepo};
use l8git_lib::git;

fn remote_head(bare: &TestRepo, branch: &str) -> String {
    bare.git(&["rev-parse", &format!("refs/heads/{branch}")])
}

#[tokio::test]
async fn list_git_remotes_returns_one_entry_per_remote() {
    let repo = TestRepo::new("remotes-list");
    repo.commit("a.txt", "1\n", "c1");
    repo.git(&["remote", "add", "origin", "git@github.com:acme/app.git"]);
    repo.git(&["remote", "add", "upstream", "https://github.com/upstream/app.git"]);

    let remotes = git::list_git_remotes(repo.s()).await.unwrap();
    assert_eq!(remotes.len(), 2, "fetch and push URLs must not be listed twice");
    assert_eq!(remotes[0].name, "origin");
    assert_eq!(remotes[0].url, "git@github.com:acme/app.git");
    assert_eq!(remotes[1].name, "upstream");
    assert_eq!(remotes[1].url, "https://github.com/upstream/app.git");
}

#[tokio::test]
async fn add_and_set_remote_url_change_the_configured_remote() {
    let repo = TestRepo::new("remotes-edit");
    repo.commit("a.txt", "1\n", "c1");

    git::add_git_remote(repo.s(), " origin ".into(), " git@github.com:acme/app.git ".into())
        .await
        .unwrap();
    assert_eq!(
        git::list_git_remotes(repo.s()).await.unwrap()[0].url,
        "git@github.com:acme/app.git"
    );

    git::set_git_remote_url(repo.s(), "origin".into(), "https://github.com/acme/app.git".into())
        .await
        .unwrap();
    assert_eq!(
        git::list_git_remotes(repo.s()).await.unwrap()[0].url,
        "https://github.com/acme/app.git"
    );

    assert!(git::add_git_remote(repo.s(), "  ".into(), "url".into()).await.is_err());
    assert!(git::add_git_remote(repo.s(), "x".into(), "  ".into()).await.is_err());
    assert!(git::set_git_remote_url(repo.s(), "  ".into(), "url".into()).await.is_err());
    assert!(git::set_git_remote_url(repo.s(), "nope".into(), "url".into()).await.is_err());
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
        work.git(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
        "origin/main"
    );
}

#[tokio::test]
async fn push_dry_run_leaves_the_remote_untouched() {
    let (work, bare) = repo_with_remote("push-dry");
    let before = remote_head(&bare, "main");
    work.commit("b.txt", "2\n", "second");

    git::git_push(work.s(), false, None, None, None, None, None, Some(true), None)
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

    let err = git::git_push(work.s(), false, None, Some("lease".into()), None, None, None, None, None)
        .await
        .unwrap_err();
    assert!(err.contains("rejected") || err.contains("stale info"), "{err}");
    assert_eq!(remote_head(&bare, "main"), other_head);

    git::git_fetch(work.s(), None, None, None, None, None).await.unwrap();
    git::git_push(work.s(), false, None, Some("lease".into()), None, None, None, None, None)
        .await
        .unwrap();
    assert_eq!(remote_head(&bare, "main"), work.head());
}

#[tokio::test]
async fn push_tags_mode_all_publishes_tags_and_delete_remote_tag_removes_them() {
    let (work, bare) = repo_with_remote("push-tags");
    work.git(&["tag", "v1.2.3"]);

    git::git_push(work.s(), false, None, None, Some("all".into()), None, None, None, None)
        .await
        .unwrap();
    assert_eq!(bare.git(&["tag", "--list"]), "v1.2.3");

    git::delete_remote_tag(work.s(), "v1.2.3".into(), "origin".into())
        .await
        .unwrap();
    assert_eq!(bare.git(&["tag", "--list"]), "");

    assert!(git::delete_remote_tag(work.s(), "  ".into(), "origin".into()).await.is_err());
    assert!(git::delete_remote_tag(work.s(), "v1".into(), "  ".into()).await.is_err());
}

#[tokio::test]
async fn fetch_updates_remote_tracking_refs_and_prunes_deleted_branches() {
    let (work, bare) = repo_with_remote("fetch-prune");
    let other = clone_of(&bare, "fetch-prune-other");
    other.git(&["checkout", "-q", "-b", "tmp"]);
    other.commit("tmp.txt", "x\n", "tmp work");
    other.git(&["push", "-q", "origin", "tmp"]);

    git::git_fetch(work.s(), None, None, None, None, None).await.unwrap();
    assert!(work.try_git(&["rev-parse", "--verify", "refs/remotes/origin/tmp"]).0);

    other.git(&["push", "-q", "origin", "--delete", "tmp"]);
    git::git_fetch(work.s(), Some(true), None, None, None, None).await.unwrap();
    assert!(
        !work.try_git(&["rev-parse", "--verify", "refs/remotes/origin/tmp"]).0,
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

    git::git_pull(work.s(), Some("autostash".into()), None, None).await.unwrap();
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

    let err = git::git_pull(work.s(), Some("ff-only".into()), None, None).await.unwrap_err();
    assert!(err.to_lowercase().contains("fast-forward") || err.contains("diverg"), "{err}");
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
    git::git_fetch(work.s(), None, None, None, None, None).await.unwrap();

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
    git::git_fetch(work.s(), None, None, None, None, None).await.unwrap();

    git::git_checkout(work.s(), "feature".into(), false, Some("origin/feature".into()), None)
        .await
        .unwrap();

    assert_eq!(work.branch(), "feature");
    assert_eq!(work.read("feature.txt"), "x\n");
    assert_eq!(
        work.git(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
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
    assert!(bare.try_git(&["rev-parse", "--verify", "refs/heads/doomed"]).0);

    git::delete_remote_branch(work.s(), "origin/doomed".into())
        .await
        .unwrap();

    assert!(!bare.try_git(&["rev-parse", "--verify", "refs/heads/doomed"]).0);
    assert!(!work.try_git(&["rev-parse", "--verify", "refs/remotes/origin/doomed"]).0);

    let err = git::delete_remote_branch(work.s(), "noslash".into())
        .await
        .unwrap_err();
    assert!(err.contains("Ungültige Remote-Ref"), "{err}");
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

    assert!(git::git_clone("  ".into(), "/tmp/x".into(), None).await.is_err());
    assert!(git::git_clone("url".into(), "  ".into(), None).await.is_err());
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
    assert!(subs[0].gitmodules_raw.contains("vendor/lib"), "{}", subs[0].gitmodules_raw);
    assert!(host.exists("vendor/lib/lib.txt"));

    let commits = git::get_submodule_commits(
        host.s(),
        "vendor/lib".into(),
        sub_work.head(),
    )
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

    git::git_push(work.s(), true, Some("fork".into()), None, None, None, None, None, None)
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
    git::git_push(work.s(), false, Some("fork".into()), None, None, None, None, None, None)
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

    git::git_fetch(work.s(), None, None, None, None, None).await.unwrap();
    assert_eq!(work.try_git(&["rev-parse", "refs/remotes/fork/main"]).1, work.head());

    git::git_fetch(work.s(), None, None, Some("fork".into()), None, None)
        .await
        .unwrap();
    assert_eq!(work.git(&["rev-parse", "refs/remotes/fork/main"]), other.head());

    other.commit("fork2.txt", "fork2\n", "fork commit 2");
    other.git(&["push", "-q", "origin", "main"]);
    git::git_fetch(work.s(), None, None, None, Some(true), None)
        .await
        .unwrap();
    assert_eq!(work.git(&["rev-parse", "refs/remotes/fork/main"]), other.head());
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
    assert!(err.contains("führendem '-'"), "err: {err}");
    assert!(!marker.exists(), "injected command must not run");

    let unknown = git::git_fetch(work.s(), None, None, Some("nope".into()), None, None).await;
    assert!(unknown.is_err(), "unknown remote must be rejected");
}

#[tokio::test]
async fn push_and_pull_reject_dash_and_unknown_remotes() {
    let (work, _bare) = repo_with_remote("push-inject");
    work.commit("a.txt", "1\n", "c1");

    assert!(git::git_push(work.s(), false, Some("--force".into()), None, None, None, None, None, None)
        .await
        .is_err());
    assert!(git::git_push(work.s(), false, Some("nope".into()), None, None, None, None, None, None)
        .await
        .is_err());
    assert!(git::git_pull(work.s(), None, Some("--upload-pack=touch x".into()), None)
        .await
        .is_err());
}

#[tokio::test]
async fn delete_branch_and_tag_are_injection_safe() {
    let repo = TestRepo::new("delete-inject");
    repo.commit("a.txt", "1\n", "c1");
    let marker = common::scratch_path("del-marker").join("pwned");

    repo.git(&["update-ref", "refs/heads/-evil", "HEAD"]);
    git::delete_branch(repo.s(), "-evil".into(), true).await.unwrap();
    assert!(!repo.try_git(&["rev-parse", "refs/heads/-evil"]).0, "branch must be gone");
    assert!(!marker.exists());

    repo.git(&["update-ref", "refs/tags/-eviltag", "HEAD"]);
    git::delete_tag(repo.s(), "-eviltag".into()).await.unwrap();
    assert!(!repo.try_git(&["rev-parse", "refs/tags/-eviltag"]).0, "tag must be gone");
    assert!(!marker.exists());
}
