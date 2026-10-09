mod common;

use common::{json, TestRepo};
use l8git_lib::git;

async fn fingerprint(repo: &TestRepo, file: &str, untracked: bool) -> String {
    json(
        &git::repo_file_diff(repo.s(), file.into(), untracked, Some(true))
            .await
            .unwrap(),
    )["fingerprint"]
        .as_str()
        .unwrap()
        .to_string()
}

async fn apply(
    repo: &TestRepo,
    file: &str,
    action: &str,
    patches: Vec<String>,
    fingerprint: String,
) -> Result<(), String> {
    git::git_apply_reviewed_hunks(repo.s(), file.into(), action.into(), patches, fingerprint).await
}

fn hunks(diff: &str) -> Vec<String> {
    let mut headers = String::new();
    let mut body = String::new();
    let mut result = Vec::new();
    for line in diff.split_inclusive('\n') {
        if line.starts_with("@@ ") {
            if !body.is_empty() {
                result.push(format!("{headers}{body}"));
                body.clear();
            }
        }
        if !body.is_empty() || line.starts_with("@@ ") {
            body.push_str(line);
        } else if !line.starts_with("index ")
            && !line.starts_with("old mode ")
            && !line.starts_with("new mode ")
        {
            headers.push_str(line);
        }
    }
    if !body.is_empty() {
        result.push(format!("{headers}{body}"));
    }
    result
}

fn reverse_tracked(patch: &str) -> String {
    patch
        .split_inclusive('\n')
        .map(|line| {
            if let Some(ranges) = line.strip_prefix("@@ -") {
                let (old, rest) = ranges.split_once(" +").unwrap();
                let (new, suffix) = rest.split_once(" @@").unwrap();
                format!("@@ -{new} +{old} @@{suffix}")
            } else if line.starts_with('+') && !line.starts_with("+++ ") {
                format!("-{}", &line[1..])
            } else if line.starts_with('-') && !line.starts_with("--- ") {
                format!("+{}", &line[1..])
            } else {
                line.to_string()
            }
        })
        .collect()
}

fn base_lines() -> String {
    (1..=50).map(|line| format!("line {line}\n")).collect()
}

fn edits(base: &str) -> String {
    base.replace("line 2\n", "line 2\nselected first\nselected extra\n")
        .replace("line 25\n", "unselected middle\n")
        .replace("line 45\n", "selected last\n")
}

fn selected_edits(base: &str) -> String {
    base.replace("line 2\n", "line 2\nselected first\nselected extra\n")
        .replace("line 45\n", "selected last\n")
}

fn selected_patches(repo: &TestRepo, staged: bool) -> Vec<String> {
    let mut arguments = vec!["diff", "--no-ext-diff", "--no-color", "--no-renames"];
    if staged {
        arguments.push("--cached");
    }
    arguments.extend(["--", "selected.txt"]);
    let patches = hunks(&repo.git_out(&arguments));
    assert_eq!(patches.len(), 3);
    vec![patches[0].clone(), patches[2].clone()]
}

fn prepared(tag: &str) -> TestRepo {
    let repo = TestRepo::new(tag);
    repo.write("selected.txt", &base_lines());
    repo.write("neighbor.txt", "neighbor\n");
    repo.commit_all("base");
    repo.write("selected.txt", &edits(&base_lines()));
    repo
}

fn assert_neighbor(repo: &TestRepo) {
    assert_eq!(repo.read("neighbor.txt"), "neighbor\n");
    assert_eq!(repo.git_out(&["show", ":neighbor.txt"]), "neighbor\n");
}

#[tokio::test]
async fn stages_two_sections_once_without_staging_unselected_content() {
    let repo = prepared("reviewed-stage-batch");
    let patches = selected_patches(&repo, false);
    let token = fingerprint(&repo, "selected.txt", false).await;
    apply(&repo, "selected.txt", "stage", patches, token)
        .await
        .unwrap();
    assert_eq!(
        repo.git_out(&["show", ":selected.txt"]),
        selected_edits(&base_lines())
    );
    assert_eq!(repo.read("selected.txt"), edits(&base_lines()));
    assert_neighbor(&repo);
}

