use crate::{cmd::local_git_command, cmdlog};
use serde::Serialize;
use std::path::Path;
use std::process::{Command, ExitStatus, Stdio};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::time::{timeout_at, Instant};

const NOTES_REF: &str = "refs/notes/commits";
const TEXT_LIMIT: usize = 64 * 1024;
const READ_BUDGET: Duration = Duration::from_secs(2);
const TIMEOUT_ERROR: &str = "Reading the local Git note timed out";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitNote {
    notes_ref: &'static str,
    #[serde(flatten)]
    outcome: NoteOutcome,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum NoteOutcome {
    Missing,
    Text { text: String },
    Unsupported,
    TooLarge,
}

async fn read_capped(pipe: impl AsyncRead + Unpin, limit: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    pipe.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("Unexpected Git notes output size".into());
    }
    Ok(bytes)
}

async fn bounded_output(
    command: Command,
    deadline: Instant,
    limit: usize,
) -> Result<(ExitStatus, Vec<u8>, Vec<u8>), String> {
    if Instant::now() >= deadline {
        return Err(TIMEOUT_ERROR.into());
    }
    timeout_at(deadline, async {
        let mut child = tokio::process::Command::from(command)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| error.to_string())?;
        let stdout = child.stdout.take().ok_or("Git stdout is unavailable")?;
        let stderr = child.stderr.take().ok_or("Git stderr is unavailable")?;
        tokio::try_join!(
            async { child.wait().await.map_err(|error| error.to_string()) },
            read_capped(stdout, limit),
            read_capped(stderr, 4096),
        )
    })
    .await
    .map_err(|_| TIMEOUT_ERROR.to_string())?
}

async fn git(
    repo: &Path,
    deadline: Instant,
    args: &[&str],
    limit: usize,
) -> Result<(ExitStatus, Vec<u8>, Vec<u8>), String> {
    let span = cmdlog::start(&repo.to_string_lossy(), args);
    let mut command = local_git_command();
    // The selected repository supplies the context, even if the app inherited
    // overrides from a shell or a Git subprocess.
    for variable in [
        "GIT_DIR",
        "GIT_COMMON_DIR",
        "GIT_WORK_TREE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_NAMESPACE",
    ] {
        command.env_remove(variable);
    }
    command.arg("--no-pager").arg("-C").arg(repo).args(args);
    let output = bounded_output(command, deadline, limit).await;
    span.finish(output.as_ref().is_ok_and(|(status, _, _)| status.success()));
    output
}

async fn checked(
    repo: &Path,
    deadline: Instant,
    args: &[&str],
    limit: usize,
) -> Result<Vec<u8>, String> {
    let (status, stdout, stderr) = git(repo, deadline, args, limit).await?;
    if !status.success() || !stderr.is_empty() {
        return Err("Could not read local Git notes data".into());
    }
    Ok(stdout)
}

async fn read_note(repo: &Path, commit: &str, deadline: Instant) -> Result<NoteOutcome, String> {
    if !repo.is_absolute()
        || !matches!(commit.len(), 40 | 64)
        || !commit.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Local Git notes require a repository and a full commit ID".into());
    }
    let context = checked(
        repo,
        deadline,
        &[
            "rev-parse",
            "--is-bare-repository",
            "--is-inside-work-tree",
            "--show-object-format",
            "--show-prefix",
        ],
        8192,
    )
    .await?;
    // The prefix is the final field, so a newline in a directory's name
    // cannot turn a nonempty prefix into an empty field.
    let mut lines = context.splitn(4, |byte| *byte == b'\n');
    let (bare, worktree, format, prefix) = (lines.next(), lines.next(), lines.next(), lines.next());
    if prefix != Some(b"\n")
        || !matches!(
            (format, commit.len()),
            (Some(b"sha1"), 40) | (Some(b"sha256"), 64)
        )
    {
        return Err("Invalid repository root or commit ID for Git notes".into());
    }
    // Explicit Git directories prevent upward discovery during object reads.
    // Git also verifies that "." is itself a Git directory in the bare case.
    let git_dir = match (bare, worktree) {
        (Some(b"true"), Some(b"false")) => "--git-dir=.",
        (Some(b"false"), Some(b"true")) => "--git-dir=.git",
        _ => return Err("Invalid repository root for Git notes".into()),
    };

    let commit = commit.to_ascii_lowercase();
    if checked(repo, deadline, &[git_dir, "cat-file", "-t", &commit], 128).await? != b"commit\n" {
        return Err("Git notes require a commit object".into());
    }
    let ref_option = format!("--ref={NOTES_REF}");
    let (status, stdout, stderr) = git(
        repo,
        deadline,
        &[git_dir, "notes", &ref_option, "list", &commit],
        128,
    )
    .await?;
    // Git distinguishes a missing mapping with exit 1 and this C-locale
    // diagnostic. Warnings (e.g. a broken ref) must not look like absence.
    let absent = format!("error: no note found for object {commit}.\n");
    if status.code() == Some(1) && stdout.is_empty() && stderr == absent.as_bytes() {
        return Ok(NoteOutcome::Missing);
    }
    let note = stdout
        .strip_suffix(b"\n")
        .filter(|oid| oid.len() == commit.len() && oid.iter().all(u8::is_ascii_hexdigit));
    let note = note
        .filter(|_| status.success() && stderr.is_empty())
        .and_then(|oid| std::str::from_utf8(oid).ok())
        .ok_or("Could not resolve the local Git note")?;
    if checked(repo, deadline, &[git_dir, "cat-file", "-t", note], 128).await? != b"blob\n" {
        return Ok(NoteOutcome::Unsupported);
    }
    let size = checked(repo, deadline, &[git_dir, "cat-file", "-s", note], 128).await?;
    let size = std::str::from_utf8(&size)
        .ok()
        .and_then(|size| size.trim_end().parse::<u64>().ok())
        .ok_or("Invalid Git note size")?;
    if size > TEXT_LIMIT as u64 {
        return Ok(NoteOutcome::TooLarge);
    }
    let raw = checked(
        repo,
        deadline,
        &[git_dir, "cat-file", "blob", note],
        TEXT_LIMIT,
    )
    .await?;
    if raw.len() as u64 != size {
        return Err("Git note size changed while reading".into());
    }
    match String::from_utf8(raw) {
        Ok(text)
            if !text
                .chars()
                .any(|ch| ch.is_control() && !matches!(ch, '\t' | '\r' | '\n')) =>
        {
            Ok(NoteOutcome::Text { text })
        }
        _ => Ok(NoteOutcome::Unsupported),
    }
}

#[tauri::command]
pub async fn repo_commit_note(path: String, commit: String) -> Result<CommitNote, String> {
    let outcome = read_note(Path::new(&path), &commit, Instant::now() + READ_BUDGET).await?;
    Ok(CommitNote {
        notes_ref: NOTES_REF,
        outcome,
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bounded_output_rejects_slow_and_oversized_children() {
        let mut slow = Command::new("sleep");
        slow.arg("10");
        let err = bounded_output(slow, Instant::now() + Duration::from_millis(30), 128)
            .await
            .unwrap_err();
        assert!(err.contains("timed out"), "{err}");

        for script in ["printf '%s' \"$1\"", "printf '%s' \"$1\" >&2"] {
            let mut noisy = Command::new("sh");
            noisy.args(["-c", script, "fixture", &"x".repeat(4097)]);
            assert!(bounded_output(noisy, Instant::now() + READ_BUDGET, 8)
                .await
                .unwrap_err()
                .contains("output size"));
        }
    }
}
