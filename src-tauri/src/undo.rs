use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::cmd::git_command;

const ANALYSIS_DEPTH: u32 = 250;
const DEFAULT_LIMIT: u32 = 50;
const MAX_LIMIT: u32 = 1000;

#[derive(Serialize, Debug, Clone)]
pub struct ReflogEntry {
    pub selector: String,
    pub hash: String,
    pub short_hash: String,
    pub action: String,
    pub subject: String,
    pub message: String,
    pub date: String,
}

#[derive(Serialize, Debug)]
pub struct UndoResult {
    pub undone_action: String,
    pub from_hash: String,
    pub to_hash: String,
    pub head_name: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct UndoPreview {
    pub action: String,
    pub supported: bool,
    pub target_hash: String,
    pub target_short_hash: String,
    pub target_subject: String,
    pub description_key: String,
}

#[derive(Serialize, Debug)]
pub struct RestoredBranch {
    pub name: String,
    pub hash: String,
    pub short_hash: String,
}

#[derive(PartialEq, Debug, Clone, Copy)]
enum UndoMode {
    Keep,
    Soft,
    None,
}

struct Analysis {
    action: String,
    mode: UndoMode,
    target_hash: String,
    description_key: String,
}

async fn spawn_git<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f)
        .await
        .expect("git blocking task panicked")
}

fn noop_env() -> Vec<(String, String)> {
    vec![
        ("GIT_EDITOR".to_string(), ":".to_string()),
        ("GIT_SEQUENCE_EDITOR".to_string(), ":".to_string()),
    ]
}

fn run_git_env(repo: &Path, args: &[&str], env: &[(String, String)]) -> (bool, String) {
    let mut cmd = git_command();
    cmd.arg("-C").arg(repo).args(args);
    for (key, value) in env {
        cmd.env(key, value);
    }
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
            let merged = match (stdout.is_empty(), stderr.is_empty()) {
                (false, false) => format!("{stdout}\n{stderr}"),
                (false, true) => stdout,
                (true, false) => stderr,
                (true, true) => String::new(),
            };
            (output.status.success(), merged)
        }
        Err(e) => (false, format!("failed to run git: {e}")),
    }
}

fn run_git_raw(repo: &Path, args: &[&str]) -> (bool, String) {
    run_git_env(repo, args, &noop_env())
}