#[tokio::test]
async fn unstages_two_sections_once_and_keeps_unselected_index_and_worktree_content() {
    let repo = prepared("reviewed-unstage-batch");
    repo.git(&["add", "--", "selected.txt"]);
    repo.write(
        "selected.txt",
        &format!("{}local only\n", edits(&base_lines())),
    );
    let patches = selected_patches(&repo, true);
    let token = fingerprint(&repo, "selected.txt", false).await;
    apply(&repo, "selected.txt", "unstage", patches, token)
        .await
        .unwrap();
    assert_eq!(
        repo.git_out(&["show", ":selected.txt"]),
        base_lines().replace("line 25\n", "unselected middle\n")
    );
    assert_eq!(
        repo.read("selected.txt"),
        format!("{}local only\n", edits(&base_lines()))
    );
    assert_neighbor(&repo);
}

#[tokio::test]
async fn discards_two_forward_sections_once_while_preserving_the_index() {
    let repo = prepared("reviewed-discard-batch");
    let patches = selected_patches(&repo, false)
        .iter()
        .map(|patch| reverse_tracked(patch))
        .collect();
    let token = fingerprint(&repo, "selected.txt", false).await;
    apply(&repo, "selected.txt", "discard", patches, token)
        .await
        .unwrap();
    assert_eq!(
        repo.read("selected.txt"),
        base_lines().replace("line 25\n", "unselected middle\n")
    );
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
    assert_neighbor(&repo);
}

#[tokio::test]
async fn an_invalid_last_hunk_leaves_the_entire_index_and_worktree_unchanged() {
    for action in ["stage", "unstage", "discard"] {
        let repo = prepared("reviewed-invalid-later");
        if action == "unstage" {
            repo.git(&["add", "--", "selected.txt"]);
        }
        let mut patches = selected_patches(&repo, action == "unstage");
        if action == "discard" {
            patches = patches.iter().map(|patch| reverse_tracked(patch)).collect();
        }
        patches[1] = "diff --git a/selected.txt b/selected.txt\n--- a/selected.txt\n+++ b/selected.txt\n@@ -999 +999 @@\n-not present\n+invalid\n".into();
        let before_index = repo.git_out(&["show", ":selected.txt"]);
        let before_worktree = repo.read("selected.txt");
        let token = fingerprint(&repo, "selected.txt", false).await;
        assert!(apply(&repo, "selected.txt", action, patches, token)
            .await
            .is_err());
        assert_eq!(repo.git_out(&["show", ":selected.txt"]), before_index);
        assert_eq!(repo.read("selected.txt"), before_worktree);
        assert_neighbor(&repo);
    }
}

#[tokio::test]
async fn changed_worktree_bytes_reject_the_displayed_token_before_staging() {
    let repo = prepared("reviewed-stale-bytes");
    let patches = selected_patches(&repo, false);
    let token = fingerprint(&repo, "selected.txt", false).await;
    let newer = edits(&base_lines()).replace("selected last", "selected next");
    repo.write("selected.txt", &newer);
    assert_eq!(
        apply(&repo, "selected.txt", "stage", patches, token)
            .await
            .unwrap_err(),
        "__FILE_CHANGED__|selected.txt"
    );
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
    assert_eq!(repo.read("selected.txt"), newer);
}

#[tokio::test]
async fn changed_index_with_identical_worktree_bytes_rejects_the_displayed_token() {
    let repo = prepared("reviewed-stale-index");
    let patches = selected_patches(&repo, false);
    let token = fingerprint(&repo, "selected.txt", false).await;
    repo.write("selected.txt", "other index\n");
    repo.git(&["add", "--", "selected.txt"]);
    repo.write("selected.txt", &edits(&base_lines()));
    assert_eq!(
        apply(&repo, "selected.txt", "stage", patches, token)
            .await
            .unwrap_err(),
        "__FILE_CHANGED__|selected.txt"
    );
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), "other index\n");
    assert_eq!(repo.read("selected.txt"), edits(&base_lines()));
}

