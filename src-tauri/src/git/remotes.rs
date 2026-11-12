use super::*;

pub(super) fn normalized_remote(repo: &PathBuf, remote: Option<&str>) -> Result<Option<String>, String> {
    let Some(r) = remote else {
        return Ok(None);
    };
    let r = r.trim();
    if r.is_empty() {
        return Ok(None);
    }
    reject_dash_arg(r, Label::RemoteName)?;
    let known = remote_names(repo);
    if !known.iter().any(|n| n == r) {
        return Err(coded!(GitUnknownRemote, remote = r));
    }
    Ok(Some(r.to_string()))
}

fn remote_names(repo: &PathBuf) -> Vec<String> {
    run_git(repo, &["remote"])
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// The remote a plain `git push` would target: the current branch's tracking
/// remote, else `remote.pushDefault`, else the only configured remote, else
/// `origin`.
fn resolve_push_remote(repo: &PathBuf) -> String {
    let branch = run_git(repo, &["symbolic-ref", "--short", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    if !branch.is_empty() {
        if let Ok(out) = run_git(
            repo,
            &["config", "--get", &format!("branch.{branch}.remote")],
        ) {
            let out = out.trim().to_string();
            if !out.is_empty() {
                return out;
            }
        }
    }
    if let Ok(out) = run_git(repo, &["config", "--get", "remote.pushDefault"]) {
        let out = out.trim().to_string();
        if !out.is_empty() {
            return out;
        }
    }
    let remotes = remote_names(repo);
    if remotes.len() == 1 {
        return remotes[0].clone();
    }
    DEFAULT_REMOTE.to_string()
}

#[tauri::command]
pub async fn branch_push_remote(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        Ok(resolve_push_remote(&repo))
    })
    .await
}

#[tauri::command]
pub async fn git_fetch(
    path: String,
    prune_branches: Option<bool>,
    prune_tags: Option<bool>,
    remote: Option<String>,
    all_remotes: Option<bool>,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let prune_branches = prune_branches.unwrap_or(true);
        let prune_tags = prune_tags.unwrap_or(false);
        let mut args: Vec<String> = vec!["fetch".to_string()];
        if prune_branches || prune_tags {
            args.push("--prune".to_string());
        }
        if prune_tags {
            args.push("--prune-tags".to_string());
        }
        if all_remotes.unwrap_or(false) {
            args.push("--all".to_string());
        } else if let Some(r) = normalized_remote(&repo, remote.as_deref())? {
            args.push("--".to_string());
            args.push(r);
        }
        let repo_path = repo.to_string_lossy().to_string();
        run_remote_op("fetch", &repo_path, Some(&repo), args, op_id)
    })
    .await
}

pub(crate) fn dirty_tracked_files(repo: &PathBuf) -> Result<Vec<String>, String> {
    let out = run_git(
        repo,
        &["status", "--porcelain=v1", "-z", "--untracked-files=no"],
    )?;
    let mut files: Vec<String> = Vec::new();
    let mut records = out.split_terminator('\0');
    while let Some(line) = records.next() {
        if line.len() < 3 {
            continue;
        }
        let xy = &line[..2];
        let rest = &line[3..];
        if xy == "??" || xy == "!!" {
            continue;
        }
        if !rest.is_empty() {
            files.push(rest.to_string());
        }
        // In -z format a rename/copy is destination followed by source. The
        // source record has no XY prefix and must not be interpreted as a file.
        if xy.contains('R') || xy.contains('C') {
            records.next();
        }
    }
    Ok(files)
}

#[tauri::command]
pub async fn git_pull(
    path: String,
    strategy: Option<String>,
    remote: Option<String>,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let autostash = strategy.as_deref() == Some("autostash");
        if !autostash {
            let dirty = dirty_tracked_files(&repo)?;
            if !dirty.is_empty() {
                return Err(format!("__LOCAL_CHANGES_BLOCK__|{}", dirty.join(",")));
            }
        }
        let mut args: Vec<String> = vec!["pull".to_string()];
        match strategy.as_deref() {
            Some("rebase") => args.push("--rebase".to_string()),
            Some("ff-only") => args.push("--ff-only".to_string()),
            Some("autostash") => {
                args.push("--no-rebase".to_string());
                args.push("--autostash".to_string());
            }
            _ => args.push("--no-rebase".to_string()),
        }
        if let Some(r) = normalized_remote(&repo, remote.as_deref())? {
            args.push("--".to_string());
            args.push(r);
            if let Ok(branch) = run_git(&repo, &["symbolic-ref", "--short", "HEAD"]) {
                let branch = branch.trim().to_string();
                if !branch.is_empty() {
                    args.push(branch);
                }
            }
        }
        let repo_path = repo.to_string_lossy().to_string();
        run_remote_op("pull", &repo_path, Some(&repo), args, op_id)
    })
    .await
}

