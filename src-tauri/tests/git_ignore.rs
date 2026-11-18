mod common;

use common::TestRepo;
use l8git_lib::git::{git_check_ignore, IgnoreExplanation};
use std::{collections::BTreeMap, fs, path::Path};

fn repo(tag: &str) -> TestRepo {
    let repo = TestRepo::new(tag);
    repo.write(".git/test-excludes", "");
    repo.git(&["config", "core.excludesFile", ".git/test-excludes"]);
    repo
}

async fn check(repo: &TestRepo, file: &str) -> IgnoreExplanation {
    git_check_ignore(repo.s(), file.into()).await.unwrap()
}

fn snapshot(root: &Path) -> BTreeMap<std::path::PathBuf, Vec<u8>> {
    fn walk(root: &Path, dir: &Path, entries: &mut BTreeMap<std::path::PathBuf, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_dir() {
                walk(root, &entry.path(), entries);
            } else {
                entries.insert(
                    entry.path().strip_prefix(root).unwrap().to_owned(),
                    fs::read(entry.path()).unwrap(),
                );
            }
        }
    }
    let mut entries = BTreeMap::new();
    walk(root, root, &mut entries);
    entries
}

#[tokio::test]
async fn local_nested_info_and_configured_global_sources_are_reported_without_writes() {
    let repo = repo("ignore-sources");
    repo.commit("tracked.log", "tracked", "base");
    repo.write(
        ".gitignore",
        "# rules\n*.log\n!keep.log\nbuild/\n\\!literal\n",
    );
    repo.write("nested/.gitignore", "# nested\n*.tmp\n");
    repo.write(".git/info/exclude", "# local\nprivate\n");
    repo.write(".git/test-excludes", "# global\n*.secret\n");
    let before = snapshot(&repo.path);
    for (file, source, line, pattern) in [
        ("missing.log", ".gitignore", 2, "*.log"),
        ("build/not-created.txt", ".gitignore", 4, "build/"),
        ("nested/file.tmp", "nested/.gitignore", 2, "*.tmp"),
        ("private", ".git/info/exclude", 2, "private"),
        ("token.secret", ".git/test-excludes", 2, "*.secret"),
        ("!literal", ".gitignore", 5, "\\!literal"),
    ] {
        let result = check(&repo, file).await;
        assert!(result.ignored, "{result:?}");
        assert_eq!(result.file, file);
        let rule = result.rule.unwrap();
        assert_eq!(
            (rule.source.as_str(), rule.line, rule.pattern.as_str()),
            (source, line, pattern)
        );
    }
    let keep = check(&repo, "keep.log").await;
    assert!(!keep.ignored);
    assert_eq!(keep.rule.unwrap().pattern, "!keep.log");
    for file in ["tracked.log", "no-match", "nested/no-match"] {
        let result = check(&repo, file).await;
        assert!(!result.ignored);
        assert!(result.rule.is_none());
    }
    assert_eq!(
        snapshot(&repo.path),
        before,
        "diagnosis changed repo files/index/refs/rules"
    );
}

#[tokio::test]
async fn literal_whitespace_unicode_dash_and_pathspec_characters_survive_nul_transport() {
    let repo = repo("ignore-literal");
    // A broad rule avoids interpreting the supplied filename as a rule or pathspec.
    repo.write(".gitignore", "*\n");
    for file in [
        " leading space ",
        "ümlaut 日本語.txt",
        "--help",
        "-n",
        ":(glob)*.log",
        "[abc]?.log",
        "./relative",
        "folder/",
    ] {
        let result = check(&repo, file).await;
        assert_eq!(result.file, file);
        assert!(result.ignored);
        assert_eq!(result.rule.unwrap().pattern, "*");
    }
    #[cfg(unix)]
    for file in [
        "a\nb.txt",
        "a\tb.txt",
        "quote\"colon:.txt",
        "back\\slash.txt",
    ] {
        let result = check(&repo, file).await;
        assert_eq!(result.file, file);
        assert!(result.ignored);
    }
    repo.write("odd name/.gitignore", "\n*.tmp\n");
    repo.write(".gitignore", "");
    let result = check(&repo, "odd name/a.tmp").await;
    assert_eq!(result.rule.unwrap().source, "odd name/.gitignore");
    // A selected subdirectory still accepts paths relative to the worktree root.
    let result = git_check_ignore(
        repo.path.join("odd name").to_string_lossy().into_owned(),
        "odd name/a.tmp".into(),
    )
    .await
    .unwrap();
    assert!(result.ignored);
    #[cfg(unix)]
    {
        let source = repo.path.join(".git/global\nRegeln:\t ");
        fs::write(&source, "# header\n*.global\n").unwrap();
        repo.git(&["config", "core.excludesFile", source.to_str().unwrap()]);
        let rule = check(&repo, "file.global").await.rule.unwrap();
        assert_eq!(rule.source, source.to_str().unwrap());
        assert_eq!(rule.line, 2);
        assert_eq!(rule.pattern, "*.global");
    }
}

