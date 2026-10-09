use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;

use crate::git::{resolve_git_commit, run_git};

const MAX_FILES: usize = 5_000;
const MAX_PATCH_BYTES: usize = 1_048_576;

#[derive(Serialize)]
pub struct CompareFile {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    pub binary: bool,
}

#[derive(Serialize)]
pub struct CompareSummary {
    pub base: String,
    pub head: String,
    pub base_hash: String,
    pub head_hash: String,
    pub merge_base: Option<String>,
    pub mode: String,
    pub ahead: u64,
    pub behind: u64,
    pub files: Vec<CompareFile>,
    pub total_files: usize,
    pub truncated: bool,
    pub additions: u64,
    pub deletions: u64,
}

#[derive(Serialize)]
pub struct CompareFileDiff {
    pub patch: String,
    pub truncated: bool,
    pub binary: bool,
}

fn validate_mode(mode: &str) -> Result<(), String> {
    if mode == "direct" || mode == "merge-base" {
        Ok(())
    } else {
        Err("__COMPARE_INVALID_MODE__".into())
    }
}

fn comparison_refs(repo: &PathBuf, base: &str, head: &str, mode: &str) -> Result<(String, String, Option<String>), String> {
    validate_mode(mode)?;
    let base = resolve_git_commit(repo, base)?;
    let head = resolve_git_commit(repo, head)?;
    let merge_base = run_git(repo, &["merge-base", &base, &head]).ok().map(|hash| hash.trim().to_string()).filter(|hash| !hash.is_empty());
    if mode == "merge-base" && merge_base.is_none() {
        return Err("__COMPARE_NO_COMMON_ANCESTOR__".into());
    }
    Ok((base, head, merge_base))
}

fn parse_names(output: &str) -> Result<Vec<CompareFile>, String> {
    let mut fields = output.split('\0').peekable();
    let mut files = Vec::new();
    while let Some(status) = fields.next() {
        if status.is_empty() { continue; }
        let kind = status.chars().next().ok_or("Invalid diff status")?;
        let first = fields.next().ok_or("Incomplete diff file record")?;
        let (previous_path, path) = if kind == 'R' || kind == 'C' {
            (Some(first.to_string()), fields.next().ok_or("Incomplete diff rename record")?)
        } else { (None, first) };
        if path.is_empty() { return Err("Empty diff file path".into()); }
        files.push(CompareFile { path: path.to_string(), previous_path, status: kind.to_string(), additions: 0, deletions: 0, binary: false });
    }
    Ok(files)
}

fn parse_stats(output: &str) -> Result<HashMap<String, (u64, u64, bool)>, String> {
    let mut fields = output.split('\0');
    let mut stats = HashMap::new();
    while let Some(record) = fields.next() {
        if record.is_empty() { continue; }
        let mut parts = record.splitn(3, '\t');
        let adds = parts.next().ok_or("Missing additions")?;
        let dels = parts.next().ok_or("Missing deletions")?;
        let mut path = parts.next().ok_or("Missing diff file path")?;
        if path.is_empty() {
            let _old = fields.next().ok_or("Missing old rename path")?;
            path = fields.next().ok_or("Missing new rename path")?;
        }
        let binary = adds == "-" || dels == "-";
        let additions = if binary { 0 } else { adds.parse().map_err(|_| "Invalid additions count")? };
        let deletions = if binary { 0 } else { dels.parse().map_err(|_| "Invalid deletions count")? };
        stats.insert(path.to_string(), (additions, deletions, binary));
    }
    Ok(stats)
}

fn validate_file(file: &str) -> Result<(), String> {
    if file.is_empty() || file.contains('\0') || Path::new(file).components().any(|component| !matches!(component, Component::Normal(_))) {
        return Err("__INVALID_TARGET_PATH__".into());
    }
    Ok(())
}

