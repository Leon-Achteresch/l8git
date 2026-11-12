// Patch export (`git format-patch`, `git diff --binary`) and import (`git am`, `git apply`).
use super::{repo_conflicted_paths, resolve_git_commit, run_git, run_git_merged_output, spawn_git};
use crate::cmd::git_command;
use crate::cmdlog;
use crate::coded;
use serde::Serialize;
use std::path::{Path, PathBuf};

fn absolute(raw: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(raw.trim());
    if raw.trim().is_empty() || !p.is_absolute() {
        return Err(coded!(PatchAbsolutePath, path = raw));
    }
    Ok(p)
}

fn patch_files(files: &[String]) -> Result<Vec<PathBuf>, String> {
    if files.is_empty() {
        return Err(coded!(PatchSelectionEmpty));
    }
    files
        .iter()
        .map(|f| {
            let p = absolute(f)?;
            if !p.is_file() {
                return Err(coded!(PatchFileMissing, path = p.display()));
            }
            Ok(p)
        })
        .collect()
}

/// `git format-patch` output starts with an mbox `From ` line; saved mails carry `From:` and `Subject:` headers before the diff.
fn is_mailbox(path: &Path) -> bool {
    use std::io::Read;
    let mut bytes = Vec::new();
    let Ok(file) = std::fs::File::open(path) else { return false };
    if file.take(8192).read_to_end(&mut bytes).is_err() {
        return false;
    }
    let text = String::from_utf8_lossy(&bytes);
    if text.lines().find(|l| !l.trim().is_empty()).is_some_and(|l| l.starts_with("From ")) {
        return true;
    }
    let headers: Vec<&str> = text.lines().take_while(|l| !l.trim().is_empty()).collect();
    headers.iter().any(|l| l.starts_with("From:")) && headers.iter().any(|l| l.starts_with("Subject:"))
}

fn run_with_files(repo: &PathBuf, args: &[&str], files: &[PathBuf]) -> Result<String, String> {
    let mut all: Vec<String> = args.iter().map(|a| a.to_string()).collect();
    all.push("--".into());
    all.extend(files.iter().map(|f| f.to_string_lossy().to_string()));
    let refs: Vec<&str> = all.iter().map(String::as_str).collect();
    run_git_merged_output(repo, &refs)
}

/// Writes one `NNNN-subject.patch` per commit into `out_dir`, numbered in the given order.
#[tauri::command]
pub async fn git_format_patch(
    path: String,
    commits: Vec<String>,
    out_dir: String,
) -> Result<Vec<String>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let dir = absolute(&out_dir)?;
        if !dir.is_dir() {
            return Err(coded!(PathNotFolderNamed, path = dir.display()));
        }
        if commits.is_empty() {
            return Err(coded!(GitCommitHashRequired));
        }
        // Validate the whole selection before writing any files; format-patch silently skips merges.
        let hashes = commits.iter().map(|commit| {
            let hash = resolve_git_commit(&repo, commit)?;
            let parents = run_git(&repo, &["rev-list", "--parents", "-n", "1", &hash])?;
            if parents.split_whitespace().count() > 2 {
                return Err(coded!(PatchMergeUnsupported));
            }
            Ok(hash)
        }).collect::<Result<Vec<_>, String>>()?;
        let dir_arg = dir.to_string_lossy().to_string();
        let mut written = Vec::new();
        for (i, hash) in hashes.iter().enumerate() {
            let number = (i + 1).to_string();
            let out = run_git(
                &repo,
                &["format-patch", "-1", "--start-number", &number, "-o", &dir_arg, &hash],
            )?;
            written.extend(out.lines().filter(|l| !l.trim().is_empty()).map(str::to_string));
        }
        Ok(written)
    })
    .await
}

/// Saves the unstaged (or staged) changes of tracked files as one binary-safe patch file.
#[tauri::command]
pub async fn git_export_diff_patch(path: String, staged: bool, dest: String) -> Result<u64, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let dest = absolute(&dest)?;
        // Pin the format so user diff config (noprefix, textconv, submodule=log) cannot make the patch unapplicable.
        let mut args = vec![
            "diff", "--binary", "--no-color", "--no-ext-diff", "--no-textconv",
            "--src-prefix=a/", "--dst-prefix=b/", "--submodule=short",
        ];
        if staged {
            args.push("--cached");
        }
        let span = cmdlog::start(&repo.to_string_lossy(), &args);
        let output = match git_command().arg("-C").arg(&repo).args(&args).output() {
            Ok(o) => o,
            Err(e) => {
                span.finish(false);
                return Err(coded!(GitRunFailed, error = e));
            }
        };
        span.finish(output.status.success());
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        if output.stdout.is_empty() {
            return Err(coded!(PatchNoChanges));
        }
        std::fs::write(&dest, &output.stdout)
            .map_err(|e| coded!(GitPatchWriteFailed, error = e))?;
        Ok(output.stdout.len() as u64)
    })
    .await
}

