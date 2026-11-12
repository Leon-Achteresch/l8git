use super::*;

#[tauri::command]
pub async fn git_merge(
    path: String,
    branch: String,
    strategy: Option<String>,
    message: Option<String>,
    expected_branch: Option<String>,
    expected_head: Option<String>,
    expected_source_head: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let b = branch.trim();
        if b.is_empty() {
            return Err(required(Label::BranchName));
        }
        reject_dash_arg(b, Label::MergeRef)?;
        verify_expected_branch(&repo, expected_branch.as_deref())?;
        verify_expected_head(&repo, expected_head.as_deref())?;
        let source = resolve_git_commit(&repo, b)?;
        if let Some(expected) = expected_source_head.as_deref() {
            if expected.trim() != source {
                return Err("__SOURCE_CHANGED__".into());
            }
        }

        let dirty = dirty_tracked_files(&repo)?;
        if !dirty.is_empty() {
            return Err(format!("__LOCAL_CHANGES_BLOCK__|{}", dirty.join(",")));
        }

        let strat = strategy
            .as_deref()
            .map(|s| s.trim())
            .unwrap_or("ff")
            .to_lowercase();

        let trimmed_msg = message
            .as_deref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        match strat.as_str() {
            "ff" => {
                let current = current_branch_name(&repo).unwrap_or_default();
                let msg = trimmed_msg.unwrap_or_else(|| default_merge_message(b, &current));
                let args: Vec<String> = vec![
                    "merge".into(),
                    "--ff".into(),
                    "--no-edit".into(),
                    "-m".into(),
                    msg,
                    source,
                ];
                let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
                run_git_merged_output(&repo, &refs)
            }
            "ff-only" => run_git_merged_output(&repo, &["merge", "--ff-only", &source]),
            "no-ff" => {
                let current = current_branch_name(&repo).unwrap_or_default();
                let msg = trimmed_msg.unwrap_or_else(|| default_merge_message(b, &current));
                run_git_merged_output(
                    &repo,
                    &["merge", "--no-ff", "--no-edit", "-m", msg.as_str(), &source],
                )
            }
            "squash" => {
                let current = current_branch_name(&repo).unwrap_or_default();
                let squash_out = run_git_merged_output(&repo, &["merge", "--squash", &source])?;
                verify_expected_branch(&repo, expected_branch.as_deref())?;
                verify_expected_head(&repo, expected_head.as_deref())?;
                let msg = trimmed_msg.unwrap_or_else(|| default_squash_message(b, &current));
                let commit_out = run_git_merged_output(&repo, &["commit", "-m", msg.as_str()])?;
                let combined = match (squash_out.is_empty(), commit_out.is_empty()) {
                    (false, false) => format!("{squash_out}\n{commit_out}"),
                    (false, true) => squash_out,
                    (true, false) => commit_out,
                    (true, true) => String::new(),
                };
                Ok(combined)
            }
            other => Err(coded!(GitUnknownMergeStrategy, strategy = other)),
        }
    })
    .await
}

pub(super) fn current_branch_name(repo: &PathBuf) -> Option<String> {
    run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD")
}

fn verify_expected_branch(repo: &PathBuf, expected: Option<&str>) -> Result<(), String> {
    if let Some(expected) = expected {
        if current_branch_name(repo).as_deref() != Some(expected.trim()) {
            return Err("__BRANCH_CHANGED__".into());
        }
    }
    Ok(())
}

fn default_merge_message(source: &str, target: &str) -> String {
    if target.is_empty() {
        format!("Merge branch '{source}'")
    } else {
        format!("Merge branch '{source}' into {target}")
    }
}

fn default_squash_message(source: &str, target: &str) -> String {
    if target.is_empty() {
        format!("Squashed commit from '{source}'")
    } else {
        format!("Squashed commit from '{source}' into {target}")
    }
}

