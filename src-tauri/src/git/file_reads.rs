use super::{resolve_git_commit, run_git, WorktreePathGuard};
use std::fs::File;
use std::path::{Component, Path, PathBuf};

/// A selected file is a literal repository path, including whitespace and Unix
/// backslashes. Object reads never consult its live parent directories.
pub(crate) fn file_path(file: &str) -> Result<String, String> {
    let path = Path::new(file);
    if file.is_empty()
        || file.contains('\0')
        || super::is_git_metadata_path(path)
        || path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
    }
    let path = path
        .components()
        .filter_map(|part| match part {
            Component::Normal(part) => Some(part),
            _ => None,
        })
        .collect::<PathBuf>();
    if path.as_os_str().is_empty() {
        return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
    }
    let path = path.to_string_lossy().to_string();
    #[cfg(windows)]
    let path = path.replace('\\', "/");
    Ok(path)
}

pub(super) fn commit_revision(repo: &PathBuf, revision: &str) -> Result<String, String> {
    // Reject controls before the shared resolver trims input. A trailing LF is
    // invalid revision data rather than an invitation to select another source.
    if revision.chars().any(char::is_control) {
        return Err("Invalid commit revision".into());
    }
    resolve_git_commit(repo, revision)
}

#[cfg(unix)]
fn worktree_parent(
    guard: &WorktreePathGuard,
    relative: &Path,
    file: &str,
) -> Result<(File, std::ffi::CString), String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::OpenOptionsExt;

    if super::is_git_metadata_path(relative)
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
        return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
    }
    let absolute = guard.cwd.join(relative);
    let relative = absolute
        .strip_prefix(&guard.root)
        .map_err(|e| e.to_string())?;
    let mut parts = relative.components().peekable();
    let mut parent = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(&guard.root)
        .map_err(|e| format!("Cannot open worktree: {e}"))?;
    while let Some(part) = parts.next() {
        let name = std::ffi::CString::new(part.as_os_str().as_bytes())
            .map_err(|_| format!("__INVALID_WORKTREE_PATH__|{file}"))?;
        if parts.peek().is_none() {
            return Ok((parent, name));
        }
        // Each component is opened relative to an already-open directory.
        // Parent swaps cannot redirect a read through a new symlink.
        let fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            )
        };
        if fd < 0 {
            return Err(format!(
                "Cannot open parent of {file}: {}",
                std::io::Error::last_os_error()
            ));
        }
        parent = unsafe { File::from_raw_fd(fd) };
    }
    Err(format!("__INVALID_WORKTREE_PATH__|{file}"))
}

/// Open live file data without following symlink targets. Unix directory opens
/// anchor each parent; Windows verifies the opened handle's final containment.
pub(crate) fn open_worktree_file(repo: &PathBuf, file: &str) -> Result<File, String> {
    open_guarded_file(&WorktreePathGuard::new(repo)?, file)
}

pub(super) fn open_guarded_file(guard: &WorktreePathGuard, file: &str) -> Result<File, String> {
    open_guarded_path(guard, Path::new(&file_path(file)?), file)
}

pub(super) fn open_guarded_path(
    guard: &WorktreePathGuard,
    relative: &Path,
    file: &str,
) -> Result<File, String> {
    #[cfg(unix)]
    let input = {
        use std::os::fd::{AsRawFd, FromRawFd};
        let (parent, name) = worktree_parent(guard, relative, file)?;
        // NONBLOCK prevents a swapped-in FIFO from blocking before its type
        // can be checked. It has no effect on regular-file reads.
        let fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
            )
        };
        if fd < 0 {
            return Err(format!(
                "Cannot read {file}: {}",
                std::io::Error::last_os_error()
            ));
        }
        unsafe { File::from_raw_fd(fd) }
    };
    #[cfg(not(unix))]
    let input = {
        let relative = relative
            .to_str()
            .ok_or_else(|| format!("Cannot read non-UTF-8 path: {file}"))?;
        let absolute = guard.regular_file(relative)?;
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            // Open the reparse point itself if the leaf changed after checking.
            options.custom_flags(0x00200000); // FILE_FLAG_OPEN_REPARSE_POINT
        }
        options
            .open(absolute)
            .map_err(|e| format!("Cannot read {file}: {e}"))?
    };
    let metadata = input
        .metadata()
        .map_err(|e| format!("Cannot inspect {file}: {e}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(format!("Not a regular file: {file}"));
    }
    #[cfg(windows)]
    verify_windows_handle(&input, guard, file)?;
    Ok(input)
}

#[cfg(windows)]
fn verify_windows_handle(
    input: &File,
    guard: &WorktreePathGuard,
    file: &str,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::GetFinalPathNameByHandleW;

    let mut path = vec![0u16; 512];
    loop {
        let length = unsafe {
            GetFinalPathNameByHandleW(
                input.as_raw_handle(),
                path.as_mut_ptr(),
                path.len() as u32,
                0,
            )
        };
        if length == 0 {
            return Err(format!(
                "Cannot inspect {file}: {}",
                std::io::Error::last_os_error()
            ));
        }
        if (length as usize) >= path.len() {
            path.resize(length as usize + 1, 0);
            continue;
        }
        let path = PathBuf::from(std::ffi::OsString::from_wide(&path[..length as usize]));
        let relative = path
            .strip_prefix(&guard.root)
            .map_err(|_| format!("__INVALID_WORKTREE_PATH__|{file}"))?;
        if super::is_git_metadata_path(relative) {
            return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
        }
        return Ok(());
    }
}

