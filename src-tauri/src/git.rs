use crate::coded;
use crate::error::{coded, required, ErrorCode, Label, Param};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;

use crate::cmd::git_command;
use crate::cmdlog;

#[derive(Clone, Serialize)]
pub struct Commit {
    hash: String,
    short_hash: String,
    author: String,
    email: String,
    date: String,
    subject: String,
    body: String,
    parents: Vec<String>,
    tags: Vec<String>,
    author_avatar: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct CommitSearchResult {
    pub commit: Commit,
    pub matched_paths: Vec<String>,
}

#[derive(Serialize)]
pub struct Branch {
    name: String,
    is_current: bool,
    is_remote: bool,
    tip: String,
    behind: Option<u32>,
}

#[derive(Serialize)]
pub struct TagRef {
    pub name: String,
    pub commit: String,
    pub kind: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
}

#[derive(Serialize)]
pub struct RepoInfo {
    path: String,
    branch: String,
    commits: Vec<Commit>,
    branches: Vec<Branch>,
    tags: Vec<TagRef>,
}

#[derive(Serialize)]
pub struct UpstreamSyncCounts {
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize)]
pub struct FullStatus {
    pub entries: Vec<StatusEntry>,
    pub upstream_sync: UpstreamSyncCounts,
    pub has_upstream: bool,
}

#[derive(Serialize)]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

pub(crate) fn run_git(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    let span = cmdlog::start(&repo.to_string_lossy(), args);
    let output = match git_command().arg("-C").arg(repo).args(args).output() {
        Ok(output) => output,
        Err(e) => {
            span.finish(false);
            return Err(format!("failed to run git: {e}"));
        }
    };
    span.finish(output.status.success());

    if !output.status.success() {
        return Err(merged_failure_message(
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn merged_failure_message(stdout: &str, stderr: &str) -> String {
    let msg = match (stderr.is_empty(), stdout.is_empty()) {
        (false, false) => format!("{stderr}\n{stdout}"),
        (false, true) => stderr.to_string(),
        (true, false) => stdout.to_string(),
        (true, true) => "git: command failed".into(),
    };
    let trimmed = msg.trim().to_string();
    if trimmed.is_empty() {
        return "git: command failed".into();
    }
    if trimmed.contains("Your local changes to the following files would be overwritten")
        || trimmed.contains("would be overwritten by merge")
        || trimmed.contains("Please commit your changes or stash them before you")
    {
        let files: Vec<&str> = trimmed
            .lines()
            .filter(|l| l.starts_with('\t'))
            .map(|l| l.trim())
            .collect();
        return format!("__LOCAL_CHANGES_BLOCK__|{}", files.join(","));
    }
    trimmed
}

fn merged_ok_message(stdout: &str, stderr: &str) -> String {
    let ok = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout.to_string(),
        (true, false) => stderr.to_string(),
        (true, true) => String::new(),
    };
    ok.trim().to_string()
}

fn run_git_merged_output_at(cwd: Option<&PathBuf>, args: &[&str]) -> Result<String, String> {
    let mut cmd = git_command();
    if let Some(dir) = cwd {
        cmd.arg("-C").arg(dir);
    }
    let log_path = cwd
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();
    let span = cmdlog::start(&log_path, args);
    let output = match cmd.args(args).output() {
        Ok(output) => output,
        Err(e) => {
            span.finish(false);
            return Err(format!("failed to run git: {e}"));
        }
    };
    span.finish(output.status.success());

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(merged_failure_message(&stdout, &stderr));
    }

    Ok(merged_ok_message(&stdout, &stderr))
}

pub(crate) fn run_git_merged_output(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    run_git_merged_output_at(Some(repo), args)
}

async fn spawn_git<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f)
        .await
        .expect("git blocking task panicked")
}

mod search;
pub use search::*;

mod history;
pub use history::*;
mod coordination;
pub(crate) use coordination::repo_coordination_mutex;
mod commit_split;
pub use commit_split::*;

pub const DEFAULT_REMOTE: &str = "origin";

