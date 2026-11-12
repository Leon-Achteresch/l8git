use super::*;

#[tauri::command]
pub async fn git_checkout(
    path: String,
    ref_name: String,
    create: bool,
    from_remote: Option<String>,
    base: Option<String>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        let name = ref_name.trim();
        if name.is_empty() {
            return Err(required(Label::BranchOrRef));
        }
        reject_dash_arg(name, Label::BranchOrRef)?;
        if let Some(remote) = from_remote.filter(|s| !s.trim().is_empty()) {
            validate_branch_name(&repo, name)?;
            let r = remote.trim();
            reject_dash_arg(r, Label::RemoteTrackingRef)?;
            run_git(&repo, &["checkout", "-b", name, "--track", r])?;
            return Ok(());
        }
        if create {
            validate_branch_name(&repo, name)?;
            let mut args: Vec<String> = vec!["checkout".into(), "-b".into(), name.to_string()];
            if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
                args.push(resolve_git_commit(&repo, &b)?);
            }
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_git(&repo, &refs)?;
            return Ok(());
        }
        run_git(&repo, &["checkout", name, "--"])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_create_branch(
    path: String,
    name: String,
    base: Option<String>,
    checkout: bool,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        let n = name.trim();
        if n.is_empty() {
            return Err(required(Label::BranchName));
        }
        validate_branch_name(&repo, n)?;
        let base = base
            .filter(|s| !s.trim().is_empty())
            .map(|value| resolve_git_commit(&repo, &value))
            .transpose()?;
        if checkout {
            let mut args: Vec<String> = vec!["checkout".into(), "-b".into(), n.to_string()];
            if let Some(b) = base {
                args.push(b);
            }
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_git(&repo, &refs)?;
            return Ok(());
        }
        let mut args: Vec<String> = vec!["branch".into(), n.to_string()];
        if let Some(b) = base {
            args.push(b);
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &refs)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        let n = name.trim();
        if n.is_empty() {
            return Err(required(Label::BranchName));
        }
        let flag = if force { "-D" } else { "-d" };
        run_git(&repo, &["branch", flag, "--", n])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_remote_branch(path: String, remote_ref: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let s = remote_ref.trim();
        let slash = s
            .find('/')
            .ok_or_else(|| coded!(GitInvalidRemoteRef))?;
        let remote = s[..slash].trim();
        let branch = s[slash + 1..].trim();
        if remote.is_empty() || branch.is_empty() {
            return Err(coded!(GitInvalidRemoteRef));
        }
        let remote = normalized_remote(&repo, Some(remote))?
            .ok_or_else(|| coded!(GitInvalidRemoteRef))?;
        reject_dash_arg(branch, Label::BranchName)?;
        let out = run_git_merged_output(&repo, &["push", &remote, "--delete", "--", branch])?;
        let _ = run_git_merged_output(&repo, &["fetch", "--prune", "--", &remote]);
        Ok(out)
    })
    .await
}

fn parse_behind_from_track(track: &str) -> Option<u32> {
    // %(upstream:track) yields strings like "[ahead 2, behind 3]", "[behind 1]", "[gone]" or ""
    let idx = track.find("behind ")?;
    let rest = &track[idx + "behind ".len()..];
    let end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    rest[..end].parse::<u32>().ok()
}

pub(super) fn list_branches(repo: &PathBuf) -> Result<Vec<Branch>, String> {
    let sep = "\x1f";
    let format = format!("%(HEAD){sep}%(refname){sep}%(objectname){sep}%(upstream:track)");
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            &format!("--format={format}"),
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    let branches = out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, sep);
            let head = parts.next()?;
            let refname = parts.next()?;
            let tip = parts.next()?.trim().to_string();
            if tip.is_empty() {
                return None;
            }
            let track = parts.next().unwrap_or("").trim();
            let behind = parse_behind_from_track(track);
            let is_current = head.trim() == "*";

            let (name, is_remote) = if let Some(rest) = refname.strip_prefix("refs/heads/") {
                (rest.to_string(), false)
            } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
                if rest.ends_with("/HEAD") {
                    return None;
                }
                (rest.to_string(), true)
            } else {
                return None;
            };

            Some(Branch {
                name,
                is_current,
                is_remote,
                tip,
                behind,
            })
        })
        .collect();

    Ok(branches)
}

#[derive(Serialize)]
pub struct BranchActivity {
    pub name: String,
    pub is_remote: bool,
    pub last_commit_at: String,
}

fn collect_branch_activity(repo: &PathBuf) -> Result<Vec<BranchActivity>, String> {
    let sep = "\x1f";
    let format = format!("%(refname){sep}%(committerdate:iso-strict)");
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            &format!("--format={format}"),
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    let branches = out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, sep);
            let refname = parts.next()?;
            let last_commit_at = parts.next().unwrap_or("").trim().to_string();
            if last_commit_at.is_empty() {
                return None;
            }

            let (name, is_remote) = if let Some(rest) = refname.strip_prefix("refs/heads/") {
                (rest.to_string(), false)
            } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
                if rest.ends_with("/HEAD") {
                    return None;
                }
                (rest.to_string(), true)
            } else {
                return None;
            };

            Some(BranchActivity {
                name,
                is_remote,
                last_commit_at,
            })
        })
        .collect();

    Ok(branches)
}

#[tauri::command]
pub async fn repo_branch_activity(path: String) -> Result<Vec<BranchActivity>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        collect_branch_activity(&repo)
    })
    .await
}
