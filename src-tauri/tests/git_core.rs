mod common;

use common::{find_entry, json, TestRepo};
use l8git_lib::git;

fn lines() -> String {
    (1..=20).map(|n| format!("l{n}\n")).collect()
}

/// Two edits far enough apart that `git diff` emits two separate hunks.
fn lines_edited() -> String {
    (1..=20)
        .map(|n| match n {
            2 => "L2X\n".to_string(),
            18 => "L18X\n".to_string(),
            _ => format!("l{n}\n"),
        })
        .collect()
}

fn first_hunk(diff: &str) -> String {
    let mut out = String::new();
    let mut seen_hunk = false;
    for line in diff.split_inclusive('\n') {
        if line.starts_with("@@") {
            if seen_hunk {
                break;
            }
            seen_hunk = true;
        }
        out.push_str(line);
    }
    assert!(seen_hunk, "diff has no hunk:\n{diff}");
    out
}

#[tokio::test]
async fn full_status_classifies_index_and_worktree_states() {
    let repo = TestRepo::new("status-mix");
    repo.write("staged.txt", "one\n");
    repo.write("dirty.txt", "one\n");
    repo.write("gone.txt", "one\n");
    repo.commit_all("initial");

    repo.write("staged.txt", "two\nthree\n");
    repo.git(&["add", "--", "staged.txt"]);
    repo.write("dirty.txt", "two\n");
    repo.write("fresh.txt", "new\n");
    repo.write("added.txt", "added\n");
    repo.git(&["add", "--", "added.txt"]);
    repo.git(&["rm", "-q", "--", "gone.txt"]);

    let status = git::repo_full_status(repo.s()).await.unwrap();
    let entries = json(&status.entries);

    let staged = find_entry(&entries, "staged.txt");
    assert_eq!(staged["index_status"], "M");
    assert_eq!(staged["worktree_status"], " ");
    assert_eq!(staged["staged"], true);
    assert_eq!(staged["unstaged"], false);
    assert_eq!(staged["additions_staged"], 2);
    assert_eq!(staged["deletions_staged"], 1);

    let dirty = find_entry(&entries, "dirty.txt");
    assert_eq!(dirty["index_status"], " ");
    assert_eq!(dirty["worktree_status"], "M");
    assert_eq!(dirty["staged"], false);
    assert_eq!(dirty["unstaged"], true);
    assert_eq!(dirty["additions_unstaged"], 1);
    assert_eq!(dirty["deletions_unstaged"], 1);

    let fresh = find_entry(&entries, "fresh.txt");
    assert_eq!(fresh["untracked"], true);
    assert_eq!(fresh["staged"], false);
    assert_eq!(fresh["unstaged"], false);
    assert_eq!(fresh["additions_unstaged"], 1);

    let added = find_entry(&entries, "added.txt");
    assert_eq!(added["index_status"], "A");
    assert_eq!(added["staged"], true);

    let gone = find_entry(&entries, "gone.txt");
    assert_eq!(gone["index_status"], "D");
    assert_eq!(gone["deletions_staged"], 1);

    assert_eq!(status.has_upstream, false);
    assert_eq!(status.upstream_sync.ahead, 0);
    assert_eq!(status.upstream_sync.behind, 0);
}

#[tokio::test]
async fn full_status_collapses_rename_into_single_entry() {
    let repo = TestRepo::new("status-rename");
    repo.write("old.txt", "a\nb\nc\nd\ne\nf\ng\nh\n");
    repo.commit_all("initial");
    repo.git(&["mv", "old.txt", "new.txt"]);

    let status = git::repo_full_status(repo.s()).await.unwrap();
    let entries = json(&status.entries);
    let arr = entries.as_array().unwrap();

    assert_eq!(arr.len(), 1, "rename must not leak the old path: {entries}");
    let renamed = find_entry(&entries, "new.txt");
    assert_eq!(renamed["index_status"], "R");
    assert_eq!(renamed["staged"], true);
    assert_eq!(renamed["additions_staged"], 0);
    assert_eq!(renamed["deletions_staged"], 0);
}

