use super::{
    file_snapshot, patch_batch, repo_coordination_mutex, repo_mutation_mutex, run_git, spawn_git,
    WorktreePathGuard,
};
use crate::cmd::git_command;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Output;
use std::sync::atomic::{AtomicU64, Ordering};

const REVIEW_CHANGED: &str = "__SPLIT_REVIEW_CHANGED__";
const STAGING_CHANGED: &str = "__SPLIT_STAGING_CHANGED__";
const INVALID_SELECTION: &str = "__INVALID_SPLIT_SELECTION__";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitSplitSnapshot {
    pub head: Option<String>,
    pub branch: Option<String>,
    pub index_fingerprint: String,
    pub worktree_fingerprint: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommitSplitSelection {
    pub file: String,
    pub patches: Option<Vec<String>>,
}

#[derive(PartialEq, Eq)]
struct SourceState {
    head: Option<String>,
    branch: Option<String>,
    index_fingerprint: String,
}

fn frame(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}

fn git_output(repo: &PathBuf, args: &[&str], index: Option<&Path>) -> Result<Output, String> {
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    let mut command = git_command();
    command.arg("-C").arg(repo).args(args);
    if let Some(index) = index {
        command.env("GIT_INDEX_FILE", index);
    }
    let result = command.output();
    span.finish(result.as_ref().is_ok_and(|output| output.status.success()));
    result.map_err(|error| error.to_string())
}

fn success(output: Output) -> Result<Vec<u8>, String> {
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(super::merged_failure_message(
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        ))
    }
}

fn empty_index(repo: &PathBuf, index: Option<&Path>) -> Result<bool, String> {
    let output = git_output(
        repo,
        &[
            "diff",
            "--cached",
            "--no-ext-diff",
            "--no-textconv",
            "--quiet",
            "--exit-code",
            "--",
        ],
        index,
    )?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => success(output).map(|_| true),
    }
}

// Hash every logical index entry and its persistent flags, rather than stat
// caches which ordinary Git reads may refresh. Raw NUL records keep odd and
// non-UTF-8 names distinct; intent-to-add/skip/assume flags remain significant.
fn index_fingerprint(repo: &PathBuf) -> Result<String, String> {
    let entries = success(git_output(
        repo,
        &["ls-files", "--stage", "-v", "-z"],
        None,
    )?)?;
    let debug = success(git_output(repo, &["ls-files", "--debug", "-z"], None)?)?;
    let mut hash = Sha256::new();
    frame(&mut hash, b"l8git-split-index-v1");
    frame(&mut hash, &entries);
    let mut remaining = debug.as_slice();
    while !remaining.is_empty() {
        let end = remaining
            .iter()
            .position(|byte| *byte == 0)
            .ok_or(STAGING_CHANGED)?;
        frame(&mut hash, &remaining[..end]);
        remaining = &remaining[end + 1..];
        for field in 0..5 {
            let end = remaining
                .iter()
                .position(|byte| *byte == b'\n')
                .ok_or(STAGING_CHANGED)?;
            let line = &remaining[..end];
            remaining = &remaining[end + 1..];
            if field == 4 {
                let flags = line
                    .split(|byte| *byte == b'\t')
                    .find_map(|part| part.strip_prefix(b"flags: "))
                    .ok_or(STAGING_CHANGED)?;
                frame(&mut hash, flags.strip_suffix(b"\r").unwrap_or(flags));
            }
        }
    }
    Ok(format!("sha256-split-index-v1:{:x}", hash.finalize()))
}

fn one_record(output: Vec<u8>) -> Result<String, String> {
    let output = output.strip_suffix(b"\n").unwrap_or(&output);
    #[cfg(windows)]
    let output = output.strip_suffix(b"\r").unwrap_or(output);
    String::from_utf8(output.to_vec()).map_err(|error| error.to_string())
}

