mod common;

use common::TestRepo;
use l8git_lib::git;

const PIN_DIFF_PATH: &str = "vendor/space [lib]";

#[tokio::test]
async fn pin_diff_reads_two_local_commits_and_preserves_both_checkouts() {
    let (host, _, child) = fixture("sub-pin-diff", PIN_DIFF_PATH, "library");
    let before = child.head();
    child.write(".gitattributes", "lib.txt diff=f20\n");
    child.git(&["add", "--", ".gitattributes"]);
    let after = child.commit("lib.txt", "new library\n", "second pin");
    host.git(&["add", "--", PIN_DIFF_PATH]);
    let latest = child.commit("lib.txt", "current HEAD only\n", "third pin");
    child.write("lib.txt", "unsaved edit\n");
    child.git(&["config", "diff.external", "l8git-f20-must-not-execute"]);
    child.git(&["config", "diff.f20.textconv", "l8git-f20-must-not-execute"]);
    child.git(&["config", "diff.f20.command", "l8git-f20-must-not-execute"]);
    host.git(&["config", "diff.submodule", "diff"]);

    let pin_patches = common::json(
        &git::repo_file_diff(host.s(), PIN_DIFF_PATH.into(), false, None)
            .await
            .unwrap(),
    );
    for (sector, old, new) in [("staged", &before, &after), ("unstaged", &after, &latest)] {
        let patch = pin_patches[sector].as_str().unwrap();
        assert!(patch.contains(" 160000\n"), "{patch}");
        assert!(
            patch.contains(&format!("-Subproject commit {old}\n")),
            "{patch}"
        );
        assert!(
            patch.contains(&format!("+Subproject commit {new}")),
            "{patch}"
        );
    }

    let snapshot = || {
        let mut bytes = Vec::new();
        for repo in [&host, &child] {
            let gitdir = std::path::PathBuf::from(repo.git(&["rev-parse", "--absolute-git-dir"]));
            for file in ["HEAD", "index", "config"] {
                bytes.push(std::fs::read(gitdir.join(file)).unwrap());
            }
            bytes.push(repo.git(&["show-ref", "--head"]).into_bytes());
        }
        bytes.push(std::fs::read(child.path.join("lib.txt")).unwrap());
        bytes
    };
    let original = snapshot();
    let compare = |old: &str, new: &str| {
        git::git_submodule_pin_diff(host.s(), PIN_DIFF_PATH.into(), old.into(), new.into())
    };
    let result = common::json(&compare(&before, &after).await.unwrap());
    let patch = result["patch"].as_str().unwrap();
    assert_eq!(result["status"], "diff");
    assert_eq!(result["truncated"], false);
    assert!(patch.contains("diff --git a/lib.txt b/lib.txt"));
    assert!(patch.contains("-library\n+new library\n"), "{patch}");
    assert!(!patch.contains("current HEAD only") && !patch.contains("unsaved edit"));
    let reverse = common::json(&compare(&after, &before).await.unwrap());
    assert!(reverse["patch"]
        .as_str()
        .unwrap()
        .contains("-new library\n+library\n"));
    assert_eq!(
        common::json(&compare(&after, &after.to_uppercase()).await.unwrap())["status"],
        "samePin"
    );
    assert_eq!(original, snapshot());

    child.git(&["commit", "--allow-empty", "-m", "same tree"]);
    let empty = common::json(&compare(&latest, &child.head()).await.unwrap());
    assert_eq!(empty["status"], "diff");
    assert_eq!(empty["patch"], "");

    host.git(&["add", "--", PIN_DIFF_PATH]);
    let dirty_pair = common::json(
        &git::repo_file_diff(host.s(), PIN_DIFF_PATH.into(), false, None)
            .await
            .unwrap(),
    );
    let head = child.head();
    let dirty_patch = dirty_pair["unstaged"].as_str().unwrap();
    assert!(
        dirty_patch.contains(&format!(
            "-Subproject commit {head}\n+Subproject commit {head}-dirty\n"
        )),
        "{dirty_patch}"
    );
}

