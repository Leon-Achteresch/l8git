mod common;

use common::TestRepo;
use l8git_lib::git;

// Windows forbids trailing spaces and `*` in file names; keep a leading space
// and a glob-like name there so the literal-path checks still apply.
#[cfg(not(windows))]
const SPACED: &str = " a.txt ";
#[cfg(windows)]
const SPACED: &str = " a b.txt";
#[cfg(not(windows))]
const GLOB: &str = "literal*name.txt";
#[cfg(not(windows))]
const GLOB_DECOY: &str = "literalXname.txt";
#[cfg(windows)]
const GLOB: &str = "literal[n]ame.txt";
#[cfg(windows)]
const GLOB_DECOY: &str = "literalname.txt";

#[cfg(unix)]
#[tokio::test]
async fn content_revision_cannot_write_through_a_git_output_option() {
    let repo = TestRepo::new("content-no-write");
    let outside = TestRepo::new("content-no-write-outside");
    repo.commit("a.txt", "tracked fixture\n", "initial");
    let output_base = outside.path.join("read-api-output");
    let output_path = outside.path.join("read-api-output:a.txt");
    let result = git::repo_file_content_at(
        repo.s(),
        "a.txt".into(),
        format!("--output={}", output_base.display()),
    )
    .await;
    assert!(
        !output_path.exists(),
        "a read API wrote outside the selected repository"
    );
    assert!(result.is_err(), "an option was accepted as a revision");
}

#[tokio::test]
async fn blame_revision_cannot_read_an_external_contents_option() {
    let repo = TestRepo::new("blame-no-external");
    let outside = TestRepo::new("blame-no-external-outside");
    repo.commit("a.txt", "tracked fixture\n", "initial");
    outside.write("harmless.txt", "harmless external fixture content\n");
    assert!(git::repo_blame(
        repo.s(),
        "a.txt".into(),
        Some(format!(
            "--contents={}",
            outside.path.join("harmless.txt").display()
        ))
    )
    .await
    .is_err());
}

#[tokio::test]
async fn historical_and_index_content_preserve_exact_path_and_content() {
    let repo = TestRepo::new("content-exact");
    repo.commit("a.txt", "different file\n", "plain");
    let exact = "  significant content \n\n";
    repo.commit(SPACED, exact, "special");
    assert_eq!(
        git::repo_file_content_at(repo.s(), SPACED.into(), "HEAD".into())
            .await
            .unwrap(),
        exact
    );
    assert_eq!(
        git::repo_file_content_at(repo.s(), SPACED.into(), "".into())
            .await
            .unwrap(),
        exact
    );
    for revision in ["missing-ref", "HEAD\n", "--help", " "] {
        assert!(
            git::repo_file_content_at(repo.s(), "a.txt".into(), revision.into())
                .await
                .is_err()
        );
    }
    assert_eq!(
        git::repo_file_content_at(repo.s(), "missing.txt".into(), "HEAD".into())
            .await
            .unwrap(),
        ""
    );
    assert_eq!(
        git::repo_file_content_at(repo.s(), "missing.txt".into(), "".into())
            .await
            .unwrap(),
        ""
    );
}

#[cfg(unix)]
#[tokio::test]
async fn file_reads_and_listing_preserve_tab_newline_backslash_and_pathspec_names() {
    let repo = TestRepo::new("file-list-exact");
    let names = [
        " tab\tline\nfile ",
        "back\\slash.txt",
        "ä.txt",
        "literal*name.txt",
        ":(top)name.txt",
        "-option.txt",
    ];
    for name in names {
        repo.write(name, &format!("{name}\n"));
    }
    repo.commit_all("special paths");
    repo.write("literalXname.txt", "must not match the literal wildcard\n");
    repo.commit_all("different file");
    let actual = git::repo_list_files(repo.s()).await.unwrap();
    assert_eq!(actual.len(), names.len() + 1);
    for name in names {
        assert!(
            actual.contains(&name.into()),
            "missing literal path: {name:?}"
        );
        for revision in ["HEAD", ""] {
            assert_eq!(
                git::repo_file_content_at(repo.s(), name.into(), revision.into())
                    .await
                    .unwrap(),
                format!("{name}\n")
            );
        }
        assert_eq!(
            git::repo_read_file(repo.s(), name.into()).await.unwrap(),
            format!("{name}\n")
        );
    }
}

