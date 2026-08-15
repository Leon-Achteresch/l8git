use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::cmd::git_command;
use crate::git::run_git;

const HELPER_DIR: &str = "l8git-rebase";
const NOOP_EDITOR: &str = ":";

#[derive(Serialize, Debug)]
pub struct RebaseCommit {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub email: String,
    pub date: String,
}

#[derive(Serialize, Debug)]
pub struct RebaseStopped {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
}

#[derive(Serialize, Debug)]
pub struct RebaseTodoLine {
    pub action: String,
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
}

#[derive(Serialize, Debug)]
pub struct RebaseStatus {
    pub in_progress: bool,
    pub kind: String,
    pub step: u32,
    pub total: u32,
    pub head_name: Option<String>,
    pub onto: Option<String>,
    pub onto_short: Option<String>,
    pub current_action: Option<String>,
    pub stopped: Option<RebaseStopped>,
    pub conflicted_paths: Vec<String>,
    pub todo: Vec<RebaseTodoLine>,
}

#[derive(Serialize, Debug)]
pub struct RebaseResult {
    pub status: String,
    pub message: String,
    pub state: RebaseStatus,
}

#[derive(Serialize, Debug)]
pub struct FixupResult {
    pub status: String,
    pub message: String,
    pub commit: String,
    pub short_hash: String,
    pub rebased: bool,
    pub state: RebaseStatus,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub action: String,
    pub hash: String,
    #[serde(default)]
    pub new_message: Option<String>,
}

struct ResolvedItem {
    action: String,
    hash: String,
    subject: String,
    message: String,
    new_message: Option<String>,
}

async fn spawn_git<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f)
        .await
        .expect("git blocking task panicked")
}

fn run_git_env(repo: &Path, args: &[&str], env: &[(String, String)]) -> (bool, String) {
    let mut cmd = git_command();
    cmd.arg("-C").arg(repo).args(args);
    for (key, value) in env {
        cmd.env(key, value);
    }
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let merged = match (stdout.is_empty(), stderr.is_empty()) {
                (false, false) => format!("{stdout}\n{stderr}"),
                (false, true) => stdout,
                (true, false) => stderr,
                (true, true) => String::new(),
            };
            span.finish(output.status.success());
            (output.status.success(), merged.trim().to_string())
        }
        Err(e) => {
            span.finish(false);
            (false, format!("failed to run git: {e}"))
        }
    }
}

fn map_error(message: String) -> String {
    let trimmed = message.trim().to_string();
    if trimmed.contains("Your local changes to the following files would be overwritten")
        || trimmed.contains("Please commit your changes or stash them before you")
        || trimmed.contains("cannot rebase: You have unstaged changes")
        || trimmed.contains("cannot rebase: Your index contains uncommitted changes")
    {
        let files: Vec<&str> = trimmed
            .lines()
            .filter(|l| l.starts_with('\t'))
            .map(|l| l.trim())
            .collect();
        return format!("__LOCAL_CHANGES_BLOCK__|{}", files.join(","));
    }
    if trimmed.is_empty() {
        return "git: command failed".into();
    }
    trimmed
}

fn dirty_tracked_files(repo: &Path) -> Vec<String> {
    let out = run_git(
        &repo.to_path_buf(),
        &["status", "--porcelain=v1", "--untracked-files=no"],
    )
    .unwrap_or_default();
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

fn git_path(repo: &Path, name: &str) -> Option<PathBuf> {
    let raw = run_git(&repo.to_path_buf(), &["rev-parse", "--git-path", name]).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let p = Path::new(trimmed);
    Some(if p.is_absolute() {
        p.to_path_buf()
    } else {
        repo.join(p)
    })
}

fn absolute_git_dir(repo: &Path) -> Result<PathBuf, String> {
    let raw = run_git(&repo.to_path_buf(), &["rev-parse", "--absolute-git-dir"])
        .map_err(|e| map_error(e))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Not a git repository.".into());
    }
    Ok(PathBuf::from(trimmed))
}

fn read_trimmed(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn read_number(path: &Path) -> u32 {
    read_trimmed(path)
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0)
}

fn conflicted_paths(repo: &Path) -> Vec<String> {
    let (_, out) = run_git_env(repo, &["diff", "--name-only", "--diff-filter=U"], &[]);
    out.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

fn short_hash(repo: &Path, rev: &str) -> String {
    run_git(&repo.to_path_buf(), &["rev-parse", "--short", rev])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| rev.chars().take(7).collect())
}

fn commit_subject(repo: &Path, rev: &str) -> String {
    run_git(&repo.to_path_buf(), &["log", "-1", "--format=%s", rev])
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn commit_message(repo: &Path, rev: &str) -> String {
    run_git(&repo.to_path_buf(), &["log", "-1", "--format=%B", rev])
        .map(|s| s.trim_end().to_string())
        .unwrap_or_default()
}

fn resolve_commit(repo: &Path, rev: &str) -> Option<String> {
    run_git(
        &repo.to_path_buf(),
        &["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")],
    )
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn is_commit_action(action: &str) -> bool {
    matches!(
        action,
        "pick" | "p" | "reword" | "r" | "edit" | "e" | "squash" | "s" | "fixup" | "f" | "drop" | "d"
    )
}

fn normalize_action(action: &str) -> Option<&'static str> {
    match action.trim().to_lowercase().as_str() {
        "pick" | "p" => Some("pick"),
        "reword" | "r" => Some("reword"),
        "squash" | "s" => Some("squash"),
        "fixup" | "f" => Some("fixup"),
        "drop" | "d" => Some("drop"),
        "edit" | "e" => Some("edit"),
        _ => None,
    }
}

