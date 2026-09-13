use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;

use crate::cmd::git_command;
use crate::cmdlog;

#[derive(Clone, Serialize)]
pub struct Commit {
    hash: String,
    short_hash: String,
    author: String,
    email: String,
    date: String,
    subject: String,
    body: String,
    parents: Vec<String>,
    tags: Vec<String>,
    author_avatar: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct CommitSearchResult {
    pub commit: Commit,
    pub matched_paths: Vec<String>,
}

#[derive(Serialize)]
pub struct Branch {
    name: String,
    is_current: bool,
    is_remote: bool,
    tip: String,
    behind: Option<u32>,
}

#[derive(Serialize)]
pub struct TagRef {
    pub name: String,
    pub commit: String,
    pub kind: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
}

#[derive(Serialize)]
pub struct RepoInfo {
    path: String,
    branch: String,
    commits: Vec<Commit>,
    branches: Vec<Branch>,
    tags: Vec<TagRef>,
}

#[derive(Serialize)]
pub struct UpstreamSyncCounts {
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize)]
pub struct FullStatus {
    pub entries: Vec<StatusEntry>,
    pub upstream_sync: UpstreamSyncCounts,
    pub has_upstream: bool,
}

#[derive(Serialize)]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

pub(crate) fn run_git(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    let span = cmdlog::start(&repo.to_string_lossy(), args);
    let output = match git_command().arg("-C").arg(repo).args(args).output() {
        Ok(output) => output,
        Err(e) => {
            span.finish(false);
            return Err(format!("failed to run git: {e}"));
        }
    };
    span.finish(output.status.success());

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn merged_failure_message(stdout: &str, stderr: &str) -> String {
    let msg = match (stderr.is_empty(), stdout.is_empty()) {
        (false, false) => format!("{stderr}\n{stdout}"),
        (false, true) => stderr.to_string(),
        (true, false) => stdout.to_string(),
        (true, true) => "git: command failed".into(),
    };
    let trimmed = msg.trim().to_string();
    if trimmed.contains("Your local changes to the following files would be overwritten")
        || trimmed.contains("would be overwritten by merge")
        || trimmed.contains("Please commit your changes or stash them before you")
    {
        let files: Vec<&str> = trimmed
            .lines()
            .filter(|l| l.starts_with('\t'))
            .map(|l| l.trim())
            .collect();
        return format!("__LOCAL_CHANGES_BLOCK__|{}", files.join(","));
    }
    trimmed
}

fn merged_ok_message(stdout: &str, stderr: &str) -> String {
    let ok = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout.to_string(),
        (true, false) => stderr.to_string(),
        (true, true) => String::new(),
    };
    ok.trim().to_string()
}

fn run_git_merged_output_at(cwd: Option<&PathBuf>, args: &[&str]) -> Result<String, String> {
    let mut cmd = git_command();
    if let Some(dir) = cwd {
        cmd.arg("-C").arg(dir);
    }
    let log_path = cwd
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();
    let span = cmdlog::start(&log_path, args);
    let output = match cmd.args(args).output() {
        Ok(output) => output,
        Err(e) => {
            span.finish(false);
            return Err(format!("failed to run git: {e}"));
        }
    };
    span.finish(output.status.success());

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(merged_failure_message(&stdout, &stderr));
    }

    Ok(merged_ok_message(&stdout, &stderr))
}

pub(crate) fn run_git_merged_output(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    run_git_merged_output_at(Some(repo), args)
}

async fn spawn_git<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f)
        .await
        .expect("git blocking task panicked")
}

pub const REMOTE_CANCELED: &str = "__REMOTE_CANCELED__";
const PROGRESS_EVENT: &str = "git-progress";
const PROGRESS_DONE_EVENT: &str = "git-progress-done";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProgressEvent {
    pub op_id: String,
    pub repo_path: String,
    pub op: String,
    pub phase: String,
    pub percent: Option<u8>,
    pub detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProgressDone {
    pub op_id: String,
    pub repo_path: String,
    pub op: String,
    pub ok: bool,
    pub canceled: bool,
    pub message: String,
}

#[derive(Debug, PartialEq)]
struct ProgressLine {
    phase: String,
    percent: Option<u8>,
    detail: String,
}

#[derive(Clone)]
struct RemoteOp {
    child: std::sync::Arc<std::sync::Mutex<std::process::Child>>,
    canceled: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pid: u32,
    #[cfg(windows)]
    job: std::sync::Arc<std::sync::Mutex<Option<crate::pty::job::PtyJob>>>,
}

struct StreamOutcome {
    success: bool,
    stdout: String,
    stderr: String,
    canceled: bool,
}

fn remote_ops() -> &'static std::sync::Mutex<HashMap<String, RemoteOp>> {
    static REG: std::sync::OnceLock<std::sync::Mutex<HashMap<String, RemoteOp>>> =
        std::sync::OnceLock::new();
    REG.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn parse_progress_chunk(chunk: &str) -> Option<ProgressLine> {
    let mut text = chunk.trim();
    while let Some(rest) = text.strip_prefix("remote:") {
        text = rest.trim_start();
    }
    let (phase, rest) = text.split_once(':')?;
    let phase = phase.trim();
    if phase.is_empty()
        || !phase
            .chars()
            .all(|c| c.is_ascii_alphabetic() || c == ' ' || c == '-')
    {
        return None;
    }
    let rest = rest.trim();
    if !rest.starts_with(|c: char| c.is_ascii_digit()) {
        return None;
    }
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    let after = &rest[digits.len()..];
    let (percent, detail) = match after.strip_prefix('%') {
        Some(tail) => (
            digits.parse::<u32>().ok().map(|v| v.min(100) as u8),
            tail.trim().to_string(),
        ),
        None => (None, rest.to_string()),
    };
    Some(ProgressLine {
        phase: phase.to_string(),
        percent,
        detail,
    })
}

fn flush_progress_chunk(
    buf: &mut Vec<u8>,
    kept: &mut Vec<String>,
    on_progress: &mut impl FnMut(ProgressLine),
) {
    if buf.is_empty() {
        return;
    }
    let text = String::from_utf8_lossy(buf).trim_end().to_string();
    buf.clear();
    if text.trim().is_empty() {
        return;
    }
    match parse_progress_chunk(&text) {
        Some(line) => {
            let keep = line.percent.is_none() || line.detail.contains("done.");
            on_progress(line);
            if keep {
                kept.push(text);
            }
        }
        None => kept.push(text),
    }
}

fn read_progress_stream<R: std::io::Read>(
    stream: R,
    mut on_progress: impl FnMut(ProgressLine),
) -> String {
    let mut reader = std::io::BufReader::new(stream);
    let mut chunk: Vec<u8> = Vec::new();
    let mut kept: Vec<String> = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match std::io::Read::read(&mut reader, &mut byte) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        if byte[0] == b'\r' || byte[0] == b'\n' {
            flush_progress_chunk(&mut chunk, &mut kept, &mut on_progress);
            continue;
        }
        chunk.push(byte[0]);
    }
    flush_progress_chunk(&mut chunk, &mut kept, &mut on_progress);
    kept.join("\n")
}

fn kill_remote_op(op: &RemoteOp) {
    #[cfg(windows)]
    {
        // Git may launch a shell for aliases and that shell can outlive the
        // git process. Closing the job object terminates the complete tree.
        if let Ok(mut job) = op.job.lock() {
            drop(job.take());
        }
        let _ = crate::cmd::cli_command("taskkill")
            .args(["/PID", &op.pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(-(op.pid as i32), libc::SIGTERM);
        }
    }
    if let Ok(mut child) = op.child.lock() {
        let _ = child.kill();
    }
}

#[cfg(windows)]
fn create_remote_job(pid: u32) -> std::sync::Arc<std::sync::Mutex<Option<crate::pty::job::PtyJob>>> {
    let job = crate::pty::job::PtyJob::create_for(pid)
        .map_err(|error| log::warn!("remote git job-object setup failed for pid={pid}: {error}"))
        .ok();
    std::sync::Arc::new(std::sync::Mutex::new(job))
}

fn run_git_streamed(
    cwd: Option<&PathBuf>,
    args: &[String],
    op_id: &str,
    on_progress: impl FnMut(ProgressLine),
) -> Result<StreamOutcome, String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};

    let mut cmd = git_command();
    if let Some(dir) = cwd {
        cmd.arg("-C").arg(dir);
    }
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to run git: {e}"))?;
    let pid = child.id();
    #[cfg(windows)]
    let job = create_remote_job(pid);
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let shared = Arc::new(Mutex::new(child));
    let canceled = Arc::new(AtomicBool::new(false));

    if let Ok(mut reg) = remote_ops().lock() {
        reg.insert(
            op_id.to_string(),
            RemoteOp {
                child: shared.clone(),
                canceled: canceled.clone(),
                pid,
                #[cfg(windows)]
                job,
            },
        );
    }

    let stdout_thread = std::thread::spawn(move || {
        let mut raw: Vec<u8> = Vec::new();
        if let Some(mut out) = stdout {
            let _ = std::io::Read::read_to_end(&mut out, &mut raw);
        }
        String::from_utf8_lossy(&raw).to_string()
    });

    let stderr_text = match stderr {
        Some(err) => read_progress_stream(err, on_progress),
        None => String::new(),
    };
    let stdout_text = stdout_thread.join().unwrap_or_default();

    let status = shared
        .lock()
        .map_err(|e| e.to_string())
        .and_then(|mut child| child.wait().map_err(|e| e.to_string()));

    if let Ok(mut reg) = remote_ops().lock() {
        reg.remove(op_id);
    }

    let canceled = canceled.load(Ordering::Relaxed);
    Ok(StreamOutcome {
        success: status.map(|s| s.success()).unwrap_or(false) && !canceled,
        stdout: stdout_text.trim().to_string(),
        stderr: stderr_text.trim().to_string(),
        canceled,
    })
}

fn emit_progress(event: &GitProgressEvent) {
    crate::sink::emit(PROGRESS_EVENT, event);
}

fn emit_progress_done(event: &GitProgressDone) {
    crate::sink::emit(PROGRESS_DONE_EVENT, event);
}

fn run_remote_op(
    op: &str,
    repo_path: &str,
    cwd: Option<&PathBuf>,
    args: Vec<String>,
    op_id: Option<String>,
) -> Result<String, String> {
    let op_id = op_id
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty());
    let Some(op_id) = op_id else {
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        return run_git_merged_output_at(cwd, &refs);
    };

    let mut args = args;
    args.insert(1, "--progress".to_string());

    let span = cmdlog::start(repo_path, &args);
    let outcome = run_git_streamed(cwd, &args, &op_id, |line| {
        emit_progress(&GitProgressEvent {
            op_id: op_id.clone(),
            repo_path: repo_path.to_string(),
            op: op.to_string(),
            phase: line.phase,
            percent: line.percent,
            detail: line.detail,
        });
    });

    let done = |ok: bool, canceled: bool, message: &str| {
        emit_progress_done(&GitProgressDone {
            op_id: op_id.clone(),
            repo_path: repo_path.to_string(),
            op: op.to_string(),
            ok,
            canceled,
            message: message.to_string(),
        });
    };

    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(e) => {
            span.finish(false);
            done(false, false, &e);
            return Err(e);
        }
    };
    span.finish(outcome.success);

    if outcome.canceled {
        done(false, true, REMOTE_CANCELED);
        return Err(REMOTE_CANCELED.to_string());
    }
    if !outcome.success {
        let message = merged_failure_message(&outcome.stdout, &outcome.stderr);
        done(false, false, &message);
        return Err(message);
    }
    let message = merged_ok_message(&outcome.stdout, &outcome.stderr);
    done(true, false, &message);
    Ok(message)
}

pub fn cancel_remote_op(op_id: &str) -> bool {
    let key = op_id.trim().to_string();
    let entry = match remote_ops().lock() {
        Ok(registry) => registry.get(&key).cloned(),
        Err(error) => {
            log::warn!("remote-op registry poisoned: {error}");
            None
        }
    };
    let Some(entry) = entry else {
        return false;
    };
    entry
        .canceled
        .store(true, std::sync::atomic::Ordering::Relaxed);
    kill_remote_op(&entry);
    true
}

#[tauri::command]
pub async fn git_remote_cancel(op_id: String) -> Result<bool, String> {
    Ok(spawn_git(move || cancel_remote_op(&op_id)).await)
}