#[tokio::test]
async fn pin_diff_rejects_bad_paths_and_never_fetches_missing_promisor_objects() {
    let (host, source, child) = fixture("sub-pin-offline", PIN_DIFF_PATH, "library");
    let before = child.head();
    let missing = source.commit("lib.txt", "not in checkout\n", "remote-only pin");
    child.git(&["config", "remote.origin.promisor", "true"]);
    child.git(&["config", "remote.origin.partialclonefilter", "blob:none"]);
    let compare = |path: &str, old: &str, new: &str| {
        git::git_submodule_pin_diff(host.s(), path.into(), old.into(), new.into())
    };
    for path in [
        "",
        "vendor",
        "vendor/../vendor/space [lib]",
        ".git/modules/library",
    ] {
        assert!(compare(path, &before, &missing).await.is_err());
    }
    for pin in ["HEAD", &before[..12], "--output=/tmp/ignored"] {
        let error = compare(PIN_DIFF_PATH, &before, pin).await.err().unwrap();
        assert!(error.contains("submodule.invalidPin"), "{error}");
    }
    let tree = child.git(&["rev-parse", "HEAD^{tree}"]);
    let error = compare(PIN_DIFF_PATH, &before, &tree).await.err().unwrap();
    assert!(error.contains("submodule.invalidPin"), "{error}");
    let error = compare(PIN_DIFF_PATH, &before, &missing)
        .await
        .err()
        .unwrap();
    assert!(error.contains("submodule.objectsUnavailable"), "{error}");
    assert!(!child.git(&["rev-list", "--all"]).contains(&missing));

    let after = child.commit("lib.txt", "missing blob\n", "local pin");
    let blob = child.git(&["rev-parse", "HEAD:lib.txt"]);
    let dir = std::path::PathBuf::from(child.git(&["rev-parse", "--absolute-git-dir"]));
    std::fs::remove_file(dir.join("objects").join(&blob[..2]).join(&blob[2..])).unwrap();
    let error = compare(PIN_DIFF_PATH, &before, &after).await.err().unwrap();
    assert!(error.contains("submodule.objectsUnavailable"), "{error}");
    assert!(!dir
        .join("objects")
        .join(&blob[..2])
        .join(&blob[2..])
        .exists());

    std::fs::remove_file(child.path.join(".git")).unwrap();
    let error = compare(PIN_DIFF_PATH, &before, &after).await.err().unwrap();
    assert!(error.contains("submodule.notInitialized"), "{error}");
    assert!(!child.path.join(".git").exists());
}

#[cfg(unix)]
#[tokio::test]
async fn pin_diff_shares_the_submodule_checkout_boundary() {
    use std::os::unix::fs::symlink;
    let (host, source, child) = fixture("sub-pin-boundary", PIN_DIFF_PATH, "library");
    let before = child.head();
    let after = source.commit("lib.txt", "other checkout\n", "outside");
    std::fs::remove_dir_all(&child.path).unwrap();
    symlink(&source.path, &child.path).unwrap();
    let error = git::git_submodule_pin_diff(host.s(), PIN_DIFF_PATH.into(), before, after)
        .await
        .err()
        .unwrap();
    assert!(error.contains("submodule.unsafePath"), "{error}");
    std::fs::remove_file(&child.path).unwrap();
}

#[cfg(feature = "headless")]
#[tokio::test]
async fn pin_diff_dispatch_requires_both_pins_and_a_shared_parent() {
    use l8git_lib::server::{
        dispatch,
        state::{ConnectionHandle, DispatchCtx, ServerState, OUTBOX_CAPACITY},
    };
    use serde_json::json;
    use std::sync::Arc;

    let (host, source, child) = fixture("sub-pin-ipc", PIN_DIFF_PATH, "library");
    let before = child.head();
    let after = child.commit("lib.txt", "from child\n", "pin");
    let command = "git_submodule_pin_diff";
    let state = ServerState::new("test".into(), [0; 32], vec![host.path.clone()]);
    let (tx, _rx) = tokio::sync::mpsc::channel(OUTBOX_CAPACITY);
    let ctx = DispatchCtx::new(
        state.clone(),
        Arc::new(ConnectionHandle::new(1, tx)),
        1,
        command,
    );
    let args = json!({ "path": host.s(), "submodulePath": PIN_DIFF_PATH, "before": before, "after": after });
    state.ensure_command_allowed(command, &args).unwrap();
    let response = dispatch::dispatch(command, args.clone(), &ctx)
        .await
        .unwrap();
    assert_eq!(response["status"], "diff");
    assert!(response["patch"].as_str().unwrap().contains("+from child"));
    let mut missing = args.clone();
    missing.as_object_mut().unwrap().remove("before");
    assert!(dispatch::dispatch(command, missing, &ctx).await.is_err());
    let mut outside = args;
    outside["path"] = json!(source.s());
    assert!(state.ensure_command_allowed(command, &outside).is_err());
}