fn parse_todo_file(repo: &Path, path: &Path) -> Vec<RebaseTodoLine> {
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut lines = Vec::new();
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(action) = parts.next() else {
            continue;
        };
        if !is_commit_action(action) {
            lines.push(RebaseTodoLine {
                action: action.to_string(),
                hash: String::new(),
                short_hash: String::new(),
                subject: line
                    .splitn(2, char::is_whitespace)
                    .nth(1)
                    .unwrap_or_default()
                    .trim()
                    .to_string(),
            });
            continue;
        }
        let hash = parts.next().unwrap_or_default().to_string();
        let subject = line
            .splitn(3, char::is_whitespace)
            .nth(2)
            .unwrap_or_default()
            .trim()
            .trim_start_matches('#')
            .trim()
            .to_string();
        let full = resolve_commit(repo, &hash).unwrap_or_else(|| hash.clone());
        lines.push(RebaseTodoLine {
            action: normalize_action(action).unwrap_or("pick").to_string(),
            short_hash: short_hash(repo, &full),
            subject: if subject.is_empty() {
                commit_subject(repo, &full)
            } else {
                subject
            },
            hash: full,
        });
    }
    lines
}

fn last_done_entry(path: &Path) -> Option<(String, String)> {
    let content = fs::read_to_string(path).ok()?;
    for raw in content.lines().rev() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let action = parts.next()?.to_string();
        let hash = parts.next().unwrap_or_default().to_string();
        return Some((action, hash));
    }
    None
}

fn empty_status() -> RebaseStatus {
    RebaseStatus {
        in_progress: false,
        kind: "none".into(),
        step: 0,
        total: 0,
        head_name: None,
        onto: None,
        onto_short: None,
        current_action: None,
        stopped: None,
        conflicted_paths: Vec::new(),
        todo: Vec::new(),
    }
}

fn stopped_info(repo: &Path, rev: &str) -> Option<RebaseStopped> {
    let full = resolve_commit(repo, rev)?;
    Some(RebaseStopped {
        short_hash: short_hash(repo, &full),
        subject: commit_subject(repo, &full),
        hash: full,
    })
}

fn build_status(repo: &Path) -> Result<RebaseStatus, String> {
    absolute_git_dir(repo)?;

    let merge_dir = git_path(repo, "rebase-merge");
    let apply_dir = git_path(repo, "rebase-apply");

    if let Some(dir) = merge_dir.filter(|d| d.is_dir()) {
        let ours = helper_dir(repo)
            .map(|d| d.join("todo").is_file())
            .unwrap_or(false);
        let interactive = ours
            || (dir.join("interactive").exists()
                && !dir.join("drop_redundant_commits").exists());
        let head_name = read_trimmed(&dir.join("head-name"))
            .map(|s| s.trim_start_matches("refs/heads/").to_string());
        let onto = read_trimmed(&dir.join("onto"));
        let onto_short = onto.as_ref().map(|o| short_hash(repo, o));
        let done = last_done_entry(&dir.join("done"));
        let current_action = done.as_ref().map(|(a, _)| {
            normalize_action(a).map(|s| s.to_string()).unwrap_or_else(|| a.clone())
        });
        let stopped_rev = read_trimmed(&dir.join("stopped-sha"))
            .or_else(|| done.and_then(|(_, h)| if h.is_empty() { None } else { Some(h) }));
        let stopped = stopped_rev.and_then(|rev| stopped_info(repo, &rev));

        return Ok(RebaseStatus {
            in_progress: true,
            kind: if interactive { "interactive".into() } else { "normal".into() },
            step: read_number(&dir.join("msgnum")),
            total: read_number(&dir.join("end")),
            head_name,
            onto,
            onto_short,
            current_action,
            stopped,
            conflicted_paths: conflicted_paths(repo),
            todo: parse_todo_file(repo, &dir.join("git-rebase-todo")),
        });
    }

    if let Some(dir) = apply_dir.filter(|d| d.is_dir()) {
        let head_name = read_trimmed(&dir.join("head-name"))
            .map(|s| s.trim_start_matches("refs/heads/").to_string());
        let onto = read_trimmed(&dir.join("onto"));
        let onto_short = onto.as_ref().map(|o| short_hash(repo, o));
        let stopped = read_trimmed(&dir.join("original-commit"))
            .and_then(|rev| stopped_info(repo, &rev));

        return Ok(RebaseStatus {
            in_progress: true,
            kind: "normal".into(),
            step: read_number(&dir.join("next")),
            total: read_number(&dir.join("last")),
            head_name,
            onto,
            onto_short,
            current_action: Some("pick".into()),
            stopped,
            conflicted_paths: conflicted_paths(repo),
            todo: Vec::new(),
        });
    }

    Ok(empty_status())
}

fn helper_dir(repo: &Path) -> Option<PathBuf> {
    absolute_git_dir(repo).ok().map(|d| d.join(HELPER_DIR))
}

fn cleanup_helper(repo: &Path) {
    if let Some(dir) = helper_dir(repo) {
        let _ = fs::remove_dir_all(dir);
    }
}

fn script_name(prefix: &str) -> String {
    if is_windows() {
        format!("{prefix}.cmd")
    } else {
        format!("{prefix}.sh")
    }
}

fn editor_value(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let needs_quotes = raw
        .chars()
        .any(|c| "|&;<>()$`\\\"' \t\n*?[#~=%".contains(c));
    if needs_quotes {
        format!("'{}'", raw.replace('\'', "'\\''"))
    } else {
        raw
    }
}

fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

fn native_path(path: &Path, windows: bool) -> String {
    let raw = path.to_string_lossy().to_string();
    if windows {
        raw.replace('/', "\\")
    } else {
        raw
    }
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("failed to prepare rebase helper: {e}"))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn write_script(path: &Path, body: &str) -> Result<(), String> {
    let content = if is_windows() {
        body.replace('\n', "\r\n")
    } else {
        body.to_string()
    };
    fs::write(path, content).map_err(|e| format!("failed to write rebase helper: {e}"))?;
    make_executable(path)
}

fn sequence_editor_body(dir: &Path, windows: bool) -> String {
    if windows {
        format!(
            "@echo off\ncopy /Y \"{dir}\\todo\" \"%~1\" >NUL\nexit /b 0\n",
            dir = native_path(dir, windows)
        )
    } else {
        format!(
            "#!/bin/sh\ncat '{dir}/todo' > \"$1\"\nexit 0\n",
            dir = dir.to_string_lossy()
        )
    }
}