#[cfg(test)]
pub(crate) fn track_remote_op_for_test(op_id: &str, child: std::process::Child) {
    let pid = child.id();
    if let Ok(mut registry) = remote_ops().lock() {
        registry.insert(
            op_id.to_string(),
            RemoteOp {
                child: std::sync::Arc::new(std::sync::Mutex::new(child)),
                canceled: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
                pid,
                #[cfg(windows)]
                job: create_remote_job(pid),
            },
        );
    }
}

#[cfg(test)]
pub(crate) fn remote_op_canceled_for_test(op_id: &str) -> Option<bool> {
    remote_ops()
        .lock()
        .ok()?
        .get(op_id)
        .map(|op| op.canceled.load(std::sync::atomic::Ordering::Relaxed))
}

#[cfg(test)]
pub(crate) fn forget_remote_op_for_test(op_id: &str) {
    if let Ok(mut registry) = remote_ops().lock() {
        registry.remove(op_id);
    }
}

fn tags_by_target(repo: &PathBuf) -> HashMap<String, Vec<String>> {
    tag_map_from_refs(&tag_refs(repo))
}

/// Groups tag names by the commit they point at. Annotated tags are already
/// peeled in `TagRef::commit`, so this needs no git call of its own — callers
/// that also want the full tag list get both from a single `for-each-ref`.
fn tag_map_from_refs(tags: &[TagRef]) -> HashMap<String, Vec<String>> {
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for tag in tags {
        if tag.commit.is_empty() || tag.name.is_empty() {
            continue;
        }
        map.entry(tag.commit.clone()).or_default().push(tag.name.clone());
    }
    for names in map.values_mut() {
        names.sort();
    }
    map
}

// Default page size for the initial open_repo fetch. Small enough to be
// cheap on weak PCs, large enough to render a useful graph. Additional
// pages arrive via `repo_log_page`.
const DEFAULT_INITIAL_COMMITS: usize = 80;

fn fetch_commits(
    repo: &PathBuf,
    skip: usize,
    limit: usize,
    tag_map: &HashMap<String, Vec<String>>,
    hide_t3_checkpoints: bool,
) -> Result<Vec<Commit>, String> {
    if run_git(repo, &["rev-parse", "-q", "--verify", "HEAD"]).is_err() {
        return Ok(vec![]);
    }
    let mut commits = fetch_commits_raw(repo, skip, limit, hide_t3_checkpoints)?;
    apply_tags(&mut commits, tag_map);
    Ok(commits)
}

/// Writes tag names onto the commits they point at.
fn apply_tags(commits: &mut [Commit], tag_map: &HashMap<String, Vec<String>>) {
    if tag_map.is_empty() {
        return;
    }
    for commit in commits.iter_mut() {
        if let Some(names) = tag_map.get(&commit.hash) {
            commit.tags = names.clone();
        }
    }
}

/// The log read on its own: no tag decoration, and no `rev-parse` guard for an
/// empty repository. Callers that already know HEAD resolves save a process
/// spawn, and callers that want tags can fetch them concurrently and decorate
/// afterwards.
fn fetch_commits_raw(
    repo: &PathBuf,
    skip: usize,
    limit: usize,
    hide_t3_checkpoints: bool,
) -> Result<Vec<Commit>, String> {
    let sep = "\x1f";
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b");
    let max_count = format!("--max-count={limit}");
    let mut args: Vec<String> = vec![
        "log".into(),
        "-z".into(),
        max_count,
    ];
    if hide_t3_checkpoints {
        args.push("--exclude=refs/t3/*".into());
    }
    args.push("--all".into());
    args.push("--date-order".into());
    args.push(format!("--pretty=format:{format}"));
    if skip > 0 {
        args.insert(3, format!("--skip={skip}"));
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let log = run_git(repo, &arg_refs)?;

    Ok(parse_commit_log(&log))
}

fn parse_commit_log(log: &str) -> Vec<Commit> {
    let sep = "\x1f";
    let commits = log
        .split('\0')
        .filter(|chunk| !chunk.is_empty())
        .filter_map(|record| {
            let mut parts = record.splitn(8, sep);
            let hash = parts.next()?.to_string();
            let short_hash = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let email = parts.next()?.to_string();
            let date = parts.next()?.to_string();
            let parents_str = parts.next()?;
            let subject = parts.next()?.to_string();
            let body = parts.next().unwrap_or_default().to_string();
            let parents = parents_str
                .split_whitespace()
                .map(|s| s.to_string())
                .collect();
            Some(Commit {
                hash,
                short_hash,
                author,
                email,
                date,
                subject,
                body,
                parents,
                tags: Vec::new(),
                author_avatar: None,
            })
        })
        .collect();

    commits
}

mod search;
pub use search::*;

#[tauri::command]
pub async fn open_repo(path: String, hide_t3_checkpoints: Option<bool>) -> Result<RepoInfo, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let hide_t3 = hide_t3_checkpoints.unwrap_or(true);

        // One rev-parse answers both "is this a repository" and "what is HEAD".
        // A repository without commits makes the HEAD half fail, so that case
        // falls back to the plain repository check and reports no commits.
        let (branch, head_exists) = match run_git(
            &repo,
            &["rev-parse", "--is-inside-work-tree", "--abbrev-ref", "HEAD"],
        ) {
            Ok(out) => {
                let branch = out
                    .lines()
                    .nth(1)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("HEAD")
                    .to_string();
                (branch, true)
            }
            Err(_) => {
                run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
                    .map_err(|_| format!("'{path}' is not a git repository"))?;
                ("HEAD".to_string(), false)
            }
        };

        // Log, tags and branches are independent reads. Running them together
        // costs one round of process spawns instead of three — process
        // creation, not git itself, dominates opening a repository.
        let repo_tags = repo.clone();
        let repo_branches = repo.clone();
        let tags_handle = std::thread::spawn(move || tag_refs(&repo_tags));
        let branches_handle =
            std::thread::spawn(move || list_branches(&repo_branches).unwrap_or_default());

        let commits = if head_exists {
            fetch_commits_raw(&repo, 0, DEFAULT_INITIAL_COMMITS, hide_t3)
        } else {
            Ok(Vec::new())
        };

        let tags = tags_handle
            .join()
            .map_err(|_| "tag thread panicked".to_string())?;
        let branches = branches_handle
            .join()
            .map_err(|_| "branch thread panicked".to_string())?;

        let mut commits = commits?;
        apply_tags(&mut commits, &tag_map_from_refs(&tags));

        Ok(RepoInfo {
            path: repo.to_string_lossy().to_string(),
            branch,
            commits,
            branches,
            tags,
        })
    }).await
}

#[tauri::command]
pub async fn git_init_repo(path: String) -> Result<String, String> {
    spawn_git(move || {
        let path = path.trim();
        if path.is_empty() {
            return Err("Pfad fehlt.".into());
        }
        let repo = PathBuf::from(path);
        if repo.exists() {
            let meta = std::fs::metadata(&repo).map_err(|e| e.to_string())?;
            if !meta.is_dir() {
                return Err(format!("'{path}' ist kein Ordner."));
            }
        } else {
            std::fs::create_dir_all(&repo).map_err(|e| format!("Ordner anlegen: {e}"))?;
        }
        run_git_merged_output(&repo, &["init"])?;
        Ok(repo.to_string_lossy().to_string())
    }).await
}

pub const TAG_KIND_LIGHTWEIGHT: &str = "lightweight";
pub const TAG_KIND_ANNOTATED: &str = "annotated";
pub const TAG_KIND_SIGNED: &str = "signed";

const TAG_FIELD_SEP: char = '\u{001f}';
const TAG_RECORD_SEP: char = '\u{001e}';

pub fn parse_tag_refs(raw: &str) -> Vec<TagRef> {
    let mut tags: Vec<TagRef> = Vec::new();
    for record in raw.split(TAG_RECORD_SEP) {
        let record = record.trim_start_matches(['\n', '\r']);
        if record.trim().is_empty() {
            continue;
        }
        let mut fields = record.splitn(5, TAG_FIELD_SEP);
        let name = fields.next().unwrap_or("").trim();
        let object_type = fields.next().unwrap_or("").trim();
        let commit = fields.next().unwrap_or("").trim();
        let tagger = fields.next().unwrap_or("").trim();
        let contents = fields.next().unwrap_or("");
        if name.is_empty() || commit.is_empty() {
            continue;
        }
        if object_type != "tag" {
            tags.push(TagRef {
                name: name.to_string(),
                commit: commit.to_string(),
                kind: TAG_KIND_LIGHTWEIGHT.to_string(),
                message: None,
                tagger: None,
            });
            continue;
        }
        let signed = contents.contains("-----BEGIN PGP SIGNATURE-----")
            || contents.contains("-----BEGIN SSH SIGNATURE-----")
            || contents.contains("-----BEGIN SIGNED MESSAGE-----");
        let message = strip_signature_block(contents);
        tags.push(TagRef {
            name: name.to_string(),
            commit: commit.to_string(),
            kind: if signed { TAG_KIND_SIGNED } else { TAG_KIND_ANNOTATED }.to_string(),
            message: (!message.is_empty()).then_some(message),
            tagger: (!tagger.is_empty()).then(|| tagger.to_string()),
        });
    }
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    tags
}

fn strip_signature_block(contents: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("-----BEGIN PGP SIGNATURE-----")
            || trimmed.starts_with("-----BEGIN SSH SIGNATURE-----")
            || trimmed.starts_with("-----BEGIN SIGNED MESSAGE-----")
        {
            break;
        }
        out.push(line);
    }
    out.join("\n").trim().to_string()
}

fn tag_refs(repo: &PathBuf) -> Vec<TagRef> {
    let format = format!(
        "%(refname:strip=2){s}%(objecttype){s}%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end){s}%(taggername){s}%(contents){r}",
        s = TAG_FIELD_SEP,
        r = TAG_RECORD_SEP
    );
    let Ok(out) = run_git(repo, &["for-each-ref", "refs/tags", &format!("--format={format}")]) else {
        return Vec::new();
    };
    parse_tag_refs(&out)
}

/// Load additional commits beyond what `open_repo` returned. Used by the
/// frontend virtualiser for infinite-scroll.
#[tauri::command]
pub async fn repo_log_page(
    path: String,
    skip: usize,
    limit: usize,
    hide_t3_checkpoints: Option<bool>,
) -> Result<Vec<Commit>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let tag_map = tags_by_target(&repo);
        let capped = limit.clamp(1, 500);
        let hide_t3 = hide_t3_checkpoints.unwrap_or(true);
        fetch_commits(&repo, skip, capped, &tag_map, hide_t3)
    }).await
}

mod history;
pub use history::*;

pub const DEFAULT_REMOTE: &str = "origin";

fn reject_dash_arg(value: &str, label: &str) -> Result<(), String> {
    if value.starts_with('-') {
        return Err(format!("Ungültiger {label}: Werte mit führendem '-' sind nicht erlaubt ({value})"));
    }
    Ok(())
}

fn normalized_remote(repo: &PathBuf, remote: Option<&str>) -> Result<Option<String>, String> {
    let Some(r) = remote else {
        return Ok(None);
    };
    let r = r.trim();
    if r.is_empty() {
        return Ok(None);
    }
    reject_dash_arg(r, "Remote-Name")?;
    let known = remote_names(repo);
    if !known.iter().any(|n| n == r) {
        return Err(format!("Unbekannter Remote: {r}"));
    }
    Ok(Some(r.to_string()))
}

fn remote_names(repo: &PathBuf) -> Vec<String> {
    run_git(repo, &["remote"])
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// The remote a plain `git push` would target: the current branch's tracking
/// remote, else `remote.pushDefault`, else the only configured remote, else
/// `origin`.
fn resolve_push_remote(repo: &PathBuf) -> String {
    let branch = run_git(repo, &["symbolic-ref", "--short", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    if !branch.is_empty() {
        if let Ok(out) = run_git(repo, &["config", "--get", &format!("branch.{branch}.remote")]) {
            let out = out.trim().to_string();
            if !out.is_empty() {
                return out;
            }
        }
    }
    if let Ok(out) = run_git(repo, &["config", "--get", "remote.pushDefault"]) {
        let out = out.trim().to_string();
        if !out.is_empty() {
            return out;
        }
    }
    let remotes = remote_names(repo);
    if remotes.len() == 1 {
        return remotes[0].clone();
    }
    DEFAULT_REMOTE.to_string()
}

#[tauri::command]
pub async fn branch_push_remote(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        Ok(resolve_push_remote(&repo))
    })
    .await
}

#[tauri::command]
pub async fn git_fetch(
    path: String,
    prune_branches: Option<bool>,
    prune_tags: Option<bool>,
    remote: Option<String>,
    all_remotes: Option<bool>,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let prune_branches = prune_branches.unwrap_or(true);
        let prune_tags = prune_tags.unwrap_or(false);
        let mut args: Vec<String> = vec!["fetch".to_string()];
        if prune_branches || prune_tags {
            args.push("--prune".to_string());
        }
        if prune_tags {
            args.push("--prune-tags".to_string());
        }
        if all_remotes.unwrap_or(false) {
            args.push("--all".to_string());
        } else if let Some(r) = normalized_remote(&repo, remote.as_deref())? {
            args.push("--".to_string());
            args.push(r);
        }
        let repo_path = repo.to_string_lossy().to_string();
        run_remote_op("fetch", &repo_path, Some(&repo), args, op_id)
    }).await
}