fn fixture(tag: &str, path: &str, name: &str) -> (TestRepo, TestRepo, TestRepo) {
    let source = TestRepo::new(&format!("{tag}-source"));
    // Submodule clones read the global config, where Windows runners enable
    // core.autocrlf; the attribute keeps the checked-out bytes LF everywhere.
    source.write(".gitattributes", "* -text\n");
    source.git(&["add", "--", ".gitattributes"]);
    source.commit("lib.txt", "library\n", "library base");
    let host = TestRepo::new(&format!("{tag}-host"));
    host.commit("app.txt", "app\n", "application base");
    host.git(&[
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "--name",
        name,
        "--",
        &source.file_url(),
        path,
    ]);
    host.commit_all("register library");
    let sub = TestRepo::adopt(host.path.join(path));
    (host, source, sub)
}

#[tokio::test]
async fn listing_uses_index_pin_and_current_head_for_modified_status() {
    let (host, source, sub) = fixture("sub-pin", "vendor/lib", "library");
    let pin = source.head();
    let next = sub.commit("lib.txt", "new library\n", "local library commit");
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].commit, pin);
    assert_ne!(entries[0].commit, next);
    assert_eq!(entries[0].status, "modified");
    assert_eq!(entries[0].local_changes, Some(0));

    host.git(&["add", "--", "vendor/lib"]);
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries[0].commit, next);
    assert_eq!(entries[0].status, "initialized");
}

#[cfg(unix)]
#[tokio::test]
async fn paths_with_spaces_tabs_newlines_and_trailing_space_are_exact() {
    let path = "libs/ spaced\tpart\nname ";
    let name = "quoted \"name\".library";
    let (host, source, sub) = fixture("sub-path", path, name);
    sub.write("new\nfile\t.txt", "new\n");
    sub.git(&["mv", "--", "lib.txt", "renamed\nlib.txt"]);
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].path, path);
    assert_eq!(entries[0].name, name);
    assert_eq!(entries[0].url, source.file_url());
    assert_eq!(entries[0].commit, source.head());
    assert_eq!(entries[0].local_changes, Some(2));
    assert!(entries[0]
        .gitmodules_raw
        .contains("quoted \\\"name\\\".library"));
    let history = git::get_submodule_commits(host.s(), path.into(), source.head())
        .await
        .unwrap();
    assert_eq!(history.len(), 1);
    assert!(history[0].is_pinned);
    let opened = common::json(&git::open_submodule_repo(host.s(), path.into(), None).await.unwrap());
    assert_eq!(opened["path"], sub.path.canonicalize().unwrap().to_str().unwrap());
    git::git_submodule_sync(host.s(), Some(path.into()))
        .await
        .unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn repository_root_ending_in_whitespace_preserves_its_full_path() {
    for suffix in [" \t", " \t\n"] {
        let (mut host, source, _sub) = fixture("sub-root-whitespace", "vendor/lib", "library");
        let new_path = host.path.with_file_name(format!(
            "{}{suffix}",
            host.path.file_name().unwrap().to_string_lossy()
        ));
        std::fs::rename(&host.path, &new_path).unwrap();
        host.path = new_path;
        let entries = git::list_submodules(host.s()).await.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].commit, source.head());
        assert_eq!(entries[0].status, "initialized");
        let history = git::get_submodule_commits(host.s(), "vendor/lib".into(), source.head())
            .await
            .unwrap();
        assert!(history[0].is_pinned);
        // Some Git versions implement submodule actions in a shell script
        // whose command substitution strips trailing LF from the root path.
        if !suffix.ends_with('\n') {
            git::git_submodule_sync(host.s(), Some("vendor/lib".into()))
                .await
                .unwrap();
        }
    }
}

#[tokio::test]
async fn history_keeps_pipe_delimiters_in_author_and_subject() {
    let (host, _source, sub) = fixture("sub-log-pipe", "vendor/lib", "library");
    sub.git(&["config", "user.name", "A | B | C"]);
    let pin = sub.commit("lib.txt", "changed\n", "subject | with | pipes");
    host.git(&["add", "--", "vendor/lib"]);
    let history = git::get_submodule_commits(host.s(), "vendor/lib".into(), pin[..12].into())
        .await
        .unwrap();
    assert_eq!(history[0].hash, pin);
    assert_eq!(history[0].message, "subject | with | pipes");
    assert_eq!(history[0].author, "A | B | C");
    assert!(!history[0].date.is_empty());
    assert!(history[0].is_pinned);
    assert!(!history[1].is_pinned);
}