fn blocked_files(message: &str) -> Vec<String> {
    let mut files: Vec<String> = Vec::new();
    for line in message.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('\t') || line.starts_with('\t') {
            let name = trimmed.trim().to_string();
            if !name.is_empty() && !files.contains(&name) {
                files.push(name);
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("error: Entry '") {
            if let Some(end) = rest.find('\'') {
                let name = rest[..end].to_string();
                if !name.is_empty() && !files.contains(&name) {
                    files.push(name);
                }
            }
        }
    }
    files
}

fn map_error(message: String) -> String {
    let trimmed = message.trim().to_string();
    if trimmed.contains("not uptodate")
        || trimmed.contains("would be overwritten")
        || trimmed.contains("Your local changes to the following files")
        || trimmed.contains("Please commit your changes or stash them before you")
    {
        let files = blocked_files(&trimmed);
        return format!("__LOCAL_CHANGES_BLOCK__|{}", files.join(","));
    }
    if trimmed.is_empty() {
        return "git: command failed".into();
    }
    trimmed
}

fn dirty_tracked_files(repo: &Path) -> Vec<String> {
    let (_, out) = run_git_raw(repo, &["status", "--porcelain=v1", "--untracked-files=no"]);
    let mut files: Vec<String> = Vec::new();
    for line in out.lines() {
        if line.len() < 3 {
            continue;
        }
        let xy = &line[..2];
        if xy == "??" || xy == "!!" {
            continue;
        }
        let rest = &line[3..];
        let name = rest.split(" -> ").last().unwrap_or(rest).trim().to_string();
        if !name.is_empty() && !files.contains(&name) {
            files.push(name);
        }
    }
    files
}

fn git_path(repo: &Path, name: &str) -> Option<PathBuf> {
    let (ok, out) = run_git_raw(repo, &["rev-parse", "--git-path", name]);
    if !ok {
        return None;
    }
    let trimmed = out.trim();
    if trimmed.is_empty() {
        return None;
    }
    let p = Path::new(trimmed);
    Some(if p.is_absolute() {
        p.to_path_buf()
    } else {
        repo.join(p)
    })
}

fn ensure_repo(repo: &Path) -> Result<(), String> {
    let (ok, out) = run_git_raw(repo, &["rev-parse", "--absolute-git-dir"]);
    if !ok || out.trim().is_empty() {
        return Err(map_error(out));
    }
    Ok(())
}

fn pending_operation(repo: &Path) -> Option<String> {
    let candidates = [
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
    ];
    for (name, label) in candidates {
        if git_path(repo, name).map(|p| p.exists()).unwrap_or(false) {
            return Some(label.to_string());
        }
    }
    None
}

fn resolve_commit(repo: &Path, rev: &str) -> Option<String> {
    let spec = format!("{rev}^{{commit}}");
    let (ok, out) = run_git_raw(repo, &["rev-parse", "--verify", "--quiet", &spec]);
    if !ok {
        return None;
    }
    let trimmed = out.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn short_hash(repo: &Path, rev: &str) -> String {
    let (ok, out) = run_git_raw(repo, &["rev-parse", "--short", rev]);
    if ok && !out.trim().is_empty() {
        out.trim().to_string()
    } else {
        rev.chars().take(7).collect()
    }
}

fn commit_subject(repo: &Path, rev: &str) -> String {
    let (ok, out) = run_git_raw(repo, &["log", "-1", "--format=%s", rev]);
    if ok {
        out.trim().to_string()
    } else {
        String::new()
    }
}

fn head_name(repo: &Path) -> Option<String> {
    let (ok, out) = run_git_raw(repo, &["symbolic-ref", "--short", "--quiet", "HEAD"]);
    if !ok {
        return None;
    }
    let trimmed = out.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn parse_action(subject: &str) -> String {
    let head = subject.split(':').next().unwrap_or("").trim();
    if head.is_empty() {
        return String::new();
    }
    let first = head.split_whitespace().next().unwrap_or("").to_string();
    if head.ends_with(')') && !first.starts_with('(') {
        if let Some(open) = head.rfind('(') {
            let qualifier = head[open..].trim();
            if qualifier.len() > 2 {
                return format!("{first} {qualifier}");
            }
        }
    }
    first
}

fn parse_message(subject: &str) -> String {
    match subject.splitn(2, ':').nth(1) {
        Some(rest) => rest.trim().to_string(),
        None => subject.trim().to_string(),
    }
}

fn parse_date(selector: &str) -> String {
    let open = selector.find('{');
    let close = selector.rfind('}');
    match (open, close) {
        (Some(o), Some(c)) if c > o + 1 => selector[o + 1..c].to_string(),
        _ => String::new(),
    }
}

fn action_base(action: &str) -> String {
    action
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase()
}

fn action_qualifier(action: &str) -> String {
    match (action.find('('), action.rfind(')')) {
        (Some(o), Some(c)) if c > o + 1 => action[o + 1..c].to_lowercase(),
        _ => String::new(),
    }
}

fn read_reflog(repo: &Path, limit: u32, skip: u32) -> Result<Vec<ReflogEntry>, String> {
    let count = limit.to_string();
    let offset = skip.to_string();
    let mut args: Vec<String> = vec![
        "reflog".into(),
        "--date=iso-strict".into(),
        "--format=%H\x1f%h\x1f%gd\x1f%gs".into(),
        "-n".into(),
        count,
    ];
    if skip > 0 {
        args.push(format!("--skip={offset}"));
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let (ok, out) = run_git_raw(repo, &refs);
    if !ok {
        return Err(map_error(out));
    }
    let mut entries = Vec::new();
    for (index, line) in out.lines().filter(|l| !l.trim().is_empty()).enumerate() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() < 4 {
            continue;
        }
        let subject = parts[3].to_string();
        entries.push(ReflogEntry {
            selector: format!("HEAD@{{{}}}", skip as usize + index),
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            action: parse_action(&subject),
            message: parse_message(&subject),
            date: parse_date(parts[2]),
            subject,
        });
    }
    Ok(entries)
}

fn description_key(action: &str, supported: bool) -> String {
    if !supported {
        return "undo.action.unsupported".into();
    }
    let key = match action_base(action).as_str() {
        "merge" => "merge",
        "rebase" => "rebase",
        "reset" => "reset",
        "cherry-pick" => "cherryPick",
        "revert" => "revert",
        "commit" if action_qualifier(action) == "amend" => "amend",
        "commit" => "commit",
        _ => "unsupported",
    };
    format!("undo.action.{key}")
}

fn unsupported(action: &str) -> Analysis {
    Analysis {
        action: action.to_string(),
        mode: UndoMode::None,
        target_hash: String::new(),
        description_key: description_key(action, false),
    }
}

fn analyze(repo: &Path) -> Result<Analysis, String> {
    ensure_repo(repo)?;
    if let Some(op) = pending_operation(repo) {
        return Err(format!(
            "A {op} is in progress. Finish or abort it before undoing the last operation."
        ));
    }
    let entries = read_reflog(repo, ANALYSIS_DEPTH, 0)?;
    let Some(head) = entries.first() else {
        return Err("There is nothing to undo.".into());
    };
    let action = head.action.clone();
    let base = action_base(&action);
    let qualifier = action_qualifier(&action);

    let (mode, target_index) = match base.as_str() {
        "merge" | "reset" | "cherry-pick" | "revert" => (UndoMode::Keep, Some(1usize)),
        "commit" if qualifier == "initial" => (UndoMode::None, None),
        "commit" => (UndoMode::Soft, Some(1usize)),
        "rebase" => {
            if qualifier != "finish" && qualifier != "abort" {
                (UndoMode::None, None)
            } else {
                let start = entries.iter().position(|e| {
                    action_base(&e.action) == "rebase" && action_qualifier(&e.action) == "start"
                });
                match start {
                    Some(k) => (UndoMode::Keep, Some(k + 1)),
                    None => (UndoMode::None, None),
                }
            }
        }
        _ => (UndoMode::None, None),
    };

    let Some(index) = target_index else {
        return Ok(unsupported(&action));
    };
    let Some(target) = entries.get(index) else {
        return Ok(unsupported(&action));
    };
    let Some(hash) = resolve_commit(repo, &target.hash) else {
        return Ok(unsupported(&action));
    };

    Ok(Analysis {
        description_key: description_key(&action, true),
        action,
        mode,
        target_hash: hash,
    })
}

fn parse_selector(selector: &str) -> Result<String, String> {
    let trimmed = selector.trim();
    let inner = trimmed
        .strip_prefix("HEAD@{")
        .and_then(|s| s.strip_suffix('}'))
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()));
    match inner {
        Some(n) => Ok(format!("HEAD@{{{n}}}")),
        None => Err(format!("Invalid reflog selector: {trimmed}")),
    }
}

#[tauri::command]
pub async fn reflog_list(path: String, limit: u32, skip: u32) -> Result<Vec<ReflogEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        ensure_repo(&repo)?;
        let count = if limit == 0 {
            DEFAULT_LIMIT
        } else {
            limit.min(MAX_LIMIT)
        };
        read_reflog(&repo, count, skip)
    })
    .await
}

