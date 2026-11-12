use super::*;

// Default page size for the initial open_repo fetch. Small enough to be
// cheap on weak PCs, large enough to render a useful graph. Additional
// pages arrive via `repo_log_page`.
const DEFAULT_INITIAL_COMMITS: usize = 80;

fn fetch_commits(
    repo: &PathBuf,
    skip: usize,
    limit: usize,
    tag_map: &HashMap<String, Vec<String>>,
    hide_t3_checkpoints: bool,
) -> Result<Vec<Commit>, String> {
    if run_git(repo, &["rev-parse", "-q", "--verify", "HEAD"]).is_err() {
        return Ok(vec![]);
    }
    let mut commits = fetch_commits_raw(repo, skip, limit, hide_t3_checkpoints)?;
    apply_tags(&mut commits, tag_map);
    Ok(commits)
}

/// Writes tag names onto the commits they point at.
pub(super) fn apply_tags(commits: &mut [Commit], tag_map: &HashMap<String, Vec<String>>) {
    if tag_map.is_empty() {
        return;
    }
    for commit in commits.iter_mut() {
        if let Some(names) = tag_map.get(&commit.hash) {
            commit.tags = names.clone();
        }
    }
}

/// The log read on its own: no tag decoration, and no `rev-parse` guard for an
/// empty repository. Callers that already know HEAD resolves save a process
/// spawn, and callers that want tags can fetch them concurrently and decorate
/// afterwards.
fn fetch_commits_raw(
    repo: &PathBuf,
    skip: usize,
    limit: usize,
    hide_t3_checkpoints: bool,
) -> Result<Vec<Commit>, String> {
    let sep = "\x1f";
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b");
    let max_count = format!("--max-count={limit}");
    let mut args: Vec<String> = vec!["log".into(), "-z".into(), max_count];
    if hide_t3_checkpoints {
        args.push("--exclude=refs/t3/*".into());
    }
    args.push("--all".into());
    args.push("--date-order".into());
    args.push(format!("--pretty=format:{format}"));
    if skip > 0 {
        args.insert(3, format!("--skip={skip}"));
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let log = run_git(repo, &arg_refs)?;

    Ok(parse_commit_log(&log))
}

pub(super) fn parse_commit_log(log: &str) -> Vec<Commit> {
    let sep = "\x1f";
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
            Some(Commit {
                hash,
                short_hash,
                author,
                email,
                date,
                subject,
                body,
                parents,
                tags: Vec::new(),
                author_avatar: None,
            })
        })
        .collect();

    commits
}

#[tauri::command]
pub async fn open_repo(
    path: String,
    hide_t3_checkpoints: Option<bool>,
) -> Result<RepoInfo, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let hide_t3 = hide_t3_checkpoints.unwrap_or(true);

        // One rev-parse answers both "is this a repository" and "what is HEAD".
        // A repository without commits makes the HEAD half fail, so that case
        // falls back to the plain repository check and reports no commits.
        let (branch, head_exists) = match run_git(
            &repo,
            &["rev-parse", "--is-inside-work-tree", "--abbrev-ref", "HEAD"],
        ) {
            Ok(out) => {
                let branch = out
                    .lines()
                    .nth(1)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("HEAD")
                    .to_string();
                (branch, true)
            }
            Err(_) => {
                run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
                    .map_err(|_| format!("'{path}' is not a git repository"))?;
                ("HEAD".to_string(), false)
            }
        };

        // Log, tags and branches are independent reads. Running them together
        // costs one round of process spawns instead of three — process
        // creation, not git itself, dominates opening a repository.
        let repo_tags = repo.clone();
        let repo_branches = repo.clone();
        let tags_handle = std::thread::spawn(move || tag_refs(&repo_tags));
        let branches_handle =
            std::thread::spawn(move || list_branches(&repo_branches).unwrap_or_default());

        let commits = if head_exists {
            fetch_commits_raw(&repo, 0, DEFAULT_INITIAL_COMMITS, hide_t3)
        } else {
            Ok(Vec::new())
        };

        let tags = tags_handle
            .join()
            .map_err(|_| "tag thread panicked".to_string())?;
        let branches = branches_handle
            .join()
            .map_err(|_| "branch thread panicked".to_string())?;

        let mut commits = commits?;
        apply_tags(&mut commits, &tag_map_from_refs(&tags));

        Ok(RepoInfo {
            path: repo.to_string_lossy().to_string(),
            branch,
            commits,
            branches,
            tags,
        })
    })
    .await
}

#[tauri::command]
pub async fn git_init_repo(path: String) -> Result<String, String> {
    spawn_git(move || {
        if path.trim().is_empty() {
            return Err(coded!(PathMissing));
        }
        let repo = PathBuf::from(&path);
        if repo.exists() {
            let meta = std::fs::metadata(&repo).map_err(|e| e.to_string())?;
            if !meta.is_dir() {
                return Err(coded!(PathNotFolderNamed, path = path));
            }
        } else {
            std::fs::create_dir_all(&repo).map_err(|e| coded!(FolderCreateFailed, error = e))?;
        }
        run_git_merged_output(&repo, &["init"])?;
        Ok(repo.to_string_lossy().to_string())
    })
    .await
}

pub const TAG_KIND_LIGHTWEIGHT: &str = "lightweight";
pub const TAG_KIND_ANNOTATED: &str = "annotated";
pub const TAG_KIND_SIGNED: &str = "signed";

/// Load additional commits beyond what `open_repo` returned. Used by the
/// frontend virtualiser for infinite-scroll.
#[tauri::command]
pub async fn repo_log_page(
    path: String,
    skip: usize,
    limit: usize,
    hide_t3_checkpoints: Option<bool>,
) -> Result<Vec<Commit>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let tag_map = tags_by_target(&repo);
        let capped = limit.clamp(1, 500);
        let hide_t3 = hide_t3_checkpoints.unwrap_or(true);
        fetch_commits(&repo, skip, capped, &tag_map, hide_t3)
    })
    .await
}