#[tokio::test]
async fn empty_pin_marks_no_commit_and_invalid_pin_is_an_error() {
    let (host, _source, _sub) = fixture("sub-log-pin", "vendor/lib", "library");
    let history = git::get_submodule_commits(host.s(), "vendor/lib".into(), String::new())
        .await
        .unwrap();
    assert!(history.iter().all(|commit| !commit.is_pinned));
    for pin in ["--all", "missing-commit", "HEAD\n"] {
        assert!(
            git::get_submodule_commits(host.s(), "vendor/lib".into(), pin.into())
                .await
                .is_err()
        );
    }
}

#[tokio::test]
async fn history_includes_old_pin_outside_the_recent_window() {
    let (host, source, sub) = fixture("sub-log-old-pin", "vendor/lib", "library");
    for i in 0..12 {
        sub.commit(
            "lib.txt",
            &format!("version {i}\n"),
            &format!("library version {i}"),
        );
    }
    let history = git::get_submodule_commits(host.s(), "vendor/lib".into(), source.head())
        .await
        .unwrap();
    assert_eq!(history.len(), 11);
    assert_eq!(history.iter().filter(|commit| commit.is_pinned).count(), 1);
    assert_eq!(history.last().unwrap().hash, source.head());
    assert!(history.last().unwrap().is_pinned);
}

#[tokio::test]
async fn empty_or_unregistered_selections_never_broaden_to_all_modules() {
    let (host, _source, _sub) = fixture("sub-selection", "vendor/lib", "library");
    for selected in [
        "",
        "vendor",
        "vendor/missing",
        "../outside",
        "/tmp/outside",
        ".git/modules/library",
    ] {
        assert!(git::git_submodule_init(host.s(), Some(selected.into()))
            .await
            .is_err());
        assert!(
            git::git_submodule_update(host.s(), Some(selected.into()), true, true)
                .await
                .is_err()
        );
        assert!(git::git_submodule_sync(host.s(), Some(selected.into()))
            .await
            .is_err());
        assert!(git::git_submodule_deinit(host.s(), selected.into(), true)
            .await
            .is_err());
        assert!(
            git::get_submodule_commits(host.s(), selected.into(), String::new())
                .await
                .is_err()
        );
    }
    assert!(host.exists("vendor/lib/lib.txt"));
    assert_eq!(
        git::list_submodules(host.s()).await.unwrap()[0].status,
        "initialized"
    );
    git::git_submodule_init(host.s(), None).await.unwrap();
    git::git_submodule_sync(host.s(), None).await.unwrap();
}

#[tokio::test]
async fn malformed_config_and_invalid_repository_return_real_errors() {
    let host = TestRepo::new("sub-malformed");
    assert!(git::list_submodules(host.s()).await.unwrap().is_empty());
    host.write(".gitmodules", "[submodule \"broken\"\n path = vendor/lib\n");
    let error = git::list_submodules(host.s()).await.err().unwrap();
    assert!(error.contains("bad config"), "{error}");
    assert!(git::git_submodule_sync(host.s(), None).await.is_err());
    let invalid = host.path.join("not-a-repository");
    assert!(git::list_submodules(invalid.to_string_lossy().into())
        .await
        .is_err());
}

#[tokio::test]
async fn duplicate_or_unsafe_config_paths_are_rejected() {
    let host = TestRepo::new("sub-config-paths");
    host.write(".gitmodules", "[submodule \"one\"]\n path = vendor/lib\n url = /first\n[submodule \"two\"]\n path = vendor/lib\n url = /second\n");
    assert!(git::list_submodules(host.s())
        .await
        .err()
        .unwrap()
        .contains("Duplicate submodule path"));
    host.write(
        ".gitmodules",
        "[submodule \"escape\"]\n path = ../outside\n url = /outside\n",
    );
    assert!(git::list_submodules(host.s())
        .await
        .err()
        .unwrap()
        .contains("__INVALID_WORKTREE_PATH__"));
}

