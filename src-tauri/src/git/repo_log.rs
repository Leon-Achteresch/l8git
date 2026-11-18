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
    args.push(COMMIT_TEXT_ENCODING.into());
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
    open_repo_target(path, hide_t3_checkpoints, None).await
}

#[tauri::command]
pub async fn open_submodule_repo(
    path: String,
    submodule_path: String,
    hide_t3_checkpoints: Option<bool>,
) -> Result<RepoInfo, String> {
    open_repo_target(path, hide_t3_checkpoints, Some(submodule_path)).await
}

/// Resolve only a direct, valid local branch whose ref is actually absent.
fn unborn_branch(repo: &PathBuf, head_error: &str) -> Result<String, String> {
    let target = run_git_command_bytes(
        git_command(),
        repo,
        &["symbolic-ref", "--quiet", "--no-recurse", "HEAD"],
    )
    .map_err(|_| head_error.to_owned())?;
    let target = std::str::from_utf8(&target).map_err(|err| err.to_string())?;
    let target = target.trim_end_matches(['\r', '\n']);
    let name = target.strip_prefix("refs/heads/").ok_or(head_error)?;
    run_git(repo, &["check-ref-format", target]).map_err(|_| head_error.to_owned())?;

    let inspect = |args: &[&str]| {
        git_command()
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .map_err(|err| err.to_string())
    };
    let exists = inspect(&["show-ref", "--exists", target])?;
    let missing = match exists.status.code() {
        Some(2) => true,
        // Older Git lacks --exists. Verify that the target is neither another
        // symref nor a direct or broken ref reported by for-each-ref.
        Some(129) => {
            let symbolic = inspect(&["symbolic-ref", "--quiet", "--no-recurse", target])?;
            let refs = inspect(&["for-each-ref", "--format=%(refname)", "--", target])?;
            symbolic.status.code() == Some(1)
                && symbolic.stderr.is_empty()
                && refs.status.success()
                && refs.stderr.is_empty()
                && !String::from_utf8_lossy(&refs.stdout)
                    .lines()
                    .any(|line| line == target)
        }
        _ => false,
    };
    if missing {
        Ok(name.to_owned())
    } else {
        Err(head_error.into())
    }
}

async fn open_repo_target(
    path: String,
    hide_t3_checkpoints: Option<bool>,
    submodule_path: Option<String>,
) -> Result<RepoInfo, String> {
    spawn_git(move || {
        let mut repo = PathBuf::from(path);
        if let Some(selected) = submodule_path {
            repo = submodules::submodule_repo_path(&repo, &selected)?;
        }
        let hide_t3 = hide_t3_checkpoints.unwrap_or(true);

        // Keep the HEAD probe local, including when peeling a promisor object.
        let mut probe = git_command();
        probe
            .env("GIT_NO_LAZY_FETCH", "1")
            .env("GIT_ALLOW_PROTOCOL", "");
        // Invalid revisions must fail even if a worktree file is named HEAD.
        let (bare, shallow, branch, head_exists) = match run_git_command(
            probe,
            &repo,
            &[
                "rev-parse",
                "--is-bare-repository",
                "--abbrev-ref",
                "HEAD",
                "--is-shallow-repository",
                "HEAD^{commit}",
                "--",
            ],
        ) {
            Ok(out) => {
                let mut lines = out.lines();
                let bare = lines.next().unwrap_or_default().to_owned();
                let branch = lines
                    .next()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("HEAD")
                    .to_string();
                let shallow = lines.next().unwrap_or_default().to_owned();
                (bare, shallow, branch, true)
            }
            Err(head_error) => {
                let flags = run_git(
                    &repo,
                    &[
                        "rev-parse",
                        "--is-bare-repository",
                        "--is-shallow-repository",
                    ],
                )
                .map_err(|error| format!("Cannot open '{}': {error}", repo.display()))?;
                let mut lines = flags.lines();
                let bare = lines.next().unwrap_or_default().to_owned();
                let shallow = lines.next().unwrap_or_default().to_owned();
                let unborn = unborn_branch(&repo, &head_error)?;
                let branch = if bare == "true" {
                    "HEAD".into()
                } else {
                    unborn
                };
                (bare, shallow, branch, false)
            }
        };
        let is_bare = match bare.trim() {
            "true" => true,
            "false" => false,
            _ => return Err("Git returned an invalid bare repository flag".into()),
        };
        let is_shallow = match shallow.trim() {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
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
            is_bare,
            is_shallow,
            is_unborn: !is_bare && !head_exists,
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
