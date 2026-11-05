use super::*;

struct Fixture {
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("l8git-expansion-test-{}", unique_id()));
        fs::create_dir(&root).unwrap();
        run_git(&root, &["init", "-b", "main"]).unwrap();
        run_git(&root, &["config", "user.name", "Fixture"]).unwrap();
        run_git(&root, &["config", "user.email", "fixture@example.invalid"]).unwrap();
        run_git(&root, &["config", "core.autocrlf", "false"]).unwrap();
        let fixture = Self { root };
        fixture.write("f.txt", "one\ntwo\nthree\n");
        fixture.commit("initial");
        fixture
    }
    fn write(&self, file: &str, text: &str) {
        let path = self.root.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }
    fn commit(&self, message: &str) -> String {
        git(&self.root, &["add", "--all"]).unwrap();
        git(&self.root, &["commit", "--no-gpg-sign", "-m", message]).unwrap();
        pinned(&self.root, "HEAD").unwrap()
    }
    fn request(&self, request: GitExpansionRequest) -> Value {
        execute_request(&self.root, request).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn pickaxe_is_paged_pinned_and_treats_leading_dashes_as_text() {
    let fixture = Fixture::new();
    let base = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write("f.txt", "one\n--all\nthree\n");
    let head = fixture.commit("literal flag text");
    let result = history(&fixture.root, "--all", "literal", "HEAD", 0).unwrap();
    assert_eq!(result["revision"], head);
    assert_eq!(result["commits"].as_array().unwrap().len(), 1);
    assert_eq!(result["commits"][0]["subject"], "literal flag text");
    assert!(history(&fixture.root, "one", "literal", "--all", 0).is_err());
    assert!(history(&fixture.root, "one", "literal", "HEAD", 1001).is_err());
    assert!(
        history(&fixture.root, "^--all$", "regex", &base, 0).unwrap()["commits"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn line_history_and_range_diff_return_actual_pinned_history() {
    let fixture = Fixture::new();
    let base = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write("f.txt", "one\nchanged\nthree\n");
    let head = fixture.commit("change selected line");
    let history = function_history(&fixture.root, "f.txt", "HEAD", 2, 2, 0).unwrap();
    assert_eq!(history["revision"], head);
    assert!(history["patch"].as_str().unwrap().contains("changed"));
    assert_eq!(history["commits"][0]["hash"], head);
    assert!(function_history(&fixture.root, "../f.txt", "HEAD", 2, 2, 0).is_err());
    let comparison = range_diff(&fixture.root, &base, &head, &base, &head).unwrap();
    assert!(comparison["diff"].as_str().unwrap().contains("="));
    assert_eq!(comparison["newHead"], head);
}

#[test]
fn blame_ignore_validates_each_revision_and_reads_repo_file() {
    let fixture = Fixture::new();
    fixture.write("f.txt", "one\n two\nthree\n");
    let formatted = fixture.commit("format line");
    fixture.write(
        ".git-blame-ignore-revs",
        &format!("# formatting\n{formatted} # justified\n"),
    );
    let result = blame_ignore(&fixture.root, "f.txt", "HEAD").unwrap();
    assert_eq!(result["ignoredRevisions"][0], formatted);
    assert!(result["porcelain"]
        .as_str()
        .unwrap()
        .contains("author Fixture"));
    fixture.write(".git-blame-ignore-revs", "missing-ref\n");
    assert!(blame_ignore(&fixture.root, "f.txt", "HEAD").is_err());
}

#[test]
fn historical_hunk_restore_preserves_other_lines_and_rejects_stale_preview() {
    let fixture = Fixture::new();
    let source = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write("f.txt", "ONE\nTWO\nTHREE\n");
    fixture.commit("uppercase");
    fixture.write("f.txt", "ONE\nTWO\nlocal tail\n");
    let select = || {
        Some(LineSelection {
            source_start: 2,
            source_end: 2,
            target_start: 2,
            target_end: 2,
        })
    };
    let stale = restore_preview(
        &fixture.root,
        "f.txt".into(),
        Some(source.clone()),
        None,
        select(),
    )
    .unwrap();
    fixture.write("f.txt", "ONE\nTWO\nnew local tail\n");
    assert!(restore_apply(
        &fixture.root,
        stale["id"].as_str().unwrap(),
        stale["fingerprint"].as_str().unwrap()
    )
    .is_err());
    let before_index = index_tree(&fixture.root).unwrap();
    let preview =
        restore_preview(&fixture.root, "f.txt".into(), Some(source), None, select()).unwrap();
    assert_eq!(preview["proposed"], "ONE\ntwo\nnew local tail\n");
    restore_apply(
        &fixture.root,
        preview["id"].as_str().unwrap(),
        preview["fingerprint"].as_str().unwrap(),
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(fixture.root.join("f.txt")).unwrap(),
        "ONE\ntwo\nnew local tail\n"
    );
    assert_eq!(index_tree(&fixture.root).unwrap(), before_index);
    assert!(restore_apply(
        &fixture.root,
        preview["id"].as_str().unwrap(),
        preview["fingerprint"].as_str().unwrap()
    )
    .is_err());
}

#[test]
fn snapshot_preserves_raw_worktree_index_and_untracked_content() {
    let fixture = Fixture::new();
    let head = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write("f.txt", "staged\n");
    git(&fixture.root, &["add", "f.txt"]).unwrap();
    let captured_index = index_tree(&fixture.root).unwrap();
    fixture.write("f.txt", "unstaged\n");
    fixture.write("new.txt", "untracked\n");
    let snapshot = capture(&fixture.root, "before agent".into(), &head).unwrap();
    assert_eq!(snapshot["indexTree"], captured_index);
    assert!(snapshot["files"]
        .as_array()
        .unwrap()
        .contains(&json!("new.txt")));
    fixture.write("f.txt", "later\n");
    git(&fixture.root, &["add", "f.txt"]).unwrap();
    let preview = restore_preview(
        &fixture.root,
        "f.txt".into(),
        None,
        Some(snapshot["id"].as_str().unwrap().into()),
        None,
    )
    .unwrap();
    restore_apply(
        &fixture.root,
        preview["id"].as_str().unwrap(),
        preview["fingerprint"].as_str().unwrap(),
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(fixture.root.join("f.txt")).unwrap(),
        "unstaged\n"
    );
    let current_index = index_tree(&fixture.root).unwrap();
    fixture.request(GitExpansionRequest::SnapshotRestoreIndex {
        snapshot_id: snapshot["id"].as_str().unwrap().into(),
        expected_head: head.clone(),
        expected_index_tree: current_index,
    });
    assert_eq!(index_tree(&fixture.root).unwrap(), captured_index);
    assert_eq!(
        fs::read_to_string(fixture.root.join("f.txt")).unwrap(),
        "unstaged\n"
    );
    assert_eq!(
        list_snapshots(&fixture.root).unwrap()["snapshots"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    fixture.request(GitExpansionRequest::SnapshotRescueBranch {
        snapshot_id: snapshot["id"].as_str().unwrap().into(),
        branch: "rescued".into(),
    });
    assert_eq!(pinned(&fixture.root, "rescued").unwrap(), head);
}

#[test]
fn rerere_configuration_uses_compare_and_swap() {
    let fixture = Fixture::new();
    let before = config_bool(&fixture.root, "rerere.enabled").unwrap();
    let result = fixture.request(GitExpansionRequest::RerereConfigure {
        enabled: true,
        expected_enabled: before,
    });
    assert_eq!(result["enabled"], true);
    assert!(execute_request(
        &fixture.root,
        GitExpansionRequest::RerereConfigure {
            enabled: false,
            expected_enabled: before
        }
    )
    .is_err());
}

#[test]
fn worktree_profiles_require_confirmation_registered_target_and_no_overwrite() {
    let fixture = Fixture::new();
    fixture.write("local.env", "setting=value\n");
    let (_, fingerprint) = profiles(&fixture.root).unwrap();
    let profile = WorktreeProfile {
        id: "dev".into(),
        name: "Development".into(),
        copy_files: vec!["local.env".into()],
        commands: vec![],
    };
    fixture.request(GitExpansionRequest::ProfilesSave {
        profiles: vec![profile],
        expected_fingerprint: fingerprint,
    });
    let fingerprint = profiles(&fixture.root).unwrap().1;
    let worktree =
        IsolatedWorktree::create(&fixture.root, &pinned(&fixture.root, "HEAD").unwrap()).unwrap();
    assert!(apply_profile(
        &fixture.root,
        "dev",
        worktree.path.to_str().unwrap(),
        &fingerprint,
        false
    )
    .is_err());
    let result = apply_profile(
        &fixture.root,
        "dev",
        worktree.path.to_str().unwrap(),
        &fingerprint,
        true,
    )
    .unwrap();
    assert_eq!(result["copied"], json!(["local.env"]));
    fs::write(worktree.path.join("local.env"), "keep me").unwrap();
    assert!(apply_profile(
        &fixture.root,
        "dev",
        worktree.path.to_str().unwrap(),
        &fingerprint,
        true
    )
    .is_err());
    assert_eq!(
        fs::read_to_string(worktree.path.join("local.env")).unwrap(),
        "keep me"
    );
    let details = housekeeping(&fixture.root).unwrap();
    assert_eq!(details["worktrees"].as_array().unwrap().len(), 2);
    worktree.close().unwrap();
}

#[test]
fn sparse_checkout_changes_only_clean_pinned_worktree() {
    let fixture = Fixture::new();
    fixture.write("src/code.txt", "code\n");
    fixture.write("docs/guide.txt", "guide\n");
    let head = fixture.commit("directories");
    assert!(sparse_change(&fixture.root, Some(vec!["src".into()]), &head, false).is_err());
    let status = sparse_change(&fixture.root, Some(vec!["src".into()]), &head, true).unwrap();
    assert_eq!(status["enabled"], true);
    assert!(!fixture.root.join("docs/guide.txt").exists());
    assert!(status["omittedTrackedFiles"].as_u64().unwrap() > 0);
    sparse_change(&fixture.root, None, &head, true).unwrap();
    assert!(fixture.root.join("docs/guide.txt").exists());
    fixture.write("f.txt", "local change\n");
    assert!(sparse_change(&fixture.root, Some(vec!["src".into()]), &head, true).is_err());
}

fn branches(fixture: &Fixture, conflict: bool) -> (String, String, String) {
    let base = pinned(&fixture.root, "HEAD").unwrap();
    git(&fixture.root, &["checkout", "-b", "left"]).unwrap();
    fixture.write(if conflict { "f.txt" } else { "left.txt" }, "left\n");
    let left = fixture.commit("left change");
    git(&fixture.root, &["checkout", "-b", "right", &base]).unwrap();
    fixture.write(if conflict { "f.txt" } else { "right.txt" }, "right\n");
    let right = fixture.commit("right change");
    git(&fixture.root, &["checkout", "main"]).unwrap();
    (base, left, right)
}

#[test]
fn integration_reports_real_conflicts_and_preserves_source_worktree() {
    let fixture = Fixture::new();
    let (base, left, right) = branches(&fixture, true);
    fixture.write("local-only.txt", "do not touch\n");
    let before = git(&fixture.root, &["status", "--porcelain=v1"]).unwrap();
    let result = rehearse(
        &fixture.root,
        &base,
        &[
            PlanStep {
                kind: "merge".into(),
                commit: left.clone(),
            },
            PlanStep {
                kind: "merge".into(),
                commit: right.clone(),
            },
        ],
        None,
    )
    .unwrap();
    assert_eq!(result["conflicts"], json!(["f.txt"]));
    assert_eq!(result["steps"][1]["success"], false);
    assert_eq!(pinned(&fixture.root, "HEAD").unwrap(), base);
    assert_eq!(
        git(&fixture.root, &["status", "--porcelain=v1"]).unwrap(),
        before
    );
    assert_eq!(
        crate::git::parse_worktree_list(
            &git(&fixture.root, &["worktree", "list", "--porcelain", "-z"]).unwrap()
        )
        .len(),
        1
    );
    let overlaps = overlap(&fixture.root, &base, &[left, right]).unwrap();
    assert_eq!(overlaps["overlaps"][0]["file"], "f.txt");
}

#[test]
fn successful_plan_is_pinned_and_exports_only_to_new_branch() {
    let fixture = Fixture::new();
    let (base, left, right) = branches(&fixture, false);
    let result = fixture.request(GitExpansionRequest::PlanPreview {
        base: base.clone(),
        steps: vec![
            PlanStep {
                kind: "cherry_pick".into(),
                commit: left,
            },
            PlanStep {
                kind: "merge".into(),
                commit: right,
            },
        ],
    });
    assert!(result["steps"]
        .as_array()
        .unwrap()
        .iter()
        .all(|s| s["success"] == true));
    let plan_id = result["planId"].as_str().unwrap().to_string();
    let exported = fixture.request(GitExpansionRequest::PlanExport {
        plan_id: plan_id.clone(),
        branch: "combined".into(),
        expected_head: base.clone(),
    });
    assert_eq!(exported["head"], result["resultHead"]);
    assert!(execute_request(
        &fixture.root,
        GitExpansionRequest::PlanExport {
            plan_id,
            branch: "main".into(),
            expected_head: base.clone()
        }
    )
    .is_err());
    assert_eq!(pinned(&fixture.root, "HEAD").unwrap(), base);
    assert_eq!(
        git(&fixture.root, &["show", "combined:left.txt"]).unwrap(),
        "left\n"
    );
    assert_eq!(
        git(&fixture.root, &["show", "combined:right.txt"]).unwrap(),
        "right\n"
    );
}

#[test]
fn behavior_comparison_runs_exact_revisions_and_collects_declared_artifacts() {
    let fixture = Fixture::new();
    let base = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write("f.txt", "changed behavior\n");
    let head = fixture.commit("behavior change");
    let command = CommandSpec {
        program: "git".into(),
        args: vec!["show".into(), "HEAD:f.txt".into()],
        timeout_seconds: 10,
    };
    assert!(behavior_compare(
        &fixture.root,
        &base,
        &head,
        &command,
        &["f.txt".into()],
        false
    )
    .is_err());
    let result = behavior_compare(
        &fixture.root,
        &base,
        &head,
        &command,
        &["f.txt".into()],
        true,
    )
    .unwrap();
    assert_eq!(result["sameOutput"], false);
    assert_eq!(result["changedArtifacts"], json!(["f.txt"]));
    assert_eq!(result["base"]["head"], base);
    assert_eq!(result["head"]["head"], head);
    assert_eq!(result["head"]["artifacts"][0]["text"], "changed behavior\n");
    assert_eq!(pinned(&fixture.root, "HEAD").unwrap(), head);
}

#[test]
fn bisect_test_runs_isolated_and_can_mark_exact_tested_commit() {
    let fixture = Fixture::new();
    let good = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write("f.txt", "middle\n");
    fixture.commit("middle");
    fixture.write("f.txt", "last\n");
    let bad = fixture.commit("last");
    git(&fixture.root, &["bisect", "start", &bad, &good]).unwrap();
    let head = pinned(&fixture.root, "HEAD").unwrap();
    let result = bisect_test(
        &fixture.root,
        &CommandSpec {
            program: "git".into(),
            args: vec!["diff".into(), "--exit-code".into()],
            timeout_seconds: 10,
        },
        &head,
        true,
        true,
    )
    .unwrap();
    assert_eq!(result["verdict"], "good");
    assert_eq!(result["marked"], true);
    assert!(result["log"]
        .as_str()
        .unwrap()
        .contains(&format!("git bisect good {head}")));
    git(&fixture.root, &["bisect", "reset"]).unwrap();
}

#[cfg(unix)]
#[test]
fn file_operations_reject_symlinks_and_repository_metadata() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    symlink("/etc/passwd", fixture.root.join("link.txt")).unwrap();
    assert!(read_regular(&fixture.root, "link.txt").is_err());
    assert!(read_regular(&fixture.root, ".git/config").is_err());
    assert!(read_regular(&fixture.root, "../outside").is_err());
    assert!(restore_preview(
        &fixture.root,
        "link.txt".into(),
        Some("HEAD".into()),
        None,
        None
    )
    .is_err());
}

#[cfg(unix)]
#[test]
fn explicit_process_timeout_kills_descendants_and_caps_output() {
    let fixture = Fixture::new();
    let run = run_spec(
        &fixture.root,
        &CommandSpec {
            program: "sh".into(),
            args: vec!["-c".into(), "sleep 30 & wait".into()],
            timeout_seconds: 1,
        },
    )
    .unwrap();
    assert!(run.timed_out);
    assert!(run.duration_ms < 5000);
    let (bytes, truncated) = drain(std::io::Cursor::new(vec![b'x'; OUTPUT_LIMIT + 100]));
    assert_eq!(bytes.len(), OUTPUT_LIMIT);
    assert!(truncated);
}

#[test]
fn unknown_request_fields_and_variants_are_rejected() {
    assert!(serde_json::from_value::<GitExpansionRequest>(json!({"op":"erase_all"})).is_err());
    assert!(serde_json::from_value::<GitExpansionRequest>(
        json!({"op":"integration","base":"HEAD","heads":[],"confirmed":false,"shell":"rm -rf"})
    )
    .is_err());
    assert!(serde_json::from_value::<GitExpansionRequest>(
        json!({"op":"plan_export","planId":"x","branch":"new","expected_head":"HEAD"})
    )
    .is_err());
}

#[test]
fn historical_restore_keeps_binary_bytes_and_rejects_binary_line_selection() {
    let fixture = Fixture::new();
    fs::write(fixture.root.join("f.txt"), [0xff, b'\n']).unwrap();
    let source = fixture.commit("invalid UTF8");
    fixture.write("f.txt", "safe current text\n");
    fixture.commit("text version");
    assert!(restore_preview(
        &fixture.root,
        "f.txt".into(),
        Some(source.clone()),
        None,
        Some(LineSelection {
            source_start: 1,
            source_end: 1,
            target_start: 1,
            target_end: 1
        })
    )
    .is_err());
    let preview = restore_preview(&fixture.root, "f.txt".into(), Some(source), None, None).unwrap();
    assert_eq!(preview["binary"], true);
    restore_apply(
        &fixture.root,
        preview["id"].as_str().unwrap(),
        preview["fingerprint"].as_str().unwrap(),
    )
    .unwrap();
    assert_eq!(fs::read(fixture.root.join("f.txt")).unwrap(), [0xff, b'\n']);
}

#[cfg(unix)]
#[test]
fn isolated_checkout_disables_external_filters_and_hooks() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = Fixture::new();
    fixture.write(".gitattributes", "f.txt filter=external\n");
    let head = fixture.commit("filtered file");
    let marker = fixture.root.join("must-not-exist");
    run_git(
        &fixture.root,
        &[
            "config",
            "filter.external.smudge",
            &format!("touch '{}'", marker.display()),
        ],
    )
    .unwrap();
    run_git(
        &fixture.root,
        &["config", "filter.external.required", "true"],
    )
    .unwrap();
    let hook = fixture.root.join(".git/hooks/post-checkout");
    fs::write(&hook, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    let worktree = IsolatedWorktree::create(&fixture.root, &head).unwrap();
    assert!(!marker.exists());
    assert_eq!(
        fs::read_to_string(worktree.path.join("f.txt")).unwrap(),
        "one\ntwo\nthree\n"
    );
    worktree.close().unwrap();
    assert!(!marker.exists());
}

#[test]
fn deleted_snapshot_source_restores_deletion_only_for_selected_file() {
    let fixture = Fixture::new();
    let head = pinned(&fixture.root, "HEAD").unwrap();
    fs::remove_file(fixture.root.join("f.txt")).unwrap();
    let snapshot = capture(&fixture.root, "deleted file".into(), &head).unwrap();
    fixture.write("f.txt", "recreated\n");
    fixture.write("keep.txt", "preserve\n");
    let preview = restore_preview(
        &fixture.root,
        "f.txt".into(),
        None,
        Some(snapshot["id"].as_str().unwrap().into()),
        None,
    )
    .unwrap();
    assert_eq!(preview["deleteFile"], true);
    restore_apply(
        &fixture.root,
        preview["id"].as_str().unwrap(),
        preview["fingerprint"].as_str().unwrap(),
    )
    .unwrap();
    assert!(!fixture.root.join("f.txt").exists());
    assert_eq!(
        fs::read_to_string(fixture.root.join("keep.txt")).unwrap(),
        "preserve\n"
    );
}

#[test]
fn radar_includes_uncommitted_changes_in_distinct_worktrees_at_same_head() {
    let fixture = Fixture::new();
    let head = pinned(&fixture.root, "HEAD").unwrap();
    let left = IsolatedWorktree::create(&fixture.root, &head).unwrap();
    let right = IsolatedWorktree::create(&fixture.root, &head).unwrap();
    fs::write(left.path.join("f.txt"), "left pending\n").unwrap();
    fs::write(right.path.join("f.txt"), "right pending\n").unwrap();
    let evidence = worktree_overlap(&fixture.root, &head).unwrap();
    assert_eq!(evidence["errors"], json!([]));
    let overlap = evidence["overlaps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|overlap| overlap["file"] == "f.txt")
        .unwrap();
    assert_eq!(overlap["worktreePaths"].as_array().unwrap().len(), 2);
    assert!(evidence["worktrees"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|w| w["path"] != fixture.root.to_str().unwrap())
        .all(|w| w["pendingFiles"] == json!(["f.txt"])));
    left.close().unwrap();
    right.close().unwrap();
}

#[test]
fn restore_refuses_a_branch_switch_even_when_head_and_file_are_unchanged() {
    let fixture = Fixture::new();
    let preview = restore_preview(
        &fixture.root,
        "f.txt".into(),
        Some("HEAD".into()),
        None,
        None,
    )
    .unwrap();
    git(&fixture.root, &["checkout", "-b", "same-head-other-branch"]).unwrap();
    assert_eq!(
        pinned(&fixture.root, "HEAD").unwrap(),
        preview["head"].as_str().unwrap()
    );
    assert!(restore_apply(
        &fixture.root,
        preview["id"].as_str().unwrap(),
        preview["fingerprint"].as_str().unwrap()
    )
    .is_err());
}

#[test]
fn source_files_reads_dirty_bytes_and_reports_missing_binary_and_budget_omissions() {
    let fixture = Fixture::new();
    let head = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write("f.txt", "import './dirty-source';\n");
    fs::write(fixture.root.join("binary.bin"), [0u8, 255]).unwrap();
    fs::write(
        fixture.root.join("oversize.ts"),
        vec![b'x'; 1024 * 1024 + 1],
    )
    .unwrap();
    let result = source_files(
        &fixture.root,
        vec![
            "f.txt".into(),
            "missing.ts".into(),
            "binary.bin".into(),
            "oversize.ts".into(),
            "../outside".into(),
            ".git/config".into(),
        ],
        &head,
    )
    .unwrap();
    assert_eq!(result["head"], head);
    assert_eq!(result["files"].as_array().unwrap().len(), 1);
    assert_eq!(result["files"][0]["text"], "import './dirty-source';\n");
    assert_eq!(
        result["files"][0]["fingerprint"],
        format!("sha256:{}", digest(b"import './dirty-source';\n"))
    );
    assert_eq!(result["omitted"].as_array().unwrap().len(), 5);
    assert_eq!(result["truncated"], true);
    assert!(source_files(&fixture.root, vec!["f.txt".into(); 501], &head).is_err());
    assert!(source_files(&fixture.root, vec!["f.txt".into()], &"0".repeat(40)).is_err());
}

#[test]
fn source_files_enforces_total_returned_source_budget() {
    let fixture = Fixture::new();
    let head = pinned(&fixture.root, "HEAD").unwrap();
    let mut files = Vec::new();
    for index in 0..9 {
        let file = format!("source-{index}.ts");
        fs::write(fixture.root.join(&file), vec![b'x'; 1024 * 1024]).unwrap();
        files.push(file);
    }
    let result = source_files(&fixture.root, files, &head).unwrap();
    let returned = result["files"].as_array().unwrap();
    assert_eq!(returned.len(), 8);
    assert_eq!(
        returned
            .iter()
            .map(|file| file["text"].as_str().unwrap().len())
            .sum::<usize>(),
        8 * 1024 * 1024
    );
    assert_eq!(result["omitted"][0]["path"], "source-8.ts");
    assert_eq!(result["truncated"], true);
}

#[cfg(unix)]
#[test]
fn source_files_does_not_follow_symlinks_or_run_filters() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let head = pinned(&fixture.root, "HEAD").unwrap();
    fixture.write(".gitattributes", "f.txt filter=untrusted\n");
    run_git(
        &fixture.root,
        &["config", "filter.untrusted.smudge", "false"],
    )
    .unwrap();
    run_git(
        &fixture.root,
        &["config", "filter.untrusted.required", "true"],
    )
    .unwrap();
    symlink("/etc/passwd", fixture.root.join("outside-link.ts")).unwrap();
    let result = source_files(
        &fixture.root,
        vec!["outside-link.ts".into(), "f.txt".into()],
        &head,
    )
    .unwrap();
    assert_eq!(result["omitted"].as_array().unwrap().len(), 1);
    assert_eq!(result["omitted"][0]["path"], "outside-link.ts");
    assert_eq!(result["files"][0]["text"], "one\ntwo\nthree\n");
}

#[tokio::test]
async fn evidence_run_tests_actual_dirty_worktree_and_matches_agent_review_fingerprint() {
    let fixture = Fixture::new();
    let base_head = pinned(&fixture.root, "HEAD").unwrap();
    let worktree = IsolatedWorktree::create(&fixture.root, &base_head).unwrap();
    git(&worktree.path, &["checkout", "-b", "agents/evidence"]).unwrap();
    fs::write(worktree.path.join("f.txt"), "actual dirty agent bytes\n").unwrap();
    fs::write(worktree.path.join("new.txt"), "untracked agent output\n").unwrap();
    let summary = crate::agent_review::agent_review_summary(
        worktree.path.to_str().unwrap().into(),
        fixture.root.to_str().unwrap().into(),
        Some(true),
    )
    .await
    .unwrap();
    let fingerprint = summary.fingerprint.unwrap();
    let command = CommandSpec {
        program: "git".into(),
        args: vec!["diff".into(), "--".into(), "f.txt".into()],
        timeout_seconds: 10,
    };
    let result = evidence_run(
        &worktree.path,
        fixture.root.to_str().unwrap(),
        &base_head,
        &base_head,
        &fingerprint,
        &command,
        true,
    )
    .unwrap();
    assert!(result["run"]["stdout"]
        .as_str()
        .unwrap()
        .contains("actual dirty agent bytes"));
    assert_eq!(result["before"]["worktreeFingerprint"], fingerprint);
    assert_eq!(result["before"], result["after"]);
    assert_eq!(result["stale"], false);
    assert_eq!(result["afterError"], Value::Null);
    assert_eq!(
        fs::read_to_string(worktree.path.join("f.txt")).unwrap(),
        "actual dirty agent bytes\n"
    );
    assert!(result["files"]
        .as_array()
        .unwrap()
        .contains(&json!("new.txt")));
    let mutate = CommandSpec {
        program: "git".into(),
        args: vec!["add".into(), "--".into(), "f.txt".into()],
        timeout_seconds: 10,
    };
    let changed = evidence_run(
        &worktree.path,
        fixture.root.to_str().unwrap(),
        &base_head,
        &base_head,
        &fingerprint,
        &mutate,
        true,
    )
    .unwrap();
    assert_eq!(changed["run"]["exitCode"], 0);
    assert_eq!(changed["stale"], true);
    assert_ne!(
        changed["before"]["worktreeFingerprint"],
        changed["after"]["worktreeFingerprint"]
    );
    worktree.close().unwrap();
}

#[tokio::test]
async fn evidence_run_rejects_stale_content_or_missing_confirmation_before_execution() {
    let fixture = Fixture::new();
    let base_head = pinned(&fixture.root, "HEAD").unwrap();
    let worktree = IsolatedWorktree::create(&fixture.root, &base_head).unwrap();
    git(&worktree.path, &["checkout", "-b", "agents/stale-evidence"]).unwrap();
    fs::write(worktree.path.join("f.txt"), "dirty A\n").unwrap();
    let summary = crate::agent_review::agent_review_summary(
        worktree.path.to_str().unwrap().into(),
        fixture.root.to_str().unwrap().into(),
        Some(true),
    )
    .await
    .unwrap();
    let fingerprint = summary.fingerprint.unwrap();
    let before_index = index_tree(&worktree.path).unwrap();
    let command = CommandSpec {
        program: "git".into(),
        args: vec!["add".into(), "--".into(), "f.txt".into()],
        timeout_seconds: 10,
    };
    assert!(evidence_run(
        &worktree.path,
        fixture.root.to_str().unwrap(),
        &base_head,
        &base_head,
        &fingerprint,
        &command,
        false
    )
    .is_err());
    fs::write(worktree.path.join("f.txt"), "dirty B\n").unwrap();
    let error = evidence_run(
        &worktree.path,
        fixture.root.to_str().unwrap(),
        &base_head,
        &base_head,
        &fingerprint,
        &command,
        true,
    )
    .unwrap_err();
    assert!(error.contains("stale"));
    assert_eq!(index_tree(&worktree.path).unwrap(), before_index);
    assert_eq!(
        fs::read_to_string(worktree.path.join("f.txt")).unwrap(),
        "dirty B\n"
    );
    worktree.close().unwrap();
}
