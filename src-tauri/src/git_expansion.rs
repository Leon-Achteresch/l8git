//! Pinned history inspection and isolated Git workflow experiments.
use crate::cmd::{cli_command, git_command};
use crate::git::{
    repo_coordination_mutex, repo_mutation_mutex, resolve_git_commit, run_git, WorktreePathGuard,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const OUTPUT_LIMIT: usize = 4 * 1024 * 1024;
const FILE_LIMIT: usize = 8 * 1024 * 1024;
const SNAPSHOT_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommandSpec {
    program: String,
    args: Vec<String>,
    timeout_seconds: u64,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorktreeProfile {
    id: String,
    name: String,
    copy_files: Vec<String>,
    commands: Vec<CommandSpec>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanStep {
    kind: String,
    commit: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LineSelection {
    source_start: usize,
    source_end: usize,
    target_start: usize,
    target_end: usize,
}
#[derive(Deserialize)]
#[serde(
    tag = "op",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GitExpansionRequest {
    SourceFiles {
        files: Vec<String>,
        expected_head: String,
    },
    EvidenceRun {
        base_path: String,
        expected_base_head: String,
        expected_head: String,
        expected_fingerprint: String,
        command: CommandSpec,
        confirmed: bool,
    },
    Pickaxe {
        text: String,
        mode: String,
        revision: Option<String>,
        page: usize,
    },
    FunctionHistory {
        file: String,
        revision: String,
        start: usize,
        end: usize,
        page: usize,
    },
    RangeDiff {
        old_base: String,
        old_head: String,
        new_base: String,
        new_head: String,
    },
    BlameIgnore {
        file: String,
        revision: String,
    },
    RestorePreview {
        file: String,
        revision: Option<String>,
        snapshot_id: Option<String>,
        selection: Option<LineSelection>,
    },
    RestoreApply {
        preview_id: String,
        expected_fingerprint: String,
    },
    RerereStatus,
    RerereConfigure {
        enabled: bool,
        expected_enabled: Option<bool>,
    },
    RerereForget {
        file: String,
        expected_head: String,
    },
    ProfilesList,
    ProfilesSave {
        profiles: Vec<WorktreeProfile>,
        expected_fingerprint: String,
    },
    ProfileApply {
        profile_id: String,
        target_path: String,
        expected_profile_fingerprint: String,
        confirmed: bool,
    },
    Housekeeping,
    BisectTest {
        command: CommandSpec,
        expected_head: String,
        mark_result: bool,
        confirmed: bool,
    },
    SparseStatus,
    SparseSet {
        directories: Vec<String>,
        expected_head: String,
        confirmed: bool,
    },
    SparseDisable {
        expected_head: String,
        confirmed: bool,
    },
    Integration {
        base: String,
        heads: Vec<String>,
        command: Option<CommandSpec>,
        confirmed: bool,
    },
    Overlap {
        base: String,
        heads: Vec<String>,
        include_worktrees: Option<bool>,
    },
    BehaviorCompare {
        base: String,
        head: String,
        command: CommandSpec,
        artifacts: Vec<String>,
        confirmed: bool,
    },
    SnapshotsList,
    SnapshotCapture {
        label: String,
        expected_head: String,
    },
    SnapshotRestoreIndex {
        snapshot_id: String,
        expected_head: String,
        expected_index_tree: String,
    },
    SnapshotRescueBranch {
        snapshot_id: String,
        branch: String,
    },
    PlanPreview {
        base: String,
        steps: Vec<PlanStep>,
    },
    PlanExport {
        plan_id: String,
        branch: String,
        expected_head: String,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunResult {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    truncated: bool,
    timed_out: bool,
    duration_ms: u128,
    #[serde(skip)]
    raw_stdout: Vec<u8>,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}
fn unique_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}-{}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn id_ok(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 100
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Invalid expansion record ID".into());
    }
    Ok(())
}
fn validated_file(repo: &PathBuf, file: &str) -> Result<PathBuf, String> {
    if file.len() > 4096 || file.chars().any(char::is_control) {
        return Err("Invalid file path".into());
    }
    WorktreePathGuard::new(repo)?.regular_file(file)
}
fn read_regular(repo: &PathBuf, file: &str) -> Result<Option<Vec<u8>>, String> {
    validated_file(repo, file)?;
    let mut file = match crate::git::open_worktree_file(repo, file) {
        Ok(file) => file,
        Err(error) => {
            // Preserve missing-file state; every other guarded-open failure is real.
            if !validated_file(repo, file)?.exists() {
                return Ok(None);
            }
            return Err(error);
        }
    };
    let mut data = Vec::new();
    Read::by_ref(&mut file)
        .take((FILE_LIMIT + 1) as u64)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > FILE_LIMIT {
        return Err("File exceeds the 8 MiB inspection limit".into());
    }
    Ok(Some(data))
}
fn text(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.contains(&0) {
        return Err("This operation supports text files only".into());
    }
    String::from_utf8(bytes).map_err(|_| "This operation supports UTF-8 text only".into())
}
fn ensure_confirmed(confirmed: bool) -> Result<(), String> {
    if confirmed {
        Ok(())
    } else {
        Err("Explicit confirmation is required to execute this action".into())
    }
}
fn pinned(repo: &PathBuf, revision: &str) -> Result<String, String> {
    resolve_git_commit(repo, revision)
}
fn require_head(repo: &PathBuf, expected: &str) -> Result<String, String> {
    let head = pinned(repo, "HEAD")?;
    if head != expected {
        return Err("__HEAD_CHANGED__".into());
    }
    Ok(head)
}
fn common_dir(repo: &PathBuf) -> Result<PathBuf, String> {
    let raw = run_git(
        repo,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?;
    PathBuf::from(raw.trim_end_matches(['\r', '\n']))
        .canonicalize()
        .map_err(|e| e.to_string())
}
fn state_dir(repo: &PathBuf, area: &str) -> Result<PathBuf, String> {
    let root = common_dir(repo)?;
    let state = root.join("l8git-expansion");
    for dir in [&state, &state.join(area)] {
        if fs::symlink_metadata(dir).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Expansion metadata must not be a symlink".into());
        }
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(state.join(area))
}
fn record_path(repo: &PathBuf, area: &str, id: &str) -> Result<PathBuf, String> {
    id_ok(id)?;
    let path = state_dir(repo, area)?.join(format!("{id}.json"));
    if fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("Invalid metadata link".into());
    }
    Ok(path)
}
fn save_record<T: Serialize>(
    repo: &PathBuf,
    area: &str,
    id: &str,
    value: &T,
) -> Result<(), String> {
    let destination = record_path(repo, area, id)?;
    let tmp = destination.with_extension(format!("{}.tmp", unique_id()));
    let data = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    if data.len() > SNAPSHOT_LIMIT * 2 {
        return Err("Expansion record exceeds storage limit".into());
    }
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&tmp).map_err(|e| e.to_string())?;
        file.write_all(&data)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        // Existing records are immutable except the explicitly CAS-guarded profiles document.
        #[cfg(windows)]
        if destination.exists() {
            fs::remove_file(&destination).map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp, &destination).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}
fn read_record<T: serde::de::DeserializeOwned>(
    repo: &PathBuf,
    area: &str,
    id: &str,
) -> Result<T, String> {
    let path = record_path(repo, area, id)?;
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut data = Vec::new();
    Read::by_ref(&mut file)
        .take((SNAPSHOT_LIMIT * 2 + 1) as u64)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > SNAPSHOT_LIMIT * 2 {
        return Err("Oversize expansion record".into());
    }
    serde_json::from_slice(&data).map_err(|e| e.to_string())
}
fn drain(mut input: impl Read) -> (Vec<u8>, bool) {
    let mut output = Vec::new();
    let mut truncated = false;
    let mut buffer = [0; 8192];
    while let Ok(count) = input.read(&mut buffer) {
        if count == 0 {
            break;
        }
        let keep = count.min(OUTPUT_LIMIT.saturating_sub(output.len()));
        output.extend_from_slice(&buffer[..keep]);
        truncated |= keep != count;
    }
    (output, truncated)
}
fn execute(
    mut command: Command,
    timeout: u64,
    input: Option<Vec<u8>>,
) -> Result<RunResult, String> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let started = Instant::now();
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start process: {e}"))?;
    #[cfg(windows)]
    let job = match crate::pty::job::PtyJob::create_for(child.id()) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Cannot contain process tree: {error}"));
        }
    };
    let stdout = child.stdout.take().ok_or("Missing stdout")?;
    let stderr = child.stderr.take().ok_or("Missing stderr")?;
    let out = std::thread::spawn(move || drain(stdout));
    let err = std::thread::spawn(move || drain(stderr));
    let writer = input.and_then(|data| {
        child.stdin.take().map(|mut stdin| {
            std::thread::spawn(move || {
                let _ = stdin.write_all(&data);
            })
        })
    });
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if started.elapsed() < Duration::from_secs(timeout.clamp(1, 300)) => {
                std::thread::sleep(Duration::from_millis(15))
            }
            Ok(None) => {
                timed_out = true;
                let _ = child.kill();
                break child.wait();
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error);
            }
        }
    };
    // Kill descendants even when their parent exited successfully; background processes
    // must not keep output pipes open or survive a temporary worktree's cleanup.
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    drop(job);
    if let Some(writer) = writer {
        let _ = writer.join();
    }
    let (stdout, out_truncated) = out.join().map_err(|_| "Output reader failed")?;
    let (stderr, err_truncated) = err.join().map_err(|_| "Error reader failed")?;
    let status = status.map_err(|e| e.to_string())?;
    Ok(RunResult {
        exit_code: status.code(),
        stdout: String::from_utf8_lossy(&stdout).into(),
        stderr: String::from_utf8_lossy(&stderr).into(),
        truncated: out_truncated || err_truncated,
        timed_out,
        duration_ms: started.elapsed().as_millis(),
        raw_stdout: stdout,
    })
}
fn success(result: RunResult) -> Result<String, String> {
    if result.timed_out {
        return Err("Git operation timed out".into());
    }
    if result.truncated {
        return Err("Git output exceeds the 4 MiB inspection limit; narrow the selection".into());
    }
    if result.exit_code != Some(0) {
        return Err(format!("{}\n{}", result.stderr, result.stdout)
            .trim()
            .into());
    }
    Ok(result.stdout)
}
fn safe_command(repo: &PathBuf) -> Result<Command, String> {
    let hooks = state_dir(repo, "empty-hooks")?;
    if fs::read_dir(&hooks)
        .map_err(|e| e.to_string())?
        .next()
        .is_some()
    {
        return Err("The isolated hooks directory is not empty".into());
    }
    let mut command = git_command();
    command
        .arg("-C")
        .arg(repo)
        .args([
            "--no-pager",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "submodule.recurse=false",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "merge.autoStash=false",
            "-c",
            "rerere.enabled=false",
        ])
        .arg("-c")
        .arg(format!("core.hooksPath={}", hooks.display()))
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LFS_SKIP_SMUDGE", "1");
    // A preview must not execute smudge filters or user-defined merge drivers.
    // Preserve built-in Git drivers; replace configured external drivers explicitly.
    let config = run_git(
        repo,
        &[
            "config",
            "--name-only",
            "--get-regexp",
            "^(filter\\..*\\.(process|smudge|clean|required)|merge\\..*\\.driver)$",
        ],
    )
    .unwrap_or_default();
    for key in config.lines() {
        if key.starts_with("filter.") {
            command.arg("-c").arg(format!(
                "{key}={}",
                if key.ends_with(".required") {
                    "false"
                } else {
                    ""
                }
            ));
        } else if key.starts_with("merge.") && key.ends_with(".driver") {
            command.arg("-c").arg(format!("{key}=false"));
        }
    }
    Ok(command)
}
pub(crate) fn git(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    let result = execute(
        {
            let mut command = safe_command(repo)?;
            command.args(args);
            command
        },
        30,
        None,
    )
    .and_then(success);
    span.finish(result.is_ok());
    result
}
pub(crate) fn git_input(repo: &PathBuf, args: &[&str], input: &[u8]) -> Result<String, String> {
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    let result = execute(
        {
            let mut command = safe_command(repo)?;
            command.args(args);
            command
        },
        30,
        Some(input.to_vec()),
    )
    .and_then(success);
    span.finish(result.is_ok());
    result
}
fn validate_spec(spec: &CommandSpec) -> Result<(), String> {
    if spec.program.is_empty()
        || spec.program.len() > 4096
        || spec.program.chars().any(char::is_control)
        || spec.args.len() > 128
        || spec.args.iter().any(|a| a.len() > 8192 || a.contains('\0'))
        || !(1..=300).contains(&spec.timeout_seconds)
    {
        return Err("Invalid command specification (program/argv, timeout 1–300 seconds)".into());
    }
    Ok(())
}
fn run_spec(repo: &PathBuf, spec: &CommandSpec) -> Result<RunResult, String> {
    validate_spec(spec)?;
    let mut command = cli_command(&spec.program);
    command
        .current_dir(repo)
        .args(&spec.args)
        .env("GIT_TERMINAL_PROMPT", "0");
    execute(command, spec.timeout_seconds, None)
}

