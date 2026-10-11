use super::{run_git, WorktreePathGuard};
use crate::cmd::git_command;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

fn frame(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}

fn changed(file: &str) -> String {
    format!("__FILE_CHANGED__|{file}")
}

fn source_entry(repo: &PathBuf, file: &str) -> Result<String, String> {
    match run_git(
        repo,
        &["--literal-pathspecs", "ls-tree", "-z", "HEAD", "--", file],
    ) {
        Ok(entry) => Ok(entry),
        Err(error) => {
            // An unborn branch has no HEAD tree. An unreadable existing tree
            // is an error and must not be mistaken for an empty source.
            let branch =
                run_git(repo, &["symbolic-ref", "--quiet", "HEAD"]).map_err(|_| error.clone())?;
            let output = git_command()
                .arg("-C")
                .arg(repo)
                .args(["show-ref", "--verify", "--quiet", branch.trim()])
                .output()
                .map_err(|failure| failure.to_string())?;
            if output.status.code() == Some(1) {
                Ok(String::new())
            } else {
                Err(error)
            }
        }
    }
}

fn mode(metadata: &fs::Metadata) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o7777
    }
    #[cfg(not(unix))]
    {
        u32::from(metadata.permissions().readonly())
    }
}

fn worktree_entry(
    hash: &mut Sha256,
    guard: &WorktreePathGuard,
    root: &Path,
    path: &Path,
    file: &str,
) -> Result<(), String> {
    frame(
        hash,
        path.strip_prefix(root)
            .map_err(|error| error.to_string())?
            .as_os_str()
            .as_encoded_bytes(),
    );
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            frame(hash, b"missing");
            return Ok(());
        }
        Err(error) => return Err(format!("Cannot inspect {file}: {error}")),
    };
    frame(hash, &mode(&metadata).to_le_bytes());
    if metadata.file_type().is_symlink() {
        frame(hash, b"symlink");
        let relative = path
            .strip_prefix(&guard.cwd)
            .map_err(|error| error.to_string())?;
        let target = super::file_reads::guarded_link_path(guard, relative, file)?;
        frame(hash, &target);
    } else if metadata.is_file() {
        frame(hash, b"file");
        // Frame the content length once and stream raw bytes. No Git filters,
        // text conversion, or large in-memory buffer runs for the snapshot.
        hash.update(metadata.len().to_le_bytes());
        let relative = path
            .strip_prefix(&guard.cwd)
            .map_err(|error| error.to_string())?;
        let mut input = super::file_reads::open_guarded_path(guard, relative, file)?;
        let mut buffer = [0u8; 64 * 1024];
        let mut length = 0u64;
        loop {
            let read = input
                .read(&mut buffer)
                .map_err(|error| format!("Cannot read {file}: {error}"))?;
            if read == 0 {
                break;
            }
            length = length
                .checked_add(read as u64)
                .ok_or_else(|| changed(file))?;
            hash.update(&buffer[..read]);
        }
        let after = input.metadata().map_err(|error| error.to_string())?;
        if length != metadata.len()
            || after.len() != metadata.len()
            || after.modified().ok() != metadata.modified().ok()
            || mode(&after) != mode(&metadata)
        {
            return Err(changed(file));
        }
    } else if metadata.is_dir() {
        frame(hash, b"directory");
        if path.join(".git").exists() {
            // Git clean with one -f preserves embedded repositories. Their
            // object database and working files are outside this deletion.
            frame(hash, b"protected-repository");
            return Ok(());
        }
        let mut entries = fs::read_dir(path)
            .map_err(|error| format!("Cannot read directory {file}: {error}"))?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        entries.sort_by(|a, b| {
            a.as_os_str()
                .as_encoded_bytes()
                .cmp(b.as_os_str().as_encoded_bytes())
        });
        frame(hash, &(entries.len() as u64).to_le_bytes());
        for entry in entries {
            worktree_entry(hash, guard, root, &entry, file)?;
        }
    } else {
        return Err(format!("Cannot snapshot special file: {file}"));
    }
    Ok(())
}