/// Git represents a symlink by its target text. Read that text without opening
/// the target; this also supports previews of links pointing outside the repo.
pub(crate) fn worktree_link_text(repo: &PathBuf, file: &str) -> Result<Vec<u8>, String> {
    guarded_link_text(&WorktreePathGuard::new(repo)?, file)
}

pub(super) fn guarded_link_text(guard: &WorktreePathGuard, file: &str) -> Result<Vec<u8>, String> {
    guarded_link_path(guard, Path::new(&file_path(file)?), file)
}

pub(super) fn guarded_link_path(
    guard: &WorktreePathGuard,
    relative: &Path,
    file: &str,
) -> Result<Vec<u8>, String> {
    #[cfg(unix)]
    {
        use std::os::fd::AsRawFd;
        let (parent, name) = worktree_parent(guard, relative, file)?;
        let mut bytes = vec![0u8; 256];
        loop {
            let length = unsafe {
                libc::readlinkat(
                    parent.as_raw_fd(),
                    name.as_ptr(),
                    bytes.as_mut_ptr().cast(),
                    bytes.len(),
                )
            };
            if length < 0 {
                return Err(format!(
                    "Cannot read link {file}: {}",
                    std::io::Error::last_os_error()
                ));
            }
            if (length as usize) < bytes.len() {
                bytes.truncate(length as usize);
                return Ok(bytes);
            }
            let capacity = bytes
                .len()
                .checked_mul(2)
                .ok_or("Symlink target is too long")?;
            bytes.resize(capacity, 0);
        }
    }
    #[cfg(not(unix))]
    {
        let relative = relative
            .to_str()
            .ok_or_else(|| format!("Cannot read non-UTF-8 path: {file}"))?;
        let absolute = guard.path(relative)?;
        std::fs::read_link(absolute)
            .map(|target| target.as_os_str().as_encoded_bytes().to_vec())
            .map_err(|e| format!("Cannot read link {file}: {e}"))
    }
}

pub(super) fn git_with_input(
    repo: &PathBuf,
    args: &[&str],
    contents: Vec<u8>,
) -> Result<String, String> {
    use std::io::Write;
    use std::process::Stdio;
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    let mut child = match crate::cmd::git_command()
        .arg("-C")
        .arg(repo)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            span.finish(false);
            return Err(format!("failed to run git: {error}"));
        }
    };
    let mut stdin = child.stdin.take().ok_or("Git stdin is unavailable")?;
    let writer = std::thread::spawn(move || stdin.write_all(&contents));
    let output = child.wait_with_output();
    let written = writer.join().map_err(|_| "Git input writer panicked");
    let output = match output {
        Ok(output) => output,
        Err(error) => {
            span.finish(false);
            return Err(format!("failed to wait for git: {error}"));
        }
    };
    span.finish(output.status.success());
    if !output.status.success() {
        return Err(super::merged_failure_message(
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    written?.map_err(|e| format!("Cannot send file contents to Git: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Resolve an exact file to an immutable blob object. `None` selects stage zero
/// of the index; `Some` selects a pinned commit. Missing files remain distinct
/// from invalid revisions, conflicted index entries, and Git failures.
pub(crate) fn git_file_blob_oid(
    repo: &PathBuf,
    revision: Option<&str>,
    file: &str,
) -> Result<Option<String>, String> {
    let file = file_path(file)?;
    let raw = match revision {
        Some(revision) => {
            let commit = commit_revision(repo, revision)?;
            run_git(
                repo,
                &["--literal-pathspecs", "ls-tree", "-z", &commit, "--", &file],
            )?
        }
        None => run_git(
            repo,
            &[
                "--literal-pathspecs",
                "ls-files",
                "--stage",
                "-z",
                "--",
                &file,
            ],
        )?,
    };
    let mut oid = None;
    let mut unmerged = false;
    for record in raw.split_terminator('\0') {
        let (header, path) = record.split_once('\t').ok_or("Invalid Git file record")?;
        if path != file {
            return Err(format!("Not a file: {file}"));
        }
        let fields = header.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 3 {
            return Err("Invalid Git file record".into());
        }
        let hash = match revision {
            Some(_) if fields[1] == "blob" => fields[2],
            Some(_) => return Err(format!("Not a file: {file}")),
            None if fields[2] == "0" && fields[0] != "160000" => fields[1],
            None if fields[2] == "0" => return Err(format!("Not a file: {file}")),
            None => {
                unmerged = true;
                continue;
            }
        };
        if !matches!(hash.len(), 40 | 64) || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("Invalid Git blob object ID".into());
        }
        if oid.replace(hash.to_string()).is_some() {
            return Err("Git returned multiple entries for one file".into());
        }
    }
    if unmerged && oid.is_none() {
        return Err(format!("File has unmerged index entries: {file}"));
    }
    Ok(oid)
}