fn summary(repo: PathBuf, base: String, head: String, mode: String) -> Result<CompareSummary, String> {
    let (base_hash, head_hash, merge_base) = comparison_refs(&repo, &base, &head, &mode)?;
    let diff_base = if mode == "merge-base" { merge_base.as_deref().unwrap() } else { &base_hash };
    let names = run_git(&repo, &["diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", "--find-renames", "-l1000", diff_base, &head_hash, "--"])?;
    let stats = run_git(&repo, &["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", "--find-renames", "-l1000", diff_base, &head_hash, "--"])?;
    let stats = parse_stats(&stats)?;
    let mut files = parse_names(&names)?;
    for file in &mut files {
        let (adds, dels, binary) = stats.get(&file.path).copied().ok_or("Incomplete comparison statistics")?;
        file.additions = adds;
        file.deletions = dels;
        file.binary = binary;
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    let total_files = files.len();
    files.truncate(MAX_FILES);
    let counts = run_git(&repo, &["rev-list", "--left-right", "--count", &format!("{base_hash}...{head_hash}"), "--"])?;
    let mut counts = counts.split_whitespace();
    let behind = counts.next().ok_or("Missing comparison count")?.parse().map_err(|_| "Invalid comparison count")?;
    let ahead = counts.next().ok_or("Missing comparison count")?.parse().map_err(|_| "Invalid comparison count")?;
    Ok(CompareSummary { base, head, base_hash, head_hash, merge_base, mode, ahead, behind, files, total_files, truncated: total_files > MAX_FILES, additions, deletions })
}

/// Read at most one MiB of patch output and stop Git when the limit is reached.
/// No external diff/textconv process or worktree write is allowed for this view.
fn file_patch(repo: PathBuf, base: String, head: String, mode: String, file: String, previous_file: Option<String>) -> Result<CompareFileDiff, String> {
    validate_file(&file)?;
    if let Some(previous) = &previous_file { validate_file(previous)?; }
    let (base_hash, head_hash, merge_base) = comparison_refs(&repo, &base, &head, &mode)?;
    let diff_base = if mode == "merge-base" { merge_base.as_deref().unwrap() } else { &base_hash };
    let mut args = vec!["--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", "-l1000", "--unified=3", diff_base, &head_hash, "--", &file];
    if let Some(previous) = &previous_file { args.push(previous); }
    let span = crate::cmdlog::start(&repo.to_string_lossy(), &args);
    let mut child = crate::cmd::git_command().arg("-C").arg(&repo).args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|error| format!("Failed to run git: {error}"))?;
    let mut stdout = child.stdout.take().ok_or("Missing git output")?;
    let mut stderr = child.stderr.take().ok_or("Missing git error output")?;
    let errors = std::thread::spawn(move || {
        let mut retained = Vec::new();
        let _ = (&mut stderr).take(65_536).read_to_end(&mut retained);
        let _ = std::io::copy(&mut stderr, &mut std::io::sink());
        retained
    });
    let mut bytes = Vec::new();
    let read = (&mut stdout).take(MAX_PATCH_BYTES as u64 + 1).read_to_end(&mut bytes);
    let truncated = bytes.len() > MAX_PATCH_BYTES;
    if truncated || read.is_err() { let _ = child.kill(); }
    let status = child.wait().map_err(|error| format!("Failed to wait for git: {error}"))?;
    let errors = errors.join().unwrap_or_default();
    span.finish(status.success() || truncated);
    read.map_err(|error| format!("Failed to read git output: {error}"))?;
    if !status.success() && !truncated { return Err(String::from_utf8_lossy(&errors).trim().to_string()); }
    bytes.truncate(MAX_PATCH_BYTES);
    let mut patch = String::from_utf8_lossy(&bytes).to_string();
    if patch.is_empty() { return Err("__COMPARE_FILE_NOT_CHANGED__".into()); }
    if truncated {
        if let Some(end) = patch.rfind('\n') { patch.truncate(end + 1); }
    }
    let binary = patch.lines().any(|line| line.starts_with("Binary files ") || line.starts_with("GIT binary patch"));
    Ok(CompareFileDiff { patch, truncated, binary })
}

#[tauri::command]
pub async fn repo_compare_commits(path: String, base: String, head: String, mode: Option<String>) -> Result<CompareSummary, String> {
    tokio::task::spawn_blocking(move || summary(PathBuf::from(path), base, head, mode.unwrap_or_else(|| "direct".into()))).await.map_err(|error| format!("Comparison task failed: {error}"))?
}

#[tauri::command]
pub async fn repo_compare_file_diff(path: String, base: String, head: String, mode: Option<String>, file: String, previous_file: Option<String>) -> Result<CompareFileDiff, String> {
    tokio::task::spawn_blocking(move || file_patch(PathBuf::from(path), base, head, mode.unwrap_or_else(|| "direct".into()), file, previous_file)).await.map_err(|error| format!("Comparison task failed: {error}"))?
}
