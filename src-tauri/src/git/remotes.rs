use super::*;
use super::coordination::RemoteProcessLock;
use sha2::{Digest, Sha256};
use std::sync::TryLockError;

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod workspace_fetch_fixture;
#[cfg(all(test, feature = "headless", any(target_os = "macos", target_os = "linux")))]
pub(crate) use workspace_fetch_fixture::*;

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod workspace_fetch_desktop;
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub use workspace_fetch_desktop::*;

async fn spawn_repo_remote(
    path: String,
    run: impl FnOnce(PathBuf, &Path, &RemoteProcessLock) -> Result<String, String> + Send + 'static,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let common_dir = coordination::repo_common_dir(&repo)?;
        let reservation = coordination::repo_remote_mutex(&common_dir)?;
        let _guard = reservation.try_lock().map_err(|error| match error {
            TryLockError::WouldBlock => coded!(GitRemoteBusy),
            TryLockError::Poisoned(error) => error.to_string(),
        })?;
        let process_lock = RemoteProcessLock::acquire(&common_dir)?;
        run(repo, &common_dir, &process_lock)
    })
    .await
}

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchTarget {
    remote: String,
    fingerprint: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchScope {
    common_dir: String,
    remotes: Vec<String>,
    target: Option<FetchTarget>,
    supported_target: bool,
}

struct ResolvedFetchTarget {
    remote: String,
    checkout: PathBuf,
    url: String,
    refspecs: Vec<u8>,
}

impl ResolvedFetchTarget {
    fn summary(&self) -> FetchTarget {
        // Hash the effective target without exposing credentials or local paths.
        let mut hash = Sha256::new();
        for value in [
            self.checkout.as_os_str().as_encoded_bytes(),
            self.url.as_bytes(),
            &self.refspecs,
        ] {
            hash.update((value.len() as u64).to_le_bytes());
            hash.update(value);
        }
        FetchTarget {
            remote: self.remote.clone(),
            fingerprint: crate::hex(&hash.finalize()),
        }
    }
}

fn workspace_remotes(repo: &PathBuf) -> Result<Vec<String>, String> {
    let output = String::from_utf8(run_git_command_bytes(git_command(), repo, &["remote"])?)
        .map_err(|_| "Git returned remote names that are not valid UTF-8".to_string())?;
    Ok(output.lines().map(str::to_owned).collect())
}

// The workspace contract is for an explicit named remote with one configured
// URL and configured refspecs. Git resolves insteadOf and excludes pushurl.
fn workspace_fetch_target(repo: &PathBuf, remotes: &[String]) -> Option<ResolvedFetchTarget> {
    let [remote] = remotes else { return None };
    if remote.is_empty() || remote == "." || remote.starts_with('-') || remote.trim() != remote {
        return None;
    }
    let config = |field: &str| {
        let key = format!("remote.{remote}.{field}");
        run_git_command_bytes(
            git_command(),
            repo,
            &["config", "--null", "--get-all", "--", &key],
        )
        .ok()
    };
    let configured = config("url")?;
    let configured = configured.strip_suffix(b"\0")?;
    if configured.is_empty() || configured.contains(&0) {
        return None;
    }
    let urls = run_git_command_bytes(
        git_command(),
        repo,
        &["remote", "get-url", "--all", "--", remote],
    )
    .ok()?;
    let url = std::str::from_utf8(urls.strip_suffix(b"\n")?).ok()?;
    if url.is_empty() || url.trim() != url || url.chars().any(char::is_control) {
        return None;
    }
    let refspecs = config("fetch")?;
    if refspecs
        .strip_suffix(b"\0")?
        .split(|byte| *byte == 0)
        .any(|value| value.is_empty())
    {
        return None;
    }
    Some(ResolvedFetchTarget {
        remote: remote.clone(),
        checkout: repo.canonicalize().ok()?,
        url: url.to_owned(),
        refspecs,
    })
}

fn supported_workspace_target(value: &str) -> bool {
    if value.chars().any(char::is_control) {
        return false;
    }
    if Path::new(value).is_absolute() {
        return true;
    }
    if value.contains("://") {
        return tauri::Url::parse(value).ok().is_some_and(|url| match url.scheme() {
            "file" => url.host_str().is_none() && url.path().starts_with('/'),
            "https" | "http" | "ssh" | "git" => url.host_str().is_some(),
            _ => false,
        });
    }
    if value.contains("::") { return false; }
    // Git's user@host:path shorthand. A slash before the colon denotes a
    // filesystem path instead, which must be absolute for this entry point.
    let Some((destination, path)) = value.split_once(':') else { return false };
    let (user, host) = destination.rsplit_once('@').unwrap_or(("", destination));
    !path.is_empty() && !host.is_empty() && !host.starts_with('-')
        && user.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
        && host.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
}

#[tauri::command]
pub async fn repo_fetch_scope(path: String) -> Result<FetchScope, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let common_dir = coordination::repo_common_dir(&repo)?
            .into_os_string()
            .into_string()
            .map_err(|_| "Git common directory is not valid UTF-8".to_string())?;
        let remotes = workspace_remotes(&repo)?;
        let target = workspace_fetch_target(&repo, &remotes);
        let supported_target = target.as_ref().is_some_and(|target| supported_workspace_target(&target.url));
        Ok(FetchScope {
            common_dir,
            remotes,
            target: target.map(|target| target.summary()),
            supported_target,
        })
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
    spawn_repo_remote(path, move |repo, _, lock| {
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
        run_remote_op("fetch", &repo_path, Some(&repo), args, op_id, Some(lock))
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
    spawn_repo_remote(path, move |repo, _, lock| {
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
        run_remote_op("pull", &repo_path, Some(&repo), args, op_id, Some(lock))
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
    spawn_repo_remote(path, move |repo, _, lock| {
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
        run_remote_op("push", &repo_path, Some(&repo), args, op_id, Some(lock))
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
        run_remote_op("clone", d, None, args, op_id, None)
    })
    .await
}
