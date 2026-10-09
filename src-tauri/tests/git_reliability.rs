mod common;

use common::{expect_err, json, scratch_path, TestRepo};
use l8git_lib::git;

#[tokio::test]
async fn creation_commands_reject_options_without_deleting_existing_refs() {
    let repo = TestRepo::new("ref-options");
    let head = repo.commit("a.txt", "base", "base");
    repo.git(&["branch", "keep"]);
    repo.git(&["tag", "keep"]);

    assert!(
        git::git_create_branch(repo.s(), "-D".into(), Some("keep".into()), false)
            .await
            .is_err()
    );
    assert!(
        git::git_create_branch(repo.s(), "new".into(), Some("--delete".into()), false)
            .await
            .is_err()
    );
    assert!(
        git::git_create_branch(repo.s(), "bad..name".into(), None, true)
            .await
            .is_err()
    );
    assert!(
        git::git_tag_commit(repo.s(), "-d".into(), "keep".into(), None, None, None)
            .await
            .is_err()
    );
    assert!(git::git_tag_commit(
        repo.s(),
        "new-tag".into(),
        "--delete".into(),
        None,
        None,
        None
    )
    .await
    .is_err());
    assert_eq!(repo.rev("refs/heads/keep"), head);
    assert_eq!(repo.rev("refs/tags/keep"), head);
    assert_eq!(repo.branch(), "main");
    assert!(!repo.try_git(&["show-ref", "--verify", "refs/heads/new"]).0);
    assert!(
        !repo
            .try_git(&["show-ref", "--verify", "refs/tags/new-tag"])
            .0
    );
}

#[tokio::test]
async fn resolve_commit_accepts_revision_expressions_and_annotated_tags_only_for_commits() {
    let repo = TestRepo::new("resolve-commit");
    let first = repo.commit("a.txt", "first", "first");
    repo.commit("a.txt", "second", "second");
    repo.git(&["tag", "-a", "annotated", "-m", "tag body", &first]);

    assert_eq!(
        git::git_resolve_commit(repo.s(), "HEAD~1".into())
            .await
            .unwrap(),
        first
    );
    assert_eq!(
        git::git_resolve_commit(repo.s(), "annotated".into())
            .await
            .unwrap(),
        first
    );
    assert!(git::git_resolve_commit(repo.s(), "HEAD^{tree}".into())
        .await
        .is_err());
    for invalid in ["--all", "--verify", "HEAD\nHEAD", "missing-ref", ""] {
        assert!(git::git_resolve_commit(repo.s(), invalid.into())
            .await
            .is_err());
    }
}

#[tokio::test]
async fn history_operations_reject_option_arguments_without_changing_head_or_worktree() {
    let repo = TestRepo::new("history-options");
    repo.commit("a.txt", "first", "first");
    let before = repo.commit("a.txt", "second", "second");
    repo.write("a.txt", "uncommitted");
    assert!(
        git::git_reset(repo.s(), "--hard".into(), "hard".into(), None)
            .await
            .is_err()
    );
    assert!(git::git_revert_commit(repo.s(), "--abort".into(), None)
        .await
        .is_err());
    assert!(git::git_cherry_pick(repo.s(), vec!["--abort".into()], None)
        .await
        .is_err());
    assert_eq!(repo.head(), before);
    assert_eq!(repo.read("a.txt"), "uncommitted");
}

#[tokio::test]
async fn invalid_bisect_endpoints_leave_the_repository_unchanged() {
    let repo = TestRepo::new("bisect-invalid");
    let good = repo.commit("a.txt", "first", "first");
    let bad = repo.commit("a.txt", "second", "second");
    for invalid in ["missing-ref", "--term-new=broken", "HEAD^{tree}", ""] {
        assert!(git::git_bisect_start(repo.s(), bad.clone(), invalid.into())
            .await
            .is_err());
        assert!(
            git::git_bisect_start(repo.s(), invalid.into(), good.clone())
                .await
                .is_err()
        );
        assert!(!git::git_bisect_status(repo.s()).await.unwrap().active);
        assert_eq!(repo.head(), bad);
        assert_eq!(repo.branch(), "main");
    }
}

