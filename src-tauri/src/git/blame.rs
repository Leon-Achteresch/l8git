use super::*;

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

fn parse_blame_porcelain(output: &str) -> Vec<BlameEntry> {
    let mut entries = Vec::new();
    let mut commit_cache: HashMap<String, (String, String, i64, String)> = HashMap::new();
    let mut iter = output.lines().peekable();

    while let Some(header) = iter.next() {
        let parts: Vec<&str> = header.splitn(4, ' ').collect();
        if parts.len() < 3
            || !matches!(parts[0].len(), 40 | 64)
            || !parts[0].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            continue;
        }

        let commit_hash = parts[0].to_string();
        let line_no: u32 = parts[2].parse().unwrap_or(0);

        let mut author_buf: Option<String> = None;
        let mut ts_buf: Option<i64> = None;
        let mut summary_buf: Option<String> = None;
        let mut content = String::new();

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
                Some(_) => {}
                None => break,
            }
        }

        let (author, date, timestamp, summary) =
            if let (Some(a), Some(ts), Some(s)) = (author_buf, ts_buf, summary_buf) {
                let d = format_blame_date(ts);
                commit_cache.insert(commit_hash.clone(), (a.clone(), d.clone(), ts, s.clone()));
                (a, d, ts, s)
            } else {
                commit_cache.get(&commit_hash).cloned().unwrap_or_default()
            };

        entries.push(BlameEntry {
            short_hash: commit_hash[..8.min(commit_hash.len())].to_string(),
            commit_hash,
            author,
            date,
            timestamp,
            summary,
            line_no,
            content,
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
            .map(|revision| file_reads::commit_revision(&repo, revision))
            .transpose()?;
        let mut args = vec![
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
            run_git(&repo, &args)?
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
