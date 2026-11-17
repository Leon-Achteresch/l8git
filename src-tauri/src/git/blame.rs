use super::*;
use crate::cmd::local_git_command;

#[derive(Serialize)]
pub struct BlamePrevious {
    pub commit: String,
    pub file: String,
}

#[derive(Serialize)]
pub struct BlameEntry {
    pub commit_hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub timestamp: i64,
    pub summary: String,
    pub line_no: u32,
    pub content: String,
    pub previous: Option<BlamePrevious>,
}

fn format_blame_date(ts: i64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let diff = now - ts;
    if diff < 60 {
        "gerade eben".to_string()
    } else if diff < 3600 {
        format!("vor {} Min.", diff / 60)
    } else if diff < 86400 {
        format!("vor {} Std.", diff / 3600)
    } else if diff < 86400 * 30 {
        format!("vor {} Tagen", diff / 86400)
    } else if diff < 86400 * 365 {
        format!("vor {} Mon.", diff / (86400 * 30))
    } else {
        format!("vor {} J.", diff / (86400 * 365))
    }
}

fn full_oid(oid: &str) -> bool {
    matches!(oid.len(), 40 | 64) && oid.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn previous_path(raw: &str) -> Option<String> {
    let path = if raw.starts_with('"') {
        let quoted = raw.strip_prefix('"')?.strip_suffix('"')?;
        let mut bytes = quoted.bytes();
        let mut decoded = Vec::new();
        while let Some(byte) = bytes.next() {
            decoded.push(match byte {
                b'"' => return None,
                b'\\' => match bytes.next()? {
                    b'\\' => b'\\',
                    b'"' => b'"',
                    b'a' => 7,
                    b'b' => 8,
                    b't' => b'\t',
                    b'n' => b'\n',
                    b'v' => 11,
                    b'f' => 12,
                    b'r' => b'\r',
                    first @ b'0'..=b'3' => {
                        let second = bytes.next()?;
                        let third = bytes.next()?;
                        if !(b'0'..=b'7').contains(&second) || !(b'0'..=b'7').contains(&third) {
                            return None;
                        }
                        (first - b'0') * 64 + (second - b'0') * 8 + (third - b'0')
                    }
                    _ => return None,
                },
                _ => byte,
            });
        }
        String::from_utf8(decoded).ok()?
    } else {
        raw.to_owned()
    };
    // Keep the exact Git path. Reject provenance that the file API would
    // normalize or that this platform cannot address losslessly.
    (file_reads::file_path(&path).ok()? == path).then_some(path)
}

fn parse_previous(value: &str) -> Option<BlamePrevious> {
    let (commit, file) = value.split_once(' ')?;
    if !full_oid(commit) || commit.bytes().all(|byte| byte == b'0') {
        return None;
    }
    Some(BlamePrevious {
        commit: commit.into(),
        file: previous_path(file)?,
    })
}

fn parse_blame_porcelain(output: &str) -> Vec<BlameEntry> {
    let mut entries = Vec::new();
    let mut iter = output.lines();

    while let Some(header) = iter.next() {
        let parts: Vec<&str> = header.splitn(4, ' ').collect();
        if parts.len() < 3 || !full_oid(parts[0]) {
            continue;
        }

        let commit_hash = parts[0].to_string();
        let line_no: u32 = parts[2].parse().unwrap_or(0);

        let mut author_buf: Option<String> = None;
        let mut ts_buf: Option<i64> = None;
        let mut summary_buf: Option<String> = None;
        let mut previous = None;
        let mut boundary = false;
        let content;

        loop {
            match iter.next() {
                Some(l) if l.starts_with('\t') => {
                    content = l[1..].to_string();
                    break;
                }
                Some(l) if l.starts_with("author ") && !l.starts_with("author-") => {
                    author_buf = Some(l[7..].to_string());
                }
                Some(l) if l.starts_with("author-time ") => {
                    if let Ok(ts) = l[12..].trim().parse::<i64>() {
                        ts_buf = Some(ts);
                    }
                }
                Some(l) if l.starts_with("summary ") => {
                    summary_buf = Some(l[8..].to_string());
                }
                Some(l) if l.starts_with("previous ") => {
                    previous = parse_previous(&l[9..]);
                }
                Some("boundary") => boundary = true,
                Some(_) => {}
                None => return entries,
            }
        }

        if boundary || commit_hash.bytes().all(|byte| byte == b'0') {
            previous = None;
        }

        entries.push(BlameEntry {
            short_hash: commit_hash[..8.min(commit_hash.len())].to_string(),
            commit_hash,
            author: author_buf.unwrap_or_default(),
            date: ts_buf.map(format_blame_date).unwrap_or_default(),
            timestamp: ts_buf.unwrap_or_default(),
            summary: summary_buf.unwrap_or_default(),
            line_no,
            content,
            previous,
        });
    }

    entries
}

#[tauri::command]
pub async fn repo_blame(
    path: String,
    file: String,
    commit: Option<String>,
) -> Result<Vec<BlameEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let file = file_reads::file_path(&file)?;
        let commit = commit
            .as_deref()
            .map(|revision| -> Result<String, String> {
                if revision.chars().any(char::is_control) {
                    return Err("Invalid commit revision".into());
                }
                let resolved = resolve_git_commit_with(local_git_command(), &repo, revision)?;
                if full_oid(revision) && !resolved.eq_ignore_ascii_case(revision) {
                    return Err("Commit object is unavailable locally".into());
                }
                Ok(resolved)
            })
            .transpose()?;
        let mut args = vec![
            "-c",
            "core.quotePath=true",
            "--literal-pathspecs",
            "blame",
            "--line-porcelain",
            "--no-textconv",
        ];
        if let Some(ref c) = commit {
            args.push(c.as_str());
        }
        if commit.is_none() {
            args.push("--contents=-");
        }
        args.push("--");
        args.push(file.as_str());
        let output = if commit.is_some() {
            run_git_command(local_git_command(), &repo, &args)?
        } else {
            use std::io::Read;
            let absolute = WorktreePathGuard::new(&repo)?.path(&file)?;
            let metadata = std::fs::symlink_metadata(absolute).map_err(|e| e.to_string())?;
            let contents = if metadata.file_type().is_symlink() {
                file_reads::worktree_link_text(&repo, &file)?
            } else {
                let mut input = open_worktree_file(&repo, &file)?;
                let mut contents = Vec::new();
                input
                    .read_to_end(&mut contents)
                    .map_err(|e| e.to_string())?;
                contents
            };
            file_reads::git_with_input(&repo, &args, contents)?
        };
        let mut entries = parse_blame_porcelain(&output);
        if commit.is_none() {
            for entry in &mut entries {
                if entry.commit_hash.bytes().all(|byte| byte == b'0') {
                    // Feeding the guarded contents through stdin changes Git's
                    // label; retain the usual live-worktree blame presentation.
                    entry.author = "Not Committed Yet".into();
                    entry.summary = format!("Version of {file} from {file}");
                }
            }
        }
        Ok(entries)
    })
    .await
}

#[tauri::command]
pub async fn repo_list_files(path: String) -> Result<Vec<String>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let out = run_git(&repo, &["ls-files", "-z"])?;
        Ok(out.split_terminator('\0').map(str::to_string).collect())
    })
    .await
}