#[tokio::test]
async fn full_status_marks_conflicted_file_as_staged_and_unstaged() {
    let repo = common::conflicting_repo("status-conflict");
    let (ok, _) = repo.try_git(&["merge", "--no-edit", "feature"]);
    assert!(!ok, "merge was expected to conflict");

    let status = git::repo_full_status(repo.s()).await.unwrap();
    let entries = json(&status.entries);
    let conflicted = find_entry(&entries, "shared.txt");
    assert_eq!(conflicted["index_status"], "U");
    assert_eq!(conflicted["worktree_status"], "U");
    assert_eq!(conflicted["staged"], true);
    assert_eq!(conflicted["unstaged"], true);
    assert_eq!(conflicted["untracked"], false);
}

#[tokio::test]
async fn full_status_flags_binary_and_embedded_repositories() {
    let repo = TestRepo::new("status-binary");
    repo.commit("a.txt", "hi\n", "initial");

    repo.write_bytes("staged.bin", &[0x41, 0x00, 0x42, 0x00]);
    repo.git(&["add", "--", "staged.bin"]);
    repo.write_bytes("loose.bin", &[0x00, 0x01, 0x02]);
    let nested = repo.path.join("nested");
    std::fs::create_dir_all(&nested).unwrap();
    let (ok, out) = common::git_raw(&nested, &["-c", "init.defaultBranch=main", "init", "-q", "."]);
    assert!(ok, "{out}");
    std::fs::write(nested.join("inner.txt"), "x\n").unwrap();

    let status = git::repo_full_status(repo.s()).await.unwrap();
    let entries = json(&status.entries);

    assert_eq!(find_entry(&entries, "staged.bin")["binary"], true);
    let loose = find_entry(&entries, "loose.bin");
    assert_eq!(loose["binary"], true);
    assert_eq!(loose["additions_unstaged"], 0);

    let nested_entry = find_entry(&entries, "nested/");
    assert_eq!(nested_entry["embedded_repo"], true);
    assert_eq!(nested_entry["untracked"], true);
    assert_eq!(nested_entry["binary"], false);
}

#[tokio::test]
async fn stage_and_unstage_files_move_changes_between_index_and_worktree() {
    let repo = TestRepo::new("stage-files");
    repo.commit("a.txt", "one\n", "initial");
    repo.write("a.txt", "two\n");
    repo.write("b.txt", "brand new\n");

    git::stage_files(repo.s(), vec!["a.txt".into(), "b.txt".into()])
        .await
        .unwrap();
    let staged = json(&git::repo_full_status(repo.s()).await.unwrap().entries);
    assert_eq!(find_entry(&staged, "a.txt")["index_status"], "M");
    assert_eq!(find_entry(&staged, "b.txt")["index_status"], "A");

    git::unstage_files(repo.s(), vec!["a.txt".into(), "b.txt".into()])
        .await
        .unwrap();
    let unstaged = json(&git::repo_full_status(repo.s()).await.unwrap().entries);
    assert_eq!(find_entry(&unstaged, "a.txt")["worktree_status"], "M");
    assert_eq!(find_entry(&unstaged, "a.txt")["staged"], false);
    assert_eq!(find_entry(&unstaged, "b.txt")["untracked"], true);
}

#[tokio::test]
async fn unstage_files_works_before_the_first_commit() {
    let repo = TestRepo::new("stage-no-head");
    repo.write("a.txt", "one\n");
    git::stage_files(repo.s(), vec!["a.txt".into()]).await.unwrap();
    assert!(repo.porcelain().starts_with("A "));

    git::unstage_files(repo.s(), vec!["a.txt".into()]).await.unwrap();
    assert_eq!(repo.porcelain(), "?? a.txt");
    assert!(repo.exists("a.txt"));
}

#[tokio::test]
async fn stage_hunk_stages_only_the_selected_hunk() {
    let repo = TestRepo::new("stage-hunk");
    repo.commit("f.txt", &lines(), "initial");
    repo.write("f.txt", &lines_edited());

    let diff = repo.git_out(&["diff", "--no-color", "--", "f.txt"]);
    let patch = first_hunk(&diff);
    assert!(patch.contains("+L2X"), "{patch}");
    assert!(!patch.contains("+L18X"), "{patch}");

    git::stage_hunk(repo.s(), patch).await.unwrap();

    let staged_diff = git::repo_staged_diff(repo.s()).await.unwrap();
    assert!(staged_diff.contains("+L2X"), "{staged_diff}");
    assert!(!staged_diff.contains("+L18X"), "{staged_diff}");

    let unstaged_diff = repo.git_out(&["diff", "--no-color", "--", "f.txt"]);
    assert!(unstaged_diff.contains("+L18X"), "{unstaged_diff}");
    assert!(!unstaged_diff.contains("+L2X"), "{unstaged_diff}");
}