fn dirty_tracked_files(repo: &PathBuf) -> Vec<String> {
    let out = run_git(repo, &["status", "--porcelain=v1", "--untracked-files=no"]).unwrap_or_default();
    let mut files: Vec<String> = Vec::new();
    for line in out.lines() {
        if line.len() < 3 {
            continue;
        }
        let xy = &line[..2];
        let rest = &line[3..];
        if xy == "??" || xy == "!!" {
            continue;
        }
        let name = rest.split(" -> ").last().unwrap_or(rest).trim().to_string();
        if !name.is_empty() {
            files.push(name);
        }
    }
    files
}

#[tauri::command]
pub async fn git_pull(
    path: String,
    strategy: Option<String>,
    remote: Option<String>,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let autostash = strategy.as_deref() == Some("autostash");
        if !autostash {
            let dirty = dirty_tracked_files(&repo);
            if !dirty.is_empty() {
                return Err(format!("__LOCAL_CHANGES_BLOCK__|{}", dirty.join(",")));
            }
        }
        let mut args: Vec<String> = vec!["pull".to_string()];
        match strategy.as_deref() {
            Some("rebase") => args.push("--rebase".to_string()),
            Some("ff-only") => args.push("--ff-only".to_string()),
            Some("autostash") => {
                args.push("--no-rebase".to_string());
                args.push("--autostash".to_string());
            }
            _ => args.push("--no-rebase".to_string()),
        }
        if let Some(r) = normalized_remote(&repo, remote.as_deref())? {
            args.push("--".to_string());
            args.push(r);
            if let Ok(branch) = run_git(&repo, &["symbolic-ref", "--short", "HEAD"]) {
                let branch = branch.trim().to_string();
                if !branch.is_empty() {
                    args.push(branch);
                }
            }
        }
        let repo_path = repo.to_string_lossy().to_string();
        run_remote_op("pull", &repo_path, Some(&repo), args, op_id)
    }).await
}

#[tauri::command]
pub async fn git_push(
    path: String,
    set_upstream: bool,
    remote: Option<String>,
    force_mode: Option<String>,
    tags_mode: Option<String>,
    atomic: Option<bool>,
    no_verify: Option<bool>,
    dry_run: Option<bool>,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());

        let mut args: Vec<String> = vec!["push".to_string()];

        match force_mode.as_deref() {
            Some("lease") => args.push("--force-with-lease".to_string()),
            Some("force") => args.push("--force".to_string()),
            _ => {}
        }

        match tags_mode.as_deref() {
            Some("all") => args.push("--tags".to_string()),
            Some("follow") => args.push("--follow-tags".to_string()),
            _ => {}
        }

        if atomic.unwrap_or(false) {
            args.push("--atomic".to_string());
        }
        if no_verify.unwrap_or(false) {
            args.push("--no-verify".to_string());
        }
        if dry_run.unwrap_or(false) {
            args.push("--dry-run".to_string());
        }

        let target = normalized_remote(&repo, remote.as_deref())?;
        if set_upstream {
            let branch = run_git(&repo, &["symbolic-ref", "--short", "HEAD"])
                .map(|s| s.trim().to_string())?;
            if branch.is_empty() {
                return Err("HEAD zeigt auf keinen Branch".into());
            }
            let target = match target {
                Some(r) => r,
                None => resolve_push_remote(&repo),
            };
            args.push("-u".to_string());
            args.push("--".to_string());
            args.push(target);
            args.push(branch);
        } else if let Some(r) = target {
            args.push("--".to_string());
            args.push(r);
        }

        let repo_path = repo.to_string_lossy().to_string();
        run_remote_op("push", &repo_path, Some(&repo), args, op_id)
    }).await
}

#[tauri::command]
pub async fn list_git_remotes(path: String) -> Result<Vec<GitRemote>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let out = run_git(&repo, &["remote", "-v"])?;
        // `git remote -v` emits two lines per remote:
        //   origin\tgit@host:user/repo.git (fetch)
        //   origin\tgit@host:user/repo.git (push)
        // We only need the fetch URL per remote, in first-seen order.
        let mut remotes: Vec<GitRemote> = Vec::new();
        for line in out.lines() {
            let line = line.trim_end();
            if line.is_empty() {
                continue;
            }
            let Some((name, rest)) = line.split_once('\t') else {
                continue;
            };
            let url = rest
                .rsplit_once(' ')
                .map(|(u, _kind)| u)
                .unwrap_or(rest)
                .trim();
            if url.is_empty() {
                continue;
            }
            if remotes.iter().any(|r| r.name == name) {
                continue;
            }
            remotes.push(GitRemote {
                name: name.to_string(),
                url: url.to_string(),
            });
        }
        Ok(remotes)
    }).await
}

#[tauri::command]
pub async fn set_git_remote_url(path: String, name: String, url: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let n = name.trim();
        let u = url.trim();
        if n.is_empty() {
            return Err("Remote-Name darf nicht leer sein".into());
        }
        if u.is_empty() {
            return Err("Remote-URL darf nicht leer sein".into());
        }
        run_git_merged_output(&repo, &["remote", "set-url", n, u])
    }).await
}

#[tauri::command]
pub async fn add_git_remote(path: String, name: String, url: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let n = name.trim();
        let u = url.trim();
        if n.is_empty() {
            return Err("Remote-Name darf nicht leer sein".into());
        }
        if u.is_empty() {
            return Err("Remote-URL darf nicht leer sein".into());
        }
        run_git_merged_output(&repo, &["remote", "add", n, u])
    }).await
}

#[tauri::command]
pub async fn branch_has_upstream(path: String) -> Result<bool, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        Ok(compute_has_upstream(&repo))
    }).await
}

#[tauri::command]
pub async fn repo_upstream_sync_counts(path: String) -> Result<UpstreamSyncCounts, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        Ok(compute_upstream_sync(&repo))
    }).await
}

#[tauri::command]
pub async fn git_clone(
    url: String,
    dest: String,
    op_id: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let u = url.trim();
        let d = dest.trim();
        if u.is_empty() {
            return Err("Clone-URL darf nicht leer sein".into());
        }
        if d.is_empty() {
            return Err("Zielpfad darf nicht leer sein".into());
        }
        let args = vec!["clone".to_string(), "--".to_string(), u.to_string(), d.to_string()];
        run_remote_op("clone", d, None, args, op_id)
    }).await
}

#[tauri::command]
pub async fn git_checkout(
    path: String,
    ref_name: String,
    create: bool,
    from_remote: Option<String>,
    base: Option<String>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let name = ref_name.trim();
        if name.is_empty() {
            return Err("Branch- oder Ref-Name darf nicht leer sein".into());
        }
        reject_dash_arg(name, "Branch- oder Ref-Name")?;
        if let Some(remote) = from_remote.filter(|s| !s.trim().is_empty()) {
            let r = remote.trim();
            reject_dash_arg(r, "Remote-Tracking-Ref")?;
            run_git(
                &repo,
                &["checkout", "-b", name, "--track", r],
            )?;
            return Ok(());
        }
        if create {
            let mut args: Vec<String> = vec!["checkout".into(), "-b".into(), name.to_string()];
            if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
                let b = b.trim().to_string();
                reject_dash_arg(&b, "Basis-Ref")?;
                args.push(b);
            }
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_git(&repo, &refs)?;
            return Ok(());
        }
        run_git(&repo, &["checkout", name, "--"])?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn git_create_branch(
    path: String,
    name: String,
    base: Option<String>,
    checkout: bool,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let n = name.trim();
        if n.is_empty() {
            return Err("Branch-Name darf nicht leer sein".into());
        }
        if checkout {
            let mut args: Vec<String> = vec!["checkout".into(), "-b".into(), n.to_string()];
            if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
                args.push(b.trim().to_string());
            }
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_git(&repo, &refs)?;
            return Ok(());
        }
        let mut args: Vec<String> = vec!["branch".into(), n.to_string()];
        if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
            args.push(b.trim().to_string());
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &refs)?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn git_merge(
    path: String,
    branch: String,
    strategy: Option<String>,
    message: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let b = branch.trim();
        if b.is_empty() {
            return Err("Branch-Name darf nicht leer sein".into());
        }

        let dirty = dirty_tracked_files(&repo);
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
                let mut args: Vec<String> = vec!["merge".into(), "--ff".into()];
                if let Some(msg) = trimmed_msg.as_ref() {
                    args.push("-m".into());
                    args.push(msg.clone());
                }
                args.push(b.to_string());
                let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
                run_git_merged_output(&repo, &refs)
            }
            "ff-only" => run_git_merged_output(&repo, &["merge", "--ff-only", b]),
            "no-ff" => {
                let current = current_branch_name(&repo).unwrap_or_default();
                let msg = trimmed_msg.unwrap_or_else(|| default_merge_message(b, &current));
                run_git_merged_output(
                    &repo,
                    &["merge", "--no-ff", "--no-edit", "-m", msg.as_str(), b],
                )
            }
            "squash" => {
                let current = current_branch_name(&repo).unwrap_or_default();
                let squash_out = run_git_merged_output(&repo, &["merge", "--squash", b])?;
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
            other => Err(format!("Unbekannte Merge-Strategie: {other}")),
        }
    }).await
}

fn current_branch_name(repo: &PathBuf) -> Option<String> {
    run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD")
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
        let repo = PathBuf::from(path.trim());
        let c = commit.trim();
        if c.is_empty() {
            return Err("Commit-Hash darf nicht leer sein".into());
        }
        let mut parts: Vec<String> = vec!["revert".into(), "--no-edit".into()];
        if let Some(m) = merge_mainline {
            if m < 1 {
                return Err("Mainline-Parent muss mindestens 1 sein".into());
            }
            parts.push("-m".into());
            parts.push(m.to_string());
        }
        parts.push(c.to_string());
        let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
        run_git_merged_output(&repo, &args)
    }).await
}

#[derive(Serialize)]
pub struct CherryPickState {
    pub in_progress: bool,
    pub head: Option<String>,
    pub conflicted_paths: Vec<String>,
}

#[tauri::command]
pub async fn git_cherry_pick(
    path: String,
    commits: Vec<String>,
    mainline: Option<u8>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let cleaned: Vec<String> = commits
            .iter()
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty())
            .collect();
        if cleaned.is_empty() {
            return Err("Mindestens ein Commit-Hash ist erforderlich".into());
        }
        let mut parts: Vec<String> = vec!["cherry-pick".into()];
        if let Some(m) = mainline {
            if m < 1 {
                return Err("Mainline-Parent muss mindestens 1 sein".into());
            }
            parts.push("-m".into());
            parts.push(m.to_string());
        }
        for c in &cleaned {
            parts.push(c.clone());
        }
        let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
        run_git_merged_output(&repo, &args)
    }).await
}

#[tauri::command]
pub async fn git_cherry_pick_continue(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        run_git_merged_output(
            &repo,
            &["-c", "core.editor=true", "cherry-pick", "--continue"],
        )
    }).await
}

#[tauri::command]
pub async fn git_cherry_pick_skip(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        run_git_merged_output(&repo, &["cherry-pick", "--skip"])
    }).await
}

#[tauri::command]
pub async fn git_cherry_pick_abort(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        run_git_merged_output(&repo, &["cherry-pick", "--abort"])
    }).await
}