fn source_state(repo: &PathBuf) -> Result<SourceState, String> {
    let symbolic = git_output(repo, &["symbolic-ref", "--quiet", "--short", "HEAD"], None)?;
    let branch = match symbolic.status.code() {
        Some(0) => Some(one_record(symbolic.stdout)?),
        Some(1) => None,
        _ => {
            return Err(success(symbolic)
                .err()
                .unwrap_or_else(|| REVIEW_CHANGED.into()))
        }
    };
    let revision = git_output(
        repo,
        &["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
        None,
    )?;
    let head = if revision.status.success() {
        Some(one_record(revision.stdout)?)
    } else if let Some(branch) = &branch {
        let reference = format!("refs/heads/{branch}");
        let exists = git_output(repo, &["show-ref", "--verify", "--quiet", &reference], None)?;
        if exists.status.code() == Some(1) && revision.status.code() == Some(1) {
            None
        } else {
            return Err(REVIEW_CHANGED.into());
        }
    } else {
        return Err(REVIEW_CHANGED.into());
    };
    Ok(SourceState {
        head,
        branch,
        index_fingerprint: index_fingerprint(repo)?,
    })
}

fn operation_guard(repo: &PathBuf) -> Result<(), String> {
    if !run_git(repo, &["ls-files", "--unmerged", "-z"])?.is_empty() {
        return Err("__SPLIT_OPERATION_IN_PROGRESS__".into());
    }
    for marker in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "BISECT_START",
    ] {
        let path = one_record(success(git_output(
            repo,
            &["rev-parse", "--path-format=absolute", "--git-path", marker],
            None,
        )?)?)?;
        match fs::symlink_metadata(path) {
            Ok(_) => return Err("__SPLIT_OPERATION_IN_PROGRESS__".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

fn validate_files(repo: &PathBuf, files: &[String]) -> Result<(), String> {
    let guard = WorktreePathGuard::new(repo)?;
    let mut unique = HashSet::new();
    for file in files {
        guard.path(file)?;
        if !unique.insert(file) {
            return Err(INVALID_SELECTION.into());
        }
    }
    Ok(())
}

fn snapshot_locked(repo: &PathBuf, files: &[String]) -> Result<CommitSplitSnapshot, String> {
    validate_files(repo, files)?;
    operation_guard(repo)?;
    if !empty_index(repo, None)? {
        return Err(STAGING_CHANGED.into());
    }
    let before = source_state(repo)?;
    let worktree_fingerprint = file_snapshot::split_worktree_fingerprint(repo, files)?;
    let after = source_state(repo)?;
    if before.index_fingerprint != after.index_fingerprint || !empty_index(repo, None)? {
        return Err(STAGING_CHANGED.into());
    }
    if before.head != after.head || before.branch != after.branch {
        return Err(REVIEW_CHANGED.into());
    }
    Ok(CommitSplitSnapshot {
        head: after.head,
        branch: after.branch,
        index_fingerprint: after.index_fingerprint,
        worktree_fingerprint,
    })
}

fn expect_snapshot(
    actual: &CommitSplitSnapshot,
    expected: &CommitSplitSnapshot,
) -> Result<(), String> {
    if expected.index_fingerprint.is_empty() || expected.worktree_fingerprint.is_empty() {
        return Err(INVALID_SELECTION.into());
    }
    if actual.branch != expected.branch {
        return Err("__BRANCH_CHANGED__".into());
    }
    if actual.head != expected.head {
        return Err("__HEAD_CHANGED__".into());
    }
    if actual.index_fingerprint != expected.index_fingerprint {
        return Err(STAGING_CHANGED.into());
    }
    if actual.worktree_fingerprint != expected.worktree_fingerprint {
        return Err(REVIEW_CHANGED.into());
    }
    Ok(())
}

struct ScratchIndex {
    directory: PathBuf,
    index: PathBuf,
}
impl ScratchIndex {
    fn new(repo: &PathBuf, original: &Path) -> Result<Self, String> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let parent = original.parent().ok_or(INVALID_SELECTION)?;
        let directory = loop {
            let path = parent.join(format!(
                "l8git-split-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            match fs::create_dir(&path) {
                Ok(()) => break path,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error.to_string()),
            }
        };
        let scratch = Self {
            index: directory.join("index"),
            directory,
        };
        match fs::copy(original, &scratch.index) {
            // Git treats entries whose mtime is not older than the index file as
            // "racily clean" and re-reads them. A fresh copy mtime would hide a
            // same-size edit made in the same second as the original index write.
            Ok(_) => {
                let modified = fs::metadata(original)
                    .and_then(|metadata| metadata.modified())
                    .map_err(|error| error.to_string())?;
                fs::File::options()
                    .write(true)
                    .open(&scratch.index)
                    .and_then(|file| file.set_modified(modified))
                    .map_err(|error| error.to_string())?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                success(git_output(
                    repo,
                    &["read-tree", "--empty"],
                    Some(&scratch.index),
                )?)?;
            }
            Err(error) => return Err(error.to_string()),
        }
        Ok(scratch)
    }
}
impl Drop for ScratchIndex {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}

struct IndexLock {
    path: PathBuf,
    armed: bool,
}
impl Drop for IndexLock {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn index_path(repo: &PathBuf) -> Result<PathBuf, String> {
    let path = one_record(success(git_output(
        repo,
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
        None,
    )?)?)?;
    Ok(repo.join(path))
}

fn validate_selections(
    repo: &PathBuf,
    files: &[String],
    selections: &[CommitSplitSelection],
) -> Result<Vec<Option<String>>, String> {
    if selections.is_empty() {
        return Err(INVALID_SELECTION.into());
    }
    let guard = WorktreePathGuard::new(repo)?;
    let planned = files.iter().collect::<HashSet<_>>();
    let mut selected = HashSet::new();
    let mut patches = Vec::new();
    for selection in selections {
        if !planned.contains(&selection.file) || !selected.insert(&selection.file) {
            return Err(INVALID_SELECTION.into());
        }
        guard.path(&selection.file)?;
        let Some(input) = &selection.patches else {
            patches.push(None);
            continue;
        };
        guard.regular_file(&selection.file)?;
        let index = run_git(
            repo,
            &[
                "--literal-pathspecs",
                "ls-files",
                "--stage",
                "-z",
                "--",
                &selection.file,
            ],
        )?;
        for record in index.split_terminator('\0') {
            let (metadata, file) = record.split_once('\t').ok_or(INVALID_SELECTION)?;
            let parts = metadata.split(' ').collect::<Vec<_>>();
            if file != selection.file
                || parts.len() != 3
                || !matches!(parts[0], "100644" | "100755")
                || parts[2] != "0"
            {
                return Err(INVALID_SELECTION.into());
            }
        }
        let patch = patch_batch::validate_text_batch(input, &selection.file)?;
        for arguments in [
            &["apply", "--numstat", "-z"][..],
            &["apply", "--reverse", "--numstat", "-z"][..],
        ] {
            patch_batch::validate_numstat(
                &patch_batch::git_input(repo, arguments, &patch)?,
                &selection.file,
            )?;
        }
        patch_batch::git_input(
            repo,
            &["apply", "--cached", "--check", "--whitespace=nowarn"],
            &patch,
        )?;
        patches.push(Some(patch));
    }
    Ok(patches)
}

fn commit_group_locked(
    repo: &PathBuf,
    files: &[String],
    expected: &CommitSplitSnapshot,
    selections: &[CommitSplitSelection],
    message: &str,
    sign: Option<bool>,
) -> Result<CommitSplitSnapshot, String> {
    if message.lines().next().unwrap_or("").trim().is_empty() {
        return Err("__SPLIT_MESSAGE_REQUIRED__".into());
    }
    expect_snapshot(&snapshot_locked(repo, files)?, expected)?;
    let patches = validate_selections(repo, files, selections)?;
    let original = index_path(repo)?;
    let scratch = ScratchIndex::new(repo, &original)?;
    for (selection, patch) in selections.iter().zip(patches) {
        if let Some(patch) = patch {
            // The same stdin helper preserves raw bytes; only this isolated
            // Git process sees the temporary index.
            let mut child = git_command()
                .arg("-C")
                .arg(repo)
                .env("GIT_INDEX_FILE", &scratch.index)
                .args(["apply", "--cached", "--whitespace=nowarn"])
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|error| error.to_string())?;
            let mut input = child.stdin.take().ok_or("Git input unavailable")?;
            let writer = std::thread::spawn(move || input.write_all(patch.as_bytes()));
            let result = child.wait_with_output();
            let written = writer.join().map_err(|_| "Git input writer panicked")?;
            success(result.map_err(|error| error.to_string())?)?;
            written.map_err(|error| error.to_string())?;
        } else {
            success(git_output(
                repo,
                &["--literal-pathspecs", "add", "--", &selection.file],
                Some(&scratch.index),
            )?)?;
        }
    }
    if empty_index(repo, Some(&scratch.index))? {
        return Err("__SPLIT_NOTHING_STAGED__".into());
    }
    // Holding index.lock also prevents an external Git index writer from
    // entering between the final expectation check and the atomic install.
    // The app's locks span commit; independent editors/ref writers remain a
    // separate boundary and normal hooks retain their ordinary behavior.
    let lock_path = original.with_file_name(format!(
        "{}.lock",
        original
            .file_name()
            .ok_or(INVALID_SELECTION)?
            .to_string_lossy()
    ));
    let mut lock_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|error| error.to_string())?;
    let mut owned_lock = IndexLock {
        path: lock_path.clone(),
        armed: true,
    };
    lock_file
        .write_all(&fs::read(&scratch.index).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    if let Ok(metadata) = fs::metadata(&original) {
        lock_file
            .set_permissions(metadata.permissions())
            .map_err(|error| error.to_string())?;
    }
    lock_file.sync_all().map_err(|error| error.to_string())?;
    expect_snapshot(&snapshot_locked(repo, files)?, expected)?;
    drop(lock_file);
    fs::rename(&lock_path, &original).map_err(|error| error.to_string())?;
    owned_lock.armed = false;
    let mut arguments = vec!["commit"];
    match sign {
        Some(true) => arguments.push("-S"),
        Some(false) => arguments.push("--no-gpg-sign"),
        None => {}
    }
    arguments.extend(["-m", message.trim()]);
    // Never reset a failed hook/signing/commit: the explicit staged group is
    // retained for inspection, and any earlier groups remain committed.
    run_git(repo, &arguments)?;
    let next = source_state(repo)?;
    Ok(CommitSplitSnapshot {
        head: next.head,
        branch: next.branch,
        index_fingerprint: next.index_fingerprint,
        worktree_fingerprint: expected.worktree_fingerprint.clone(),
    })
}

#[tauri::command]
pub async fn git_commit_split_snapshot(
    path: String,
    files: Vec<String>,
) -> Result<CommitSplitSnapshot, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let mutation = repo_mutation_mutex(&repo)?;
        let _mutation = mutation.lock().map_err(|error| error.to_string())?;
        snapshot_locked(&repo, &files)
    })
    .await
}