#[tokio::test]
async fn general_history_path_filter_retains_git_pathspecs() {
    let repo = TestRepo::new("history-pathspec");
    repo.commit("literal-name.txt", "first\n", "first matching path");
    repo.commit("literal-other.txt", "other\n", "second matching path");
    let filter = git::HistoryFilter {
        file: "literal-*.txt".into(),
        ..Default::default()
    };
    let actual = git::repo_history_page(repo.s(), filter, 0, 80)
        .await
        .unwrap();
    assert_eq!(actual.len(), 2);
}

#[tokio::test]
async fn path_history_omits_a_merge_that_the_regular_graph_retains() {
    let repo = TestRepo::new("path-merge");
    let root = repo.commit("docs/old.txt", "document\n", "Add document");
    repo.git(&["branch", "side"]);
    repo.git(&["mv", "docs/old.txt", "docs/topic.txt"]);
    let renamed = repo.commit_all("Rename document");
    repo.git(&["checkout", "side"]);
    let side = repo.commit("notes.txt", "unrelated\n", "Add side notes");
    repo.git(&["checkout", "main"]);
    repo.git(&["merge", "--no-ff", "-m", "Merge side work", "side"]);
    let merge = repo.head();
    let refs = repo.git(&["show-ref", "--head"]);

    let graph = common::json(&git::open_repo(repo.s(), None).await.unwrap());
    let merge_row = graph["commits"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["hash"] == merge)
        .unwrap();
    assert_eq!(merge_row["parents"], serde_json::json!([renamed, side]));
    assert_eq!(
        repo.git(&["diff", "--name-only", &renamed, &merge, "--", "docs/"]),
        ""
    );

    for (file, follows_file) in [
        ("docs/", false),
        (":(glob)docs/**", false),
        ("docs/topic.txt", true),
    ] {
        let rows = common::json(
            &git::repo_history_page(
                repo.s(),
                git::HistoryFilter {
                    file: file.into(),
                    ..Default::default()
                },
                0,
                80,
            )
            .await
            .unwrap(),
        );
        let rows = rows.as_array().unwrap();
        assert!(!rows.iter().any(|row| row["hash"] == merge), "{file}");
        let rename_row = rows.iter().find(|row| row["hash"] == renamed).unwrap();
        assert!(rows.iter().any(|row| row["hash"] == root), "{file}");
        if follows_file {
            assert_eq!(rename_row["path"], "docs/topic.txt");
            assert_eq!(rename_row["previous_path"], "docs/old.txt");
        } else {
            assert!(rename_row.get("previous_path").is_none(), "{file}");
        }
    }
    assert_eq!(repo.git(&["show-ref", "--head"]), refs);
    assert_eq!(repo.git(&["status", "--porcelain"]), "");
}

#[tokio::test]
async fn stash_and_commit_renames_return_the_original_path_and_exact_two_path_patch() {
    let repo = TestRepo::new("inspect-rename");
    let old = "before[1].txt";
    let new = "after[2].txt";
    let original = (0..80)
        .map(|n| format!("original line {n}\n"))
        .collect::<String>();
    repo.commit(old, &original, "before rename");
    repo.commit("after2.txt", "neighbor\n", "neighbor");
    repo.git(&["mv", "--", old, new]);
    repo.write(new, &original.replace("original line 5\n", "new text\n"));
    repo.write("after2.txt", "neighbor changed\n");
    repo.git(&["stash", "push", "-m", "move"]);
    let stash = repo.rev("stash@{0}");
    let entry = git::git_stash_show(repo.s(), 0, Some(stash.clone()))
        .await
        .unwrap()
        .files
        .into_iter()
        .find(|file| file.path == new)
        .unwrap();
    assert_eq!(entry.previous_path.as_deref(), Some(old));
    let diff = git::git_stash_file_diff(
        repo.s(),
        0,
        new.into(),
        Some(stash.clone()),
        entry.previous_path,
    )
    .await
    .unwrap()
    .diff
    .unwrap();
    let from_stash = repo.git_out(&[
        "--literal-pathspecs",
        "diff",
        "--find-renames",
        &format!("{stash}^1"),
        &stash,
        "--",
        old,
        new,
    ]);
    assert_eq!(diff, from_stash);
    assert!(
        diff.contains("rename from before[1].txt")
            && diff.contains("+new text")
            && !diff.contains("neighbor changed")
    );
    repo.git(&["stash", "pop", "--index"]);
    let commit = repo.commit_all("saved rename");
    let entry = git::repo_commit_inspect(repo.s(), commit.clone())
        .await
        .unwrap()
        .files
        .into_iter()
        .find(|file| file.path == new)
        .unwrap();
    assert_eq!(entry.previous_path.as_deref(), Some(old));
    let diff = git::repo_commit_file_diff(repo.s(), commit, new.into(), entry.previous_path)
        .await
        .unwrap()
        .diff
        .unwrap();
    assert_eq!(diff, from_stash);
}