#[tokio::test]
async fn changed_source_tree_rejects_unstage_even_with_the_same_index_and_worktree() {
    let repo = prepared("reviewed-stale-head");
    let old_blob = repo.rev("HEAD:selected.txt");
    let patches = selected_patches(&repo, false);
    let token = fingerprint(&repo, "selected.txt", false).await;
    repo.commit("selected.txt", "new source\n", "changed source");
    repo.git(&[
        "update-index",
        "--cacheinfo",
        "100644",
        &old_blob,
        "selected.txt",
    ]);
    repo.write("selected.txt", &edits(&base_lines()));
    assert_eq!(
        apply(&repo, "selected.txt", "unstage", patches, token)
            .await
            .unwrap_err(),
        "__FILE_CHANGED__|selected.txt"
    );
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
}

#[tokio::test]
async fn changing_index_flags_invalidates_the_token_without_changing_file_bytes() {
    for flag in ["--assume-unchanged", "--skip-worktree"] {
        let repo = prepared("reviewed-stale-index-flags");
        let patches = selected_patches(&repo, false);
        let token = fingerprint(&repo, "selected.txt", false).await;
        repo.git(&["update-index", flag, "--", "selected.txt"]);
        let fresh = fingerprint(&repo, "selected.txt", false).await;
        assert_ne!(token, fresh, "flag {flag}");
        assert_eq!(
            apply(&repo, "selected.txt", "stage", patches, token)
                .await
                .unwrap_err(),
            "__FILE_CHANGED__|selected.txt"
        );
        assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
        assert_eq!(repo.read("selected.txt"), edits(&base_lines()));
    }
}

#[tokio::test]
async fn implicit_rename_sources_and_later_other_file_sections_are_rejected() {
    for patch in [
        "diff --git a/neighbor.txt b/selected.txt\n--- a/neighbor.txt\n+++ b/selected.txt\n@@ -1 +1 @@\n-neighbor\n+changed\n",
        "diff --git a/selected.txt b/selected.txt\n--- a/neighbor.txt\n+++ b/selected.txt\n@@ -1 +1 @@\n-neighbor\n+changed\n",
        "diff --git a/neighbor.txt b/neighbor.txt\n--- a/neighbor.txt\n+++ b/neighbor.txt\n@@ -1 +1 @@\n-neighbor\n+changed\n",
    ] {
        let repo = prepared("reviewed-path-batch");
        let mut patches = selected_patches(&repo, false);
        patches.push(patch.into());
        let token = fingerprint(&repo, "selected.txt", false).await;
        assert!(apply(&repo, "selected.txt", "stage", patches, token).await.unwrap_err().starts_with("__INVALID_REVIEWED_PATCH__|"));
        assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
        assert_eq!(repo.read("selected.txt"), edits(&base_lines()));
        assert_neighbor(&repo);
    }
}

#[tokio::test]
async fn mode_rename_copy_and_binary_metadata_do_not_mutate_the_selection() {
    for metadata in [
        "old mode 100644\nnew mode 100755\n",
        "rename from selected.txt\nrename to neighbor.txt\n",
        "copy from selected.txt\ncopy to neighbor.txt\n",
        "index 1111111..2222222 120000\n",
        "GIT binary patch\nliteral 4\nabc\n",
    ] {
        let repo = prepared("reviewed-metadata");
        let mut patches = selected_patches(&repo, false);
        patches[0] = patches[0].replacen(
            "--- a/selected.txt\n",
            &format!("{metadata}--- a/selected.txt\n"),
            1,
        );
        let token = fingerprint(&repo, "selected.txt", false).await;
        assert!(apply(&repo, "selected.txt", "stage", patches, token)
            .await
            .unwrap_err()
            .starts_with("__INVALID_REVIEWED_PATCH__|"));
        assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
        assert_neighbor(&repo);
    }
}