#[tauri::command]
pub async fn undo_preview(path: String) -> Result<UndoPreview, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let analysis = analyze(&repo)?;
        let supported = analysis.mode != UndoMode::None;
        let (target_short_hash, target_subject) = if supported {
            (
                short_hash(&repo, &analysis.target_hash),
                commit_subject(&repo, &analysis.target_hash),
            )
        } else {
            (String::new(), String::new())
        };
        Ok(UndoPreview {
            action: analysis.action,
            supported,
            target_hash: analysis.target_hash,
            target_short_hash,
            target_subject,
            description_key: analysis.description_key,
        })
    })
    .await
}

#[tauri::command]
pub async fn undo_last_operation(path: String) -> Result<UndoResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let analysis = analyze(&repo)?;
        let flag = match analysis.mode {
            UndoMode::Keep => "--keep",
            UndoMode::Soft => "--soft",
            UndoMode::None => {
                return Err(format!("__UNDO_UNSUPPORTED__|{}", analysis.action));
            }
        };
        let from_hash = resolve_commit(&repo, "HEAD").unwrap_or_default();
        let name = head_name(&repo);
        let (ok, out) = run_git_raw(&repo, &["reset", flag, &analysis.target_hash]);
        if !ok {
            return Err(map_error(out));
        }
        Ok(UndoResult {
            undone_action: analysis.action,
            from_hash,
            to_hash: analysis.target_hash,
            head_name: name,
        })
    })
    .await
}