#[tokio::test]
async fn completed_bisect_survives_status_refresh_and_reports_the_result() {
    let repo = TestRepo::new("bisect-complete");
    let good = repo.commit("a.txt", "0", "good");
    let culprit = repo.commit("a.txt", "1", "regression introduced");
    repo.commit("a.txt", "2", "still broken");
    let bad = repo.commit("a.txt", "3", "bad");
    let started = git::git_bisect_start(repo.s(), bad.clone(), good.clone())
        .await
        .unwrap();
    assert!(started.active);
    assert!(started.steps_remaining.is_some());
    let error = expect_err(git::git_bisect_start(repo.s(), bad, good).await);
    assert_eq!(error, "__BISECT_ALREADY_IN_PROGRESS__");
    let mut done = false;
    for _ in 0..4 {
        let marked = git::git_bisect_mark(repo.s(), "bad".into()).await.unwrap();
        if marked.done {
            assert_eq!(marked.result_hash.as_deref(), Some(culprit.as_str()));
            done = true;
            break;
        }
    }
    assert!(done);
    let refreshed = git::git_bisect_status(repo.s()).await.unwrap();
    assert!(refreshed.done);
    assert_eq!(refreshed.result_hash, Some(culprit));
    assert_eq!(
        refreshed.result_subject.as_deref(),
        Some("regression introduced")
    );
    assert!(refreshed.steps_remaining.is_none());
    git::git_bisect_reset(repo.s()).await.unwrap();
    assert!(!git::git_bisect_status(repo.s()).await.unwrap().active);
    assert_eq!(repo.branch(), "main");
    assert!(json(&refreshed)["marked_bad"].as_array().unwrap().len() >= 2);
}

#[tokio::test]
async fn stale_amend_and_reset_confirmations_never_rewrite_newer_head() {
    let repo = TestRepo::new("head-guard");
    let original = repo.commit("a.txt", "first", "first");
    let newer = repo.commit("b.txt", "second", "second");
    repo.write("b.txt", "pending");
    repo.git(&["add", "b.txt"]);
    assert_eq!(
        git::commit_amend(repo.s(), "stale amendment".into(), Some(original.clone()))
            .await
            .unwrap_err(),
        "__HEAD_CHANGED__"
    );
    assert_eq!(
        git::git_reset(repo.s(), original.clone(), "hard".into(), Some(original))
            .await
            .unwrap_err(),
        "__HEAD_CHANGED__"
    );
    assert_eq!(repo.head(), newer);
    assert_eq!(repo.read("b.txt"), "pending");
    assert_eq!(repo.git(&["show", ":b.txt"]), "pending");
    git::commit_amend(repo.s(), "updated second".into(), Some(newer))
        .await
        .unwrap();
    assert_eq!(repo.subjects(), vec!["updated second", "first"]);
    let amended = repo.head();
    git::git_reset(repo.s(), "HEAD~1".into(), "soft".into(), Some(amended))
        .await
        .unwrap();
    assert_eq!(repo.subjects(), vec!["first"]);
}

#[tokio::test]
async fn conflict_and_discard_paths_cannot_escape_the_repository_or_touch_git_metadata() {
    let repo = TestRepo::new("path-guard");
    repo.commit("tracked.txt", "base", "base");
    repo.write("valid.txt", "keep me");
    let outside = TestRepo::new("path-guard-outside");
    outside.write("secret.txt", "keep secret");
    for invalid in [
        format!(
            "../{}/secret.txt",
            outside.path.file_name().unwrap().to_string_lossy()
        ),
        outside.path.join("secret.txt").to_string_lossy().into(),
        ".git/config".into(),
        ".".into(),
    ] {
        assert!(git::git_get_conflict_versions(repo.s(), invalid.clone())
            .await
            .is_err());
        assert!(
            git::git_save_resolved_file(repo.s(), invalid.clone(), "overwrite".into())
                .await
                .is_err()
        );
        assert!(git::git_discard_files(
            repo.s(),
            vec!["valid.txt".into(), invalid.clone()],
            vec![true, true],
            None
        )
        .await
        .is_err());
        assert!(git::git_discard_worktree_changes(
            repo.s(),
            vec!["valid.txt".into(), invalid],
            vec![true, true],
            None
        )
        .await
        .is_err());
        assert_eq!(repo.read("valid.txt"), "keep me");
        assert_eq!(outside.read("secret.txt"), "keep secret");
        assert_eq!(repo.git(&["config", "user.name"]), "Test User");
    }
}