fn message_editor_body(dir: &Path, git_dir: &Path, windows: bool) -> String {
    if windows {
        format!(
            concat!(
                "@echo off\n",
                "setlocal enabledelayedexpansion\n",
                "set \"done={git_dir}\\rebase-merge\\done\"\n",
                "if not exist \"%done%\" exit /b 0\n",
                "set \"last=\"\n",
                "for /f \"usebackq delims=\" %%L in (\"%done%\") do set \"last=%%L\"\n",
                "if not defined last exit /b 0\n",
                "set \"oid=\"\n",
                "for /f \"tokens=1,2\" %%a in (\"!last!\") do set \"oid=%%b\"\n",
                "if not defined oid exit /b 0\n",
                "if exist \"{dir}\\msg-!oid!\" copy /Y \"{dir}\\msg-!oid!\" \"%~1\" >NUL\n",
                "exit /b 0\n"
            ),
            dir = native_path(dir, windows),
            git_dir = native_path(git_dir, windows)
        )
    } else {
        format!(
            concat!(
                "#!/bin/sh\n",
                "done_file='{git_dir}/rebase-merge/done'\n",
                "[ -f \"$done_file\" ] || exit 0\n",
                "last=$(tail -n 1 \"$done_file\")\n",
                "rest=\"${{last#* }}\"\n",
                "oid=\"${{rest%% *}}\"\n",
                "if [ -n \"$oid\" ] && [ -f '{dir}/msg-'\"$oid\" ]; then\n",
                "  cat '{dir}/msg-'\"$oid\" > \"$1\"\n",
                "fi\n",
                "exit 0\n"
            ),
            dir = dir.to_string_lossy(),
            git_dir = git_dir.to_string_lossy()
        )
    }
}

fn write_helper_files(
    repo: &Path,
    todo_text: &str,
    messages: &[(String, String)],
) -> Result<(String, String), String> {
    let git_dir = absolute_git_dir(repo)?;
    let dir = git_dir.join(HELPER_DIR);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create rebase helper dir: {e}"))?;

    fs::write(dir.join("todo"), todo_text)
        .map_err(|e| format!("failed to write rebase todo: {e}"))?;
    for (oid, message) in messages {
        let mut body = message.trim_end().to_string();
        body.push('\n');
        fs::write(dir.join(format!("msg-{oid}")), body)
            .map_err(|e| format!("failed to write rebase message: {e}"))?;
    }

    let seq = dir.join(script_name("seq-editor"));
    let msg = dir.join(script_name("msg-editor"));
    write_script(&seq, &sequence_editor_body(&dir, is_windows()))?;
    write_script(&msg, &message_editor_body(&dir, &git_dir, is_windows()))?;

    Ok((editor_value(&seq), editor_value(&msg)))
}

fn resume_env(repo: &Path) -> Vec<(String, String)> {
    let msg_script = helper_dir(repo).map(|d| d.join(script_name("msg-editor")));
    let editor = match msg_script {
        Some(p) if p.is_file() => editor_value(&p),
        _ => NOOP_EDITOR.to_string(),
    };
    vec![
        ("GIT_EDITOR".to_string(), editor),
        ("GIT_SEQUENCE_EDITOR".to_string(), NOOP_EDITOR.to_string()),
    ]
}

fn noop_env() -> Vec<(String, String)> {
    vec![
        ("GIT_EDITOR".to_string(), NOOP_EDITOR.to_string()),
        ("GIT_SEQUENCE_EDITOR".to_string(), NOOP_EDITOR.to_string()),
    ]
}

fn finish(repo: &Path, ok: bool, output: String) -> Result<RebaseResult, String> {
    let state = build_status(repo)?;
    if state.in_progress {
        let status = if state.conflicted_paths.is_empty() {
            "stopped"
        } else {
            "conflict"
        };
        return Ok(RebaseResult {
            status: status.into(),
            message: output,
            state,
        });
    }
    cleanup_helper(repo);
    if ok {
        Ok(RebaseResult {
            status: "completed".into(),
            message: output,
            state,
        })
    } else {
        Err(map_error(output))
    }
}

fn ensure_no_rebase(repo: &Path) -> Result<(), String> {
    let state = build_status(repo)?;
    if state.in_progress {
        return Err("A rebase is already in progress. Continue, skip or abort it first.".into());
    }
    Ok(())
}

fn ensure_rebase(repo: &Path) -> Result<(), String> {
    let state = build_status(repo)?;
    if !state.in_progress {
        return Err("No rebase in progress.".into());
    }
    Ok(())
}

fn preview_commits(repo: &Path, base: &str) -> Result<Vec<RebaseCommit>, String> {
    let range = format!("{base}..HEAD");
    let (ok, out) = run_git_env(
        repo,
        &[
            "log",
            "--topo-order",
            "--reverse",
            "--no-merges",
            "--format=%H\x1f%h\x1f%s\x1f%an\x1f%ae\x1f%aI",
            &range,
        ],
        &[],
    );
    if !ok {
        return Err(map_error(out));
    }
    let mut commits = Vec::new();
    for line in out.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() < 6 {
            continue;
        }
        commits.push(RebaseCommit {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            subject: parts[2].to_string(),
            author: parts[3].to_string(),
            email: parts[4].to_string(),
            date: parts[5].to_string(),
        });
    }
    Ok(commits)
}

#[tauri::command]
pub async fn rebase_status(path: String) -> Result<RebaseStatus, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        build_status(&repo)
    })
    .await
}

#[tauri::command]
pub async fn rebase_start(
    path: String,
    upstream: String,
    onto: Option<String>,
    autostash: bool,
) -> Result<RebaseResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let up = upstream.trim().to_string();
        if up.is_empty() {
            return Err("Upstream must not be empty.".into());
        }
        ensure_no_rebase(&repo)?;
        if resolve_commit(&repo, &up).is_none() {
            return Err(format!("Unknown upstream: {up}"));
        }
        let onto_ref = onto
            .as_deref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if let Some(target) = onto_ref.as_ref() {
            if resolve_commit(&repo, target).is_none() {
                return Err(format!("Unknown onto target: {target}"));
            }
        }
        if !autostash {
            let dirty = dirty_tracked_files(&repo);
            if !dirty.is_empty() {
                return Err(format!("__LOCAL_CHANGES_BLOCK__|{}", dirty.join(",")));
            }
        }
        cleanup_helper(&repo);

        let mut args: Vec<String> = vec!["rebase".into()];
        args.push(if autostash { "--autostash".into() } else { "--no-autostash".into() });
        if let Some(target) = onto_ref.as_ref() {
            args.push("--onto".into());
            args.push(target.clone());
        }
        args.push(up);
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let (ok, out) = run_git_env(&repo, &refs, &noop_env());
        finish(&repo, ok, out)
    })
    .await
}

