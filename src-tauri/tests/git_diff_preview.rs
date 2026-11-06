mod common;
use common::TestRepo;
use l8git_lib::diff_preview::{repo_diff_preview, DiffPreviewRequest};

fn request(kind: &str, file: &str) -> DiffPreviewRequest {
    DiffPreviewRequest {
        kind: kind.into(), file: file.into(), previous_file: None,
        base: None, head: None, ignore_whitespace: false, color_moved: false, context: 3,
    }
}

#[tokio::test]
async fn whitespace_filter_is_read_only_and_empty_means_no_visible_change() {
    let repo = TestRepo::new("diff-preview-whitespace");
    repo.commit("file.txt", "const value = 1;\n", "base");
    repo.write("file.txt", "const  value = 1;\n");
    let before = repo.git(&["status", "--porcelain"]);
    let plain = repo_diff_preview(repo.s(), request("unstaged", "file.txt")).await.unwrap();
    assert!(plain.patch.contains("+const  value"));
    let mut filtered = request("unstaged", "file.txt");
    filtered.ignore_whitespace = true;
    assert!(repo_diff_preview(repo.s(), filtered).await.unwrap().patch.is_empty());
    assert_eq!(repo.git(&["status", "--porcelain"]), before);
    assert!(repo.git(&["diff", "--cached"]).is_empty());
}

#[tokio::test]
async fn expanded_context_keeps_literal_paths_and_pinned_refs() {
    let repo = TestRepo::new("diff-preview-context");
    let lines: Vec<String> = (0..30).map(|index| format!("line {index}")).collect();
    let base = repo.commit("[literal].txt", &lines.join("\n"), "base");
    let mut changed = lines.clone();
    changed[15] = "changed line".into();
    let head = repo.commit("[literal].txt", &changed.join("\n"), "change");
    repo.write("l.txt", "should not appear in literal diff\n");
    let mut small = request("compare", "[literal].txt");
    small.base = Some(base.clone()); small.head = Some(head.clone()); small.context = 0;
    let small = repo_diff_preview(repo.s(), small).await.unwrap();
    let mut large = request("compare", "[literal].txt");
    large.base = Some(base.clone()); large.head = Some(head.clone()); large.context = 20;
    let large = repo_diff_preview(repo.s(), large).await.unwrap();
    assert!(large.patch.lines().count() > small.patch.lines().count());
    assert!(large.patch.contains(" line 0"));
    assert!(!large.patch.contains("should not appear"));
    assert_eq!(large.base_sha.as_deref(), Some(base.as_str()));
    assert_eq!(large.head_sha.as_deref(), Some(head.as_str()));
}

#[tokio::test]
async fn moved_blocks_have_metadata_without_ansi_in_the_patch() {
    let repo = TestRepo::new("diff-preview-moved");
    let block = "function moved_function_with_enough_characters() {\n  return first_value + second_value + third_value;\n}\n";
    let separator = "alpha stable context\nbeta stable context\ngamma stable context\ndelta stable context\nepsilon stable context\n";
    let base = repo.commit("code.ts", &format!("{block}{separator}"), "base");
    let head = repo.commit("code.ts", &format!("{separator}{block}"), "move");
    let mut options = request("compare", "code.ts");
    options.base = Some(base); options.head = Some(head); options.color_moved = true;
    let result = repo_diff_preview(repo.s(), options).await.unwrap();
    assert!(!result.patch.contains('\u{1b}'));
    assert!(!result.moved_lines.is_empty());
    assert!(result.moved_lines.iter().all(|index| result.patch.lines().nth(*index).is_some_and(|line| line.starts_with('+') || line.starts_with('-'))));
}

#[tokio::test]
async fn invalid_display_requests_are_rejected() {
    let repo = TestRepo::new("diff-preview-invalid");
    repo.commit("a.txt", "content\n", "base");
    let mut invalid = request("unstaged", "../a.txt");
    assert!(repo_diff_preview(repo.s(), invalid).await.is_err());
    invalid = request("unstaged", "a.txt"); invalid.context = 501;
    assert!(repo_diff_preview(repo.s(), invalid).await.is_err());
    invalid = request("compare", "a.txt"); invalid.base = Some("--help".into()); invalid.head = Some("HEAD".into());
    assert!(repo_diff_preview(repo.s(), invalid).await.is_err());
}