#[tokio::test]
async fn discard_rechecks_untracked_flags_before_deleting_any_file() {
    let repo = TestRepo::new("discard-stale-status");
    repo.commit("tracked.txt", "base", "base");
    repo.write("valid.txt", "keep me");
    repo.write("tracked.txt", "pending");
    let error = git::git_discard_files(
        repo.s(),
        vec!["valid.txt".into(), "tracked.txt".into()],
        vec![true, true],
        None,
    )
    .await
    .unwrap_err();
    assert!(error.contains("__DISCARD_TRACKED_AS_UNTRACKED__"));
    assert_eq!(repo.read("valid.txt"), "keep me");
    assert_eq!(repo.read("tracked.txt"), "pending");
    repo.write("new.txt", "staged after status refresh");
    repo.git(&["add", "new.txt"]);
    assert!(
        git::git_discard_worktree_changes(repo.s(), vec!["new.txt".into()], vec![true], None)
            .await
            .is_err()
    );
    assert!(repo.exists("new.txt"));
}

#[tokio::test]
#[cfg(unix)]
async fn staging_and_discard_treat_glob_characters_as_literal_filenames() {
    let repo = TestRepo::new("literal-files");
    repo.commit("tracked.txt", "base", "base");
    repo.write("wild*.txt", "literal");
    repo.write("wild-other.txt", "unselected");
    git::stage_files(repo.s(), vec!["wild*.txt".into()])
        .await
        .unwrap();
    assert_eq!(repo.git(&["diff", "--cached", "--name-only"]), "wild*.txt");
    git::unstage_files(repo.s(), vec!["wild*.txt".into()])
        .await
        .unwrap();
    git::git_discard_files(repo.s(), vec!["wild*.txt".into()], vec![true], None)
        .await
        .unwrap();
    assert!(!repo.exists("wild*.txt"));
    assert_eq!(repo.read("wild-other.txt"), "unselected");
}

#[tokio::test]
async fn discard_preserves_an_embedded_repository() {
    let repo = TestRepo::new("embedded-repo");
    repo.commit("tracked.txt", "base", "base");
    let nested_path = repo.path.join("nested");
    std::fs::create_dir_all(&nested_path).unwrap();
    assert!(common::git_raw(&nested_path, &["init", "-q"]).0);
    let nested = TestRepo::adopt(nested_path);
    nested.commit("precious.txt", "keep repository", "initial");
    git::git_discard_files(repo.s(), vec!["nested".into()], vec![true], None)
        .await
        .unwrap();
    assert_eq!(nested.read("precious.txt"), "keep repository");
    assert_eq!(nested.subjects(), vec!["initial"]);
}

#[cfg(unix)]
#[tokio::test]
async fn conflict_edits_reject_symlinks_but_untracked_discard_only_unlinks_them() {
    use std::os::unix::fs::symlink;
    let repo = TestRepo::new("symlink-safety");
    repo.commit("tracked.txt", "base", "base");
    let outside = TestRepo::new("symlink-outside");
    outside.write("secret.txt", "keep secret");
    symlink(outside.path.join("secret.txt"), repo.path.join("file-link")).unwrap();
    symlink(&outside.path, repo.path.join("dir-link")).unwrap();
    for path in ["file-link", "dir-link/secret.txt"] {
        assert!(git::git_get_conflict_versions(repo.s(), path.into())
            .await
            .is_err());
        assert!(
            git::git_save_resolved_file(repo.s(), path.into(), "overwrite".into())
                .await
                .is_err()
        );
    }
    assert!(git::git_discard_files(
        repo.s(),
        vec!["dir-link/secret.txt".into()],
        vec![true],
        None
    )
    .await
    .is_err());
    git::git_discard_files(
        repo.s(),
        vec!["file-link".into(), "dir-link".into()],
        vec![true, true],
        None,
    )
    .await
    .unwrap();
    assert_eq!(outside.read("secret.txt"), "keep secret");
    assert!(std::fs::symlink_metadata(repo.path.join("file-link")).is_err());
    assert!(std::fs::symlink_metadata(repo.path.join("dir-link")).is_err());
}

#[cfg(unix)]
#[tokio::test]
async fn worktree_listing_preserves_newlines_tabs_and_unicode_in_paths() {
    let repo = TestRepo::new("worktree-paths");
    repo.commit("tracked.txt", "base", "base");
    let worktree_path = scratch_path("space tab\tline\nümlaut");
    repo.git(&[
        "worktree",
        "add",
        "-b",
        "special-path",
        worktree_path.to_str().unwrap(),
    ]);
    let worktree = TestRepo::adopt(worktree_path);
    let listed = git::list_worktrees(repo.s()).await.unwrap();
    let linked = listed
        .iter()
        .find(|entry| entry.branch.as_deref() == Some("special-path"))
        .unwrap();
    assert_eq!(linked.path, worktree.s());
    assert!(!linked.is_main);
}

