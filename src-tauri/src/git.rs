use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;

use crate::cmd::git_command;

#[derive(Serialize)]
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

#[derive(Serialize)]
pub struct Branch {
    name: String,
    is_current: bool,
    is_remote: bool,
    tip: String,
}

#[derive(Serialize)]
pub struct RepoInfo {
    path: String,
    branch: String,
    commits: Vec<Commit>,
    branches: Vec<Branch>,
}

#[derive(Serialize)]
pub struct UpstreamSyncCounts {
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize)]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

pub(crate) fn run_git(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    let output = git_command()
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

fn run_git_merged_output_at(cwd: Option<&PathBuf>, args: &[&str]) -> Result<String, String> {
    let mut cmd = git_command();
    if let Some(dir) = cwd {
        cmd.arg("-C").arg(dir);
    }
    let output = cmd
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        let msg = match (stderr.is_empty(), stdout.is_empty()) {
            (false, false) => format!("{stderr}\n{stdout}"),
            (false, true) => stderr,
            (true, false) => stdout,
            (true, true) => "git: Befehl fehlgeschlagen".into(),
        };
        return Err(msg.trim().to_string());
    }

    let ok = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => String::new(),
    };
    Ok(ok.trim().to_string())
}

pub(crate) fn run_git_merged_output(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    run_git_merged_output_at(Some(repo), args)
}

fn tags_by_target(repo: &PathBuf) -> HashMap<String, Vec<String>> {
    const FMT: &str = "%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)\u{001f}%(refname:strip=2)";
    let Ok(out) = run_git(
        repo,
        &[
            "for-each-ref",
            "refs/tags",
            &format!("--format={FMT}"),
        ],
    ) else {
        return HashMap::new();
    };
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, '\x1f');
        let Some(oid) = parts.next() else {
            continue;
        };
        let Some(name) = parts.next() else {
            continue;
        };
        let oid = oid.trim();
        let name = name.trim();
        if oid.is_empty() || name.is_empty() {
            continue;
        }
        map.entry(oid.to_string())
            .or_default()
            .push(name.to_string());
    }
    for names in map.values_mut() {
        names.sort();
    }
    map
}