#[tauri::command]
pub async fn git_push(
    path: String,
    set_upstream: bool,
    remote: Option<String>,
    force_mode: Option<String>,
    tags_mode: Option<String>,
    atomic: Option<bool>,
    no_verify: Option<bool>,
    dry_run: Option<bool>,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);

        let mut args: Vec<String> = vec!["push".to_string()];

        match force_mode.as_deref() {
            Some("lease") => args.push("--force-with-lease".to_string()),
            Some("force") => args.push("--force".to_string()),
            _ => {}
        }

        match tags_mode.as_deref() {
            Some("all") => args.push("--tags".to_string()),
            Some("follow") => args.push("--follow-tags".to_string()),
            _ => {}
        }

        if atomic.unwrap_or(false) {
            args.push("--atomic".to_string());
        }
        if no_verify.unwrap_or(false) {
            args.push("--no-verify".to_string());
        }
        if dry_run.unwrap_or(false) {
            args.push("--dry-run".to_string());
        }

        let target = normalized_remote(&repo, remote.as_deref())?;
        if set_upstream {
            let branch = run_git(&repo, &["symbolic-ref", "--short", "HEAD"])
                .map(|s| s.trim().to_string())?;
            if branch.is_empty() {
                return Err(coded!(GitHeadNotOnBranch));
            }
            let target = match target {
                Some(r) => r,
                None => resolve_push_remote(&repo),
            };
            args.push("-u".to_string());
            args.push("--".to_string());
            args.push(target);
            args.push(branch);
        } else if let Some(r) = target {
            args.push("--".to_string());
            args.push(r);
        }

        let repo_path = repo.to_string_lossy().to_string();
        run_remote_op("push", &repo_path, Some(&repo), args, op_id)
    })
    .await
}

#[tauri::command]
pub async fn list_git_remotes(path: String) -> Result<Vec<GitRemote>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let out = run_git(&repo, &["remote", "-v"])?;
        // `git remote -v` emits two lines per remote:
        //   origin\tgit@host:user/repo.git (fetch)
        //   origin\tgit@host:user/repo.git (push)
        // We only need the fetch URL per remote, in first-seen order.
        let mut remotes: Vec<GitRemote> = Vec::new();
        for line in out.lines() {
            let line = line.trim_end();
            if line.is_empty() {
                continue;
            }
            let Some((name, rest)) = line.split_once('\t') else {
                continue;
            };
            let url = rest
                .rsplit_once(' ')
                .map(|(u, _kind)| u)
                .unwrap_or(rest)
                .trim();
            if url.is_empty() {
                continue;
            }
            if remotes.iter().any(|r| r.name == name) {
                continue;
            }
            remotes.push(GitRemote {
                name: name.to_string(),
                url: url.to_string(),
            });
        }
        Ok(remotes)
    })
    .await
}

#[tauri::command]
pub async fn set_git_remote_url(path: String, name: String, url: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let n = name.trim();
        let u = url.trim();
        if n.is_empty() {
            return Err(required(Label::RemoteName));
        }
        if u.is_empty() {
            return Err(required(Label::RemoteUrl));
        }
        run_git_merged_output(&repo, &["remote", "set-url", n, u])
    })
    .await
}

#[tauri::command]
pub async fn add_git_remote(path: String, name: String, url: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let n = name.trim();
        let u = url.trim();
        if n.is_empty() {
            return Err(required(Label::RemoteName));
        }
        if u.is_empty() {
            return Err(required(Label::RemoteUrl));
        }
        run_git_merged_output(&repo, &["remote", "add", n, u])
    })
    .await
}

#[tauri::command]
pub async fn branch_has_upstream(path: String) -> Result<bool, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        Ok(compute_has_upstream(&repo))
    })
    .await
}

#[tauri::command]
pub async fn repo_upstream_sync_counts(path: String) -> Result<UpstreamSyncCounts, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        Ok(compute_upstream_sync(&repo))
    })
    .await
}

#[tauri::command]
pub async fn git_clone(url: String, dest: String, op_id: Option<String>) -> Result<String, String> {
    spawn_git(move || {
        let u = url.trim();
        let d = dest.as_str();
        if u.is_empty() {
            return Err(required(Label::CloneUrl));
        }
        if d.trim().is_empty() {
            return Err(required(Label::TargetPath));
        }
        let args = vec![
            "clone".to_string(),
            "--".to_string(),
            u.to_string(),
            d.to_string(),
        ];
        run_remote_op("clone", d, None, args, op_id)
    })
    .await
}