#[tauri::command]
pub async fn cherry_pick_state(path: String) -> Result<CherryPickState, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let head_path_raw = run_git(&repo, &["rev-parse", "--git-path", "CHERRY_PICK_HEAD"])?;
        let head_path = head_path_raw.trim();
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
            let out = run_git(&repo, &["diff", "--name-only", "--diff-filter=U"]).unwrap_or_default();
            out.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        } else {
            Vec::new()
        };
        Ok(CherryPickState {
            in_progress,
            head,
            conflicted_paths,
        })
    }).await
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
        let repo = PathBuf::from(path.trim());
        let head_path_raw = run_git(&repo, &["rev-parse", "--git-path", "MERGE_HEAD"])?;
        let head_path = head_path_raw.trim();
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
            let out = run_git(&repo, &["diff", "--name-only", "--diff-filter=U"]).unwrap_or_default();
            out.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        } else {
            Vec::new()
        };
        Ok(MergeState {
            in_progress,
            merge_head,
            conflicted_paths,
        })
    }).await
}

#[tauri::command]
pub async fn git_merge_abort(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        run_git_merged_output(&repo, &["merge", "--abort"])
    }).await
}

#[derive(serde::Serialize)]
pub struct ConflictVersions {
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub current: String,
}

#[tauri::command]
pub async fn git_get_conflict_versions(path: String, file: String) -> Result<ConflictVersions, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let f = file.trim();

        let stage = |n: &str| -> String {
            run_git(&repo, &["show", &format!(":{n}:{f}")])
                .unwrap_or_default()
        };

        let current = std::fs::read_to_string(repo.join(f))
            .unwrap_or_default();

        Ok(ConflictVersions {
            base: stage("1"),
            ours: stage("2"),
            theirs: stage("3"),
            current,
        })
    }).await
}

#[tauri::command]
pub async fn git_save_resolved_file(path: String, file: String, content: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let f = file.trim();
        std::fs::write(repo.join(f), content)
            .map_err(|e| format!("Fehler beim Schreiben der Datei: {e}"))?;
        run_git_merged_output(&repo, &["add", f])?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn git_merge_commit(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        run_git_merged_output(&repo, &["commit", "--no-edit"])
    }).await
}

#[tauri::command]
pub async fn git_tag_commit(
    path: String,
    name: String,
    commit: String,
    annotated: Option<bool>,
    message: Option<String>,
    sign: Option<bool>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let tag = name.trim();
        if tag.is_empty() {
            return Err("Tag-Name darf nicht leer sein".into());
        }
        let c = commit.trim();
        if c.is_empty() {
            return Err("Commit-Hash darf nicht leer sein".into());
        }
        let sign = sign.unwrap_or(false);
        let annotated = sign || annotated.unwrap_or(false);
        let msg = message.unwrap_or_default().trim().to_string();
        if annotated && msg.is_empty() {
            return Err("Tag-Nachricht darf nicht leer sein".into());
        }

        let mut parts: Vec<String> = vec!["tag".to_string()];
        if sign {
            parts.push("-s".to_string());
        } else if annotated {
            parts.push("-a".to_string());
        }
        if annotated {
            parts.push("-m".to_string());
            parts.push(msg);
        }
        parts.push(tag.to_string());
        parts.push(c.to_string());
        let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &args)?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn git_discard_files(
    path: String,
    files: Vec<String>,
    untracked: Vec<bool>,
) -> Result<(), String> {
    spawn_git(move || {
        if files.len() != untracked.len() {
            return Err("untracked muss dieselbe Länge wie files haben".into());
        }
        let repo = PathBuf::from(path.trim());
        let mut tracked: Vec<&str> = Vec::new();
        for (f, is_untracked) in files.iter().zip(untracked.iter()) {
            let p = f.trim();
            if p.is_empty() {
                continue;
            }
            if *is_untracked {
                let abs = repo.join(p);
                if abs.is_dir() {
                    std::fs::remove_dir_all(&abs)
                        .map_err(|e| format!("Ordner konnte nicht entfernt werden: {e}"))?;
                } else if abs.exists() {
                    std::fs::remove_file(&abs)
                        .map_err(|e| format!("Datei konnte nicht entfernt werden: {e}"))?;
                }
            } else {
                tracked.push(f.as_str());
            }
        }
        if !tracked.is_empty() {
            let mut args: Vec<&str> = vec!["restore", "--source=HEAD", "--staged", "--worktree", "--"];
            args.extend(tracked.iter().copied());
            run_git(&repo, &args)?;
        }
        Ok(())
    }).await
}

#[tauri::command]
pub async fn git_discard_worktree_changes(
    path: String,
    files: Vec<String>,
    untracked: Vec<bool>,
) -> Result<(), String> {
    spawn_git(move || {
        if files.len() != untracked.len() {
            return Err("untracked muss dieselbe Länge wie files haben".into());
        }
        let repo = PathBuf::from(path.trim());
        let mut tracked: Vec<&str> = Vec::new();
        for (f, is_untracked) in files.iter().zip(untracked.iter()) {
            let p = f.trim();
            if p.is_empty() {
                continue;
            }
            if *is_untracked {
                let abs = repo.join(p);
                if abs.is_dir() {
                    std::fs::remove_dir_all(&abs)
                        .map_err(|e| format!("Ordner konnte nicht entfernt werden: {e}"))?;
                } else if abs.exists() {
                    std::fs::remove_file(&abs)
                        .map_err(|e| format!("Datei konnte nicht entfernt werden: {e}"))?;
                }
            } else {
                tracked.push(f.as_str());
            }
        }
        if !tracked.is_empty() {
            let mut args: Vec<&str> = vec!["restore", "--worktree", "--"];
            args.extend(tracked.iter().copied());
            run_git(&repo, &args)?;
        }
        Ok(())
    }).await
}

#[tauri::command]
pub async fn git_restore_files_at_commit(
    path: String,
    commit: String,
    files: Vec<String>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let c = commit.trim();
        if c.is_empty() {
            return Err("Commit-Hash darf nicht leer sein".into());
        }
        let clean: Vec<&str> = files
            .iter()
            .map(|f| f.as_str())
            .filter(|f| !f.trim().is_empty())
            .collect();
        if clean.is_empty() {
            return Ok(());
        }
        let mut args = vec!["checkout", c, "--"];
        args.extend(clean.iter().copied());
        run_git(&repo, &args)?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let n = name.trim();
        if n.is_empty() {
            return Err("Branch-Name darf nicht leer sein".into());
        }
        let flag = if force { "-D" } else { "-d" };
        run_git(&repo, &["branch", flag, "--", n])?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn delete_remote_branch(path: String, remote_ref: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let s = remote_ref.trim();
        let slash = s.find('/').ok_or_else(|| {
            "Ungültige Remote-Ref (erwartet z. B. origin/zweig)".to_string()
        })?;
        let remote = s[..slash].trim();
        let branch = s[slash + 1..].trim();
        if remote.is_empty() || branch.is_empty() {
            return Err("Ungültige Remote-Ref".into());
        }
        let remote = normalized_remote(&repo, Some(remote))?
            .ok_or_else(|| "Ungültige Remote-Ref".to_string())?;
        reject_dash_arg(branch, "Branch-Name")?;
        let out = run_git_merged_output(&repo, &["push", &remote, "--delete", "--", branch])?;
        let _ = run_git_merged_output(&repo, &["fetch", "--prune", "--", &remote]);
        Ok(out)
    }).await
}

#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let tag = name.trim();
        if tag.is_empty() {
            return Err("Tag-Name darf nicht leer sein".into());
        }
        run_git(&repo, &["tag", "-d", "--", tag])?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn delete_remote_tag(path: String, name: String, remote: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let tag = name.trim();
        let r = remote.trim();
        if tag.is_empty() {
            return Err("Tag-Name darf nicht leer sein".into());
        }
        if r.is_empty() {
            return Err("Remote darf nicht leer sein".into());
        }
        let r = normalized_remote(&repo, Some(r))?
            .ok_or_else(|| "Remote darf nicht leer sein".to_string())?;
        reject_dash_arg(tag, "Tag-Name")?;
        let out = run_git_merged_output(&repo, &["push", &r, "--delete", "--", &format!("refs/tags/{tag}")])?;
        let _ = run_git_merged_output(&repo, &["fetch", "--prune", "--prune-tags", "--", &r]);
        Ok(out)
    }).await
}

#[derive(Serialize)]
pub struct StatusEntry {
    path: String,
    index_status: String,
    worktree_status: String,
    staged: bool,
    unstaged: bool,
    untracked: bool,
    additions_staged: u32,
    deletions_staged: u32,
    additions_unstaged: u32,
    deletions_unstaged: u32,
    binary: bool,
    embedded_repo: bool,
}

fn diff_reports_binary(diff: &str) -> bool {
    diff.lines().any(|line| {
        line.starts_with("Binary files ") && line.ends_with(" differ")
    })
}

fn parse_numstat(out: &str) -> HashMap<String, (u32, u32, bool)> {
    let mut map = HashMap::new();
    let mut iter = out.split('\0').filter(|s| !s.is_empty());
    while let Some(part) = iter.next() {
        let mut fields = part.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        let path_part = fields.next().unwrap_or("");
        let binary = adds_s == "-" || dels_s == "-";
        let adds: u32 = adds_s.parse().unwrap_or(0);
        let dels: u32 = dels_s.parse().unwrap_or(0);
        let path = if path_part.is_empty() {
            let _old = iter.next();
            iter.next().unwrap_or("").trim_end_matches('\r').to_string()
        } else {
            path_part.trim_end_matches('\r').to_string()
        };
        if !path.is_empty() {
            map.insert(path, (adds, dels, binary));
        }
    }
    map
}

fn looks_binary(content: &[u8]) -> bool {
    content.iter().take(8000).any(|&b| b == 0)
}

/// Sniff up to 8 KB of a file to decide whether it is binary and count
/// newlines for text files, without slurping the entire file into memory.
/// Returns `(is_binary, line_count_if_text)`.
fn sniff_untracked(path: &std::path::Path) -> Option<(bool, u32)> {
    use std::fs::File;
    use std::io::Read;

    let mut file = File::open(path).ok()?;
    let mut head = [0u8; 8192];
    let n = file.read(&mut head).ok()?;
    let head = &head[..n];

    if head.contains(&0) {
        return Some((true, 0));
    }

    // Full line count without a second read: start with what we have,
    // then stream the rest counting newlines only.
    let mut newlines = head.iter().filter(|&&b| b == b'\n').count() as u32;
    let mut last_byte = head.last().copied();
    let mut buf = [0u8; 16 * 1024];
    loop {
        let r = match file.read(&mut buf) {
            Ok(0) => break,
            Ok(r) => r,
            Err(_) => return Some((false, newlines + if last_byte == Some(b'\n') { 0 } else { 1 })),
        };
        newlines += buf[..r].iter().filter(|&&b| b == b'\n').count() as u32;
        last_byte = Some(buf[r - 1]);
    }

    let lines = if last_byte.is_none() {
        0
    } else if last_byte == Some(b'\n') {
        newlines
    } else {
        newlines + 1
    };
    Some((false, lines))
}

fn compute_status_entries(repo: &Path) -> Result<Vec<StatusEntry>, String> {
    // Run the three git invocations in parallel on worker threads so their
    // wait-times overlap. On Windows and weak CPUs this is ~2-3x faster than
    // sequential spawning.
    let repo_a = repo.to_path_buf();
    let repo_b = repo.to_path_buf();
    let repo_c = repo.to_path_buf();
    let status_handle = std::thread::spawn(move || {
        run_git(
            &repo_a,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )
    });
    let staged_handle = std::thread::spawn(move || {
        run_git(&repo_b, &["diff", "--cached", "--numstat", "-z"])
            .map(|s| parse_numstat(&s))
            .unwrap_or_default()
    });
    let unstaged_handle = std::thread::spawn(move || {
        run_git(&repo_c, &["diff", "--numstat", "-z"])
            .map(|s| parse_numstat(&s))
            .unwrap_or_default()
    });

    let out = status_handle
        .join()
        .map_err(|_| "status thread panicked".to_string())??;
    let staged_numstat = staged_handle
        .join()
        .map_err(|_| "staged diff thread panicked".to_string())?;
    let unstaged_numstat = unstaged_handle
        .join()
        .map_err(|_| "unstaged diff thread panicked".to_string())?;

    let mut entries = Vec::new();
    let mut iter = out.split('\0').peekable();
    while let Some(raw) = iter.next() {
        if raw.is_empty() {
            continue;
        }
        if raw.len() < 3 {
            continue;
        }
        let bytes = raw.as_bytes();
        let index_status = (bytes[0] as char).to_string();
        let worktree_status = (bytes[1] as char).to_string();
        let file_path = raw[3..].trim_end_matches('\r').to_string();

        if index_status == "R" || index_status == "C" {
            let _ = iter.next();
        }

        let untracked = index_status == "?" && worktree_status == "?";
        let staged = !untracked && index_status != " " && index_status != "?";
        let unstaged = !untracked && worktree_status != " " && worktree_status != "?";

        let (additions_staged, deletions_staged, staged_binary) = staged_numstat
            .get(&file_path)
            .copied()
            .unwrap_or((0, 0, false));
        let (mut additions_unstaged, mut deletions_unstaged, unstaged_binary) = unstaged_numstat
            .get(&file_path)
            .copied()
            .unwrap_or((0, 0, false));

        let mut binary = staged_binary || unstaged_binary;
        let mut embedded_repo = false;

        if untracked {
            let abs = repo.join(file_path.trim_end_matches('/'));
            // Nested git repo not tracked as submodule — show it distinctly.
            if abs.is_dir() && (abs.join(".git").exists()) {
                embedded_repo = true;
            } else if let Some((is_binary, lines)) = sniff_untracked(&abs) {
                if is_binary {
                    binary = true;
                } else {
                    additions_unstaged = lines;
                    deletions_unstaged = 0;
                }
            }
        }

        entries.push(StatusEntry {
            path: file_path,
            index_status,
            worktree_status,
            staged,
            unstaged,
            untracked,
            additions_staged,
            deletions_staged,
            additions_unstaged,
            deletions_unstaged,
            binary,
            embedded_repo,
        });
    }

    Ok(entries)
}

