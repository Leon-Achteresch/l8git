use super::{
    current_branch_name, repo_coordination_mutex, repo_mutation_mutex, resolve_git_commit, run_git,
    run_git_merged_output, spawn_git,
};
use serde::Serialize;
use std::path::PathBuf;

// ── Worktrees ────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct WorktreeEntry {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_locked: bool,
    pub lock_reason: Option<String>,
    pub is_prunable: bool,
    pub prunable_reason: Option<String>,
}

pub(crate) fn parse_worktree_list(output: &str) -> Vec<WorktreeEntry> {
    let mut entries = Vec::new();
    let mut is_first = true;

    for block in output.split("\0\0") {
        if block.is_empty() {
            continue;
        }

        let mut wt_path = String::new();
        let mut head = String::new();
        let mut branch: Option<String> = None;
        let mut is_locked = false;
        let mut lock_reason: Option<String> = None;
        let mut is_prunable = false;
        let mut prunable_reason: Option<String> = None;

        for line in block.split('\0') {
            if let Some(v) = line.strip_prefix("worktree ") {
                wt_path = v.to_string();
            } else if let Some(v) = line.strip_prefix("HEAD ") {
                let h = v.trim();
                head = h[..h.len().min(7)].to_string();
            } else if let Some(v) = line.strip_prefix("branch ") {
                let refname = v.trim();
                branch = Some(
                    refname
                        .strip_prefix("refs/heads/")
                        .unwrap_or(refname)
                        .to_string(),
                );
            } else if line.trim() == "detached" {
                branch = None;
            } else if line.trim() == "locked" {
                is_locked = true;
            } else if let Some(v) = line.strip_prefix("locked ") {
                is_locked = true;
                let r = v.trim();
                if !r.is_empty() {
                    lock_reason = Some(r.to_string());
                }
            } else if line.trim() == "prunable" {
                is_prunable = true;
            } else if let Some(v) = line.strip_prefix("prunable ") {
                is_prunable = true;
                let r = v.trim();
                if !r.is_empty() {
                    prunable_reason = Some(r.to_string());
                }
            }
        }

        if wt_path.is_empty() {
            continue;
        }

        entries.push(WorktreeEntry {
            path: wt_path,
            head,
            branch,
            is_main: is_first,
            is_locked,
            lock_reason,
            is_prunable,
            prunable_reason,
        });
        is_first = false;
    }
    entries
}

#[tauri::command]
pub async fn list_worktrees(path: String) -> Result<Vec<WorktreeEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let out = run_git(&repo, &["worktree", "list", "--porcelain", "-z"])?;
        Ok(parse_worktree_list(&out))
    })
    .await
}

#[tauri::command]
pub async fn git_worktree_add(
    path: String,
    worktree_path: String,
    branch: Option<String>,
    new_branch: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let wt = worktree_path;
        if wt.is_empty() {
            return Err("Worktree-Pfad darf nicht leer sein".into());
        }
        let mut args: Vec<String> = vec!["worktree".into(), "add".into()];
        if let Some(nb) = new_branch.filter(|s| !s.trim().is_empty()) {
            args.push("-b".into());
            args.push(nb.trim().to_string());
        }
        args.push("--".into());
        args.push(wt);
        if let Some(b) = branch.filter(|s| !s.trim().is_empty()) {
            args.push(b.trim().to_string());
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git_merged_output(&repo, &refs)
    })
    .await
}

#[tauri::command]
pub async fn git_worktree_remove(
    path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let wt = worktree_path;
        if wt.is_empty() {
            return Err("Worktree-Pfad darf nicht leer sein".into());
        }
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push("--");
        args.push(wt.as_str());
        run_git(&repo, &args)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_worktree_remove_checked(
    path: String,
    worktree_path: String,
    expected_branch: String,
    expected_head: String,
    merged_into: String,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let requested = PathBuf::from(worktree_path);
        let worktree = if requested.is_absolute() {
            requested
        } else {
            repo.join(requested)
        };
        let worktree = worktree.canonicalize().map_err(|e| e.to_string())?;
        let repo_absolute = repo.canonicalize().map_err(|e| e.to_string())?;
        if worktree == repo_absolute {
            return Err("__WORKTREE_NOT_REGISTERED__".into());
        }
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let repo_lock = repo_mutation_mutex(&repo)?;
        let worktree_lock = repo_mutation_mutex(&worktree)?;
        if std::sync::Arc::ptr_eq(&repo_lock, &worktree_lock) {
            return Err("__WORKTREE_NOT_REGISTERED__".into());
        }
        // Consistent ordering also covers cleanup initiated from a linked
        // worktree, so two worktrees cannot deadlock while checking each other.
        let (first, second) = if repo_absolute < worktree {
            (repo_lock, worktree_lock)
        } else {
            (worktree_lock, repo_lock)
        };
        let _first_guard = first.lock().map_err(|e| e.to_string())?;
        let _second_guard = second.lock().map_err(|e| e.to_string())?;

        let listed =
            parse_worktree_list(&run_git(&repo, &["worktree", "list", "--porcelain", "-z"])?);
        let entry = listed
            .iter()
            .find(|entry| {
                !entry.is_main
                    && PathBuf::from(&entry.path).canonicalize().ok().as_ref() == Some(&worktree)
            })
            .ok_or_else(|| "__WORKTREE_NOT_REGISTERED__".to_string())?;
        if entry.branch.as_deref() != Some(expected_branch.trim())
            || current_branch_name(&worktree).as_deref() != Some(expected_branch.trim())
        {
            return Err("__BRANCH_CHANGED__".into());
        }
        let source = resolve_git_commit(&worktree, "HEAD")?;
        if source != expected_head.trim() {
            return Err("__SOURCE_CHANGED__".into());
        }
        let destination = resolve_git_commit(&repo, &merged_into)?;
        run_git(
            &repo,
            &["merge-base", "--is-ancestor", &source, &destination],
        )
        .map_err(|_| "__WORKTREE_NOT_MERGED__".to_string())?;
        if !run_git(
            &worktree,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )?
        .is_empty()
        {
            return Err("__WORKTREE_DIRTY__".into());
        }
        if resolve_git_commit(&repo, &merged_into)? != destination {
            return Err("__HEAD_CHANGED__".into());
        }
        // No force: Git performs its own final worktree cleanliness/lock check.
        run_git(
            &repo,
            &[
                "worktree",
                "remove",
                "--",
                worktree.to_str().ok_or("Invalid worktree path")?,
            ],
        )?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_worktree_lock(
    path: String,
    worktree_path: String,
    reason: Option<String>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let wt = worktree_path;
        let mut args: Vec<String> = vec!["worktree".into(), "lock".into()];
        if let Some(r) = reason.filter(|s| !s.trim().is_empty()) {
            args.push("--reason".into());
            args.push(r.trim().to_string());
        }
        args.push("--".into());
        args.push(wt);
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &refs)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_worktree_unlock(path: String, worktree_path: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let wt = worktree_path;
        run_git(&repo, &["worktree", "unlock", "--", wt.as_str()])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_worktree_prune(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        run_git_merged_output(&repo, &["worktree", "prune", "--verbose"])
    })
    .await
}

#[tauri::command]
pub async fn git_worktree_move(
    path: String,
    worktree_path: String,
    new_path: String,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let wt = worktree_path;
        let np = new_path;
        if wt.is_empty() || np.is_empty() {
            return Err("Worktree-Pfad darf nicht leer sein".into());
        }
        run_git(&repo, &["worktree", "move", "--", wt.as_str(), np.as_str()])?;
        Ok(())
    })
    .await
}
