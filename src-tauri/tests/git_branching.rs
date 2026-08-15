mod common;

use common::{json, TestRepo};
use l8git_lib::git;

/// `main` with one commit and a `feature` branch one commit ahead of it,
/// touching a different file so the merge is conflict-free.
fn diverged_repo(tag: &str) -> (TestRepo, String) {
    let repo = TestRepo::new(tag);
    repo.commit("base.txt", "base\n", "c1");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    let tip = repo.commit("feature.txt", "feature\n", "feature work");
    repo.git(&["checkout", "-q", "main"]);
    (repo, tip)
}

#[tokio::test]
async fn create_branch_and_checkout_switch_the_working_head() {
    let repo = TestRepo::new("branch-create");
    repo.commit("a.txt", "1\n", "c1");
    let base = repo.head();
    repo.commit("b.txt", "2\n", "c2");

    git::git_create_branch(repo.s(), "side".into(), None, false)
        .await
        .unwrap();
    assert_eq!(repo.branch(), "main");
    assert_eq!(repo.rev("side"), repo.head());

    git::git_create_branch(repo.s(), "from-base".into(), Some(base.clone()), true)
        .await
        .unwrap();
    assert_eq!(repo.branch(), "from-base");
    assert_eq!(repo.head(), base);

    git::git_checkout(repo.s(), "main".into(), false, None, None)
        .await
        .unwrap();
    assert_eq!(repo.branch(), "main");

    assert!(git::git_create_branch(repo.s(), "  ".into(), None, false)
        .await
        .is_err());
    assert!(git::git_checkout(repo.s(), "".into(), false, None, None)
        .await
        .is_err());
    assert!(git::git_checkout(repo.s(), "does-not-exist".into(), false, None, None)
        .await
        .is_err());
}

#[tokio::test]
async fn delete_branch_refuses_unmerged_work_unless_forced() {
    let repo = TestRepo::new("branch-delete");
    repo.commit("a.txt", "1\n", "c1");
    repo.git(&["checkout", "-q", "-b", "tmp"]);
    repo.commit("tmp.txt", "x\n", "only on tmp");
    repo.git(&["checkout", "-q", "main"]);

    let err = git::delete_branch(repo.s(), "tmp".into(), false)
        .await
        .unwrap_err();
    assert!(err.contains("not fully merged"), "{err}");
    assert!(repo.try_git(&["rev-parse", "--verify", "tmp"]).0);

    git::delete_branch(repo.s(), "tmp".into(), true).await.unwrap();
    assert!(!repo.try_git(&["rev-parse", "--verify", "tmp"]).0);
}

#[tokio::test]
async fn merge_ff_fast_forwards_without_creating_a_merge_commit() {
    let (repo, tip) = diverged_repo("merge-ff");

    let out = git::git_merge(repo.s(), "feature".into(), Some("ff".into()), None)
        .await
        .unwrap();
    assert!(out.contains("Fast-forward"), "{out}");
    assert_eq!(repo.head(), tip);
    assert_eq!(repo.git(&["rev-list", "--count", "HEAD"]), "2");
    assert_eq!(repo.git(&["rev-list", "--parents", "-1", "HEAD"]).split(' ').count(), 2);
}

#[tokio::test]
async fn merge_no_ff_creates_a_merge_commit_with_the_default_message() {
    let (repo, tip) = diverged_repo("merge-noff");

    git::git_merge(repo.s(), "feature".into(), Some("no-ff".into()), None)
        .await
        .unwrap();

    assert_ne!(repo.head(), tip);
    assert_eq!(repo.subjects()[0], "Merge branch 'feature' into main");
    let parents = repo.git(&["rev-list", "--parents", "-1", "HEAD"]);
    assert_eq!(parents.split(' ').count(), 3, "{parents}");
    assert!(repo.exists("feature.txt"));
}