#[tauri::command]
pub async fn rebase_continue(path: String) -> Result<RebaseResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        ensure_rebase(&repo)?;
        let (ok, out) = run_git_env(&repo, &["rebase", "--continue"], &resume_env(&repo));
        finish(&repo, ok, out)
    })
    .await
}

#[tauri::command]
pub async fn rebase_skip(path: String) -> Result<RebaseResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        ensure_rebase(&repo)?;
        let (ok, out) = run_git_env(&repo, &["rebase", "--skip"], &resume_env(&repo));
        finish(&repo, ok, out)
    })
    .await
}

#[tauri::command]
pub async fn rebase_abort(path: String) -> Result<RebaseResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        ensure_rebase(&repo)?;
        let (ok, out) = run_git_env(&repo, &["rebase", "--abort"], &noop_env());
        cleanup_helper(&repo);
        let state = build_status(&repo)?;
        if !ok && state.in_progress {
            return Err(map_error(out));
        }
        Ok(RebaseResult {
            status: "aborted".into(),
            message: out,
            state,
        })
    })
    .await
}

#[tauri::command]
pub async fn rebase_todo_preview(path: String, base: String) -> Result<Vec<RebaseCommit>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let b = base.trim().to_string();
        if b.is_empty() {
            return Err("Base must not be empty.".into());
        }
        if resolve_commit(&repo, &b).is_none() {
            return Err(format!("Unknown base commit: {b}"));
        }
        preview_commits(&repo, &b)
    })
    .await
}

#[tauri::command]
pub async fn rebase_interactive(
    path: String,
    base: String,
    todo: Vec<TodoItem>,
    autostash: bool,
) -> Result<RebaseResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let b = base.trim().to_string();
        if b.is_empty() {
            return Err("Base must not be empty.".into());
        }
        ensure_no_rebase(&repo)?;
        if resolve_commit(&repo, &b).is_none() {
            return Err(format!("Unknown base commit: {b}"));
        }
        if todo.is_empty() {
            return Err("The todo list must not be empty.".into());
        }

        let allowed: Vec<String> = preview_commits(&repo, &b)?
            .into_iter()
            .map(|c| c.hash)
            .collect();
        if allowed.is_empty() {
            return Err("There are no commits between the base commit and HEAD.".into());
        }

        let mut resolved: Vec<ResolvedItem> = Vec::new();
        let mut seen: Vec<String> = Vec::new();
        for item in &todo {
            let Some(action) = normalize_action(&item.action) else {
                return Err(format!("Unknown rebase action: {}", item.action.trim()));
            };
            let raw_hash = item.hash.trim();
            let Some(hash) = resolve_commit(&repo, raw_hash) else {
                return Err(format!("Unknown commit: {raw_hash}"));
            };
            if !allowed.contains(&hash) {
                return Err(format!(
                    "Commit {} is not part of the rebase range.",
                    short_hash(&repo, &hash)
                ));
            }
            if seen.contains(&hash) {
                return Err(format!(
                    "Commit {} appears more than once in the todo list.",
                    short_hash(&repo, &hash)
                ));
            }
            seen.push(hash.clone());
            resolved.push(ResolvedItem {
                action: action.to_string(),
                subject: commit_subject(&repo, &hash),
                message: commit_message(&repo, &hash),
                new_message: item
                    .new_message
                    .as_ref()
                    .map(|m| m.trim().to_string())
                    .filter(|m| !m.is_empty()),
                hash,
            });
        }

        let mut groups: Vec<(ResolvedItem, Vec<ResolvedItem>)> = Vec::new();
        for item in resolved {
            match item.action.as_str() {
                "drop" => continue,
                "squash" | "fixup" => {
                    let Some(last) = groups.last_mut() else {
                        return Err(
                            "The first commit cannot be squashed or fixed up. Start with pick, reword or edit."
                                .into(),
                        );
                    };
                    last.1.push(item);
                }
                _ => groups.push((item, Vec::new())),
            }
        }
        if groups.is_empty() {
            return Err("Nothing to do: every commit was dropped.".into());
        }

        let mut lines: Vec<String> = Vec::new();
        let mut messages: Vec<(String, String)> = Vec::new();
        for (leader, followers) in &groups {
            let has_squash = followers.iter().any(|f| f.action == "squash");
            let mut explicit = leader.new_message.clone();
            for f in followers {
                if let Some(m) = f.new_message.clone() {
                    explicit = Some(m);
                }
            }
            let combined = if has_squash {
                let mut parts = vec![leader.message.trim().to_string()];
                for f in followers {
                    if f.action == "squash" {
                        parts.push(f.message.trim().to_string());
                    }
                }
                Some(
                    parts
                        .into_iter()
                        .filter(|p| !p.is_empty())
                        .collect::<Vec<String>>()
                        .join("\n\n"),
                )
            } else {
                None
            };
            let target_message = explicit.or(combined);

            if leader.action == "edit" {
                lines.push(format!("edit {} {}", leader.hash, leader.subject));
                for f in followers {
                    lines.push(format!("{} {} {}", f.action, f.hash, f.subject));
                }
                if has_squash {
                    if let (Some(message), Some(last)) = (target_message, followers.last()) {
                        messages.push((last.hash.clone(), message));
                    }
                }
                continue;
            }

            let wanted = target_message.filter(|m| m.trim() != leader.message.trim());
            if let Some(message) = wanted {
                lines.push(format!("reword {} {}", leader.hash, leader.subject));
                messages.push((leader.hash.clone(), message));
            } else {
                lines.push(format!("pick {} {}", leader.hash, leader.subject));
            }
            for f in followers {
                lines.push(format!("fixup {} {}", f.hash, f.subject));
            }
        }

        if !autostash {
            let dirty = dirty_tracked_files(&repo);
            if !dirty.is_empty() {
                return Err(format!("__LOCAL_CHANGES_BLOCK__|{}", dirty.join(",")));
            }
        }

        let mut todo_text = lines.join("\n");
        todo_text.push('\n');
        let (seq_editor, msg_editor) = write_helper_files(&repo, &todo_text, &messages)?;

        let env = vec![
            ("GIT_SEQUENCE_EDITOR".to_string(), seq_editor),
            ("GIT_EDITOR".to_string(), msg_editor),
        ];
        let mut args: Vec<String> = vec!["rebase".into(), "--interactive".into()];
        args.push("--no-autosquash".into());
        args.push(if autostash { "--autostash".into() } else { "--no-autostash".into() });
        args.push(b);
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let (ok, out) = run_git_env(&repo, &refs, &env);
        finish(&repo, ok, out)
    })
    .await
}

