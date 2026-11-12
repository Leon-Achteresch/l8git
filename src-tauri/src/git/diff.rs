use super::*;

#[derive(Serialize)]
pub struct FileDiffResponse {
    staged: Option<String>,
    unstaged: Option<String>,
    untracked_plain: Option<String>,
    is_binary: bool,
    fingerprint: Option<String>,
}

#[tauri::command]
pub async fn repo_staged_diff(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git(&repo, &["diff", "--cached", "--no-color"])
    })
    .await
}

#[tauri::command]
pub async fn repo_file_diff(
    path: String,
    file: String,
    untracked: bool,
    include_fingerprint: Option<bool>,
) -> Result<FileDiffResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let before = if include_fingerprint.unwrap_or(false) {
            Some(file_snapshot::fingerprint(&repo, &file)?)
        } else {
            None
        };
        let mut response = file_diff_impl(&repo, &file, untracked)?;
        if let Some(before) = before {
            if file_snapshot::fingerprint(&repo, &file)? != before {
                return Err(format!("__FILE_CHANGED__|{file}"));
            }
            response.fingerprint = Some(before);
        }
        Ok(response)
    })
    .await
}

fn file_diff_impl(repo: &PathBuf, file: &str, untracked: bool) -> Result<FileDiffResponse, String> {
    let abs = WorktreePathGuard::new(repo)?.path(file)?;
    if untracked {
        let metadata = std::fs::symlink_metadata(&abs)
            .map_err(|e| coded!(FileReadFailed, error = e))?;
        if metadata.is_dir() {
            return Ok(FileDiffResponse {
                staged: None,
                unstaged: None,
                untracked_plain: None,
                is_binary: true,
                fingerprint: None,
            });
        }
        let bytes = if metadata.file_type().is_symlink() {
            file_reads::worktree_link_text(repo, file)?
        } else if metadata.is_file() {
            use std::io::Read;
            let mut input = open_worktree_file(repo, file)?;
            let mut header = [0u8; 8000];
            let length = input.read(&mut header).map_err(|e| e.to_string())?;
            if looks_binary(&header[..length]) {
                return Ok(FileDiffResponse {
                    staged: None,
                    unstaged: None,
                    untracked_plain: None,
                    is_binary: true,
                    fingerprint: None,
                });
            }
            let mut bytes = header[..length].to_vec();
            input.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            bytes
        } else {
            return Err(format!("Cannot preview special file: {file}"));
        };
        if looks_binary(&bytes) {
            return Ok(FileDiffResponse {
                staged: None,
                unstaged: None,
                untracked_plain: None,
                is_binary: true,
                fingerprint: None,
            });
        }
        return Ok(FileDiffResponse {
            staged: None,
            unstaged: None,
            untracked_plain: Some(String::from_utf8_lossy(&bytes).to_string()),
            is_binary: false,
            fingerprint: None,
        });
    }
    let staged = run_git(
        repo,
        &[
            "--literal-pathspecs",
            "diff",
            "--cached",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            file,
        ],
    )?;
    let unstaged = run_git(
        repo,
        &[
            "--literal-pathspecs",
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            file,
        ],
    )?;
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
            fingerprint: None,
        });
    }
    Ok(FileDiffResponse {
        staged: staged_nonempty,
        unstaged: unstaged_nonempty,
        untracked_plain: None,
        is_binary: false,
        fingerprint: None,
    })
}

#[tauri::command]
pub async fn repo_read_file(path: String, file: String) -> Result<String, String> {
    spawn_git(move || {
        use std::io::Read;
        let mut input = open_worktree_file(&PathBuf::from(&path), &file)?;
        let mut content = String::new();
        input
            .read_to_string(&mut content)
            .map_err(|e| coded!(FileReadFailed, error = e))?;
        Ok(content)
    })
    .await
}

#[tauri::command]
pub async fn repo_write_file(path: String, file: String, content: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let abs = WorktreePathGuard::new(&repo)?.regular_file(&file)?;
        std::fs::write(&abs, content)
            .map_err(|e| coded!(FileWriteFailed, error = e))
    })
    .await
}

#[tauri::command]
pub async fn repo_file_content_at(
    path: String,
    file: String,
    treeish: String,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let revision = (!treeish.is_empty()).then_some(treeish.as_str());
        match git_file_blob_oid(&repo, revision, &file)? {
            Some(oid) => run_git(&repo, &["cat-file", "-p", &oid]),
            None => Ok(String::new()),
        }
    })
    .await
}

#[derive(Serialize)]
pub struct CommitChangedFile {
    pub untracked: bool,
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
    let line = run_git(repo, &["rev-list", "--parents", "-n", "1", commit])?;
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
            untracked: false,
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
pub async fn repo_commit_inspect(
    path: String,
    commit: String,
) -> Result<CommitInspectResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let c = commit.trim();
        if c.is_empty() {
            return Err(required(Label::CommitRef));
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
    })
    .await
}

#[derive(Serialize)]
pub struct CommitFileDiffResponse {
    pub diff: Option<String>,
    pub is_binary: bool,
}