#[tokio::test]
async fn merge_no_ff_uses_a_custom_message_when_given() {
    let (repo, _) = diverged_repo("merge-noff-msg");
    git::git_merge(
        repo.s(),
        "feature".into(),
        Some("no-ff".into()),
        Some("  custom merge note  ".into()),
    )
    .await
    .unwrap();
    assert_eq!(repo.subjects()[0], "custom merge note");
}

#[tokio::test]
async fn merge_squash_flattens_the_branch_into_one_commit() {
    let repo = TestRepo::new("merge-squash");
    repo.commit("base.txt", "base\n", "c1");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.commit("f1.txt", "1\n", "feature one");
    repo.commit("f2.txt", "2\n", "feature two");
    repo.git(&["checkout", "-q", "main"]);

    git::git_merge(repo.s(), "feature".into(), Some("squash".into()), None)
        .await
        .unwrap();

    assert_eq!(
        repo.subjects(),
        vec!["Squashed commit from 'feature' into main", "c1"]
    );
    assert_eq!(repo.git(&["rev-list", "--parents", "-1", "HEAD"]).split(' ').count(), 2);
    assert!(repo.exists("f1.txt") && repo.exists("f2.txt"));
}

#[tokio::test]
async fn merge_ff_only_fails_on_diverged_history() {
    let repo = TestRepo::new("merge-ff-only");
    repo.commit("base.txt", "base\n", "c1");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.commit("f.txt", "1\n", "feature work");
    repo.git(&["checkout", "-q", "main"]);
    repo.commit("m.txt", "1\n", "main work");

    let err = git::git_merge(repo.s(), "feature".into(), Some("ff-only".into()), None)
        .await
        .unwrap_err();
    assert!(err.to_lowercase().contains("fast-forward"), "{err}");
    assert_eq!(repo.subjects()[0], "main work");
}

#[tokio::test]
async fn merge_rejects_unknown_strategies_and_empty_branch_names() {
    let (repo, _) = diverged_repo("merge-validate");

    let err = git::git_merge(repo.s(), "feature".into(), Some("octopus".into()), None)
        .await
        .unwrap_err();
    assert!(err.contains("Unbekannte Merge-Strategie"), "{err}");
    assert!(git::git_merge(repo.s(), "  ".into(), None, None).await.is_err());
}

#[tokio::test]
async fn merge_is_blocked_while_tracked_files_are_dirty() {
    let (repo, _) = diverged_repo("merge-dirty");
    repo.write("base.txt", "locally changed\n");

    let err = git::git_merge(repo.s(), "feature".into(), Some("no-ff".into()), None)
        .await
        .unwrap_err();
    assert_eq!(err, "__LOCAL_CHANGES_BLOCK__|base.txt");
    assert_eq!(repo.subjects(), vec!["c1"]);
}

#[tokio::test]
async fn merge_conflict_exposes_state_and_can_be_aborted() {
    let repo = common::conflicting_repo("merge-conflict");
    let head_before = repo.head();

    let err = git::git_merge(repo.s(), "feature".into(), Some("no-ff".into()), None)
        .await
        .unwrap_err();
    assert!(err.contains("CONFLICT"), "{err}");

    let state = git::merge_state(repo.s()).await.unwrap();
    assert!(state.in_progress);
    assert_eq!(state.merge_head.as_deref(), Some(repo.rev("feature").as_str()));
    assert_eq!(state.conflicted_paths, vec!["shared.txt".to_string()]);

    git::git_merge_abort(repo.s()).await.unwrap();
    let after = git::merge_state(repo.s()).await.unwrap();
    assert!(!after.in_progress);
    assert!(after.conflicted_paths.is_empty());
    assert_eq!(repo.head(), head_before);
    assert_eq!(repo.porcelain(), "");
}