#[tokio::test]
async fn repeated_creation_sections_cannot_silently_replace_earlier_selected_lines() {
    let repo = TestRepo::new("reviewed-repeat-create");
    repo.commit("neighbor.txt", "neighbor\n", "base");
    repo.write("selected.txt", "first\nsecond\n");
    let patches = ["first", "second"].iter().map(|line| format!("diff --git a/selected.txt b/selected.txt\nnew file mode 100644\n--- /dev/null\n+++ b/selected.txt\n@@ -0,0 +1 @@\n+{line}\n")).collect();
    let token = fingerprint(&repo, "selected.txt", true).await;
    assert!(apply(&repo, "selected.txt", "stage", patches, token)
        .await
        .unwrap_err()
        .starts_with("__INVALID_REVIEWED_PATCH__|"));
    assert!(!repo.try_git(&["show", ":selected.txt"]).0);
    assert_eq!(repo.read("selected.txt"), "first\nsecond\n");
    assert_neighbor(&repo);
}

#[tokio::test]
async fn repeated_deletion_sections_are_rejected_before_any_index_write() {
    let repo = TestRepo::new("reviewed-repeat-delete");
    repo.commit("selected.txt", "first\n", "base");
    std::fs::remove_file(repo.path.join("selected.txt")).unwrap();
    let patch = "diff --git a/selected.txt b/selected.txt\ndeleted file mode 100644\n--- a/selected.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-first\n".to_string();
    let token = fingerprint(&repo, "selected.txt", false).await;
    assert!(apply(
        &repo,
        "selected.txt",
        "stage",
        vec![patch.clone(), patch],
        token
    )
    .await
    .unwrap_err()
    .starts_with("__INVALID_REVIEWED_PATCH__|"));
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), "first\n");
    assert!(!repo.exists("selected.txt"));
}

#[tokio::test]
async fn one_creation_section_can_stage_part_of_a_new_file() {
    let repo = TestRepo::new("reviewed-partial-create");
    repo.commit("neighbor.txt", "neighbor\n", "base");
    repo.write("selected.txt", "first\nsecond\n");
    let patch = "diff --git a/selected.txt b/selected.txt\nnew file mode 100644\n--- /dev/null\n+++ b/selected.txt\n@@ -0,0 +1 @@\n+first\n".into();
    let token = fingerprint(&repo, "selected.txt", true).await;
    apply(&repo, "selected.txt", "stage", vec![patch], token)
        .await
        .unwrap();
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), "first\n");
    assert_eq!(repo.read("selected.txt"), "first\nsecond\n");
    assert_neighbor(&repo);
}

#[tokio::test]
async fn deleted_files_can_be_partly_restored_with_a_forward_discard_patch() {
    let repo = TestRepo::new("reviewed-partial-restore");
    repo.commit("selected.txt", "first\nsecond\n", "base");
    std::fs::remove_file(repo.path.join("selected.txt")).unwrap();
    let patch = "diff --git a/selected.txt b/selected.txt\nnew file mode 100644\n--- /dev/null\n+++ b/selected.txt\n@@ -0,0 +1 @@\n+first\n".into();
    let token = fingerprint(&repo, "selected.txt", false).await;
    apply(&repo, "selected.txt", "discard", vec![patch], token)
        .await
        .unwrap();
    assert_eq!(repo.read("selected.txt"), "first\n");
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), "first\nsecond\n");
}

#[tokio::test]
async fn crlf_eof_markers_and_header_like_payload_are_preserved() {
    let repo = TestRepo::new("reviewed-payload");
    repo.commit("selected.txt", "-- /dev/null\r\nold\r\nend", "base");
    let working = "++ /dev/null\r\nnew\r\nend";
    repo.write("selected.txt", working);
    let patches = hunks(&repo.git_out(&["diff", "--no-color", "--", "selected.txt"]));
    let token = fingerprint(&repo, "selected.txt", false).await;
    apply(&repo, "selected.txt", "stage", patches, token)
        .await
        .unwrap();
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), working);
    assert_eq!(repo.read("selected.txt"), working);
}

