use std::path::PathBuf;

use serde::Serialize;

use crate::git::run_git;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentReviewFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
    pub untracked: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentReviewSummary {
    pub base_branch: String,
    pub session_branch: String,
    pub merge_base: String,
    pub files: Vec<AgentReviewFile>,
    pub additions: u32,
    pub deletions: u32,
    pub commits: u32,
    pub uncommitted: u32,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentReviewFileDiff {
    pub diff: Option<String>,
    pub untracked_plain: Option<String>,
    pub is_binary: bool,
}

fn parse_review_numstat(out: &str) -> Vec<AgentReviewFile> {
    let mut files = Vec::new();
    for part in out.split('\0').filter(|s| !s.is_empty()) {
        let mut fields = part.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        let path = fields.next().unwrap_or("").trim_end_matches('\r');
        if path.is_empty() {
            continue;
        }
        files.push(AgentReviewFile {
            path: path.to_string(),
            additions: adds_s.parse().unwrap_or(0),
            deletions: dels_s.parse().unwrap_or(0),
            binary: adds_s == "-" || dels_s == "-",
            untracked: false,
        });
    }
    files
}

fn head_branch(repo: &PathBuf) -> Result<String, String> {
    let name = run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    if name.is_empty() || name == "HEAD" {
        return Err("Der Branch konnte nicht ermittelt werden (detached HEAD).".into());
    }
    Ok(name)
}

fn is_binary_bytes(content: &[u8]) -> bool {
    content.iter().take(8000).any(|&b| b == 0)
}

fn untracked_files(repo: &PathBuf) -> Vec<AgentReviewFile> {
    let out = match run_git(repo, &["ls-files", "--others", "--exclude-standard", "-z"]) {
        Ok(out) => out,
        Err(_) => return Vec::new(),
    };
    out.split('\0')
        .filter(|s| !s.is_empty())
        .map(|rel| {
            let bytes = std::fs::read(repo.join(rel)).unwrap_or_default();
            let binary = is_binary_bytes(&bytes);
            let additions = if binary {
                0
            } else {
                String::from_utf8_lossy(&bytes).lines().count() as u32
            };
            AgentReviewFile {
                path: rel.to_string(),
                additions,
                deletions: 0,
                binary,
                untracked: true,
            }
        })
        .collect()
}

fn count_uncommitted(repo: &PathBuf) -> u32 {
    run_git(repo, &["status", "--porcelain", "-z"])
        .map(|out| out.split('\0').filter(|s| !s.is_empty()).count() as u32)
        .unwrap_or(0)
}

fn build_summary(worktree: &PathBuf, base: &PathBuf) -> Result<AgentReviewSummary, String> {
    let base_branch = head_branch(base)?;
    let session_branch = head_branch(worktree)?;
    if base_branch == session_branch {
        return Err("Basis-Branch und Session-Branch sind identisch.".into());
    }
    let merge_base = run_git(worktree, &["merge-base", base_branch.as_str(), "HEAD"])?
        .trim()
        .to_string();
    if merge_base.is_empty() {
        return Err("Es gibt keinen gemeinsamen Vorfahren der beiden Branches.".into());
    }

    let numstat = run_git(
        worktree,
        &[
            "diff",
            "--numstat",
            "-z",
            "--no-renames",
            merge_base.as_str(),
        ],
    )?;
    let mut files = parse_review_numstat(&numstat);
    files.extend(untracked_files(worktree));
    files.sort_by(|a, b| a.path.cmp(&b.path));

    let additions = files.iter().map(|f| f.additions).sum();
    let deletions = files.iter().map(|f| f.deletions).sum();
    let commits = run_git(
        worktree,
        &["rev-list", "--count", &format!("{merge_base}..HEAD")],
    )
    .ok()
    .and_then(|out| out.trim().parse().ok())
    .unwrap_or(0);

    Ok(AgentReviewSummary {
        base_branch,
        session_branch,
        merge_base,
        files,
        additions,
        deletions,
        commits,
        uncommitted: count_uncommitted(worktree),
    })
}

fn diff_reports_binary(diff: &str) -> bool {
    diff.lines()
        .any(|line| line.starts_with("Binary files ") && line.ends_with(" differ"))
}

fn build_file_diff(
    worktree: &PathBuf,
    merge_base: &str,
    file: &str,
) -> Result<AgentReviewFileDiff, String> {
    let absolute = worktree.join(file);
    let tracked = run_git(worktree, &["ls-files", "--error-unmatch", "--", file]).is_ok();
    if !tracked {
        let bytes = std::fs::read(&absolute)
            .map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
        if is_binary_bytes(&bytes) {
            return Ok(AgentReviewFileDiff {
                diff: None,
                untracked_plain: None,
                is_binary: true,
            });
        }
        return Ok(AgentReviewFileDiff {
            diff: None,
            untracked_plain: Some(String::from_utf8_lossy(&bytes).to_string()),
            is_binary: false,
        });
    }

    let diff = run_git(
        worktree,
        &[
            "diff",
            "--no-color",
            "--no-renames",
            merge_base,
            "--",
            file,
        ],
    )?;
    if diff_reports_binary(&diff) {
        return Ok(AgentReviewFileDiff {
            diff: None,
            untracked_plain: None,
            is_binary: true,
        });
    }
    Ok(AgentReviewFileDiff {
        diff: (!diff.trim().is_empty()).then_some(diff),
        untracked_plain: None,
        is_binary: false,
    })
}

#[tauri::command]
pub async fn agent_review_summary(
    worktree_path: String,
    base_path: String,
) -> Result<AgentReviewSummary, String> {
    tokio::task::spawn_blocking(move || {
        let worktree = PathBuf::from(worktree_path.trim());
        let base = PathBuf::from(base_path.trim());
        build_summary(&worktree, &base)
    })
    .await
    .map_err(|e| format!("Review-Aufgabe abgebrochen: {e}"))?
}

#[tauri::command]
pub async fn agent_review_file_diff(
    worktree_path: String,
    merge_base: String,
    file: String,
) -> Result<AgentReviewFileDiff, String> {
    tokio::task::spawn_blocking(move || {
        let worktree = PathBuf::from(worktree_path.trim());
        let base = merge_base.trim().to_string();
        let f = file.trim().to_string();
        if base.is_empty() || f.is_empty() {
            return Err("Merge-Basis oder Dateipfad fehlt".into());
        }
        build_file_diff(&worktree, &base, &f)
    })
    .await
    .map_err(|e| format!("Review-Aufgabe abgebrochen: {e}"))?
}

#[tauri::command]
pub async fn agent_review_branch_merged(path: String, branch: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path.trim());
        let b = branch.trim().to_string();
        if b.is_empty() {
            return Err("Branch-Name darf nicht leer sein".into());
        }
        Ok(run_git(&repo, &["merge-base", "--is-ancestor", b.as_str(), "HEAD"]).is_ok())
    })
    .await
    .map_err(|e| format!("Review-Aufgabe abgebrochen: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRepo {
        root: PathBuf,
        base: PathBuf,
        worktree: PathBuf,
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn git(repo: &PathBuf, args: &[&str]) -> String {
        run_git(repo, args).unwrap_or_else(|e| panic!("git {args:?} failed: {e}"))
    }

    impl TestRepo {
        fn new() -> TestRepo {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let root = std::env::temp_dir()
                .join(format!("l8git-agent-review-{}-{}", std::process::id(), id));
            let _ = fs::remove_dir_all(&root);
            let base = root.join("base");
            fs::create_dir_all(&base).unwrap();
            git(&base, &["-c", "init.defaultBranch=main", "init", "-q", "."]);
            git(&base, &["config", "user.email", "test@example.com"]);
            git(&base, &["config", "user.name", "Test"]);
            git(&base, &["config", "commit.gpgsign", "false"]);
            fs::write(base.join("f.txt"), "a\nb\nc\n").unwrap();
            git(&base, &["add", "."]);
            git(&base, &["commit", "-qm", "init"]);
            let worktree = root.join("wt");
            git(
                &base,
                &[
                    "worktree",
                    "add",
                    "-q",
                    worktree.to_str().unwrap(),
                    "-b",
                    "agents/demo",
                ],
            );
            TestRepo {
                root,
                base,
                worktree,
            }
        }
    }

    #[test]
    fn numstat_parsing_reads_counts_and_binary_marker() {
        let files = parse_review_numstat("3\t1\tsrc/a.rs\0-\t-\tlogo.png\0");
        assert_eq!(
            files,
            vec![
                AgentReviewFile {
                    path: "src/a.rs".into(),
                    additions: 3,
                    deletions: 1,
                    binary: false,
                    untracked: false,
                },
                AgentReviewFile {
                    path: "logo.png".into(),
                    additions: 0,
                    deletions: 0,
                    binary: true,
                    untracked: false,
                },
            ]
        );
    }

    #[test]
    fn summary_covers_committed_and_uncommitted_and_untracked_changes() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        git(&repo.worktree, &["add", "f.txt"]);
        git(&repo.worktree, &["commit", "-qm", "agent commit"]);
        fs::write(repo.worktree.join("f.txt"), "a\nB\nC\n").unwrap();
        fs::write(repo.worktree.join("new.txt"), "one\ntwo\n").unwrap();

        let summary = build_summary(&repo.worktree, &repo.base).unwrap();
        assert_eq!(summary.base_branch, "main");
        assert_eq!(summary.session_branch, "agents/demo");
        assert_eq!(summary.commits, 1);
        assert_eq!(summary.uncommitted, 2);
        let paths: Vec<&str> = summary.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["f.txt", "new.txt"]);
        assert_eq!(summary.additions, 4);
        assert_eq!(summary.deletions, 2);
        assert!(summary.files[1].untracked);
    }

    #[test]
    fn file_diff_spans_the_whole_session() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        git(&repo.worktree, &["add", "f.txt"]);
        git(&repo.worktree, &["commit", "-qm", "agent commit"]);
        fs::write(repo.worktree.join("f.txt"), "a\nB\nC\n").unwrap();

        let summary = build_summary(&repo.worktree, &repo.base).unwrap();
        let diff = build_file_diff(&repo.worktree, &summary.merge_base, "f.txt").unwrap();
        let text = diff.diff.unwrap();
        assert!(text.contains("+B"));
        assert!(text.contains("+C"));
        assert!(text.contains("-b"));
        assert!(text.contains("-c"));
    }

    #[test]
    fn file_diff_returns_plain_content_for_untracked_files() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("new.txt"), "hello\n").unwrap();
        let summary = build_summary(&repo.worktree, &repo.base).unwrap();
        let diff = build_file_diff(&repo.worktree, &summary.merge_base, "new.txt").unwrap();
        assert_eq!(diff.untracked_plain.as_deref(), Some("hello\n"));
        assert!(diff.diff.is_none());
    }

    #[test]
    fn merged_check_follows_the_base_branch_history() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        git(&repo.worktree, &["add", "f.txt"]);
        git(&repo.worktree, &["commit", "-qm", "agent commit"]);
        let ancestor = |r: &PathBuf| {
            run_git(r, &["merge-base", "--is-ancestor", "agents/demo", "HEAD"]).is_ok()
        };
        assert!(!ancestor(&repo.base));
        git(&repo.base, &["merge", "--ff", "agents/demo"]);
        assert!(ancestor(&repo.base));
    }
}