#[tokio::test]
async fn missing_stash_snapshots_return_a_stable_changed_error() {
    let repo = TestRepo::new("stash-missing");
    repo.commit("tracked.txt", "base", "base");
    repo.write("tracked.txt", "stashed");
    git::git_stash_push(repo.s(), None, false, false)
        .await
        .unwrap();
    let expected = repo.rev("stash@{0}");
    repo.git(&["stash", "drop"]);
    assert_eq!(
        git::git_stash_apply(repo.s(), 0, expected)
            .await
            .unwrap_err(),
        "__STASH_CHANGED__"
    );
    let non_repo = scratch_path("not-a-repository");
    std::fs::create_dir_all(&non_repo).unwrap();
    assert!(git::list_stashes(non_repo.to_string_lossy().into())
        .await
        .is_err());
    std::fs::remove_dir_all(non_repo).unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn conflict_state_and_resolution_preserve_special_filenames() {
    let repo = TestRepo::new("conflict-paths");
    let file = "tab\tnewline\nümlaut.txt";
    repo.commit(file, "base\n", "base");
    repo.git(&["checkout", "-b", "feature"]);
    repo.commit(file, "feature\n", "feature change");
    repo.git(&["checkout", "main"]);
    repo.commit(file, "main\n", "main change");
    assert!(
        git::git_merge(repo.s(), "feature".into(), None, None, None, None, None)
            .await
            .is_err()
    );
    let status = git::merge_state(repo.s()).await.unwrap();
    assert!(status.in_progress);
    assert_eq!(status.conflicted_paths, vec![file]);
    let versions = git::git_get_conflict_versions(repo.s(), file.into())
        .await
        .unwrap();
    assert_eq!(versions.base.trim(), "base");
    assert_eq!(versions.ours.trim(), "main");
    assert_eq!(versions.theirs.trim(), "feature");
    git::git_save_resolved_file(repo.s(), file.into(), "resolved\n".into())
        .await
        .unwrap();
    assert!(git::merge_state(repo.s())
        .await
        .unwrap()
        .conflicted_paths
        .is_empty());
    assert_eq!(repo.read(file), "resolved\n");
}

#[cfg(unix)]
#[tokio::test]
async fn range_aggregation_preserves_filenames_and_all_message_fields() {
    let repo = TestRepo::new("range-special-fields");
    let file = "tab\tnewline\ncarriage\r";
    repo.commit(file, "one\n", "First \u{1f} subject\n\nFirst body");
    repo.commit(
        file,
        "one\ntwo\n",
        "Second \u{1f} subject\n\nSecond \u{1f} body",
    );
    let range = json(
        &git::repo_range_commits(repo.s(), None, "HEAD".into(), None)
            .await
            .unwrap(),
    );
    assert_eq!(range["total_commits"], 2);
    assert_eq!(range["files"][0]["path"], file);
    assert_eq!(range["files"][0]["additions"], 2);
    assert_eq!(range["additions"], 2);
    assert_eq!(range["commits"][0]["subject"], "Second \u{1f} subject");
    assert_eq!(
        range["commits"][0]["body"].as_str().unwrap().trim_end(),
        "Second \u{1f} body"
    );
    assert_eq!(range["commits"][1]["subject"], "First \u{1f} subject");
    assert_eq!(
        range["commits"][1]["body"].as_str().unwrap().trim_end(),
        "First body"
    );
    assert!(
        git::repo_range_commits(repo.s(), Some("missing".into()), "HEAD".into(), None)
            .await
            .is_err()
    );
    assert!(
        git::repo_range_commits(repo.s(), None, "--all".into(), None)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn guarded_merge_rejects_changed_branch_target_or_source_without_mutation() {
    let repo = TestRepo::new("merge-snapshots");
    let base = repo.commit("base.txt", "base", "base");
    repo.git(&["checkout", "-b", "agent"]);
    let source = repo.commit("agent.txt", "completed work", "agent work");
    repo.git(&["checkout", "main"]);
    let branch_error = git::git_merge(
        repo.s(),
        "agent".into(),
        Some("no-ff".into()),
        None,
        Some("wrong-branch".into()),
        Some(base.clone()),
        Some(source.clone()),
    )
    .await
    .unwrap_err();
    assert_eq!(branch_error, "__BRANCH_CHANGED__");
    let head_error = git::git_merge(
        repo.s(),
        "agent".into(),
        Some("no-ff".into()),
        None,
        Some("main".into()),
        Some(source.clone()),
        Some(source.clone()),
    )
    .await
    .unwrap_err();
    assert_eq!(head_error, "__HEAD_CHANGED__");
    let source_error = git::git_merge(
        repo.s(),
        "agent".into(),
        Some("no-ff".into()),
        None,
        Some("main".into()),
        Some(base.clone()),
        Some(base.clone()),
    )
    .await
    .unwrap_err();
    assert_eq!(source_error, "__SOURCE_CHANGED__");
    assert_eq!(repo.head(), base);
    assert!(!repo.exists("agent.txt"));
    git::git_merge(
        repo.s(),
        "agent".into(),
        Some("no-ff".into()),
        None,
        Some("main".into()),
        Some(base),
        Some(source.clone()),
    )
    .await
    .unwrap();
    assert_eq!(repo.read("agent.txt"), "completed work");
    assert!(
        repo.try_git(&["merge-base", "--is-ancestor", &source, "HEAD"])
            .0
    );
}

#[tokio::test]
async fn checked_worktree_cleanup_requires_clean_merged_snapshot_and_keeps_the_branch() {
    let repo = TestRepo::new("checked-cleanup");
    repo.commit("base.txt", "base", "base");
    let worktree_path = scratch_path("agent-cleanup");
    repo.git(&[
        "worktree",
        "add",
        "-b",
        "agent",
        worktree_path.to_str().unwrap(),
    ]);
    let worktree = TestRepo::adopt(worktree_path);
    let source = worktree.commit("agent.txt", "completed work", "agent work");
    let not_merged = git::git_worktree_remove_checked(
        repo.s(),
        worktree.s(),
        "agent".into(),
        source.clone(),
        "main".into(),
    )
    .await
    .unwrap_err();
    assert_eq!(not_merged, "__WORKTREE_NOT_MERGED__");
    assert!(worktree.path.exists());

    repo.git(&["merge", "--ff-only", "agent"]);
    let changed_branch = git::git_worktree_remove_checked(
        repo.s(),
        worktree.s(),
        "different".into(),
        source.clone(),
        "main".into(),
    )
    .await
    .unwrap_err();
    assert_eq!(changed_branch, "__BRANCH_CHANGED__");
    let changed_source = git::git_worktree_remove_checked(
        repo.s(),
        worktree.s(),
        "agent".into(),
        repo.rev("HEAD~1"),
        "main".into(),
    )
    .await
    .unwrap_err();
    assert_eq!(changed_source, "__SOURCE_CHANGED__");
    worktree.write("untracked.txt", "keep my unreviewed output");
    let dirty = git::git_worktree_remove_checked(
        repo.s(),
        worktree.s(),
        "agent".into(),
        source.clone(),
        "main".into(),
    )
    .await
    .unwrap_err();
    assert_eq!(dirty, "__WORKTREE_DIRTY__");
    assert_eq!(worktree.read("untracked.txt"), "keep my unreviewed output");
    std::fs::remove_file(worktree.path.join("untracked.txt")).unwrap();
    git::git_worktree_remove_checked(
        repo.s(),
        worktree.s(),
        "agent".into(),
        source.clone(),
        "main".into(),
    )
    .await
    .unwrap();
    assert!(!worktree.path.exists());
    assert_eq!(repo.rev("refs/heads/agent"), source);
    assert_eq!(git::list_worktrees(repo.s()).await.unwrap().len(), 1);
}

#[tokio::test]
async fn checked_worktree_cleanup_rejects_main_subdirectories_and_unrelated_repositories() {
    let repo = TestRepo::new("cleanup-membership");
    let head = repo.commit("base.txt", "base", "base");
    let unrelated = TestRepo::new("cleanup-unrelated");
    unrelated.commit("precious.txt", "keep me", "initial");
    let subdirectory = repo.path.join("subdirectory");
    std::fs::create_dir_all(&subdirectory).unwrap();
    for target in [
        repo.s(),
        subdirectory.to_string_lossy().into(),
        unrelated.s(),
    ] {
        let error = git::git_worktree_remove_checked(
            repo.s(),
            target,
            "main".into(),
            head.clone(),
            "main".into(),
        )
        .await
        .unwrap_err();
        assert_eq!(error, "__WORKTREE_NOT_REGISTERED__");
    }
    assert_eq!(unrelated.read("precious.txt"), "keep me");
    assert!(repo.path.exists());
}