#[tokio::test]
async fn selected_commit_diff_preserves_literal_path_and_reports_invalid_revisions() {
    let repo = TestRepo::new("commit-diff-literal");
    repo.commit(GLOB, "selected\n", "initial");
    repo.write(GLOB_DECOY, "unrelated\n");
    repo.write(GLOB, "selected changed\n");
    let commit = repo.commit_all("both paths");
    let actual = git::repo_commit_file_diff(repo.s(), commit, GLOB.into(), None)
        .await
        .unwrap()
        .diff
        .unwrap();
    assert!(actual.contains("+selected changed"));
    assert!(!actual.contains("+unrelated"));
    repo.commit(SPACED, "significant filename\n", "spaced path");
    let actual = git::repo_commit_file_diff(repo.s(), "HEAD".into(), SPACED.into(), None)
        .await
        .unwrap()
        .diff
        .unwrap();
    assert!(actual.contains("+significant filename"));
    assert!(
        git::repo_commit_file_diff(repo.s(), "missing-ref".into(), "a.txt".into(), None)
            .await
            .is_err()
    );
    let outside = TestRepo::new("commit-diff-no-write");
    let output = outside.path.join("read-output");
    assert!(git::repo_commit_file_diff(
        repo.s(),
        format!("--output={}", output.display()),
        "a.txt".into(),
        None,
    )
    .await
    .is_err());
    assert!(!output.exists());
}

#[tokio::test]
async fn index_conflicts_and_directories_are_not_missing_file_successes() {
    let repo = common::conflicting_repo("content-conflict");
    assert!(!repo.try_git(&["merge", "feature"]).0);
    assert!(
        git::repo_file_content_at(repo.s(), "shared.txt".into(), "".into())
            .await
            .unwrap_err()
            .contains("unmerged")
    );
    let repo = TestRepo::new("content-not-file");
    repo.commit("dir/a.txt", "nested\n", "initial");
    assert!(
        git::repo_file_content_at(repo.s(), "dir".into(), "HEAD".into())
            .await
            .is_err()
    );
    assert!(git::repo_file_content_at(repo.s(), "dir".into(), "".into())
        .await
        .is_err());
}

#[tokio::test]
async fn live_blame_preserves_tracked_and_uncommitted_lines() {
    let repo = TestRepo::new("live-blame-content");
    let commit = repo.commit(SPACED, "tracked\n", "initial");
    repo.write(SPACED, "tracked\nlive line\n");
    let actual = git::repo_blame(repo.s(), SPACED.into(), None)
        .await
        .unwrap();
    assert_eq!(actual.len(), 2);
    assert_eq!(actual[0].commit_hash, commit);
    assert_eq!(actual[1].content, "live line");
    assert!(actual[1].commit_hash.bytes().all(|byte| byte == b'0'));
    assert_eq!(actual[1].author, "Not Committed Yet");
}

#[tokio::test]
async fn content_and_blame_support_sha256_repositories() {
    let path = common::scratch_path("sha256-read");
    std::fs::create_dir_all(&path).unwrap();
    let (supported, message) =
        common::git_raw(&path, &["init", "-q", "--object-format=sha256", "."]);
    if !supported {
        std::fs::remove_dir_all(&path).unwrap();
        assert!(
            message.contains("unknown") || message.contains("unsupported"),
            "unexpected init failure: {message}"
        );
        return;
    }
    let repo = TestRepo::adopt(path);
    let hash = repo.commit("a.txt", "sha256 line\n", "initial");
    assert_eq!(hash.len(), 64);
    assert_eq!(
        git::repo_file_content_at(repo.s(), "a.txt".into(), "HEAD".into())
            .await
            .unwrap(),
        "sha256 line\n"
    );
    assert_eq!(
        git::repo_file_content_at(repo.s(), "a.txt".into(), "".into())
            .await
            .unwrap(),
        "sha256 line\n"
    );
    for revision in [None, Some("HEAD".into())] {
        let actual = git::repo_blame(repo.s(), "a.txt".into(), revision)
            .await
            .unwrap();
        assert_eq!(actual.len(), 1);
        assert_eq!(actual[0].commit_hash, hash);
    }
}