fn compute_upstream_sync(repo: &PathBuf) -> UpstreamSyncCounts {
    let Ok(out) = run_git(
        repo,
        &[
            "rev-list",
            "--left-right",
            "--count",
            "@{upstream}...HEAD",
        ],
    ) else {
        return UpstreamSyncCounts { ahead: 0, behind: 0 };
    };
    let mut parts = out.split_whitespace();
    let behind = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let ahead = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    UpstreamSyncCounts { ahead, behind }
}

fn compute_has_upstream(repo: &PathBuf) -> bool {
    git_command()
        .arg("-C")
        .arg(repo)
        .args([
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn repo_status(path: String) -> Result<Vec<StatusEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        compute_status_entries(&repo)
    }).await
}

/// Combined command: performs all status-adjacent lookups in a single IPC
/// round-trip, with the underlying git invocations fanned out on worker
/// threads. Replaces three separate invoke() calls from the frontend.
#[tauri::command]
pub async fn repo_full_status(path: String) -> Result<FullStatus, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let repo_for_sync = repo.clone();
        let repo_for_has = repo.clone();

        let sync_handle = std::thread::spawn(move || compute_upstream_sync(&repo_for_sync));
        let has_handle = std::thread::spawn(move || compute_has_upstream(&repo_for_has));

        let entries = compute_status_entries(&repo)?;
        let upstream_sync = sync_handle
            .join()
            .map_err(|_| "upstream sync thread panicked".to_string())?;
        let has_upstream = has_handle
            .join()
            .map_err(|_| "has upstream thread panicked".to_string())?;

        Ok(FullStatus {
            entries,
            upstream_sync,
            has_upstream,
        })
    }).await
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
        let mut args: Vec<&str> = vec!["add", "--"];
        args.extend(files.iter().map(|s| s.as_str()));
        run_git(&repo, &args)?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    spawn_git(move || {
        if files.is_empty() {
            return Ok(());
        }
        let repo = PathBuf::from(&path);
        let has_head = run_git(&repo, &["rev-parse", "--verify", "HEAD"]).is_ok();
        let mut args: Vec<&str> = if has_head {
            vec!["reset", "HEAD", "--"]
        } else {
            vec!["rm", "--cached", "--"]
        };
        args.extend(files.iter().map(|s| s.as_str()));
        run_git(&repo, &args)?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn commit_changes(
    path: String,
    message: String,
    sign: Option<bool>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let trimmed = message.trim();
        if trimmed.is_empty() {
            return Err("Commit-Nachricht darf nicht leer sein".into());
        }
        let mut args: Vec<&str> = vec!["commit"];
        match sign {
            Some(true) => args.push("-S"),
            Some(false) => args.push("--no-gpg-sign"),
            None => {}
        }
        args.push("-m");
        args.push(trimmed);
        run_git(&repo, &args)?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn commit_amend(path: String, message: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let trimmed = message.trim();
        if trimmed.is_empty() {
            return Err("Commit-Nachricht darf nicht leer sein".into());
        }
        run_git(&repo, &["commit", "--amend", "-m", trimmed])?;
        Ok(())
    }).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningScope {
    pub commit_sign: Option<bool>,
    pub tag_sign: Option<bool>,
    pub format: Option<String>,
    pub signing_key: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningInfo {
    pub commit_sign: bool,
    pub tag_sign: bool,
    pub format: String,
    pub signing_key: Option<String>,
    pub program: String,
    pub tool_available: bool,
    pub tool_version: Option<String>,
    pub local: SigningScope,
    pub global: SigningScope,
}

fn config_value(repo: &PathBuf, scope: Option<&str>, key: &str) -> Option<String> {
    let mut args: Vec<&str> = vec!["config"];
    if let Some(s) = scope {
        args.push(s);
    }
    args.push("--get");
    args.push(key);
    let value = run_git(repo, &args).ok()?;
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn config_bool(repo: &PathBuf, scope: Option<&str>, key: &str) -> Option<bool> {
    let raw = config_value(repo, scope, key)?;
    match raw.to_ascii_lowercase().as_str() {
        "true" | "yes" | "on" | "1" => Some(true),
        "false" | "no" | "off" | "0" | "" => Some(false),
        _ => None,
    }
}

fn signing_scope(repo: &PathBuf, scope: Option<&str>) -> SigningScope {
    SigningScope {
        commit_sign: config_bool(repo, scope, "commit.gpgsign"),
        tag_sign: config_bool(repo, scope, "tag.gpgsign"),
        format: config_value(repo, scope, "gpg.format"),
        signing_key: config_value(repo, scope, "user.signingkey"),
    }
}

fn probe_tool(program: &str, args: &[&str], read_version: bool) -> (bool, Option<String>) {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let Ok(out) = cmd.output() else {
        return (false, None);
    };
    if !read_version {
        return (true, None);
    }
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let version = stdout
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && l.chars().any(|c| c.is_ascii_digit()))
        .map(|l| l.to_string());
    (true, version)
}

pub fn signing_program(format: &str, configured: Option<String>) -> (String, Vec<&'static str>, bool) {
    let ssh_probe = vec!["-Y", "check-novalidate"];
    if let Some(p) = configured.filter(|p| !p.trim().is_empty()) {
        let p = p.trim().to_string();
        return if format == "ssh" {
            (p, ssh_probe, false)
        } else {
            (p, vec!["--version"], true)
        };
    }
    match format {
        "ssh" => ("ssh-keygen".to_string(), ssh_probe, false),
        "x509" => ("gpgsm".to_string(), vec!["--version"], true),
        _ => ("gpg".to_string(), vec!["--version"], true),
    }
}

#[tauri::command]
pub async fn commit_signing_info(path: String) -> Result<SigningInfo, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let local = signing_scope(&repo, Some("--local"));
        let global = signing_scope(&repo, Some("--global"));

        let commit_sign = config_bool(&repo, None, "commit.gpgsign").unwrap_or(false);
        let tag_sign = config_bool(&repo, None, "tag.gpgsign").unwrap_or(false);
        let format = config_value(&repo, None, "gpg.format")
            .map(|f| f.to_ascii_lowercase())
            .unwrap_or_else(|| "openpgp".to_string());
        let signing_key = config_value(&repo, None, "user.signingkey");

        // `gpg.program` is only a legacy synonym for `gpg.openpgp.program`, so it
        // must not stand in for the ssh and x509 programs the way git-config(1)
        // describes it. Falling back to it there reported `gpg` as the signing
        // tool for ssh-signed repositories.
        let configured_program = config_value(&repo, None, &format!("gpg.{format}.program"))
            .or_else(|| match format.as_str() {
                "ssh" | "x509" => None,
                _ => config_value(&repo, None, "gpg.program"),
            });
        let (program, probe_args, read_version) = signing_program(&format, configured_program);
        let (tool_available, tool_version) = probe_tool(&program, &probe_args, read_version);

        Ok(SigningInfo {
            commit_sign,
            tag_sign,
            format,
            signing_key,
            program,
            tool_available,
            tool_version,
            local,
            global,
        })
    })
    .await
}

#[tauri::command]
pub async fn set_commit_signing(
    path: String,
    commit_sign: Option<bool>,
    tag_sign: Option<bool>,
    format: Option<String>,
    signing_key: Option<String>,
) -> Result<SigningInfo, String> {
    let apply_path = path.clone();
    spawn_git(move || {
        let repo = PathBuf::from(apply_path.trim());
        let set = |key: &str, value: Option<String>| -> Result<(), String> {
            match value {
                Some(v) if !v.trim().is_empty() => {
                    run_git(&repo, &["config", "--local", key, v.trim()]).map(|_| ())
                }
                Some(_) => {
                    let _ = run_git(&repo, &["config", "--local", "--unset-all", key]);
                    Ok(())
                }
                None => Ok(()),
            }
        };
        set("commit.gpgsign", commit_sign.map(|v| v.to_string()))?;
        set("tag.gpgsign", tag_sign.map(|v| v.to_string()))?;
        set("gpg.format", format)?;
        set("user.signingkey", signing_key)?;
        Ok::<(), String>(())
    })
    .await?;
    commit_signing_info(path).await
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitSignature {
    pub state: String,
    pub code: String,
    pub signer: Option<String>,
    pub key: Option<String>,
}

pub fn parse_signature_status(raw: &str) -> CommitSignature {
    let line = raw.lines().next().unwrap_or("");
    let mut fields = line.splitn(3, '\u{001f}');
    let code = fields.next().unwrap_or("").trim().to_string();
    let signer = fields.next().unwrap_or("").trim().to_string();
    let key = fields.next().unwrap_or("").trim().to_string();
    let state = match code.as_str() {
        "G" => "good",
        "B" => "invalid",
        "U" | "X" | "Y" | "R" => "untrusted",
        "E" => "unknown_key",
        _ => "unsigned",
    };
    CommitSignature {
        state: state.to_string(),
        code: if code.is_empty() { "N".to_string() } else { code },
        signer: (!signer.is_empty()).then_some(signer),
        key: (!key.is_empty()).then_some(key),
    }
}

#[tauri::command]
pub async fn commit_signature_status(path: String, hash: String) -> Result<CommitSignature, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let c = hash.trim();
        if c.is_empty() {
            return Err("Commit-Referenz fehlt".into());
        }
        let out = run_git(
            &repo,
            &[
                "log",
                "-1",
                "--no-color",
                "--format=%G?\u{001f}%GS\u{001f}%GK",
                c,
            ],
        )?;
        Ok(parse_signature_status(&out))
    })
    .await
}

#[derive(Serialize)]
pub struct FileDiffResponse {
    staged: Option<String>,
    unstaged: Option<String>,
    untracked_plain: Option<String>,
    is_binary: bool,
}

#[tauri::command]
pub async fn repo_staged_diff(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git(&repo, &["diff", "--cached", "--no-color"])
    }).await
}

#[tauri::command]
pub async fn repo_file_diff(path: String, file: String, untracked: bool) -> Result<FileDiffResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let file = file.trim().to_string();
        if untracked {
            let abs = repo.join(&file);
            if abs.is_dir() {
                return Ok(FileDiffResponse {
                    staged: None,
                    unstaged: None,
                    untracked_plain: None,
                    is_binary: true,
                });
            }
            let bytes =
                std::fs::read(&abs).map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
            if looks_binary(&bytes) {
                return Ok(FileDiffResponse {
                    staged: None,
                    unstaged: None,
                    untracked_plain: None,
                    is_binary: true,
                });
            }
            return Ok(FileDiffResponse {
                staged: None,
                unstaged: None,
                untracked_plain: Some(String::from_utf8_lossy(&bytes).to_string()),
                is_binary: false,
            });
        }
        let staged = run_git(
            &repo,
            &["diff", "--cached", "--no-color", "--", &file],
        )
        .unwrap_or_default();
        let unstaged = run_git(&repo, &["diff", "--no-color", "--", &file]).unwrap_or_default();
        let staged_nonempty = (!staged.trim().is_empty()).then_some(staged);
        let unstaged_nonempty = (!unstaged.trim().is_empty()).then_some(unstaged);
        let is_binary = [staged_nonempty.as_deref(), unstaged_nonempty.as_deref()]
            .into_iter()
            .flatten()
            .any(diff_reports_binary);
        if is_binary {
            return Ok(FileDiffResponse {
                staged: None,
                unstaged: None,
                untracked_plain: None,
                is_binary: true,
            });
        }
        Ok(FileDiffResponse {
            staged: staged_nonempty,
            unstaged: unstaged_nonempty,
            untracked_plain: None,
            is_binary: false,
        })
    }).await
}