#[tokio::test]
async fn git_config_quoting_comments_and_case_are_preserved_in_raw_stanza() {
    let (host, source, _sub) = fixture("sub-config-quoting", "vendor/space library", "library");
    host.write(".gitmodules", &format!(
        "[SUBMODULE \"library\"] # library metadata\n\tPATH = \"vendor/space library\" # actual path\n\tURL = \"{}\"\n\tbranch = old\n\tBRANCH = main\n[other]\n path = ignored\n", source.file_url()));
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].path, "vendor/space library");
    assert_eq!(entries[0].branch.as_deref(), Some("main"));
    assert!(entries[0].gitmodules_raw.contains("# library metadata"));
    assert!(entries[0].gitmodules_raw.contains("# actual path"));
    assert!(!entries[0].gitmodules_raw.contains("[other]"));
}

#[tokio::test]
async fn orphan_gitlink_is_visible_and_broken_submodule_metadata_is_an_error() {
    let (host, source, sub) = fixture("sub-orphan", "vendor/lib", "library");
    std::fs::remove_file(host.path.join(".gitmodules")).unwrap();
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "vendor/lib");
    assert_eq!(entries[0].url, "");
    assert_eq!(entries[0].commit, source.head());
    assert_eq!(entries[0].status, "initialized");
    std::fs::write(
        sub.path.join(".git"),
        "gitdir: /missing/submodule-metadata\n",
    )
    .unwrap();
    let error = git::list_submodules(host.s()).await.err().unwrap();
    // Newer Git (e.g. Git for Windows 2.55) words a dangling gitfile differently.
    assert!(
        error.contains("not a git repository") || error.contains("does not point to a valid repository"),
        "{error}"
    );
}

#[tokio::test]
async fn uninitialized_gitlink_still_reports_pin_and_refuses_parent_history() {
    let (host, source, _sub) = fixture("sub-uninitialized", "vendor/lib", "library");
    git::git_submodule_deinit(host.s(), "vendor/lib".into(), false)
        .await
        .unwrap();
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries[0].commit, source.head());
    assert_eq!(entries[0].status, "uninitialized");
    assert_eq!(entries[0].local_changes, None);
    let error = git::get_submodule_commits(host.s(), "vendor/lib".into(), source.head())
        .await
        .err()
        .unwrap();
    assert!(error.contains("not initialized"), "{error}");
}

#[tokio::test]
async fn selected_glob_characters_are_literal_in_mutations() {
    let (host, source, _sub) = fixture("sub-literal", "libs/one[ab]", "one-brackets");
    host.git(&[
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "--name",
        "one-a",
        "--",
        &source.file_url(),
        "libs/onea",
    ]);
    host.commit_all("add second module");
    let output = git::git_submodule_deinit(host.s(), "libs/one[ab]".into(), false)
        .await
        .unwrap();
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(
        entries
            .iter()
            .find(|entry| entry.path == "libs/one[ab]")
            .unwrap()
            .status,
        "uninitialized",
        "deinit output: {output}"
    );
    assert_eq!(
        entries
            .iter()
            .find(|entry| entry.path == "libs/onea")
            .unwrap()
            .status,
        "initialized"
    );
    assert!(host.exists("libs/onea/lib.txt"));
}

#[tokio::test]
async fn deinit_without_force_preserves_dirty_files_and_git_failure_details() {
    let (host, _source, sub) = fixture("sub-dirty", "vendor/lib", "library");
    sub.write("lib.txt", "irreplaceable local content\n");
    let error = git::git_submodule_deinit(host.s(), "vendor/lib".into(), false)
        .await
        .err()
        .unwrap();
    assert!(error.contains("local modifications"), "{error}");
    assert_eq!(sub.read("lib.txt"), "irreplaceable local content\n");
    assert!(host.exists("vendor/lib/.git"));
}

#[tokio::test]
async fn update_preserves_dirty_content_then_restores_the_recorded_pin_when_clean() {
    let (host, source, sub) = fixture("sub-update", "vendor/lib", "library");
    let local = sub.commit("lib.txt", "local version\n", "local library version");
    sub.write("lib.txt", "unsaved library edits\n");
    let error = git::git_submodule_update(host.s(), Some("vendor/lib".into()), false, false)
        .await
        .err()
        .unwrap();
    assert!(
        error.contains("overwritten")
            || error.contains("local changes")
            || error.starts_with("__LOCAL_CHANGES_BLOCK__|"),
        "{error}"
    );
    assert_eq!(sub.head(), local);
    assert_eq!(sub.read("lib.txt"), "unsaved library edits\n");
    sub.git(&["restore", "--", "lib.txt"]);
    git::git_submodule_update(host.s(), Some("vendor/lib".into()), false, false)
        .await
        .unwrap();
    assert_eq!(sub.head(), source.head());
    assert_eq!(sub.read("lib.txt"), "library\n");
    assert_eq!(sub.rev("refs/heads/main"), local);
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries[0].status, "initialized");
    assert!(entries[0].is_detached);
}