#[tokio::test]
async fn empty_missing_or_oversized_patch_requests_never_write_the_index() {
    let repo = prepared("reviewed-limits");
    let patches = selected_patches(&repo, false);
    for invalid in [
        Vec::new(),
        vec![
            "diff --git a/selected.txt b/selected.txt\n--- a/selected.txt\n+++ b/selected.txt\n"
                .into(),
        ],
        vec![patches[0].clone(); 1_025],
        vec!["x".repeat(1_048_577)],
    ] {
        let token = fingerprint(&repo, "selected.txt", false).await;
        assert!(apply(&repo, "selected.txt", "stage", invalid, token)
            .await
            .unwrap_err()
            .starts_with("__INVALID_REVIEWED_PATCH__|"));
        assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
    }
    for (action, token) in [
        ("stage", "".to_string()),
        ("invalid", fingerprint(&repo, "selected.txt", false).await),
    ] {
        assert!(apply(&repo, "selected.txt", action, patches.clone(), token)
            .await
            .is_err());
        assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
    }
}

#[cfg(unix)]
#[tokio::test]
async fn quoted_literal_files_and_raw_repository_roots_do_not_touch_a_neighbor() {
    for suffix in [" ", "\n"] {
        let neighbor = TestRepo::new("reviewed-exact-root");
        neighbor.commit("neighbor.txt", "neighbor\n", "base");
        let exact_path = std::path::PathBuf::from(format!("{}{suffix}", neighbor.s()));
        std::fs::create_dir_all(&exact_path).unwrap();
        let (ok, output) = common::git_raw(
            &exact_path,
            &["-c", "init.defaultBranch=main", "init", "-q", "."],
        );
        assert!(ok, "{output}");
        let exact = TestRepo::adopt(exact_path);
        let file = "space\tquote\"\\glob[1]\n.txt ";
        exact.commit(file, "old\n", "base");
        exact.write(file, "new\n");
        let patches =
            hunks(&exact.git_out(&["--literal-pathspecs", "diff", "--no-color", "--", file]));
        let token = fingerprint(&exact, file, false).await;
        apply(&exact, file, "stage", patches, token).await.unwrap();
        assert_eq!(exact.git_out(&["show", &format!(":{file}")]), "new\n");
        assert_eq!(neighbor.read("neighbor.txt"), "neighbor\n");
        assert!(neighbor.git(&["status", "--porcelain"]).is_empty());
    }
}

