use super::{resolve_git_commit, run_git, run_git_merged_output, spawn_git};
use serde::Serialize;
use std::path::PathBuf;

// ── Git Bisect ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BisectStatus {
    pub active: bool,
    pub done: bool,
    pub current_hash: Option<String>,
    pub current_subject: Option<String>,
    pub steps_remaining: Option<i32>,
    pub log: String,
    pub result_hash: Option<String>,
    pub result_subject: Option<String>,
    pub marked_bad: Vec<String>,
    pub marked_good: Vec<String>,
}

fn bisect_parse_log_marks(log: &str) -> (Vec<String>, Vec<String>) {
    let mut bad: Vec<String> = Vec::new();
    let mut good: Vec<String> = Vec::new();
    for line in log.lines() {
        let line = line.trim();
        // Lines like: # bad: [abc1234] subject  or  # good: [abc1234] subject
        if let Some(rest) = line.strip_prefix("# bad: [") {
            if let Some(end) = rest.find(']') {
                let hash = rest[..end].to_string();
                if !bad.contains(&hash) {
                    bad.push(hash);
                }
            }
        } else if let Some(rest) = line.strip_prefix("# good: [") {
            if let Some(end) = rest.find(']') {
                let hash = rest[..end].to_string();
                if !good.contains(&hash) {
                    good.push(hash);
                }
            }
        }
    }
    (bad, good)
}

fn bisect_build_status(repo: &PathBuf) -> Result<BisectStatus, String> {
    let raw = run_git(repo, &["rev-parse", "--git-path", "BISECT_LOG"])?;
    let bisect_log_path = repo.join(raw.strip_suffix('\n').unwrap_or(&raw));
    if !bisect_log_path.exists() {
        return Ok(BisectStatus {
            active: false,
            done: false,
            current_hash: None,
            current_subject: None,
            steps_remaining: None,
            log: String::new(),
            result_hash: None,
            result_subject: None,
            marked_bad: vec![],
            marked_good: vec![],
        });
    }

    let log = std::fs::read_to_string(&bisect_log_path)
        .map_err(|e| format!("failed to read bisect state: {e}"))?;

    let current_hash = run_git(repo, &["rev-parse", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string());
    let current_subject = current_hash.as_ref().and_then(|h| {
        run_git(repo, &["log", "-1", "--format=%s", h])
            .ok()
            .map(|s| s.trim().to_string())
    });

    let (marked_bad, marked_good) = bisect_parse_log_marks(&log);
    // The result belongs to the worktree's persistent bisect log. Parsing only
    // command output loses the completed state on every refresh or app restart.
    let result_hash = log.lines().rev().find_map(|line| {
        let rest = line.trim().strip_prefix("# first bad commit: [")?;
        let (hash, _) = rest.split_once(']')?;
        Some(hash.to_string())
    });
    let result_subject = result_hash.as_ref().and_then(|hash| {
        run_git(repo, &["log", "-1", "--format=%s", hash])
            .ok()
            .map(|subject| subject.trim().to_string())
    });
    let done = result_hash.is_some();
    let steps_remaining = if done || marked_good.is_empty() {
        None
    } else {
        marked_bad.last().and_then(|bad| {
            let mut args = vec!["rev-list", "--bisect-vars", bad.as_str(), "--not"];
            args.extend(marked_good.iter().map(String::as_str));
            run_git(repo, &args).ok().and_then(|vars| {
                vars.lines()
                    .find_map(|line| line.strip_prefix("bisect_steps=")?.parse().ok())
            })
        })
    };

    Ok(BisectStatus {
        active: true,
        done,
        current_hash,
        current_subject,
        steps_remaining,
        log,
        result_hash,
        result_subject,
        marked_bad,
        marked_good,
    })
}

fn bisect_resolve_commit(repo: &PathBuf, value: &str) -> Result<String, String> {
    resolve_git_commit(repo, value)
}

#[tauri::command]
pub async fn git_bisect_status(path: String) -> Result<BisectStatus, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        bisect_build_status(&repo)
    })
    .await
}

#[tauri::command]
pub async fn git_bisect_start(
    path: String,
    bad: String,
    good: String,
) -> Result<BisectStatus, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        if bisect_build_status(&repo)?.active {
            return Err("__BISECT_ALREADY_IN_PROGRESS__".into());
        }
        // Validate and pin both endpoints before Git changes branches or writes
        // BISECT_START, so an invalid revision cannot leave a partial session.
        let bad = bisect_resolve_commit(&repo, &bad)?;
        let good = bisect_resolve_commit(&repo, &good)?;
        if bad == good {
            return Err("The good and bad bisect revisions must be different.".into());
        }
        if let Err(error) = run_git_merged_output(&repo, &["bisect", "start", &bad, &good]) {
            return match run_git_merged_output(&repo, &["bisect", "reset"]) {
                Ok(_) => Err(error),
                Err(reset_error) => Err(format!(
                    "{error}\nFailed to reset the interrupted bisect: {reset_error}"
                )),
            };
        }
        bisect_build_status(&repo)
    })
    .await
}

#[tauri::command]
pub async fn git_bisect_mark(path: String, verdict: String) -> Result<BisectStatus, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let v = verdict.trim();
        if v != "good" && v != "bad" && v != "skip" {
            return Err(format!("Invalid verdict: {v}"));
        }
        run_git_merged_output(&repo, &["bisect", v])?;
        bisect_build_status(&repo)
    })
    .await
}

#[tauri::command]
pub async fn git_bisect_reset(path: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git_merged_output(&repo, &["bisect", "reset"])?;
        Ok(())
    })
    .await
}