/// Apply a unified-diff patch to the git index (staging individual hunks/lines).
fn apply_patch_to_index(repo: &PathBuf, patch: &str, reverse: bool) -> Result<(), String> {
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
        .map_err(|e| format!("Fehler beim Starten von git: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| format!("Fehler beim Schreiben des Patches: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Fehler beim Warten auf git: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "git apply fehlgeschlagen".to_string()
        } else {
            err
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn repo_read_file(path: String, file: String) -> Result<String, String> {
    spawn_git(move || {
        let abs = crate::pathsafe::resolve_in_root(&PathBuf::from(path.trim()), file.trim())?;
        std::fs::read_to_string(&abs)
            .map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))
    }).await
}

#[tauri::command]
pub async fn repo_write_file(path: String, file: String, content: String) -> Result<(), String> {
    spawn_git(move || {
        let abs = crate::pathsafe::resolve_in_root(&PathBuf::from(path.trim()), file.trim())?;
        std::fs::write(&abs, content)
            .map_err(|e| format!("Datei konnte nicht geschrieben werden: {e}"))
    }).await
}

#[tauri::command]
pub async fn repo_file_content_at(path: String, file: String, treeish: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let f = file.trim().to_string();
        let t = treeish.trim().to_string();
        let spec = if t.is_empty() { format!(":{f}") } else { format!("{t}:{f}") };
        match run_git_merged_output(&repo, &["show", &spec]) {
            Ok(c) => Ok(c),
            Err(_) => Ok(String::new()),
        }
    }).await
}

/// Stage individual lines/hunks from the working tree into the index.
/// `patch` is a unified diff patch string (subset of `git diff` output).
#[tauri::command]
pub async fn stage_hunk(path: String, patch: String) -> Result<(), String> {
    spawn_git(move || {
        apply_patch_to_index(&PathBuf::from(&path), &patch, false)
    }).await
}

/// Unstage individual lines/hunks from the index (revert to HEAD).
/// `patch` is a unified diff patch string (subset of `git diff --cached` output).
#[tauri::command]
pub async fn unstage_hunk(path: String, patch: String) -> Result<(), String> {
    spawn_git(move || {
        apply_patch_to_index(&PathBuf::from(&path), &patch, true)
    }).await
}

fn apply_patch_to_worktree(repo: &PathBuf, patch: &str, reverse: bool) -> Result<(), String> {
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
        .map_err(|e| format!("Fehler beim Starten von git: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| format!("Fehler beim Schreiben des Patches: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Fehler beim Warten auf git: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "git apply fehlgeschlagen".to_string()
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
    spawn_git(move || {
        apply_patch_to_worktree(&PathBuf::from(&path), &patch, false)
    }).await
}

#[derive(Serialize)]
pub struct CommitChangedFile {
    pub untracked: bool,
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
}

#[derive(Serialize)]
pub struct CommitInspectResponse {
    pub header: String,
    pub files: Vec<CommitChangedFile>,
}

fn commit_changed_files(repo: &PathBuf, commit: &str) -> Result<Vec<CommitChangedFile>, String> {
    let line = run_git(
        repo,
        &["rev-list", "--parents", "-n", "1", commit],
    )?;
    let line = line.lines().next().unwrap_or("").trim();
    let mut toks = line.split_whitespace();
    let _self_oid = toks.next();
    let parents: Vec<&str> = toks.collect();
    let numstat = if parents.is_empty() {
        run_git(
            repo,
            &[
                "diff-tree",
                "--root",
                "-r",
                "--no-commit-id",
                "--numstat",
                "-z",
                "-M",
                commit,
            ],
        )?
    } else {
        let p = parents[0];
        run_git(
            repo,
            &[
                "diff-tree",
                "-r",
                "--no-commit-id",
                "--numstat",
                "-z",
                "-M",
                p,
                commit,
            ],
        )?
    };
    let map = parse_numstat(&numstat);
    let mut files: Vec<CommitChangedFile> = map
        .into_iter()
        .map(|(path, (adds, dels, binary))| CommitChangedFile {
            untracked: false,
            path,
            additions: adds,
            deletions: dels,
            binary,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

#[tauri::command]
pub async fn repo_commit_inspect(path: String, commit: String) -> Result<CommitInspectResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let c = commit.trim();
        if c.is_empty() {
            return Err("Commit-Referenz fehlt".into());
        }
        let header = run_git(
            &repo,
            &[
                "show",
                "--no-color",
                "--no-patch",
                "--stat=200",
                "--format=fuller",
                c,
            ],
        )?;
        let files = commit_changed_files(&repo, c)?;
        Ok(CommitInspectResponse {
            header: header.trim().to_string(),
            files,
        })
    }).await
}

#[derive(Serialize)]
pub struct CommitFileDiffResponse {
    pub diff: Option<String>,
    pub is_binary: bool,
}

#[tauri::command]
pub async fn repo_commit_file_diff(
    path: String,
    commit: String,
    file: String,
) -> Result<CommitFileDiffResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let c = commit.trim();
        let f = file.trim();
        if c.is_empty() || f.is_empty() {
            return Err("Commit oder Dateipfad fehlt".into());
        }

        // Determine the first parent of this commit so we can use the reliable
        // plumbing command `git diff-tree -p` instead of `git show --format=`.
        // On Windows, the empty --format= argument can behave inconsistently
        // across git versions, producing no output even for valid diffs.
        let parents_line = run_git(&repo, &["rev-list", "--parents", "-n", "1", c])
            .unwrap_or_default();
        let mut parent_tokens = parents_line.split_whitespace();
        let _self_hash = parent_tokens.next();
        let first_parent = parent_tokens.next();

        let diff = if let Some(parent) = first_parent {
            // Regular commit: diff against its first parent.
            run_git(
                &repo,
                &["diff-tree", "-p", "--no-commit-id", "--no-color", parent, c, "--", f],
            )
            .unwrap_or_default()
        } else {
            // Initial commit (no parent): compare against the empty tree.
            run_git(
                &repo,
                &["diff-tree", "-p", "--root", "--no-commit-id", "--no-color", c, "--", f],
            )
            .unwrap_or_default()
        };

        let trimmed = diff.trim();
        if diff_reports_binary(&diff) {
            return Ok(CommitFileDiffResponse {
                diff: None,
                is_binary: true,
            });
        }
        Ok(CommitFileDiffResponse {
            diff: (!trimmed.is_empty()).then_some(diff),
            is_binary: false,
        })
    }).await
}

mod stash;
pub use stash::*;

fn parse_behind_from_track(track: &str) -> Option<u32> {
    // %(upstream:track) yields strings like "[ahead 2, behind 3]", "[behind 1]", "[gone]" or ""
    let idx = track.find("behind ")?;
    let rest = &track[idx + "behind ".len()..];
    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    rest[..end].parse::<u32>().ok()
}

fn list_branches(repo: &PathBuf) -> Result<Vec<Branch>, String> {
    let sep = "\x1f";
    let format = format!("%(HEAD){sep}%(refname){sep}%(objectname){sep}%(upstream:track)");
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            &format!("--format={format}"),
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    let branches = out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, sep);
            let head = parts.next()?;
            let refname = parts.next()?;
            let tip = parts.next()?.trim().to_string();
            if tip.is_empty() {
                return None;
            }
            let track = parts.next().unwrap_or("").trim();
            let behind = parse_behind_from_track(track);
            let is_current = head.trim() == "*";

            let (name, is_remote) = if let Some(rest) = refname.strip_prefix("refs/heads/") {
                (rest.to_string(), false)
            } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
                if rest.ends_with("/HEAD") {
                    return None;
                }
                (rest.to_string(), true)
            } else {
                return None;
            };

            Some(Branch {
                name,
                is_current,
                is_remote,
                tip,
                behind,
            })
        })
        .collect();

    Ok(branches)
}

#[derive(Serialize)]
pub struct BranchActivity {
    pub name: String,
    pub is_remote: bool,
    pub last_commit_at: String,
}

fn collect_branch_activity(repo: &PathBuf) -> Result<Vec<BranchActivity>, String> {
    let sep = "\x1f";
    let format = format!("%(refname){sep}%(committerdate:iso-strict)");
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            &format!("--format={format}"),
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    let branches = out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, sep);
            let refname = parts.next()?;
            let last_commit_at = parts.next().unwrap_or("").trim().to_string();
            if last_commit_at.is_empty() {
                return None;
            }

            let (name, is_remote) = if let Some(rest) = refname.strip_prefix("refs/heads/") {
                (rest.to_string(), false)
            } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
                if rest.ends_with("/HEAD") {
                    return None;
                }
                (rest.to_string(), true)
            } else {
                return None;
            };

            Some(BranchActivity {
                name,
                is_remote,
                last_commit_at,
            })
        })
        .collect();

    Ok(branches)
}

#[tauri::command]
pub async fn repo_branch_activity(path: String) -> Result<Vec<BranchActivity>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        collect_branch_activity(&repo)
    })
    .await
}

#[derive(Serialize)]
pub struct BlameEntry {
    pub commit_hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub timestamp: i64,
    pub summary: String,
    pub line_no: u32,
    pub content: String,
}

fn format_blame_date(ts: i64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let diff = now - ts;
    if diff < 60 {
        "gerade eben".to_string()
    } else if diff < 3600 {
        format!("vor {} Min.", diff / 60)
    } else if diff < 86400 {
        format!("vor {} Std.", diff / 3600)
    } else if diff < 86400 * 30 {
        format!("vor {} Tagen", diff / 86400)
    } else if diff < 86400 * 365 {
        format!("vor {} Mon.", diff / (86400 * 30))
    } else {
        format!("vor {} J.", diff / (86400 * 365))
    }
}

fn parse_blame_porcelain(output: &str) -> Vec<BlameEntry> {
    let mut entries = Vec::new();
    let mut commit_cache: HashMap<String, (String, String, i64, String)> = HashMap::new();
    let mut iter = output.lines().peekable();

    while let Some(header) = iter.next() {
        let parts: Vec<&str> = header.splitn(4, ' ').collect();
        if parts.len() < 3 || parts[0].len() != 40 {
            continue;
        }

        let commit_hash = parts[0].to_string();
        let line_no: u32 = parts[2].parse().unwrap_or(0);

        let mut author_buf: Option<String> = None;
        let mut ts_buf: Option<i64> = None;
        let mut summary_buf: Option<String> = None;
        let mut content = String::new();

        loop {
            match iter.next() {
                Some(l) if l.starts_with('\t') => {
                    content = l[1..].to_string();
                    break;
                }
                Some(l) if l.starts_with("author ") && !l.starts_with("author-") => {
                    author_buf = Some(l[7..].to_string());
                }
                Some(l) if l.starts_with("author-time ") => {
                    if let Ok(ts) = l[12..].trim().parse::<i64>() {
                        ts_buf = Some(ts);
                    }
                }
                Some(l) if l.starts_with("summary ") => {
                    summary_buf = Some(l[8..].to_string());
                }
                Some(_) => {}
                None => break,
            }
        }

        let (author, date, timestamp, summary) =
            if let (Some(a), Some(ts), Some(s)) = (author_buf, ts_buf, summary_buf) {
                let d = format_blame_date(ts);
                commit_cache.insert(commit_hash.clone(), (a.clone(), d.clone(), ts, s.clone()));
                (a, d, ts, s)
            } else {
                commit_cache
                    .get(&commit_hash)
                    .cloned()
                    .unwrap_or_default()
            };

        entries.push(BlameEntry {
            short_hash: commit_hash[..8.min(commit_hash.len())].to_string(),
            commit_hash,
            author,
            date,
            timestamp,
            summary,
            line_no,
            content,
        });
    }

    entries
}

