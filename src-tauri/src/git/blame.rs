use super::*;
use crate::cmd::local_git_command;

#[derive(Clone, Serialize)]
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
    let diff = now.saturating_sub(ts);
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

#[derive(Default)]
struct BlameMetadata<'a> {
    author: &'a str,
    summary: &'a str,
    timestamp: i64,
    date: String,
    boundary: bool,
    previous: Option<BlamePrevious>,
}

fn parse_blame_porcelain(output: &str) -> Vec<BlameEntry> {
    let mut entries = Vec::new();
    let mut commits = HashMap::<&str, BlameMetadata>::new();
    let mut lines = output.lines();
    while let Some(header) = lines.next() {
        let mut fields = header.split_ascii_whitespace();
        let (Some(commit), Some(_original_line), Some(final_line)) = (fields.next(), fields.next(), fields.next()) else {
            continue;
        };
        if !full_oid(commit) {
            continue;
        }
        let meta = commits.entry(commit).or_default();
        let mut previous = None;
        for line in lines.by_ref() {
            if let Some(content) = line.strip_prefix('\t') {
                entries.push(BlameEntry {
                    short_hash: commit[..8].into(),
                    commit_hash: commit.into(),
                    author: meta.author.into(),
                    date: meta.date.clone(),
                    timestamp: meta.timestamp,
                    summary: meta.summary.into(),
                    line_no: final_line.parse().unwrap_or(0),
                    content: content.into(),
                    previous: meta.previous.clone(),
                });
                break;
            }
            if let Some(author) = line.strip_prefix("author ") {
                meta.author = author;
            } else if let Some(raw) = line.strip_prefix("author-time ") {
                if let Ok(timestamp) = raw.trim().parse() {
                    meta.timestamp = timestamp;
                    meta.date = format_blame_date(timestamp);
                }
            } else if let Some(summary) = line.strip_prefix("summary ") {
                meta.summary = summary;
            } else if line == "boundary" {
                meta.boundary = true;
            } else if let Some(value) = line.strip_prefix("previous ") {
                previous = parse_previous(value);
            } else if line.starts_with("filename ") {
                // Git repeats this block when a commit contributes from more than one path.
                // A new filename with no preceding 'previous' clears the old path's provenance.
                meta.previous = if meta.boundary || commit.bytes().all(|byte| byte == b'0') { None } else { previous.take() };
            }
        }
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
            "--porcelain",
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_blame_keeps_commit_details_and_switches_predecessors_per_origin() {
        let a = "a".repeat(40);
        let b = "b".repeat(40);
        let stream = [
            format!("{a} 1 1 2\nauthor Ada\nauthor-time 1000\nsummary First\nprevious {b} old name\nfilename one\n\tfirst"),
            format!("{a} 2 2\n\tsecond"),
            format!("{b} 1 3 1\nauthor Bert\nauthor-time 2000\nsummary Root\nboundary\nfilename other\n\tthird"),
            format!("{a} 1 4 2\nfilename two\n\tfourth"),
            format!("{a} 2 5\n\tfifth"),
            format!("{b} 3 6 1\n\tsixth"),
            format!("{a} 3 7 1\nprevious {b} old name\nfilename one\n\tseventh"),
        ].join("\n");
        let entries = parse_blame_porcelain(&stream);
        let origins: Vec<_> = entries.iter().map(|entry| entry.previous.as_ref().map(|p| p.file.as_str())).collect();
        assert_eq!(origins, [Some("old name"), Some("old name"), None, None, None, None, Some("old name")]);
        assert_eq!(entries[4].author, "Ada");
        assert_eq!(entries[4].summary, "First");
        assert_eq!(entries[4].timestamp, 1000);
        assert_eq!(entries[4].line_no, 5);
        assert_eq!(entries[4].content, "fifth");
        assert_eq!(entries[5].author, "Bert");
        assert_eq!(entries[5].date, entries[2].date);
    }
}
