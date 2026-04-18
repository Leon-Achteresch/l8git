use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

#[derive(Serialize)]
pub struct Commit {
    hash: String,
    short_hash: String,
    author: String,
    email: String,
    date: String,
    subject: String,
    parents: Vec<String>,
    tags: Vec<String>,
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

fn run_git_merged_output_at(cwd: Option<&PathBuf>, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
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

fn run_git_merged_output(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
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
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s");

    let log = run_git(
        &repo,
        &[
            "log",
            "--max-count=200",
            "--all",
            "--date-order",
            &format!("--pretty=format:{format}"),
        ],
    )?;

    let commits = log
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(7, sep);
            let hash = parts.next()?.to_string();
            let short_hash = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let email = parts.next()?.to_string();
            let date = parts.next()?.to_string();
            let parents_str = parts.next()?;
            let subject = parts.next()?.to_string();
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
                parents,
                tags,
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
pub fn git_push(path: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    run_git_merged_output(&repo, &["push"])
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
pub fn git_merge(path: String, branch: String, no_ff: bool) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let b = branch.trim();
    if b.is_empty() {
        return Err("Branch-Name darf nicht leer sein".into());
    }
    if no_ff {
        run_git_merged_output(&repo, &["merge", "--no-ff", b])
    } else {
        run_git_merged_output(&repo, &["merge", b])
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
    fn git_reports_binary_diff(diff: &str) -> bool {
        diff.lines().any(|line| {
            line.starts_with("Binary files ") && line.ends_with(" differ")
        })
    }
    let is_binary = [staged_nonempty.as_deref(), unstaged_nonempty.as_deref()]
        .into_iter()
        .flatten()
        .any(git_reports_binary_diff);
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
