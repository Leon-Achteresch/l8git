use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Stdio;

use serde::{Deserialize, Serialize};

use crate::git::{
    git_file_blob_oid, parse_worktree_list, repo_coordination_mutex, repo_mutation_mutex,
    resolve_git_commit, run_git, worktree_file_fingerprint, WorktreePathGuard,
};
use sha2::{Digest, Sha256};

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointFile {
    pub path: String,
    pub content: Option<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentReviewFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
    pub untracked: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentReviewSummary {
    pub base_branch: String,
    pub session_branch: String,
    pub merge_base: String,
    pub files: Vec<AgentReviewFile>,
    pub additions: u32,
    pub deletions: u32,
    pub commits: u32,
    pub uncommitted: u32,
    pub fingerprint: Option<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentReviewFileDiff {
    pub diff: Option<String>,
    pub untracked_plain: Option<String>,
    pub is_binary: bool,
    pub fingerprint: String,
}

fn parse_review_numstat(out: &str) -> Vec<AgentReviewFile> {
    let mut files = Vec::new();
    for part in out.split('\0').filter(|s| !s.is_empty()) {
        let mut fields = part.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        let path = fields.next().unwrap_or("");
        if path.is_empty() {
            continue;
        }
        files.push(AgentReviewFile {
            path: path.to_string(),
            additions: adds_s.parse().unwrap_or(0),
            deletions: dels_s.parse().unwrap_or(0),
            binary: adds_s == "-" || dels_s == "-",
            untracked: false,
        });
    }
    files
}

fn head_branch(repo: &PathBuf) -> Result<String, String> {
    let name = run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    if name.is_empty() || name == "HEAD" {
        return Err("Der Branch konnte nicht ermittelt werden (detached HEAD).".into());
    }
    Ok(name)
}

fn is_binary_bytes(content: &[u8]) -> bool {
    content.iter().take(8000).any(|&b| b == 0)
}

fn read_review_file(repo: &PathBuf, file: &str) -> Result<Vec<u8>, String> {
    let path = WorktreePathGuard::new(repo)?.path(file)?;
    let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return crate::git::worktree_link_text(repo, file);
    }
    let mut input = crate::git::open_worktree_file(repo, file)?;
    let mut bytes = Vec::new();
    input
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn read_summary(mut input: impl Read) -> std::io::Result<(u32, bool)> {
    let mut buffer = [0u8; 8000];
    let mut inspected = 0;
    let mut additions = 0u32;
    let mut last_byte = None;
    loop {
        let length = match input.read(&mut buffer) {
            Ok(0) => break,
            Ok(length) => length,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        let chunk = &buffer[..length];
        let probe_length = length.min(8000 - inspected);
        if chunk[..probe_length].contains(&0) {
            return Ok((0, true));
        }
        inspected += probe_length;
        additions =
            additions.wrapping_add(chunk.iter().filter(|&&byte| byte == b'\n').count() as u32);
        last_byte = chunk.last().copied();
    }
    // str::lines() counts CRLF as one separator and omits a final empty line.
    // Lossy UTF-8 conversion cannot change the number of ASCII LF bytes.
    if last_byte.is_some_and(|byte| byte != b'\n') {
        additions = additions.wrapping_add(1);
    }
    Ok((additions, false))
}

fn read_review_summary(repo: &PathBuf, file: &str) -> Result<(u32, bool), String> {
    let path = WorktreePathGuard::new(repo)?.path(file)?;
    let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        // Git may list an embedded repository as "nested/". Never traverse it.
        return Ok((0, true));
    }
    if metadata.file_type().is_symlink() {
        let text = crate::git::worktree_link_text(repo, file)?;
        return read_summary(text.as_slice()).map_err(|error| error.to_string());
    }
    read_summary(crate::git::open_worktree_file(repo, file)?).map_err(|error| error.to_string())
}

fn untracked_files(repo: &PathBuf) -> Result<Vec<AgentReviewFile>, String> {
    let out = run_git(repo, &["ls-files", "--others", "--exclude-standard", "-z"])?;
    out.split('\0')
        .filter(|s| !s.is_empty())
        .map(|rel| {
            let (additions, binary) = read_review_summary(repo, rel)?;
            Ok(AgentReviewFile {
                path: rel.to_string(),
                additions,
                deletions: 0,
                binary,
                untracked: true,
            })
        })
        .collect()
}

fn count_uncommitted(repo: &PathBuf) -> Result<u32, String> {
    run_git(repo, &["status", "--porcelain=v1", "--no-renames", "-z"])
        .map(|out| out.split('\0').filter(|s| !s.is_empty()).count() as u32)
}

fn build_summary(worktree: &PathBuf, base: &PathBuf) -> Result<AgentReviewSummary, String> {
    build_summary_options(worktree, base, false)
}

fn build_summary_options(
    worktree: &PathBuf,
    base: &PathBuf,
    include_fingerprint: bool,
) -> Result<AgentReviewSummary, String> {
    let lock = repo_mutation_mutex(worktree)?;
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    build_summary_locked(worktree, base, include_fingerprint)
}

/// The caller holds the worktree mutation mutex.
fn build_summary_locked(
    worktree: &PathBuf,
    base: &PathBuf,
    include_fingerprint: bool,
) -> Result<AgentReviewSummary, String> {
    let base_branch = head_branch(base)?;
    let session_branch = head_branch(worktree)?;
    if base_branch == session_branch {
        return Err("Basis-Branch und Session-Branch sind identisch.".into());
    }
    let base_head = resolve_git_commit(base, "HEAD")?;
    let session_head = resolve_git_commit(worktree, "HEAD")?;
    let merge_base = run_git(worktree, &["merge-base", &base_head, &session_head])?
        .trim()
        .to_string();
    if merge_base.is_empty() {
        return Err("Es gibt keinen gemeinsamen Vorfahren der beiden Branches.".into());
    }

    let numstat = run_git(
        worktree,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--numstat",
            "-z",
            "--no-renames",
            merge_base.as_str(),
        ],
    )?;
    let mut files = parse_review_numstat(&numstat);
    files.extend(untracked_files(worktree)?);
    files.sort_by(|a, b| a.path.cmp(&b.path));

    let fingerprint = if include_fingerprint {
        let paths = files
            .iter()
            .map(|file| file.path.clone())
            .collect::<Vec<_>>();
        let snapshot = crate::git::review_content_fingerprint(worktree, &merge_base, &paths)?;
        if resolve_git_commit(worktree, "HEAD")? != session_head
            || resolve_git_commit(base, "HEAD")? != base_head
            || head_branch(worktree)? != session_branch
            || head_branch(base)? != base_branch
        {
            return Err("agentReviewFinish.errors.reviewChanged".into());
        }
        Some(snapshot)
    } else {
        None
    };
    let additions = files.iter().map(|f| f.additions).sum();
    let deletions = files.iter().map(|f| f.deletions).sum();
    let commits = run_git(
        worktree,
        &["rev-list", "--count", &format!("{merge_base}..HEAD")],
    )?
    .trim()
    .parse()
    .map_err(|error| format!("Invalid commit count: {error}"))?;

    Ok(AgentReviewSummary {
        base_branch,
        session_branch,
        merge_base,
        files,
        additions,
        deletions,
        commits,
        uncommitted: count_uncommitted(worktree)?,
        fingerprint,
    })
}

fn diff_reports_binary(diff: &str) -> bool {
    diff.lines()
        .any(|line| line.starts_with("Binary files ") && line.ends_with(" differ"))
}

fn review_fingerprint(worktree: &PathBuf, merge_base: &str, file: &str) -> Result<String, String> {
    let mut digest = Sha256::new();
    for value in [
        "l8git-agent-review-v1".to_string(),
        merge_base.to_string(),
        resolve_git_commit(worktree, "HEAD")?,
        head_branch(worktree)?,
        worktree_file_fingerprint(worktree, file)?,
    ] {
        digest.update((value.len() as u64).to_le_bytes());
        digest.update(value.as_bytes());
    }
    Ok(format!("review-v1:{:x}", digest.finalize()))
}

fn build_file_diff(
    worktree: &PathBuf,
    merge_base: &str,
    file: &str,
) -> Result<AgentReviewFileDiff, String> {
    let lock = repo_mutation_mutex(worktree)?;
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let base = resolve_git_commit(worktree, merge_base)?;
    WorktreePathGuard::new(worktree)?.path(file)?;
    let fingerprint = review_fingerprint(worktree, &base, file)?;
    let tracked = !run_git(
        worktree,
        &[
            "--literal-pathspecs",
            "ls-files",
            "--cached",
            "-z",
            "--",
            file,
        ],
    )?
    .is_empty();
    // A staged deletion still belongs to the session diff against its base.
    let at_base = git_file_blob_oid(worktree, Some(&base), file)?.is_some();
    let result = if !tracked && !at_base {
        let bytes = read_review_file(worktree, file)?;
        let binary = is_binary_bytes(&bytes);
        AgentReviewFileDiff {
            diff: None,
            untracked_plain: (!binary).then(|| String::from_utf8_lossy(&bytes).to_string()),
            is_binary: binary,
            fingerprint: fingerprint.clone(),
        }
    } else {
        let diff = run_git(
            worktree,
            &[
                "--literal-pathspecs",
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--no-renames",
                &base,
                "--",
                file,
            ],
        )?;
        let binary = diff_reports_binary(&diff);
        AgentReviewFileDiff {
            diff: (!binary && !diff.trim().is_empty()).then_some(diff),
            untracked_plain: None,
            is_binary: binary,
            fingerprint: fingerprint.clone(),
        }
    };
    if review_fingerprint(worktree, &base, file)? != fingerprint {
        return Err(format!("__FILE_CHANGED__|{file}"));
    }
    Ok(result)
}

fn apply_review_patch(
    worktree: &PathBuf,
    patch: &str,
    arguments: &[&str],
) -> Result<String, String> {
    let mut logged_args = vec!["-c", "core.filemode=true", "apply"];
    logged_args.extend_from_slice(arguments);
    run_review_git_input(worktree, patch, &logged_args)
}

fn run_review_git_input(
    worktree: &PathBuf,
    input: &str,
    arguments: &[&str],
) -> Result<String, String> {
    let span = crate::cmdlog::start(&worktree.to_string_lossy(), arguments);
    let mut child = match crate::cmd::git_command()
        .arg("-C")
        .arg(worktree)
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
    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            span.finish(false);
            return Err(error.to_string());
        }
    };
    span.finish(output.status.success());
    let written = writer.join().map_err(|_| "Git input writer panicked")?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    written.map_err(|error| error.to_string())?;
    String::from_utf8(output.stdout).map_err(|error| error.to_string())
}