/// Opaque, content-based token for a destructive file preview. Includes both
/// restore sources and the complete selected worktree target, including link
/// targets and exact paths. Callers hold the repository mutation mutex.
pub(crate) fn fingerprint(repo: &PathBuf, file: &str) -> Result<String, String> {
    let guard = WorktreePathGuard::new(repo)?;
    let path = guard.path(file)?;
    let mut hash = Sha256::new();
    frame(&mut hash, b"l8git-file-snapshot-v1");
    frame(&mut hash, file.as_bytes());
    // Including nonignored untracked paths detects changes to ignore rules
    // that would change the set of files removed by Git clean.
    let index = run_git(
        repo,
        &[
            "--literal-pathspecs",
            "ls-files",
            "-v",
            "--stage",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            file,
        ],
    )?;
    frame(&mut hash, index.as_bytes());
    frame(&mut hash, source_entry(repo, file)?.as_bytes());
    let root = path.parent().ok_or_else(|| changed(file))?;
    worktree_entry(&mut hash, &guard, root, &path, file)?;
    Ok(format!("sha256-v1:{:x}", hash.finalize()))
}

/// Preserve the reviewed raw worktree across a sequence of commits. Unlike a
/// file/finish snapshot, this token deliberately excludes HEAD and the index.
/// Callers hold the worktree mutation mutex and separately pin those sources.
pub(super) fn split_worktree_fingerprint(
    repo: &PathBuf,
    files: &[String],
) -> Result<String, String> {
    let guard = WorktreePathGuard::new(repo)?;
    let mut files = files.iter().map(String::as_str).collect::<Vec<_>>();
    files.sort_unstable_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
    files.dedup();
    let paths = files
        .iter()
        .map(|file| guard.path(file))
        .collect::<Result<Vec<_>, _>>()?;
    let mut hash = Sha256::new();
    frame(&mut hash, b"l8git-split-worktree-v1");
    frame(&mut hash, guard.cwd.as_os_str().as_encoded_bytes());
    frame(&mut hash, &(files.len() as u64).to_le_bytes());
    for (file, path) in files.iter().zip(paths) {
        frame(&mut hash, file.as_bytes());
        worktree_entry(&mut hash, &guard, &guard.cwd, &path, file)?;
        split_nested_revisions(&mut hash, &path)?;
    }
    Ok(format!("sha256-split-worktree-v1:{:x}", hash.finalize()))
}

// A whole directory can stage an embedded repository as a gitlink. The ordinary
// raw walker protects that repository's internals, so pin the nested HEAD that
// Git add actually records without including its object database in the token.
fn split_nested_revisions(hash: &mut Sha256, path: &Path) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Ok(());
    }
    if path.join(".git").exists() {
        frame(hash, path.as_os_str().as_encoded_bytes());
        frame(
            hash,
            run_git(
                &path.to_path_buf(),
                &["rev-parse", "--verify", "HEAD^{commit}"],
            )?
            .as_bytes(),
        );
        return Ok(());
    }
    let mut children = fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    children.sort_by(|a, b| {
        a.as_os_str()
            .as_encoded_bytes()
            .cmp(b.as_os_str().as_encoded_bytes())
    });
    for child in children {
        split_nested_revisions(hash, &child)?;
    }
    Ok(())
}