#[tauri::command]
pub async fn reset_to_reflog_entry(
    path: String,
    selector: String,
    mode: String,
) -> Result<UndoResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        ensure_repo(&repo)?;
        if let Some(op) = pending_operation(&repo) {
            return Err(format!(
                "A {op} is in progress. Finish or abort it before resetting."
            ));
        }
        let selector = parse_selector(&selector)?;
        let flag = match mode.trim() {
            "hard" => "--hard",
            "keep" | "" => "--keep",
            other => return Err(format!("Unknown reset mode: {other}")),
        };
        let Some(target) = resolve_commit(&repo, &selector) else {
            return Err(format!("Unknown reflog entry: {selector}"));
        };
        if flag == "--hard" {
            let dirty = dirty_tracked_files(&repo);
            if !dirty.is_empty() {
                return Err(format!("__LOCAL_CHANGES_BLOCK__|{}", dirty.join(",")));
            }
        }
        let from_hash = resolve_commit(&repo, "HEAD").unwrap_or_default();
        let name = head_name(&repo);
        let (ok, out) = run_git_raw(&repo, &["reset", flag, &target]);
        if !ok {
            return Err(map_error(out));
        }
        Ok(UndoResult {
            undone_action: format!("reset {selector}"),
            from_hash,
            to_hash: target,
            head_name: name,
        })
    })
    .await
}

#[tauri::command]
pub async fn branch_restore(
    path: String,
    name: String,
    hash: String,
) -> Result<RestoredBranch, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        ensure_repo(&repo)?;
        let branch = name.trim().to_string();
        if branch.is_empty() {
            return Err("Branch name must not be empty.".into());
        }
        let rev = hash.trim().to_string();
        if rev.is_empty() {
            return Err("Commit must not be empty.".into());
        }
        let Some(target) = resolve_commit(&repo, &rev) else {
            return Err(format!("Unknown commit: {rev}"));
        };
        let (exists, _) = run_git_raw(
            &repo,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/heads/{branch}"),
            ],
        );
        if exists {
            return Err(format!("A branch named {branch} already exists."));
        }
        let (ok, out) = run_git_raw(&repo, &["branch", &branch, &target]);
        if !ok {
            return Err(map_error(out));
        }
        Ok(RestoredBranch {
            short_hash: short_hash(&repo, &target),
            name: branch,
            hash: target,
        })
    })
    .await
}