#[derive(Serialize)]
pub struct PatchCheck {
    /// Every selected file is an mbox patch, so it is applied with `git am`.
    pub mailbox: bool,
    /// None for mailbox series: only git am can validate their successive trees.
    pub applies: Option<bool>,
    pub message: String,
}

fn check_patches(repo: &PathBuf, files: &[PathBuf], three_way: bool) -> Result<PatchCheck, String> {
    let mailbox_count = files.iter().filter(|f| is_mailbox(f)).count();
    if mailbox_count != 0 && mailbox_count != files.len() {
        return Err(coded!(PatchMixed));
    }
    if mailbox_count == files.len() {
        return Ok(PatchCheck { mailbox: true, applies: None, message: String::new() });
    }
    let mut args = vec!["apply", "--check", "--verbose"];
    if three_way {
        args.push("--3way");
    }
    let (applies, message) = match run_with_files(repo, &args, files) {
        Ok(out) => (true, out),
        Err(err) => (false, err),
    };
    Ok(PatchCheck { mailbox: false, applies: Some(applies), message })
}

#[tauri::command]
pub async fn git_patch_check(
    path: String,
    files: Vec<String>,
    three_way: bool,
) -> Result<PatchCheck, String> {
    spawn_git(move || check_patches(&PathBuf::from(&path), &patch_files(&files)?, three_way)).await
}

/// Mailbox patches become commits via `git am`; plain diffs change the working tree via `git apply`.
#[tauri::command]
pub async fn git_patch_apply(path: String, files: Vec<String>, three_way: bool) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let files = patch_files(&files)?;
        let check = check_patches(&repo, &files, false)?;
        let mut args = if check.mailbox { vec!["am"] } else { vec!["apply"] };
        if three_way {
            args.push("--3way");
        }
        run_with_files(&repo, &args, &files)
    })
    .await
}

#[derive(Serialize)]
pub struct AmState {
    pub in_progress: bool,
    pub subject: Option<String>,
    pub step: Option<u32>,
    pub total: Option<u32>,
    pub conflicted_paths: Vec<String>,
}

pub(crate) fn am_dir(repo: &PathBuf) -> Option<PathBuf> {
    let raw = run_git(repo, &["rev-parse", "--git-path", "rebase-apply"]).ok()?;
    let p = PathBuf::from(raw.trim_end_matches('\n'));
    let dir = if p.is_absolute() { p } else { repo.join(p) };
    // `rebase-apply` is shared with the apply backend of rebase; `applying` marks git am.
    dir.join("applying").exists().then_some(dir)
}

fn read_trimmed(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

#[tauri::command]
pub async fn git_am_state(path: String) -> Result<AmState, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let Some(dir) = am_dir(&repo) else {
            return Ok(AmState { in_progress: false, subject: None, step: None, total: None, conflicted_paths: Vec::new() });
        };
        let number = |name: &str| read_trimmed(&dir.join(name)).and_then(|s| s.parse().ok());
        Ok(AmState {
            in_progress: true,
            subject: read_trimmed(&dir.join("final-commit"))
                .and_then(|m| m.lines().next().map(str::to_string)),
            step: number("next"),
            total: number("last"),
            conflicted_paths: repo_conflicted_paths(&repo)?,
        })
    })
    .await
}

#[tauri::command]
pub async fn git_am_continue(path: String) -> Result<String, String> {
    spawn_git(move || run_git_merged_output(&PathBuf::from(&path), &["-c", "core.editor=true", "am", "--continue"])).await
}

#[tauri::command]
pub async fn git_am_skip(path: String) -> Result<String, String> {
    spawn_git(move || run_git_merged_output(&PathBuf::from(&path), &["am", "--skip"])).await
}