#[tokio::test]
async fn unstage_hunk_reverses_only_the_selected_hunk() {
    let repo = TestRepo::new("unstage-hunk");
    repo.commit("f.txt", &lines(), "initial");
    repo.write("f.txt", &lines_edited());
    repo.git(&["add", "--", "f.txt"]);

    let cached = repo.git_out(&["diff", "--cached", "--no-color", "--", "f.txt"]);
    let patch = first_hunk(&cached);
    git::unstage_hunk(repo.s(), patch).await.unwrap();

    let staged_diff = git::repo_staged_diff(repo.s()).await.unwrap();
    assert!(!staged_diff.contains("+L2X"), "{staged_diff}");
    assert!(staged_diff.contains("+L18X"), "{staged_diff}");
    assert_eq!(repo.read("f.txt"), lines_edited());
}

#[tokio::test]
async fn stage_hunk_rejects_a_patch_that_does_not_apply() {
    let repo = TestRepo::new("stage-hunk-bad");
    repo.commit("f.txt", &lines(), "initial");

    let bogus = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n does-not-exist\n-nope\n+yep\n";
    let err = git::stage_hunk(repo.s(), bogus.to_string()).await.unwrap_err();
    assert!(!err.is_empty());
    assert_eq!(repo.porcelain(), "");
}

#[tokio::test]
async fn discard_hunk_reverts_one_hunk_in_the_worktree() {
    let repo = TestRepo::new("discard-hunk");
    repo.commit("f.txt", &lines(), "initial");
    repo.write("f.txt", &lines_edited());

    let patch = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,5 +1,5 @@\n l1\n-L2X\n+l2\n l3\n l4\n l5\n";
    git::discard_hunk(repo.s(), patch.to_string()).await.unwrap();

    let content = repo.read("f.txt");
    assert!(content.contains("l2\n"), "{content}");
    assert!(!content.contains("L2X"), "{content}");
    assert!(content.contains("L18X"), "{content}");
}

#[tokio::test]
async fn commit_changes_requires_a_message_and_creates_a_commit() {
    let repo = TestRepo::new("commit");
    repo.commit("a.txt", "one\n", "initial");
    repo.write("a.txt", "two\n");
    repo.git(&["add", "--", "a.txt"]);

    let err = git::commit_changes(repo.s(), "   ".into()).await.unwrap_err();
    assert!(err.contains("leer"), "{err}");
    assert_eq!(repo.subjects(), vec!["initial"]);

    git::commit_changes(repo.s(), "  second change  ".into())
        .await
        .unwrap();
    assert_eq!(repo.subjects(), vec!["second change", "initial"]);
    assert_eq!(repo.porcelain(), "");
}

#[tokio::test]
async fn commit_amend_rewrites_head_without_adding_a_commit() {
    let repo = TestRepo::new("amend");
    repo.commit("a.txt", "one\n", "initial");
    let first = repo.commit("b.txt", "two\n", "second");

    repo.write("b.txt", "two-fixed\n");
    repo.git(&["add", "--", "b.txt"]);
    git::commit_amend(repo.s(), "second, fixed".into())
        .await
        .unwrap();

    assert_eq!(repo.subjects(), vec!["second, fixed", "initial"]);
    assert_ne!(repo.head(), first);
    assert_eq!(
        repo.git(&["show", "HEAD:b.txt"]),
        "two-fixed"
    );
    assert!(git::commit_amend(repo.s(), "".into()).await.is_err());
}

