mod common;

use common::{json, TestRepo};
use l8git_lib::git;

async fn snapshot(repo: &TestRepo, file: &str, untracked: bool) -> String {
    let diff = json(
        &git::repo_file_diff(repo.s(), file.into(), untracked, Some(true))
            .await
            .unwrap(),
    );
    diff["fingerprint"]
        .as_str()
        .expect("preview token")
        .to_string()
}

#[tokio::test]
async fn same_size_binary_edits_invalidate_the_reviewed_snapshot() {
    let repo = TestRepo::new("snapshot-binary");
    repo.write_bytes("blob.bin", &[0, 1, 2, 3]);
    repo.commit_all("base binary");
    repo.write_bytes("blob.bin", &[0, 4, 5, 6]);
    let old = snapshot(&repo, "blob.bin", false).await;
    repo.write_bytes("blob.bin", &[0, 7, 8, 9]);
    let fresh = snapshot(&repo, "blob.bin", false).await;
    assert_ne!(old, fresh);
    let error = git::git_discard_worktree_changes(
        repo.s(),
        vec!["blob.bin".into()],
        vec![false],
        Some(vec![old]),
    )
    .await
    .unwrap_err();
    assert_eq!(error, "__FILE_CHANGED__|blob.bin");
    assert_eq!(
        std::fs::read(repo.path.join("blob.bin")).unwrap(),
        [0, 7, 8, 9]
    );
    git::git_discard_worktree_changes(
        repo.s(),
        vec!["blob.bin".into()],
        vec![false],
        Some(vec![fresh]),
    )
    .await
    .unwrap();
    assert_eq!(
        std::fs::read(repo.path.join("blob.bin")).unwrap(),
        [0, 1, 2, 3]
    );
}

#[tokio::test]
async fn whole_batch_validation_prevents_partial_discard_when_last_file_changed() {
    let repo = TestRepo::new("snapshot-batch");
    repo.commit("a.txt", "base a\n", "base a");
    repo.commit("b.txt", "base b\n", "base b");
    repo.write("a.txt", "changed a\n");
    repo.write("b.txt", "changed b\n");
    let a = snapshot(&repo, "a.txt", false).await;
    let b = snapshot(&repo, "b.txt", false).await;
    repo.write("b.txt", "newer b\n");
    let error = git::git_discard_files(
        repo.s(),
        vec!["a.txt".into(), "b.txt".into()],
        vec![false, false],
        Some(vec![a.clone(), b]),
    )
    .await
    .unwrap_err();
    assert_eq!(error, "__FILE_CHANGED__|b.txt");
    assert_eq!(repo.read("a.txt"), "changed a\n");
    assert_eq!(repo.read("b.txt"), "newer b\n");
    assert!(git::git_discard_files(
        repo.s(),
        vec!["a.txt".into(), "b.txt".into()],
        vec![false, false],
        Some(vec![a])
    )
    .await
    .is_err());
    assert_eq!(repo.read("a.txt"), "changed a\n");
    assert_eq!(repo.read("b.txt"), "newer b\n");
}

#[tokio::test]
async fn index_changes_are_guarded_even_when_worktree_bytes_stay_equal() {
    let repo = TestRepo::new("snapshot-index");
    repo.commit("a.txt", "base\n", "base");
    repo.write("a.txt", "staged a\n");
    repo.git(&["add", "--", "a.txt"]);
    repo.write("a.txt", "worktree\n");
    let old = snapshot(&repo, "a.txt", false).await;
    repo.write("a.txt", "staged b\n");
    repo.git(&["add", "--", "a.txt"]);
    repo.write("a.txt", "worktree\n");
    let error = git::git_discard_worktree_changes(
        repo.s(),
        vec!["a.txt".into()],
        vec![false],
        Some(vec![old]),
    )
    .await
    .unwrap_err();
    assert_eq!(error, "__FILE_CHANGED__|a.txt");
    assert_eq!(repo.read("a.txt"), "worktree\n");
    assert_eq!(repo.git(&["show", ":a.txt"]), "staged b");
}

