use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

#[derive(Serialize)]
struct Commit {
    hash: String,
    short_hash: String,
    author: String,
    email: String,
    date: String,
    subject: String,
}

#[derive(Serialize)]
struct Branch {
    name: String,
    is_current: bool,
    is_remote: bool,
}

#[derive(Serialize)]
struct RepoInfo {
    path: String,
    branch: String,
    commits: Vec<Commit>,
    branches: Vec<Branch>,
}

fn run_git(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn open_repo(path: String) -> Result<RepoInfo, String> {
    let repo = PathBuf::from(&path);

    run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
        .map_err(|_| format!("'{path}' is not a git repository"))?;

    let branch = run_git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "HEAD".into());

    // Use an uncommon separator so commit subjects don't collide.
    let sep = "\x1f";
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%s");

    let log = run_git(
        &repo,
        &[
            "log",
            "--max-count=200",
            &format!("--pretty=format:{format}"),
        ],
    )?;

    let commits = log
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(6, sep);
            Some(Commit {
                hash: parts.next()?.to_string(),
                short_hash: parts.next()?.to_string(),
                author: parts.next()?.to_string(),
                email: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
                subject: parts.next()?.to_string(),
            })
        })
        .collect();

    let branches = list_branches(&repo).unwrap_or_default();

    Ok(RepoInfo {
        path: repo.to_string_lossy().to_string(),
        branch,
        commits,
        branches,
    })
}

#[tauri::command]
fn delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    let repo = PathBuf::from(&path);
    let flag = if force { "-D" } else { "-d" };
    run_git(&repo, &["branch", flag, &name])?;
    Ok(())
}

fn list_branches(repo: &PathBuf) -> Result<Vec<Branch>, String> {
    let sep = "\x1f";
    let format = format!("%(HEAD){sep}%(refname)");
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            &format!("--format={format}"),
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    let branches = out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, sep);
            let head = parts.next()?;
            let refname = parts.next()?;
            let is_current = head.trim() == "*";

            let (name, is_remote) = if let Some(rest) = refname.strip_prefix("refs/heads/") {
                (rest.to_string(), false)
            } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
                if rest.ends_with("/HEAD") {
                    return None;
                }
                (rest.to_string(), true)
            } else {
                return None;
            };

            Some(Branch {
                name,
                is_current,
                is_remote,
            })
        })
        .collect();

    Ok(branches)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![open_repo, delete_branch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
