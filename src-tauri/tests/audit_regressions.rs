mod common;
use common::{json, scratch_path, TestRepo};
use l8git_lib::git::{self, HistoryFilter};
use std::{io::Write, process::{Command, Stdio}};

#[tokio::test]
async fn stale_stash_actions_never_target_the_new_entry() {
    let repo = TestRepo::new("stash-snapshot");
    repo.commit("a.txt", "base\n", "base");
    repo.write("a.txt", "first\n");
    git::git_stash_push(repo.s(), None, false, false).await.unwrap();
    let original = repo.rev("stash@{0}");
    repo.write("a.txt", "second\n");
    git::git_stash_push(repo.s(), None, false, false).await.unwrap();
    let current = repo.rev("stash@{0}");
    let errors = [
        git::git_stash_pop(repo.s(), 0, original.clone()).await.unwrap_err(),
        git::git_stash_apply(repo.s(), 0, original.clone()).await.unwrap_err(),
        git::git_stash_drop(repo.s(), 0, original.clone()).await.unwrap_err(),
        git::git_stash_branch(repo.s(), 0, "wrong".into(), original.clone()).await.unwrap_err(),
        git::git_stash_show(repo.s(), 0, Some(original)).await.err().unwrap(),
    ];
    assert!(errors.iter().all(|e| e.contains("__STASH_CHANGED__")));
    assert_eq!(repo.rev("stash@{0}"), current);
    assert_eq!(repo.git(&["stash", "list"]).lines().count(), 2);
    assert_eq!(repo.read("a.txt"), "base\n");
    assert_eq!(repo.branch(), "main");
}

#[tokio::test]
async fn stash_inspection_includes_untracked_files_and_their_patch() {
    let repo = TestRepo::new("stash-untracked-inspect");
    repo.commit("a.txt", "base\n", "base");
    repo.write("new file.txt", "untracked content\n");
    git::git_stash_push(repo.s(), None, true, false).await.unwrap();
    let hash = repo.rev("stash@{0}");
    let show = git::git_stash_show(repo.s(), 0, Some(hash.clone())).await.unwrap();
    assert_eq!(show.files.len(), 1);
    assert_eq!(show.files[0].path, "new file.txt");
    let diff = json(&git::git_stash_file_diff(repo.s(), 0, "new file.txt".into(), Some(hash), None).await.unwrap());
    assert!(diff["diff"].as_str().unwrap().contains("+untracked content"));
}

#[tokio::test]
async fn bisect_status_works_in_a_linked_worktree() {
    let repo = TestRepo::new("bisect-worktree");
    let good = repo.commit("a.txt", "1", "good");
    repo.commit("a.txt", "2", "middle");
    repo.commit("a.txt", "3", "middle again");
    let bad = repo.commit("a.txt", "4", "bad");
    let wt_path = scratch_path("bisect-linked");
    repo.git(&["worktree", "add", "-b", "investigate", wt_path.to_str().unwrap()]);
    let wt = TestRepo::adopt(wt_path);
    git::git_bisect_start(wt.s(), bad.clone(), good.clone()).await.unwrap();
    let status = git::git_bisect_status(wt.s()).await.unwrap();
    assert!(status.active);
    assert!(status.marked_bad.contains(&bad));
    assert!(status.marked_good.contains(&good));
    assert!(!git::git_bisect_status(repo.s()).await.unwrap().active);
    git::git_bisect_reset(wt.s()).await.unwrap();
    assert!(!git::git_bisect_status(wt.s()).await.unwrap().active);
}

#[tokio::test]
async fn history_filters_before_pagination_and_resolves_only_revisions() {
    let repo = TestRepo::new("history-filter");
    repo.commit("base.txt", "base", "base");
    repo.git(&["checkout", "-b", "old-branch"]);
    let first = repo.commit("target.txt", "1", "needle first");
    let second = repo.commit("target.txt", "2", "needle second");
    repo.git(&["checkout", "main"]);
    repo.commit("other.txt", "new", "new unrelated");
    let filter = HistoryFilter { refs: vec!["old-branch".into()], query: "needle".into(), file: "target.txt".into(), author: "Test User".into(), ..Default::default() };
    let a = json(&git::repo_history_page(repo.s(), filter.clone(), 0, 1).await.unwrap());
    let b = json(&git::repo_history_page(repo.s(), filter, 1, 1).await.unwrap());
    assert_eq!(a[0]["hash"], second);
    assert_eq!(b[0]["hash"], first);
    let invalid = HistoryFilter { refs: vec!["--all".into()], ..Default::default() };
    assert!(git::repo_history_page(repo.s(), invalid, 0, 80).await.is_err());
}

#[tokio::test]
async fn full_search_finds_a_commit_older_than_the_previous_4000_limit() {
    let repo = TestRepo::new("search-deep");
    let original = repo.commit("old-file.txt", "old", "ancient-needle");
    let mut input = String::new();
    for n in 1..=4100 {
        input.push_str(&format!("commit refs/heads/main\nmark :{n}\ncommitter Test User <test@example.com> {} +0000\ndata 7\nfiller\n\nfrom {}\n\n", 1_800_000_000 + n, if n == 1 { original.clone() } else { format!(":{}", n - 1) }));
    }
    let mut child = Command::new("git").arg("-C").arg(&repo.path).args(["fast-import", "--quiet"]).stdin(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(input.as_bytes()).unwrap();
    assert!(child.wait_with_output().unwrap().status.success());
    let result = json(&git::repo_search_commits(repo.s(), "ancient-needle".into(), 0, 80, None, None, None).await.unwrap());
    assert_eq!(result.as_array().unwrap().len(), 1);
    assert_eq!(result[0]["commit"]["hash"], original);
}