/// Content snapshot for a finish confirmation. This deliberately reads complete
/// binary contents; ordinary review summaries do not request this token. The
/// caller holds the repository mutation mutex. Git process count is independent
/// of the number of files: one guard, two pinned commits, and one bulk index read.
pub(crate) fn review_content_fingerprint(
    repo: &PathBuf,
    merge_base: &str,
    files: &[String],
) -> Result<String, String> {
    let guard = WorktreePathGuard::new(repo)?;
    let head = super::file_reads::commit_revision(repo, "HEAD")?;
    let base = super::file_reads::commit_revision(repo, merge_base)?;
    let mut files = files.iter().map(String::as_str).collect::<Vec<_>>();
    files.sort_unstable_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
    files.dedup();
    // Validate the complete selection before opening any worktree file.
    let paths = files
        .iter()
        .map(|file| guard.path(file))
        .collect::<Result<Vec<_>, _>>()?;

    let args = [
        "--literal-pathspecs",
        "ls-files",
        "-v",
        "--stage",
        "--others",
        "--exclude-standard",
        "-z",
    ];
    let span = super::cmdlog::start(&repo.to_string_lossy(), &args);
    let output = match git_command().arg("-C").arg(repo).args(args).output() {
        Ok(output) => output,
        Err(error) => {
            span.finish(false);
            return Err(format!("failed to read review index: {error}"));
        }
    };
    span.finish(output.status.success());
    if !output.status.success() {
        return Err(super::merged_failure_message(
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        ));
    }

    let mut hash = Sha256::new();
    frame(&mut hash, b"l8git-review-content-v1");
    frame(&mut hash, head.as_bytes());
    frame(&mut hash, base.as_bytes());
    // Keep raw NUL-delimited bytes, including index stages, modes, object IDs,
    // and non-UTF-8 names. Commit stages the whole worktree, so the entire index
    // and nonignored untracked path set belong to the confirmation.
    frame(&mut hash, &output.stdout);
    frame(&mut hash, &(files.len() as u64).to_le_bytes());
    for (file, path) in files.iter().zip(&paths) {
        frame(&mut hash, file.as_bytes());
        worktree_entry(&mut hash, &guard, &guard.cwd, path, file)?;
    }
    Ok(format!("sha256-review-v1:{:x}", hash.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRepo(PathBuf);

    impl TestRepo {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "l8git-review-content-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            let repo = Self(path);
            repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
            repo.git(&["config", "user.email", "test@example.com"]);
            repo.git(&["config", "user.name", "Test"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            repo.git(&["config", "core.autocrlf", "false"]);
            fs::write(repo.0.join("base.txt"), b"original\n").unwrap();
            repo.git(&["add", "base.txt"]);
            repo.git(&["commit", "-qm", "base"]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            run_git(&self.0, args).unwrap()
        }

        fn snapshot(&self, base: &str, files: &[&str]) -> String {
            review_content_fingerprint(
                &self.0,
                base,
                &files
                    .iter()
                    .map(|file| (*file).to_owned())
                    .collect::<Vec<_>>(),
            )
            .unwrap()
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn review_content_detects_same_length_text_edits() {
        let repo = TestRepo::new();
        fs::write(repo.0.join("base.txt"), b"changedA\n").unwrap();
        let first = repo.snapshot("HEAD", &["base.txt"]);
        fs::write(repo.0.join("base.txt"), b"changedB\n").unwrap();
        assert_ne!(first, repo.snapshot("HEAD", &["base.txt"]));
        fs::write(repo.0.join("base.txt"), b"changedA\n").unwrap();
        assert_eq!(first, repo.snapshot("HEAD", &["base.txt"]));
    }

    #[test]
    fn review_content_detects_index_flags_that_change_staging_behavior() {
        let repo = TestRepo::new();
        let initial = repo.snapshot("HEAD", &["base.txt"]);
        for (set, clear) in [
            ("--assume-unchanged", "--no-assume-unchanged"),
            ("--skip-worktree", "--no-skip-worktree"),
        ] {
            repo.git(&["update-index", set, "--", "base.txt"]);
            assert_ne!(
                initial,
                repo.snapshot("HEAD", &["base.txt"]),
                "index flag {set} belongs to the review"
            );
            repo.git(&["update-index", clear, "--", "base.txt"]);
            assert_eq!(initial, repo.snapshot("HEAD", &["base.txt"]));
        }
    }

    #[test]
    fn review_content_streams_binary_bytes_after_the_preview_prefix() {
        let repo = TestRepo::new();
        let mut bytes = vec![0; 2 * 1024 * 1024];
        fs::write(repo.0.join("large.bin"), &bytes).unwrap();
        let first = repo.snapshot("HEAD", &["large.bin"]);
        *bytes.last_mut().unwrap() = 1;
        fs::write(repo.0.join("large.bin"), &bytes).unwrap();
        assert_ne!(first, repo.snapshot("HEAD", &["large.bin"]));
    }

    #[test]
    fn review_content_includes_index_bytes_when_worktree_is_identical() {
        let repo = TestRepo::new();
        fs::write(repo.0.join("base.txt"), b"index A\n").unwrap();
        repo.git(&["add", "base.txt"]);
        fs::write(repo.0.join("base.txt"), b"working\n").unwrap();
        let first = repo.snapshot("HEAD", &["base.txt"]);
        fs::write(repo.0.join("base.txt"), b"index B\n").unwrap();
        repo.git(&["add", "base.txt"]);
        fs::write(repo.0.join("base.txt"), b"working\n").unwrap();
        assert_ne!(first, repo.snapshot("HEAD", &["base.txt"]));
    }

    #[test]
    fn review_content_pins_head_and_base_even_for_an_empty_file_selection() {
        let repo = TestRepo::new();
        let base = repo.git(&["rev-parse", "HEAD"]);
        let base = base.trim();
        let first = repo.snapshot(base, &[]);
        repo.git(&["commit", "--allow-empty", "-qm", "advance"]);
        let advanced = repo.snapshot(base, &[]);
        assert_ne!(first, advanced);
        assert_ne!(advanced, repo.snapshot("HEAD", &[]));
    }

    #[test]
    fn review_content_sorts_exact_literal_paths_without_expanding_globs() {
        let repo = TestRepo::new();
        fs::write(repo.0.join("odd[1].txt"), b"selected\n").unwrap();
        fs::write(repo.0.join("odd1.txt"), b"neighbor\n").unwrap();
        let first = repo.snapshot("HEAD", &["odd[1].txt", "base.txt"]);
        assert_eq!(first, repo.snapshot("HEAD", &["base.txt", "odd[1].txt"]));
        fs::write(repo.0.join("odd1.txt"), b"neighbor changed\n").unwrap();
        assert_eq!(first, repo.snapshot("HEAD", &["odd[1].txt", "base.txt"]));
        fs::write(repo.0.join("odd[1].txt"), b"selected changed\n").unwrap();
        assert_ne!(first, repo.snapshot("HEAD", &["odd[1].txt", "base.txt"]));
    }

    #[test]
    fn review_content_rejects_traversal_metadata_and_revision_options() {
        let repo = TestRepo::new();
        for file in ["../outside", ".git/config", ""] {
            assert!(review_content_fingerprint(&repo.0, "HEAD", &[file.to_owned()]).is_err());
        }
        for revision in ["--output=outside", "HEAD\n", "missing"] {
            assert!(
                review_content_fingerprint(&repo.0, revision, &["base.txt".to_owned()]).is_err()
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn review_content_captures_exact_names_link_targets_and_executable_modes() {
        use std::os::unix::fs::{symlink, PermissionsExt};

        let repo = TestRepo::new();
        let name = " spaced\tline\n\\name ";
        let path = repo.0.join(name);
        fs::write(&path, b"content").unwrap();
        let first = repo.snapshot("HEAD", &[name]);
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        assert_ne!(first, repo.snapshot("HEAD", &[name]));
        let link = repo.0.join("link");
        symlink("base.txt", &link).unwrap();
        let first = repo.snapshot("HEAD", &["link"]);
        fs::remove_file(&link).unwrap();
        symlink("different-target", &link).unwrap();
        assert_ne!(first, repo.snapshot("HEAD", &["link"]));
    }
}