#[tokio::test]
async fn add_rejects_invalid_inputs_before_clone_or_config_side_effects() {
    let source = TestRepo::new("sub-add-source");
    source.commit("lib.txt", "library\n", "library base");
    let host = TestRepo::new("sub-add-invalid");
    host.commit("app.txt", "app\n", "application base");
    for (url, path, name, branch) in [
        ("--force".to_string(), "vendor/lib", None, None),
        (source.file_url(), "../outside", None, None),
        (source.file_url(), "vendor/lib", Some("../escape"), None),
        (source.file_url(), "vendor/lib", Some("bad\nname"), None),
        (source.file_url(), "vendor/lib", None, Some("bad..branch")),
        (source.file_url(), "vendor/lib", None, Some("--force")),
        (source.file_url(), "vendor/lib", None, Some("@{-1}")),
        (source.file_url(), "vendor/lib", None, Some("")),
    ] {
        assert!(git::git_submodule_add(
            host.s(),
            url,
            path.into(),
            name.map(str::to_owned),
            branch.map(str::to_owned)
        )
        .await
        .is_err());
        assert!(!host.exists("vendor/lib"));
        assert!(!host.exists(".gitmodules"));
        assert!(host.git(&["status", "--porcelain"]).is_empty());
    }
}

#[tokio::test]
async fn add_existing_checkout_handles_quoted_name_and_staged_index_pin() {
    let source = TestRepo::new("sub-add-existing-source");
    source.commit("lib.txt", "library\n", "library base");
    let host = TestRepo::new("sub-add-existing-host");
    host.commit("app.txt", "app\n", "application base");
    let path = "vendor/space library";
    host.git(&["clone", "-q", "--", &source.file_url(), path]);
    let name = "quoted \"library\"";
    git::git_submodule_add(
        host.s(),
        source.file_url(),
        path.into(),
        Some(name.into()),
        Some("main".into()),
    )
    .await
    .unwrap();
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries[0].name, name);
    assert_eq!(entries[0].path, path);
    assert_eq!(entries[0].branch.as_deref(), Some("main"));
    assert_eq!(entries[0].commit, source.head());
    assert_eq!(entries[0].status, "initialized");
    assert!(entries[0].gitmodules_raw.contains("quoted"));
}

#[cfg(unix)]
#[tokio::test]
async fn leaf_symlink_and_symlinked_config_cannot_escape() {
    use std::os::unix::fs::symlink;
    let (host, _source, sub) = fixture("sub-symlink", "vendor/lib", "library");
    let outside = TestRepo::new("sub-symlink-outside");
    outside.commit("outside.txt", "keep\n", "outside");
    std::fs::remove_dir_all(&sub.path).unwrap();
    symlink(&outside.path, &sub.path).unwrap();
    assert!(git::list_submodules(host.s()).await.is_err());
    assert!(
        git::get_submodule_commits(host.s(), "vendor/lib".into(), String::new())
            .await
            .is_err()
    );
    assert!(
        git::git_submodule_deinit(host.s(), "vendor/lib".into(), true)
            .await
            .is_err()
    );
    assert_eq!(outside.read("outside.txt"), "keep\n");
    std::fs::remove_file(&sub.path).unwrap();
    std::fs::remove_file(host.path.join(".gitmodules")).unwrap();
    outside.write("config", "[submodule \"escape\"]\n path = ../escape\n");
    symlink(outside.path.join("config"), host.path.join(".gitmodules")).unwrap();
    assert!(git::list_submodules(host.s()).await.is_err());
}

#[tokio::test]
async fn changed_submodule_core_worktree_cannot_redirect_reads_or_mutations() {
    let (host, _source, sub) = fixture("sub-core-worktree", "vendor/lib", "library");
    let outside = TestRepo::new("sub-core-worktree-outside");
    outside.commit("outside.txt", "keep\n", "outside");
    sub.git(&["config", "core.worktree", &outside.s()]);
    for result in [
        git::git_submodule_sync(host.s(), Some("vendor/lib".into())).await,
        git::git_submodule_update(host.s(), Some("vendor/lib".into()), true, false).await,
        git::git_submodule_deinit(host.s(), "vendor/lib".into(), true).await,
    ] {
        assert!(result.err().unwrap().contains("__INVALID_WORKTREE_PATH__"));
    }
    assert!(git::list_submodules(host.s())
        .await
        .err()
        .unwrap()
        .contains("__INVALID_WORKTREE_PATH__"));
    assert!(
        git::get_submodule_commits(host.s(), "vendor/lib".into(), String::new())
            .await
            .is_err()
    );
    assert_eq!(outside.read("outside.txt"), "keep\n");
    assert_eq!(sub.read("lib.txt"), "library\n");
}