#[tokio::test]
async fn source_tree_changes_are_guarded_even_when_index_and_worktree_stay_equal() {
    let repo = TestRepo::new("snapshot-source");
    repo.commit("a.txt", "base a\n", "base");
    let original_blob = repo.rev("HEAD:a.txt");
    repo.write("a.txt", "reviewed edits\n");
    let old = snapshot(&repo, "a.txt", false).await;
    repo.commit("a.txt", "different base\n", "changed source");
    repo.git(&[
        "update-index",
        "--cacheinfo",
        "100644",
        &original_blob,
        "a.txt",
    ]);
    repo.write("a.txt", "reviewed edits\n");
    let error =
        git::git_discard_files(repo.s(), vec!["a.txt".into()], vec![false], Some(vec![old]))
            .await
            .unwrap_err();
    assert_eq!(error, "__FILE_CHANGED__|a.txt");
    assert_eq!(repo.read("a.txt"), "reviewed edits\n");
    assert_eq!(repo.git(&["show", ":a.txt"]), "base a");
}

#[tokio::test]
async fn unrelated_commits_do_not_invalidate_an_unchanged_selected_source() {
    let repo = TestRepo::new("snapshot-unrelated-source");
    repo.commit("a.txt", "base a\n", "base");
    repo.write("a.txt", "reviewed edits\n");
    let old = snapshot(&repo, "a.txt", false).await;
    repo.commit("other.txt", "unrelated\n", "unrelated commit");
    assert_eq!(snapshot(&repo, "a.txt", false).await, old);
    git::git_discard_files(repo.s(), vec!["a.txt".into()], vec![false], Some(vec![old]))
        .await
        .unwrap();
    assert_eq!(repo.read("a.txt"), "base a\n");
}

#[tokio::test]
async fn directory_snapshot_detects_new_children_before_any_delete() {
    let repo = TestRepo::new("snapshot-directory");
    repo.commit("tracked.txt", "base\n", "base");
    repo.write("drafts/one.txt", "draft one\n");
    let old = snapshot(&repo, "drafts/", true).await;
    repo.write("drafts/two.txt", "new draft\n");
    let error = git::git_discard_files(
        repo.s(),
        vec!["drafts/".into()],
        vec![true],
        Some(vec![old]),
    )
    .await
    .unwrap_err();
    assert_eq!(error, "__FILE_CHANGED__|drafts/");
    assert_eq!(repo.read("drafts/one.txt"), "draft one\n");
    assert_eq!(repo.read("drafts/two.txt"), "new draft\n");
    let fresh = snapshot(&repo, "drafts/", true).await;
    git::git_discard_files(
        repo.s(),
        vec!["drafts/".into()],
        vec![true],
        Some(vec![fresh]),
    )
    .await
    .unwrap();
    assert!(!repo.exists("drafts"));
}

#[tokio::test]
async fn ignore_rule_changes_invalidate_the_git_clean_deletion_set() {
    let repo = TestRepo::new("snapshot-ignore");
    repo.commit(".gitignore", "drafts/keep.txt\n", "ignore one draft");
    repo.write("drafts/remove.txt", "remove\n");
    repo.write("drafts/keep.txt", "keep\n");
    let old = snapshot(&repo, "drafts/", true).await;
    repo.write(".gitignore", "");
    let error = git::git_discard_files(
        repo.s(),
        vec!["drafts/".into()],
        vec![true],
        Some(vec![old]),
    )
    .await
    .unwrap_err();
    assert_eq!(error, "__FILE_CHANGED__|drafts/");
    assert_eq!(repo.read("drafts/keep.txt"), "keep\n");
    assert_eq!(repo.read("drafts/remove.txt"), "remove\n");
}

