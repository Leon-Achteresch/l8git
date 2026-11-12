use super::*;

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
    embedded_repo: bool,
}

pub(super) fn diff_reports_binary(diff: &str) -> bool {
    diff.lines()
        .any(|line| line.starts_with("Binary files ") && line.ends_with(" differ"))
}

pub(super) fn parse_numstat(out: &str) -> HashMap<String, (u32, u32, bool)> {
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
            let entry = map.entry(path).or_insert((0u32, 0u32, false));
            entry.0 = entry.0.saturating_add(adds);
            entry.1 = entry.1.saturating_add(dels);
            entry.2 |= binary;
        }
    }
    map
}

pub(super) fn looks_binary(content: &[u8]) -> bool {
    content.iter().take(8000).any(|&b| b == 0)
}

/// Sniff up to 8 KB of a file to decide whether it is binary and count
/// newlines for text files, without slurping the entire file into memory.
/// Returns `(is_binary, line_count_if_text)`.
fn sniff_untracked(path: &std::path::Path) -> Option<(bool, u32)> {
    use std::fs::File;
    use std::io::Read;

    let mut file = File::open(path).ok()?;
    let mut head = [0u8; 8192];
    let n = file.read(&mut head).ok()?;
    let head = &head[..n];

    if head.contains(&0) {
        return Some((true, 0));
    }

    // Full line count without a second read: start with what we have,
    // then stream the rest counting newlines only.
    let mut newlines = head.iter().filter(|&&b| b == b'\n').count() as u32;
    let mut last_byte = head.last().copied();
    let mut buf = [0u8; 16 * 1024];
    loop {
        let r = match file.read(&mut buf) {
            Ok(0) => break,
            Ok(r) => r,
            Err(_) => {
                return Some((
                    false,
                    newlines + if last_byte == Some(b'\n') { 0 } else { 1 },
                ))
            }
        };
        newlines += buf[..r].iter().filter(|&&b| b == b'\n').count() as u32;
        last_byte = Some(buf[r - 1]);
    }

    let lines = if last_byte.is_none() {
        0
    } else if last_byte == Some(b'\n') {
        newlines
    } else {
        newlines + 1
    };
    Some((false, lines))
}

fn compute_status_entries(repo: &Path) -> Result<Vec<StatusEntry>, String> {
    // Run the three git invocations in parallel on worker threads so their
    // wait-times overlap. On Windows and weak CPUs this is ~2-3x faster than
    // sequential spawning.
    let repo_a = repo.to_path_buf();
    let repo_b = repo.to_path_buf();
    let repo_c = repo.to_path_buf();
    let status_handle = std::thread::spawn(move || {
        run_git(
            &repo_a,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )
    });
    let staged_handle = std::thread::spawn(move || {
        run_git(&repo_b, &["diff", "--cached", "--numstat", "-z"])
            .map(|s| parse_numstat(&s))
            .unwrap_or_default()
    });
    let unstaged_handle = std::thread::spawn(move || {
        run_git(&repo_c, &["diff", "--numstat", "-z"])
            .map(|s| parse_numstat(&s))
            .unwrap_or_default()
    });

    let out = status_handle
        .join()
        .map_err(|_| "status thread panicked".to_string())??;
    let staged_numstat = staged_handle
        .join()
        .map_err(|_| "staged diff thread panicked".to_string())?;
    let unstaged_numstat = unstaged_handle
        .join()
        .map_err(|_| "unstaged diff thread panicked".to_string())?;

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
        let file_path = raw[3..].trim_end_matches('\r').to_string();

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
        let mut embedded_repo = false;

        if untracked {
            let abs = repo.join(file_path.trim_end_matches('/'));
            // Nested git repo not tracked as submodule — show it distinctly.
            if abs.is_dir() && (abs.join(".git").exists()) {
                embedded_repo = true;
            } else if let Some((is_binary, lines)) = sniff_untracked(&abs) {
                if is_binary {
                    binary = true;
                } else {
                    additions_unstaged = lines;
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
            embedded_repo,
        });
    }

    Ok(entries)
}

pub(super) fn compute_upstream_sync(repo: &PathBuf) -> UpstreamSyncCounts {
    let Ok(out) = run_git(
        repo,
        &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
    ) else {
        return UpstreamSyncCounts {
            ahead: 0,
            behind: 0,
        };
    };
    let mut parts = out.split_whitespace();
    let behind = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let ahead = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    UpstreamSyncCounts { ahead, behind }
}

pub(super) fn compute_has_upstream(repo: &PathBuf) -> bool {
    git_command()
        .arg("-C")
        .arg(repo)
        .args([
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn repo_status(path: String) -> Result<Vec<StatusEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        compute_status_entries(&repo)
    })
    .await
}

/// Combined command: performs all status-adjacent lookups in a single IPC
/// round-trip, with the underlying git invocations fanned out on worker
/// threads. Replaces three separate invoke() calls from the frontend.
#[tauri::command]
pub async fn repo_full_status(path: String) -> Result<FullStatus, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let repo_for_sync = repo.clone();
        let repo_for_has = repo.clone();

        let sync_handle = std::thread::spawn(move || compute_upstream_sync(&repo_for_sync));
        let has_handle = std::thread::spawn(move || compute_has_upstream(&repo_for_has));

        let entries = compute_status_entries(&repo)?;
        let upstream_sync = sync_handle
            .join()
            .map_err(|_| "upstream sync thread panicked".to_string())?;
        let has_upstream = has_handle
            .join()
            .map_err(|_| "has upstream thread panicked".to_string())?;

        Ok(FullStatus {
            entries,
            upstream_sync,
            has_upstream,
        })
    })
    .await
}