#[tokio::test]
async fn conflict_gitlinks_use_ours_and_preserve_conflict_status() {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let (host, source, sub) = fixture("sub-conflict", "vendor/lib", "library");
    let base = source.head();
    let ours = sub.commit("lib.txt", "ours\n", "ours");
    let theirs = sub.commit("lib.txt", "theirs\n", "theirs");
    let input = format!(
        "0 {}\tvendor/lib\0\
        160000 {base} 1\tvendor/lib\0\
        160000 {ours} 2\tvendor/lib\0\
        160000 {theirs} 3\tvendor/lib\0",
        "0".repeat(base.len())
    );
    let mut process = Command::new("git")
        .arg("-C")
        .arg(&host.path)
        .args(["update-index", "-z", "--index-info"])
        .stdin(Stdio::piped())
        .spawn()
        .unwrap();
    process
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    assert!(process.wait().unwrap().success());
    let entries = git::list_submodules(host.s()).await.unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].commit, ours);
    assert_eq!(entries[0].status, "conflict");
}

#[tokio::test]
async fn opening_the_selected_checkout_returns_its_own_head_and_preserves_git_state() {
    let selected = "vendor/space [lib]";
    let (host, _source, child) = fixture("sub-open", selected, "library");
    let head = child.commit("lib.txt", "local commit\n", "child commit");
    child.git(&["checkout", "--detach", &head]);
    child.write("lib.txt", "unsaved child edit\n");
    let head_path = |repo: &TestRepo, name: &str| {
        std::path::PathBuf::from(repo.git(&["rev-parse", "--absolute-git-dir"])).join(name)
    };
    let files = [
        host.path.join(".gitmodules"),
        host.path.join("app.txt"),
        child.path.join(".git"),
        child.path.join("lib.txt"),
        head_path(&host, "config"),
        head_path(&child, "config"),
        head_path(&host, "index"),
        head_path(&child, "index"),
        head_path(&host, "HEAD"),
        head_path(&child, "HEAD"),
    ];
    let read = || files.each_ref().map(|path| std::fs::read(path).unwrap());
    let before = read();
    let refs = |repo: &TestRepo| repo.git(&["show-ref", "--head"]);
    let before_refs = [refs(&host), refs(&child)];

    let opened = common::json(
        &git::open_submodule_repo(host.s(), selected.into(), None)
            .await
            .unwrap(),
    );
    assert_eq!(
        opened["path"],
        child.path.canonicalize().unwrap().to_str().unwrap()
    );
    assert_eq!(opened["branch"], "HEAD");
    assert_eq!(opened["commits"][0]["hash"], head);
    assert_eq!(before, read());
    assert_eq!(before_refs, [refs(&host), refs(&child)]);
}

#[tokio::test]
async fn opening_requires_an_exact_registered_and_initialized_checkout() {
    let selected = "vendor/lib";
    let (host, _source, child) = fixture("sub-open-invalid", selected, "library");
    let other = TestRepo::new("sub-open-unregistered");
    other.commit("other.txt", "other\n", "other");
    host.git(&["clone", "-q", "--", &other.file_url(), "embedded"]);
    for path in [
        "",
        ".",
        "../outside",
        "/outside",
        "vendor",
        "vendor/./lib",
        "vendor/lib/",
        "vendor/lib/lib.txt",
        "embedded",
        ".git/modules/library",
    ] {
        assert!(
            git::open_submodule_repo(host.s(), path.into(), None)
                .await
                .is_err(),
            "{path:?}"
        );
    }
    assert!(git::open_submodule_repo(
        host.path.join("vendor").to_string_lossy().into(),
        "lib".into(),
        None
    )
    .await
    .is_err());

    let gitfile = child.path.join(".git");
    let initialized = std::fs::read(&gitfile).unwrap();
    std::fs::write(&gitfile, "gitdir: /missing/submodule-metadata\n").unwrap();
    let error = git::open_submodule_repo(host.s(), selected.into(), None)
        .await
        .err()
        .unwrap();
    assert!(
        error.contains("git repository") || error.contains("does not point to a valid repository"),
        "{error}"
    );
    std::fs::write(&gitfile, "gitdir: ../../.git\n").unwrap();
    let error = git::open_submodule_repo(host.s(), selected.into(), None)
        .await
        .err()
        .unwrap();
    assert!(error.contains("submodule.unsafePath"), "{error}");
    std::fs::write(&gitfile, initialized).unwrap();
    child.git(&["config", "core.worktree", &other.s()]);
    let error = git::open_submodule_repo(host.s(), selected.into(), None)
        .await
        .err()
        .unwrap();
    assert!(error.contains("submodule.unsafePath"), "{error}");

    std::fs::remove_file(&gitfile).unwrap();
    let error = git::open_submodule_repo(host.s(), selected.into(), None)
        .await
        .err()
        .unwrap();
    assert!(error.contains("submodule.notInitialized"), "{error}");
    assert!(!gitfile.exists());
    assert_eq!(child.read("lib.txt"), "library\n");
    std::fs::remove_dir_all(&child.path).unwrap();
    let error = git::open_submodule_repo(host.s(), selected.into(), None)
        .await
        .err()
        .unwrap();
    assert!(error.contains("submodule.notInitialized"), "{error}");
    assert!(!child.path.exists());
}