#[tokio::test]
async fn conflict_versions_can_be_resolved_and_committed() {
    let repo = common::conflicting_repo("merge-resolve");
    let feature_tip = repo.rev("feature");
    let _ = git::git_merge(repo.s(), "feature".into(), Some("no-ff".into()), None).await;

    let versions = git::git_get_conflict_versions(repo.s(), "shared.txt".into())
        .await
        .unwrap();
    assert_eq!(versions.base, "base\n");
    assert_eq!(versions.ours, "main side\n");
    assert_eq!(versions.theirs, "feature side\n");
    assert!(versions.current.contains("<<<<<<<"), "{}", versions.current);
    assert!(versions.current.contains("feature side"), "{}", versions.current);

    git::git_save_resolved_file(repo.s(), "shared.txt".into(), "resolved\n".into())
        .await
        .unwrap();
    assert!(git::merge_state(repo.s())
        .await
        .unwrap()
        .conflicted_paths
        .is_empty());

    git::git_merge_commit(repo.s()).await.unwrap();
    assert!(!git::merge_state(repo.s()).await.unwrap().in_progress);
    assert_eq!(repo.read("shared.txt"), "resolved\n");
    let parents = repo.git(&["rev-list", "--parents", "-1", "HEAD"]);
    assert!(parents.contains(&feature_tip), "{parents}");
}

#[tokio::test]
async fn cherry_pick_replays_a_commit_onto_the_current_branch() {
    let repo = TestRepo::new("cherry-pick");
    repo.commit("base.txt", "base\n", "c1");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    let tip = repo.commit("feature.txt", "feature\n", "feature work");
    repo.git(&["checkout", "-q", "main"]);
    repo.commit("main.txt", "main\n", "c2 main");

    git::git_cherry_pick(repo.s(), vec![tip.clone()], None)
        .await
        .unwrap();

    assert_eq!(repo.subjects(), vec!["feature work", "c2 main", "c1"]);
    assert_ne!(repo.head(), tip, "the replayed commit gets a new hash");
    assert_eq!(repo.read("feature.txt"), "feature\n");
    assert_eq!(repo.rev("feature"), tip, "the source branch is untouched");
    assert!(!git::cherry_pick_state(repo.s()).await.unwrap().in_progress);
}

#[tokio::test]
async fn cherry_pick_validates_its_arguments() {
    let (repo, tip) = diverged_repo("cherry-pick-validate");

    let empty = git::git_cherry_pick(repo.s(), vec!["  ".into()], None)
        .await
        .unwrap_err();
    assert!(empty.contains("Mindestens ein Commit-Hash"), "{empty}");

    let mainline = git::git_cherry_pick(repo.s(), vec![tip], Some(0))
        .await
        .unwrap_err();
    assert!(mainline.contains("Mainline-Parent"), "{mainline}");
}

#[tokio::test]
async fn cherry_pick_conflict_reports_state_and_continues_after_resolution() {
    let repo = common::conflicting_repo("cherry-pick-conflict");
    let feature_tip = repo.rev("feature");

    let err = git::git_cherry_pick(repo.s(), vec![feature_tip.clone()], None)
        .await
        .unwrap_err();
    assert!(err.contains("CONFLICT") || err.contains("conflict"), "{err}");

    let state = git::cherry_pick_state(repo.s()).await.unwrap();
    assert!(state.in_progress);
    assert_eq!(state.head.as_deref(), Some(feature_tip.as_str()));
    assert_eq!(state.conflicted_paths, vec!["shared.txt".to_string()]);

    git::git_save_resolved_file(repo.s(), "shared.txt".into(), "merged by hand\n".into())
        .await
        .unwrap();
    git::git_cherry_pick_continue(repo.s()).await.unwrap();

    assert!(!git::cherry_pick_state(repo.s()).await.unwrap().in_progress);
    assert_eq!(repo.subjects()[0], "c3 feature");
    assert_eq!(repo.read("shared.txt"), "merged by hand\n");
}

#[tokio::test]
async fn cherry_pick_abort_restores_the_previous_head() {
    let repo = common::conflicting_repo("cherry-pick-abort");
    let head_before = repo.head();
    let feature_tip = repo.rev("feature");

    assert!(git::git_cherry_pick(repo.s(), vec![feature_tip], None)
        .await
        .is_err());
    git::git_cherry_pick_abort(repo.s()).await.unwrap();

    assert!(!git::cherry_pick_state(repo.s()).await.unwrap().in_progress);
    assert_eq!(repo.head(), head_before);
    assert_eq!(repo.read("shared.txt"), "main side\n");
}