#[cfg(unix)]
#[tokio::test]
async fn line_actions_preserve_the_unselected_git_executable_mode() {
    use std::os::unix::fs::PermissionsExt;
    for (action, filemode) in [("stage", "true"), ("discard", "true"), ("discard", "false")] {
        let repo = prepared("reviewed-mode");
        repo.git(&["config", "core.filemode", filemode]);
        std::fs::set_permissions(
            repo.path.join("selected.txt"),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        let mut patches = selected_patches(&repo, false);
        if action == "discard" {
            patches = patches.iter().map(|patch| reverse_tracked(patch)).collect();
        }
        let token = fingerprint(&repo, "selected.txt", false).await;
        apply(&repo, "selected.txt", action, patches, token)
            .await
            .unwrap();
        assert!(repo
            .git(&["ls-files", "--stage", "--", "selected.txt"])
            .starts_with("100644 "));
        assert_eq!(
            std::fs::metadata(repo.path.join("selected.txt"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0o111
        );
    }
}

#[cfg(unix)]
#[tokio::test]
async fn creating_and_restoring_files_preserves_the_displayed_executable_mode() {
    use std::os::unix::fs::PermissionsExt;
    let repo = TestRepo::new("reviewed-created-mode");
    repo.commit("neighbor.txt", "neighbor\n", "base");
    repo.write("selected.txt", "first\nsecond\n");
    std::fs::set_permissions(
        repo.path.join("selected.txt"),
        std::fs::Permissions::from_mode(0o755),
    )
    .unwrap();
    let patch = "diff --git a/selected.txt b/selected.txt\nnew file mode 100755\n--- /dev/null\n+++ b/selected.txt\n@@ -0,0 +1 @@\n+first\n".to_string();
    let token = fingerprint(&repo, "selected.txt", true).await;
    apply(&repo, "selected.txt", "stage", vec![patch.clone()], token)
        .await
        .unwrap();
    assert!(repo
        .git(&["ls-files", "--stage", "--", "selected.txt"])
        .starts_with("100755 "));
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), "first\n");
    std::fs::remove_file(repo.path.join("selected.txt")).unwrap();
    let token = fingerprint(&repo, "selected.txt", false).await;
    apply(&repo, "selected.txt", "discard", vec![patch], token)
        .await
        .unwrap();
    assert_eq!(repo.read("selected.txt"), "first\n");
    assert_eq!(
        std::fs::metadata(repo.path.join("selected.txt"))
            .unwrap()
            .permissions()
            .mode()
            & 0o111,
        0o111
    );
    assert_neighbor(&repo);
}

#[cfg(unix)]
#[tokio::test]
async fn non_utf8_patch_paths_cannot_alias_a_utf8_selected_filename() {
    use std::os::unix::ffi::OsStrExt;
    let repo = TestRepo::new("reviewed-non-utf8-path");
    let file = "\u{fffd}.txt";
    repo.write(file, "selected\n");
    let other = repo.path.join(std::ffi::OsStr::from_bytes(b"\xff.txt"));
    std::fs::write(&other, "other\n").unwrap();
    repo.commit_all("base");
    let patch = format!("diff --git \"a/\\377.txt\" b/{file}\n--- \"a/\\377.txt\"\n+++ b/{file}\n@@ -1 +1 @@\n-other\n+changed\n");
    let token = fingerprint(&repo, file, false).await;
    assert!(apply(&repo, file, "discard", vec![patch], token)
        .await
        .unwrap_err()
        .starts_with("__INVALID_REVIEWED_PATCH__|"));
    assert_eq!(repo.read(file), "selected\n");
    assert_eq!(std::fs::read_to_string(&other).unwrap(), "other\n");
}

#[cfg(unix)]
#[tokio::test]
async fn symlink_leaves_and_parents_cannot_redirect_a_reviewed_patch() {
    use std::os::unix::fs::symlink;
    let outside = TestRepo::new("reviewed-outside");
    outside.commit("victim.txt", "outside\n", "outside");
    let repo = prepared("reviewed-symlink");
    let token = fingerprint(&repo, "selected.txt", false).await;
    let patches = selected_patches(&repo, false);
    std::fs::remove_file(repo.path.join("selected.txt")).unwrap();
    symlink(
        outside.path.join("victim.txt"),
        repo.path.join("selected.txt"),
    )
    .unwrap();
    assert!(
        apply(&repo, "selected.txt", "discard", patches.clone(), token)
            .await
            .is_err()
    );
    symlink(&outside.path, repo.path.join("linked")).unwrap();
    assert!(apply(
        &repo,
        "linked/victim.txt",
        "discard",
        patches.clone(),
        "arbitrary".into()
    )
    .await
    .is_err());
    assert!(apply(
        &repo,
        "../victim.txt",
        "discard",
        patches.clone(),
        "arbitrary".into()
    )
    .await
    .is_err());
    assert!(
        apply(&repo, ".git/config", "discard", patches, "arbitrary".into())
            .await
            .is_err()
    );
    assert_eq!(outside.read("victim.txt"), "outside\n");
    assert_eq!(repo.git_out(&["show", ":selected.txt"]), base_lines());
}