#[tauri::command]
pub fn open_repo(path: String) -> Result<RepoInfo, String> {
    let repo = PathBuf::from(&path);

    run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
        .map_err(|_| format!("'{path}' is not a git repository"))?;

    let branch = run_git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "HEAD".into());

    let tag_map = tags_by_target(&repo);

    let sep = "\x1f";
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b");

    let log = run_git(
        &repo,
        &[
            "log",
            "-z",
            "--max-count=200",
            "--all",
            "--date-order",
            &format!("--pretty=format:{format}"),
        ],
    )?;

    let commits = log
        .split('\0')
        .filter(|chunk| !chunk.is_empty())
        .filter_map(|record| {
            let mut parts = record.splitn(8, sep);
            let hash = parts.next()?.to_string();
            let short_hash = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let email = parts.next()?.to_string();
            let date = parts.next()?.to_string();
            let parents_str = parts.next()?;
            let subject = parts.next()?.to_string();
            let body = parts.next().unwrap_or_default().to_string();
            let parents = parents_str
                .split_whitespace()
                .map(|s| s.to_string())
                .collect();
            let tags = tag_map.get(&hash).cloned().unwrap_or_default();
            Some(Commit {
                hash,
                short_hash,
                author,
                email,
                date,
                subject,
                body,
                parents,
                tags,
                author_avatar: None,
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
pub fn git_fetch(path: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    run_git_merged_output(&repo, &["fetch", "--prune"])
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    run_git_merged_output(&repo, &["pull"])
}

#[tauri::command]
pub fn git_push(path: String, set_upstream: bool) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    if set_upstream {
        let branch = run_git(&repo, &["symbolic-ref", "--short", "HEAD"])
            .map(|s| s.trim().to_string())?;
        run_git_merged_output(&repo, &["push", "-u", "origin", &branch])
    } else {
        run_git_merged_output(&repo, &["push"])
    }
}

#[tauri::command]
pub fn list_git_remotes(path: String) -> Result<Vec<GitRemote>, String> {
    let repo = PathBuf::from(path.trim());
    let names_out = run_git(&repo, &["remote"])?;
    let mut remotes = Vec::new();
    for name in names_out.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let Ok(url) = run_git(&repo, &["remote", "get-url", name]) else {
            continue;
        };
        let url = url.trim().to_string();
        if url.is_empty() {
            continue;
        }
        remotes.push(GitRemote {
            name: name.to_string(),
            url,
        });
    }
    Ok(remotes)
}

#[tauri::command]
pub fn set_git_remote_url(path: String, name: String, url: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let n = name.trim();
    let u = url.trim();
    if n.is_empty() {
        return Err("Remote-Name darf nicht leer sein".into());
    }
    if u.is_empty() {
        return Err("Remote-URL darf nicht leer sein".into());
    }
    run_git_merged_output(&repo, &["remote", "set-url", n, u])
}

#[tauri::command]
pub fn add_git_remote(path: String, name: String, url: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let n = name.trim();
    let u = url.trim();
    if n.is_empty() {
        return Err("Remote-Name darf nicht leer sein".into());
    }
    if u.is_empty() {
        return Err("Remote-URL darf nicht leer sein".into());
    }
    run_git_merged_output(&repo, &["remote", "add", n, u])
}

#[tauri::command]
pub fn branch_has_upstream(path: String) -> Result<bool, String> {
    let repo = PathBuf::from(path.trim());
    let output = git_command()
        .arg("-C")
        .arg(&repo)
        .args([
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ])
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;
    Ok(output.status.success())
}

#[tauri::command]
pub fn repo_upstream_sync_counts(path: String) -> Result<UpstreamSyncCounts, String> {
    let repo = PathBuf::from(path.trim());
    let Ok(out) = run_git(
        &repo,
        &[
            "rev-list",
            "--left-right",
            "--count",
            "@{upstream}...HEAD",
        ],
    ) else {
        return Ok(UpstreamSyncCounts { ahead: 0, behind: 0 });
    };
    let mut parts = out.split_whitespace();
    let behind = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let ahead = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    Ok(UpstreamSyncCounts { ahead, behind })
}

#[tauri::command]
pub fn git_clone(url: String, dest: String) -> Result<String, String> {
    let u = url.trim();
    let d = dest.trim();
    if u.is_empty() {
        return Err("Clone-URL darf nicht leer sein".into());
    }
    if d.is_empty() {
        return Err("Zielpfad darf nicht leer sein".into());
    }
    run_git_merged_output_at(None, &["clone", u, d])
}

#[tauri::command]
pub fn git_checkout(
    path: String,
    ref_name: String,
    create: bool,
    from_remote: Option<String>,
    base: Option<String>,
) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let name = ref_name.trim();
    if name.is_empty() {
        return Err("Branch- oder Ref-Name darf nicht leer sein".into());
    }
    if let Some(remote) = from_remote.filter(|s| !s.trim().is_empty()) {
        let r = remote.trim();
        run_git(
            &repo,
            &["checkout", "-b", name, "--track", r],
        )?;
        return Ok(());
    }
    if create {
        let mut args: Vec<String> = vec!["checkout".into(), "-b".into(), name.to_string()];
        if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
            args.push(b.trim().to_string());
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &refs)?;
        return Ok(());
    }
    run_git(&repo, &["checkout", name])?;
    Ok(())
}

#[tauri::command]
pub fn git_create_branch(
    path: String,
    name: String,
    base: Option<String>,
    checkout: bool,
) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let n = name.trim();
    if n.is_empty() {
        return Err("Branch-Name darf nicht leer sein".into());
    }
    if checkout {
        let mut args: Vec<String> = vec!["checkout".into(), "-b".into(), n.to_string()];
        if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
            args.push(b.trim().to_string());
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &refs)?;
        return Ok(());
    }
    let mut args: Vec<String> = vec!["branch".into(), n.to_string()];
    if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
        args.push(b.trim().to_string());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git(&repo, &refs)?;
    Ok(())
}

