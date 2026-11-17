mod common;

use common::{json, TestRepo};
use l8git_lib::git;

#[tokio::test]
async fn regular_open_reads_populated_bare_history_and_refs() {
    let source = TestRepo::new("bare-open-source");
    let head = source.commit("base.txt", "fixture\n", "bare history");
    source.git(&["tag", "fixture-tag"]);
    let bare_path = common::scratch_path("bare-open");
    source.git(&[
        "clone",
        "--bare",
        "--local",
        &source.s(),
        bare_path.to_str().unwrap(),
    ]);
    let bare = TestRepo::adopt(bare_path);
    let info = json(&git::open_repo(bare.s(), None).await.unwrap());
    assert_eq!(info["is_bare"], true);
    assert_eq!(info["branch"], "main");
    assert_eq!(info["commits"][0]["hash"], head);
    assert_eq!(info["branches"][0]["name"], "main");
    assert_eq!(info["tags"][0]["name"], "fixture-tag");
    assert!(!bare.exists("base.txt"));
    let normal = json(&git::open_repo(source.s(), None).await.unwrap());
    assert_eq!(normal["is_bare"], false);
    assert_eq!(normal["commits"][0]["hash"], head);

    let worktree_path = common::scratch_path("bare-open-worktree");
    bare.git(&[
        "worktree",
        "add",
        "--detach",
        worktree_path.to_str().unwrap(),
        "HEAD",
    ]);
    let worktree = TestRepo::adopt(worktree_path);
    let linked = json(&git::open_repo(worktree.s(), None).await.unwrap());
    assert_eq!(linked["is_bare"], false);
    assert_eq!(linked["commits"][0]["hash"], head);
    assert!(worktree.exists("base.txt"));
}

#[tokio::test]
async fn regular_open_distinguishes_empty_bare_and_unborn_checkout() {
    let bare = TestRepo::bare("empty-bare-open");
    let normal = TestRepo::new("empty-checkout-open");
    for (repo, expected) in [(&bare, true), (&normal, false)] {
        let info = json(&git::open_repo(repo.s(), None).await.unwrap());
        assert_eq!(info["is_bare"], expected);
        assert_eq!(info["commits"], serde_json::json!([]));
        assert_eq!(info["branches"], serde_json::json!([]));
        assert_eq!(info["tags"], serde_json::json!([]));
    }
}