#[tauri::command]
pub async fn git_am_abort(path: String) -> Result<String, String> {
    spawn_git(move || run_git_merged_output(&PathBuf::from(&path), &["am", "--abort"])).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRepo(PathBuf);

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    impl TestRepo {
        fn new() -> Self {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!("l8git-patches-test-{}-{id}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            let repo = TestRepo(path);
            repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
            repo.git(&["config", "user.email", "test@example.com"]);
            repo.git(&["config", "user.name", "Test"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            repo.git(&["config", "core.autocrlf", "false"]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            run_git(&self.0, args).unwrap_or_else(|e| panic!("git {args:?} failed: {e}"))
        }

        fn commit(&self, file: &str, content: &str, message: &str) -> String {
            fs::write(self.0.join(file), content).unwrap();
            self.git(&["add", file]);
            self.git(&["commit", "-q", "-m", message]);
            self.git(&["rev-parse", "HEAD"]).trim().to_string()
        }

        fn path(&self) -> String {
            self.0.to_string_lossy().to_string()
        }
    }

    #[tokio::test]
    async fn exported_commit_applies_in_second_repo_with_am() {
        let src = TestRepo::new();
        let dst = TestRepo::new();
        let out = TestRepo::new();
        src.commit("a.txt", "base\n", "base");
        dst.commit("a.txt", "base\n", "base");
        let hash = src.commit("a.txt", "base\nchange\n", "add change");

        let files = git_format_patch(src.path(), vec![hash], out.path()).await.unwrap();
        assert_eq!(files.len(), 1);
        assert!(files[0].ends_with("0001-add-change.patch"), "{files:?}");

        let check = git_patch_check(dst.path(), files.clone(), false).await.unwrap();
        assert!(check.mailbox);
        assert_eq!(check.applies, None);
        git_patch_apply(dst.path(), files, false).await.unwrap();
        assert_eq!(dst.git(&["log", "-1", "--format=%s"]).trim(), "add change");
        assert_eq!(fs::read_to_string(dst.0.join("a.txt")).unwrap(), "base\nchange\n");
    }

    #[tokio::test]
    async fn dependent_mailbox_series_imports_and_undo_restores_the_start() {
        let src = TestRepo::new();
        let dst = TestRepo::new();
        let out = TestRepo::new();
        src.commit("a.txt", "base\n", "base");
        let start = dst.commit("a.txt", "base\n", "base");
        let first = src.commit("a.txt", "base\none\n", "first patch");
        let second = src.commit("a.txt", "base\none\ntwo\n", "second patch");
        let files = git_format_patch(src.path(), vec![first, second], out.path()).await.unwrap();

        let check = git_patch_check(dst.path(), files.clone(), false).await.unwrap();
        assert!(check.mailbox);
        assert_eq!(check.applies, None);
        assert_eq!(dst.git(&["rev-parse", "HEAD"]).trim(), start);
        assert_eq!(fs::read_to_string(dst.0.join("a.txt")).unwrap(), "base\n");
        git_patch_apply(dst.path(), files, false).await.unwrap();
        assert_eq!(fs::read_to_string(dst.0.join("a.txt")).unwrap(), "base\none\ntwo\n");

        let preview = crate::undo::undo_preview(dst.path()).await.unwrap();
        assert_eq!(preview.description_key, "undo.action.am");
        assert_eq!(preview.target_hash, start);
        crate::undo::undo_last_operation(dst.path(), Some(preview.snapshot)).await.unwrap();
        assert_eq!(dst.git(&["rev-parse", "HEAD"]).trim(), start);
        assert_eq!(fs::read_to_string(dst.0.join("a.txt")).unwrap(), "base\n");
    }

    #[tokio::test]
    async fn undo_am_keeps_a_previous_adjacent_import() {
        let src = TestRepo::new();
        let dst = TestRepo::new();
        let out = TestRepo::new();
        src.commit("a.txt", "base\n", "base");
        dst.commit("a.txt", "base\n", "base");
        let hashes = (1..=3).map(|n| src.commit("a.txt", &format!("{n}\n"), &format!("patch {n}"))).collect();
        let files = git_format_patch(src.path(), hashes, out.path()).await.unwrap();
        git_patch_apply(dst.path(), files[..1].to_vec(), false).await.unwrap();
        let previous = dst.git(&["rev-parse", "HEAD"]);
        git_patch_apply(dst.path(), files[1..].to_vec(), false).await.unwrap();

        let preview = crate::undo::undo_preview(dst.path()).await.unwrap();
        assert_eq!(preview.target_hash, previous.trim());
        crate::undo::undo_last_operation(dst.path(), Some(preview.snapshot)).await.unwrap();
        assert_eq!(dst.git(&["rev-parse", "HEAD"]), previous);
        assert_eq!(fs::read_to_string(dst.0.join("a.txt")).unwrap(), "1\n");
    }

    #[tokio::test]
    async fn merge_selection_is_rejected_before_any_patch_is_written() {
        let src = TestRepo::new();
        let out = TestRepo::new();
        src.commit("base.txt", "base\n", "base");
        src.git(&["checkout", "-q", "-b", "side"]);
        src.commit("side.txt", "side\n", "side");
        src.git(&["checkout", "-q", "main"]);
        let regular = src.commit("main.txt", "main\n", "main change");
        src.git(&["merge", "--no-ff", "-m", "merge side", "side"]);
        let merge = src.git(&["rev-parse", "HEAD"]).trim().to_string();

        for selection in [vec![merge.clone()], vec![regular, merge]] {
            let error = git_format_patch(src.path(), selection, out.path()).await.unwrap_err();
            assert!(error.contains("Merge commits cannot be exported"), "{error}");
            assert!(!fs::read_dir(&out.0).unwrap().any(|entry| entry.unwrap().path().extension().is_some_and(|ext| ext == "patch")));
        }
    }

    #[tokio::test]
    async fn plain_diff_export_is_checked_then_applied() {
        let src = TestRepo::new();
        let dst = TestRepo::new();
        let out = TestRepo::new();
        src.commit("a.txt", "one\n", "base");
        dst.commit("a.txt", "one\n", "base");
        fs::write(src.0.join("a.txt"), "two\n").unwrap();
        fs::write(src.0.join("bin.dat"), [0u8, 159, 146, 150, 0, 1]).unwrap();
        src.git(&["add", "bin.dat"]);

        let staged = out.0.join("staged.patch").to_string_lossy().to_string();
        git_export_diff_patch(src.path(), true, staged.clone()).await.unwrap();
        let unstaged = out.0.join("unstaged.patch").to_string_lossy().to_string();
        git_export_diff_patch(src.path(), false, unstaged.clone()).await.unwrap();

        let files = vec![staged, unstaged];
        let check = git_patch_check(dst.path(), files.clone(), false).await.unwrap();
        assert!(!check.mailbox);
        assert_eq!(check.applies, Some(true), "{}", check.message);
        git_patch_apply(dst.path(), files, false).await.unwrap();
        assert_eq!(fs::read_to_string(dst.0.join("a.txt")).unwrap(), "two\n");
        assert_eq!(fs::read(dst.0.join("bin.dat")).unwrap(), vec![0u8, 159, 146, 150, 0, 1]);
    }

    #[tokio::test]
    async fn invalid_patch_inputs_return_coded_errors() {
        let repo = TestRepo::new();
        let error = git_patch_check(repo.path(), Vec::new(), false).await.err().unwrap();
        assert!(error.contains("\"code\":\"patches.selectionEmpty\""), "{error}");
        let error = git_patch_check(repo.path(), vec!["relative.patch".into()], false).await.err().unwrap();
        assert!(error.contains("\"code\":\"patches.absolutePath\""), "{error}");
        let missing = repo.0.join("missing.patch").to_string_lossy().to_string();
        let error = git_patch_check(repo.path(), vec![missing], false).await.err().unwrap();
        assert!(error.contains("\"code\":\"patches.fileMissing\""), "{error}");
    }

    #[tokio::test]
    async fn empty_diff_export_fails() {
        let repo = TestRepo::new();
        repo.commit("a.txt", "a\n", "base");
        fs::write(repo.0.join("untracked.txt"), "new file\n").unwrap();
        let dest = repo.0.join("x.patch").to_string_lossy().to_string();
        let error = git_export_diff_patch(repo.path(), false, dest.clone()).await.unwrap_err();
        assert!(error.contains("\"code\":\"patches.noChanges\""), "{error}");
        assert!(!Path::new(&dest).exists());
    }

    #[tokio::test]
    async fn conflicting_am_reports_state_and_aborts() {
        let src = TestRepo::new();
        let dst = TestRepo::new();
        let out = TestRepo::new();
        src.commit("a.txt", "base\n", "base");
        let hash = src.commit("a.txt", "theirs\n", "theirs");
        let dst_head = dst.commit("a.txt", "ours\n", "ours");
        let files = git_format_patch(src.path(), vec![hash], out.path()).await.unwrap();

        let check = git_patch_check(dst.path(), files.clone(), false).await.unwrap();
        assert_eq!(check.applies, None);
        assert!(git_patch_apply(dst.path(), files, false).await.is_err());

        let state = git_am_state(dst.path()).await.unwrap();
        assert!(state.in_progress);
        assert_eq!(state.subject.as_deref(), Some("theirs"));
        assert_eq!((state.step, state.total), (Some(1), Some(1)));
        let rebase = crate::rebase::rebase_status(dst.path()).await.unwrap();
        assert!(!rebase.in_progress, "git am must not show up as a rebase");

        git_am_abort(dst.path()).await.unwrap();
        assert!(!git_am_state(dst.path()).await.unwrap().in_progress);
        assert_eq!(dst.git(&["rev-parse", "HEAD"]).trim(), dst_head);
        let undo = crate::undo::undo_preview(dst.path()).await.unwrap();
        assert_ne!(undo.description_key, "undo.action.am", "an aborted am must not be undoable");
    }
}