#[tokio::test]
async fn revert_creates_an_inverse_commit() {
    let repo = TestRepo::new("revert");
    repo.commit("a.txt", "keep\n", "c1");
    let target = repo.commit("b.txt", "remove me\n", "add b");

    git::git_revert_commit(repo.s(), target.clone(), None)
        .await
        .unwrap();

    assert_eq!(repo.subjects()[0], "Revert \"add b\"");
    assert!(!repo.exists("b.txt"));
    assert_eq!(repo.git(&["rev-list", "--count", "HEAD"]), "3");
    assert!(git::git_revert_commit(repo.s(), "  ".into(), None)
        .await
        .is_err());
}

#[tokio::test]
async fn revert_of_a_merge_requires_a_mainline_parent() {
    let (repo, _) = diverged_repo("revert-merge");
    git::git_merge(repo.s(), "feature".into(), Some("no-ff".into()), None)
        .await
        .unwrap();
    let merge_commit = repo.head();

    let err = git::git_revert_commit(repo.s(), merge_commit.clone(), None)
        .await
        .unwrap_err();
    assert!(err.contains("is a merge but no -m option"), "{err}");

    git::git_revert_commit(repo.s(), merge_commit, Some(1))
        .await
        .unwrap();
    assert!(!repo.exists("feature.txt"));
}

#[tokio::test]
async fn reset_soft_mixed_and_hard_differ_in_index_and_worktree() {
    for (mode, expected_status, expected_content) in [
        ("soft", "M  a.txt", "v2\n"),
        ("mixed", " M a.txt", "v2\n"),
        ("hard", "", "v1\n"),
    ] {
        let repo = TestRepo::new(&format!("reset-{mode}"));
        repo.commit("a.txt", "v1\n", "c1");
        let base = repo.head();
        repo.commit("a.txt", "v2\n", "c2");

        git::git_reset(repo.s(), "HEAD~1".into(), mode.into())
            .await
            .unwrap();

        assert_eq!(repo.head(), base, "mode {mode}");
        assert_eq!(repo.porcelain(), expected_status, "mode {mode}");
        assert_eq!(repo.read("a.txt"), expected_content, "mode {mode}");
    }
}

#[tokio::test]
async fn reset_defaults_to_mixed_and_rejects_an_empty_target() {
    let repo = TestRepo::new("reset-validate");
    repo.commit("a.txt", "v1\n", "c1");
    repo.commit("a.txt", "v2\n", "c2");

    git::git_reset(repo.s(), "HEAD~1".into(), "something-else".into())
        .await
        .unwrap();
    assert_eq!(repo.porcelain(), " M a.txt");

    let err = git::git_reset(repo.s(), "  ".into(), "hard".into())
        .await
        .unwrap_err();
    assert!(err.contains("Ziel"), "{err}");
}

#[tokio::test]
async fn stash_push_and_pop_move_changes_out_of_and_back_into_the_worktree() {
    let repo = TestRepo::new("stash-roundtrip");
    repo.commit("a.txt", "v1\n", "c1");
    repo.write("a.txt", "v2\n");

    git::git_stash_push(repo.s(), Some("wip note".into()), false, false)
        .await
        .unwrap();
    assert_eq!(repo.porcelain(), "");
    assert_eq!(repo.read("a.txt"), "v1\n");

    let stashes = git::list_stashes(repo.s()).await.unwrap();
    assert_eq!(stashes.len(), 1);
    assert_eq!(stashes[0].index, 0);
    assert_eq!(stashes[0].refname, "stash@{0}");
    assert_eq!(stashes[0].branch, "main");
    assert_eq!(stashes[0].subject, "wip note");
    assert_eq!(stashes[0].message, "On main: wip note");
    assert!(stashes[0].date.contains('T'));

    git::git_stash_pop(repo.s(), 0).await.unwrap();
    assert_eq!(repo.read("a.txt"), "v2\n");
    assert!(git::list_stashes(repo.s()).await.unwrap().is_empty());
}