#[tauri::command]
pub fn git_merge(
    path: String,
    branch: String,
    strategy: Option<String>,
    message: Option<String>,
) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let b = branch.trim();
    if b.is_empty() {
        return Err("Branch-Name darf nicht leer sein".into());
    }

    let strat = strategy
        .as_deref()
        .map(|s| s.trim())
        .unwrap_or("ff")
        .to_lowercase();

    let trimmed_msg = message
        .as_deref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    match strat.as_str() {
        "ff" => {
            let mut args: Vec<String> = vec!["merge".into(), "--ff".into()];
            if let Some(msg) = trimmed_msg.as_ref() {
                args.push("-m".into());
                args.push(msg.clone());
            }
            args.push(b.to_string());
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_git_merged_output(&repo, &refs)
        }
        "ff-only" => run_git_merged_output(&repo, &["merge", "--ff-only", b]),
        "no-ff" => {
            let current = current_branch_name(&repo).unwrap_or_default();
            let msg = trimmed_msg.unwrap_or_else(|| default_merge_message(b, &current));
            run_git_merged_output(
                &repo,
                &["merge", "--no-ff", "--no-edit", "-m", msg.as_str(), b],
            )
        }
        "squash" => {
            let current = current_branch_name(&repo).unwrap_or_default();
            let squash_out = run_git_merged_output(&repo, &["merge", "--squash", b])?;
            let msg = trimmed_msg.unwrap_or_else(|| default_squash_message(b, &current));
            let commit_out = run_git_merged_output(&repo, &["commit", "-m", msg.as_str()])?;
            let combined = match (squash_out.is_empty(), commit_out.is_empty()) {
                (false, false) => format!("{squash_out}\n{commit_out}"),
                (false, true) => squash_out,
                (true, false) => commit_out,
                (true, true) => String::new(),
            };
            Ok(combined)
        }
        other => Err(format!("Unbekannte Merge-Strategie: {other}")),
    }
}

fn current_branch_name(repo: &PathBuf) -> Option<String> {
    run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD")
}

fn default_merge_message(source: &str, target: &str) -> String {
    if target.is_empty() {
        format!("Merge branch '{source}'")
    } else {
        format!("Merge branch '{source}' into {target}")
    }
}

fn default_squash_message(source: &str, target: &str) -> String {
    if target.is_empty() {
        format!("Squashed commit from '{source}'")
    } else {
        format!("Squashed commit from '{source}' into {target}")
    }
}

#[tauri::command]
pub fn git_revert_commit(
    path: String,
    commit: String,
    merge_mainline: Option<u8>,
) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let c = commit.trim();
    if c.is_empty() {
        return Err("Commit-Hash darf nicht leer sein".into());
    }
    let mut parts: Vec<String> = vec!["revert".into(), "--no-edit".into()];
    if let Some(m) = merge_mainline {
        if m < 1 {
            return Err("Mainline-Parent muss mindestens 1 sein".into());
        }
        parts.push("-m".into());
        parts.push(m.to_string());
    }
    parts.push(c.to_string());
    let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
    run_git_merged_output(&repo, &args)
}

#[tauri::command]
pub fn git_tag_commit(path: String, name: String, commit: String) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let tag = name.trim();
    if tag.is_empty() {
        return Err("Tag-Name darf nicht leer sein".into());
    }
    let c = commit.trim();
    if c.is_empty() {
        return Err("Commit-Hash darf nicht leer sein".into());
    }
    let parts = vec!["tag".to_string(), tag.to_string(), c.to_string()];
    let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
    run_git(&repo, &args)?;
    Ok(())
}