fn discard_review_change(
    worktree: &PathBuf,
    merge_base: &str,
    file: &str,
    expected_fingerprint: &str,
    patch: Option<&str>,
) -> Result<(), String> {
    let lock = repo_mutation_mutex(worktree)?;
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let guard = WorktreePathGuard::new(worktree)?;
    guard.path(file)?;
    let base = resolve_git_commit(worktree, merge_base)?;
    if expected_fingerprint.is_empty()
        || review_fingerprint(worktree, &base, file)? != expected_fingerprint
    {
        return Err(format!("__FILE_CHANGED__|{file}"));
    }
    if let Some(patch) = patch {
        guard.regular_file(file)?;
        // A hunk action changes file contents, never rename/copy metadata or
        // permissions. Implicit renames still need the two-sided check below.
        if patch.lines().any(|line| {
            [
                "rename from ",
                "rename to ",
                "copy from ",
                "copy to ",
                "old mode ",
                "new mode ",
            ]
            .iter()
            .any(|prefix| line.starts_with(prefix))
        }) {
            return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
        }
        // Git's forward parser reports only the destination of an implicit
        // rename; its reverse parser exposes the source. Require both to name
        // the displayed file, letting Git decode its own quoted/octal paths.
        // These --numstat calls parse without touching the worktree or index.
        for arguments in [
            &["--numstat", "-z"][..],
            &["--reverse", "--numstat", "-z"][..],
        ] {
            let numstat = apply_review_patch(worktree, patch, arguments)?;
            let paths: Vec<&str> = numstat
                .split('\0')
                .filter(|part| !part.is_empty())
                .map(|part| part.splitn(3, '\t').nth(2).unwrap_or(""))
                .collect();
            if paths.is_empty() || paths.iter().any(|path| *path != file) {
                return Err(format!("__INVALID_WORKTREE_PATH__|{file}"));
            }
        }
        apply_review_patch(worktree, patch, &["--check", "--whitespace=nowarn"])?;
        if review_fingerprint(worktree, &base, file)? != expected_fingerprint {
            return Err(format!("__FILE_CHANGED__|{file}"));
        }
        apply_review_patch(worktree, patch, &["--whitespace=nowarn"])?;
    } else {
        let tracked = !run_git(
            worktree,
            &[
                "--literal-pathspecs",
                "ls-files",
                "--cached",
                "-z",
                "--",
                file,
            ],
        )?
        .is_empty();
        let at_base = git_file_blob_oid(worktree, Some(&base), file)?.is_some();
        if tracked || at_base {
            // restore --staged removes session-added tracked files absent from
            // the source tree, and restores deleted files, without rewriting HEAD.
            run_git(
                worktree,
                &[
                    "--literal-pathspecs",
                    "restore",
                    &format!("--source={base}"),
                    "--staged",
                    "--worktree",
                    "--",
                    file,
                ],
            )?;
        } else {
            run_git(
                worktree,
                &["--literal-pathspecs", "clean", "-f", "-d", "--", file],
            )?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_review_discard_change(
    worktree_path: String,
    merge_base: String,
    file: String,
    expected_fingerprint: String,
    patch: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        discard_review_change(
            &PathBuf::from(worktree_path),
            &merge_base,
            &file,
            &expected_fingerprint,
            patch.as_deref(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn agent_review_summary(
    worktree_path: String,
    base_path: String,
    include_fingerprint: Option<bool>,
) -> Result<AgentReviewSummary, String> {
    tokio::task::spawn_blocking(move || {
        let worktree = PathBuf::from(worktree_path);
        let base = PathBuf::from(base_path);
        if include_fingerprint.unwrap_or(false) {
            build_summary_options(&worktree, &base, true)
        } else {
            build_summary(&worktree, &base)
        }
    })
    .await
    .map_err(|e| format!("Review-Aufgabe abgebrochen: {e}"))?
}

struct ReviewCommitExpectation<'a> {
    base_branch: &'a str,
    session_branch: &'a str,
    base_head: &'a str,
    session_head: &'a str,
    fingerprint: &'a str,
}

fn review_operation_active(repo: &PathBuf) -> Result<bool, String> {
    for marker in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "BISECT_START",
    ] {
        let path = run_git(
            repo,
            &["rev-parse", "--path-format=absolute", "--git-path", marker],
        )?;
        match std::fs::symlink_metadata(path.strip_suffix('\n').unwrap_or(&path)) {
            Ok(_) => return Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(false)
}

fn commit_review_checked(
    worktree: &PathBuf,
    base: &PathBuf,
    message: &str,
    expected: &ReviewCommitExpectation<'_>,
) -> Result<String, String> {
    let fail = |reason: &str| format!("agentReviewFinish.errors.{reason}");
    if message.lines().next().unwrap_or("").trim().is_empty() {
        return Err(fail("messageRequired"));
    }
    if expected.fingerprint.is_empty() {
        return Err(fail("reviewRequired"));
    }
    let base = base.canonicalize().map_err(|error| error.to_string())?;
    let worktree = worktree.canonicalize().map_err(|error| error.to_string())?;
    let coordination = repo_coordination_mutex(&base)?;
    let _coordination = coordination.lock().map_err(|error| error.to_string())?;
    let base_lock = repo_mutation_mutex(&base)?;
    let session_lock = repo_mutation_mutex(&worktree)?;
    if base == worktree
        || std::sync::Arc::ptr_eq(&base_lock, &session_lock)
        || expected.base_branch == expected.session_branch
    {
        return Err(fail("protectedWorktree"));
    }
    // Match checked cleanup's ordering to avoid deadlocks between worktrees.
    let (first, second) = if base < worktree {
        (base_lock, session_lock)
    } else {
        (session_lock, base_lock)
    };
    let _first = first.lock().map_err(|error| error.to_string())?;
    let _second = second.lock().map_err(|error| error.to_string())?;
    let entries = parse_worktree_list(&run_git(&base, &["worktree", "list", "--porcelain", "-z"])?);
    let session = entries
        .iter()
        .find(|entry| PathBuf::from(&entry.path).canonicalize().ok().as_ref() == Some(&worktree))
        .ok_or_else(|| fail("missingWorktree"))?;
    if session.is_main || session.is_locked || session.is_prunable {
        return Err(fail("protectedWorktree"));
    }
    if head_branch(&base)? != expected.base_branch {
        return Err(fail("wrongBaseBranch"));
    }
    if session.branch.as_deref() != Some(expected.session_branch)
        || head_branch(&worktree)? != expected.session_branch
    {
        return Err(fail("wrongSessionBranch"));
    }
    if resolve_git_commit(&base, "HEAD")? != expected.base_head
        || resolve_git_commit(&worktree, "HEAD")? != expected.session_head
    {
        return Err(fail("reviewChanged"));
    }
    if review_operation_active(&base)? || review_operation_active(&worktree)? {
        return Err(fail("operationInProgress"));
    }
    if !run_git(&worktree, &["ls-files", "--unmerged", "-z"])?.is_empty() {
        return Err(fail("conflicts"));
    }
    let summary = build_summary_locked(&worktree, &base, true)?;
    if summary.fingerprint.as_deref() != Some(expected.fingerprint) {
        return Err(fail("reviewChanged"));
    }
    if summary.uncommitted == 0 {
        return Err(fail("nothingToCommit"));
    }
    // The app cannot stage another selection or move either HEAD between this
    // final content check and the commit. Git still runs normal hooks/filters.
    run_git(&worktree, &["--literal-pathspecs", "add", "--", "."])?;
    run_git(&worktree, &["commit", "-m", message.trim()])?;
    resolve_git_commit(&worktree, "HEAD")
}

#[tauri::command]
pub async fn agent_review_commit_checked(
    worktree_path: String,
    base_path: String,
    message: String,
    expected_base_branch: String,
    expected_session_branch: String,
    expected_base_head: String,
    expected_session_head: String,
    expected_fingerprint: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        commit_review_checked(
            &PathBuf::from(worktree_path),
            &PathBuf::from(base_path),
            &message,
            &ReviewCommitExpectation {
                base_branch: &expected_base_branch,
                session_branch: &expected_session_branch,
                base_head: &expected_base_head,
                session_head: &expected_session_head,
                fingerprint: &expected_fingerprint,
            },
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

fn delete_review_branch_checked(
    repo: &PathBuf,
    branch: &str,
    expected_head: &str,
    base_branch: &str,
) -> Result<(), String> {
    let fail = |reason: &str| format!("agentReviewFinish.errors.{reason}");
    let coordination = repo_coordination_mutex(repo)?;
    let _coordination = coordination.lock().map_err(|error| error.to_string())?;
    let lock = repo_mutation_mutex(repo)?;
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let source_ref = format!("refs/heads/{branch}");
    let base_ref = format!("refs/heads/{base_branch}");
    run_git(repo, &["check-ref-format", &source_ref])?;
    run_git(repo, &["check-ref-format", &base_ref])?;
    if branch == base_branch || branch == "HEAD" {
        return Err(fail("protectedWorktree"));
    }
    if head_branch(repo)? != base_branch {
        return Err(fail("wrongBaseBranch"));
    }
    let worktrees =
        parse_worktree_list(&run_git(repo, &["worktree", "list", "--porcelain", "-z"])?);
    if worktrees
        .iter()
        .any(|entry| entry.branch.as_deref() == Some(branch))
    {
        return Err(fail("protectedWorktree"));
    }
    let source = resolve_git_commit(repo, &source_ref).map_err(|_| fail("reviewChanged"))?;
    if source != expected_head {
        return Err(fail("reviewChanged"));
    }
    // Ref aliases must never cause deletion of another branch's reference.
    if !run_git(repo, &["for-each-ref", "--format=%(symref)", &source_ref])?
        .trim()
        .is_empty()
    {
        return Err(fail("protectedWorktree"));
    }
    let base_head = resolve_git_commit(repo, &base_ref)?;
    run_git(repo, &["merge-base", "--is-ancestor", &source, &base_head])
        .map_err(|_| fail("branchNotIntegrated"))?;
    if review_operation_active(repo)? {
        return Err(fail("operationInProgress"));
    }
    if !run_git(repo, &["status", "--porcelain=v1", "-z"])?.is_empty() {
        return Err(fail("baseDirty"));
    }
    // Git locks both references and verifies their exact old OIDs before the
    // deletion commits. A concurrent move of either ref aborts the transaction.
    let transaction = format!(
        "start\nverify {base_ref} {base_head}\ndelete {source_ref} {source}\nprepare\ncommit\n"
    );
    run_review_git_input(repo, &transaction, &["update-ref", "--no-deref", "--stdin"])?;
    // Reference deletion already succeeded. Stale optional tracking settings
    // must not turn it into a failed mutation or invite another deletion.
    let _ = run_git(
        repo,
        &["config", "--remove-section", &format!("branch.{branch}")],
    );
    Ok(())
}

#[tauri::command]
pub async fn agent_review_delete_branch_checked(
    path: String,
    branch: String,
    expected_head: String,
    expected_base_branch: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        delete_review_branch_checked(
            &PathBuf::from(path),
            &branch,
            &expected_head,
            &expected_base_branch,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn agent_review_file_diff(
    worktree_path: String,
    merge_base: String,
    file: String,
) -> Result<AgentReviewFileDiff, String> {
    tokio::task::spawn_blocking(move || {
        let worktree = PathBuf::from(worktree_path);
        let base = merge_base.trim().to_string();
        let f = file;
        if base.is_empty() || f.is_empty() {
            return Err("Merge-Basis oder Dateipfad fehlt".into());
        }
        build_file_diff(&worktree, &base, &f)
    })
    .await
    .map_err(|e| format!("Review-Aufgabe abgebrochen: {e}"))?
}

fn restore_checkpoint_file(worktree: &PathBuf, file: &CheckpointFile) -> Result<(), String> {
    let relative = file.path.as_str();
    let absolute = WorktreePathGuard::new(worktree)?
        .regular_file(relative)
        .map_err(|error| format!("Ungültiger Dateipfad im Checkpoint: {relative}: {error}"))?;
    match &file.content {
        Some(content) => {
            if let Some(parent) = absolute.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Verzeichnis konnte nicht angelegt werden: {e}"))?;
            }
            std::fs::write(&absolute, content)
                .map_err(|e| format!("Datei konnte nicht wiederhergestellt werden: {e}"))
        }
        None => match std::fs::remove_file(&absolute) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Datei konnte nicht gelöscht werden: {e}")),
        },
    }
}

#[tauri::command]
pub async fn agent_review_restore_checkpoint_files(
    worktree_path: String,
    files: Vec<CheckpointFile>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let worktree = PathBuf::from(worktree_path);
        let lock = repo_mutation_mutex(&worktree)?;
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        let guard = WorktreePathGuard::new(&worktree)?;
        // Validate the entire checkpoint before changing its first file.
        for file in &files {
            guard.regular_file(&file.path)?;
        }
        for file in &files {
            restore_checkpoint_file(&worktree, file)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Restore-Aufgabe abgebrochen: {e}"))?
}

#[tauri::command]
pub async fn agent_review_branch_merged(path: String, branch: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let repo = PathBuf::from(path);
        let source = resolve_git_commit(&repo, &branch)?;
        let head = resolve_git_commit(&repo, "HEAD")?;
        let arguments = ["merge-base", "--is-ancestor", &source, &head];
        let span = crate::cmdlog::start(&repo.to_string_lossy(), &arguments);
        let output = match crate::cmd::git_command()
            .arg("-C")
            .arg(&repo)
            .args(arguments)
            .output()
        {
            Ok(output) => output,
            Err(error) => {
                span.finish(false);
                return Err(error.to_string());
            }
        };
        // Both exit codes are valid answers to the ancestry query.
        span.finish(matches!(output.status.code(), Some(0 | 1)));
        match output.status.code() {
            Some(0) => Ok(true),
            Some(1) => Ok(false),
            _ => Err(String::from_utf8_lossy(&output.stderr).trim().to_string()),
        }
    })
    .await
    .map_err(|e| format!("Review-Aufgabe abgebrochen: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRepo {
        root: PathBuf,
        base: PathBuf,
        worktree: PathBuf,
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn git(repo: &PathBuf, args: &[&str]) -> String {
        run_git(repo, args).unwrap_or_else(|e| panic!("git {args:?} failed: {e}"))
    }

    impl TestRepo {
        fn new() -> TestRepo {
            Self::with_names("base", "wt")
        }

        fn with_names(base_name: &str, worktree_name: &str) -> TestRepo {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let root = std::env::temp_dir().join(format!(
                "l8git-agent-review-{}-{}",
                std::process::id(),
                id
            ));
            let _ = fs::remove_dir_all(&root);
            let base = root.join(base_name);
            fs::create_dir_all(&base).unwrap();
            git(&base, &["-c", "init.defaultBranch=main", "init", "-q", "."]);
            git(&base, &["config", "user.email", "test@example.com"]);
            git(&base, &["config", "user.name", "Test"]);
            git(&base, &["config", "commit.gpgsign", "false"]);
            // Windows runners default to core.autocrlf=true; the fixtures compare bytes.
            git(&base, &["config", "core.autocrlf", "false"]);
            fs::write(base.join("f.txt"), "a\nb\nc\n").unwrap();
            git(&base, &["add", "."]);
            git(&base, &["commit", "-qm", "init"]);
            let worktree = root.join(worktree_name);
            git(
                &base,
                &[
                    "worktree",
                    "add",
                    "-q",
                    worktree.to_str().unwrap(),
                    "-b",
                    "agents/demo",
                ],
            );
            TestRepo {
                root,
                base,
                worktree,
            }
        }

        fn checked_commit(
            &self,
            summary: &AgentReviewSummary,
            base_head: &str,
            session_head: &str,
            message: &str,
        ) -> Result<String, String> {
            commit_review_checked(
                &self.worktree,
                &self.base,
                message,
                &ReviewCommitExpectation {
                    base_branch: &summary.base_branch,
                    session_branch: &summary.session_branch,
                    base_head,
                    session_head,
                    fingerprint: summary.fingerprint.as_deref().unwrap_or(""),
                },
            )
        }
    }

    #[test]
    fn checked_review_commit_commits_the_confirmed_session_in_one_operation() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nreviewed\nc\n").unwrap();
        fs::write(repo.worktree.join("new file.txt"), "new\n").unwrap();
        let base_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
        let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        let committed = repo
            .checked_commit(
                &summary,
                &base_head,
                &head,
                "feat: reviewed changes\n\nReviewed-by: User",
            )
            .unwrap();
        assert_ne!(committed, head);
        assert_eq!(resolve_git_commit(&repo.base, "HEAD").unwrap(), base_head);
        assert_eq!(
            git(&repo.worktree, &["show", "HEAD:f.txt"]),
            "a\nreviewed\nc\n"
        );
        assert_eq!(git(&repo.worktree, &["show", "HEAD:new file.txt"]), "new\n");
        assert!(git(&repo.worktree, &["status", "--porcelain=v1", "-z"]).is_empty());
    }

    #[tokio::test]
    async fn checked_review_commit_roundtrips_remote_camel_case_arguments() {
        use crate::server::state::{ConnectionHandle, DispatchCtx, ServerState, OUTBOX_CAPACITY};
        use std::sync::Arc;
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "remote reviewed\n").unwrap();
        let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        let state = ServerState::new("host".into(), [7u8; 32], vec![repo.root.clone()], None);
        let (tx, _rx) = tokio::sync::mpsc::channel(OUTBOX_CAPACITY);
        let ctx = DispatchCtx::new(
            state,
            Arc::new(ConnectionHandle::new(1, tx)),
            1,
            "agent_review_commit_checked",
        );
        let args = serde_json::json!({
            "worktreePath": repo.worktree, "basePath": repo.base, "message": "feat: remote review",
            "expectedBaseBranch": summary.base_branch, "expectedSessionBranch": summary.session_branch,
            "expectedBaseHead": resolve_git_commit(&repo.base, "HEAD").unwrap(),
            "expectedSessionHead": resolve_git_commit(&repo.worktree, "HEAD").unwrap(),
            "expectedFingerprint": summary.fingerprint,
        });
        let result =
            crate::server::dispatch::agents::dispatch("agent_review_commit_checked", args, &ctx)
                .await
                .unwrap()
                .unwrap();
        assert_eq!(
            result.as_str(),
            Some(resolve_git_commit(&repo.worktree, "HEAD").unwrap().as_str())
        );
        assert_eq!(
            git(&repo.worktree, &["show", "HEAD:f.txt"]),
            "remote reviewed\n"
        );
    }

    // Windows forbids trailing spaces and `*` in file names.
    #[cfg(not(windows))]
    #[tokio::test]
    async fn checked_commit_and_cleanup_preserve_trailing_spaces_in_worktree_paths() {
        let repo = TestRepo::with_names("base ", "session ");
        fs::write(repo.worktree.join("f.txt"), "reviewed\n").unwrap();
        let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        let head = repo
            .checked_commit(
                &summary,
                &resolve_git_commit(&repo.base, "HEAD").unwrap(),
                &resolve_git_commit(&repo.worktree, "HEAD").unwrap(),
                "reviewed",
            )
            .unwrap();
        git(&repo.base, &["merge", "--ff-only", "agents/demo"]);
        crate::git::git_worktree_remove_checked(
            repo.base.to_str().unwrap().into(),
            repo.worktree.to_str().unwrap().into(),
            "agents/demo".into(),
            head,
            "main".into(),
        )
        .await
        .unwrap();
        assert!(!repo.worktree.exists());
        assert_eq!(git(&repo.base, &["show", "HEAD:f.txt"]), "reviewed\n");
    }

    #[test]
    fn checked_review_commit_rejects_changed_text_and_binary_before_staging() {
        for (file, first, changed) in [
            ("f.txt", &b"a\nreviewed\nc\n"[..], &b"a\nmodified\nc\n"[..]),
            ("image.bin", &b"\0before"[..], &b"\0change"[..]),
        ] {
            let repo = TestRepo::new();
            fs::write(repo.worktree.join(file), first).unwrap();
            let base_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
            let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
            let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
            let index = git(&repo.worktree, &["ls-files", "--stage", "-z"]);
            fs::write(repo.worktree.join(file), changed).unwrap();
            assert_eq!(
                repo.checked_commit(&summary, &base_head, &head, "reviewed")
                    .unwrap_err(),
                "agentReviewFinish.errors.reviewChanged"
            );
            assert_eq!(git(&repo.worktree, &["ls-files", "--stage", "-z"]), index);
            assert_eq!(resolve_git_commit(&repo.worktree, "HEAD").unwrap(), head);
            assert_eq!(fs::read(repo.worktree.join(file)).unwrap(), changed);
        }
    }

    #[test]
    fn checked_review_commit_rejects_new_unreviewed_files_before_staging() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "reviewed\n").unwrap();
        let base_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
        let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        fs::write(repo.worktree.join("unexpected.txt"), "not reviewed\n").unwrap();
        let index = git(&repo.worktree, &["ls-files", "--stage", "-z"]);
        assert_eq!(
            repo.checked_commit(&summary, &base_head, &head, "reviewed")
                .unwrap_err(),
            "agentReviewFinish.errors.reviewChanged"
        );
        assert_eq!(git(&repo.worktree, &["ls-files", "--stage", "-z"]), index);
        assert_eq!(resolve_git_commit(&repo.worktree, "HEAD").unwrap(), head);
    }

    #[test]
    fn checked_review_commit_rejects_an_advanced_base_or_session_head() {
        for advance_base in [true, false] {
            let repo = TestRepo::new();
            fs::write(repo.worktree.join("f.txt"), "reviewed\n").unwrap();
            let base_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
            let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
            let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
            git(
                if advance_base {
                    &repo.base
                } else {
                    &repo.worktree
                },
                &["commit", "--allow-empty", "-qm", "advanced"],
            );
            let index = git(&repo.worktree, &["ls-files", "--stage", "-z"]);
            let before = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
            assert_eq!(
                repo.checked_commit(&summary, &base_head, &head, "reviewed")
                    .unwrap_err(),
                "agentReviewFinish.errors.reviewChanged"
            );
            assert_eq!(git(&repo.worktree, &["ls-files", "--stage", "-z"]), index);
            assert_eq!(resolve_git_commit(&repo.worktree, "HEAD").unwrap(), before);
        }
    }

    #[test]
    fn checked_review_commit_rejects_branch_switches_and_locked_sessions() {
        for change in ["base", "session", "lock"] {
            let repo = TestRepo::new();
            fs::write(repo.worktree.join("f.txt"), "reviewed\n").unwrap();
            let base_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
            let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
            let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
            match change {
                "base" => {
                    git(&repo.base, &["checkout", "-qb", "other-base"]);
                }
                "session" => {
                    git(&repo.worktree, &["checkout", "-qb", "agents/other"]);
                }
                _ => {
                    git(
                        &repo.base,
                        &["worktree", "lock", repo.worktree.to_str().unwrap()],
                    );
                }
            }
            let expected = match change {
                "base" => "wrongBaseBranch",
                "session" => "wrongSessionBranch",
                _ => "protectedWorktree",
            };
            assert_eq!(
                repo.checked_commit(&summary, &base_head, &head, "reviewed")
                    .unwrap_err(),
                format!("agentReviewFinish.errors.{expected}")
            );
            assert_eq!(resolve_git_commit(&repo.worktree, "HEAD").unwrap(), head);
            assert!(git(&repo.worktree, &["diff", "--cached", "--name-only"]).is_empty());
        }
    }

    #[test]
    fn checked_review_commit_blocks_operations_and_missing_subjects_before_staging() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "reviewed\n").unwrap();
        let base_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
        let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        let summary = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        assert_eq!(
            repo.checked_commit(&summary, &base_head, &head, "\n\nbody only")
                .unwrap_err(),
            "agentReviewFinish.errors.messageRequired"
        );
        let marker = git(
            &repo.base,
            &[
                "rev-parse",
                "--path-format=absolute",
                "--git-path",
                "MERGE_HEAD",
            ],
        );
        fs::write(marker.strip_suffix('\n').unwrap(), format!("{head}\n")).unwrap();
        assert_eq!(
            repo.checked_commit(&summary, &base_head, &head, "reviewed")
                .unwrap_err(),
            "agentReviewFinish.errors.operationInProgress"
        );
        assert_eq!(resolve_git_commit(&repo.worktree, "HEAD").unwrap(), head);
        assert!(git(&repo.worktree, &["diff", "--cached", "--name-only"]).is_empty());
    }

    #[test]
    fn checked_review_commit_requires_a_current_nonempty_content_fingerprint() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "reviewed\n").unwrap();
        let base_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
        let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        let mut summary = build_summary_options(&repo.worktree, &repo.base, false).unwrap();
        assert_eq!(
            repo.checked_commit(&summary, &base_head, &head, "reviewed")
                .unwrap_err(),
            "agentReviewFinish.errors.reviewRequired"
        );
        summary.fingerprint = Some("fabricated".into());
        assert_eq!(
            repo.checked_commit(&summary, &base_head, &head, "reviewed")
                .unwrap_err(),
            "agentReviewFinish.errors.reviewChanged"
        );
        assert_eq!(resolve_git_commit(&repo.worktree, "HEAD").unwrap(), head);
        assert!(git(&repo.worktree, &["diff", "--cached", "--name-only"]).is_empty());
    }

    fn integrated_removed_session() -> (TestRepo, String) {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "reviewed\n").unwrap();
        git(&repo.worktree, &["add", "."]);
        git(&repo.worktree, &["commit", "-qm", "reviewed"]);
        let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        git(&repo.base, &["merge", "--ff-only", "agents/demo"]);
        git(
            &repo.base,
            &["worktree", "remove", repo.worktree.to_str().unwrap()],
        );
        (repo, head)
    }

    #[test]
    fn checked_branch_cleanup_deletes_only_the_integrated_expected_reference() {
        let (repo, head) = integrated_removed_session();
        git(&repo.base, &["config", "branch.agents/demo.remote", "."]);
        git(
            &repo.base,
            &["config", "branch.agents/demo.merge", "refs/heads/main"],
        );
        delete_review_branch_checked(&repo.base, "agents/demo", &head, "main").unwrap();
        assert!(run_git(
            &repo.base,
            &["show-ref", "--verify", "refs/heads/agents/demo"]
        )
        .is_err());
        assert_eq!(resolve_git_commit(&repo.base, "HEAD").unwrap(), head);
        assert!(run_git(
            &repo.base,
            &["config", "--get", "branch.agents/demo.remote"]
        )
        .is_err());
        assert_eq!(
            fs::read_to_string(repo.base.join("f.txt")).unwrap(),
            "reviewed\n"
        );
    }

    #[test]
    fn checked_branch_cleanup_preserves_a_recreated_branch_even_if_already_integrated() {
        let (repo, reviewed_head) = integrated_removed_session();
        git(&repo.base, &["commit", "--allow-empty", "-qm", "new work"]);
        let new_head = resolve_git_commit(&repo.base, "HEAD").unwrap();
        git(&repo.base, &["branch", "-f", "agents/demo", &new_head]);
        assert_eq!(
            delete_review_branch_checked(&repo.base, "agents/demo", &reviewed_head, "main")
                .unwrap_err(),
            "agentReviewFinish.errors.reviewChanged"
        );
        assert_eq!(
            resolve_git_commit(&repo.base, "refs/heads/agents/demo").unwrap(),
            new_head
        );
        assert_eq!(resolve_git_commit(&repo.base, "HEAD").unwrap(), new_head);
    }

    #[test]
    fn checked_branch_cleanup_refuses_other_worktrees_and_unmerged_commits() {
        let repo = TestRepo::new();
        let initial = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        assert_eq!(
            delete_review_branch_checked(&repo.base, "agents/demo", &initial, "main").unwrap_err(),
            "agentReviewFinish.errors.protectedWorktree"
        );
        git(
            &repo.worktree,
            &["commit", "--allow-empty", "-qm", "not integrated"],
        );
        let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        git(
            &repo.base,
            &["worktree", "remove", repo.worktree.to_str().unwrap()],
        );
        assert_eq!(
            delete_review_branch_checked(&repo.base, "agents/demo", &head, "main").unwrap_err(),
            "agentReviewFinish.errors.branchNotIntegrated"
        );
        assert_eq!(
            resolve_git_commit(&repo.base, "refs/heads/agents/demo").unwrap(),
            head
        );
    }

    #[test]
    fn checked_branch_cleanup_rejects_changed_base_and_ref_aliases() {
        let (repo, head) = integrated_removed_session();
        git(&repo.base, &["checkout", "-qb", "release"]);
        assert_eq!(
            delete_review_branch_checked(&repo.base, "agents/demo", &head, "main").unwrap_err(),
            "agentReviewFinish.errors.wrongBaseBranch"
        );
        git(&repo.base, &["checkout", "main"]);
        git(
            &repo.base,
            &["symbolic-ref", "refs/heads/alias", "refs/heads/main"],
        );
        assert_eq!(
            delete_review_branch_checked(&repo.base, "alias", &head, "main").unwrap_err(),
            "agentReviewFinish.errors.protectedWorktree"
        );
        assert_eq!(
            resolve_git_commit(&repo.base, "refs/heads/main").unwrap(),
            head
        );
        assert_eq!(
            resolve_git_commit(&repo.base, "refs/heads/alias").unwrap(),
            head
        );
    }

    #[test]
    fn ref_transaction_aborts_deletion_if_the_destination_changed() {
        let (repo, head) = integrated_removed_session();
        git(
            &repo.base,
            &["commit", "--allow-empty", "-qm", "base moved"],
        );
        let before = resolve_git_commit(&repo.base, "HEAD").unwrap();
        let transaction = format!("start\nverify refs/heads/main {head}\ndelete refs/heads/agents/demo {head}\nprepare\ncommit\n");
        assert!(run_review_git_input(
            &repo.base,
            &transaction,
            &["update-ref", "--no-deref", "--stdin"]
        )
        .is_err());
        assert_eq!(resolve_git_commit(&repo.base, "HEAD").unwrap(), before);
        assert_eq!(
            resolve_git_commit(&repo.base, "refs/heads/agents/demo").unwrap(),
            head
        );
    }

    #[test]
    fn reviewed_hunk_rejects_rename_and_copy_sources_outside_the_selected_file() {
        for metadata in ["rename", "copy"] {
            let repo = TestRepo::new();
            fs::write(repo.worktree.join("victim.txt"), "unrelated content\n").unwrap();
            git(&repo.worktree, &["add", "victim.txt"]);
            git(&repo.worktree, &["commit", "-qm", "victim"]);
            let base = resolve_git_commit(&repo.base, "HEAD").unwrap();
            let fingerprint = review_fingerprint(&repo.worktree, &base, "selected.txt").unwrap();
            let patch = format!("diff --git a/victim.txt b/selected.txt\nsimilarity index 100%\n{metadata} from victim.txt\n{metadata} to selected.txt\n");
            // Git reports only the destination, demonstrating why numstat
            // alone cannot constrain the complete mutation to that path.
            assert_eq!(
                apply_review_patch(&repo.worktree, &patch, &["--numstat", "-z"]).unwrap(),
                "0\t0\tselected.txt\0"
            );
            assert_eq!(
                discard_review_change(
                    &repo.worktree,
                    &base,
                    "selected.txt",
                    &fingerprint,
                    Some(&patch)
                )
                .unwrap_err(),
                "__INVALID_WORKTREE_PATH__|selected.txt"
            );
            assert_eq!(
                fs::read_to_string(repo.worktree.join("victim.txt")).unwrap(),
                "unrelated content\n"
            );
            assert!(!repo.worktree.join("selected.txt").exists());
            assert!(git(&repo.worktree, &["status", "--porcelain=v1", "-z"]).is_empty());
        }
    }

    #[test]
    fn reviewed_hunk_checks_implicit_sources_with_gits_reverse_parser() {
        let sources = vec![
            ("victim.txt", "a/victim.txt"),
            ("victim space.txt", "\"a/victim space.txt\""),
            ("victim.txt", "\"a/\\166ictim.txt\""),
        ];
        #[cfg(unix)]
        let sources = {
            let mut sources = sources;
            sources.push(("victim\tname.txt", "\"a/victim\\tname.txt\""));
            sources
        };
        for (source, source_header) in sources {
            for misleading_header in [false, true] {
                for selected_exists in [false, true] {
                    let repo = TestRepo::new();
                    fs::write(repo.worktree.join(source), "old\n").unwrap();
                    if selected_exists {
                        fs::write(repo.worktree.join("selected.txt"), "old\n").unwrap();
                    }
                    git(&repo.worktree, &["add", "."]);
                    git(&repo.worktree, &["commit", "-qm", "review fixture"]);
                    let base = resolve_git_commit(&repo.base, "HEAD").unwrap();
                    let fingerprint =
                        review_fingerprint(&repo.worktree, &base, "selected.txt").unwrap();
                    let git_source = if misleading_header {
                        "a/selected.txt"
                    } else {
                        source_header
                    };
                    let patch = format!("diff --git {git_source} b/selected.txt\n--- {source_header}\n+++ b/selected.txt\n@@ -1 +1 @@\n-old\n+new\n");
                    assert_eq!(
                        apply_review_patch(&repo.worktree, &patch, &["--numstat", "-z"]).unwrap(),
                        "1\t1\tselected.txt\0"
                    );
                    assert_eq!(
                        apply_review_patch(
                            &repo.worktree,
                            &patch,
                            &["--reverse", "--numstat", "-z"]
                        )
                        .unwrap(),
                        format!("1\t1\t{source}\0")
                    );
                    assert_eq!(
                        discard_review_change(
                            &repo.worktree,
                            &base,
                            "selected.txt",
                            &fingerprint,
                            Some(&patch)
                        )
                        .unwrap_err(),
                        "__INVALID_WORKTREE_PATH__|selected.txt"
                    );
                    assert_eq!(
                        fs::read_to_string(repo.worktree.join(source)).unwrap(),
                        "old\n"
                    );
                    if selected_exists {
                        assert_eq!(
                            fs::read_to_string(repo.worktree.join("selected.txt")).unwrap(),
                            "old\n"
                        );
                    } else {
                        assert!(!repo.worktree.join("selected.txt").exists());
                    }
                    assert!(git(&repo.worktree, &["status", "--porcelain=v1", "-z"]).is_empty());
                }
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn reviewed_hunk_does_not_change_the_displayed_files_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let repo = TestRepo::new();
        let base = resolve_git_commit(&repo.base, "HEAD").unwrap();
        let before = fs::metadata(repo.worktree.join("f.txt"))
            .unwrap()
            .permissions()
            .mode();
        let fingerprint = review_fingerprint(&repo.worktree, &base, "f.txt").unwrap();
        let patch = "diff --git a/f.txt b/f.txt\nold mode 100644\nnew mode 100755\n";
        assert_eq!(
            discard_review_change(&repo.worktree, &base, "f.txt", &fingerprint, Some(patch))
                .unwrap_err(),
            "__INVALID_WORKTREE_PATH__|f.txt"
        );
        assert_eq!(
            fs::metadata(repo.worktree.join("f.txt"))
                .unwrap()
                .permissions()
                .mode(),
            before
        );
        assert!(git(&repo.worktree, &["status", "--porcelain=v1", "-z"]).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn reviewed_hunk_discard_preserves_the_existing_executable_bit() {
        use std::os::unix::fs::PermissionsExt;
        for filemode in ["true", "false"] {
            let repo = TestRepo::new();
            git(&repo.worktree, &["config", "core.filemode", filemode]);
            let base = resolve_git_commit(&repo.base, "HEAD").unwrap();
            let file = repo.worktree.join("f.txt");
            fs::write(&file, "a\nB\nc\n").unwrap();
            fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).unwrap();
            let index = git(&repo.worktree, &["ls-files", "--stage", "-z"]);
            let fingerprint = review_fingerprint(&repo.worktree, &base, "f.txt").unwrap();
            let patch = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n a\n-B\n+b\n c\n";
            discard_review_change(&repo.worktree, &base, "f.txt", &fingerprint, Some(patch)).unwrap();
            assert_eq!(fs::read(&file).unwrap(), b"a\nb\nc\n");
            assert_ne!(fs::metadata(&file).unwrap().permissions().mode() & 0o111, 0);
            assert_eq!(git(&repo.worktree, &["ls-files", "--stage", "-z"]), index);
        }
    }

    #[test]
    fn numstat_parsing_reads_counts_and_binary_marker() {
        let files = parse_review_numstat("3\t1\tsrc/a.rs\0-\t-\tlogo.png\0");
        assert_eq!(
            files,
            vec![
                AgentReviewFile {
                    path: "src/a.rs".into(),
                    additions: 3,
                    deletions: 1,
                    binary: false,
                    untracked: false,
                },
                AgentReviewFile {
                    path: "logo.png".into(),
                    additions: 0,
                    deletions: 0,
                    binary: true,
                    untracked: false,
                },
            ]
        );
    }

    struct MeteredReader<R> {
        inner: R,
        max_chunk: usize,
        bytes_read: u64,
        largest_buffer: usize,
    }

    impl<R: Read> MeteredReader<R> {
        fn new(inner: R, max_chunk: usize) -> Self {
            Self {
                inner,
                max_chunk,
                bytes_read: 0,
                largest_buffer: 0,
            }
        }
    }

    impl<R: Read> Read for MeteredReader<R> {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            self.largest_buffer = self.largest_buffer.max(buffer.len());
            let limit = buffer.len().min(self.max_chunk);
            let length = self.inner.read(&mut buffer[..limit])?;
            self.bytes_read += length as u64;
            Ok(length)
        }
    }

    #[test]
    fn streaming_summary_matches_lines_for_empty_lf_crlf_and_lossy_text() {
        let cases: &[&[u8]] = &[
            b"",
            b"\n",
            b"\n\n",
            b"\r",
            b"\r\n",
            b"one",
            b"one\n",
            b"one\n\n",
            b"one\r\ntwo\r\n",
            b"one\r\ntwo",
            b"one\rtwo\r",
            b"\xff\n\xfe\r\n",
        ];
        for &bytes in cases {
            for chunk in [1, 7, 8000] {
                let mut input = MeteredReader::new(bytes, chunk);
                assert_eq!(
                    read_summary(&mut input).unwrap(),
                    (String::from_utf8_lossy(bytes).lines().count() as u32, false),
                    "bytes {bytes:?}, read chunk {chunk}",
                );
                assert!(input.largest_buffer <= 8000);
            }
        }
    }

    #[test]
    fn streaming_summary_handles_a_long_line_without_growing_its_buffer() {
        let text = std::io::repeat(b'x')
            .take(4 * 1024 * 1024)
            .chain(&b"\nlast"[..]);
        let mut input = MeteredReader::new(text, 8000);
        assert_eq!(read_summary(&mut input).unwrap(), (2, false));
        assert_eq!(input.bytes_read, 4 * 1024 * 1024 + 5);
        assert_eq!(input.largest_buffer, 8000);
    }

    #[test]
    fn streaming_summary_limits_binary_detection_to_the_first_8000_bytes() {
        for offset in [0, 7999, 8000, 15999] {
            let mut bytes = vec![b'x'; 16000];
            bytes[offset] = 0;
            for chunk in [3, 8000] {
                assert_eq!(
                    read_summary(MeteredReader::new(bytes.as_slice(), chunk)).unwrap(),
                    if offset < 8000 { (0, true) } else { (1, false) },
                    "NUL offset {offset}, read chunk {chunk}",
                );
            }
        }
    }

    #[test]
    fn streaming_summary_does_not_read_the_sparse_tail_of_a_large_binary() {
        let mut prefix = vec![b'x'; 8000];
        prefix[7999] = 0;
        let mut sparse_tail =
            MeteredReader::new(std::io::repeat(0).take(8 * 1024 * 1024 * 1024), 8000);
        let mut input =
            MeteredReader::new(std::io::Cursor::new(prefix).chain(&mut sparse_tail), 8000);
        assert_eq!(read_summary(&mut input).unwrap(), (0, true));
        assert_eq!(input.bytes_read, 8000);
        assert_eq!(input.largest_buffer, 8000);
        drop(input);
        assert_eq!(sparse_tail.bytes_read, 0);
    }

    #[test]
    fn untracked_embedded_repository_is_non_textual_without_traversal() {
        let repo = TestRepo::new();
        let nested = repo.worktree.join("nested");
        fs::create_dir(&nested).unwrap();
        git(
            &nested,
            &["-c", "init.defaultBranch=main", "init", "-q", "."],
        );
        fs::write(nested.join("nested.txt"), "private nested contents\n").unwrap();
        git(&nested, &["add", "."]);
        git(
            &nested,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-qm",
                "nested",
            ],
        );
        assert_eq!(
            git(
                &repo.worktree,
                &["ls-files", "--others", "--exclude-standard", "-z"]
            ),
            "nested/\0"
        );
        let summary = build_summary(&repo.worktree, &repo.base).unwrap();
        assert_eq!(
            summary.files,
            vec![AgentReviewFile {
                path: "nested/".into(),
                additions: 0,
                deletions: 0,
                binary: true,
                untracked: true,
            }]
        );
        assert_eq!(summary.additions, 0);
    }

    #[cfg(unix)]
    #[test]
    fn streaming_untracked_symlink_summary_counts_target_text_not_target_contents() {
        let repo = TestRepo::new();
        let target = repo.root.join("outside\nfile.bin\n");
        fs::write(&target, b"\0private target\ncontents\n").unwrap();
        std::os::unix::fs::symlink(&target, repo.worktree.join("link")).unwrap();
        let files = untracked_files(&repo.worktree).unwrap();
        assert_eq!(
            files,
            vec![AgentReviewFile {
                path: "link".into(),
                additions: 2,
                deletions: 0,
                binary: false,
                untracked: true,
            }]
        );
    }

    #[test]
    fn summary_covers_committed_and_uncommitted_and_untracked_changes() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        git(&repo.worktree, &["add", "f.txt"]);
        git(&repo.worktree, &["commit", "-qm", "agent commit"]);
        fs::write(repo.worktree.join("f.txt"), "a\nB\nC\n").unwrap();
        fs::write(repo.worktree.join("new.txt"), "one\ntwo\n").unwrap();

        let summary = build_summary(&repo.worktree, &repo.base).unwrap();
        assert_eq!(summary.base_branch, "main");
        assert_eq!(summary.session_branch, "agents/demo");
        assert_eq!(summary.commits, 1);
        assert_eq!(summary.uncommitted, 2);
        let paths: Vec<&str> = summary.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["f.txt", "new.txt"]);
        assert_eq!(summary.additions, 4);
        assert_eq!(summary.deletions, 2);
        assert!(summary.files[1].untracked);
    }

    #[test]
    fn file_diff_spans_the_whole_session() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        git(&repo.worktree, &["add", "f.txt"]);
        git(&repo.worktree, &["commit", "-qm", "agent commit"]);
        fs::write(repo.worktree.join("f.txt"), "a\nB\nC\n").unwrap();

        let summary = build_summary(&repo.worktree, &repo.base).unwrap();
        let diff = build_file_diff(&repo.worktree, &summary.merge_base, "f.txt").unwrap();
        let text = diff.diff.unwrap();
        assert!(text.contains("+B"));
        assert!(text.contains("+C"));
        assert!(text.contains("-b"));
        assert!(text.contains("-c"));
    }

    #[test]
    fn file_diff_returns_plain_content_for_untracked_files() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("new.txt"), "hello\n").unwrap();
        let summary = build_summary(&repo.worktree, &repo.base).unwrap();
        let diff = build_file_diff(&repo.worktree, &summary.merge_base, "new.txt").unwrap();
        assert_eq!(diff.untracked_plain.as_deref(), Some("hello\n"));
        assert!(diff.diff.is_none());
    }

    #[test]
    fn finish_snapshot_detects_content_changes_with_identical_summary_counts() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        let first = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        fs::write(repo.worktree.join("f.txt"), "a\nD\nc\n").unwrap();
        let second = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        assert_eq!(first.files, second.files);
        assert_eq!(first.commits, second.commits);
        assert_eq!(first.uncommitted, second.uncommitted);
        assert_ne!(first.fingerprint, second.fingerprint);
        assert!(build_summary(&repo.worktree, &repo.base)
            .unwrap()
            .fingerprint
            .is_none());
    }

    #[test]
    fn finish_snapshot_detects_untracked_binary_changes_without_text_statistics() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("image.bin"), b"\0one").unwrap();
        let first = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        fs::write(repo.worktree.join("image.bin"), b"\0two").unwrap();
        let second = build_summary_options(&repo.worktree, &repo.base, true).unwrap();
        assert_eq!(first.files, second.files);
        assert!(first.files[0].binary);
        assert_ne!(first.fingerprint, second.fingerprint);
    }

    #[test]
    fn binary_changes_invalidate_the_displayed_snapshot_before_discard() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("image.bin"), b"\0old").unwrap();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        let preview = build_file_diff(&repo.worktree, &base, "image.bin").unwrap();
        assert!(preview.is_binary);
        fs::write(repo.worktree.join("image.bin"), b"\0new").unwrap();
        let changed = build_file_diff(&repo.worktree, &base, "image.bin").unwrap();
        assert_ne!(preview.fingerprint, changed.fingerprint);
        let error = discard_review_change(
            &repo.worktree,
            &base,
            "image.bin",
            &preview.fingerprint,
            None,
        )
        .unwrap_err();
        assert!(error.starts_with("__FILE_CHANGED__"));
        assert_eq!(fs::read(repo.worktree.join("image.bin")).unwrap(), b"\0new");
        discard_review_change(
            &repo.worktree,
            &base,
            "image.bin",
            &changed.fingerprint,
            None,
        )
        .unwrap();
        assert!(!repo.worktree.join("image.bin").exists());
    }

    #[test]
    fn whole_file_discard_removes_committed_session_additions_without_rewriting_head() {
        let repo = TestRepo::new();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        fs::write(repo.worktree.join("new.txt"), "agent addition\n").unwrap();
        git(&repo.worktree, &["add", "new.txt"]);
        git(&repo.worktree, &["commit", "-qm", "addition"]);
        let head = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        let preview = build_file_diff(&repo.worktree, &base, "new.txt").unwrap();
        discard_review_change(&repo.worktree, &base, "new.txt", &preview.fingerprint, None)
            .unwrap();
        assert!(!repo.worktree.join("new.txt").exists());
        assert!(git(&repo.worktree, &["ls-files", "--", "new.txt"]).is_empty());
        assert_eq!(resolve_git_commit(&repo.worktree, "HEAD").unwrap(), head);
        assert_eq!(
            git(&repo.worktree, &["diff", "--cached", "--name-status"]),
            "D\tnew.txt\n"
        );
    }

    #[test]
    fn staged_deleted_files_can_be_reviewed_and_restored() {
        let repo = TestRepo::new();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        git(&repo.worktree, &["rm", "f.txt"]);
        let preview = build_file_diff(&repo.worktree, &base, "f.txt").unwrap();
        assert!(preview
            .diff
            .as_deref()
            .unwrap()
            .contains("deleted file mode"));
        discard_review_change(&repo.worktree, &base, "f.txt", &preview.fingerprint, None).unwrap();
        assert_eq!(
            fs::read_to_string(repo.worktree.join("f.txt")).unwrap(),
            "a\nb\nc\n"
        );
        assert!(git(&repo.worktree, &["status", "--porcelain"]).is_empty());
    }

    // Windows forbids trailing spaces and `*` in file names.
    #[cfg(not(windows))]
    #[test]
    fn literal_review_paths_preserve_whitespace_and_do_not_expand_globs() {
        let repo = TestRepo::new();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        for name in [" odd*.txt ", " odd-other.txt "] {
            fs::write(repo.worktree.join(name), "one\n").unwrap();
        }
        git(&repo.worktree, &["add", "."]);
        git(&repo.worktree, &["commit", "-qm", "files"]);
        fs::write(repo.worktree.join(" odd*.txt "), "literal\n").unwrap();
        fs::write(repo.worktree.join(" odd-other.txt "), "other\n").unwrap();
        let preview = build_file_diff(&repo.worktree, &base, " odd*.txt ").unwrap();
        assert!(preview.diff.as_deref().unwrap().contains("+literal"));
        assert!(!preview.diff.as_deref().unwrap().contains("+other"));
        discard_review_change(
            &repo.worktree,
            &base,
            " odd*.txt ",
            &preview.fingerprint,
            None,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(repo.worktree.join(" odd-other.txt ")).unwrap(),
            "other\n"
        );
    }

    #[test]
    fn review_patch_cannot_change_a_second_file() {
        let repo = TestRepo::new();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        fs::write(repo.worktree.join("other.txt"), "one\n").unwrap();
        git(&repo.worktree, &["add", "other.txt"]);
        let preview = build_file_diff(&repo.worktree, &base, "f.txt").unwrap();
        let patch = "diff --git a/other.txt b/other.txt\n--- a/other.txt\n+++ b/other.txt\n@@ -1 +1 @@\n-one\n+two\n";
        let error = discard_review_change(
            &repo.worktree,
            &base,
            "f.txt",
            &preview.fingerprint,
            Some(patch),
        )
        .unwrap_err();
        assert!(error.starts_with("__INVALID_WORKTREE_PATH__"));
        assert_eq!(
            fs::read_to_string(repo.worktree.join("other.txt")).unwrap(),
            "one\n"
        );
    }

    #[test]
    fn guarded_review_patch_reverts_only_the_displayed_hunk() {
        let repo = TestRepo::new();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        let preview = build_file_diff(&repo.worktree, &base, "f.txt").unwrap();
        let patch = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n a\n-B\n+b\n c\n";
        discard_review_change(
            &repo.worktree,
            &base,
            "f.txt",
            &preview.fingerprint,
            Some(patch),
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(repo.worktree.join("f.txt")).unwrap(),
            "a\nb\nc\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn guarded_review_hunks_accept_gits_quoted_literal_paths() {
        for file in ["tab\tfile.txt", " space file.txt ", "literal[abc].txt"] {
            let repo = TestRepo::new();
            fs::write(repo.base.join(file), "original\n").unwrap();
            git(&repo.base, &["--literal-pathspecs", "add", "--", file]);
            git(&repo.base, &["commit", "-qm", "literal file"]);
            let base = resolve_git_commit(&repo.base, "HEAD").unwrap();
            git(&repo.worktree, &["reset", "--hard", &base]);
            fs::write(repo.worktree.join(file), "reviewed edit\n").unwrap();
            let preview = build_file_diff(&repo.worktree, &base, file).unwrap();
            let patch = git(
                &repo.worktree,
                &[
                    "--literal-pathspecs",
                    "diff",
                    "-R",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-color",
                    "--",
                    file,
                ],
            );
            discard_review_change(
                &repo.worktree,
                &base,
                file,
                &preview.fingerprint,
                Some(&patch),
            )
            .unwrap();
            assert_eq!(
                fs::read_to_string(repo.worktree.join(file)).unwrap(),
                "original\n"
            );
            assert!(git(&repo.worktree, &["status", "--porcelain=v1", "-z"]).is_empty());
        }
    }

    #[cfg(unix)]
    #[test]
    fn untracked_symlink_review_reads_target_text_and_checkpoint_rejects_it() {
        let repo = TestRepo::new();
        let outside = repo.root.join("outside.txt");
        fs::write(&outside, "private outside content").unwrap();
        std::os::unix::fs::symlink(&outside, repo.worktree.join("link")).unwrap();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        let preview = build_file_diff(&repo.worktree, &base, "link").unwrap();
        assert_eq!(preview.untracked_plain.as_deref(), outside.to_str());
        assert!(restore_checkpoint_file(
            &repo.worktree,
            &CheckpointFile {
                path: "link".into(),
                content: Some("overwrite".into())
            }
        )
        .is_err());
        assert_eq!(
            fs::read_to_string(&outside).unwrap(),
            "private outside content"
        );
    }

    #[tokio::test]
    async fn invalid_checkpoint_batch_leaves_earlier_files_untouched() {
        let repo = TestRepo::new();
        let error = agent_review_restore_checkpoint_files(
            repo.worktree.to_string_lossy().to_string(),
            vec![
                CheckpointFile {
                    path: "f.txt".into(),
                    content: Some("changed".into()),
                },
                CheckpointFile {
                    path: ".git/config".into(),
                    content: Some("invalid".into()),
                },
            ],
        )
        .await
        .unwrap_err();
        assert!(error.contains("__INVALID_WORKTREE_PATH__"));
        assert_eq!(
            fs::read_to_string(repo.worktree.join("f.txt")).unwrap(),
            "a\nb\nc\n"
        );
    }

    #[test]
    fn head_advancing_invalidates_review_even_when_file_contents_are_identical() {
        let repo = TestRepo::new();
        let base = resolve_git_commit(&repo.worktree, "HEAD").unwrap();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        let preview = build_file_diff(&repo.worktree, &base, "f.txt").unwrap();
        git(
            &repo.worktree,
            &["commit", "--allow-empty", "-qm", "advance"],
        );
        assert!(
            discard_review_change(&repo.worktree, &base, "f.txt", &preview.fingerprint, None)
                .unwrap_err()
                .starts_with("__FILE_CHANGED__")
        );
        assert_eq!(
            fs::read_to_string(repo.worktree.join("f.txt")).unwrap(),
            "a\nB\nc\n"
        );
    }

    #[test]
    fn restore_checkpoint_writes_back_original_content() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "changed\n").unwrap();
        restore_checkpoint_file(
            &repo.worktree,
            &CheckpointFile {
                path: "f.txt".into(),
                content: Some("a\nb\nc\n".into()),
            },
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(repo.worktree.join("f.txt")).unwrap(),
            "a\nb\nc\n"
        );
    }

    #[test]
    fn restore_checkpoint_deletes_files_that_did_not_exist_before() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("new.txt"), "hello\n").unwrap();
        restore_checkpoint_file(
            &repo.worktree,
            &CheckpointFile {
                path: "new.txt".into(),
                content: None,
            },
        )
        .unwrap();
        assert!(!repo.worktree.join("new.txt").exists());
    }

    #[test]
    fn restore_checkpoint_rejects_paths_escaping_the_worktree() {
        let repo = TestRepo::new();
        let err = restore_checkpoint_file(
            &repo.worktree,
            &CheckpointFile {
                path: "../outside.txt".into(),
                content: Some("x".into()),
            },
        )
        .unwrap_err();
        assert!(err.contains("Ungültiger Dateipfad"));
    }

    #[test]
    fn restore_checkpoint_rejects_nested_paths_escaping_the_worktree() {
        let repo = TestRepo::new();
        let err = restore_checkpoint_file(
            &repo.worktree,
            &CheckpointFile {
                path: "subdir/../../outside.txt".into(),
                content: Some("x".into()),
            },
        )
        .unwrap_err();
        assert!(err.contains("Ungültiger Dateipfad"));
    }

    #[test]
    fn merged_check_follows_the_base_branch_history() {
        let repo = TestRepo::new();
        fs::write(repo.worktree.join("f.txt"), "a\nB\nc\n").unwrap();
        git(&repo.worktree, &["add", "f.txt"]);
        git(&repo.worktree, &["commit", "-qm", "agent commit"]);
        let ancestor = |r: &PathBuf| {
            run_git(r, &["merge-base", "--is-ancestor", "agents/demo", "HEAD"]).is_ok()
        };
        assert!(!ancestor(&repo.base));
        git(&repo.base, &["merge", "--ff", "agents/demo"]);
        assert!(ancestor(&repo.base));
    }
}