#[cfg(unix)]
#[tokio::test]
async fn live_reads_reject_symlinks_while_object_reads_ignore_live_parent_escapes() {
    use std::os::unix::fs::symlink;
    let repo = TestRepo::new("live-read-symlinks");
    let outside = TestRepo::new("live-read-symlinks-outside");
    outside.write("a.txt", "external fixture must not be read\n");
    repo.commit("dir/a.txt", "historical fixture\n", "initial");
    std::fs::remove_dir_all(repo.path.join("dir")).unwrap();
    symlink(&outside.path, repo.path.join("dir")).unwrap();
    symlink(outside.path.join("a.txt"), repo.path.join("link.txt")).unwrap();
    symlink(
        outside.path.join("missing.txt"),
        repo.path.join("dangling.txt"),
    )
    .unwrap();
    symlink(repo.path.join(".git"), repo.path.join("metadata")).unwrap();
    for file in ["dir/a.txt", "link.txt", "dangling.txt", "metadata/config"] {
        assert!(git::repo_read_file(repo.s(), file.into()).await.is_err());
    }
    assert!(git::repo_blame(repo.s(), "dir/a.txt".into(), None)
        .await
        .is_err());
    assert_eq!(
        git::repo_file_content_at(repo.s(), "dir/a.txt".into(), "HEAD".into())
            .await
            .unwrap(),
        "historical fixture\n"
    );
    let blame = git::repo_blame(repo.s(), "dir/a.txt".into(), Some("HEAD".into()))
        .await
        .unwrap();
    assert_eq!(blame[0].content, "historical fixture");
}

#[cfg(unix)]
#[tokio::test]
async fn live_blame_and_untracked_preview_read_symlink_text_without_following_it() {
    use std::os::unix::fs::symlink;
    let repo = TestRepo::new("symlink-text");
    let outside = TestRepo::new("symlink-text-outside");
    outside.write("a.txt", "external fixture must not be read\n");
    let target = outside.path.join("a.txt");
    symlink(&target, repo.path.join("link.txt")).unwrap();
    repo.commit_all("link");
    let actual = git::repo_blame(repo.s(), "link.txt".into(), None)
        .await
        .unwrap();
    assert_eq!(actual.len(), 1);
    assert_eq!(actual[0].content, target.to_string_lossy());
    symlink(&target, repo.path.join("untracked.txt")).unwrap();
    let preview = git::repo_file_diff(repo.s(), "untracked.txt".into(), true, None)
        .await
        .unwrap();
    let preview = serde_json::to_value(preview).unwrap();
    assert_eq!(
        preview["untracked_plain"],
        target.to_string_lossy().as_ref()
    );
    let bounded = git::repo_untracked_file_preview(repo.s(), "untracked.txt".into()).await.unwrap();
    assert_eq!(serde_json::to_value(bounded).unwrap()["text"], target.to_string_lossy().as_ref());
}

#[cfg(unix)]
#[tokio::test]
async fn live_reads_reject_fifos_without_blocking() {
    use std::os::unix::ffi::OsStrExt;
    let repo = TestRepo::new("live-read-fifo");
    let file = std::ffi::CString::new(repo.path.join("pipe.txt").as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(file.as_ptr(), 0o600) }, 0);
    assert!(git::repo_read_file(repo.s(), "pipe.txt".into())
        .await
        .is_err());
}

#[tokio::test]
async fn lightweight_status_matches_file_and_rename_metadata_in_full_status() {
    let repo = TestRepo::new("status-paths");
    repo.commit("old[1].txt", "original\n", "base file");
    repo.commit(".gitignore", "ignored.txt\n", "ignore generated file");
    repo.git(&["mv", "--", "old[1].txt", "new[1].txt"]);
    repo.write("new[1].txt", "also changed in worktree\n");
    repo.write(SPACED, "untracked\n");
    repo.write("ignored.txt", "outside the view\n");
    let compact = serde_json::to_value(git::repo_status_paths(repo.s()).await.unwrap()).unwrap();
    let full = serde_json::to_value(git::repo_status(repo.s()).await.unwrap()).unwrap();
    let compact = compact.as_array().unwrap();
    assert_eq!(compact.len(), 2);
    for (entry, complete) in compact.iter().zip(full.as_array().unwrap()) {
        for field in ["path", "previous_path", "index_status", "worktree_status", "untracked"] {
            assert_eq!(entry.get(field), complete.get(field), "{field}");
        }
        assert!(entry.get("additions_staged").is_none());
    }
    let rename = compact.iter().find(|entry| entry["path"] == "new[1].txt").unwrap();
    assert_eq!(rename["previous_path"], "old[1].txt");
    assert_eq!(rename["index_status"], "R");
    assert_eq!(rename["worktree_status"], "M");
}