fn reject_dash_arg(value: &str, label: Label) -> Result<(), String> {
    if value.starts_with('-') {
        return Err(coded(
            ErrorCode::LeadingDash,
            &[("field", Param::Label(label)), ("value", Param::text(value))],
        ));
    }
    Ok(())
}

pub(crate) fn resolve_git_commit(repo: &PathBuf, rev: &str) -> Result<String, String> {
    let rev = rev.trim();
    if rev.is_empty() || rev.starts_with('-') || rev.chars().any(char::is_control) {
        return Err(format!("Invalid commit revision: {rev}"));
    }
    run_git(
        repo,
        &[
            "rev-parse",
            "--verify",
            "--end-of-options",
            &format!("{rev}^{{commit}}"),
        ],
    )
    .map(|hash| hash.trim().to_string())
}

pub(crate) fn repo_mutation_mutex(
    repo: &PathBuf,
) -> Result<std::sync::Arc<std::sync::Mutex<()>>, String> {
    static LOCKS: std::sync::OnceLock<
        std::sync::Mutex<HashMap<PathBuf, std::sync::Weak<std::sync::Mutex<()>>>>,
    > = std::sync::OnceLock::new();
    let directory = run_git(repo, &["rev-parse", "--absolute-git-dir"])?;
    let key = PathBuf::from(directory.strip_suffix('\n').unwrap_or(&directory))
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let mut locks = LOCKS
        .get_or_init(Default::default)
        .lock()
        .map_err(|e| e.to_string())?;
    locks.retain(|_, weak| weak.strong_count() > 0);
    if let Some(lock) = locks.get(&key).and_then(std::sync::Weak::upgrade) {
        return Ok(lock);
    }
    let lock = std::sync::Arc::new(std::sync::Mutex::new(()));
    locks.insert(key, std::sync::Arc::downgrade(&lock));
    Ok(lock)
}

fn verify_expected_head(repo: &PathBuf, expected: Option<&str>) -> Result<(), String> {
    if let Some(expected) = expected {
        let actual =
            resolve_git_commit(repo, "HEAD").map_err(|_| "__HEAD_CHANGED__".to_string())?;
        if expected.trim() != actual {
            return Err("__HEAD_CHANGED__".into());
        }
    }
    Ok(())
}

fn validate_branch_name(repo: &PathBuf, name: &str) -> Result<(), String> {
    reject_dash_arg(name, Label::BranchName)?;
    // Reject revision shorthand: check-ref-format --branch expands @{-1},
    // while branch creation expects the literal name entered by the user.
    if name == "HEAD" || name.starts_with("@{") {
        return Err(format!("Invalid branch name: {name}"));
    }
    run_git(repo, &["check-ref-format", "--branch", name]).map(|_| ())
}

#[tauri::command]
pub async fn git_resolve_commit(path: String, rev: String) -> Result<String, String> {
    spawn_git(move || resolve_git_commit(&PathBuf::from(&path), &rev)).await
}

mod stash;
pub use stash::*;

mod file_reads;
mod file_snapshot;
mod patch_batch;
pub use patch_batch::*;
pub(crate) use file_reads::{
    file_path as literal_file_path, git_file_blob_oid, open_worktree_file, worktree_link_text,
};
pub(crate) use file_snapshot::fingerprint as worktree_file_fingerprint;
pub(crate) use file_snapshot::review_content_fingerprint;

mod languages;
pub use languages::*;

mod worktrees;
pub use worktrees::*;

mod submodules;
pub use submodules::*;

mod hooks;
pub use hooks::*;

mod bisect;
pub use bisect::*;

mod external_tools;
pub use external_tools::*;

mod patches;
pub use patches::*;

mod remote_ops;
pub use remote_ops::*;
mod tags;
pub use tags::*;
mod repo_log;
pub use repo_log::*;
mod remotes;
pub use remotes::*;
mod branches;
pub use branches::*;
mod merge;
pub use merge::*;
mod staging;
pub use staging::*;
mod status;
pub use status::*;
mod commit;
pub use commit::*;
mod diff;
pub use diff::*;
mod blame;
pub use blame::*;
mod stats;
pub use stats::*;