#[tokio::test]
async fn repo_file_content_at_reads_history_index_and_missing_files() {
    let repo = TestRepo::new("content-at");
    repo.commit("a.txt", "v1\n", "c1");
    repo.commit("a.txt", "v2\n", "c2");
    repo.write("a.txt", "v3-index\n");
    repo.git(&["add", "--", "a.txt"]);

    assert_eq!(
        git::repo_file_content_at(repo.s(), "a.txt".into(), "HEAD".into())
            .await
            .unwrap(),
        "v2"
    );
    assert_eq!(
        git::repo_file_content_at(repo.s(), "a.txt".into(), "HEAD~1".into())
            .await
            .unwrap(),
        "v1"
    );
    assert_eq!(
        git::repo_file_content_at(repo.s(), "a.txt".into(), "".into())
            .await
            .unwrap(),
        "v3-index"
    );
    assert_eq!(
        git::repo_file_content_at(repo.s(), "nope.txt".into(), "HEAD".into())
            .await
            .unwrap(),
        ""
    );
}

#[tokio::test]
async fn repo_file_diff_separates_staged_unstaged_untracked_and_binary() {
    let repo = TestRepo::new("file-diff");
    repo.commit("f.txt", &lines(), "initial");
    repo.write("f.txt", &lines_edited());
    repo.git(&["add", "--", "f.txt"]);
    repo.write("f.txt", &format!("{}extra\n", lines_edited()));

    let both = json(&git::repo_file_diff(repo.s(), "f.txt".into(), false).await.unwrap());
    assert!(both["staged"].as_str().unwrap().contains("+L2X"));
    assert!(both["unstaged"].as_str().unwrap().contains("+extra"));
    assert_eq!(both["is_binary"], false);
    assert!(both["untracked_plain"].is_null());

    repo.write("plain.txt", "raw content\n");
    let untracked = json(&git::repo_file_diff(repo.s(), "plain.txt".into(), true).await.unwrap());
    assert_eq!(untracked["untracked_plain"], "raw content\n");
    assert_eq!(untracked["is_binary"], false);

    repo.write_bytes("blob.bin", &[0x00, 0x01, 0x02, 0x00]);
    let binary = json(&git::repo_file_diff(repo.s(), "blob.bin".into(), true).await.unwrap());
    assert_eq!(binary["is_binary"], true);
    assert!(binary["untracked_plain"].is_null());
}

#[tokio::test]
async fn repo_file_diff_reports_binary_for_tracked_blobs() {
    let repo = TestRepo::new("file-diff-binary");
    repo.write_bytes("blob.bin", &[0x00, 0x01, 0x02, 0x00]);
    repo.commit_all("initial");
    repo.write_bytes("blob.bin", &[0x00, 0x09, 0x09, 0x00, 0x07]);

    let res = json(&git::repo_file_diff(repo.s(), "blob.bin".into(), false).await.unwrap());
    assert_eq!(res["is_binary"], true);
    assert!(res["staged"].is_null());
    assert!(res["unstaged"].is_null());
}

#[tokio::test]
async fn repo_search_commits_matches_subject_author_email_and_hash() {
    let repo = TestRepo::new("search-fields");
    let first = repo.commit("a.txt", "1\n", "add login form");
    repo.git(&["config", "user.name", "Alice Cooper"]);
    repo.git(&["config", "user.email", "alice@corp.example"]);
    repo.commit("b.txt", "2\n", "fix parser crash");

    let by_subject = git::repo_search_commits(repo.s(), "LOGIN".into(), 0, 20, None, None, None)
        .await
        .unwrap();
    assert_eq!(by_subject.len(), 1);
    assert_eq!(json(&by_subject[0].commit)["subject"], "add login form");

    let by_author = git::repo_search_commits(repo.s(), "alice c".into(), 0, 20, None, None, None)
        .await
        .unwrap();
    assert_eq!(by_author.len(), 1);
    assert_eq!(json(&by_author[0].commit)["subject"], "fix parser crash");

    let by_email = git::repo_search_commits(repo.s(), "corp.example".into(), 0, 20, Some(true), Some(false), None)
        .await
        .unwrap();
    assert_eq!(by_email.len(), 1);

    let by_hash = git::repo_search_commits(repo.s(), first[..8].to_string(), 0, 20, None, Some(false), None)
        .await
        .unwrap();
    assert_eq!(by_hash.len(), 1);
    assert_eq!(json(&by_hash[0].commit)["hash"], first);
}