#[tauri::command]
pub async fn repo_commit_file_diff(
    path: String,
    commit: String,
    file: String,
) -> Result<CommitFileDiffResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let c = file_reads::commit_revision(&repo, &commit)?;
        let f = file_reads::file_path(&file)?;

        // Determine the first parent of this commit so we can use the reliable
        // plumbing command `git diff-tree -p` instead of `git show --format=`.
        // On Windows, the empty --format= argument can behave inconsistently
        // across git versions, producing no output even for valid diffs.
        let parents_line = run_git(&repo, &["rev-list", "--parents", "-n", "1", &c])?;
        let mut parent_tokens = parents_line.split_whitespace();
        let _self_hash = parent_tokens.next();
        let first_parent = parent_tokens.next();

        let diff = if let Some(parent) = first_parent {
            // Regular commit: diff against its first parent.
            run_git(
                &repo,
                &[
                    "--literal-pathspecs",
                    "diff-tree",
                    "-p",
                    "--no-commit-id",
                    "--no-color",
                    "--no-ext-diff",
                    "--no-textconv",
                    parent,
                    &c,
                    "--",
                    &f,
                ],
            )?
        } else {
            // Initial commit (no parent): compare against the empty tree.
            run_git(
                &repo,
                &[
                    "--literal-pathspecs",
                    "diff-tree",
                    "-p",
                    "--root",
                    "--no-commit-id",
                    "--no-color",
                    "--no-ext-diff",
                    "--no-textconv",
                    &c,
                    "--",
                    &f,
                ],
            )?
        };

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
    })
    .await
}

#[derive(Serialize)]
pub struct RangeCommitsResponse {
    pub commits: Vec<Commit>,
    pub files: Vec<CommitChangedFile>,
    pub total_commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub truncated: bool,
}

const RANGE_MAX_COMMITS: usize = 400;
const RANGE_MAX_FILES: usize = 500;

fn range_commits(repo: &PathBuf, spec: &str, limit: usize) -> Result<Vec<Commit>, String> {
    let format = "--format=%H%x00%h%x00%an%x00%ae%x00%cI%x00%P%x00%s%x00%b";
    let max_count = format!("--max-count={limit}");
    let out = run_git(repo, &["log", "-z", &max_count, format, spec])?;
    let fields: Vec<&str> = out.split_terminator('\0').collect();
    Ok(fields
        .chunks_exact(8)
        .map(|parts| {
            let parents = parts[5].split_whitespace().map(|s| s.to_string()).collect();
            Commit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                email: parts[3].to_string(),
                date: parts[4].to_string(),
                subject: parts[6].to_string(),
                body: parts[7].to_string(),
                parents,
                tags: Vec::new(),
                author_avatar: None,
            }
        })
        .collect())
}

fn range_log_numstat(
    repo: &PathBuf,
    spec: &str,
    limit: usize,
) -> Result<Vec<CommitChangedFile>, String> {
    let max_count = format!("--max-count={limit}");
    let out = run_git(
        repo,
        &[
            "log",
            "--no-renames",
            "--numstat",
            "-z",
            "--format=",
            &max_count,
            spec,
        ],
    )?;
    Ok(parse_numstat(&out)
        .into_iter()
        .map(|(path, (additions, deletions, binary))| CommitChangedFile {
            untracked: false,
            path,
            additions,
            deletions,
            binary,
        })
        .collect())
}

fn range_diff_numstat(
    repo: &PathBuf,
    base: &str,
    head: &str,
) -> Result<Vec<CommitChangedFile>, String> {
    let out = run_git(
        repo,
        &[
            "diff",
            "--numstat",
            "-z",
            "--no-renames",
            &format!("{base}...{head}"),
        ],
    )?;
    Ok(parse_numstat(&out)
        .into_iter()
        .map(|(path, (additions, deletions, binary))| CommitChangedFile {
            untracked: false,
            path,
            additions,
            deletions,
            binary,
        })
        .collect())
}

#[tauri::command]
pub async fn repo_range_commits(
    path: String,
    base: Option<String>,
    head: String,
    limit: Option<u32>,
) -> Result<RangeCommitsResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let head = head.trim().to_string();
        if head.is_empty() {
            return Err(required(Label::HeadRef));
        }
        let head = resolve_git_commit(&repo, &head)?;
        let base = base
            .map(|b| b.trim().to_string())
            .filter(|b| !b.is_empty())
            .map(|b| resolve_git_commit(&repo, &b))
            .transpose()?;
        let limit = (limit.unwrap_or(60) as usize).clamp(1, RANGE_MAX_COMMITS);
        let spec = match base.as_deref() {
            Some(b) => format!("{b}..{head}"),
            None => head.clone(),
        };

        let total_commits = run_git(&repo, &["rev-list", "--count", &spec])?
            .trim()
            .parse::<u32>()
            .map_err(|error| format!("Invalid Git commit count: {error}"))?;
        let commits = range_commits(&repo, &spec, limit)?;

        let mut files = match base.as_deref() {
            Some(b) => range_diff_numstat(&repo, b, &head)?,
            None => range_log_numstat(&repo, &spec, limit)?,
        };
        files.sort_by(|a, b| {
            (b.additions.saturating_add(b.deletions))
                .cmp(&(a.additions.saturating_add(a.deletions)))
                .then_with(|| a.path.cmp(&b.path))
        });
        let files_truncated = files.len() > RANGE_MAX_FILES;
        files.truncate(RANGE_MAX_FILES);

        let additions = files
            .iter()
            .fold(0u32, |sum, file| sum.saturating_add(file.additions));
        let deletions = files
            .iter()
            .fold(0u32, |sum, file| sum.saturating_add(file.deletions));
        Ok(RangeCommitsResponse {
            truncated: files_truncated || total_commits as usize > commits.len(),
            commits,
            files,
            total_commits,
            additions,
            deletions,
        })
    })
    .await
}
