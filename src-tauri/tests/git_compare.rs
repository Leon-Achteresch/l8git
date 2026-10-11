mod common;
use common::{json, TestRepo};
use l8git_lib::compare::{repo_compare_commits, repo_compare_file_diff};

#[tokio::test]
async fn direct_and_merge_base_comparisons_distinguish_independent_work() {
    let repo = TestRepo::new("compare-diverged");
    let ancestor = repo.commit("base.txt", "base\n", "base");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.commit("feature.txt", "feature\n", "feature change");
    repo.git(&["checkout", "-q", "main"]);
    repo.commit("main.txt", "main\n", "main change");
    let before = repo.head();
    let direct = json(&repo_compare_commits(repo.s(), "main".into(), "feature".into(), Some("direct".into())).await.unwrap());
    assert_eq!(direct["ahead"], 1);
    assert_eq!(direct["behind"], 1);
    assert_eq!(direct["files"].as_array().unwrap().len(), 2);
    let proposed = json(&repo_compare_commits(repo.s(), "main".into(), "feature".into(), Some("merge-base".into())).await.unwrap());
    assert_eq!(proposed["merge_base"], ancestor);
    assert_eq!(proposed["files"].as_array().unwrap().len(), 1);
    assert_eq!(proposed["files"][0]["path"], "feature.txt");
    assert_eq!(repo.head(), before);
    assert_eq!(repo.branch(), "main");
    assert!(repo.git(&["status", "--porcelain"]).is_empty());
}

#[tokio::test]
async fn comparison_retains_renames_binary_and_literal_special_names() {
    let repo = TestRepo::new("compare-files");
    repo.commit("old.txt", "unchanged rename content\n", "base");
    let base = repo.head();
    repo.git(&["mv", "old.txt", "new.txt"]);
    repo.write("[literal].txt", "literal content\n");
    repo.write("l.txt", "different content\n");
    #[cfg(not(target_os = "windows"))]
    repo.write(" tab\tnewline\ntrailing ", "odd filename content\n");
    repo.write_bytes("image.bin", &[0, 1, 2, 0, 3]);
    repo.git(&["add", "--all"]);
    repo.git(&["commit", "-qm", "rename and add files"]);
    let head = repo.head();
    let comparison = json(&repo_compare_commits(repo.s(), base.clone(), head.clone(), None).await.unwrap());
    let files = comparison["files"].as_array().unwrap();
    let renamed = files.iter().find(|file| file["path"] == "new.txt").unwrap();
    assert_eq!(renamed["status"], "R");
    assert_eq!(renamed["previous_path"], "old.txt");
    assert!(files.iter().find(|file| file["path"] == "image.bin").unwrap()["binary"].as_bool().unwrap());
    #[cfg(not(target_os = "windows"))]
    assert!(files.iter().any(|file| file["path"] == " tab\tnewline\ntrailing "));
    let literal = repo_compare_file_diff(repo.s(), base.clone(), head.clone(), None, "[literal].txt".into(), None).await.unwrap();
    assert!(literal.patch.contains("literal content"));
    assert!(!literal.patch.contains("different content"));
    let rename = repo_compare_file_diff(repo.s(), base.clone(), head.clone(), None, "new.txt".into(), Some("old.txt".into())).await.unwrap();
    assert!(rename.patch.contains("rename from old.txt"));
    let binary = repo_compare_file_diff(repo.s(), base, head, None, "image.bin".into(), None).await.unwrap();
    assert!(binary.binary);
}

#[tokio::test]
async fn comparison_rejects_bad_refs_modes_and_paths_without_mutation() {
    let repo = TestRepo::new("compare-invalid");
    repo.commit("a.txt", "a\n", "base");
    let before = repo.head();
    assert!(repo_compare_commits(repo.s(), "-D".into(), "HEAD".into(), None).await.is_err());
    assert!(repo_compare_commits(repo.s(), "missing".into(), "HEAD".into(), None).await.is_err());
    assert!(repo_compare_commits(repo.s(), "HEAD".into(), "HEAD".into(), Some("invalid".into())).await.is_err());
    for path in ["../outside.txt", "/etc/passwd", ":(glob)*", "unchanged.txt"] {
        assert!(repo_compare_file_diff(repo.s(), "HEAD".into(), "HEAD".into(), None, path.into(), None).await.is_err());
    }
    assert_eq!(repo.head(), before);
}

#[tokio::test]
async fn unrelated_histories_can_be_compared_directly_but_require_a_base_for_proposals() {
    let repo = TestRepo::new("compare-orphan");
    repo.commit("main.txt", "main\n", "main root");
    repo.git(&["checkout", "--orphan", "orphan"]);
    repo.git(&["rm", "-rf", "."]);
    repo.commit("orphan.txt", "orphan\n", "orphan root");
    let result = repo_compare_commits(repo.s(), "main".into(), "orphan".into(), None).await.unwrap();
    assert!(result.merge_base.is_none());
    let error = repo_compare_commits(repo.s(), "main".into(), "orphan".into(), Some("merge-base".into())).await.err().unwrap();
    assert!(error.contains("__COMPARE_NO_COMMON_ANCESTOR__"));
}

#[tokio::test]
async fn large_file_patches_are_bounded_and_explicitly_truncated() {
    let repo = TestRepo::new("compare-large");
    let base = repo.commit("large.txt", "base\n", "base");
    repo.commit("large.txt", &"large changed line with useful content\n".repeat(60_000), "large change");
    let diff = repo_compare_file_diff(repo.s(), base, "HEAD".into(), None, "large.txt".into(), None).await.unwrap();
    assert!(diff.truncated);
    assert!(diff.patch.len() <= 1_048_576);
    assert!(diff.patch.ends_with('\n'));
    assert!(!diff.binary);
}
