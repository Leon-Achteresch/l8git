use super::{file_snapshot, repo_mutation_mutex, run_git, spawn_git, WorktreePathGuard};
use std::io::Write;
use std::path::PathBuf;
use std::process::Stdio;

const MAX_PATCH_BYTES: usize = 1_048_576;
const MAX_PATCH_HUNKS: usize = 1_024;

#[derive(Clone, Copy)]
enum Action {
    Stage,
    Unstage,
    Discard,
}

impl Action {
    fn parse(action: &str) -> Result<Self, String> {
        match action {
            "stage" => Ok(Self::Stage),
            "unstage" => Ok(Self::Unstage),
            "discard" => Ok(Self::Discard),
            _ => Err("Invalid reviewed patch action".into()),
        }
    }

    fn arguments(self, check: bool) -> Vec<&'static str> {
        let mut arguments = Vec::new();
        // On Unix, core.filemode=false otherwise makes Git replace a live
        // executable file with the index's nonexecutable mode during discard.
        #[cfg(unix)]
        if matches!(self, Self::Discard) {
            arguments.extend(["-c", "core.filemode=true"]);
        }
        arguments.extend(["apply", "--whitespace=nowarn"]);
        if !matches!(self, Self::Discard) {
            arguments.push("--cached");
        }
        if matches!(self, Self::Unstage) {
            arguments.push("--reverse");
        }
        if check {
            arguments.push("--check");
        }
        arguments
    }
}

fn invalid_patch(file: &str) -> String {
    format!("__INVALID_REVIEWED_PATCH__|{file}")
}

fn hunk_counts(line: &str) -> Option<(usize, usize)> {
    let (old, remainder) = line.strip_prefix("@@ -")?.split_once(" +")?;
    let (new, _) = remainder.split_once(" @@")?;
    let count = |range: &str| {
        let (start, count) = range.split_once(',').unwrap_or((range, "1"));
        start.parse::<usize>().ok()?;
        count.parse::<usize>().ok()
    };
    Some((count(old)?, count(new)?))
}

/// Accept the ordinary text patches emitted by the line-selection builder.
/// Count hunk payload before interpreting headers: a removed line can itself
/// read `-- /dev/null`, and must never be mistaken for a creation header.
pub(super) fn validate_text_batch(patches: &[String], file: &str) -> Result<String, String> {
    let invalid = || invalid_patch(file);
    if patches.is_empty() || patches.len() > MAX_PATCH_HUNKS {
        return Err(invalid());
    }
    let bytes = patches.iter().try_fold(0usize, |total, patch| {
        total
            .checked_add(patch.len())
            .filter(|total| *total <= MAX_PATCH_BYTES)
    });
    if bytes.is_none() {
        return Err(invalid());
    }

    let mut sections = 0usize;
    let mut hunks = 0usize;
    let mut changes = 0usize;
    let mut creates_or_deletes = false;
    for patch in patches {
        if !patch.starts_with("diff --git ") || !patch.ends_with('\n') || patch.contains('\0') {
            return Err(invalid());
        }
        let mut remaining = (0usize, 0usize);
        let mut section_hunks = 0usize;
        let mut old_header = false;
        let mut new_header = false;
        let mut old_null = false;
        let mut new_null = false;
        let mut mode_header = false;
        let mut in_section = false;
        for raw in patch.split_terminator('\n') {
            let line = raw.strip_suffix('\r').unwrap_or(raw);
            if line == "\\ No newline at end of file" {
                if section_hunks == 0 {
                    return Err(invalid());
                }
                continue;
            }
            if remaining != (0, 0) {
                let (old, new) = match raw.as_bytes().first() {
                    Some(b' ') => (1, 1),
                    Some(b'-') => {
                        changes += 1;
                        (1, 0)
                    }
                    Some(b'+') => {
                        changes += 1;
                        (0, 1)
                    }
                    _ => return Err(invalid()),
                };
                remaining.0 = remaining.0.checked_sub(old).ok_or_else(invalid)?;
                remaining.1 = remaining.1.checked_sub(new).ok_or_else(invalid)?;
                continue;
            }
            if line.starts_with("diff --git ") {
                if in_section && section_hunks == 0 {
                    return Err(invalid());
                }
                sections += 1;
                in_section = true;
                if sections > MAX_PATCH_HUNKS {
                    return Err(invalid());
                }
                section_hunks = 0;
                old_header = false;
                new_header = false;
                old_null = false;
                new_null = false;
                mode_header = false;
            } else if let Some(path) = line.strip_prefix("--- ") {
                if old_header || section_hunks > 0 {
                    return Err(invalid());
                }
                old_header = true;
                old_null = path == "/dev/null";
                creates_or_deletes |= old_null;
            } else if let Some(path) = line.strip_prefix("+++ ") {
                if new_header || section_hunks > 0 {
                    return Err(invalid());
                }
                new_header = true;
                new_null = path == "/dev/null";
                creates_or_deletes |= new_null;
            } else if let Some(mode) = line
                .strip_prefix("new file mode ")
                .or_else(|| line.strip_prefix("deleted file mode "))
            {
                if mode_header || section_hunks > 0 || !matches!(mode, "100644" | "100755") {
                    return Err(invalid());
                }
                mode_header = true;
                creates_or_deletes = true;
            } else if line.starts_with("@@ ") {
                if !old_header || !new_header || (old_null && new_null) {
                    return Err(invalid());
                }
                remaining = hunk_counts(line).ok_or_else(invalid)?;
                if remaining == (0, 0) {
                    return Err(invalid());
                }
                section_hunks += 1;
                hunks += 1;
                if hunks > MAX_PATCH_HUNKS {
                    return Err(invalid());
                }
            } else {
                // This also rejects binary, rename/copy, combined diffs, blob
                // index metadata, and changes to an existing file's mode.
                return Err(invalid());
            }
        }
        if remaining != (0, 0) || section_hunks == 0 {
            return Err(invalid());
        }
    }
    // Git accepts repeated creation headers but keeps only the last contents.
    // Current creation/deletion selections have one file section and one hunk.
    if changes == 0 || (creates_or_deletes && (sections != 1 || hunks != 1)) {
        return Err(invalid());
    }
    Ok(patches.concat())
}