#[tokio::test]
async fn stash_list_parses_the_default_wip_message() {
    let repo = TestRepo::new("stash-wip");
    repo.commit("a.txt", "v1\n", "c1");
    repo.write("a.txt", "v2\n");
    git::git_stash_push(repo.s(), None, false, false).await.unwrap();

    let stashes = git::list_stashes(repo.s()).await.unwrap();
    assert_eq!(stashes.len(), 1);
    assert_eq!(stashes[0].branch, "main");
    assert!(
        stashes[0].subject.ends_with(" c1"),
        "the default WIP subject keeps the short hash: {}",
        stashes[0].subject
    );
    assert!(stashes[0].message.starts_with("WIP on main: "), "{}", stashes[0].message);
}

#[tokio::test]
async fn stash_apply_keeps_the_entry_and_drop_removes_it() {
    let repo = TestRepo::new("stash-apply-drop");
    repo.commit("a.txt", "v1\n", "c1");
    repo.write("a.txt", "v2\n");
    git::git_stash_push(repo.s(), Some("first".into()), false, false)
        .await
        .unwrap();
    repo.write("a.txt", "v3\n");
    git::git_stash_push(repo.s(), Some("second".into()), false, false)
        .await
        .unwrap();

    let stashes = git::list_stashes(repo.s()).await.unwrap();
    assert_eq!(stashes.len(), 2);
    assert_eq!(stashes[0].subject, "second");
    assert_eq!(stashes[1].subject, "first");

    git::git_stash_apply(repo.s(), 1).await.unwrap();
    assert_eq!(repo.read("a.txt"), "v2\n");
    assert_eq!(git::list_stashes(repo.s()).await.unwrap().len(), 2);

    repo.git(&["checkout", "--", "a.txt"]);
    git::git_stash_drop(repo.s(), 1).await.unwrap();
    let left = git::list_stashes(repo.s()).await.unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].subject, "second");
    assert_eq!(left[0].index, 0);
}

#[tokio::test]
async fn stash_push_can_include_untracked_files() {
    let repo = TestRepo::new("stash-untracked");
    repo.commit("a.txt", "v1\n", "c1");
    repo.write("new.txt", "fresh\n");

    git::git_stash_push(repo.s(), Some("with untracked".into()), true, false)
        .await
        .unwrap();
    assert!(!repo.exists("new.txt"));

    git::git_stash_pop(repo.s(), 0).await.unwrap();
    assert_eq!(repo.read("new.txt"), "fresh\n");
}

#[tokio::test]
async fn stash_show_and_file_diff_describe_the_stashed_change() {
    let repo = TestRepo::new("stash-show");
    repo.commit("a.txt", "v1\n", "c1");
    repo.write("a.txt", "v1\nv2\n");
    git::git_stash_push(repo.s(), Some("inspect me".into()), false, false)
        .await
        .unwrap();

    let show = git::git_stash_show(repo.s(), 0).await.unwrap();
    assert!(show.header.contains("inspect me"), "{}", show.header);
    assert_eq!(show.files.len(), 1);
    assert_eq!(show.files[0].path, "a.txt");
    assert_eq!(show.files[0].additions, 1);
    assert_eq!(show.files[0].deletions, 0);

    assert!(git::git_stash_file_diff(repo.s(), 0, "  ".into()).await.is_err());
}

/// Bug repro, intentionally ignored: `git_stash_file_diff` runs
/// `git stash show -p --no-color stash@{n} -- <file>`, which git rejects with
/// "Too many revisions specified" because `git stash show` takes no pathspec.
/// The error is swallowed by `unwrap_or_default()`, so the command always
/// answers with an empty diff instead of the file's changes.
#[tokio::test]
#[ignore = "documents a git.rs bug: git_stash_file_diff always returns an empty diff"]
async fn stash_file_diff_should_return_the_patch_for_one_file() {
    let repo = TestRepo::new("stash-file-diff-bug");
    repo.commit("a.txt", "v1\n", "c1");
    repo.write("a.txt", "v1\nv2\n");
    git::git_stash_push(repo.s(), Some("inspect me".into()), false, false)
        .await
        .unwrap();

    let diff = json(&git::git_stash_file_diff(repo.s(), 0, "a.txt".into()).await.unwrap());
    assert_eq!(diff["is_binary"], false);
    assert!(
        diff["diff"].as_str().unwrap_or("").contains("+v2"),
        "expected the stashed hunk, got {diff}"
    );
}

