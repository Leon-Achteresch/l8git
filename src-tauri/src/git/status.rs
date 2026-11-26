use super::*;

#[derive(Serialize)]
pub struct StatusEntry {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    previous_path: Option<String>,
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

#[derive(Default)]
pub(super) struct NumStat {
    pub(super) additions: u32,
    pub(super) deletions: u32,
    pub(super) binary: bool,
    pub(super) previous_path: Option<String>,
}

pub(super) fn parse_numstat(out: &str) -> HashMap<String, NumStat> {
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
        let (path, previous) = if path_part.is_empty() {
            let previous = iter.next();
            (iter.next().unwrap_or(""), previous)
        } else {
            (path_part, None)
        };
        if !path.is_empty() {
            let entry: &mut NumStat = map.entry(path.to_owned()).or_default();
            entry.additions = entry.additions.saturating_add(adds);
            entry.deletions = entry.deletions.saturating_add(dels);
            entry.binary |= binary;
            if let Some(previous) = previous {
                entry.previous_path = Some(previous.to_owned());
            }
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
    use std::fs::OpenOptions;
    use std::io::Read;

    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut file = options.open(path).ok()?;
    if !file.metadata().ok()?.is_file() {
        return None;
    }
    let mut head = [0u8; 8192];
    let n = file.read(&mut head).ok()?;
    let head = &head[..n];

    if head.contains(&0) {
        return Some((true, 0));
    }

    // Full line count without a second read: start with what we have,
    // then stream the rest counting newlines only.
    let mut newlines = memchr::memchr_iter(b'\n', head).count() as u32;
    let mut last_byte = head.last().copied();
    let mut buf = [0u8; 16 * 1024];
    loop {
        let r = match file.read(&mut buf) {
            Ok(0) => break,
            Ok(r) => r,
            Err(_) => {
                return Some((
                    false,
                    newlines.saturating_add(u32::from(last_byte != Some(b'\n'))),
                ))
            }
        };
        newlines = newlines.saturating_add(memchr::memchr_iter(b'\n', &buf[..r]).count() as u32);
        last_byte = Some(buf[r - 1]);
    }

    let lines = if last_byte.is_none() {
        0
    } else if last_byte == Some(b'\n') {
        newlines
    } else {
        newlines.saturating_add(1)
    };
    Some((false, lines))
}

// Git refs cannot contain "..", spaces or "[". These delimiters belong to
// porcelain v1's branch header, even if a filename contains the same text.
fn tracking_from_header(header: &str) -> Option<(bool, UpstreamSyncCounts)> {
    let branch = header.strip_prefix("## ")?;
    let Some((local, tracking)) = branch.split_once("...") else {
        return Some((false, UpstreamSyncCounts::default()));
    };
    let Some((_, status)) = tracking.split_once(" [") else {
        return Some((true, UpstreamSyncCounts::default()));
    };
    let status = status.strip_suffix(']')?;
    if status == "gone" {
        // On an unborn branch Git also prints "[gone]" for a live upstream
        // because HEAD has no commit to compare. Resolve the ref separately.
        if local.contains(' ') {
            return None;
        }
        return Some((false, UpstreamSyncCounts::default()));
    }
    let mut counts = UpstreamSyncCounts::default();
    for field in status.split(", ") {
        let (direction, count) = field.split_once(' ')?;
        match direction {
            "ahead" => counts.ahead = count.parse().ok()?,
            "behind" => counts.behind = count.parse().ok()?,
            _ => return None,
        }
    }
    Some((true, counts))
}

const STATUS_PATH_ARGS: &[&str] = &[
    "--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all",
];

#[derive(Serialize)]
pub struct StatusPathEntry {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    previous_path: Option<String>,
    index_status: String,
    worktree_status: String,
    untracked: bool,
}

fn status_paths<'a>(mut records: impl Iterator<Item = &'a str>) -> impl Iterator<Item = StatusPathEntry> {
    std::iter::from_fn(move || loop {
        let raw = records.next()?;
        let Some(path) = raw.get(3..) else { continue };
        let xy = raw.as_bytes();
        if xy[2] != b' ' || xy[0] == b'#' || path.is_empty() { continue; }
        let previous_path = if matches!(xy[0], b'R' | b'C') || matches!(xy[1], b'R' | b'C') {
            records.next().map(str::to_owned)
        } else {
            None
        };
        return Some(StatusPathEntry {
            path: path.to_owned(),
            previous_path,
            index_status: char::from(xy[0]).to_string(),
            worktree_status: char::from(xy[1]).to_string(),
            untracked: xy[..2] == *b"??",
        });
    })
}

fn collect_worktree_status(repo: &PathBuf, include_upstream: bool) -> Result<FullStatus, String> {
    let mut args = STATUS_PATH_ARGS.to_vec();
    if include_upstream {
        args.extend(["--branch", "--ahead-behind"]);
    }
    let numstat = |args: &[&str]| {
        run_git(repo, args)
            .map(|s| parse_numstat(&s))
            .unwrap_or_default()
    };
    let (out, staged_numstat, unstaged_numstat) = std::thread::scope(|scope| {
        let staged = scope.spawn(|| numstat(&["diff", "--cached", "--numstat", "-z"]));
        let unstaged = scope.spawn(|| numstat(&["diff", "--numstat", "-z"]));
        let status = run_git(repo, &args)?;
        Ok::<_, String>((
            status,
            staged.join().map_err(|_| "staged diff thread panicked")?,
            unstaged
                .join()
                .map_err(|_| "unstaged diff thread panicked")?,
        ))
    })?;

    let mut entries = Vec::new();
    let mut iter = out.split_terminator('\0').peekable();
    let (has_upstream, upstream_sync) = if include_upstream {
        iter.next_if(|record| record.starts_with("## "))
            .and_then(tracking_from_header)
            .unwrap_or_else(|| (compute_has_upstream(repo), compute_upstream_sync(repo)))
    } else {
        (false, UpstreamSyncCounts::default())
    };
    for StatusPathEntry { path: file_path, previous_path, index_status, worktree_status, untracked } in status_paths(iter) {
        let staged = !untracked && index_status != " " && index_status != "?";
        let unstaged = !untracked && worktree_status != " " && worktree_status != "?";

        let (additions_staged, deletions_staged, staged_binary) = staged_numstat
            .get(&file_path)
            .map(|stat| (stat.additions, stat.deletions, stat.binary))
            .unwrap_or((0, 0, false));
        let (mut additions_unstaged, mut deletions_unstaged, unstaged_binary) = unstaged_numstat
            .get(&file_path)
            .map(|stat| (stat.additions, stat.deletions, stat.binary))
            .unwrap_or((0, 0, false));

        let mut binary = staged_binary || unstaged_binary;
        let mut embedded_repo = false;

        if untracked {
            let abs = repo.join(file_path.trim_end_matches('/'));
            let kind = std::fs::symlink_metadata(&abs)
                .ok()
                .map(|meta| meta.file_type());
            if kind.is_some_and(|kind| kind.is_symlink()) {
                // Git stores the link text itself. Its target can be huge or a device.
                if let Ok(target) = std::fs::read_link(&abs) {
                    let text = target.as_os_str().as_encoded_bytes();
                    additions_unstaged = memchr::memchr_iter(b'\n', text).count() as u32
                        + u32::from(!text.is_empty() && !text.ends_with(b"\n"));
                }
            } else if kind.is_some_and(|kind| kind.is_dir()) {
                embedded_repo = abs.join(".git").exists();
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
            previous_path,
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

    Ok(FullStatus {
        entries,
        has_upstream,
        upstream_sync,
    })
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

/// Path and rename metadata for repository browsers that do not display line counts.
#[tauri::command]
pub async fn repo_status_paths(path: String) -> Result<Vec<StatusPathEntry>, String> {
    spawn_git(move || {
        let out = run_git(&PathBuf::from(path), STATUS_PATH_ARGS)?;
        Ok(status_paths(out.split_terminator('\0')).collect())
    })
    .await
}

#[tauri::command]
pub async fn repo_status(path: String) -> Result<Vec<StatusEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        collect_worktree_status(&repo, false).map(|status| status.entries)
    })
    .await
}

/// Branch tracking and file states come from the same Git status snapshot.
#[tauri::command]
pub async fn repo_full_status(path: String) -> Result<FullStatus, String> {
    spawn_git(move || collect_worktree_status(&PathBuf::from(path), true)).await
}