pub(super) fn git_input(
    repo: &PathBuf,
    arguments: &[&str],
    input: &str,
) -> Result<Vec<u8>, String> {
    let span = crate::cmdlog::start(&repo.to_string_lossy(), arguments);
    let mut child = match crate::cmd::git_command()
        .arg("-C")
        .arg(repo)
        .args(arguments)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            span.finish(false);
            return Err(error.to_string());
        }
    };
    let mut stdin = child.stdin.take().ok_or("Git input unavailable")?;
    let bytes = input.as_bytes().to_vec();
    let writer = std::thread::spawn(move || stdin.write_all(&bytes));
    let output = child.wait_with_output();
    let written = writer.join().map_err(|_| "Git input writer panicked");
    let output = match output {
        Ok(output) => output,
        Err(error) => {
            span.finish(false);
            return Err(error.to_string());
        }
    };
    span.finish(output.status.success());
    if !output.status.success() {
        return Err(super::merged_failure_message(
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    written?.map_err(|error| error.to_string())?;
    Ok(output.stdout)
}

pub(super) fn validate_numstat(output: &[u8], file: &str) -> Result<(), String> {
    let invalid = || invalid_patch(file);
    if output.is_empty() || !output.ends_with(&[0]) {
        return Err(invalid());
    }
    for record in output[..output.len() - 1].split(|byte| *byte == 0) {
        let mut fields = record.splitn(3, |byte| *byte == b'\t');
        let count = |value: Option<&[u8]>| -> Option<usize> {
            std::str::from_utf8(value?).ok()?.parse().ok()
        };
        let added = count(fields.next()).ok_or_else(invalid)?;
        let deleted = count(fields.next()).ok_or_else(invalid)?;
        if fields.next() != Some(file.as_bytes()) || (added == 0 && deleted == 0) {
            return Err(invalid());
        }
    }
    Ok(())
}

fn apply_reviewed_hunks(
    repo: &PathBuf,
    file: &str,
    action: Action,
    patches: &[String],
    expected_fingerprint: &str,
) -> Result<(), String> {
    let lock = repo_mutation_mutex(repo)?;
    let _lock = lock.lock().map_err(|error| error.to_string())?;
    let guard = WorktreePathGuard::new(repo)?;
    guard.path(file)?;
    if expected_fingerprint.is_empty()
        || file_snapshot::fingerprint(repo, file)? != expected_fingerprint
    {
        return Err(format!("__FILE_CHANGED__|{file}"));
    }
    guard.regular_file(file)?;
    // Text selections do not edit symlink/gitlink blobs or conflict stages.
    let index = run_git(
        repo,
        &[
            "--literal-pathspecs",
            "ls-files",
            "--stage",
            "-z",
            "--",
            file,
        ],
    )?;
    for record in index.split_terminator('\0') {
        let (metadata, path) = record.split_once('\t').ok_or_else(|| invalid_patch(file))?;
        let fields = metadata.split(' ').collect::<Vec<_>>();
        if path != file
            || fields.len() != 3
            || !matches!(fields[0], "100644" | "100755")
            || fields[2] != "0"
        {
            return Err(invalid_patch(file));
        }
    }
    let patch = validate_text_batch(patches, file)?;
    for arguments in [
        &["apply", "--numstat", "-z"][..],
        &["apply", "--reverse", "--numstat", "-z"][..],
    ] {
        validate_numstat(&git_input(repo, arguments, &patch)?, file)?;
    }
    git_input(repo, &action.arguments(true), &patch)?;
    if file_snapshot::fingerprint(repo, file)? != expected_fingerprint {
        return Err(format!("__FILE_CHANGED__|{file}"));
    }
    // Without --reject/--3way, Git validates the complete input before writing.
    // One invocation also holds one index lock for the entire index update.
    git_input(repo, &action.arguments(false), &patch)?;
    Ok(())
}

/// Apply a displayed line selection in one checked repository operation.
#[tauri::command]
pub async fn git_apply_reviewed_hunks(
    path: String,
    file: String,
    action: String,
    patches: Vec<String>,
    expected_fingerprint: String,
) -> Result<(), String> {
    let action = Action::parse(&action)?;
    spawn_git(move || {
        apply_reviewed_hunks(
            &PathBuf::from(&path),
            &file,
            action,
            &patches,
            &expected_fingerprint,
        )
    })
    .await
}
