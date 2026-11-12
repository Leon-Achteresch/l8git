use super::*;

#[tauri::command]
pub async fn git_discard_files(
    path: String,
    files: Vec<String>,
    untracked: Vec<bool>,
    expected_fingerprints: Option<Vec<String>>,
) -> Result<(), String> {
    spawn_git(move || {
        discard_files_impl(
            &PathBuf::from(&path),
            &files,
            &untracked,
            true,
            expected_fingerprints.as_deref(),
        )
    })
    .await
}

fn discard_files_impl(
    repo: &PathBuf,
    files: &[String],
    untracked: &[bool],
    from_head: bool,
    expected_fingerprints: Option<&[String]>,
) -> Result<(), String> {
    if files.len() != untracked.len() {
        return Err(coded!(GitDiscardListMismatch));
    }
    let lock = repo_mutation_mutex(repo)?;
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let guard = WorktreePathGuard::new(repo)?;
    if let Some(expected) = expected_fingerprints {
        if expected.len() != files.len() {
            return Err("expected_fingerprints must contain one token for every file".into());
        }
        // Check the entire reviewed batch before the first destructive action.
        for (file, expected) in files.iter().zip(expected) {
            if file_snapshot::fingerprint(repo, file)? != *expected {
                return Err(format!("__FILE_CHANGED__|{file}"));
            }
        }
    }
    let mut tracked = Vec::new();
    let mut to_clean = Vec::new();
    // Validate every target before restoring or deleting any of them. Never
    // trust a stale frontend flag to classify an indexed file as untracked.
    for (file, is_untracked) in files.iter().zip(untracked) {
        if file.is_empty() {
            continue;
        }
        guard.path(file)?;
        if *is_untracked {
            if !run_git(
                repo,
                &[
                    "--literal-pathspecs",
                    "ls-files",
                    "--cached",
                    "-z",
                    "--",
                    file,
                ],
            )?
            .is_empty()
            {
                return Err(format!("__DISCARD_TRACKED_AS_UNTRACKED__|{file}"));
            }
            to_clean.push(file.as_str());
        } else {
            tracked.push(file.as_str());
        }
    }
    if !tracked.is_empty() {
        let mut args = vec!["--literal-pathspecs", "restore"];
        if from_head {
            args.extend(["--source=HEAD", "--staged"]);
        }
        args.extend(["--worktree", "--"]);
        args.extend(tracked);
        run_git(repo, &args)?;
    }
    if !to_clean.is_empty() {
        // Git clean protects ignored files and embedded repositories, and
        // unlinks a symlink instead of following it during recursive removal.
        let mut args = vec!["--literal-pathspecs", "clean", "-f", "-d", "--"];
        args.extend(to_clean);
        run_git(repo, &args)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_discard_worktree_changes(
    path: String,
    files: Vec<String>,
    untracked: Vec<bool>,
    expected_fingerprints: Option<Vec<String>>,
) -> Result<(), String> {
    spawn_git(move || {
        discard_files_impl(
            &PathBuf::from(&path),
            &files,
            &untracked,
            false,
            expected_fingerprints.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn git_restore_files_at_commit(
    path: String,
    commit: String,
    files: Vec<String>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        if commit.trim().is_empty() {
            return Err(required(Label::CommitHash));
        }
        let commit = file_reads::commit_revision(&repo, &commit)?;
        if files.is_empty() {
            return Ok(());
        }
        let guard = WorktreePathGuard::new(&repo)?;
        // Validate the complete batch before checkout updates either the index
        // or the working tree. Leaf links are safe: Git replaces the link itself.
        for file in &files {
            let absolute = guard.path(file)?;
            for parent in absolute.ancestors().skip(1) {
                if parent == guard.root {
                    break;
                }
                match std::fs::symlink_metadata(parent) {
                    Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                        return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
                    }
                    Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                        return Err(error.to_string())
                    }
                    _ => {}
                }
            }
        }
        let mut args = vec!["--literal-pathspecs", "checkout", &commit, "--"];
        args.extend(files.iter().map(String::as_str));
        run_git(&repo, &args)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn add_to_gitignore(path: String, patterns: Vec<String>) -> Result<(), String> {
    spawn_git(move || {
        let file = PathBuf::from(&path).join(".gitignore");
        let existing = std::fs::read_to_string(&file).unwrap_or_default();
        let known: std::collections::HashSet<String> =
            existing.lines().map(|l| l.trim().to_string()).collect();
        let mut added: Vec<String> = Vec::new();
        for pattern in &patterns {
            let pattern = pattern.trim();
            if pattern.is_empty() || pattern.contains('\n') {
                continue;
            }
            if known.contains(pattern) || added.iter().any(|p| p == pattern) {
                continue;
            }
            added.push(pattern.to_string());
        }
        if added.is_empty() {
            return Ok(());
        }
        let mut out = existing;
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        for pattern in added {
            out.push_str(&pattern);
            out.push('\n');
        }
        std::fs::write(&file, out).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    spawn_git(move || {
        if files.is_empty() {
            return Ok(());
        }
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let mut args: Vec<&str> = vec!["--literal-pathspecs", "add", "--"];
        args.extend(files.iter().map(|s| s.as_str()));
        run_git(&repo, &args)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    spawn_git(move || {
        if files.is_empty() {
            return Ok(());
        }
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let has_head = run_git(&repo, &["rev-parse", "--verify", "HEAD"]).is_ok();
        let mut args: Vec<&str> = if has_head {
            vec!["--literal-pathspecs", "reset", "HEAD", "--"]
        } else {
            vec!["--literal-pathspecs", "rm", "--cached", "--"]
        };
        args.extend(files.iter().map(|s| s.as_str()));
        run_git(&repo, &args)?;
        Ok(())
    })
    .await
}

/// Apply a unified-diff patch to the git index (staging individual hunks/lines).
fn apply_patch_to_index(repo: &PathBuf, patch: &str, reverse: bool) -> Result<(), String> {
    let lock = repo_mutation_mutex(repo)?;
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let mut cmd = git_command();
    cmd.arg("-C").arg(repo);
    cmd.arg("apply");
    cmd.arg("--cached");
    cmd.arg("--whitespace=nowarn");
    if reverse {
        cmd.arg("--reverse");
    }
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| coded!(GitStartFailed, error = e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| coded!(GitPatchWriteFailed, error = e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| coded!(GitWaitFailed, error = e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            coded!(GitApplyFailed)
        } else {
            err
        });
    }
    Ok(())
}

/// Stage individual lines/hunks from the working tree into the index.
/// `patch` is a unified diff patch string (subset of `git diff` output).
#[tauri::command]
pub async fn stage_hunk(path: String, patch: String) -> Result<(), String> {
    spawn_git(move || apply_patch_to_index(&PathBuf::from(&path), &patch, false)).await
}

/// Unstage individual lines/hunks from the index (revert to HEAD).
/// `patch` is a unified diff patch string (subset of `git diff --cached` output).
#[tauri::command]
pub async fn unstage_hunk(path: String, patch: String) -> Result<(), String> {
    spawn_git(move || apply_patch_to_index(&PathBuf::from(&path), &patch, true)).await
}

fn apply_patch_to_worktree(repo: &PathBuf, patch: &str, reverse: bool) -> Result<(), String> {
    let lock = repo_mutation_mutex(repo)?;
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let mut cmd = git_command();
    cmd.arg("-C").arg(repo);
    cmd.arg("apply");
    cmd.arg("--whitespace=nowarn");
    if reverse {
        cmd.arg("--reverse");
    }
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| coded!(GitStartFailed, error = e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| coded!(GitPatchWriteFailed, error = e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| coded!(GitWaitFailed, error = e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            coded!(GitApplyFailed)
        } else {
            err
        });
    }
    Ok(())
}

/// Discard individual lines/hunks from the working tree (revert to index state).
/// The frontend builds a discard-specific patch (not a reversed staging patch),
/// so this applies it normally (no --reverse) directly to the working tree.
#[tauri::command]
pub async fn discard_hunk(path: String, patch: String) -> Result<(), String> {
    spawn_git(move || apply_patch_to_worktree(&PathBuf::from(&path), &patch, false)).await
}