#[tauri::command]
pub async fn commit_fixup(
    path: String,
    target_hash: String,
    autosquash: bool,
) -> Result<FixupResult, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let target = target_hash.trim().to_string();
        if target.is_empty() {
            return Err("Target commit must not be empty.".into());
        }
        ensure_no_rebase(&repo)?;
        let Some(full_target) = resolve_commit(&repo, &target) else {
            return Err(format!("Unknown commit: {target}"));
        };
        let (nothing_staged, _) = run_git_env(&repo, &["diff", "--cached", "--quiet"], &[]);
        if nothing_staged {
            return Err("Nothing is staged for the fixup commit.".into());
        }

        let (ok, out) = run_git_env(
            &repo,
            &["commit", &format!("--fixup={full_target}")],
            &noop_env(),
        );
        if !ok {
            return Err(map_error(out));
        }
        let commit = resolve_commit(&repo, "HEAD").unwrap_or_default();
        let commit_short = short_hash(&repo, &commit);

        if !autosquash {
            return Ok(FixupResult {
                status: "committed".into(),
                message: out,
                commit,
                short_hash: commit_short,
                rebased: false,
                state: build_status(&repo)?,
            });
        }

        cleanup_helper(&repo);
        let parent = resolve_commit(&repo, &format!("{full_target}^"));
        let mut args: Vec<String> = vec![
            "rebase".into(),
            "--interactive".into(),
            "--autosquash".into(),
            "--autostash".into(),
        ];
        match parent {
            Some(p) => args.push(p),
            None => args.push("--root".into()),
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let (rebase_ok, rebase_out) = run_git_env(&repo, &refs, &noop_env());
        let result = finish(&repo, rebase_ok, rebase_out).map_err(|e| {
            format!("Fixup commit {commit_short} was created, but the autosquash rebase failed: {e}")
        })?;
        Ok(FixupResult {
            status: result.status,
            message: result.message,
            commit,
            short_hash: commit_short,
            rebased: true,
            state: result.state,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRepo {
        path: PathBuf,
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    impl TestRepo {
        fn new() -> TestRepo {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!(
                "l8git-rebase-test-{}-{}",
                std::process::id(),
                id
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            let repo = TestRepo { path };
            repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
            repo.git(&["config", "user.email", "test@example.com"]);
            repo.git(&["config", "user.name", "Test"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            let (ok, out) = run_git_env(&self.path, args, &noop_env());
            assert!(ok, "git {args:?} failed: {out}");
            out
        }

        fn commit(&self, file: &str, content: &str, message: &str) -> String {
            fs::write(self.path.join(file), content).unwrap();
            self.git(&["add", file]);
            self.git(&["commit", "-q", "-m", message]);
            self.git(&["rev-parse", "HEAD"])
        }

        fn subjects(&self) -> Vec<String> {
            self.git(&["log", "--format=%s"])
                .lines()
                .map(|l| l.to_string())
                .collect()
        }

        fn body(&self, rev: &str) -> String {
            self.git(&["log", "-1", "--format=%B", rev]).trim().to_string()
        }
    }

    fn item(action: &str, hash: &str, message: Option<&str>) -> TodoItem {
        TodoItem {
            action: action.into(),
            hash: hash.into(),
            new_message: message.map(|m| m.to_string()),
        }
    }

    fn linear_repo() -> (TestRepo, Vec<String>) {
        let repo = TestRepo::new();
        let mut hashes = Vec::new();
        for n in 1..=5 {
            hashes.push(repo.commit(&format!("f{n}.txt"), &format!("{n}\n"), &format!("c{n}")));
        }
        (repo, hashes)
    }

    #[tokio::test]
    async fn preview_lists_range_in_rebase_order() {
        let (repo, hashes) = linear_repo();
        let preview = rebase_todo_preview(
            repo.path.to_string_lossy().to_string(),
            hashes[0].clone(),
        )
        .await
        .unwrap();
        let subjects: Vec<String> = preview.iter().map(|c| c.subject.clone()).collect();
        assert_eq!(subjects, vec!["c2", "c3", "c4", "c5"]);
        assert_eq!(preview[0].hash, hashes[1]);
        assert!(!preview[0].short_hash.is_empty());
        assert_eq!(preview[0].author, "Test");
        assert!(preview[0].date.contains('T'));
    }

    #[tokio::test]
    async fn interactive_reorders_rewords_and_drops() {
        let (repo, hashes) = linear_repo();
        let todo = vec![
            item("pick", &hashes[3], None),
            item("reword", &hashes[1], Some("two reworded")),
            item("drop", &hashes[4], None),
            item("pick", &hashes[2], None),
        ];
        let result = rebase_interactive(
            repo.path.to_string_lossy().to_string(),
            hashes[0].clone(),
            todo,
            false,
        )
        .await
        .unwrap();
        assert_eq!(result.status, "completed", "{}", result.message);
        assert_eq!(repo.subjects(), vec!["c3", "two reworded", "c4", "c1"]);
        assert!(!helper_dir(&repo.path).unwrap().exists());
    }

    #[tokio::test]
    async fn interactive_squash_combines_messages() {
        let (repo, hashes) = linear_repo();
        let todo = vec![
            item("pick", &hashes[1], None),
            item("squash", &hashes[2], None),
            item("pick", &hashes[3], None),
            item("pick", &hashes[4], None),
        ];
        let result = rebase_interactive(
            repo.path.to_string_lossy().to_string(),
            hashes[0].clone(),
            todo,
            false,
        )
        .await
        .unwrap();
        assert_eq!(result.status, "completed", "{}", result.message);
        assert_eq!(repo.subjects(), vec!["c5", "c4", "c2", "c1"]);
        assert_eq!(repo.body("HEAD~2"), "c2\n\nc3");
    }

    #[tokio::test]
    async fn interactive_squash_uses_explicit_message() {
        let (repo, hashes) = linear_repo();
        let todo = vec![
            item("pick", &hashes[1], None),
            item("squash", &hashes[2], Some("merged two and three")),
            item("fixup", &hashes[3], None),
            item("pick", &hashes[4], None),
        ];
        let result = rebase_interactive(
            repo.path.to_string_lossy().to_string(),
            hashes[0].clone(),
            todo,
            false,
        )
        .await
        .unwrap();
        assert_eq!(result.status, "completed", "{}", result.message);
        assert_eq!(repo.subjects(), vec!["c5", "merged two and three", "c1"]);
        assert_eq!(repo.body("HEAD~1"), "merged two and three");
        assert!(repo.path.join("f4.txt").exists());
    }

    #[tokio::test]
    async fn interactive_edit_stops_and_continues() {
        let (repo, hashes) = linear_repo();
        let path = repo.path.to_string_lossy().to_string();
        let todo = vec![
            item("edit", &hashes[1], None),
            item("pick", &hashes[2], None),
        ];
        let result = rebase_interactive(path.clone(), hashes[0].clone(), todo, false)
            .await
            .unwrap();
        assert_eq!(result.status, "stopped", "{}", result.message);
        assert_eq!(result.state.current_action.as_deref(), Some("edit"));
        assert_eq!(result.state.kind, "interactive");
        assert_eq!(result.state.step, 1);
        assert_eq!(result.state.total, 2);
        assert_eq!(result.state.head_name.as_deref(), Some("main"));
        assert_eq!(
            result.state.stopped.as_ref().map(|s| s.subject.clone()),
            Some("c2".to_string())
        );
        assert_eq!(result.state.todo.len(), 1);
        assert_eq!(result.state.todo[0].subject, "c3");

        let done = rebase_continue(path).await.unwrap();
        assert_eq!(done.status, "completed", "{}", done.message);
        assert_eq!(repo.subjects(), vec!["c3", "c2", "c1"]);
    }

    fn conflict_repo() -> (TestRepo, Vec<String>) {
        let repo = TestRepo::new();
        let mut hashes = Vec::new();
        hashes.push(repo.commit("f.txt", "a\n", "c1"));
        hashes.push(repo.commit("f.txt", "a\nb\n", "c2"));
        hashes.push(repo.commit("f.txt", "a\nb\nc\n", "c3"));
        hashes.push(repo.commit("g.txt", "x\n", "c4"));
        (repo, hashes)
    }

    #[tokio::test]
    async fn interactive_conflict_reports_state_and_continues() {
        let (repo, hashes) = conflict_repo();
        let path = repo.path.to_string_lossy().to_string();
        let todo = vec![
            item("reword", &hashes[2], Some("three first")),
            item("pick", &hashes[1], None),
            item("pick", &hashes[3], None),
        ];
        let result = rebase_interactive(path.clone(), hashes[0].clone(), todo, false)
            .await
            .unwrap();
        assert_eq!(result.status, "conflict", "{}", result.message);
        assert_eq!(result.state.conflicted_paths, vec!["f.txt".to_string()]);
        assert_eq!(result.state.step, 1);
        assert_eq!(result.state.total, 3);
        assert_eq!(
            result.state.stopped.as_ref().map(|s| s.subject.clone()),
            Some("c3".to_string())
        );

        let live = rebase_status(path.clone()).await.unwrap();
        assert!(live.in_progress);
        assert_eq!(live.kind, "interactive");
        assert_eq!(live.conflicted_paths, vec!["f.txt".to_string()]);

        fs::write(repo.path.join("f.txt"), "a\nc\n").unwrap();
        repo.git(&["add", "f.txt"]);
        let step = rebase_continue(path.clone()).await.unwrap();
        assert_eq!(step.status, "conflict", "{}", step.message);
        assert_eq!(step.state.step, 2);

        fs::write(repo.path.join("f.txt"), "a\nb\nc\n").unwrap();
        repo.git(&["add", "f.txt"]);
        let last = rebase_continue(path.clone()).await.unwrap();
        assert_eq!(last.status, "completed", "{}", last.message);
        assert_eq!(repo.subjects(), vec!["c4", "c2", "three first", "c1"]);
        assert_eq!(repo.body("HEAD~2"), "three first");
    }

    #[tokio::test]
    async fn interactive_conflict_can_be_skipped_and_aborted() {
        let (repo, hashes) = conflict_repo();
        let path = repo.path.to_string_lossy().to_string();
        let before = repo.git(&["rev-parse", "HEAD"]);
        let todo = vec![
            item("pick", &hashes[2], None),
            item("pick", &hashes[1], None),
            item("pick", &hashes[3], None),
        ];
        let result = rebase_interactive(path.clone(), hashes[0].clone(), todo.clone(), false)
            .await
            .unwrap();
        assert_eq!(result.status, "conflict", "{}", result.message);

        let skipped = rebase_skip(path.clone()).await.unwrap();
        assert_eq!(skipped.status, "completed", "{}", skipped.message);
        assert_eq!(repo.subjects(), vec!["c4", "c2", "c1"]);
        assert!(!helper_dir(&repo.path).unwrap().exists());
        assert!(rebase_continue(path.clone()).await.is_err());

        repo.git(&["reset", "-q", "--hard", &before]);
        let result = rebase_interactive(path.clone(), hashes[0].clone(), todo, false)
            .await
            .unwrap();
        assert_eq!(result.status, "conflict", "{}", result.message);
        let aborted = rebase_abort(path.clone()).await.unwrap();
        assert_eq!(aborted.status, "aborted", "{}", aborted.message);
        assert!(!aborted.state.in_progress);
        assert_eq!(repo.git(&["rev-parse", "HEAD"]), before);
        assert!(!helper_dir(&repo.path).unwrap().exists());
        assert!(rebase_abort(path).await.is_err());
    }

    #[tokio::test]
    async fn start_rebases_branch_onto_upstream() {
        let repo = TestRepo::new();
        let path = repo.path.to_string_lossy().to_string();
        repo.commit("base.txt", "base\n", "c1");
        repo.git(&["checkout", "-q", "-b", "feature"]);
        repo.commit("feature.txt", "f\n", "feature work");
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("main.txt", "m\n", "main work");
        repo.git(&["checkout", "-q", "feature"]);

        let result = rebase_start(path.clone(), "main".into(), None, false)
            .await
            .unwrap();
        assert_eq!(result.status, "completed", "{}", result.message);
        assert_eq!(repo.subjects(), vec!["feature work", "main work", "c1"]);
        assert!(!rebase_status(path).await.unwrap().in_progress);
    }

    #[tokio::test]
    async fn start_reports_conflict_state_and_aborts() {
        let repo = TestRepo::new();
        let path = repo.path.to_string_lossy().to_string();
        repo.commit("f.txt", "base\n", "c1");
        repo.git(&["checkout", "-q", "-b", "feature"]);
        repo.commit("f.txt", "feature\n", "feature work");
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("f.txt", "main\n", "main work");
        repo.git(&["checkout", "-q", "feature"]);

        let result = rebase_start(path.clone(), "main".into(), None, false)
            .await
            .unwrap();
        assert_eq!(result.status, "conflict", "{}", result.message);
        assert_eq!(result.state.kind, "normal");
        assert_eq!(result.state.conflicted_paths, vec!["f.txt".to_string()]);
        assert_eq!(
            result.state.stopped.as_ref().map(|s| s.subject.clone()),
            Some("feature work".to_string())
        );
        assert_eq!(result.state.head_name.as_deref(), Some("feature"));

        let aborted = rebase_abort(path.clone()).await.unwrap();
        assert_eq!(aborted.status, "aborted");
        assert_eq!(repo.subjects(), vec!["feature work", "c1"]);
    }

    #[tokio::test]
    async fn start_supports_onto_and_blocks_dirty_worktree() {
        let repo = TestRepo::new();
        let path = repo.path.to_string_lossy().to_string();
        repo.commit("a.txt", "a\n", "c1");
        repo.git(&["checkout", "-q", "-b", "release"]);
        repo.commit("r.txt", "r\n", "release work");
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("b.txt", "b\n", "c2");
        repo.git(&["checkout", "-q", "-b", "topic"]);
        repo.commit("t.txt", "t\n", "topic work");

        fs::write(repo.path.join("b.txt"), "dirty\n").unwrap();
        let blocked = rebase_start(path.clone(), "main".into(), None, false)
            .await
            .unwrap_err();
        assert!(blocked.starts_with("__LOCAL_CHANGES_BLOCK__|"), "{blocked}");
        assert!(blocked.contains("b.txt"), "{blocked}");

        let stashed = rebase_start(path.clone(), "main".into(), Some("release".into()), true)
            .await
            .unwrap();
        assert_eq!(stashed.status, "completed", "{}", stashed.message);
        assert_eq!(repo.subjects(), vec!["topic work", "release work", "c1"]);
        assert_eq!(
            fs::read_to_string(repo.path.join("b.txt")).unwrap(),
            "dirty\n"
        );
    }

    #[tokio::test]
    async fn fixup_commit_with_and_without_autosquash() {
        let (repo, hashes) = linear_repo();
        let path = repo.path.to_string_lossy().to_string();

        let nothing = commit_fixup(path.clone(), hashes[1].clone(), false)
            .await
            .unwrap_err();
        assert!(nothing.contains("Nothing is staged"), "{nothing}");

        fs::write(repo.path.join("f2.txt"), "2 fixed\n").unwrap();
        repo.git(&["add", "f2.txt"]);
        let plain = commit_fixup(path.clone(), hashes[1].clone(), false)
            .await
            .unwrap();
        assert_eq!(plain.status, "committed");
        assert!(!plain.rebased);
        assert_eq!(repo.subjects()[0], "fixup! c2");

        assert!(commit_fixup(path, hashes[1].clone(), false).await.is_err());
    }

    #[tokio::test]
    async fn fixup_autosquash_folds_into_target() {
        let (repo, hashes) = linear_repo();
        let path = repo.path.to_string_lossy().to_string();

        fs::write(repo.path.join("f2.txt"), "2 fixed\n").unwrap();
        repo.git(&["add", "f2.txt"]);
        let squashed = commit_fixup(path, hashes[1].clone(), true).await.unwrap();
        assert_eq!(squashed.status, "completed", "{}", squashed.message);
        assert!(squashed.rebased);
        assert!(!squashed.commit.is_empty());

        let subjects = repo.subjects();
        assert!(
            !subjects.iter().any(|s| s.starts_with("fixup!")),
            "{subjects:?}"
        );
        assert_eq!(subjects, vec!["c5", "c4", "c3", "c2", "c1"]);
        assert_eq!(
            fs::read_to_string(repo.path.join("f2.txt")).unwrap(),
            "2 fixed\n"
        );
        assert_eq!(
            repo.git(&["show", "--format=%s", "--name-only", "HEAD~3"]),
            "c2\n\nf2.txt"
        );
    }

    #[tokio::test]
    async fn interactive_rejects_invalid_todos() {
        let (repo, hashes) = linear_repo();
        let path = repo.path.to_string_lossy().to_string();

        let err = rebase_interactive(
            path.clone(),
            hashes[0].clone(),
            vec![item("squash", &hashes[1], None)],
            false,
        )
        .await
        .unwrap_err();
        assert!(err.contains("first commit cannot be squashed"), "{err}");

        let err = rebase_interactive(
            path.clone(),
            hashes[0].clone(),
            vec![item("nope", &hashes[1], None)],
            false,
        )
        .await
        .unwrap_err();
        assert!(err.contains("Unknown rebase action"), "{err}");

        let err = rebase_interactive(
            path.clone(),
            hashes[0].clone(),
            vec![item("pick", &hashes[1], None), item("pick", &hashes[1], None)],
            false,
        )
        .await
        .unwrap_err();
        assert!(err.contains("more than once"), "{err}");

        let err = rebase_interactive(
            path.clone(),
            hashes[0].clone(),
            vec![item("pick", &hashes[0], None)],
            false,
        )
        .await
        .unwrap_err();
        assert!(err.contains("not part of the rebase range"), "{err}");

        let err = rebase_interactive(
            path.clone(),
            hashes[0].clone(),
            vec![item("drop", &hashes[1], None)],
            false,
        )
        .await
        .unwrap_err();
        assert!(err.contains("every commit was dropped"), "{err}");

        let err = rebase_interactive(path, "deadbeef".into(), vec![], false)
            .await
            .unwrap_err();
        assert!(err.contains("Unknown base commit"), "{err}");
    }

    #[test]
    fn generated_scripts_match_expected_shape() {
        let dir = Path::new("/repo/.git/l8git-rebase");
        let git_dir = Path::new("/repo/.git");
        assert_eq!(
            sequence_editor_body(dir, false),
            "#!/bin/sh\ncat '/repo/.git/l8git-rebase/todo' > \"$1\"\nexit 0\n"
        );
        let unix = message_editor_body(dir, git_dir, false);
        assert!(unix.starts_with("#!/bin/sh\n"), "{unix}");
        assert!(unix.contains("done_file='/repo/.git/rebase-merge/done'"), "{unix}");
        assert!(unix.contains("rest=\"${last#* }\""), "{unix}");
        assert!(unix.contains("oid=\"${rest%% *}\""), "{unix}");
        assert!(
            unix.contains("cat '/repo/.git/l8git-rebase/msg-'\"$oid\" > \"$1\""),
            "{unix}"
        );

        let win_dir = Path::new("C:/repo/.git/l8git-rebase");
        let win_git_dir = Path::new("C:/repo/.git");
        assert_eq!(
            sequence_editor_body(win_dir, true),
            "@echo off\ncopy /Y \"C:\\repo\\.git\\l8git-rebase\\todo\" \"%~1\" >NUL\nexit /b 0\n"
        );
        let win = message_editor_body(win_dir, win_git_dir, true);
        assert!(win.starts_with("@echo off\nsetlocal enabledelayedexpansion\n"), "{win}");
        assert!(win.contains("set \"done=C:\\repo\\.git\\rebase-merge\\done\""), "{win}");
        assert!(
            win.contains("for /f \"usebackq delims=\" %%L in (\"%done%\") do set \"last=%%L\""),
            "{win}"
        );
        assert!(
            win.contains("if exist \"C:\\repo\\.git\\l8git-rebase\\msg-!oid!\" copy /Y \"C:\\repo\\.git\\l8git-rebase\\msg-!oid!\" \"%~1\" >NUL"),
            "{win}"
        );
        assert!(win.ends_with("exit /b 0\n"), "{win}");
    }

    #[test]
    fn editor_value_quotes_only_when_needed() {
        assert_eq!(
            editor_value(Path::new("/tmp/repo/.git/l8git-rebase/seq-editor.sh")),
            "/tmp/repo/.git/l8git-rebase/seq-editor.sh"
        );
        assert_eq!(
            editor_value(Path::new("C:\\Users\\me\\repo\\.git\\x\\seq-editor.cmd")),
            "C:/Users/me/repo/.git/x/seq-editor.cmd"
        );
        assert_eq!(
            editor_value(Path::new("/tmp/my repo/.git/seq-editor.sh")),
            "'/tmp/my repo/.git/seq-editor.sh'"
        );
    }

    #[tokio::test]
    async fn interactive_todo_normalization_is_written_to_disk() {
        let (repo, hashes) = linear_repo();
        let path = repo.path.to_string_lossy().to_string();
        let todo = vec![
            item("edit", &hashes[3], None),
            item("pick", &hashes[1], None),
            item("squash", &hashes[2], Some("two plus three")),
            item("drop", &hashes[4], None),
        ];
        let result = rebase_interactive(path.clone(), hashes[0].clone(), todo, false)
            .await
            .unwrap();
        assert_eq!(result.status, "stopped", "{}", result.message);

        let dir = helper_dir(&repo.path).unwrap();
        let written = fs::read_to_string(dir.join("todo")).unwrap();
        assert_eq!(
            written,
            format!(
                "edit {} c4\nreword {} c2\nfixup {} c3\n",
                hashes[3], hashes[1], hashes[2]
            )
        );
        assert_eq!(
            fs::read_to_string(dir.join(format!("msg-{}", hashes[1]))).unwrap(),
            "two plus three\n"
        );
        assert!(dir.join(script_name("seq-editor")).is_file());
        assert!(dir.join(script_name("msg-editor")).is_file());

        let done = rebase_continue(path.clone()).await.unwrap();
        assert_eq!(done.status, "completed", "{}", done.message);
        assert_eq!(repo.subjects(), vec!["two plus three", "c4", "c1"]);
        assert!(!dir.exists());
    }

    #[tokio::test]
    async fn worktree_rebase_state_is_isolated() {
        let (repo, hashes) = conflict_repo();
        let wt = repo.path.parent().unwrap().join(format!(
            "l8git-rebase-wt-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&wt);
        repo.git(&["worktree", "add", "-q", "-b", "side", &wt.to_string_lossy(), &hashes[3]]);
        let wt_path = wt.to_string_lossy().to_string();

        let result = rebase_interactive(
            wt_path.clone(),
            hashes[0].clone(),
            vec![
                item("pick", &hashes[2], None),
                item("pick", &hashes[1], None),
                item("pick", &hashes[3], None),
            ],
            false,
        )
        .await
        .unwrap();
        assert_eq!(result.status, "conflict", "{}", result.message);

        let main_state = rebase_status(repo.path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(!main_state.in_progress);

        let wt_state = rebase_status(wt_path.clone()).await.unwrap();
        assert!(wt_state.in_progress);
        assert_eq!(wt_state.head_name.as_deref(), Some("side"));

        let aborted = rebase_abort(wt_path).await.unwrap();
        assert_eq!(aborted.status, "aborted");
        repo.git(&["worktree", "remove", "--force", &wt.to_string_lossy()]);
        let _ = fs::remove_dir_all(&wt);
    }
}