#[tokio::test]
async fn repo_search_commits_ignores_queries_below_the_minimum_length() {
    let repo = TestRepo::new("search-min");
    repo.commit("a.txt", "1\n", "aaa bbb");

    assert!(git::repo_search_commits(repo.s(), "a".into(), 0, 20, None, None, None)
        .await
        .unwrap()
        .is_empty());
    assert!(git::repo_search_commits(repo.s(), " ".into(), 0, 20, None, None, None)
        .await
        .unwrap()
        .is_empty());
    assert_eq!(
        git::repo_search_commits(repo.s(), "aa".into(), 0, 20, None, None, None)
            .await
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn repo_search_commits_errors_outside_a_repository() {
    let dir = common::scratch_path("search-not-a-repo");
    std::fs::create_dir_all(&dir).unwrap();
    let err = common::expect_err(
        git::repo_search_commits(
            dir.to_string_lossy().to_string(),
            "anything".into(),
            0,
            20,
            None,
            None,
            None,
        )
        .await,
    );
    assert!(err.contains("is not a git repository"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn repo_search_commits_finds_commits_by_touched_path() {
    let repo = TestRepo::new("search-paths");
    repo.commit("src/deep/module.ts", "export {}\n", "unrelated subject");
    repo.commit("docs/readme.md", "docs\n", "another subject");

    let hits = git::repo_search_commits(repo.s(), "module.ts".into(), 0, 20, None, None, None)
        .await
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(json(&hits[0].commit)["subject"], "unrelated subject");

    let no_paths = git::repo_search_commits(repo.s(), "module.ts".into(), 0, 20, None, Some(false), None)
        .await
        .unwrap();
    assert!(no_paths.is_empty(), "path search must be opt-out-able");
}

#[tokio::test]
async fn repo_search_commits_should_report_matched_paths() {
    let repo = TestRepo::new("search-paths-bug");
    repo.commit("src/deep/module.ts", "export {}\n", "unrelated subject");
    repo.commit(
        "src/other.ts",
        "export {}\n",
        "body carries paths\n\nsrc/deep/module.ts\n\nnot a real path list\n",
    );

    let hits = git::repo_search_commits(repo.s(), "module.ts".into(), 0, 20, None, None, None)
        .await
        .unwrap();
    assert_eq!(hits.len(), 2);

    let by_path = hits
        .iter()
        .find(|h| json(&h.commit)["subject"] == "unrelated subject")
        .expect("commit touching the file must be found");
    assert_eq!(
        json(&by_path.commit)["body"], "",
        "the commit body must not contain the changed file list"
    );
    assert_eq!(by_path.matched_paths, vec!["src/deep/module.ts".to_string()]);

    let by_body = hits
        .iter()
        .find(|h| json(&h.commit)["subject"] == "body carries paths")
        .expect("commit mentioning the path in its body must be found");
    let body = json(&by_body.commit)["body"].as_str().unwrap_or_default().to_string();
    assert!(
        body.contains("src/deep/module.ts") && body.contains("not a real path list"),
        "a multi-line body must survive intact, got {body:?}"
    );
    assert!(
        !body.contains("src/other.ts"),
        "the changed file list must not leak into the body, got {body:?}"
    );
    assert!(
        by_body.matched_paths.is_empty(),
        "path-looking body lines must not become matched paths, got {:?}",
        by_body.matched_paths
    );
}

#[tokio::test]
async fn repo_search_commits_applies_skip_and_limit_to_matches() {
    let repo = TestRepo::new("search-page");
    for n in 1..=5 {
        repo.commit(&format!("f{n}.txt"), "x\n", &format!("feat number {n}"));
    }

    let all = git::repo_search_commits(repo.s(), "feat".into(), 0, 20, None, Some(false), None)
        .await
        .unwrap();
    assert_eq!(all.len(), 5);
    assert_eq!(json(&all[0].commit)["subject"], "feat number 5");

    let page = git::repo_search_commits(repo.s(), "feat".into(), 2, 2, None, Some(false), None)
        .await
        .unwrap();
    assert_eq!(page.len(), 2);
    assert_eq!(json(&page[0].commit)["subject"], "feat number 3");
    assert_eq!(json(&page[1].commit)["subject"], "feat number 2");
}

#[tokio::test]
async fn repo_search_commits_honours_the_scan_limit() {
    let repo = TestRepo::new("search-scan");
    repo.commit("old.txt", "x\n", "needle in the haystack");
    for n in 1..=10 {
        repo.commit(&format!("f{n}.txt"), "x\n", &format!("filler {n}"));
    }

    let shallow = git::repo_search_commits(repo.s(), "needle".into(), 0, 20, None, Some(false), Some(3))
        .await
        .unwrap();
    assert!(shallow.is_empty(), "scan_limit must bound how much history is read");

    let deep = git::repo_search_commits(repo.s(), "needle".into(), 0, 20, None, Some(false), Some(500))
        .await
        .unwrap();
    assert_eq!(deep.len(), 1);
}

#[tokio::test]
async fn repo_blame_maps_every_line_to_its_introducing_commit() {
    let repo = TestRepo::new("blame");
    let first = repo.commit("f.txt", "alpha\nbeta\n", "first commit");
    repo.git(&["config", "user.name", "Second Author"]);
    let second = repo.commit("f.txt", "alpha\nbeta\ngamma\n", "second commit");

    let entries = git::repo_blame(repo.s(), "f.txt".into(), None).await.unwrap();
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].line_no, 1);
    assert_eq!(entries[0].content, "alpha");
    assert_eq!(entries[0].commit_hash, first);
    assert_eq!(entries[0].author, "Test User");
    assert_eq!(entries[0].summary, "first commit");
    assert_eq!(entries[0].short_hash, first[..8]);
    assert!(entries[0].timestamp > 0);

    assert_eq!(entries[2].line_no, 3);
    assert_eq!(entries[2].content, "gamma");
    assert_eq!(entries[2].commit_hash, second);
    assert_eq!(entries[2].author, "Second Author");

    let historic = git::repo_blame(repo.s(), "f.txt".into(), Some(first.clone()))
        .await
        .unwrap();
    assert_eq!(historic.len(), 2);
}

#[tokio::test]
async fn repo_commit_inspect_lists_changed_files_with_line_counts() {
    let repo = TestRepo::new("inspect");
    repo.commit("keep.txt", "a\n", "initial");
    repo.write("keep.txt", "a\nb\n");
    repo.write("added.txt", "x\ny\n");
    repo.commit_all("touch two files");

    let inspect = git::repo_commit_inspect(repo.s(), "HEAD".into()).await.unwrap();
    assert!(inspect.header.contains("touch two files"), "{}", inspect.header);
    let mut paths: Vec<&str> = inspect.files.iter().map(|f| f.path.as_str()).collect();
    paths.sort();
    assert_eq!(paths, vec!["added.txt", "keep.txt"]);
    let added = inspect.files.iter().find(|f| f.path == "added.txt").unwrap();
    assert_eq!(added.additions, 2);
    assert_eq!(added.deletions, 0);
    assert_eq!(added.binary, false);
}

#[tokio::test]
async fn git_discard_files_restores_tracked_files_and_deletes_untracked_ones() {
    let repo = TestRepo::new("discard-files");
    repo.commit("tracked.txt", "original\n", "initial");
    repo.write("tracked.txt", "modified\n");
    repo.git(&["add", "--", "tracked.txt"]);
    repo.write("junk.txt", "junk\n");
    std::fs::create_dir_all(repo.path.join("junkdir")).unwrap();
    repo.write("junkdir/inner.txt", "junk\n");

    git::git_discard_files(
        repo.s(),
        vec!["tracked.txt".into(), "junk.txt".into(), "junkdir".into()],
        vec![false, true, true],
    )
    .await
    .unwrap();

    assert_eq!(repo.read("tracked.txt"), "original\n");
    assert!(!repo.exists("junk.txt"));
    assert!(!repo.exists("junkdir"));
    assert_eq!(repo.porcelain(), "");

    let err = git::git_discard_files(repo.s(), vec!["a".into()], vec![])
        .await
        .unwrap_err();
    assert!(err.contains("untracked"), "{err}");
}

#[tokio::test]
async fn git_discard_worktree_changes_keeps_the_staged_version() {
    let repo = TestRepo::new("discard-worktree");
    repo.commit("f.txt", "v1\n", "initial");
    repo.write("f.txt", "v2\n");
    repo.git(&["add", "--", "f.txt"]);
    repo.write("f.txt", "v3\n");

    git::git_discard_worktree_changes(repo.s(), vec!["f.txt".into()], vec![false])
        .await
        .unwrap();

    assert_eq!(repo.read("f.txt"), "v2\n");
    assert_eq!(repo.porcelain(), "M  f.txt");
}

#[tokio::test]
async fn open_repo_reports_branch_commits_branches_and_tags() {
    let repo = TestRepo::new("open-repo");
    repo.commit("a.txt", "1\n", "first");
    repo.commit("b.txt", "2\n", "second");
    repo.git(&["tag", "v1.0.0"]);
    repo.git(&["branch", "side"]);

    let info = json(&git::open_repo(repo.s(), None).await.unwrap());
    assert_eq!(info["branch"], "main");
    let commits = info["commits"].as_array().unwrap();
    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0]["subject"], "second");
    assert_eq!(commits[0]["author"], "Test User");
    assert_eq!(commits[1]["tags"].as_array().unwrap().len(), 0);
    assert_eq!(commits[0]["tags"][0], "v1.0.0");
    assert!(commits[0]["date"].as_str().unwrap().contains('T'));
    assert_eq!(commits[0]["parents"][0], commits[1]["hash"]);

    let names: Vec<&str> = info["branches"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"main"), "{names:?}");
    assert!(names.contains(&"side"), "{names:?}");

    assert_eq!(info["tags"][0]["name"], "v1.0.0");
    assert_eq!(info["tags"][0]["commit"], commits[0]["hash"]);
}