#[tauri::command]
pub async fn git_revert_commit(
    path: String,
    commit: String,
    merge_mainline: Option<u8>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let c = commit.trim();
        if c.is_empty() {
            return Err(required(Label::CommitHash));
        }
        let c = resolve_git_commit(&repo, c)?;
        let mut parts: Vec<String> = vec!["revert".into(), "--no-edit".into()];
        if let Some(m) = merge_mainline {
            if m < 1 {
                return Err(coded!(GitMainlineParent));
            }
            parts.push("-m".into());
            parts.push(m.to_string());
        }
        parts.push(c);
        let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
        run_git_merged_output(&repo, &args)
    })
    .await
}

#[derive(Serialize)]
pub struct CherryPickState {
    pub in_progress: bool,
    pub head: Option<String>,
    pub conflicted_paths: Vec<String>,
}

pub(crate) fn repo_conflicted_paths(repo: &PathBuf) -> Result<Vec<String>, String> {
    Ok(
        run_git(repo, &["diff", "--name-only", "--diff-filter=U", "-z"])?
            .split_terminator('\0')
            .filter(|path| !path.is_empty())
            .map(str::to_string)
            .collect(),
    )
}

#[tauri::command]
pub async fn git_cherry_pick(
    path: String,
    commits: Vec<String>,
    mainline: Option<u8>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let cleaned: Vec<String> = commits
            .iter()
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty())
            .collect();
        if cleaned.is_empty() {
            return Err(coded!(GitCommitHashRequired));
        }
        let mut parts: Vec<String> = vec!["cherry-pick".into()];
        if let Some(m) = mainline {
            if m < 1 {
                return Err(coded!(GitMainlineParent));
            }
            parts.push("-m".into());
            parts.push(m.to_string());
        }
        for c in &cleaned {
            parts.push(resolve_git_commit(&repo, c)?);
        }
        let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
        run_git_merged_output(&repo, &args)
    })
    .await
}

#[tauri::command]
pub async fn git_cherry_pick_continue(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git_merged_output(
            &repo,
            &["-c", "core.editor=true", "cherry-pick", "--continue"],
        )
    })
    .await
}

#[tauri::command]
pub async fn git_cherry_pick_skip(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git_merged_output(&repo, &["cherry-pick", "--skip"])
    })
    .await
}

#[tauri::command]
pub async fn git_cherry_pick_abort(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git_merged_output(&repo, &["cherry-pick", "--abort"])
    })
    .await
}

#[tauri::command]
pub async fn cherry_pick_state(path: String) -> Result<CherryPickState, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let head_path_raw = run_git(&repo, &["rev-parse", "--git-path", "CHERRY_PICK_HEAD"])?;
        let head_path = head_path_raw.strip_suffix('\n').unwrap_or(&head_path_raw);
        let abs_head = if std::path::Path::new(head_path).is_absolute() {
            PathBuf::from(head_path)
        } else {
            repo.join(head_path)
        };
        let head = std::fs::read_to_string(&abs_head)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let in_progress = head.is_some();
        let conflicted_paths = if in_progress {
            repo_conflicted_paths(&repo)?
        } else {
            Vec::new()
        };
        Ok(CherryPickState {
            in_progress,
            head,
            conflicted_paths,
        })
    })
    .await
}

#[derive(serde::Serialize)]
pub struct MergeState {
    pub in_progress: bool,
    pub merge_head: Option<String>,
    pub conflicted_paths: Vec<String>,
}

#[tauri::command]
pub async fn merge_state(path: String) -> Result<MergeState, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let head_path_raw = run_git(&repo, &["rev-parse", "--git-path", "MERGE_HEAD"])?;
        let head_path = head_path_raw.strip_suffix('\n').unwrap_or(&head_path_raw);
        let abs_head = if std::path::Path::new(head_path).is_absolute() {
            PathBuf::from(head_path)
        } else {
            repo.join(head_path)
        };
        let merge_head = std::fs::read_to_string(&abs_head)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let in_progress = merge_head.is_some();
        let conflicted_paths = if in_progress {
            repo_conflicted_paths(&repo)?
        } else {
            Vec::new()
        };
        Ok(MergeState {
            in_progress,
            merge_head,
            conflicted_paths,
        })
    })
    .await
}

#[tauri::command]
pub async fn git_merge_abort(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git_merged_output(&repo, &["merge", "--abort"])
    })
    .await
}