#[tokio::test]
async fn raw_changes_hidden_by_clean_filters_are_detected_without_running_filters_in_the_guard() {
    let repo = TestRepo::new("snapshot-filter");
    repo.write(
        "filter.sh",
        "printf x >> .git/clean-calls\nprintf 'fixed\\n'\n",
    );
    repo.write(".gitattributes", "a.txt filter=fixed\n");
    repo.git(&["config", "filter.fixed.clean", "sh filter.sh"]);
    repo.git(&["config", "filter.fixed.smudge", "cat"]);
    repo.write("a.txt", "one\n");
    repo.commit_all("filtered base");
    repo.write("a.txt", "two\n");
    let preview = json(
        &git::repo_file_diff(repo.s(), "a.txt".into(), false, Some(true))
            .await
            .unwrap(),
    );
    assert!(preview["unstaged"].is_null());
    let old = preview["fingerprint"].as_str().unwrap().to_string();
    repo.write("a.txt", "new\n");
    let calls = std::fs::read(repo.path.join(".git/clean-calls")).unwrap();
    let error = git::git_discard_worktree_changes(
        repo.s(),
        vec!["a.txt".into()],
        vec![false],
        Some(vec![old]),
    )
    .await
    .unwrap_err();
    assert_eq!(error, "__FILE_CHANGED__|a.txt");
    assert_eq!(
        std::fs::read(repo.path.join(".git/clean-calls")).unwrap(),
        calls
    );
    assert_eq!(repo.read("a.txt"), "new\n");
}

#[tokio::test]
async fn snapshot_supports_unborn_repositories_and_is_optional_for_browsing() {
    let repo = TestRepo::new("snapshot-unborn");
    repo.write("new.txt", "new\n");
    let normal = json(
        &git::repo_file_diff(repo.s(), "new.txt".into(), true, None)
            .await
            .unwrap(),
    );
    assert!(normal["fingerprint"].is_null());
    let token = snapshot(&repo, "new.txt", true).await;
    assert!(token.starts_with("sha256-v1:"));
    git::git_discard_files(
        repo.s(),
        vec!["new.txt".into()],
        vec![true],
        Some(vec![token]),
    )
    .await
    .unwrap();
    assert!(!repo.exists("new.txt"));
    repo.write("staged.txt", "staged\n");
    repo.git(&["add", "--", "staged.txt"]);
    repo.write("staged.txt", "worktree\n");
    let token = snapshot(&repo, "staged.txt", false).await;
    git::git_discard_worktree_changes(
        repo.s(),
        vec!["staged.txt".into()],
        vec![false],
        Some(vec![token]),
    )
    .await
    .unwrap();
    assert_eq!(repo.read("staged.txt"), "staged\n");
}

#[tokio::test]
async fn deleted_worktree_file_has_a_stable_snapshot_and_can_be_restored() {
    let repo = TestRepo::new("snapshot-deleted");
    repo.commit("a.txt", "base\n", "base");
    std::fs::remove_file(repo.path.join("a.txt")).unwrap();
    let token = snapshot(&repo, "a.txt", false).await;
    assert_eq!(snapshot(&repo, "a.txt", false).await, token);
    git::git_discard_worktree_changes(
        repo.s(),
        vec!["a.txt".into()],
        vec![false],
        Some(vec![token]),
    )
    .await
    .unwrap();
    assert_eq!(repo.read("a.txt"), "base\n");
}