#[cfg(unix)]
#[tokio::test]
async fn opening_rejects_symlinks_within_and_outside_the_parent_checkout() {
    use std::os::unix::fs::symlink;
    let selected = "vendor/lib";
    let (host, outside, child) = fixture("sub-open-links", selected, "library");
    let relocated = host.path.join("relocated");
    std::fs::rename(&child.path, &relocated).unwrap();
    for target in [&outside.path, &relocated] {
        symlink(target, &child.path).unwrap();
        assert!(git::open_submodule_repo(host.s(), selected.into(), None)
            .await
            .is_err());
        std::fs::remove_file(&child.path).unwrap();
    }
    let vendor = child.path.parent().unwrap();
    std::fs::remove_dir(vendor).unwrap();
    std::fs::create_dir(host.path.join("alias-target")).unwrap();
    std::fs::rename(relocated, host.path.join("alias-target/lib")).unwrap();
    symlink(host.path.join("alias-target"), vendor).unwrap();
    assert!(git::open_submodule_repo(host.s(), selected.into(), None)
        .await
        .is_err());
    std::fs::remove_file(vendor).unwrap();
    symlink(outside.path.parent().unwrap(), vendor).unwrap();
    assert!(git::open_submodule_repo(host.s(), selected.into(), None)
        .await
        .is_err());
}

#[cfg(feature = "headless")]
#[tokio::test]
async fn open_submodule_ipc_requires_an_explicit_path_and_a_shared_parent() {
    use l8git_lib::server::{
        dispatch,
        state::{ConnectionHandle, DispatchCtx, ServerState, OUTBOX_CAPACITY},
    };
    use serde_json::json;
    use std::sync::Arc;

    let (host, outside, child) = fixture("sub-open-ipc", "vendor/lib", "library");
    let state = ServerState::new("test".into(), [0; 32], vec![host.path.clone()]);
    let (tx, _rx) = tokio::sync::mpsc::channel(OUTBOX_CAPACITY);
    let command = "open_submodule_repo";
    let ctx = DispatchCtx::new(
        state.clone(),
        Arc::new(ConnectionHandle::new(1, tx)),
        1,
        command,
    );
    let args =
        json!({ "path": host.s(), "submodulePath": "vendor/lib", "hideT3Checkpoints": false });
    state.ensure_command_allowed(command, &args).unwrap();
    let opened = dispatch::dispatch(command, args, &ctx).await.unwrap();
    assert_eq!(
        opened["path"],
        child.path.canonicalize().unwrap().to_str().unwrap()
    );
    assert_eq!(opened["commits"][0]["hash"], child.head());
    for args in [
        json!({ "path": host.s() }),
        json!({ "path": host.s(), "submodulePath": null }),
        json!({ "path": host.s(), "submodulePath": ["vendor/lib"] }),
        json!({ "path": host.s(), "submodulePath": outside.s() }),
        json!({ "path": host.s(), "submodulePath": "../outside" }),
    ] {
        assert!(dispatch::dispatch(command, args, &ctx).await.is_err());
    }
    assert!(state
        .ensure_command_allowed(
            command,
            &json!({ "path": outside.s(), "submodulePath": "vendor/lib" })
        )
        .is_err());
}