#[derive(serde::Serialize)]
pub struct ConflictVersions {
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub current: String,
}

pub(crate) struct WorktreePathGuard {
    pub(super) root: PathBuf,
    pub(super) cwd: PathBuf,
}

pub(super) fn is_git_metadata_path(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(".git"))
    })
}

impl WorktreePathGuard {
    pub(crate) fn new(repo: &PathBuf) -> Result<Self, String> {
        let root = run_git(repo, &["rev-parse", "--show-toplevel"])?;
        let root = root.strip_suffix('\n').unwrap_or(&root);
        #[cfg(windows)]
        let root = root.strip_suffix('\r').unwrap_or(root);
        let root = PathBuf::from(root)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let cwd = repo.canonicalize().map_err(|e| e.to_string())?;
        if !cwd.starts_with(&root) {
            return Err("__INVALID_WORKTREE_PATH__".into());
        }
        Ok(Self { root, cwd })
    }

    pub(crate) fn path(&self, file: &str) -> Result<PathBuf, String> {
        use std::path::Component;
        let relative = Path::new(file);
        let invalid = || format!("__INVALID_WORKTREE_PATH__|{file}");
        if file.is_empty()
            || file.contains('\0')
            || is_git_metadata_path(relative)
            || !relative
                .components()
                .any(|part| matches!(part, Component::Normal(_)))
            || relative.components().any(|part| {
                matches!(
                    part,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(invalid());
        }
        let absolute = self.cwd.join(relative);
        // Check the closest existing parent, including symlinks. A missing
        // conflict file is valid, but its ancestors must stay in this worktree.
        let mut ancestor = absolute.parent().ok_or_else(invalid)?;
        loop {
            match ancestor.canonicalize() {
                Ok(real) => {
                    let inside = real.strip_prefix(&self.root).map_err(|_| invalid())?;
                    if is_git_metadata_path(inside) {
                        return Err(invalid());
                    }
                    break;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    ancestor = ancestor.parent().ok_or_else(invalid)?;
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(absolute)
    }

    pub(crate) fn regular_file(&self, file: &str) -> Result<PathBuf, String> {
        let absolute = self.path(file)?;
        match std::fs::symlink_metadata(&absolute) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
            }
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                return Err(error.to_string())
            }
            _ => {}
        }
        Ok(absolute)
    }
}

#[tauri::command]
pub async fn git_get_conflict_versions(
    path: String,
    file: String,
) -> Result<ConflictVersions, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let f = file.as_str();
        let absolute = WorktreePathGuard::new(&repo)?.regular_file(f)?;

        let stage = |n: &str| -> String {
            run_git(&repo, &["show", &format!(":{n}:{f}")]).unwrap_or_default()
        };

        let current = std::fs::read_to_string(absolute).unwrap_or_default();

        Ok(ConflictVersions {
            base: stage("1"),
            ours: stage("2"),
            theirs: stage("3"),
            current,
        })
    })
    .await
}

#[tauri::command]
pub async fn git_save_resolved_file(
    path: String,
    file: String,
    content: String,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let f = file.as_str();
        let absolute = WorktreePathGuard::new(&repo)?.regular_file(f)?;
        std::fs::write(absolute, content)
            .map_err(|e| coded!(FileWriteFailed, error = e))?;
        run_git_merged_output(&repo, &["--literal-pathspecs", "add", "--", f])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_merge_commit(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git_merged_output(&repo, &["commit", "--no-edit"])
    })
    .await
}

#[tauri::command]
pub async fn git_reset(
    path: String,
    target: String,
    mode: String,
    expected_head: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let t = target.trim();
        if t.is_empty() {
            return Err(required(Label::Target));
        }
        let flag = match mode.trim() {
            "soft" => "--soft",
            "hard" => "--hard",
            "mixed" => "--mixed",
            other => return Err(format!("Invalid reset mode: {other}")),
        };
        let target = resolve_git_commit(&repo, t)?;
        verify_expected_head(&repo, expected_head.as_deref())?;
        run_git_merged_output(&repo, &["reset", flag, &target])
    })
    .await
}