#[tauri::command]
pub async fn repo_blame(
    path: String,
    file: String,
    commit: Option<String>,
) -> Result<Vec<BlameEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let mut args = vec!["blame", "--porcelain"];
        if let Some(ref c) = commit {
            args.push(c.as_str());
        }
        args.push("--");
        args.push(file.as_str());
        let output = run_git(&repo, &args)?;
        Ok(parse_blame_porcelain(&output))
    }).await
}

#[tauri::command]
pub async fn repo_list_files(path: String) -> Result<Vec<String>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let out = run_git(&repo, &["ls-files"])?;
        Ok(out.lines().filter(|l| !l.is_empty()).map(|l| l.to_string()).collect())
    }).await
}

mod languages;
pub use languages::*;

mod worktrees;
pub use worktrees::*;

mod submodules;
pub use submodules::*;

mod hooks;
pub use hooks::*;

mod bisect;
pub use bisect::*;

#[tauri::command]
pub async fn git_reset(path: String, target: String, mode: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let t = target.trim();
        if t.is_empty() {
            return Err("Ziel darf nicht leer sein".into());
        }
        let flag = match mode.trim() {
            "soft" => "--soft",
            "hard" => "--hard",
            _ => "--mixed",
        };
        run_git_merged_output(&repo, &["reset", flag, t])
    }).await
}

#[derive(Serialize, Clone)]
pub struct ContributorStat {
    pub name: String,
    pub email: String,
    pub commits: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Serialize, Clone)]
pub struct ActivityBucket {
    pub bucket: String,
    pub commits: u32,
    pub insertions: u32,
    pub deletions: u32,
}

type AggCache<T> = HashMap<String, (String, T)>;

const AGG_CACHE_MAX: usize = 50;

fn contributor_cache() -> &'static std::sync::Mutex<AggCache<Vec<ContributorStat>>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<AggCache<Vec<ContributorStat>>>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn activity_cache() -> &'static std::sync::Mutex<AggCache<Vec<ActivityBucket>>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<AggCache<Vec<ActivityBucket>>>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn agg_head_oid(repo: &PathBuf) -> Option<String> {
    run_git(repo, &["rev-parse", "HEAD"])
        .ok()
        .map(|out| out.trim().to_string())
        .filter(|oid| !oid.is_empty())
}

fn agg_cache_get<T: Clone>(
    cache: &'static std::sync::Mutex<AggCache<T>>,
    key: &str,
    head: &str,
) -> Option<T> {
    let map = cache.lock().ok()?;
    let (cached_head, value) = map.get(key)?;
    (cached_head == head).then(|| value.clone())
}

fn agg_cache_put<T>(
    cache: &'static std::sync::Mutex<AggCache<T>>,
    key: String,
    head: String,
    value: T,
) {
    let Ok(mut map) = cache.lock() else { return };
    if map.len() >= AGG_CACHE_MAX && !map.contains_key(&key) {
        map.clear();
    }
    map.insert(key, (head, value));
}

#[derive(Serialize)]
pub struct RepoOverview {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub dirty_count: u32,
    pub last_commit_at: Option<i64>,
    pub commits_last_30d: Vec<u32>,
    pub error: Option<String>,
}

fn since_arg(days: u32) -> String {
    format!("--since={days}.days.ago")
}

fn collect_contributor_stats(
    repo: &PathBuf,
    days: u32,
    include_merges: bool,
) -> Result<Vec<ContributorStat>, String> {
    let since = since_arg(days);
    let mut args: Vec<&str> = vec!["log"];
    if !include_merges {
        args.push("--no-merges");
    }
    args.extend_from_slice(&[&since, "--numstat", "--pretty=format:%x00%aN%x1f%aE"]);
    let out = run_git(repo, &args)?;

    let mut map: HashMap<(String, String), (u32, u32, u32)> = HashMap::new();
    let mut current: Option<(String, String)> = None;
    for raw_line in out.split('\n') {
        if let Some(rest) = raw_line.strip_prefix('\u{0}') {
            let mut parts = rest.splitn(2, '\u{001f}');
            let name = parts.next().unwrap_or("").trim().to_string();
            let email = parts.next().unwrap_or("").trim().to_string();
            if name.is_empty() && email.is_empty() {
                current = None;
                continue;
            }
            let key = (name.clone(), email.clone());
            map.entry(key.clone()).or_insert((0, 0, 0)).0 += 1;
            current = Some(key);
            continue;
        }
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let Some(key) = current.as_ref() else { continue };
        let mut fields = line.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        if adds_s == "-" || dels_s == "-" {
            continue;
        }
        let adds: u32 = adds_s.parse().unwrap_or(0);
        let dels: u32 = dels_s.parse().unwrap_or(0);
        let entry = map.entry(key.clone()).or_insert((0, 0, 0));
        entry.1 += adds;
        entry.2 += dels;
    }

    let mut stats: Vec<ContributorStat> = map
        .into_iter()
        .map(|((name, email), (commits, insertions, deletions))| ContributorStat {
            name,
            email,
            commits,
            insertions,
            deletions,
        })
        .collect();
    stats.sort_by(|a, b| b.commits.cmp(&a.commits).then(b.insertions.cmp(&a.insertions)));
    Ok(stats)
}

#[tauri::command]
pub async fn repo_contributor_stats(
    path: String,
    since_days: u32,
    limit: Option<u32>,
    include_merges: Option<bool>,
) -> Result<Vec<ContributorStat>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let merges = include_merges.unwrap_or(false);
        let head = agg_head_oid(&repo);
        let key = format!("{}|{since_days}|{merges}", repo.to_string_lossy());
        let mut stats = match head
            .as_deref()
            .and_then(|oid| agg_cache_get(contributor_cache(), &key, oid))
        {
            Some(hit) => hit,
            None => {
                let fresh = collect_contributor_stats(&repo, since_days, merges)?;
                if let Some(oid) = head {
                    agg_cache_put(contributor_cache(), key, oid, fresh.clone());
                }
                fresh
            }
        };
        if let Some(n) = limit {
            stats.truncate(n as usize);
        }
        Ok(stats)
    })
    .await
}

fn days_since_epoch(ts: i64) -> i64 {
    ts.div_euclid(86_400)
}

fn ymd_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

fn bucket_key(ts: i64, bucket: &str) -> String {
    let day = days_since_epoch(ts);
    match bucket {
        "month" => {
            let (y, m, _d) = ymd_from_days(day);
            format!("{y:04}-{m:02}-01")
        }
        "week" => {
            // epoch day 0 (1970-01-01) was a Thursday; Monday-aligned start.
            let weekday = (day + 3).rem_euclid(7);
            let monday = day - weekday;
            let (y, m, d) = ymd_from_days(monday);
            format!("{y:04}-{m:02}-{d:02}")
        }
        _ => {
            let (y, m, d) = ymd_from_days(day);
            format!("{y:04}-{m:02}-{d:02}")
        }
    }
}

fn collect_activity_buckets(
    repo: &PathBuf,
    days: u32,
    bucket: &str,
    include_merges: bool,
) -> Result<Vec<ActivityBucket>, String> {
    let since = since_arg(days);
    let mut args: Vec<&str> = vec!["log"];
    if !include_merges {
        args.push("--no-merges");
    }
    args.extend_from_slice(&[&since, "--numstat", "--pretty=format:%x00%ct"]);
    let out = run_git(repo, &args)?;

    let mut by_key: std::collections::BTreeMap<String, (u32, u32, u32)> =
        std::collections::BTreeMap::new();
    let mut current_key: Option<String> = None;
    for raw_line in out.split('\n') {
        if let Some(rest) = raw_line.strip_prefix('\u{0}') {
            let ts: i64 = rest.trim().parse().unwrap_or(0);
            if ts <= 0 {
                current_key = None;
                continue;
            }
            let key = bucket_key(ts, bucket);
            by_key.entry(key.clone()).or_insert((0, 0, 0)).0 += 1;
            current_key = Some(key);
            continue;
        }
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let Some(key) = current_key.as_ref() else { continue };
        let mut fields = line.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        if adds_s == "-" || dels_s == "-" {
            continue;
        }
        let adds: u32 = adds_s.parse().unwrap_or(0);
        let dels: u32 = dels_s.parse().unwrap_or(0);
        let entry = by_key.entry(key.clone()).or_insert((0, 0, 0));
        entry.1 += adds;
        entry.2 += dels;
    }

    Ok(by_key
        .into_iter()
        .map(|(bucket, (commits, insertions, deletions))| ActivityBucket {
            bucket,
            commits,
            insertions,
            deletions,
        })
        .collect())
}

#[tauri::command]
pub async fn repo_activity_buckets(
    path: String,
    since_days: u32,
    bucket: String,
    include_merges: Option<bool>,
) -> Result<Vec<ActivityBucket>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let kind = match bucket.as_str() {
            "month" | "week" | "day" => bucket.as_str(),
            _ => "day",
        };
        let merges = include_merges.unwrap_or(false);
        let head = agg_head_oid(&repo);
        let key = format!("{}|{since_days}|{kind}|{merges}", repo.to_string_lossy());
        if let Some(hit) = head
            .as_deref()
            .and_then(|oid| agg_cache_get(activity_cache(), &key, oid))
        {
            return Ok(hit);
        }
        let fresh = collect_activity_buckets(&repo, since_days, kind, merges)?;
        if let Some(oid) = head {
            agg_cache_put(activity_cache(), key, oid, fresh.clone());
        }
        Ok(fresh)
    })
    .await
}

fn collect_repo_overview(path: String) -> RepoOverview {
    let repo = PathBuf::from(path.trim());
    let name = repo
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let head_ok = run_git(&repo, &["rev-parse", "--git-dir"]).is_ok();
    if !head_ok {
        return RepoOverview {
            path,
            name,
            branch: String::new(),
            ahead: 0,
            behind: 0,
            dirty_count: 0,
            last_commit_at: None,
            commits_last_30d: vec![0; 30],
            error: Some("not a git repository".into()),
        };
    }

    let branch = run_git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let sync = compute_upstream_sync(&repo);

    let dirty_count = match run_git(&repo, &["status", "--porcelain=v1", "-z", "--untracked-files=normal"]) {
        Ok(out) => out.split('\0').filter(|s| !s.is_empty()).count() as u32,
        Err(_) => 0,
    };

    let last_commit_at = run_git(&repo, &["log", "-1", "--format=%ct"])
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok());

    let mut counts = vec![0u32; 30];
    if let Ok(out) = run_git(
        &repo,
        &[
            "log",
            "--no-merges",
            "--since=30.days.ago",
            "--pretty=format:%ct",
        ],
    ) {
        let now_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let now_day = days_since_epoch(now_secs);
        for line in out.lines() {
            let ts: i64 = match line.trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let days_ago = now_day - days_since_epoch(ts);
            if (0..30).contains(&days_ago) {
                let idx = 29 - days_ago as usize;
                counts[idx] = counts[idx].saturating_add(1);
            }
        }
    }

    RepoOverview {
        path,
        name,
        branch,
        ahead: sync.ahead,
        behind: sync.behind,
        dirty_count,
        last_commit_at,
        commits_last_30d: counts,
        error: None,
    }
}