fn history(
    repo: &PathBuf,
    text_query: &str,
    mode: &str,
    revision: &str,
    page: usize,
) -> Result<Value, String> {
    if text_query.is_empty() || text_query.len() > 4096 || text_query.contains('\0') || page > 1000
    {
        return Err("Invalid history search".into());
    }
    let head = pinned(repo, revision)?;
    let pickaxe = match mode {
        "literal" => format!("-S{text_query}"),
        "regex" => format!("-G{text_query}"),
        _ => return Err("Unknown pickaxe mode".into()),
    };
    let page = page.max(1);
    let skip = format!("--skip={}", (page - 1) * 50);
    let output = git(
        repo,
        &[
            "log",
            "--no-ext-diff",
            "--no-textconv",
            "--format=%H%x00%an%x00%aI%x00%s%x00",
            "--max-count=51",
            &skip,
            &pickaxe,
            &head,
            "--",
        ],
    )?;
    let mut commits = parse_history(&output);
    let has_more = commits.len() > 50;
    commits.truncate(50);
    Ok(json!({"revision":head,"commits":commits,"page":page,"hasMore":has_more}))
}
fn parse_history(output: &str) -> Vec<Value> {
    let mut parts = output.split('\0');
    let mut commits = Vec::new();
    while let (Some(hash), Some(author), Some(date), Some(subject)) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    {
        let hash = hash.trim_matches(['\r', '\n']);
        if hash.len() >= 40 && hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            commits.push(json!({"hash":hash,"author":author,"date":date,"subject":subject}));
        }
    }
    commits
}
fn function_history(
    repo: &PathBuf,
    file: &str,
    revision: &str,
    start: usize,
    end: usize,
    page: usize,
) -> Result<Value, String> {
    validated_file(repo, file)?;
    if start == 0 || end < start || end > 10_000_000 || page > 1000 || file.contains(':') {
        return Err("Invalid function line range or unsupported filename".into());
    }
    let head = pinned(repo, revision)?;
    let lines = format!("-L{start},{end}:{file}");
    let page = page.max(1);
    let skip = format!("--skip={}", (page - 1) * 25);
    let patch = git(
        repo,
        &[
            "log",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--format=%H%x00%an%x00%aI%x00%s%x00",
            "--max-count=26",
            &skip,
            &lines,
            &head,
        ],
    )?;
    let mut commits = Vec::new();
    // -L includes patches between records, so locate the exact fixed-width hash prefix.
    let pieces: Vec<&str> = patch.split('\0').collect();
    for window in pieces.windows(4) {
        let hash = window[0].lines().last().unwrap_or("");
        if (hash.len() == 40 || hash.len() == 64) && hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            commits
                .push(json!({"hash":hash,"author":window[1],"date":window[2],"subject":window[3]}));
        }
    }
    let has_more = commits.len() > 25;
    commits.truncate(25);
    // The extra look-ahead record is omitted from the visible patch too.
    let visible_patch = if has_more {
        let next_hash = pieces
            .windows(4)
            .filter_map(|w| {
                let h = w[0].lines().last()?;
                ((h.len() == 40 || h.len() == 64) && h.bytes().all(|b| b.is_ascii_hexdigit()))
                    .then_some(h)
            })
            .nth(25)
            .unwrap_or("");
        patch
            .split(&format!("{next_hash}\0"))
            .next()
            .unwrap_or(&patch)
            .to_string()
    } else {
        patch
    };
    Ok(
        json!({"revision":head,"commits":commits,"page":page,"hasMore":has_more,"patch":visible_patch.replace('\0',"\n")}),
    )
}
fn range_diff(
    repo: &PathBuf,
    old_base: &str,
    old_head: &str,
    new_base: &str,
    new_head: &str,
) -> Result<Value, String> {
    let (a, b, c, d) = (
        pinned(repo, old_base)?,
        pinned(repo, old_head)?,
        pinned(repo, new_base)?,
        pinned(repo, new_head)?,
    );
    let diff = git(
        repo,
        &[
            "range-diff",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            &format!("{a}..{b}"),
            &format!("{c}..{d}"),
        ],
    )?;
    Ok(json!({"oldBase":a,"oldHead":b,"newBase":c,"newHead":d,"diff":diff}))
}
fn blame_ignore(repo: &PathBuf, file: &str, revision: &str) -> Result<Value, String> {
    validated_file(repo, file)?;
    let head = pinned(repo, revision)?;
    let raw = read_regular(repo, ".git-blame-ignore-revs")?
        .map(text)
        .transpose()?
        .unwrap_or_default();
    let mut ignored = Vec::new();
    for line in raw.lines() {
        let revision = line.split('#').next().unwrap_or("").trim();
        if !revision.is_empty() {
            if ignored.len() >= 2000 {
                return Err("Too many blame ignore revisions".into());
            }
            ignored.push(pinned(repo, revision)?);
        }
    }
    let mut args = vec![
        "--literal-pathspecs",
        "blame",
        "--porcelain",
        "--no-textconv",
        "--ignore-revs-file",
        "",
    ];
    for revision in &ignored {
        args.extend(["--ignore-rev", revision]);
    }
    args.extend([&head, "--", file]);
    let porcelain = git(repo, &args)?;
    Ok(json!({"head":head,"file":file,"ignoredRevisions":ignored,"porcelain":porcelain}))
}
fn config_bool(repo: &PathBuf, key: &str) -> Result<Option<bool>, String> {
    let result = execute(
        {
            let mut command = git_command();
            command
                .arg("-C")
                .arg(repo)
                .args(["config", "--type=bool", "--get", key]);
            command
        },
        30,
        None,
    )?;
    match result.exit_code {
        Some(0) => match result.stdout.trim() {
            "true" => Ok(Some(true)),
            "false" => Ok(Some(false)),
            _ => Err("Invalid boolean Git configuration".into()),
        },
        Some(1) => Ok(None),
        _ => Err(result.stderr),
    }
}
fn rerere_status(repo: &PathBuf) -> Result<Value, String> {
    let enabled = config_bool(repo, "rerere.enabled")?;
    let autoupdate = config_bool(repo, "rerere.autoupdate")?;
    let inspect = |verb| {
        git(
            repo,
            &[
                "-c",
                "rerere.enabled=true",
                "-c",
                "rerere.autoupdate=false",
                "rerere",
                verb,
            ],
        )
    };
    let list = |out: String| {
        out.lines()
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect::<Vec<_>>()
    };
    Ok(
        json!({"enabled":enabled,"autoupdate":autoupdate,"recorded":list(inspect("status")?),"remaining":list(inspect("remaining")?),"diff":inspect("diff")?}),
    )
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreRecord {
    id: String,
    file: String,
    source: String,
    current: String,
    proposed: String,
    fingerprint: String,
    head: String,
    index_tree: String,
    #[serde(default)]
    delete_file: bool,
    #[serde(default)]
    binary: bool,
    #[serde(default)]
    proposed_base64: Option<String>,
    #[serde(default)]
    branch_ref: Option<String>,
}
fn index_tree(repo: &PathBuf) -> Result<String, String> {
    Ok(git(repo, &["write-tree"])?.trim().into())
}
fn selected_text(
    current: &str,
    source: &str,
    selection: Option<LineSelection>,
) -> Result<String, String> {
    let Some(selection) = selection else {
        return Ok(source.to_string());
    };
    let old: Vec<&str> = current.split_inclusive('\n').collect();
    let new: Vec<&str> = source.split_inclusive('\n').collect();
    let valid = |start: usize, end: usize, length: usize| {
        start >= 1 && end >= start.saturating_sub(1) && end <= length && start <= length + 1
    };
    if !valid(selection.source_start, selection.source_end, new.len())
        || !valid(selection.target_start, selection.target_end, old.len())
    {
        return Err("Invalid selected source or target line range".into());
    }
    Ok(old[..selection.target_start - 1]
        .iter()
        .chain(new[selection.source_start - 1..selection.source_end].iter())
        .chain(old[selection.target_end..].iter())
        .copied()
        .collect())
}
fn historical_bytes(repo: &PathBuf, revision: &str, file: &str) -> Result<Option<Vec<u8>>, String> {
    let Some(oid) = crate::git::git_file_blob_oid(repo, Some(revision), file)? else {
        return Ok(None);
    };
    let mut command = safe_command(repo)?;
    command.args(["cat-file", "blob", &oid]);
    let result = execute(command, 30, None)?;
    success(result.clone())?;
    Ok(Some(result.raw_stdout))
}
fn restore_preview(
    repo: &PathBuf,
    file: String,
    revision: Option<String>,
    snapshot_id: Option<String>,
    selection: Option<LineSelection>,
) -> Result<Value, String> {
    let mutex = repo_mutation_mutex(repo)?;
    let _guard = mutex.lock().map_err(|e| e.to_string())?;
    validated_file(repo, &file)?;
    let current_bytes = read_regular(repo, &file)?.unwrap_or_default();
    let (source, source_bytes) = match (revision, snapshot_id) {
        (Some(revision), None) => {
            let head = pinned(repo, &revision)?;
            let contents = historical_bytes(repo, &head, &file)?;
            (head, contents)
        }
        (None, Some(id)) => {
            let snapshot: Snapshot = read_record(repo, "snapshots", &id)?;
            let entry = snapshot
                .contents
                .get(&file)
                .ok_or("File is not part of this snapshot")?;
            (
                format!("snapshot:{id}"),
                entry
                    .as_ref()
                    .map(|data| B64.decode(data).map_err(|e| e.to_string()))
                    .transpose()?,
            )
        }
        _ => return Err("Choose exactly one revision or snapshot source".into()),
    };
    let delete_file = source_bytes.is_none();
    let source_bytes = source_bytes.unwrap_or_default();
    let current_text = text(current_bytes.clone()).ok();
    let source_text = text(source_bytes.clone()).ok();
    let binary = current_text.is_none() || source_text.is_none();
    if selection.is_some() && (binary || delete_file) {
        return Err("Line selection requires an existing UTF-8 text source and target".into());
    }
    let current =
        current_text.unwrap_or_else(|| format!("Binary file ({} bytes)", current_bytes.len()));
    let (proposed, proposed_base64) = if binary {
        (
            format!("Binary file ({} bytes)", source_bytes.len()),
            Some(B64.encode(&source_bytes)),
        )
    } else {
        (
            selected_text(&current, &source_text.unwrap_or_default(), selection)?,
            None,
        )
    };
    let record = RestoreRecord {
        id: unique_id(),
        file: file.clone(),
        source,
        current,
        proposed,
        fingerprint: crate::git::worktree_file_fingerprint(repo, &file)?,
        head: pinned(repo, "HEAD")?,
        index_tree: index_tree(repo)?,
        delete_file,
        binary,
        proposed_base64,
        branch_ref: git(repo, &["symbolic-ref", "--quiet", "HEAD"])
            .ok()
            .map(|value| value.trim_end_matches(['\r', '\n']).to_string()),
    };
    save_record(repo, "previews", &record.id, &record)?;
    let mut response = serde_json::to_value(record).map_err(|e| e.to_string())?;
    if let Some(object) = response.as_object_mut() {
        object.remove("proposedBase64");
    }
    Ok(response)
}
fn atomic_worktree_write(repo: &PathBuf, file: &str, bytes: &[u8]) -> Result<(), String> {
    let destination = validated_file(repo, file)?;
    let parent = destination.parent().ok_or("Invalid target parent")?;
    // Missing directories are intentionally not created: a changed parent must be reviewed again.
    if !parent.is_dir() {
        return Err("Target directory does not exist".into());
    }
    let permissions = fs::metadata(&destination).ok().map(|m| m.permissions());
    let temporary = parent.join(format!(".l8git-restore-{}", unique_id()));
    let result = (|| {
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        output
            .write_all(bytes)
            .and_then(|_| output.sync_all())
            .map_err(|e| e.to_string())?;
        if let Some(permissions) = permissions {
            fs::set_permissions(&temporary, permissions).map_err(|e| e.to_string())?;
        }
        validated_file(repo, file)?;
        #[cfg(windows)]
        if destination.exists() {
            fs::remove_file(&destination).map_err(|e| e.to_string())?;
        }
        fs::rename(&temporary, &destination).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}
fn restore_apply(repo: &PathBuf, id: &str, fingerprint: &str) -> Result<Value, String> {
    let mutex = repo_mutation_mutex(repo)?;
    let _guard = mutex.lock().map_err(|e| e.to_string())?;
    let record: RestoreRecord = read_record(repo, "previews", id)?;
    if record.fingerprint != fingerprint
        || crate::git::worktree_file_fingerprint(repo, &record.file)? != record.fingerprint
        || pinned(repo, "HEAD")? != record.head
        || index_tree(repo)? != record.index_tree
        || git(repo, &["symbolic-ref", "--quiet", "HEAD"])
            .ok()
            .map(|value| value.trim_end_matches(['\r', '\n']).to_string())
            != record.branch_ref
    {
        return Err("__FILE_CHANGED__|Historical restore preview is stale".into());
    }
    if record.delete_file {
        let target = validated_file(repo, &record.file)?;
        match fs::remove_file(target) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    } else {
        let bytes = record
            .proposed_base64
            .map(|value| B64.decode(value).map_err(|e| e.to_string()))
            .transpose()?;
        atomic_worktree_write(
            repo,
            &record.file,
            bytes.as_deref().unwrap_or(record.proposed.as_bytes()),
        )?;
    }
    fs::remove_file(record_path(repo, "previews", id)?).map_err(|e| e.to_string())?;
    Ok(json!({"file":record.file,"restored":true}))
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    id: String,
    label: String,
    created_at: u64,
    head: String,
    index_tree: String,
    branch: Option<String>,
    files: Vec<String>,
    contents: BTreeMap<String, Option<String>>,
}
fn snapshot_summary(snapshot: &Snapshot) -> Value {
    json!({"id":snapshot.id,"label":snapshot.label,"createdAt":snapshot.created_at,"head":snapshot.head,"indexTree":snapshot.index_tree,"branch":snapshot.branch,"files":snapshot.files})
}
fn capture(repo: &PathBuf, label: String, expected_head: &str) -> Result<Value, String> {
    if label.len() > 500 {
        return Err("Snapshot label is too long".into());
    }
    let mutex = repo_mutation_mutex(repo)?;
    let _guard = mutex.lock().map_err(|e| e.to_string())?;
    let head = require_head(repo, expected_head)?;
    let tree = index_tree(repo)?;
    let raw = git(
        repo,
        &[
            "ls-files",
            "--modified",
            "--deleted",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )?;
    let staged = git(
        repo,
        &["diff", "--cached", "--name-only", "--no-renames", "-z"],
    )?;
    let files: BTreeSet<String> = raw
        .split('\0')
        .chain(staged.split('\0'))
        .filter(|p| !p.is_empty())
        .map(String::from)
        .collect();
    if files.len() > 2000 {
        return Err("Snapshot exceeds the 2000-file limit".into());
    }
    let mut contents = BTreeMap::new();
    let mut total = 0usize;
    let mut fingerprints = BTreeMap::new();
    for file in &files {
        fingerprints.insert(
            file.clone(),
            crate::git::worktree_file_fingerprint(repo, file)?,
        );
        let data = read_regular(repo, file)?;
        total += data.as_ref().map_or(0, Vec::len);
        if total > SNAPSHOT_LIMIT {
            return Err("Snapshot exceeds the 32 MiB total limit".into());
        }
        contents.insert(file.clone(), data.map(|data| B64.encode(data)));
    }
    for (file, fingerprint) in fingerprints {
        if crate::git::worktree_file_fingerprint(repo, &file)? != fingerprint {
            return Err("Working files changed while capturing snapshot".into());
        }
    }
    require_head(repo, &head)?;
    if index_tree(repo)? != tree {
        return Err("Index changed while capturing snapshot".into());
    }
    let snapshot = Snapshot {
        id: unique_id(),
        label,
        created_at: now(),
        head,
        index_tree: tree,
        branch: git(repo, &["symbolic-ref", "--quiet", "--short", "HEAD"])
            .ok()
            .map(|s| s.trim().into()),
        files: files.into_iter().collect(),
        contents,
    };
    save_record(repo, "snapshots", &snapshot.id, &snapshot)?;
    // Keep captured objects reachable even after branch rewrites and garbage collection.
    git(
        repo,
        &[
            "update-ref",
            &format!("refs/l8git/snapshots/{}/head", snapshot.id),
            &snapshot.head,
        ],
    )?;
    git(
        repo,
        &[
            "update-ref",
            &format!("refs/l8git/snapshots/{}/index", snapshot.id),
            &snapshot.index_tree,
        ],
    )?;
    Ok(snapshot_summary(&snapshot))
}
fn list_snapshots(repo: &PathBuf) -> Result<Value, String> {
    let mut snapshots = Vec::new();
    for entry in fs::read_dir(state_dir(repo, "snapshots")?).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or("Invalid snapshot filename")?;
        let snapshot: Snapshot = read_record(repo, "snapshots", id)?;
        snapshots.push(snapshot_summary(&snapshot));
        if snapshots.len() > 1000 {
            return Err("Snapshot list exceeds 1000 entries; archive older snapshots".into());
        }
    }
    snapshots.sort_by_key(|s| std::cmp::Reverse(s["createdAt"].as_u64().unwrap_or_default()));
    let current = pinned(repo, "HEAD")
        .and_then(|head| index_tree(repo).map(|index| json!({"head":head,"indexTree":index})))
        .ok();
    Ok(json!({"snapshots":snapshots,"current":current}))
}
fn create_branch(repo: &PathBuf, branch: &str, head: &str) -> Result<Value, String> {
    git(repo, &["check-ref-format", "--branch", branch])?;
    let head = pinned(repo, head)?;
    git(
        repo,
        &[
            "update-ref",
            &format!("refs/heads/{branch}"),
            &head,
            &"0".repeat(head.len()),
        ],
    )?;
    Ok(json!({"branch":branch,"head":head}))
}

fn profiles(repo: &PathBuf) -> Result<(Vec<WorktreeProfile>, String), String> {
    let path = record_path(repo, "profiles", "current")?;
    let values: Vec<WorktreeProfile> = if path.exists() {
        read_record(repo, "profiles", "current")?
    } else {
        Vec::new()
    };
    let fingerprint = digest(&serde_json::to_vec(&values).map_err(|e| e.to_string())?);
    Ok((values, fingerprint))
}
fn profiles_value(repo: &PathBuf) -> Result<Value, String> {
    let (profiles, fingerprint) = profiles(repo)?;
    Ok(json!({"profiles":profiles,"fingerprint":fingerprint}))
}
fn validate_profiles(repo: &PathBuf, profiles: &[WorktreeProfile]) -> Result<(), String> {
    if profiles.len() > 50 {
        return Err("At most 50 worktree profiles are supported".into());
    }
    let mut ids = BTreeSet::new();
    for profile in profiles {
        id_ok(&profile.id)?;
        if !ids.insert(&profile.id)
            || profile.name.is_empty()
            || profile.name.len() > 200
            || profile.copy_files.len() > 100
            || profile.commands.len() > 20
        {
            return Err("Invalid or duplicate profile".into());
        }
        for file in &profile.copy_files {
            validated_file(repo, file)?;
        }
        for command in &profile.commands {
            validate_spec(command)?;
        }
    }
    Ok(())
}
fn registered_target(repo: &PathBuf, target: &str) -> Result<PathBuf, String> {
    if !Path::new(target).is_absolute() {
        return Err("A registered worktree target must use its absolute path".into());
    }
    let target = PathBuf::from(target)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let entries =
        crate::git::parse_worktree_list(&git(repo, &["worktree", "list", "--porcelain", "-z"])?);
    if !entries
        .iter()
        .any(|entry| PathBuf::from(&entry.path).canonicalize().ok().as_ref() == Some(&target))
        || common_dir(repo)? != common_dir(&target)?
    {
        return Err("Target must be a registered worktree of this repository".into());
    }
    Ok(target)
}
fn apply_profile(
    repo: &PathBuf,
    profile_id: &str,
    target: &str,
    expected: &str,
    confirmed: bool,
) -> Result<Value, String> {
    ensure_confirmed(confirmed)?;
    let coordination = repo_coordination_mutex(repo)?;
    let _coordination = coordination.lock().map_err(|e| e.to_string())?;
    let (profiles, fingerprint) = profiles(repo)?;
    if fingerprint != expected {
        return Err("Profile changed since it was reviewed".into());
    }
    let profile = profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or("Profile no longer exists")?;
    validate_profiles(repo, std::slice::from_ref(profile))?;
    let target = registered_target(repo, target)?;
    let mut copies = Vec::new();
    for file in &profile.copy_files {
        let bytes = read_regular(repo, file)?
            .ok_or_else(|| format!("Profile source is missing: {file}"))?;
        let destination = validated_file(&target, file)?;
        match read_regular(&target, file)? {
            Some(existing) if existing == bytes => {}
            Some(_) => return Err(format!("Refusing to overwrite target profile file: {file}")),
            None => copies.push((file.clone(), destination, bytes)),
        }
    }
    let mut copied = Vec::new();
    for (file, destination, bytes) in copies {
        validated_file(&target, &file)?;
        fs::create_dir_all(destination.parent().ok_or("Invalid copy destination")?)
            .map_err(|e| e.to_string())?;
        validated_file(&target, &file)?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut output = options.open(destination).map_err(|e| {
            format!(
                "Could not copy {file}: {e}; already copied: {}",
                copied.join(", ")
            )
        })?;
        output.write_all(&bytes).map_err(|e| e.to_string())?;
        copied.push(file);
    }
    let mut runs = Vec::new();
    let mut completed = true;
    for command in &profile.commands {
        let run = run_spec(&target, command)?;
        completed = run.exit_code == Some(0) && !run.timed_out;
        runs.push(run);
        if !completed {
            break;
        }
    }
    Ok(json!({"copied":copied,"runs":runs,"targetPath":target,"completed":completed}))
}
fn directory_stats(root: &Path) -> Result<(u64, bool, Option<u64>), String> {
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    let mut count = 0usize;
    let mut size = 0u64;
    let mut last = None;
    let started = Instant::now();
    while let Some((directory, depth)) = stack.pop() {
        if count >= 100_000 || started.elapsed() > Duration::from_secs(2) || depth > 100 {
            return Ok((size, true, last));
        }
        for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            count += 1;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_file() {
                size = size.saturating_add(metadata.len());
            }
            if let Ok(modified) = metadata
                .modified()
                .and_then(|t| t.duration_since(UNIX_EPOCH).map_err(std::io::Error::other))
            {
                last = Some(
                    last.unwrap_or(0)
                        .max(modified.as_millis().try_into().unwrap_or(u64::MAX)),
                );
            }
            if metadata.is_dir() && entry.file_name() != ".git" {
                stack.push((entry.path(), depth + 1));
            }
            if count >= 100_000 || started.elapsed() > Duration::from_secs(2) {
                return Ok((size, true, last));
            }
        }
    }
    Ok((size, false, last))
}
fn housekeeping(repo: &PathBuf) -> Result<Value, String> {
    let entries =
        crate::git::parse_worktree_list(&git(repo, &["worktree", "list", "--porcelain", "-z"])?);
    if entries.len() > 100 {
        return Err("Housekeeping supports at most 100 worktrees per request".into());
    }
    let mut result = Vec::new();
    for entry in entries {
        let root = PathBuf::from(&entry.path);
        let status = git(
            &root,
            &["status", "--porcelain=v1", "--untracked-files=all"],
        );
        let stats = directory_stats(&root);
        let error = status
            .as_ref()
            .err()
            .cloned()
            .or_else(|| stats.as_ref().err().cloned());
        let (size, truncated, last) = stats
            .map(|(s, t, l)| (Some(s), t, l))
            .unwrap_or((None, false, None));
        result.push(json!({"path":entry.path,"head":pinned(&root,"HEAD").unwrap_or(entry.head),"branch":entry.branch,"isMain":entry.is_main,"locked":entry.is_locked,"prunable":entry.is_prunable,"status":status.ok(),"sizeBytes":size,"sizeTruncated":truncated,"lastModified":last,"error":error}));
    }
    Ok(json!({"worktrees":result}))
}
fn sparse_status(repo: &PathBuf) -> Result<Value, String> {
    let enabled = config_bool(repo, "core.sparseCheckout")?.unwrap_or(false);
    let cone = config_bool(repo, "core.sparseCheckoutCone")?.unwrap_or(false);
    let directories = if enabled {
        git(repo, &["sparse-checkout", "list"])?
            .lines()
            .map(String::from)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    let files = git(repo, &["ls-files", "-t", "-z"])?;
    let omitted = files
        .split('\0')
        .filter(|entry| entry.starts_with("S "))
        .count();
    Ok(
        json!({"enabled":enabled,"cone":cone,"directories":directories,"omittedTrackedFiles":omitted,"head":pinned(repo,"HEAD")?}),
    )
}
fn sparse_change(
    repo: &PathBuf,
    directories: Option<Vec<String>>,
    expected: &str,
    confirmed: bool,
) -> Result<Value, String> {
    ensure_confirmed(confirmed)?;
    let mutex = repo_mutation_mutex(repo)?;
    let _guard = mutex.lock().map_err(|e| e.to_string())?;
    require_head(repo, expected)?;
    if !git(repo, &["status", "--porcelain=v1", "--untracked-files=all"])?.is_empty() {
        return Err("Commit or stash local changes before changing sparse checkout".into());
    }
    match directories {
        Some(directories) => {
            if directories.is_empty() || directories.len() > 1000 {
                return Err("Choose between 1 and 1000 repository directories".into());
            }
            for directory in &directories {
                validated_file(repo, directory)?;
                if directory.starts_with('-')
                    || directory.contains('\\')
                    || directory.contains(['\r', '\n'])
                {
                    return Err("Invalid sparse checkout directory".into());
                }
                let tree = git(
                    repo,
                    &[
                        "--literal-pathspecs",
                        "ls-tree",
                        "-d",
                        "--name-only",
                        "HEAD",
                        "--",
                        directory,
                    ],
                )?;
                if tree.trim_end_matches(['\r', '\n']) != directory {
                    return Err(format!("Not a directory at HEAD: {directory}"));
                }
            }
            git_input(
                repo,
                &["sparse-checkout", "set", "--cone", "--stdin"],
                format!("{}\n", directories.join("\n")).as_bytes(),
            )?;
        }
        None => {
            git(repo, &["sparse-checkout", "disable"])?;
        }
    }
    sparse_status(repo)
}

struct IsolatedWorktree {
    repo: PathBuf,
    root: PathBuf,
    path: PathBuf,
}
impl IsolatedWorktree {
    fn create(repo: &PathBuf, head: &str) -> Result<Self, String> {
        let root = std::env::temp_dir().join(format!("l8git-lab-{}", unique_id()));
        fs::create_dir(&root).map_err(|e| e.to_string())?;
        let path = root.join("worktree");
        let worktree = Self {
            repo: repo.clone(),
            root,
            path,
        };
        let coordination = repo_coordination_mutex(repo)?;
        let outcome = {
            let _guard = coordination.lock().map_err(|e| e.to_string())?;
            git(
                repo,
                &[
                    "worktree",
                    "add",
                    "--detach",
                    "--",
                    worktree
                        .path
                        .to_str()
                        .ok_or("Unsupported temporary worktree path")?,
                    head,
                ],
            )
        };
        outcome?;
        Ok(worktree)
    }
    fn close(&self) -> Result<(), String> {
        let coordination = repo_coordination_mutex(&self.repo)?;
        let _guard = coordination.lock().map_err(|e| e.to_string())?;
        git(
            &self.repo,
            &[
                "worktree",
                "remove",
                "--force",
                "--",
                self.path
                    .to_str()
                    .ok_or("Invalid temporary worktree path")?,
            ],
        )?;
        fs::remove_dir_all(&self.root).map_err(|e| e.to_string())
    }
}
impl Drop for IsolatedWorktree {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = self.close();
        }
        if self.root.exists() && !self.path.exists() {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
fn synthetic_commit(repo: &PathBuf, message: &str, parents: &[String]) -> Result<String, String> {
    let tree = index_tree(repo)?;
    let mut command = safe_command(repo)?;
    command
        .env("GIT_AUTHOR_NAME", "l8git integration")
        .env("GIT_AUTHOR_EMAIL", "integration@l8git.local")
        .env("GIT_COMMITTER_NAME", "l8git integration")
        .env("GIT_COMMITTER_EMAIL", "integration@l8git.local");
    command.args(["commit-tree", &tree, "-m", message]);
    for parent in parents {
        command.args(["-p", parent]);
    }
    success(execute(command, 30, None)?).map(|s| s.trim().into())
}
fn rehearse(
    repo: &PathBuf,
    base: &str,
    steps: &[PlanStep],
    command: Option<&CommandSpec>,
) -> Result<Value, String> {
    if steps.len() > 32 {
        return Err("At most 32 integration steps are supported".into());
    }
    if let Some(command) = command {
        validate_spec(command)?;
    }
    let base = pinned(repo, base)?;
    let mut pinned_steps = Vec::new();
    for step in steps {
        if !matches!(step.kind.as_str(), "merge" | "cherry_pick" | "revert") {
            return Err("Unsupported Git plan step".into());
        }
        pinned_steps.push(PlanStep {
            kind: step.kind.clone(),
            commit: pinned(repo, &step.commit)?,
        });
    }
    let worktree = IsolatedWorktree::create(repo, &base)?;
    let mut results = Vec::new();
    let mut conflicts = Vec::new();
    let mut result_head = base.clone();
    for step in &pinned_steps {
        let mut args = match step.kind.as_str() {
            "merge" => vec!["merge", "--no-commit", "--no-ff", "--no-edit"],
            "cherry_pick" => vec!["cherry-pick", "--no-commit"],
            _ => vec!["revert", "--no-commit"],
        };
        args.push(&step.commit);
        let outcome = git(&worktree.path, &args);
        let successful = outcome.is_ok();
        let output = outcome.unwrap_or_else(|error| error);
        results.push(
            json!({"commit":step.commit,"kind":step.kind,"success":successful,"output":output}),
        );
        if !successful {
            conflicts = git(
                &worktree.path,
                &["diff", "--name-only", "--diff-filter=U", "-z"],
            )?
            .split('\0')
            .filter(|p| !p.is_empty())
            .map(String::from)
            .collect();
            break;
        }
        let mut parents = vec![result_head.clone()];
        if step.kind == "merge" && result_head != step.commit {
            parents.push(step.commit.clone());
        }
        let commit = synthetic_commit(&worktree.path, "l8git isolated rehearsal", &parents)?;
        git(&worktree.path, &["reset", "--hard", &commit])?;
        result_head = commit;
    }
    let all_success = results.iter().all(|result| result["success"] == true);
    let run = if all_success {
        command
            .map(|command| run_spec(&worktree.path, command))
            .transpose()?
    } else {
        None
    };
    // Keep the synthetic result reachable for subsequent plan export and evidence inspection.
    if all_success {
        git(
            repo,
            &[
                "update-ref",
                &format!("refs/l8git/labs/{}", unique_id()),
                &result_head,
            ],
        )?;
    }
    let value = json!({"base":base,"heads":pinned_steps.iter().map(|s|s.commit.clone()).collect::<Vec<_>>(),"resultHead":result_head,"conflicts":conflicts,"steps":results,"run":run});
    worktree.close()?;
    Ok(value)
}
fn overlap(repo: &PathBuf, base: &str, heads: &[String]) -> Result<Value, String> {
    if heads.len() < 2 || heads.len() > 32 {
        return Err("Choose 2–32 branch heads".into());
    }
    let base = pinned(repo, base)?;
    let mut branches = Vec::new();
    let mut files: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for revision in heads {
        let head = pinned(repo, revision)?;
        let ancestor = git(repo, &["merge-base", &base, &head])?;
        let changed = git(
            repo,
            &[
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-renames",
                "--name-only",
                "-z",
                ancestor.trim(),
                &head,
                "--",
            ],
        )?;
        let changed = changed
            .split('\0')
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect::<Vec<_>>();
        for file in &changed {
            let entry = files.entry(file.clone()).or_default();
            if !entry.contains(&head) {
                entry.push(head.clone());
            }
        }
        branches.push(json!({"revision":revision,"head":head,"files":changed}));
    }
    let overlaps = files
        .into_iter()
        .filter(|(_, heads)| heads.len() > 1)
        .map(|(file, heads)| json!({"file":file,"heads":heads}))
        .collect::<Vec<_>>();
    Ok(
        json!({"base":base,"branches":branches,"overlaps":overlaps,"worktrees":[],"worktreeOverlaps":[],"worktreeErrors":[]}),
    )
}

fn worktree_overlap(repo: &PathBuf, base: &str) -> Result<Value, String> {
    let entries =
        crate::git::parse_worktree_list(&git(repo, &["worktree", "list", "--porcelain", "-z"])?);
    if entries.len() > 32 {
        return Err("Worktree radar supports at most 32 registered worktrees".into());
    }
    let mut worktrees = Vec::new();
    let mut files: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut errors = Vec::new();
    for entry in entries {
        if entry.is_prunable {
            continue;
        }
        let root = PathBuf::from(&entry.path);
        let evidence = (|| -> Result<Value, String> {
            if common_dir(repo)? != common_dir(&root)? {
                return Err("Worktree registration no longer matches repository".into());
            }
            let head = pinned(&root, "HEAD")?;
            let ancestor = git(&root, &["merge-base", base, &head])?;
            let committed = git(
                &root,
                &[
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-renames",
                    "--name-only",
                    "-z",
                    ancestor.trim(),
                    &head,
                    "--",
                ],
            )?;
            let pending = git(
                &root,
                &[
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-renames",
                    "--name-only",
                    "-z",
                    &head,
                    "--",
                ],
            )?;
            let untracked = git(&root, &["ls-files", "--others", "--exclude-standard", "-z"])?;
            require_head(&root, &head)?;
            let pending: BTreeSet<String> = pending
                .split('\0')
                .chain(untracked.split('\0'))
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect();
            let changed: BTreeSet<String> = committed
                .split('\0')
                .filter(|s| !s.is_empty())
                .map(String::from)
                .chain(pending.iter().cloned())
                .collect();
            Ok(
                json!({"path":entry.path,"head":head,"branch":entry.branch,"files":changed,"pendingFiles":pending}),
            )
        })();
        match evidence {
            Ok(evidence) => {
                for file in evidence["files"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                {
                    files
                        .entry(file.to_string())
                        .or_default()
                        .push(entry.path.clone());
                }
                worktrees.push(evidence);
            }
            Err(error) => errors.push(json!({"path":entry.path,"error":error})),
        }
    }
    let overlaps = files
        .into_iter()
        .filter(|(_, paths)| paths.len() > 1)
        .map(|(file, worktree_paths)| json!({"file":file,"worktreePaths":worktree_paths}))
        .collect::<Vec<_>>();
    Ok(json!({"worktrees":worktrees,"overlaps":overlaps,"errors":errors}))
}

fn behavior_side(
    repo: &PathBuf,
    head: &str,
    command: &CommandSpec,
    artifacts: &[String],
) -> Result<Value, String> {
    let worktree = IsolatedWorktree::create(repo, head)?;
    let run = run_spec(&worktree.path, command)?;
    let mut evidence = Vec::new();
    let mut missing = Vec::new();
    let mut total = 0usize;
    for file in artifacts {
        match read_regular(&worktree.path, file)? {
            None => missing.push(file.clone()),
            Some(bytes) => {
                total += bytes.len();
                if total > 16 * 1024 * 1024 {
                    return Err("Comparison artifacts exceed 16 MiB total".into());
                }
                let hash = digest(&bytes);
                let as_text = if bytes.len() <= 1024 * 1024 && !bytes.contains(&0) {
                    String::from_utf8(bytes.clone()).ok()
                } else {
                    None
                };
                let base64 = as_text.is_none().then(|| B64.encode(&bytes));
                evidence.push(json!({"path":file,"size":bytes.len(),"sha256":hash,"text":as_text,"base64":base64}));
            }
        }
    }
    let value = json!({"head":head,"run":run,"artifacts":evidence,"missingArtifacts":missing});
    worktree.close()?;
    Ok(value)
}
fn behavior_compare(
    repo: &PathBuf,
    base: &str,
    head: &str,
    command: &CommandSpec,
    artifacts: &[String],
    confirmed: bool,
) -> Result<Value, String> {
    ensure_confirmed(confirmed)?;
    validate_spec(command)?;
    if artifacts.len() > 20 {
        return Err("At most 20 declared artifacts are supported".into());
    }
    for file in artifacts {
        validated_file(repo, file)?;
    }
    let base = pinned(repo, base)?;
    let head = pinned(repo, head)?;
    let left = behavior_side(repo, &base, command, artifacts)?;
    let right = behavior_side(repo, &head, command, artifacts)?;
    let hashes = |side: &Value| {
        side["artifacts"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|a| {
                Some((
                    a["path"].as_str()?.to_string(),
                    a["sha256"].as_str()?.to_string(),
                ))
            })
            .collect::<BTreeMap<_, _>>()
    };
    let (left_hash, right_hash) = (hashes(&left), hashes(&right));
    let changed = artifacts
        .iter()
        .filter(|path| left_hash.get(*path) != right_hash.get(*path))
        .cloned()
        .collect::<Vec<_>>();
    let same_output = left["run"]["stdout"] == right["run"]["stdout"]
        && left["run"]["stderr"] == right["run"]["stderr"]
        && left["run"]["exitCode"] == right["run"]["exitCode"]
        && left["run"]["truncated"] == false
        && right["run"]["truncated"] == false
        && left["run"]["timedOut"] == false
        && right["run"]["timedOut"] == false;
    Ok(json!({"base":left,"head":right,"sameOutput":same_output,"changedArtifacts":changed}))
}
fn bisect_test(
    repo: &PathBuf,
    command: &CommandSpec,
    expected: &str,
    mark_result: bool,
    confirmed: bool,
) -> Result<Value, String> {
    ensure_confirmed(confirmed)?;
    validate_spec(command)?;
    let head = require_head(repo, expected)?;
    let log_path = git(repo, &["rev-parse", "--git-path", "BISECT_LOG"])?;
    if !repo.join(log_path.trim_end_matches(['\r', '\n'])).is_file() {
        return Err("No active bisect session".into());
    }
    let worktree = IsolatedWorktree::create(repo, &head)?;
    let run = run_spec(&worktree.path, command)?;
    worktree.close()?;
    let verdict = if run.timed_out {
        None
    } else {
        match run.exit_code {
            Some(0) => Some("good"),
            Some(125) => Some("skip"),
            Some(1..=127) => Some("bad"),
            _ => None,
        }
    };
    let mut marked = false;
    if mark_result {
        if let Some(verdict) = verdict {
            let mutex = repo_mutation_mutex(repo)?;
            let _guard = mutex.lock().map_err(|e| e.to_string())?;
            require_head(repo, &head)?;
            if !repo.join(log_path.trim_end_matches(['\r', '\n'])).is_file() {
                return Err("Bisect session ended during the test".into());
            }
            git(repo, &["bisect", verdict])?;
            marked = true;
        }
    }
    let log = git(repo, &["bisect", "log"])?;
    Ok(json!({"head":head,"run":run,"verdict":verdict,"marked":marked,"log":log}))
}
fn source_files(repo: &PathBuf, files: Vec<String>, expected_head: &str) -> Result<Value, String> {
    const SOURCE_FILE_LIMIT: usize = 1024 * 1024;
    const SOURCE_TOTAL_LIMIT: usize = 8 * 1024 * 1024;
    if files.len() > 500 {
        return Err("Source inspection accepts at most 500 paths".into());
    }
    let mutex = repo_mutation_mutex(repo)?;
    let _guard = mutex.lock().map_err(|e| e.to_string())?;
    let head = require_head(repo, expected_head)?;
    let mut returned = Vec::new();
    let mut omitted = Vec::new();
    let mut truncated = false;
    let mut total = 0usize;
    let mut seen = BTreeSet::new();
    for file in files {
        if !seen.insert(file.clone()) {
            continue;
        }
        let inspected = (|| -> Result<Value, String> {
            validated_file(repo, &file)?;
            let mut input = crate::git::open_worktree_file(repo, &file)?;
            let before = input.metadata().map_err(|e| e.to_string())?;
            if !before.is_file() {
                return Err("Source inspection supports regular files only".into());
            }
            if before.len() > SOURCE_FILE_LIMIT as u64 {
                truncated = true;
                return Err("Source exceeds the 1 MiB per-file limit".into());
            }
            if before.len() > SOURCE_TOTAL_LIMIT.saturating_sub(total) as u64 {
                truncated = true;
                return Err("Source exceeds the remaining 8 MiB total budget".into());
            }
            let mut bytes = Vec::new();
            Read::by_ref(&mut input)
                .take((SOURCE_FILE_LIMIT + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() > SOURCE_FILE_LIMIT
                || bytes.len() > SOURCE_TOTAL_LIMIT.saturating_sub(total)
            {
                truncated = true;
                return Err("Source grew beyond the inspection budget".into());
            }
            let after = input.metadata().map_err(|e| e.to_string())?;
            if bytes.len() as u64 != before.len()
                || before.len() != after.len()
                || before.modified().ok() != after.modified().ok()
            {
                return Err("Source changed while it was being inspected".into());
            }
            let fingerprint = format!("sha256:{}", digest(&bytes));
            let length = bytes.len();
            let contents = text(bytes)?;
            total += length;
            Ok(json!({"path":file,"text":contents,"fingerprint":fingerprint}))
        })();
        match inspected {
            Ok(source) => returned.push(source),
            Err(error) => omitted.push(json!({"path":file,"error":error})),
        }
    }
    require_head(repo, &head)?;
    Ok(json!({"head":head,"files":returned,"omitted":omitted,"truncated":truncated}))
}

#[derive(Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct EvidenceSnapshot {
    base_sha: String,
    head_sha: String,
    worktree_fingerprint: String,
}
struct EvidenceCapture {
    snapshot: EvidenceSnapshot,
    files: Vec<String>,
    base_branch: String,
    session_branch: String,
}
fn evidence_branch(repo: &PathBuf) -> Result<String, String> {
    let branch = git(repo, &["symbolic-ref", "--quiet", "HEAD"])?;
    let branch = branch.trim_end_matches(['\r', '\n']).to_string();
    if branch.is_empty() {
        return Err("Agent evidence requires attached branches".into());
    }
    Ok(branch)
}
/// Both worktree mutation locks and the common coordination lock are held by the caller.
fn evidence_capture_locked(worktree: &PathBuf, base: &PathBuf) -> Result<EvidenceCapture, String> {
    let base_sha = pinned(base, "HEAD")?;
    let head_sha = pinned(worktree, "HEAD")?;
    let base_branch = evidence_branch(base)?;
    let session_branch = evidence_branch(worktree)?;
    if base_branch == session_branch {
        return Err("Agent and base branches must differ".into());
    }
    let merge_base = git(worktree, &["merge-base", &base_sha, &head_sha])?
        .trim()
        .to_string();
    // This is exactly the no-renames changed-path and nonignored-untracked selection
    // used by agent_review_summary, with its canonical content fingerprint helper.
    let changed = git(
        worktree,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            "--name-only",
            "-z",
            &merge_base,
            "--",
        ],
    )?;
    let untracked = git(
        worktree,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )?;
    let paths: BTreeSet<String> = changed
        .split('\0')
        .chain(untracked.split('\0'))
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    let files: Vec<String> = paths.into_iter().collect();
    let fingerprint = crate::git::review_content_fingerprint(worktree, &merge_base, &files)?;
    if pinned(base, "HEAD")? != base_sha
        || pinned(worktree, "HEAD")? != head_sha
        || evidence_branch(base)? != base_branch
        || evidence_branch(worktree)? != session_branch
    {
        return Err("Agent content or branch context changed during evidence capture".into());
    }
    Ok(EvidenceCapture {
        snapshot: EvidenceSnapshot {
            base_sha,
            head_sha,
            worktree_fingerprint: fingerprint,
        },
        files,
        base_branch,
        session_branch,
    })
}
fn evidence_run(
    repo: &PathBuf,
    base_path: &str,
    expected_base: &str,
    expected_head: &str,
    expected_fingerprint: &str,
    command: &CommandSpec,
    confirmed: bool,
) -> Result<Value, String> {
    ensure_confirmed(confirmed)?;
    validate_spec(command)?;
    if expected_fingerprint.is_empty() {
        return Err("Capture current agent content before running evidence".into());
    }
    let worktree = repo.canonicalize().map_err(|e| e.to_string())?;
    let coordination = repo_coordination_mutex(&worktree)?;
    let _coordination = coordination.lock().map_err(|e| e.to_string())?;
    let base = registered_target(&worktree, base_path)?;
    let entries = crate::git::parse_worktree_list(&git(
        &worktree,
        &["worktree", "list", "--porcelain", "-z"],
    )?);
    let session = entries
        .iter()
        .find(|entry| PathBuf::from(&entry.path).canonicalize().ok().as_ref() == Some(&worktree))
        .ok_or("Agent worktree is no longer registered")?;
    if session.is_main
        || session.is_locked
        || session.is_prunable
        || session.branch.is_none()
        || base == worktree
    {
        return Err(
            "Select an unprotected registered agent worktree distinct from its base".into(),
        );
    }
    let base_lock = repo_mutation_mutex(&base)?;
    let session_lock = repo_mutation_mutex(&worktree)?;
    if std::sync::Arc::ptr_eq(&base_lock, &session_lock) {
        return Err("Agent and base refer to the same index".into());
    }
    let (first, second) = if base < worktree {
        (base_lock, session_lock)
    } else {
        (session_lock, base_lock)
    };
    let _first = first.lock().map_err(|e| e.to_string())?;
    let _second = second.lock().map_err(|e| e.to_string())?;
    require_head(&base, expected_base)?;
    require_head(&worktree, expected_head)?;
    let before = evidence_capture_locked(&worktree, &base)?;
    if before.snapshot.worktree_fingerprint != expected_fingerprint
        || before.snapshot.head_sha != expected_head
        || before.snapshot.base_sha != expected_base
    {
        return Err("Agent evidence snapshot is stale; refresh before executing".into());
    }
    let run = run_spec(&worktree, command)?;
    let after = evidence_capture_locked(&worktree, &base);
    let (after_snapshot, stale, after_error) = match after {
        Ok(after) => {
            let stale = before.snapshot != after.snapshot
                || before.base_branch != after.base_branch
                || before.session_branch != after.session_branch;
            (Some(after.snapshot), stale, None)
        }
        Err(error) => (None, true, Some(error)),
    };
    Ok(
        json!({"run":run,"before":before.snapshot,"after":after_snapshot,"stale":stale,"afterError":after_error,"files":before.files}),
    )
}

fn execute_request(repo: &PathBuf, request: GitExpansionRequest) -> Result<Value, String> {
    // All operations are worktree-scoped. Never silently reinterpret a path inside
    // a subdirectory, where relative files and profile ownership would differ.
    let top = git(repo, &["rev-parse", "--show-toplevel"])?;
    if repo.canonicalize().map_err(|e| e.to_string())?
        != PathBuf::from(top.trim_end_matches(['\r', '\n']))
            .canonicalize()
            .map_err(|e| e.to_string())?
    {
        return Err("Select the repository worktree root".into());
    }
    match request {
        GitExpansionRequest::SourceFiles {
            files,
            expected_head,
        } => source_files(repo, files, &expected_head),
        GitExpansionRequest::EvidenceRun {
            base_path,
            expected_base_head,
            expected_head,
            expected_fingerprint,
            command,
            confirmed,
        } => evidence_run(
            repo,
            &base_path,
            &expected_base_head,
            &expected_head,
            &expected_fingerprint,
            &command,
            confirmed,
        ),
        GitExpansionRequest::Pickaxe {
            text,
            mode,
            revision,
            page,
        } => history(
            repo,
            &text,
            &mode,
            revision.as_deref().unwrap_or("HEAD"),
            page,
        ),
        GitExpansionRequest::FunctionHistory {
            file,
            revision,
            start,
            end,
            page,
        } => function_history(repo, &file, &revision, start, end, page),
        GitExpansionRequest::RangeDiff {
            old_base,
            old_head,
            new_base,
            new_head,
        } => range_diff(repo, &old_base, &old_head, &new_base, &new_head),
        GitExpansionRequest::BlameIgnore { file, revision } => blame_ignore(repo, &file, &revision),
        GitExpansionRequest::RestorePreview {
            file,
            revision,
            snapshot_id,
            selection,
        } => restore_preview(repo, file, revision, snapshot_id, selection),
        GitExpansionRequest::RestoreApply {
            preview_id,
            expected_fingerprint,
        } => restore_apply(repo, &preview_id, &expected_fingerprint),
        GitExpansionRequest::RerereStatus => rerere_status(repo),
        GitExpansionRequest::RerereConfigure {
            enabled,
            expected_enabled,
        } => {
            let mutex = repo_mutation_mutex(repo)?;
            let _guard = mutex.lock().map_err(|e| e.to_string())?;
            if config_bool(repo, "rerere.enabled")? != expected_enabled {
                return Err("Rerere configuration changed since preview".into());
            }
            git(
                repo,
                &[
                    "config",
                    "--local",
                    "rerere.enabled",
                    if enabled { "true" } else { "false" },
                ],
            )?;
            rerere_status(repo)
        }
        GitExpansionRequest::RerereForget {
            file,
            expected_head,
        } => {
            let mutex = repo_mutation_mutex(repo)?;
            let _guard = mutex.lock().map_err(|e| e.to_string())?;
            require_head(repo, &expected_head)?;
            validated_file(repo, &file)?;
            git(
                repo,
                &[
                    "--literal-pathspecs",
                    "-c",
                    "rerere.enabled=true",
                    "-c",
                    "rerere.autoupdate=false",
                    "rerere",
                    "forget",
                    "--",
                    &file,
                ],
            )?;
            rerere_status(repo)
        }
        GitExpansionRequest::ProfilesList => profiles_value(repo),
        GitExpansionRequest::ProfilesSave {
            profiles: values,
            expected_fingerprint,
        } => {
            let coordination = repo_coordination_mutex(repo)?;
            let _guard = coordination.lock().map_err(|e| e.to_string())?;
            if profiles(repo)?.1 != expected_fingerprint {
                return Err("Worktree profiles changed since preview".into());
            }
            validate_profiles(repo, &values)?;
            save_record(repo, "profiles", "current", &values)?;
            profiles_value(repo)
        }
        GitExpansionRequest::ProfileApply {
            profile_id,
            target_path,
            expected_profile_fingerprint,
            confirmed,
        } => apply_profile(
            repo,
            &profile_id,
            &target_path,
            &expected_profile_fingerprint,
            confirmed,
        ),
        GitExpansionRequest::Housekeeping => housekeeping(repo),
        GitExpansionRequest::BisectTest {
            command,
            expected_head,
            mark_result,
            confirmed,
        } => bisect_test(repo, &command, &expected_head, mark_result, confirmed),
        GitExpansionRequest::SparseStatus => sparse_status(repo),
        GitExpansionRequest::SparseSet {
            directories,
            expected_head,
            confirmed,
        } => sparse_change(repo, Some(directories), &expected_head, confirmed),
        GitExpansionRequest::SparseDisable {
            expected_head,
            confirmed,
        } => sparse_change(repo, None, &expected_head, confirmed),
        GitExpansionRequest::Integration {
            base,
            heads,
            command,
            confirmed,
        } => {
            if heads.is_empty() || heads.len() > 32 {
                return Err("Choose 1–32 branch heads".into());
            }
            if command.is_some() {
                ensure_confirmed(confirmed)?;
            }
            let steps = heads
                .into_iter()
                .map(|commit| PlanStep {
                    kind: "merge".into(),
                    commit,
                })
                .collect::<Vec<_>>();
            rehearse(repo, &base, &steps, command.as_ref())
        }
        GitExpansionRequest::Overlap {
            base,
            heads,
            include_worktrees,
        } => {
            let mut result = overlap(repo, &base, &heads)?;
            if include_worktrees.unwrap_or(false) {
                let evidence =
                    worktree_overlap(repo, result["base"].as_str().ok_or("Missing pinned base")?)?;
                result["worktrees"] = evidence["worktrees"].clone();
                result["worktreeOverlaps"] = evidence["overlaps"].clone();
                result["worktreeErrors"] = evidence["errors"].clone();
            }
            Ok(result)
        }
        GitExpansionRequest::BehaviorCompare {
            base,
            head,
            command,
            artifacts,
            confirmed,
        } => behavior_compare(repo, &base, &head, &command, &artifacts, confirmed),
        GitExpansionRequest::SnapshotsList => list_snapshots(repo),
        GitExpansionRequest::SnapshotCapture {
            label,
            expected_head,
        } => capture(repo, label, &expected_head),
        GitExpansionRequest::SnapshotRestoreIndex {
            snapshot_id,
            expected_head,
            expected_index_tree,
        } => {
            let mutex = repo_mutation_mutex(repo)?;
            let _guard = mutex.lock().map_err(|e| e.to_string())?;
            require_head(repo, &expected_head)?;
            if index_tree(repo)? != expected_index_tree {
                return Err("Index changed since preview".into());
            }
            let snapshot: Snapshot = read_record(repo, "snapshots", &snapshot_id)?;
            git(repo, &["read-tree", &snapshot.index_tree])?;
            Ok(json!({"indexTree":snapshot.index_tree}))
        }
        GitExpansionRequest::SnapshotRescueBranch {
            snapshot_id,
            branch,
        } => {
            let snapshot: Snapshot = read_record(repo, "snapshots", &snapshot_id)?;
            let coordination = repo_coordination_mutex(repo)?;
            let _guard = coordination.lock().map_err(|e| e.to_string())?;
            create_branch(repo, &branch, &snapshot.head)
        }
        GitExpansionRequest::PlanPreview { base, steps } => {
            if steps.is_empty() {
                return Err("Choose at least one Git plan step".into());
            }
            let mut result = rehearse(repo, &base, &steps, None)?;
            let id = unique_id();
            result["planId"] = json!(id);
            save_record(repo, "plans", &id, &result)?;
            Ok(result)
        }
        GitExpansionRequest::PlanExport {
            plan_id,
            branch,
            expected_head,
        } => {
            let coordination = repo_coordination_mutex(repo)?;
            let _guard = coordination.lock().map_err(|e| e.to_string())?;
            require_head(repo, &expected_head)?;
            let plan: Value = read_record(repo, "plans", &plan_id)?;
            if !plan["steps"].as_array().is_some_and(|steps| {
                !steps.is_empty() && steps.iter().all(|step| step["success"] == true)
            }) {
                return Err("Cannot export an unsuccessful Git plan".into());
            }
            let head = plan["resultHead"]
                .as_str()
                .ok_or("Invalid Git plan result")?;
            create_branch(repo, &branch, head)
        }
    }
}

#[tauri::command]
pub async fn git_expansion(path: String, request: GitExpansionRequest) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || execute_request(&PathBuf::from(path), request))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "git_expansion/tests.rs"]
mod tests;