#[tokio::test]
async fn unsafe_paths_and_git_errors_never_become_no_match() {
    let repo = repo("ignore-errors");
    for file in [
        "",
        ".",
        "..",
        "../outside",
        "dir/../../outside",
        "/tmp/outside",
        "a\0b",
        ".git/config",
        "nested/.GIT/config",
    ] {
        assert!(
            git_check_ignore(repo.s(), file.into()).await.is_err(),
            "{file:?}"
        );
    }
    assert!(git_check_ignore(repo.s(), "x".repeat(16_385))
        .await
        .is_err());
    let plain = repo.path.join("not-a-repo");
    fs::create_dir(&plain).unwrap();
    // Prevent Git's normal parent discovery by removing the fixture's metadata.
    fs::remove_dir_all(repo.path.join(".git")).unwrap();
    assert!(
        git_check_ignore(plain.to_string_lossy().into_owned(), "file".into())
            .await
            .is_err()
    );
    let missing = repo.path.join("gone");
    assert!(
        git_check_ignore(missing.to_string_lossy().into_owned(), "file".into())
            .await
            .is_err()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn symlinks_and_child_repositories_are_not_misdiagnosed() {
    use std::os::unix::fs::symlink;
    let repo = repo("ignore-links");
    let outside = TestRepo::new("ignore-outside");
    symlink(&outside.path, repo.path.join("escape")).unwrap();
    assert!(git_check_ignore(repo.s(), "escape/private".into())
        .await
        .is_err());
    repo.write(".gitignore", "escape\n");
    assert!(check(&repo, "escape").await.ignored);
    repo.git(&["init", "-q", "child"]);
    let embedded = check(&repo, "child/file").await;
    assert!(!embedded.ignored);
    assert!(embedded.rule.is_none());
    outside.commit("file", "child data", "base");
    repo.git(&[
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "-q",
        &outside.s(),
        "linked",
    ]);
    assert!(git_check_ignore(repo.s(), "linked/file".into())
        .await
        .is_err());
    // Invalid Git configuration makes Git exit 128, never a clean no-match.
    repo.git(&["config", "core.ignoreCase", "invalid-boolean"]);
    assert!(git_check_ignore(repo.s(), "file".into()).await.is_err());
}

#[cfg(feature = "headless")]
#[tokio::test]
async fn ipc_dispatch_preserves_the_contract_and_rejects_missing_or_unsafe_arguments() {
    use l8git_lib::server::{
        dispatch,
        state::{ConnectionHandle, DispatchCtx, ServerState, OUTBOX_CAPACITY},
    };
    use serde_json::json;
    use std::sync::Arc;
    let repo = repo("ignore-ipc");
    repo.write(".gitignore", "*.log\n");
    let state = ServerState::new("test".into(), [0u8; 32], vec![repo.path.clone()]);
    let (tx, _rx) = tokio::sync::mpsc::channel(OUTBOX_CAPACITY);
    let conn = Arc::new(ConnectionHandle::new(1, tx));
    let ctx = DispatchCtx::new(state.clone(), conn, 1, "git_check_ignore");
    let args = json!({ "path": repo.s(), "file": " name 日本語.log" });
    state
        .ensure_command_allowed("git_check_ignore", &args)
        .unwrap();
    let result = dispatch::dispatch("git_check_ignore", args, &ctx)
        .await
        .unwrap();
    assert_eq!(
        result,
        json!({ "file": " name 日本語.log", "ignored": true, "rule": { "source": ".gitignore", "line": 1, "pattern": "*.log" } })
    );
    assert!(
        dispatch::dispatch("git_check_ignore", json!({ "path": repo.s() }), &ctx)
            .await
            .is_err()
    );
    assert!(dispatch::dispatch(
        "git_check_ignore",
        json!({ "path": repo.s(), "file": ["file"] }),
        &ctx
    )
    .await
    .is_err());
    assert!(dispatch::dispatch(
        "git_check_ignore",
        json!({ "path": repo.s(), "file": "../outside" }),
        &ctx
    )
    .await
    .is_err());
    let outside = TestRepo::new("ignore-ipc-outside");
    assert!(state
        .ensure_command_allowed(
            "git_check_ignore",
            &json!({ "path": outside.s(), "file": "file" })
        )
        .is_err());
}