#[tauri::command]
pub async fn commit_full_message(path: String, hash: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        ensure_repo(&repo)?;
        let rev = hash.trim().to_string();
        if rev.is_empty() {
            return Err("Commit must not be empty.".into());
        }
        let Some(target) = resolve_commit(&repo, &rev) else {
            return Err(format!("Unknown commit: {rev}"));
        };
        let (ok, out) = run_git_raw(&repo, &["log", "-1", "--format=%B", &target]);
        if !ok {
            return Err(map_error(out));
        }
        Ok(out.trim_end().to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRepo {
        path: PathBuf,
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    impl TestRepo {
        fn new() -> TestRepo {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir()
                .join(format!("l8git-undo-test-{}-{}", std::process::id(), id));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            let repo = TestRepo { path };
            repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
            repo.git(&["config", "user.email", "test@example.com"]);
            repo.git(&["config", "user.name", "Test"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            let (ok, out) = run_git_raw(&self.path, args);
            assert!(ok, "git {args:?} failed: {out}");
            out
        }

        fn str_path(&self) -> String {
            self.path.to_string_lossy().to_string()
        }

        fn commit(&self, file: &str, content: &str, message: &str) -> String {
            fs::write(self.path.join(file), content).unwrap();
            self.git(&["add", file]);
            self.git(&["commit", "-q", "-m", message]);
            self.head()
        }

        fn head(&self) -> String {
            self.git(&["rev-parse", "HEAD"]).trim().to_string()
        }

        fn subjects(&self) -> Vec<String> {
            self.git(&["log", "--format=%s"])
                .lines()
                .map(|l| l.to_string())
                .collect()
        }

        fn staged(&self) -> Vec<String> {
            self.git(&["diff", "--cached", "--name-only"])
                .lines()
                .map(|l| l.to_string())
                .filter(|l| !l.is_empty())
                .collect()
        }
    }

    #[tokio::test]
    async fn reflog_list_formats_entries_and_paginates() {
        let repo = TestRepo::new();
        for n in 1..=4 {
            repo.commit(&format!("f{n}.txt"), &format!("{n}\n"), &format!("c{n}"));
        }

        let all = reflog_list(repo.str_path(), 10, 0).await.unwrap();
        assert_eq!(all.len(), 4);
        assert_eq!(all[0].selector, "HEAD@{0}");
        assert_eq!(all[0].action, "commit");
        assert_eq!(all[0].message, "c4");
        assert_eq!(all[0].hash, repo.head());
        assert_eq!(all[0].short_hash.len(), 7);
        assert!(all[0].date.contains('T'), "{}", all[0].date);
        assert_eq!(all[3].action, "commit (initial)");
        assert_eq!(all[3].message, "c1");

        let page = reflog_list(repo.str_path(), 2, 1).await.unwrap();
        assert_eq!(page.len(), 2);
        assert_eq!(page[0].selector, "HEAD@{1}");
        assert_eq!(page[1].selector, "HEAD@{2}");
        assert_eq!(page[0].message, "c3");
        assert_eq!(page[1].message, "c2");
        assert_eq!(page[0].hash, all[1].hash);

        let tail = reflog_list(repo.str_path(), 10, 3).await.unwrap();
        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].selector, "HEAD@{3}");

        let empty = reflog_list(repo.str_path(), 10, 99).await.unwrap();
        assert!(empty.is_empty());
    }

    #[tokio::test]
    async fn undo_after_fast_forward_merge() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        let before = repo.head();
        repo.git(&["checkout", "-q", "-b", "topic"]);
        repo.commit("b.txt", "b\n", "topic work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["merge", "-q", "--ff-only", "topic"]);
        assert_eq!(repo.head(), repo.git(&["rev-parse", "topic"]).trim());

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "merge");
        assert!(preview.supported);
        assert_eq!(preview.target_hash, before);
        assert_eq!(preview.target_subject, "c1");
        assert_eq!(preview.description_key, "undo.action.merge");

        let result = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(result.undone_action, "merge");
        assert_eq!(result.to_hash, before);
        assert_eq!(result.head_name.as_deref(), Some("main"));
        assert_eq!(repo.head(), before);
        assert_eq!(repo.subjects(), vec!["c1"]);
        assert!(!repo.path.join("b.txt").exists());
        assert_eq!(repo.git(&["rev-parse", "topic"]).trim(), result.from_hash);
    }

    #[tokio::test]
    async fn undo_after_no_ff_merge() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        repo.git(&["checkout", "-q", "-b", "topic"]);
        repo.commit("b.txt", "b\n", "topic work");
        repo.git(&["checkout", "-q", "main"]);
        let before = repo.commit("c.txt", "c\n", "main work");
        repo.git(&["merge", "-q", "--no-ff", "-m", "merge topic", "topic"]);
        assert_eq!(repo.subjects()[0], "merge topic");

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "merge");
        assert_eq!(preview.target_hash, before);
        assert_eq!(preview.target_short_hash, short_hash(&repo.path, &before));

        let result = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(result.to_hash, before);
        assert_eq!(repo.head(), before);
        assert_eq!(repo.subjects(), vec!["main work", "c1"]);
        assert!(!repo.path.join("b.txt").exists());
        assert!(repo.staged().is_empty());
    }

    #[tokio::test]
    async fn undo_after_finished_rebase() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        repo.git(&["checkout", "-q", "-b", "feature"]);
        repo.commit("f1.txt", "1\n", "feature one");
        let before = repo.commit("f2.txt", "2\n", "feature two");
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("m.txt", "m\n", "main work");
        repo.git(&["checkout", "-q", "feature"]);
        repo.git(&["rebase", "main"]);
        assert_eq!(
            repo.subjects(),
            vec!["feature two", "feature one", "main work", "c1"]
        );

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "rebase (finish)");
        assert!(preview.supported);
        assert_eq!(preview.target_hash, before);
        assert_eq!(preview.description_key, "undo.action.rebase");

        let result = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(result.undone_action, "rebase (finish)");
        assert_eq!(result.to_hash, before);
        assert_eq!(result.head_name.as_deref(), Some("feature"));
        assert_eq!(repo.head(), before);
        assert_eq!(repo.subjects(), vec!["feature two", "feature one", "c1"]);
        assert!(!repo.path.join("m.txt").exists());
    }

    #[tokio::test]
    async fn undo_after_reset_hard_restores_commit() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        let before = repo.commit("b.txt", "b\n", "c2");
        repo.git(&["reset", "-q", "--hard", "HEAD~1"]);
        assert_eq!(repo.subjects(), vec!["c1"]);

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "reset");
        assert_eq!(preview.description_key, "undo.action.reset");

        let result = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(result.undone_action, "reset");
        assert_eq!(result.to_hash, before);
        assert_eq!(repo.head(), before);
        assert_eq!(repo.subjects(), vec!["c2", "c1"]);
        assert_eq!(fs::read_to_string(repo.path.join("b.txt")).unwrap(), "b\n");
    }

    #[tokio::test]
    async fn undo_after_commit_keeps_changes_staged() {
        let repo = TestRepo::new();
        let base = repo.commit("a.txt", "a\n", "c1");
        repo.commit("b.txt", "b\n", "c2");

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "commit");
        assert_eq!(preview.description_key, "undo.action.commit");
        assert_eq!(preview.target_hash, base);

        let result = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(result.undone_action, "commit");
        assert_eq!(result.to_hash, base);
        assert_eq!(repo.head(), base);
        assert_eq!(repo.subjects(), vec!["c1"]);
        assert_eq!(repo.staged(), vec!["b.txt".to_string()]);
        assert_eq!(fs::read_to_string(repo.path.join("b.txt")).unwrap(), "b\n");
    }

    #[tokio::test]
    async fn undo_after_amend_is_soft_and_keyed_separately() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        let before = repo.commit("b.txt", "b\n", "c2");
        fs::write(repo.path.join("c.txt"), "c\n").unwrap();
        repo.git(&["add", "c.txt"]);
        repo.git(&["commit", "-q", "--amend", "-m", "c2 amended"]);

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "commit (amend)");
        assert_eq!(preview.description_key, "undo.action.amend");

        let result = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(result.to_hash, before);
        assert_eq!(repo.subjects(), vec!["c2", "c1"]);
        assert_eq!(repo.staged(), vec!["c.txt".to_string()]);
    }

    #[tokio::test]
    async fn undo_reports_unsupported_actions() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        repo.git(&["checkout", "-q", "-b", "side"]);

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "checkout");
        assert!(!preview.supported);
        assert!(preview.target_hash.is_empty());
        assert_eq!(preview.description_key, "undo.action.unsupported");

        let err = undo_last_operation(repo.str_path()).await.unwrap_err();
        assert_eq!(err, "__UNDO_UNSUPPORTED__|checkout");
        assert_eq!(repo.subjects(), vec!["c1"]);

        let fresh = TestRepo::new();
        let initial = fresh.commit("a.txt", "a\n", "only");
        let err = undo_last_operation(fresh.str_path()).await.unwrap_err();
        assert_eq!(err, "__UNDO_UNSUPPORTED__|commit (initial)");
        assert_eq!(fresh.head(), initial);
    }

    #[tokio::test]
    async fn undo_blocks_on_conflicting_local_changes() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        repo.git(&["checkout", "-q", "-b", "topic"]);
        repo.commit("a.txt", "topic\n", "topic work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["merge", "-q", "--ff-only", "topic"]);
        let after_merge = repo.head();
        fs::write(repo.path.join("a.txt"), "local edit\n").unwrap();

        let err = undo_last_operation(repo.str_path()).await.unwrap_err();
        assert!(err.starts_with("__LOCAL_CHANGES_BLOCK__|"), "{err}");
        assert!(err.contains("a.txt"), "{err}");
        assert_eq!(repo.head(), after_merge);
        assert_eq!(
            fs::read_to_string(repo.path.join("a.txt")).unwrap(),
            "local edit\n"
        );
    }

    #[tokio::test]
    async fn undo_refuses_while_an_operation_is_in_progress() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "base\n", "c1");
        repo.git(&["checkout", "-q", "-b", "topic"]);
        repo.commit("a.txt", "topic\n", "topic work");
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("a.txt", "main\n", "main work");
        let (ok, _) = run_git_raw(&repo.path, &["merge", "topic"]);
        assert!(!ok);

        let err = undo_last_operation(repo.str_path()).await.unwrap_err();
        assert!(err.contains("in progress"), "{err}");
        let err = undo_preview(repo.str_path()).await.unwrap_err();
        assert!(err.contains("in progress"), "{err}");
        repo.git(&["merge", "--abort"]);
        assert!(undo_preview(repo.str_path()).await.is_ok());
    }

    #[tokio::test]
    async fn reset_to_reflog_entry_supports_keep_and_hard() {
        let repo = TestRepo::new();
        let base = repo.commit("a.txt", "a\n", "c1");
        repo.commit("b.txt", "b\n", "c2");
        repo.commit("c.txt", "c\n", "c3");

        let bad = reset_to_reflog_entry(repo.str_path(), "HEAD~1".into(), "keep".into())
            .await
            .unwrap_err();
        assert!(bad.contains("Invalid reflog selector"), "{bad}");

        let bad = reset_to_reflog_entry(repo.str_path(), "HEAD@{0}".into(), "nuke".into())
            .await
            .unwrap_err();
        assert!(bad.contains("Unknown reset mode"), "{bad}");

        let kept = reset_to_reflog_entry(repo.str_path(), "HEAD@{2}".into(), "keep".into())
            .await
            .unwrap();
        assert_eq!(kept.to_hash, base);
        assert_eq!(repo.head(), base);
        assert_eq!(repo.subjects(), vec!["c1"]);

        fs::write(repo.path.join("a.txt"), "dirty\n").unwrap();
        let blocked = reset_to_reflog_entry(repo.str_path(), "HEAD@{1}".into(), "hard".into())
            .await
            .unwrap_err();
        assert!(blocked.starts_with("__LOCAL_CHANGES_BLOCK__|"), "{blocked}");
        assert!(blocked.contains("a.txt"), "{blocked}");
        assert_eq!(repo.head(), base);

        repo.git(&["checkout", "-q", "--", "a.txt"]);
        let hard = reset_to_reflog_entry(repo.str_path(), "HEAD@{1}".into(), "hard".into())
            .await
            .unwrap();
        assert_eq!(repo.head(), hard.to_hash);
        assert_eq!(repo.subjects(), vec!["c3", "c2", "c1"]);
    }

    #[tokio::test]
    async fn branch_restore_recreates_a_deleted_branch() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        repo.git(&["checkout", "-q", "-b", "gone"]);
        let tip = repo.commit("g.txt", "g\n", "gone work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["branch", "-D", "gone"]);
        let (exists, _) = run_git_raw(&repo.path, &["rev-parse", "--verify", "refs/heads/gone"]);
        assert!(!exists);

        let restored = branch_restore(repo.str_path(), "gone".into(), tip.clone())
            .await
            .unwrap();
        assert_eq!(restored.name, "gone");
        assert_eq!(restored.hash, tip);
        assert_eq!(restored.short_hash, short_hash(&repo.path, &tip));
        assert_eq!(repo.git(&["rev-parse", "gone"]).trim(), tip);

        let dup = branch_restore(repo.str_path(), "gone".into(), tip.clone())
            .await
            .unwrap_err();
        assert!(dup.contains("already exists"), "{dup}");

        let unknown = branch_restore(repo.str_path(), "other".into(), "deadbee".into())
            .await
            .unwrap_err();
        assert!(unknown.contains("Unknown commit"), "{unknown}");

        let empty = branch_restore(repo.str_path(), "  ".into(), tip)
            .await
            .unwrap_err();
        assert!(empty.contains("must not be empty"), "{empty}");
    }

    #[tokio::test]
    async fn commit_full_message_returns_body() {
        let repo = TestRepo::new();
        fs::write(repo.path.join("a.txt"), "a\n").unwrap();
        repo.git(&["add", "a.txt"]);
        repo.git(&["commit", "-q", "-m", "subject line", "-m", "body line one"]);
        let hash = repo.head();

        let message = commit_full_message(repo.str_path(), hash.clone())
            .await
            .unwrap();
        assert_eq!(message, "subject line\n\nbody line one");

        let short = commit_full_message(repo.str_path(), short_hash(&repo.path, &hash))
            .await
            .unwrap();
        assert_eq!(short, message);

        let err = commit_full_message(repo.str_path(), "deadbee".into())
            .await
            .unwrap_err();
        assert!(err.contains("Unknown commit"), "{err}");
    }

    #[tokio::test]
    async fn undo_after_cherry_pick_and_revert() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "c1");
        repo.git(&["checkout", "-q", "-b", "topic"]);
        repo.commit("t.txt", "t\n", "topic work");
        repo.git(&["checkout", "-q", "main"]);
        let base = repo.head();
        repo.git(&["cherry-pick", "topic"]);
        let picked = repo.head();

        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "cherry-pick");
        assert_eq!(preview.description_key, "undo.action.cherryPick");
        assert_eq!(preview.target_hash, base);

        repo.git(&["revert", "--no-edit", "HEAD"]);
        let preview = undo_preview(repo.str_path()).await.unwrap();
        assert_eq!(preview.action, "revert");
        assert_eq!(preview.description_key, "undo.action.revert");
        assert_eq!(preview.target_hash, picked);

        let undone = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(undone.undone_action, "revert");
        assert_eq!(undone.to_hash, picked);
        assert_eq!(repo.head(), picked);
        assert_eq!(repo.subjects(), vec!["topic work", "c1"]);

        repo.git(&["reset", "-q", "--hard", &base]);
        repo.git(&["cherry-pick", "topic"]);
        let undone = undo_last_operation(repo.str_path()).await.unwrap();
        assert_eq!(undone.undone_action, "cherry-pick");
        assert_eq!(undone.to_hash, base);
        assert_eq!(repo.head(), base);
        assert_eq!(repo.subjects(), vec!["c1"]);
    }

    #[test]
    fn reflog_subjects_are_split_into_action_and_message() {
        assert_eq!(parse_action("merge topic: Fast-forward"), "merge");
        assert_eq!(
            parse_message("merge topic: Fast-forward"),
            "Fast-forward"
        );
        assert_eq!(parse_action("rebase (finish): returning to refs/heads/x"), "rebase (finish)");
        assert_eq!(parse_action("rebase -i (finish): returning"), "rebase (finish)");
        assert_eq!(parse_action("commit (amend): msg"), "commit (amend)");
        assert_eq!(parse_action("commit: msg"), "commit");
        assert_eq!(parse_message("commit: msg: with colon"), "msg: with colon");
        assert_eq!(parse_action("reset: moving to HEAD~1"), "reset");
        assert_eq!(parse_action("cherry-pick"), "cherry-pick");
        assert_eq!(parse_message("cherry-pick"), "cherry-pick");
        assert_eq!(parse_action(""), "");
        assert_eq!(action_qualifier("rebase (start)"), "start");
        assert_eq!(action_qualifier("merge"), "");
        assert_eq!(parse_date("HEAD@{2026-08-15T20:30:01+02:00}"), "2026-08-15T20:30:01+02:00");
        assert_eq!(parse_date("HEAD@{}"), "");
        assert_eq!(parse_date("broken"), "");
    }

    #[test]
    fn selectors_and_block_messages_are_parsed_strictly() {
        assert_eq!(parse_selector(" HEAD@{12} ").unwrap(), "HEAD@{12}");
        assert!(parse_selector("HEAD@{x}").is_err());
        assert!(parse_selector("HEAD@{}").is_err());
        assert!(parse_selector("HEAD~1").is_err());
        assert!(parse_selector("stash@{0}").is_err());
        assert_eq!(
            map_error("error: Entry 'a.txt' not uptodate. Cannot merge.\nfatal: nope".into()),
            "__LOCAL_CHANGES_BLOCK__|a.txt"
        );
        assert_eq!(
            map_error("error: Entry 'x/y.txt' would be overwritten by merge. Cannot merge.".into()),
            "__LOCAL_CHANGES_BLOCK__|x/y.txt"
        );
        assert_eq!(map_error("fatal: bad object".into()), "fatal: bad object");
        assert_eq!(map_error("  ".into()), "git: command failed");
    }
}