#[tauri::command]
pub fn git_discard_files(
    path: String,
    files: Vec<String>,
    untracked: Vec<bool>,
) -> Result<(), String> {
    if files.len() != untracked.len() {
        return Err("untracked muss dieselbe Länge wie files haben".into());
    }
    let repo = PathBuf::from(path.trim());
    let mut tracked: Vec<&str> = Vec::new();
    for (f, is_untracked) in files.iter().zip(untracked.iter()) {
        let p = f.trim();
        if p.is_empty() {
            continue;
        }
        if *is_untracked {
            let abs = repo.join(p);
            if abs.is_dir() {
                std::fs::remove_dir_all(&abs)
                    .map_err(|e| format!("Ordner konnte nicht entfernt werden: {e}"))?;
            } else if abs.exists() {
                std::fs::remove_file(&abs)
                    .map_err(|e| format!("Datei konnte nicht entfernt werden: {e}"))?;
            }
        } else {
            tracked.push(f.as_str());
        }
    }
    if !tracked.is_empty() {
        let mut args: Vec<&str> = vec!["restore", "--source=HEAD", "--staged", "--worktree", "--"];
        args.extend(tracked.iter().copied());
        run_git(&repo, &args)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    let repo = PathBuf::from(&path);
    let flag = if force { "-D" } else { "-d" };
    run_git(&repo, &["branch", flag, &name])?;
    Ok(())
}

#[tauri::command]
pub fn delete_remote_branch(path: String, remote_ref: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let s = remote_ref.trim();
    let slash = s.find('/').ok_or_else(|| {
        "Ungültige Remote-Ref (erwartet z. B. origin/zweig)".to_string()
    })?;
    let remote = s[..slash].trim();
    let branch = s[slash + 1..].trim();
    if remote.is_empty() || branch.is_empty() {
        return Err("Ungültige Remote-Ref".into());
    }
    let out = run_git_merged_output(&repo, &["push", remote, "--delete", branch])?;
    let _ = run_git_merged_output(&repo, &["fetch", remote, "--prune"]);
    Ok(out)
}

#[derive(Serialize)]
pub struct StatusEntry {
    path: String,
    index_status: String,
    worktree_status: String,
    staged: bool,
    unstaged: bool,
    untracked: bool,
    additions_staged: u32,
    deletions_staged: u32,
    additions_unstaged: u32,
    deletions_unstaged: u32,
    binary: bool,
}

fn diff_reports_binary(diff: &str) -> bool {
    diff.lines().any(|line| {
        line.starts_with("Binary files ") && line.ends_with(" differ")
    })
}

fn parse_numstat(out: &str) -> HashMap<String, (u32, u32, bool)> {
    let mut map = HashMap::new();
    let mut iter = out.split('\0').filter(|s| !s.is_empty());
    while let Some(part) = iter.next() {
        let mut fields = part.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        let path_part = fields.next().unwrap_or("");
        let binary = adds_s == "-" || dels_s == "-";
        let adds: u32 = adds_s.parse().unwrap_or(0);
        let dels: u32 = dels_s.parse().unwrap_or(0);
        let path = if path_part.is_empty() {
            let _old = iter.next();
            iter.next().unwrap_or("").to_string()
        } else {
            path_part.to_string()
        };
        if !path.is_empty() {
            map.insert(path, (adds, dels, binary));
        }
    }
    map
}

fn count_lines(content: &[u8]) -> u32 {
    if content.is_empty() {
        return 0;
    }
    let mut count = content.iter().filter(|&&b| b == b'\n').count() as u32;
    if !content.ends_with(b"\n") {
        count += 1;
    }
    count
}

fn looks_binary(content: &[u8]) -> bool {
    content.iter().take(8000).any(|&b| b == 0)
}

#[tauri::command]
pub fn repo_status(path: String) -> Result<Vec<StatusEntry>, String> {
    let repo = PathBuf::from(&path);
    let out = run_git(&repo, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;

    let staged_numstat = run_git(&repo, &["diff", "--cached", "--numstat", "-z"])
        .map(|s| parse_numstat(&s))
        .unwrap_or_default();
    let unstaged_numstat = run_git(&repo, &["diff", "--numstat", "-z"])
        .map(|s| parse_numstat(&s))
        .unwrap_or_default();

    let mut entries = Vec::new();
    let mut iter = out.split('\0').peekable();
    while let Some(raw) = iter.next() {
        if raw.is_empty() {
            continue;
        }
        if raw.len() < 3 {
            continue;
        }
        let bytes = raw.as_bytes();
        let index_status = (bytes[0] as char).to_string();
        let worktree_status = (bytes[1] as char).to_string();
        let file_path = raw[3..].to_string();

        if index_status == "R" || index_status == "C" {
            let _ = iter.next();
        }

        let untracked = index_status == "?" && worktree_status == "?";
        let staged = !untracked && index_status != " " && index_status != "?";
        let unstaged = !untracked && worktree_status != " " && worktree_status != "?";

        let (additions_staged, deletions_staged, staged_binary) = staged_numstat
            .get(&file_path)
            .copied()
            .unwrap_or((0, 0, false));
        let (mut additions_unstaged, mut deletions_unstaged, unstaged_binary) = unstaged_numstat
            .get(&file_path)
            .copied()
            .unwrap_or((0, 0, false));

        let mut binary = staged_binary || unstaged_binary;

        if untracked {
            let abs = repo.join(&file_path);
            if let Ok(content) = std::fs::read(&abs) {
                if looks_binary(&content) {
                    binary = true;
                } else {
                    additions_unstaged = count_lines(&content);
                    deletions_unstaged = 0;
                }
            }
        }

        entries.push(StatusEntry {
            path: file_path,
            index_status,
            worktree_status,
            staged,
            unstaged,
            untracked,
            additions_staged,
            deletions_staged,
            additions_unstaged,
            deletions_unstaged,
            binary,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let repo = PathBuf::from(&path);
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(files.iter().map(|s| s.as_str()));
    run_git(&repo, &args)?;
    Ok(())
}

#[tauri::command]
pub fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let repo = PathBuf::from(&path);
    let has_head = run_git(&repo, &["rev-parse", "--verify", "HEAD"]).is_ok();
    let mut args: Vec<&str> = if has_head {
        vec!["reset", "HEAD", "--"]
    } else {
        vec!["rm", "--cached", "--"]
    };
    args.extend(files.iter().map(|s| s.as_str()));
    run_git(&repo, &args)?;
    Ok(())
}

#[tauri::command]
pub fn commit_changes(path: String, message: String) -> Result<(), String> {
    let repo = PathBuf::from(&path);
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("Commit-Nachricht darf nicht leer sein".into());
    }
    run_git(&repo, &["commit", "-m", trimmed])?;
    Ok(())
}

#[derive(Serialize)]
pub struct FileDiffResponse {
    staged: Option<String>,
    unstaged: Option<String>,
    untracked_plain: Option<String>,
    is_binary: bool,
}

#[tauri::command]
pub fn repo_file_diff(path: String, file: String, untracked: bool) -> Result<FileDiffResponse, String> {
    let repo = PathBuf::from(&path);
    if untracked {
        let abs = repo.join(&file);
        let bytes =
            std::fs::read(&abs).map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
        if looks_binary(&bytes) {
            return Ok(FileDiffResponse {
                staged: None,
                unstaged: None,
                untracked_plain: None,
                is_binary: true,
            });
        }
        return Ok(FileDiffResponse {
            staged: None,
            unstaged: None,
            untracked_plain: Some(String::from_utf8_lossy(&bytes).to_string()),
            is_binary: false,
        });
    }
    let staged = run_git(
        &repo,
        &["diff", "--cached", "--no-color", "--", &file],
    )
    .unwrap_or_default();
    let unstaged = run_git(&repo, &["diff", "--no-color", "--", &file]).unwrap_or_default();
    let staged_nonempty = (!staged.trim().is_empty()).then_some(staged);
    let unstaged_nonempty = (!unstaged.trim().is_empty()).then_some(unstaged);
    let is_binary = [staged_nonempty.as_deref(), unstaged_nonempty.as_deref()]
        .into_iter()
        .flatten()
        .any(diff_reports_binary);
    if is_binary {
        return Ok(FileDiffResponse {
            staged: None,
            unstaged: None,
            untracked_plain: None,
            is_binary: true,
        });
    }
    Ok(FileDiffResponse {
        staged: staged_nonempty,
        unstaged: unstaged_nonempty,
        untracked_plain: None,
        is_binary: false,
    })
}

#[derive(Serialize)]
pub struct CommitChangedFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
}

#[derive(Serialize)]
pub struct CommitInspectResponse {
    pub header: String,
    pub files: Vec<CommitChangedFile>,
}

fn commit_changed_files(repo: &PathBuf, commit: &str) -> Result<Vec<CommitChangedFile>, String> {
    let line = run_git(
        repo,
        &["rev-list", "--parents", "-n", "1", commit],
    )?;
    let line = line.lines().next().unwrap_or("").trim();
    let mut toks = line.split_whitespace();
    let _self_oid = toks.next();
    let parents: Vec<&str> = toks.collect();
    let numstat = if parents.is_empty() {
        run_git(
            repo,
            &[
                "diff-tree",
                "--root",
                "-r",
                "--no-commit-id",
                "--numstat",
                "-z",
                "-M",
                commit,
            ],
        )?
    } else {
        let p = parents[0];
        run_git(
            repo,
            &[
                "diff-tree",
                "-r",
                "--no-commit-id",
                "--numstat",
                "-z",
                "-M",
                p,
                commit,
            ],
        )?
    };
    let map = parse_numstat(&numstat);
    let mut files: Vec<CommitChangedFile> = map
        .into_iter()
        .map(|(path, (adds, dels, binary))| CommitChangedFile {
            path,
            additions: adds,
            deletions: dels,
            binary,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

#[tauri::command]
pub fn repo_commit_inspect(path: String, commit: String) -> Result<CommitInspectResponse, String> {
    let repo = PathBuf::from(path.trim());
    let c = commit.trim();
    if c.is_empty() {
        return Err("Commit-Referenz fehlt".into());
    }
    let header = run_git(
        &repo,
        &[
            "show",
            "--no-color",
            "--no-patch",
            "--stat=200",
            "--format=fuller",
            c,
        ],
    )?;
    let files = commit_changed_files(&repo, c)?;
    Ok(CommitInspectResponse {
        header: header.trim().to_string(),
        files,
    })
}

#[derive(Serialize)]
pub struct CommitFileDiffResponse {
    pub diff: Option<String>,
    pub is_binary: bool,
}

#[tauri::command]
pub fn repo_commit_file_diff(
    path: String,
    commit: String,
    file: String,
) -> Result<CommitFileDiffResponse, String> {
    let repo = PathBuf::from(path.trim());
    let c = commit.trim();
    let f = file.trim();
    if c.is_empty() || f.is_empty() {
        return Err("Commit oder Dateipfad fehlt".into());
    }
    let diff = run_git(
        &repo,
        &["show", "--no-color", "--format=", c, "--", f],
    )
    .unwrap_or_default();
    let trimmed = diff.trim();
    if diff_reports_binary(&diff) {
        return Ok(CommitFileDiffResponse {
            diff: None,
            is_binary: true,
        });
    }
    Ok(CommitFileDiffResponse {
        diff: (!trimmed.is_empty()).then_some(diff),
        is_binary: false,
    })
}

#[derive(Serialize)]
pub struct StashEntry {
    pub index: u32,
    pub refname: String,
    pub branch: String,
    pub subject: String,
    pub date: String,
    pub hash: String,
    pub message: String,
}

fn stash_ref(index: u32) -> String {
    format!("stash@{{{}}}", index)
}

fn stash_index_from_ref(gd: &str) -> Option<u32> {
    let s = gd.trim();
    let open = s.find('{')?;
    let close = s.rfind('}')?;
    if close <= open + 1 {
        return None;
    }
    s[open + 1..close].parse().ok()
}

fn parse_stash_gs(gs: &str) -> (String, String, String) {
    let full = gs.trim();
    if let Some(rest) = full.strip_prefix("WIP on ") {
        if let Some((branch, tail)) = rest.split_once(": ") {
            return (
                branch.trim().to_string(),
                tail.trim().to_string(),
                full.to_string(),
            );
        }
    }
    if let Some(rest) = full.strip_prefix("On ") {
        if let Some((branch, tail)) = rest.split_once(": ") {
            return (
                branch.trim().to_string(),
                tail.trim().to_string(),
                full.to_string(),
            );
        }
    }
    (
        String::new(),
        full.to_string(),
        full.to_string(),
    )
}

fn stash_changed_files(repo: &PathBuf, index: u32) -> Result<Vec<CommitChangedFile>, String> {
    let sref = stash_ref(index);
    let parent = format!("{sref}^1");
    let numstat = run_git(
        repo,
        &[
            "diff-tree",
            "-r",
            "--no-commit-id",
            "--numstat",
            "-z",
            "-M",
            &parent,
            &sref,
        ],
    )?;
    let map = parse_numstat(&numstat);
    let mut files: Vec<CommitChangedFile> = map
        .into_iter()
        .map(|(path, (adds, dels, binary))| CommitChangedFile {
            path,
            additions: adds,
            deletions: dels,
            binary,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

#[tauri::command]
pub fn list_stashes(path: String) -> Result<Vec<StashEntry>, String> {
    let repo = PathBuf::from(path.trim());
    let sep = "\x1f";
    let fmt = format!("%gd{sep}%H{sep}%cI{sep}%gs");
    let out = run_git(
        &repo,
        &["stash", "list", &format!("--format={fmt}")],
    )
    .unwrap_or_default();
    let mut entries = Vec::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(4, sep);
        let gd = parts.next().unwrap_or("").trim();
        let hash = parts.next().unwrap_or("").trim();
        let date = parts.next().unwrap_or("").trim();
        let gs = parts.next().unwrap_or("").trim();
        if gd.is_empty() || hash.is_empty() {
            continue;
        }
        let Some(idx) = stash_index_from_ref(gd) else {
            continue;
        };
        let (branch, subject, message) = parse_stash_gs(gs);
        entries.push(StashEntry {
            index: idx,
            refname: gd.to_string(),
            branch,
            subject,
            date: date.to_string(),
            hash: hash.to_string(),
            message,
        });
    }
    Ok(entries)
}

#[tauri::command]
pub fn git_stash_push(
    path: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let mut args: Vec<String> = vec!["stash".into(), "push".into()];
    if include_untracked {
        args.push("-u".into());
    }
    if keep_index {
        args.push("--keep-index".into());
    }
    if let Some(m) = message {
        let t = m.trim();
        if !t.is_empty() {
            args.push("-m".into());
            args.push(t.to_string());
        }
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git_merged_output(&repo, &refs)
}

#[tauri::command]
pub fn git_stash_pop(path: String, index: u32) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    run_git_merged_output(&repo, &["stash", "pop", "--quiet", &sref])
}

#[tauri::command]
pub fn git_stash_apply(path: String, index: u32) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    run_git_merged_output(&repo, &["stash", "apply", "--quiet", &sref])
}

#[tauri::command]
pub fn git_stash_drop(path: String, index: u32) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    run_git(&repo, &["stash", "drop", "--quiet", &sref])?;
    Ok(())
}

#[derive(Serialize)]
pub struct StashInspectResponse {
    pub header: String,
    pub files: Vec<CommitChangedFile>,
}

#[tauri::command]
pub fn git_stash_show(path: String, index: u32) -> Result<StashInspectResponse, String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    let header = run_git(
        &repo,
        &[
            "show",
            "--no-color",
            "--no-patch",
            "--stat=200",
            "--format=fuller",
            &sref,
        ],
    )?;
    let files = stash_changed_files(&repo, index)?;
    Ok(StashInspectResponse {
        header: header.trim().to_string(),
        files,
    })
}

#[tauri::command]
pub fn git_stash_file_diff(
    path: String,
    index: u32,
    file: String,
) -> Result<CommitFileDiffResponse, String> {
    let repo = PathBuf::from(path.trim());
    let f = file.trim();
    if f.is_empty() {
        return Err("Dateipfad fehlt".into());
    }
    let sref = stash_ref(index);
    let diff = run_git(
        &repo,
        &["stash", "show", "-p", "--no-color", &sref, "--", f],
    )
    .unwrap_or_default();
    let trimmed = diff.trim();
    if diff_reports_binary(&diff) {
        return Ok(CommitFileDiffResponse {
            diff: None,
            is_binary: true,
        });
    }
    Ok(CommitFileDiffResponse {
        diff: (!trimmed.is_empty()).then_some(diff),
        is_binary: false,
    })
}

#[tauri::command]
pub fn git_stash_branch(path: String, index: u32, name: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let n = name.trim();
    if n.is_empty() {
        return Err("Branch-Name darf nicht leer sein".into());
    }
    let sref = stash_ref(index);
    run_git_merged_output(&repo, &["stash", "branch", n, &sref])
}

fn list_branches(repo: &PathBuf) -> Result<Vec<Branch>, String> {
    let sep = "\x1f";
    let format = format!("%(HEAD){sep}%(refname){sep}%(objectname)");
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
            let mut parts = line.splitn(3, sep);
            let head = parts.next()?;
            let refname = parts.next()?;
            let tip = parts.next()?.trim().to_string();
            if tip.is_empty() {
                return None;
            }
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
                tip,
            })
        })
        .collect();

    Ok(branches)
}