#[cfg(unix)]
#[tokio::test]
async fn symlink_snapshot_and_preview_read_the_link_target_without_following_it() {
    use std::os::unix::fs::symlink;
    let repo = TestRepo::new("snapshot-link");
    repo.commit("tracked.txt", "base\n", "base");
    let outside = TestRepo::new("snapshot-link-outside");
    outside.write("one.txt", "outside secret one\n");
    outside.write("two.txt", "outside secret two\n");
    let one = outside.path.join("one.txt");
    let two = outside.path.join("two.txt");
    symlink(&one, repo.path.join("link")).unwrap();
    let preview = json(
        &git::repo_file_diff(repo.s(), "link".into(), true, Some(true))
            .await
            .unwrap(),
    );
    assert_eq!(
        preview["untracked_plain"],
        one.to_string_lossy().to_string()
    );
    let old = preview["fingerprint"].as_str().unwrap().to_string();
    std::fs::remove_file(repo.path.join("link")).unwrap();
    symlink(&two, repo.path.join("link")).unwrap();
    assert_eq!(
        git::git_discard_files(repo.s(), vec!["link".into()], vec![true], Some(vec![old]))
            .await
            .unwrap_err(),
        "__FILE_CHANGED__|link"
    );
    assert!(std::fs::symlink_metadata(repo.path.join("link")).is_ok());
    let fresh = snapshot(&repo, "link", true).await;
    git::git_discard_files(repo.s(), vec!["link".into()], vec![true], Some(vec![fresh]))
        .await
        .unwrap();
    assert!(!repo.exists("link"));
    assert_eq!(outside.read("one.txt"), "outside secret one\n");
    assert_eq!(outside.read("two.txt"), "outside secret two\n");
}

#[cfg(unix)]
#[tokio::test]
async fn executable_mode_changes_invalidate_the_snapshot() {
    use std::os::unix::fs::PermissionsExt;
    let repo = TestRepo::new("snapshot-mode");
    repo.commit("script.sh", "echo hello\n", "base");
    let old = snapshot(&repo, "script.sh", false).await;
    std::fs::set_permissions(
        repo.path.join("script.sh"),
        std::fs::Permissions::from_mode(0o755),
    )
    .unwrap();
    assert_eq!(
        git::git_discard_worktree_changes(
            repo.s(),
            vec!["script.sh".into()],
            vec![false],
            Some(vec![old])
        )
        .await
        .unwrap_err(),
        "__FILE_CHANGED__|script.sh"
    );
    assert_eq!(
        std::fs::metadata(repo.path.join("script.sh"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o755
    );
}

#[cfg(unix)]
#[tokio::test]
async fn special_filenames_are_literal_and_editor_paths_preserve_whitespace() {
    let repo = TestRepo::new("snapshot-path");
    let file = " spaced\tpart\nname ";
    repo.commit(file, "base\n", "base");
    repo.commit("glob*.txt", "literal base\n", "literal base");
    repo.commit("globX.txt", "neighbor base\n", "neighbor base");
    git::repo_write_file(repo.s(), file.into(), "exact edits\n".into())
        .await
        .unwrap();
    assert_eq!(
        git::repo_read_file(repo.s(), file.into()).await.unwrap(),
        "exact edits\n"
    );
    let token = snapshot(&repo, file, false).await;
    git::git_discard_worktree_changes(repo.s(), vec![file.into()], vec![false], Some(vec![token]))
        .await
        .unwrap();
    assert_eq!(repo.read(file), "base\n");
    repo.write("glob*.txt", "literal edits\n");
    repo.write("globX.txt", "neighbor edits\n");
    let preview = json(
        &git::repo_file_diff(repo.s(), "glob*.txt".into(), false, Some(true))
            .await
            .unwrap(),
    );
    assert!(preview["unstaged"]
        .as_str()
        .unwrap()
        .contains("literal edits"));
    assert!(!preview["unstaged"]
        .as_str()
        .unwrap()
        .contains("neighbor edits"));
    let token = preview["fingerprint"].as_str().unwrap().to_string();
    git::git_discard_worktree_changes(
        repo.s(),
        vec!["glob*.txt".into()],
        vec![false],
        Some(vec![token]),
    )
    .await
    .unwrap();
    assert_eq!(repo.read("glob*.txt"), "literal base\n");
    assert_eq!(repo.read("globX.txt"), "neighbor edits\n");
    for bad in ["../outside", ".git/config", ""] {
        assert!(git::repo_file_diff(repo.s(), bad.into(), true, Some(true))
            .await
            .is_err());
        assert!(git::repo_write_file(repo.s(), bad.into(), "bad".into())
            .await
            .is_err());
    }
}