#[tauri::command]
pub async fn repos_overview(paths: Vec<String>) -> Result<Vec<RepoOverview>, String> {
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
    let mut handles = Vec::with_capacity(paths.len());
    for p in paths {
        let permit = semaphore.clone().acquire_owned().await.map_err(|e| e.to_string())?;
        handles.push(tokio::task::spawn_blocking(move || {
            let _permit = permit;
            collect_repo_overview(p)
        }));
    }
    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        match h.await {
            Ok(ov) => out.push(ov),
            Err(_) => continue,
        }
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct RangeCommitsResponse {
    pub commits: Vec<Commit>,
    pub files: Vec<CommitChangedFile>,
    pub total_commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub truncated: bool,
}

const RANGE_MAX_COMMITS: usize = 400;
const RANGE_MAX_FILES: usize = 500;

fn range_rev_exists(repo: &PathBuf, rev: &str) -> bool {
    run_git(repo, &["rev-parse", "-q", "--verify", &format!("{rev}^{{commit}}")]).is_ok()
}

fn range_commits(repo: &PathBuf, spec: &str, limit: usize) -> Result<Vec<Commit>, String> {
    let sep = "\x1f";
    let format = format!("--pretty=format:%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b");
    let max_count = format!("--max-count={limit}");
    let out = run_git(repo, &["log", "-z", &max_count, &format, spec])?;
    Ok(out
        .split('\0')
        .filter(|chunk| !chunk.is_empty())
        .filter_map(|record| {
            let mut parts = record.splitn(8, sep);
            let hash = parts.next()?.to_string();
            let short_hash = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let email = parts.next()?.to_string();
            let date = parts.next()?.to_string();
            let parents = parts
                .next()?
                .split_whitespace()
                .map(|s| s.to_string())
                .collect();
            let subject = parts.next()?.to_string();
            let body = parts.next().unwrap_or_default().to_string();
            Some(Commit {
                hash,
                short_hash,
                author,
                email,
                date,
                subject,
                body,
                parents,
                tags: Vec::new(),
                author_avatar: None,
            })
        })
        .collect())
}

fn range_log_numstat(repo: &PathBuf, spec: &str, limit: usize) -> Vec<CommitChangedFile> {
    let max_count = format!("--max-count={limit}");
    let Ok(out) = run_git(
        repo,
        &[
            "log",
            "--no-renames",
            "--numstat",
            "--format=%x00",
            &max_count,
            spec,
        ],
    ) else {
        return Vec::new();
    };
    let mut map: HashMap<String, (u32, u32, bool)> = HashMap::new();
    for raw_line in out.split('\n') {
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() || line.starts_with('\u{0}') {
            continue;
        }
        let mut fields = line.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        let path = fields.next().unwrap_or("").trim();
        if path.is_empty() {
            continue;
        }
        let binary = adds_s == "-" || dels_s == "-";
        let entry = map.entry(path.to_string()).or_insert((0, 0, false));
        entry.0 += adds_s.parse::<u32>().unwrap_or(0);
        entry.1 += dels_s.parse::<u32>().unwrap_or(0);
        entry.2 = entry.2 || binary;
    }
    map.into_iter()
        .map(|(path, (additions, deletions, binary))| CommitChangedFile {
            untracked: false,
            path,
            additions,
            deletions,
            binary,
        })
        .collect()
}

fn range_diff_numstat(repo: &PathBuf, base: &str, head: &str) -> Option<Vec<CommitChangedFile>> {
    let out = run_git(
        repo,
        &[
            "diff",
            "--numstat",
            "-z",
            "--no-renames",
            &format!("{base}...{head}"),
        ],
    )
    .ok()?;
    Some(
        parse_numstat(&out)
            .into_iter()
            .map(|(path, (additions, deletions, binary))| CommitChangedFile {
            untracked: false,
                path,
                additions,
                deletions,
                binary,
            })
            .collect(),
    )
}

#[tauri::command]
pub async fn repo_range_commits(
    path: String,
    base: Option<String>,
    head: String,
    limit: Option<u32>,
) -> Result<RangeCommitsResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let head = head.trim().to_string();
        if head.is_empty() {
            return Err("Head-Referenz fehlt".into());
        }
        if !range_rev_exists(&repo, &head) {
            return Err(format!("Referenz {head} existiert nicht"));
        }
        let base = base
            .map(|b| b.trim().to_string())
            .filter(|b| !b.is_empty() && range_rev_exists(&repo, b));
        let limit = (limit.unwrap_or(60) as usize).clamp(1, RANGE_MAX_COMMITS);
        let spec = match base.as_deref() {
            Some(b) => format!("{b}..{head}"),
            None => head.clone(),
        };

        let total_commits = run_git(&repo, &["rev-list", "--count", &spec])
            .ok()
            .and_then(|out| out.trim().parse::<u32>().ok())
            .unwrap_or(0);
        let commits = range_commits(&repo, &spec, limit)?;

        let mut files = match base.as_deref() {
            Some(b) => range_diff_numstat(&repo, b, &head)
                .unwrap_or_else(|| range_log_numstat(&repo, &spec, limit)),
            None => range_log_numstat(&repo, &spec, limit),
        };
        files.sort_by(|a, b| {
            (b.additions + b.deletions)
                .cmp(&(a.additions + a.deletions))
                .then_with(|| a.path.cmp(&b.path))
        });
        let files_truncated = files.len() > RANGE_MAX_FILES;
        files.truncate(RANGE_MAX_FILES);

        let additions = files.iter().map(|f| f.additions).sum();
        let deletions = files.iter().map(|f| f.deletions).sum();
        Ok(RangeCommitsResponse {
            truncated: files_truncated || total_commits as usize > commits.len(),
            commits,
            files,
            total_commits,
            additions,
            deletions,
        })
    })
    .await
}

#[cfg(test)]
mod remote_progress_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempPath {
        path: PathBuf,
    }

    impl Drop for TempPath {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn temp_path(tag: &str) -> TempPath {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!(
            "l8git-progress-{tag}-{}-{id}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        TempPath { path }
    }

    fn stream(cwd: Option<&PathBuf>, args: &[&str], op_id: &str) -> (StreamOutcome, Vec<ProgressLine>) {
        let owned: Vec<String> = args.iter().map(|a| a.to_string()).collect();
        let mut lines: Vec<ProgressLine> = Vec::new();
        let outcome = run_git_streamed(cwd, &owned, op_id, |line| lines.push(line)).unwrap();
        (outcome, lines)
    }

    fn phase_percent(lines: &[ProgressLine], phase: &str) -> Vec<Option<u8>> {
        lines
            .iter()
            .filter(|l| l.phase == phase)
            .map(|l| l.percent)
            .collect()
    }

    #[test]
    fn parses_captured_progress_stream() {
        let captured = "remote: Enumerating objects: 62, done.        \rremote: Counting objects:  50% (31/62)        \rremote: Counting objects: 100% (62/62), done.        \rReceiving objects:  98% (61/62)\rReceiving objects: 100% (62/62), 1.16 MiB | 35.94 MiB/s, done.\nResolving deltas: 100% (10/10), done.\nTo /tmp/origin.git\n * [new branch]      HEAD -> main\n";

        let mut lines: Vec<ProgressLine> = Vec::new();
        let transcript = read_progress_stream(captured.as_bytes(), |line| lines.push(line));

        assert_eq!(lines.len(), 6);
        assert_eq!(lines[0].phase, "Enumerating objects");
        assert_eq!(lines[0].percent, None);
        assert_eq!(lines[0].detail, "62, done.");
        assert_eq!(lines[1].phase, "Counting objects");
        assert_eq!(lines[1].percent, Some(50));
        assert_eq!(lines[1].detail, "(31/62)");
        assert_eq!(lines[3].phase, "Receiving objects");
        assert_eq!(lines[3].percent, Some(98));
        assert_eq!(lines[4].percent, Some(100));
        assert_eq!(lines[4].detail, "(62/62), 1.16 MiB | 35.94 MiB/s, done.");
        assert_eq!(lines[5].phase, "Resolving deltas");

        assert!(!transcript.contains("50%"), "transcript: {transcript}");
        assert!(!transcript.contains("98%"), "transcript: {transcript}");
        assert!(transcript.contains("To /tmp/origin.git"));
        assert!(transcript.contains("[new branch]"));
        assert!(transcript.lines().count() < 8);
    }

    #[test]
    fn ignores_non_progress_output() {
        assert!(parse_progress_chunk("Cloning into 'x'...").is_none());
        assert!(parse_progress_chunk("remote: Total 62 (delta 0), reused 0").is_none());
        assert!(parse_progress_chunk("To C:\\repos\\demo").is_none());
        assert!(parse_progress_chunk("fatal: repository 'x' not found").is_none());
        assert!(parse_progress_chunk("").is_none());
        let updating = parse_progress_chunk("Updating files:  67% (2/3)").unwrap();
        assert_eq!(updating.phase, "Updating files");
        assert_eq!(updating.percent, Some(67));
    }

    #[test]
    fn streams_progress_for_push_fetch_and_clone() {
        let bare = temp_path("bare");
        let work = temp_path("work");
        let clone = temp_path("clone");
        std::fs::create_dir_all(&bare.path).unwrap();
        std::fs::create_dir_all(&work.path).unwrap();
        run_git(&bare.path, &["-c", "init.defaultBranch=main", "init", "--bare", "-q", "."]).unwrap();
        run_git(&work.path, &["-c", "init.defaultBranch=main", "init", "-q", "."]).unwrap();
        run_git(&work.path, &["config", "user.email", "test@example.com"]).unwrap();
        run_git(&work.path, &["config", "user.name", "Test"]).unwrap();
        run_git(&work.path, &["config", "commit.gpgsign", "false"]).unwrap();
        for n in 1..=8 {
            std::fs::write(work.path.join(format!("f{n}.txt")), format!("{n}\n")).unwrap();
        }
        run_git(&work.path, &["add", "-A"]).unwrap();
        run_git(&work.path, &["commit", "-q", "-m", "initial"]).unwrap();

        let bare_url = bare.path.to_string_lossy().to_string();
        let (pushed, push_lines) = stream(
            Some(&work.path),
            &["push", "--progress", "-u", &bare_url, "HEAD:main"],
            "test-push",
        );
        assert!(pushed.success, "push failed: {}", pushed.stderr);
        assert!(
            phase_percent(&push_lines, "Writing objects").contains(&Some(100)),
            "phases: {:?}",
            push_lines.iter().map(|l| &l.phase).collect::<Vec<_>>()
        );

        let (cloned, clone_lines) = stream(
            None,
            &[
                "clone",
                "--progress",
                "--no-local",
                &bare_url,
                &clone.path.to_string_lossy(),
            ],
            "test-clone",
        );
        assert!(cloned.success, "clone failed: {}", cloned.stderr);
        assert!(
            phase_percent(&clone_lines, "Receiving objects").contains(&Some(100)),
            "phases: {:?}",
            clone_lines.iter().map(|l| &l.phase).collect::<Vec<_>>()
        );
        assert!(clone_lines.len() > phase_percent(&clone_lines, "Receiving objects").len());

        run_git(&clone.path, &["config", "user.email", "test@example.com"]).unwrap();
        run_git(&clone.path, &["config", "user.name", "Test"]).unwrap();
        run_git(&clone.path, &["config", "commit.gpgsign", "false"]).unwrap();
        std::fs::write(clone.path.join("next.txt"), "next\n").unwrap();
        run_git(&clone.path, &["add", "-A"]).unwrap();
        run_git(&clone.path, &["commit", "-q", "-m", "second"]).unwrap();
        run_git(&clone.path, &["push", "-q", "origin", "HEAD:main"]).unwrap();

        let (fetched, fetch_lines) = stream(
            Some(&work.path),
            &["fetch", "--progress", &bare_url, "main"],
            "test-fetch",
        );
        assert!(fetched.success, "fetch failed: {}", fetched.stderr);
        assert!(
            phase_percent(&fetch_lines, "Counting objects").contains(&Some(100)),
            "phases: {:?}",
            fetch_lines.iter().map(|l| &l.phase).collect::<Vec<_>>()
        );
        assert!(!fetched.canceled);
    }

    #[test]
    fn registry_is_empty_after_completed_op() {
        let repo = temp_path("registry");
        std::fs::create_dir_all(&repo.path).unwrap();
        run_git(&repo.path, &["init", "-q", "."]).unwrap();
        let (outcome, _) = stream(Some(&repo.path), &["status", "--porcelain"], "test-registry");
        assert!(outcome.success);
        assert!(!remote_ops().lock().unwrap().contains_key("test-registry"));
    }

    #[tokio::test]
    async fn cancel_reports_false_for_unknown_op() {
        assert!(!git_remote_cancel("no-such-op".into()).await.unwrap());
    }

    #[tokio::test]
    async fn cancel_kills_running_op_and_its_children() {
        let repo = temp_path("cancel");
        std::fs::create_dir_all(&repo.path).unwrap();
        run_git(&repo.path, &["init", "-q", "."]).unwrap();
        let path = repo.path.clone();
        let started = std::time::Instant::now();
        let runner = tokio::task::spawn_blocking(move || {
            stream(
                Some(&path),
                &["-c", "alias.slowop=!sleep 20", "slowop"],
                "test-cancel",
            )
        });

        let mut registered = false;
        for _ in 0..150 {
            if remote_ops().lock().unwrap().contains_key("test-cancel") {
                registered = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(registered, "op was never registered");
        assert!(git_remote_cancel("test-cancel".into()).await.unwrap());

        let (outcome, _) = runner.await.unwrap();
        assert!(outcome.canceled);
        assert!(!outcome.success);
        assert!(
            started.elapsed() < std::time::Duration::from_secs(15),
            "cancel did not stop the child process"
        );
        assert!(!remote_ops().lock().unwrap().contains_key("test-cancel"));
    }
}