#[tokio::test]
async fn stash_branch_moves_the_stash_onto_a_new_branch() {
    let repo = TestRepo::new("stash-branch");
    repo.commit("a.txt", "v1\n", "c1");
    repo.write("a.txt", "v2\n");
    git::git_stash_push(repo.s(), Some("move me".into()), false, false)
        .await
        .unwrap();

    git::git_stash_branch(repo.s(), 0, "recovered".into()).await.unwrap();
    assert_eq!(repo.branch(), "recovered");
    assert_eq!(repo.read("a.txt"), "v2\n");
    assert!(git::list_stashes(repo.s()).await.unwrap().is_empty());

    assert!(git::git_stash_branch(repo.s(), 0, "  ".into()).await.is_err());
}

#[tokio::test]
async fn tags_can_be_created_listed_and_deleted() {
    let repo = TestRepo::new("tags");
    let first = repo.commit("a.txt", "1\n", "c1");
    repo.commit("b.txt", "2\n", "c2");

    git::git_tag_commit(repo.s(), "v1.0.0".into(), first.clone())
        .await
        .unwrap();
    git::git_tag_commit(repo.s(), "v2.0.0".into(), "HEAD".into())
        .await
        .unwrap();

    let info = json(&git::open_repo(repo.s(), None).await.unwrap());
    let tags: Vec<&str> = info["tags"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(tags, vec!["v1.0.0", "v2.0.0"]);
    assert_eq!(info["tags"][0]["commit"], first);

    git::delete_tag(repo.s(), "v1.0.0".into()).await.unwrap();
    assert_eq!(repo.git(&["tag", "--list"]), "v2.0.0");

    assert!(git::git_tag_commit(repo.s(), "  ".into(), first.clone()).await.is_err());
    assert!(git::git_tag_commit(repo.s(), "v3".into(), "  ".into()).await.is_err());
    assert!(git::delete_tag(repo.s(), "  ".into()).await.is_err());
    assert!(git::delete_tag(repo.s(), "never-existed".into()).await.is_err());
}

#[tokio::test]
async fn restore_files_at_commit_brings_back_an_older_version() {
    let repo = TestRepo::new("restore-at");
    repo.commit("a.txt", "v1\n", "c1");
    let old = repo.head();
    repo.commit("a.txt", "v2\n", "c2");

    git::git_restore_files_at_commit(repo.s(), old, vec!["a.txt".into()])
        .await
        .unwrap();
    assert_eq!(repo.read("a.txt"), "v1\n");
    assert_eq!(repo.porcelain(), "M  a.txt");

    git::git_restore_files_at_commit(repo.s(), "HEAD".into(), vec![])
        .await
        .unwrap();
    assert!(git::git_restore_files_at_commit(repo.s(), "  ".into(), vec!["a.txt".into()])
        .await
        .is_err());
}

#[tokio::test]
async fn branch_activity_lists_every_branch_with_its_tip() {
    let repo = TestRepo::new("branch-activity");
    repo.commit("a.txt", "1\n", "c1");
    repo.git(&["checkout", "-q", "-b", "side"]);
    repo.commit("b.txt", "2\n", "side work");
    repo.git(&["checkout", "-q", "main"]);

    let activity = git::repo_branch_activity(repo.s()).await.unwrap();
    let side = activity.iter().find(|b| b.name == "side").unwrap();
    assert_eq!(side.is_remote, false);
    assert!(side.last_commit_at.contains('T'), "{}", side.last_commit_at);
    assert!(activity.iter().any(|b| b.name == "main"));
}