#[tauri::command]
pub async fn git_commit_split_group_checked(
    path: String,
    files: Vec<String>,
    expected: CommitSplitSnapshot,
    selections: Vec<CommitSplitSelection>,
    message: String,
    sign: Option<bool>,
) -> Result<CommitSplitSnapshot, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let coordination = repo_coordination_mutex(&repo)?;
        let _coordination = coordination.lock().map_err(|error| error.to_string())?;
        let mutation = repo_mutation_mutex(&repo)?;
        let _mutation = mutation.lock().map_err(|error| error.to_string())?;
        commit_group_locked(&repo, &files, &expected, &selections, &message, sign)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    static TEST_NEXT: AtomicUsize = AtomicUsize::new(0);
    struct Repo(PathBuf);
    impl Repo {
        fn new(unborn: bool) -> Self {
            let path = std::env::temp_dir().join(format!(
                "l8git-split-transaction-{}-{}",
                std::process::id(),
                TEST_NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let repo = Self(path);
            repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
            repo.git(&["config", "user.name", "Scratch"]);
            repo.git(&["config", "user.email", "scratch@example.com"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            repo.git(&["config", "core.autocrlf", "false"]);
            repo.git(&["config", "core.hooksPath", ".git/hooks"]);
            if !unborn {
                repo.write("first.txt", b"first original\n");
                repo.write("later.txt", b"later original\n");
                repo.git(&["add", "--", "."]);
                repo.git(&["commit", "-qm", "base"]);
            }
            repo
        }
        fn path(&self) -> String {
            self.0.to_str().unwrap().to_owned()
        }
        fn git(&self, args: &[&str]) -> String {
            run_git(&self.0, args).unwrap()
        }
        fn write(&self, file: &str, bytes: &[u8]) {
            fs::write(self.0.join(file), bytes).unwrap();
        }
        fn index(&self) -> Vec<u8> {
            fs::read(index_path(&self.0).unwrap()).unwrap_or_default()
        }
        async fn snapshot(&self, files: &[&str]) -> CommitSplitSnapshot {
            git_commit_split_snapshot(self.path(), strings(files))
                .await
                .unwrap()
        }
        async fn commit(
            &self,
            files: &[&str],
            expected: &CommitSplitSnapshot,
            selections: Vec<CommitSplitSelection>,
        ) -> Result<CommitSplitSnapshot, String> {
            git_commit_split_group_checked(
                self.path(),
                strings(files),
                expected.clone(),
                selections,
                "reviewed group".into(),
                Some(false),
            )
            .await
        }
        #[cfg(unix)]
        fn script(&self, relative: &str, script: &str) {
            use std::os::unix::fs::PermissionsExt;
            let path = self.0.join(relative);
            fs::write(&path, script).unwrap();
            fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
        }
    }
    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn strings(files: &[&str]) -> Vec<String> {
        files.iter().map(|file| (*file).to_owned()).collect()
    }
    fn whole(file: &str) -> CommitSplitSelection {
        CommitSplitSelection {
            file: file.into(),
            patches: None,
        }
    }
    fn hunk(file: &str, old: &str, new: &str) -> CommitSplitSelection {
        CommitSplitSelection { file: file.into(), patches: Some(vec![format!("diff --git a/{file} b/{file}\n--- a/{file}\n+++ b/{file}\n@@ -1 +1 @@\n-{old}\n+{new}\n")]) }
    }

    #[tokio::test]
    async fn snapshot_empty_index_handles_empty_plans_and_unborn_branches() {
        let repo = Repo::new(true);
        let empty = repo.snapshot(&[]).await;
        assert_eq!(empty.head, None);
        assert_eq!(empty.branch.as_deref(), Some("main"));
        assert!(!empty.worktree_fingerprint.is_empty());
        repo.write("new.txt", b"new content\n");
        let snapshot = repo.snapshot(&["new.txt"]).await;
        let next = repo
            .commit(&["new.txt"], &snapshot, vec![whole("new.txt")])
            .await
            .unwrap();
        assert!(next.head.is_some());
        assert_eq!(next.worktree_fingerprint, snapshot.worktree_fingerprint);
        assert_eq!(repo.git(&["show", "HEAD:new.txt"]), "new content\n");
        assert_eq!(repo.git(&["status", "--porcelain"]), "");
    }

    #[tokio::test]
    async fn snapshot_refuses_staging_in_existing_and_unborn_repositories() {
        for unborn in [false, true] {
            let repo = Repo::new(unborn);
            repo.write("new.txt", b"staged selection\n");
            repo.git(&["add", "--", "new.txt"]);
            let before = repo.index();
            assert_eq!(
                git_commit_split_snapshot(repo.path(), strings(&["new.txt"]))
                    .await
                    .unwrap_err(),
                STAGING_CHANGED
            );
            assert_eq!(repo.index(), before);
        }
    }

    #[tokio::test]
    async fn commits_reordered_groups_with_one_original_raw_worktree_token() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        repo.write("later.txt", b"later reviewed\n");
        let files = ["first.txt", "later.txt"];
        let original = repo.snapshot(&files).await;
        let next = repo
            .commit(&files, &original, vec![whole("later.txt")])
            .await
            .unwrap();
        assert_ne!(next.head, original.head);
        assert_ne!(next.index_fingerprint, original.index_fingerprint);
        assert_eq!(next.worktree_fingerprint, original.worktree_fingerprint);
        assert_eq!(repo.git(&["show", "HEAD:first.txt"]), "first original\n");
        assert_eq!(repo.git(&["show", "HEAD:later.txt"]), "later reviewed\n");
        let final_snapshot = repo
            .commit(
                &files,
                &next,
                vec![hunk("first.txt", "first original", "first reviewed")],
            )
            .await
            .unwrap();
        assert_eq!(
            final_snapshot.worktree_fingerprint,
            original.worktree_fingerprint
        );
        assert_eq!(repo.git(&["status", "--porcelain"]), "");
        assert_eq!(repo.git(&["rev-list", "--count", "HEAD"]), "3\n");
    }

    #[tokio::test]
    async fn a_same_size_later_whole_file_edit_blocks_the_first_group_without_staging() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        repo.write("later.txt", b"later reviewedA\n");
        let files = ["first.txt", "later.txt"];
        let snapshot = repo.snapshot(&files).await;
        repo.write("later.txt", b"later reviewedB\n");
        let index = repo.index();
        assert_eq!(
            repo.commit(&files, &snapshot, vec![whole("first.txt")])
                .await
                .unwrap_err(),
            REVIEW_CHANGED
        );
        assert_eq!(repo.index(), index);
        assert_eq!(
            repo.git(&["rev-parse", "HEAD"]).trim(),
            snapshot.head.as_deref().unwrap()
        );
    }

    #[tokio::test]
    async fn a_later_binary_edit_blocks_the_next_group_and_preserves_the_first_commit() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        repo.write("binary.bin", b"\0reviewedA\xff");
        let files = ["first.txt", "binary.bin"];
        let snapshot = repo.snapshot(&files).await;
        let next = repo
            .commit(&files, &snapshot, vec![whole("first.txt")])
            .await
            .unwrap();
        repo.write("binary.bin", b"\0reviewedB\xff");
        let index = repo.index();
        assert_eq!(
            repo.commit(&files, &next, vec![whole("binary.bin")])
                .await
                .unwrap_err(),
            REVIEW_CHANGED
        );
        assert_eq!(repo.index(), index);
        assert_eq!(repo.git(&["rev-list", "--count", "HEAD"]), "2\n");
        assert_eq!(repo.git(&["show", "HEAD:first.txt"]), "first reviewed\n");
    }

    #[tokio::test]
    async fn concurrent_index_staging_is_preserved_on_preflight_failure() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        let snapshot = repo.snapshot(&["first.txt"]).await;
        repo.write("other.txt", b"other user's staged choice\n");
        repo.git(&["add", "--", "other.txt"]);
        let index = repo.index();
        assert_eq!(
            repo.commit(&["first.txt"], &snapshot, vec![whole("first.txt")])
                .await
                .unwrap_err(),
            STAGING_CHANGED
        );
        assert_eq!(repo.index(), index);
        assert_eq!(
            repo.git(&["diff", "--cached", "--name-only"]),
            "other.txt\n"
        );
    }

    #[tokio::test]
    async fn branch_and_head_drift_block_group_before_index_writes() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        let snapshot = repo.snapshot(&["first.txt"]).await;
        repo.git(&["checkout", "-qb", "other"]);
        let index = repo.index();
        assert_eq!(
            repo.commit(&["first.txt"], &snapshot, vec![whole("first.txt")])
                .await
                .unwrap_err(),
            "__BRANCH_CHANGED__"
        );
        assert_eq!(repo.index(), index);
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["commit", "--allow-empty", "-qm", "external head"]);
        let index = repo.index();
        assert_eq!(
            repo.commit(&["first.txt"], &snapshot, vec![whole("first.txt")])
                .await
                .unwrap_err(),
            "__HEAD_CHANGED__"
        );
        assert_eq!(repo.index(), index);
    }

    #[tokio::test]
    async fn invalid_later_patch_preserves_the_entire_original_index() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        repo.write("later.txt", b"later reviewed\n");
        let files = ["first.txt", "later.txt"];
        let snapshot = repo.snapshot(&files).await;
        let index = repo.index();
        let result = repo
            .commit(
                &files,
                &snapshot,
                vec![
                    hunk("first.txt", "first original", "first reviewed"),
                    hunk("later.txt", "wrong original", "later reviewed"),
                ],
            )
            .await;
        assert!(result.is_err());
        assert_eq!(repo.index(), index);
        assert_eq!(repo.git(&["diff", "--cached"]), "");
    }

    #[tokio::test]
    async fn rejects_unknown_duplicate_empty_and_implicit_rename_selections() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        let snapshot = repo.snapshot(&["first.txt"]).await;
        let index = repo.index();
        let cases = vec![vec![], vec![whole("later.txt")], vec![whole("first.txt"), whole("first.txt")], vec![CommitSplitSelection { file: "first.txt".into(), patches: Some(vec![]) }], vec![CommitSplitSelection { file: "first.txt".into(), patches: Some(vec!["diff --git a/later.txt b/first.txt\n--- a/later.txt\n+++ b/first.txt\n@@ -1 +1 @@\n-later original\n+first reviewed\n".into()]) }]];
        for selections in cases {
            assert!(repo
                .commit(&["first.txt"], &snapshot, selections)
                .await
                .is_err());
            assert_eq!(repo.index(), index);
        }
    }

    #[tokio::test]
    async fn whole_file_groups_support_rename_source_deletion_binary_and_detached_head() {
        let repo = Repo::new(false);
        repo.git(&["checkout", "--detach", "-q"]);
        fs::rename(repo.0.join("first.txt"), repo.0.join("renamed.txt")).unwrap();
        repo.write("binary.bin", b"\0binary\xff\n");
        let files = ["first.txt", "renamed.txt", "binary.bin"];
        let snapshot = repo.snapshot(&files).await;
        assert_eq!(snapshot.branch, None);
        let next = repo
            .commit(
                &files,
                &snapshot,
                vec![
                    whole("renamed.txt"),
                    whole("binary.bin"),
                    whole("first.txt"),
                ],
            )
            .await
            .unwrap();
        assert_eq!(next.branch, None);
        assert_eq!(next.worktree_fingerprint, snapshot.worktree_fingerprint);
        assert_eq!(repo.git(&["status", "--porcelain"]), "");
        let files = repo.git(&["ls-tree", "--name-only", "HEAD"]);
        assert!(!files.contains("first.txt"));
        assert!(files.contains("renamed.txt"));
        assert_eq!(
            success(git_output(&repo.0, &["show", "HEAD:binary.bin"], None).unwrap()).unwrap(),
            b"\0binary\xff\n"
        );
    }

    #[tokio::test]
    async fn intent_to_add_flag_drift_is_not_hidden_by_equal_blob_entries() {
        let repo = Repo::new(false);
        repo.write("empty.txt", b"");
        repo.git(&["add", "-N", "--", "empty.txt"]);
        let snapshot = repo.snapshot(&["empty.txt"]).await;
        repo.git(&["reset", "-q", "HEAD", "--", "empty.txt"]);
        assert_eq!(
            repo.commit(&["empty.txt"], &snapshot, vec![whole("empty.txt")])
                .await
                .unwrap_err(),
            STAGING_CHANGED
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn raw_mode_drift_blocks_preflight_and_whole_file_staging_preserves_selected_modes() {
        use std::os::unix::fs::PermissionsExt;
        let repo = Repo::new(false);
        repo.git(&["config", "core.filemode", "true"]);
        repo.write("first.txt", b"first reviewed\n");
        fs::set_permissions(repo.0.join("first.txt"), fs::Permissions::from_mode(0o755)).unwrap();
        let snapshot = repo.snapshot(&["first.txt"]).await;
        fs::set_permissions(repo.0.join("first.txt"), fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(
            repo.commit(&["first.txt"], &snapshot, vec![whole("first.txt")])
                .await
                .unwrap_err(),
            REVIEW_CHANGED
        );
        fs::set_permissions(repo.0.join("first.txt"), fs::Permissions::from_mode(0o755)).unwrap();
        repo.commit(&["first.txt"], &snapshot, vec![whole("first.txt")])
            .await
            .unwrap();
        assert!(repo
            .git(&["ls-tree", "HEAD", "--", "first.txt"])
            .starts_with("100755"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn whole_rename_with_newline_destination_and_whitespace_root_uses_exact_paths() {
        let mut repo = Repo::new(false);
        let exact = repo.0.with_file_name(format!(
            "{} \n",
            repo.0.file_name().unwrap().to_str().unwrap()
        ));
        fs::rename(&repo.0, &exact).unwrap();
        repo.0 = exact;
        let destination = "renamed \n.txt";
        fs::rename(repo.0.join("first.txt"), repo.0.join(destination)).unwrap();
        let files = ["first.txt", destination];
        let snapshot = repo.snapshot(&files).await;
        repo.commit(
            &files,
            &snapshot,
            vec![whole("first.txt"), whole(destination)],
        )
        .await
        .unwrap();
        assert_eq!(repo.git(&["status", "--porcelain"]), "");
        assert_eq!(
            repo.git(&["show", &format!("HEAD:{destination}")]),
            "first original\n"
        );
        assert!(!repo
            .git(&["ls-tree", "--name-only", "-z", "HEAD"])
            .split('\0')
            .any(|file| file == "first.txt"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn failing_clean_filter_does_not_install_a_partly_staged_scratch_index() {
        let repo = Repo::new(false);
        repo.write(".gitattributes", b"later.txt filter=fail\n");
        repo.git(&["config", "filter.fail.clean", "false"]);
        repo.git(&["config", "filter.fail.required", "true"]);
        repo.write("first.txt", b"first reviewed\n");
        repo.write("later.txt", b"later reviewed\n");
        let files = ["first.txt", "later.txt", ".gitattributes"];
        let snapshot = repo.snapshot(&files).await;
        let index = repo.index();
        assert!(repo
            .commit(
                &files,
                &snapshot,
                vec![whole("first.txt"), whole("later.txt")]
            )
            .await
            .is_err());
        assert_eq!(repo.index(), index);
        assert_eq!(repo.git(&["diff", "--cached"]), "");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn ordinary_clean_filters_run_and_raw_review_content_is_not_replaced_by_filtered_bytes() {
        let repo = Repo::new(false);
        repo.write(".gitattributes", b"filtered.txt filter=case\n");
        repo.git(&["config", "filter.case.clean", "tr a-z A-Z"]);
        repo.git(&["config", "filter.case.required", "true"]);
        repo.write("filtered.txt", b"reviewed lower case\n");
        let files = ["filtered.txt", ".gitattributes"];
        let snapshot = repo.snapshot(&files).await;
        let next = repo
            .commit(
                &files,
                &snapshot,
                vec![whole("filtered.txt"), whole(".gitattributes")],
            )
            .await
            .unwrap();
        assert_eq!(
            repo.git(&["show", "HEAD:filtered.txt"]),
            "REVIEWED LOWER CASE\n"
        );
        assert_eq!(
            fs::read(repo.0.join("filtered.txt")).unwrap(),
            b"reviewed lower case\n"
        );
        assert_eq!(next.worktree_fingerprint, snapshot.worktree_fingerprint);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn failed_hook_and_signing_keep_explicit_group_staging() {
        for signing in [false, true] {
            let repo = Repo::new(false);
            repo.write("first.txt", b"first reviewed\n");
            let snapshot = repo.snapshot(&["first.txt"]).await;
            if signing {
                repo.script(".git/failing-gpg", "#!/bin/sh\nexit 1\n");
                repo.git(&[
                    "config",
                    "gpg.program",
                    repo.0.join(".git/failing-gpg").to_str().unwrap(),
                ]);
                repo.git(&["config", "user.signingkey", "fixture-key"]);
            } else {
                repo.script(
                    ".git/hooks/pre-commit",
                    "#!/bin/sh\necho fixture-hook-rejected >&2\nexit 1\n",
                );
            }
            let result = git_commit_split_group_checked(
                repo.path(),
                strings(&["first.txt"]),
                snapshot.clone(),
                vec![whole("first.txt")],
                "reviewed".into(),
                Some(signing),
            )
            .await;
            assert!(result.is_err());
            assert_eq!(
                repo.git(&["rev-parse", "HEAD"]).trim(),
                snapshot.head.as_deref().unwrap()
            );
            assert_eq!(repo.git(&["show", ":first.txt"]), "first reviewed\n");
            assert_eq!(
                repo.git(&["diff", "--cached", "--name-only"]),
                "first.txt\n"
            );
            assert!(!index_path(&repo.0).unwrap().with_extension("lock").exists());
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn post_commit_content_changes_return_success_then_block_the_next_group() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        repo.write("later.txt", b"later reviewed\n");
        let files = ["first.txt", "later.txt"];
        let snapshot = repo.snapshot(&files).await;
        repo.script(
            ".git/hooks/post-commit",
            "#!/bin/sh\nprintf 'hook changed later\\n' > later.txt\n",
        );
        let next = repo
            .commit(&files, &snapshot, vec![whole("first.txt")])
            .await
            .unwrap();
        assert_eq!(next.worktree_fingerprint, snapshot.worktree_fingerprint);
        assert_ne!(next.head, snapshot.head);
        assert_eq!(
            repo.commit(&files, &next, vec![whole("later.txt")])
                .await
                .unwrap_err(),
            REVIEW_CHANGED
        );
        assert_eq!(repo.git(&["rev-list", "--count", "HEAD"]), "2\n");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn post_commit_staging_is_reported_and_kept_on_the_next_preflight() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        repo.write("later.txt", b"later reviewed\n");
        let files = ["first.txt", "later.txt"];
        let snapshot = repo.snapshot(&files).await;
        repo.script(
            ".git/hooks/post-commit",
            "#!/bin/sh\nprintf 'hook staging\\n' > extra.txt\ngit add -- extra.txt\n",
        );
        let next = repo
            .commit(&files, &snapshot, vec![whole("first.txt")])
            .await
            .unwrap();
        let index = repo.index();
        assert_eq!(
            repo.commit(&files, &next, vec![whole("later.txt")])
                .await
                .unwrap_err(),
            STAGING_CHANGED
        );
        assert_eq!(repo.index(), index);
        assert_eq!(
            repo.git(&["diff", "--cached", "--name-only"]),
            "extra.txt\n"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn post_commit_branch_switch_is_reported_in_the_successful_reply() {
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        let snapshot = repo.snapshot(&["first.txt"]).await;
        repo.script(
            ".git/hooks/post-commit",
            "#!/bin/sh\ngit checkout -qb hook-branch\n",
        );
        let next = repo
            .commit(&["first.txt"], &snapshot, vec![whole("first.txt")])
            .await
            .unwrap();
        assert_eq!(next.branch.as_deref(), Some("hook-branch"));
        assert_eq!(
            repo.git(&["log", "-1", "--format=%s", "main"]),
            "reviewed group\n"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn l8git_staging_and_checkout_wait_until_normal_commit_hook_finishes() {
        struct ReleaseHookOnDrop(PathBuf);
        impl Drop for ReleaseHookOnDrop {
            fn drop(&mut self) {
                let _ = fs::write(&self.0, b"");
            }
        }
        let repo = Repo::new(false);
        repo.write("first.txt", b"first reviewed\n");
        let snapshot = repo.snapshot(&["first.txt"]).await;
        repo.git(&["branch", "other"]);
        repo.write("other.txt", b"other user's choice\n");
        repo.script(".git/hooks/pre-commit", "#!/bin/sh\ntouch .git/split-hook-entered\nwhile [ -d .git ] && [ ! -f .git/split-hook-release ]; do sleep 0.02; done\n");
        let _release_on_unwind = ReleaseHookOnDrop(repo.0.join(".git/split-hook-release"));
        let path = repo.path();
        let mut committing = tokio::spawn(git_commit_split_group_checked(
            path.clone(),
            strings(&["first.txt"]),
            snapshot,
            vec![whole("first.txt")],
            "reviewed".into(),
            Some(false),
        ));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !repo.0.join(".git/split-hook-entered").exists() {
            if std::time::Instant::now() >= deadline {
                repo.write(".git/split-hook-release", b"");
                panic!("commit hook did not start");
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        let mut staging = tokio::spawn(super::super::stage_files(
            path.clone(),
            strings(&["other.txt"]),
        ));
        let mut checkout = tokio::spawn(super::super::git_checkout(
            path,
            "other".into(),
            false,
            None,
            None,
        ));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), &mut staging)
                .await
                .is_err()
        );
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), &mut checkout)
                .await
                .is_err()
        );
        assert_eq!(repo.git(&["symbolic-ref", "--short", "HEAD"]), "main\n");
        assert_eq!(
            repo.git(&["diff", "--cached", "--name-only"]),
            "first.txt\n"
        );
        repo.write(".git/split-hook-release", b"");
        tokio::time::timeout(std::time::Duration::from_secs(10), &mut committing)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(10), &mut staging)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        // Git may correctly refuse checkout because the newly committed file
        // differs on the destination branch; it must always run after commit.
        let _ = tokio::time::timeout(std::time::Duration::from_secs(10), &mut checkout)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(repo.git(&["show", "main:first.txt"]), "first reviewed\n");
        assert_eq!(repo.git(&["show", "main:later.txt"]), "later original\n");
        assert!(!repo
            .git(&["ls-tree", "--name-only", "main"])
            .split('\n')
            .any(|name| name == "other.txt"));
        assert_eq!(repo.git(&["show", ":other.txt"]), "other user's choice\n");
    }
}