#[tokio::test]
async fn open_repo_rejects_directories_that_are_not_repositories() {
    let dir = common::scratch_path("open-repo-invalid");
    std::fs::create_dir_all(&dir).unwrap();
    let err = common::expect_err(git::open_repo(dir.to_string_lossy().to_string(), None).await);
    assert!(err.contains("is not a git repository"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn repo_log_page_pages_through_history() {
    let repo = TestRepo::new("log-page");
    for n in 1..=6 {
        repo.commit(&format!("f{n}.txt"), "x\n", &format!("c{n}"));
    }

    let page = json(&git::repo_log_page(repo.s(), 2, 3, None).await.unwrap());
    let subjects: Vec<&str> = page
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["subject"].as_str().unwrap())
        .collect();
    assert_eq!(subjects, vec!["c4", "c3", "c2"]);
}

#[tokio::test]
async fn repo_read_and_write_file_roundtrip_through_the_worktree() {
    let repo = TestRepo::new("read-write");
    repo.commit("a.txt", "one\n", "initial");

    assert_eq!(
        git::repo_read_file(repo.s(), "a.txt".into()).await.unwrap(),
        "one\n"
    );
    git::repo_write_file(repo.s(), "a.txt".into(), "two\n".into())
        .await
        .unwrap();
    assert_eq!(repo.read("a.txt"), "two\n");
    assert!(git::repo_read_file(repo.s(), "missing.txt".into())
        .await
        .is_err());
}

#[tokio::test]
async fn repo_list_files_returns_tracked_paths_only() {
    let repo = TestRepo::new("list-files");
    repo.write("src/a.ts", "a\n");
    repo.write("src/b.ts", "b\n");
    repo.commit_all("initial");
    repo.write("untracked.ts", "c\n");

    let files = git::repo_list_files(repo.s()).await.unwrap();
    assert_eq!(files, vec!["src/a.ts".to_string(), "src/b.ts".to_string()]);
}

#[tokio::test]
async fn git_init_repo_creates_a_repository_in_a_new_folder() {
    let dir = common::scratch_path("init-repo");
    let created = git::git_init_repo(dir.to_string_lossy().to_string())
        .await
        .unwrap();
    assert!(std::path::Path::new(&created).join(".git").exists());
    assert!(git::git_init_repo("   ".into()).await.is_err());
    let _ = std::fs::remove_dir_all(&dir);
}
