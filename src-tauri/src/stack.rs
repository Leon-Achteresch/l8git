use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::cmd::git_command;
use crate::rebase::RebaseStatus;

const PLAN_FILE: &str = "l8git-stack-restack";
const CONFIG_VAR: &str = "l8gitStackParent";
const CONFIG_VAR_LOWER: &str = "l8gitstackparent";
const MAX_STACK_COMMITS: usize = 20;
const SEP: &str = "\x1f";
const NOOP_EDITOR: &str = ":";

#[derive(Serialize, Debug, Clone)]
pub struct StackCommit {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct StackBranch {
    pub name: String,
    pub parent: String,
    pub level: u32,
    pub exists: bool,
    pub parent_exists: bool,
    pub broken: bool,
    pub is_current: bool,
    pub ahead: u32,
    pub behind: u32,
    pub needs_restack: bool,
    pub tip: String,
    pub short_tip: String,
    pub last_commit_at: String,
    pub upstream: Option<String>,
    pub commit_count: u32,
    pub commits: Vec<StackCommit>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Stack {
    pub root: String,
    pub root_exists: bool,
    pub root_tip: String,
    pub broken: bool,
    pub needs_restack: bool,
    pub branches: Vec<StackBranch>,
}

#[derive(Serialize, Debug, Clone)]
pub struct StackList {
    pub default_branch: String,
    pub current_branch: Option<String>,
    pub stacks: Vec<Stack>,
    pub cycles: Vec<Vec<String>>,
    pub has_cycle: bool,
    pub has_broken: bool,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StackRestackStep {
    pub branch: String,
    pub parent: String,
    pub old_base: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StackRestackPlan {
    pub branch: String,
    pub original_branch: Option<String>,
    pub done: Vec<String>,
    pub skipped: Vec<String>,
    pub current: Option<StackRestackStep>,
    pub pending: Vec<StackRestackStep>,
}

#[derive(Serialize, Debug)]
pub struct StackRestackState {
    pub active: bool,
    pub rebase_in_progress: bool,
    pub plan: Option<StackRestackPlan>,
}

#[derive(Serialize, Debug)]
pub struct StackRestackResult {
    pub status: String,
    pub message: String,
    pub branch: String,
    pub restacked: Vec<String>,
    pub skipped: Vec<String>,
    pub current: Option<StackRestackStep>,
    pub pending: Vec<StackRestackStep>,
    pub state: RebaseStatus,
}

#[derive(Serialize, Debug, Clone)]
pub struct CleanupCandidate {
    pub name: String,
    pub kind: String,
    pub last_commit_at: String,
    pub last_commit_age_days: u32,
    pub ahead_of_upstream: u32,
    pub has_upstream: bool,
    pub upstream: Option<String>,
    pub remote_merged: bool,
    pub tip: String,
    pub short_tip: String,
    pub subject: String,
}

#[derive(Serialize, Debug)]
pub struct BranchCleanupReport {
    pub default_branch: String,
    pub stale_days: u32,
    pub current_branch: Option<String>,
    pub candidates: Vec<CleanupCandidate>,
}

struct RestackOutcome {
    status: String,
    message: String,
    branch: String,
    restacked: Vec<String>,
    skipped: Vec<String>,
    current: Option<StackRestackStep>,
    pending: Vec<StackRestackStep>,
}

async fn spawn_git<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f)
        .await
        .expect("git blocking task panicked")
}

fn run(repo: &Path, args: &[&str]) -> (bool, String) {
    let mut cmd = git_command();
    cmd.arg("-C").arg(repo).args(args);
    cmd.env("GIT_EDITOR", NOOP_EDITOR);
    cmd.env("GIT_SEQUENCE_EDITOR", NOOP_EDITOR);
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
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

fn read(repo: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = git_command();
    cmd.arg("-C").arg(repo).args(args);
    cmd.env("GIT_EDITOR", NOOP_EDITOR);
    cmd.env("GIT_SEQUENCE_EDITOR", NOOP_EDITOR);
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    let output = cmd.output().ok();
    match output {
        Some(o) => {
            span.finish(o.status.success());
            if !o.status.success() {
                return None;
            }
            Some(String::from_utf8_lossy(&o.stdout).trim_end().to_string())
        }
        None => {
            span.finish(false);
            None
        }
    }
}

fn ok(repo: &Path, args: &[&str]) -> bool {
    read(repo, args).is_some()
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

fn absolute_git_dir(repo: &Path) -> Result<PathBuf, String> {
    let raw = read(repo, &["rev-parse", "--absolute-git-dir"])
        .ok_or_else(|| "Not a git repository.".to_string())?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Not a git repository.".into());
    }
    Ok(PathBuf::from(trimmed))
}

fn plan_path(repo: &Path) -> Result<PathBuf, String> {
    Ok(absolute_git_dir(repo)?.join(PLAN_FILE))
}

fn branch_exists(repo: &Path, name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    ok(
        repo,
        &["show-ref", "--verify", "--quiet", &format!("refs/heads/{name}")],
    )
}

fn head_branch(repo: &Path) -> Option<String> {
    read(repo, &["symbolic-ref", "--short", "--quiet", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn rev(repo: &Path, reference: &str) -> Option<String> {
    read(
        repo,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{reference}^{{commit}}"),
        ],
    )
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn short_hash(repo: &Path, reference: &str) -> String {
    read(repo, &["rev-parse", "--short", reference])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| reference.chars().take(7).collect())
}

fn is_ancestor(repo: &Path, ancestor: &str, descendant: &str) -> bool {
    ok(repo, &["merge-base", "--is-ancestor", ancestor, descendant])
}

fn merge_base(repo: &Path, a: &str, b: &str) -> Option<String> {
    read(repo, &["merge-base", a, b])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn rebase_in_progress(repo: &Path) -> bool {
    let Ok(dir) = absolute_git_dir(repo) else {
        return false;
    };
    dir.join("rebase-merge").is_dir() || dir.join("rebase-apply").is_dir()
}

fn local_branches(repo: &Path) -> Vec<String> {
    read(
        repo,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )
    .map(|out| {
        out.lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect()
    })
    .unwrap_or_default()
}

fn config_key(name: &str) -> String {
    format!("branch.{name}.{CONFIG_VAR}")
}

fn parent_map(repo: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Some(out) = read(
        repo,
        &[
            "config",
            "--local",
            "--get-regexp",
            r"^branch\..+\.l8gitstackparent$",
        ],
    ) else {
        return map;
    };
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        let lower = key.to_ascii_lowercase();
        let suffix = format!(".{CONFIG_VAR_LOWER}");
        if !lower.starts_with("branch.") || !lower.ends_with(&suffix) {
            continue;
        }
        let name = key[7..key.len() - suffix.len()].to_string();
        let parent = value.trim().to_string();
        if name.is_empty() || parent.is_empty() || name == parent {
            continue;
        }
        map.insert(name, parent);
    }
    map
}

fn set_parent(repo: &Path, name: &str, parent: &str) -> Result<(), String> {
    let (success, out) = run(
        repo,
        &["config", "--local", "--replace-all", &config_key(name), parent],
    );
    if !success {
        return Err(map_error(out));
    }
    Ok(())
}

fn unset_parent(repo: &Path, name: &str) -> Result<(), String> {
    let (success, out) = run(repo, &["config", "--local", "--unset-all", &config_key(name)]);
    if !success && !out.trim().is_empty() {
        return Err(map_error(out));
    }
    Ok(())
}

fn default_branch(repo: &Path) -> String {
    if let Ok(name) = crate::pr::origin_default_branch(&repo.to_path_buf()) {
        if branch_exists(repo, &name) {
            return name;
        }
    }
    for candidate in ["main", "master", "development", "develop", "trunk"] {
        if branch_exists(repo, candidate) {
            return candidate.to_string();
        }
    }
    head_branch(repo).unwrap_or_else(|| "main".to_string())
}

fn ahead_behind(repo: &Path, parent: &str, branch: &str) -> (u32, u32) {
    let Some(out) = read(
        repo,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{parent}...{branch}"),
        ],
    ) else {
        return (0, 0);
    };
    let mut parts = out.split_whitespace();
    let behind = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let ahead = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

fn stack_commits(repo: &Path, parent: &str, branch: &str) -> Vec<StackCommit> {
    let format = format!("--format=%H{SEP}%h{SEP}%s");
    let range = format!("{parent}..{branch}");
    let limit = format!("-n{MAX_STACK_COMMITS}");
    let Some(out) = read(repo, &["log", &format, &limit, &range]) else {
        return Vec::new();
    };
    out.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let mut parts = line.splitn(3, SEP);
            Some(StackCommit {
                hash: parts.next()?.to_string(),
                short_hash: parts.next()?.to_string(),
                subject: parts.next().unwrap_or_default().to_string(),
            })
        })
        .collect()
}

fn upstream_of(repo: &Path, branch: &str) -> Option<String> {
    read(
        repo,
        &[
            "for-each-ref",
            "--format=%(upstream:short)",
            &format!("refs/heads/{branch}"),
        ],
    )
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn last_commit_at(repo: &Path, branch: &str) -> String {
    read(
        repo,
        &[
            "for-each-ref",
            "--format=%(committerdate:iso-strict)",
            &format!("refs/heads/{branch}"),
        ],
    )
    .map(|s| s.trim().to_string())
    .unwrap_or_default()
}

fn root_of(name: &str, parents: &HashMap<String, String>) -> Result<(String, u32), Vec<String>> {
    let mut chain = vec![name.to_string()];
    let mut seen: HashSet<String> = HashSet::new();
    seen.insert(name.to_string());
    let mut current = name.to_string();
    let mut level = 0u32;
    loop {
        let Some(parent) = parents.get(&current) else {
            return Ok((current, level));
        };
        level += 1;
        if !seen.insert(parent.clone()) {
            let start = chain
                .iter()
                .position(|c| c == parent)
                .unwrap_or(0);
            let mut cycle: Vec<String> = chain[start..].to_vec();
            cycle.sort();
            return Err(cycle);
        }
        chain.push(parent.clone());
        current = parent.clone();
        if level > 1000 {
            let mut cycle = chain.clone();
            cycle.sort();
            return Err(cycle);
        }
    }
}

fn describe_branch(
    repo: &Path,
    name: &str,
    parent: &str,
    level: u32,
    current: Option<&str>,
    known: &HashSet<String>,
) -> StackBranch {
    let exists = known.contains(name);
    let parent_exists = known.contains(parent);
    let mut entry = StackBranch {
        name: name.to_string(),
        parent: parent.to_string(),
        level,
        exists,
        parent_exists,
        broken: !exists || !parent_exists,
        is_current: current == Some(name),
        ahead: 0,
        behind: 0,
        needs_restack: false,
        tip: String::new(),
        short_tip: String::new(),
        last_commit_at: String::new(),
        upstream: None,
        commit_count: 0,
        commits: Vec::new(),
    };
    if !exists {
        return entry;
    }
    entry.tip = rev(repo, name).unwrap_or_default();
    entry.short_tip = if entry.tip.is_empty() {
        String::new()
    } else {
        short_hash(repo, &entry.tip)
    };
    entry.last_commit_at = last_commit_at(repo, name);
    entry.upstream = upstream_of(repo, name);
    if !parent_exists {
        return entry;
    }
    let (ahead, behind) = ahead_behind(repo, parent, name);
    entry.ahead = ahead;
    entry.behind = behind;
    entry.commit_count = ahead;
    entry.commits = stack_commits(repo, parent, name);
    entry.needs_restack = !is_ancestor(repo, parent, name);
    entry
}

fn build_list(repo: &Path) -> Result<StackList, String> {
    absolute_git_dir(repo)?;
    let parents = parent_map(repo);
    let known: HashSet<String> = local_branches(repo).into_iter().collect();
    let current = head_branch(repo);
    let default = default_branch(repo);

    let mut errors: Vec<String> = Vec::new();
    let mut cycles: Vec<Vec<String>> = Vec::new();
    let mut cycle_members: HashSet<String> = HashSet::new();
    let mut roots: HashMap<String, Vec<(String, u32)>> = HashMap::new();

    let mut names: Vec<&String> = parents.keys().collect();
    names.sort();
    for name in names {
        match root_of(name, &parents) {
            Ok((root, level)) => {
                roots
                    .entry(root)
                    .or_default()
                    .push((name.clone(), level));
            }
            Err(cycle) => {
                for member in &cycle {
                    cycle_members.insert(member.clone());
                }
                if !cycles.contains(&cycle) {
                    errors.push(format!(
                        "Stack cycle detected: {}",
                        cycle.join(" -> ")
                    ));
                    cycles.push(cycle);
                }
            }
        }
    }

    let mut stacks: Vec<Stack> = Vec::new();
    let mut root_names: Vec<String> = roots.keys().cloned().collect();
    root_names.sort_by(|a, b| {
        let a_default = (a != &default) as u8;
        let b_default = (b != &default) as u8;
        a_default.cmp(&b_default).then_with(|| a.cmp(b))
    });

    for root in root_names {
        let mut members = roots.remove(&root).unwrap_or_default();
        members.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
        let mut branches: Vec<StackBranch> = Vec::new();
        for (name, level) in members {
            if cycle_members.contains(&name) {
                continue;
            }
            let parent = parents.get(&name).cloned().unwrap_or_default();
            let entry = describe_branch(repo, &name, &parent, level, current.as_deref(), &known);
            if !entry.exists {
                errors.push(format!("Stack branch no longer exists: {name}"));
            } else if !entry.parent_exists {
                errors.push(format!(
                    "Stack parent of {name} no longer exists: {parent}"
                ));
            }
            branches.push(entry);
        }
        if branches.is_empty() {
            continue;
        }
        let root_exists = known.contains(&root);
        if !root_exists {
            errors.push(format!("Stack base branch no longer exists: {root}"));
        }
        let root_tip = if root_exists {
            rev(repo, &root).unwrap_or_default()
        } else {
            String::new()
        };
        stacks.push(Stack {
            broken: !root_exists || branches.iter().any(|b| b.broken),
            needs_restack: branches.iter().any(|b| b.needs_restack),
            root,
            root_exists,
            root_tip,
            branches,
        });
    }

    Ok(StackList {
        default_branch: default,
        current_branch: current,
        has_cycle: !cycles.is_empty(),
        has_broken: stacks.iter().any(|s| s.broken),
        cycles,
        stacks,
        errors,
    })
}

fn validate_name(repo: &Path, name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Branch name must not be empty.".into());
    }
    if !ok(
        repo,
        &["check-ref-format", &format!("refs/heads/{name}")],
    ) {
        return Err(format!("Invalid branch name: {name}"));
    }
    Ok(())
}

fn ensure_no_cycle(
    parents: &HashMap<String, String>,
    name: &str,
    parent: &str,
) -> Result<(), String> {
    let mut current = parent.to_string();
    let mut guard = 0;
    loop {
        if current == name {
            return Err(format!(
                "{parent} already builds on {name}; that would create a cycle."
            ));
        }
        let Some(next) = parents.get(&current) else {
            return Ok(());
        };
        current = next.clone();
        guard += 1;
        if guard > 1000 {
            return Err("The stack configuration contains a cycle.".into());
        }
    }
}

fn descendants_of(branch: &str, parents: &HashMap<String, String>) -> Vec<(String, String)> {
    let mut order: Vec<(String, String)> = Vec::new();
    let mut level: Vec<String> = vec![branch.to_string()];
    let mut guard = 0;
    while !level.is_empty() && guard < 1000 {
        guard += 1;
        let mut next: Vec<String> = Vec::new();
        let mut children: Vec<(&String, &String)> = parents
            .iter()
            .filter(|(_, parent)| level.contains(parent))
            .collect();
        children.sort_by(|a, b| a.0.cmp(b.0));
        for (child, parent) in children {
            if order.iter().any(|(name, _)| name == child) || child == branch {
                continue;
            }
            order.push((child.clone(), parent.clone()));
            next.push(child.clone());
        }
        level = next;
    }
    order
}

fn build_plan(repo: &Path, branch: &str) -> Result<StackRestackPlan, String> {
    let parents = parent_map(repo);
    let Some(parent) = parents.get(branch).cloned() else {
        return Err(format!("{branch} is not part of a stack."));
    };
    if !branch_exists(repo, branch) {
        return Err(format!("Unknown branch: {branch}"));
    }
    ensure_no_cycle(&parents, branch, &parent)?;

    let mut steps: Vec<(String, String)> = vec![(branch.to_string(), parent)];
    steps.extend(descendants_of(branch, &parents));

    let mut plan_steps: Vec<StackRestackStep> = Vec::new();
    for (child, parent) in steps {
        if !branch_exists(repo, &child) {
            return Err(format!("Unknown branch: {child}"));
        }
        if !branch_exists(repo, &parent) {
            return Err(format!(
                "The parent branch {parent} of {child} no longer exists."
            ));
        }
        let Some(base) = merge_base(repo, &parent, &child) else {
            return Err(format!(
                "{child} and {parent} do not share a common history."
            ));
        };
        plan_steps.push(StackRestackStep {
            branch: child,
            parent,
            old_base: base,
        });
    }

    Ok(StackRestackPlan {
        branch: branch.to_string(),
        original_branch: head_branch(repo),
        done: Vec::new(),
        skipped: Vec::new(),
        current: None,
        pending: plan_steps,
    })
}

fn read_plan(repo: &Path) -> Option<StackRestackPlan> {
    let path = plan_path(repo).ok()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_plan(repo: &Path, plan: &StackRestackPlan) -> Result<(), String> {
    let path = plan_path(repo)?;
    let body = serde_json::to_string_pretty(plan)
        .map_err(|e| format!("failed to serialize restack plan: {e}"))?;
    fs::write(path, body).map_err(|e| format!("failed to write restack plan: {e}"))
}

fn clear_plan(repo: &Path) {
    if let Ok(path) = plan_path(repo) {
        let _ = fs::remove_file(path);
    }
}

fn run_plan(repo: &Path, mut plan: StackRestackPlan) -> Result<RestackOutcome, String> {
    let mut restacked: Vec<String> = Vec::new();
    while !plan.pending.is_empty() {
        let step = plan.pending.remove(0);
        if !branch_exists(repo, &step.branch) || !branch_exists(repo, &step.parent) {
            clear_plan(repo);
            return Err(format!(
                "The stack changed while restacking: {} or {} is missing.",
                step.branch, step.parent
            ));
        }
        let Some(parent_tip) = rev(repo, &step.parent) else {
            clear_plan(repo);
            return Err(format!("Unknown branch: {}", step.parent));
        };
        if is_ancestor(repo, &parent_tip, &step.branch) {
            plan.skipped.push(step.branch.clone());
            continue;
        }
        let (success, out) = run(
            repo,
            &[
                "rebase",
                "--autostash",
                "--onto",
                &parent_tip,
                &step.old_base,
                &step.branch,
            ],
        );
        if !success {
            if rebase_in_progress(repo) {
                plan.current = Some(step.clone());
                write_plan(repo, &plan)?;
                return Ok(RestackOutcome {
                    status: "conflict".into(),
                    message: out,
                    branch: plan.branch.clone(),
                    restacked,
                    skipped: plan.skipped.clone(),
                    current: Some(step),
                    pending: plan.pending.clone(),
                });
            }
            clear_plan(repo);
            return Err(map_error(out));
        }
        plan.done.push(step.branch.clone());
        restacked.push(step.branch.clone());
    }

    clear_plan(repo);
    if let Some(original) = plan.original_branch.clone() {
        if branch_exists(repo, &original) && head_branch(repo).as_deref() != Some(&original) {
            let _ = run(repo, &["checkout", &original]);
        }
    }
    let status = if restacked.is_empty() { "noop" } else { "completed" };
    Ok(RestackOutcome {
        status: status.into(),
        message: String::new(),
        branch: plan.branch,
        restacked,
        skipped: plan.skipped,
        current: None,
        pending: Vec::new(),
    })
}

async fn to_result(path: String, outcome: RestackOutcome) -> Result<StackRestackResult, String> {
    let state = crate::rebase::rebase_status(path).await?;
    Ok(StackRestackResult {
        status: outcome.status,
        message: outcome.message,
        branch: outcome.branch,
        restacked: outcome.restacked,
        skipped: outcome.skipped,
        current: outcome.current,
        pending: outcome.pending,
        state,
    })
}

#[tauri::command]
pub async fn stack_list(path: String) -> Result<StackList, String> {
    spawn_git(move || build_list(&PathBuf::from(path.trim()))).await
}

#[tauri::command]
pub async fn stack_create_branch(
    path: String,
    name: String,
    parent: String,
) -> Result<StackList, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let name = name.trim().to_string();
        let parent = parent.trim().to_string();
        absolute_git_dir(&repo)?;
        validate_name(&repo, &name)?;
        if parent.is_empty() {
            return Err("Parent branch must not be empty.".into());
        }
        if name == parent {
            return Err("A branch cannot build on itself.".into());
        }
        if branch_exists(&repo, &name) {
            return Err(format!("Branch already exists: {name}"));
        }
        if !branch_exists(&repo, &parent) {
            return Err(format!("Unknown parent branch: {parent}"));
        }
        let (success, out) = run(&repo, &["checkout", "-b", &name, &parent]);
        if !success {
            return Err(map_error(out));
        }
        if let Err(e) = set_parent(&repo, &name, &parent) {
            let _ = run(&repo, &["checkout", &parent]);
            let _ = run(&repo, &["branch", "-D", &name]);
            return Err(e);
        }
        build_list(&repo)
    })
    .await
}

#[tauri::command]
pub async fn stack_adopt(path: String, name: String, parent: String) -> Result<StackList, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let name = name.trim().to_string();
        let parent = parent.trim().to_string();
        absolute_git_dir(&repo)?;
        if name.is_empty() || parent.is_empty() {
            return Err("Branch and parent must not be empty.".into());
        }
        if name == parent {
            return Err("A branch cannot build on itself.".into());
        }
        if !branch_exists(&repo, &name) {
            return Err(format!("Unknown branch: {name}"));
        }
        if !branch_exists(&repo, &parent) {
            return Err(format!("Unknown parent branch: {parent}"));
        }
        let mut parents = parent_map(&repo);
        parents.remove(&name);
        ensure_no_cycle(&parents, &name, &parent)?;
        set_parent(&repo, &name, &parent)?;
        build_list(&repo)
    })
    .await
}

#[tauri::command]
pub async fn stack_remove(path: String, name: String) -> Result<StackList, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        let name = name.trim().to_string();
        absolute_git_dir(&repo)?;
        if name.is_empty() {
            return Err("Branch must not be empty.".into());
        }
        unset_parent(&repo, &name)?;
        build_list(&repo)
    })
    .await
}

#[tauri::command]
pub async fn stack_next_branch_name(path: String, base: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        absolute_git_dir(&repo)?;
        let mut stem = String::new();
        let mut last_dash = false;
        for ch in base.trim().chars() {
            let keep = ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '/' | '-');
            if keep {
                if ch == '-' {
                    if last_dash {
                        continue;
                    }
                    last_dash = true;
                } else {
                    last_dash = false;
                }
                stem.push(ch);
            } else if !last_dash {
                stem.push('-');
                last_dash = true;
            }
        }
        let mut stem = stem.trim_matches(|c| c == '-' || c == '/' || c == '.').to_string();
        if stem.is_empty() {
            stem = "branch".to_string();
        }
        if let Some(idx) = stem.rfind('-') {
            let tail = &stem[idx + 1..];
            if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
                let head = stem[..idx].to_string();
                if !head.is_empty() {
                    stem = head;
                }
            }
        }
        let known: HashSet<String> = local_branches(&repo).into_iter().collect();
        if !known.contains(&stem) {
            return Ok(stem);
        }
        for n in 2..1000 {
            let candidate = format!("{stem}-{n}");
            if !known.contains(&candidate) {
                return Ok(candidate);
            }
        }
        Err("No free branch name found.".into())
    })
    .await
}

#[tauri::command]
pub async fn stack_restack_state(path: String) -> Result<StackRestackState, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        absolute_git_dir(&repo)?;
        let plan = read_plan(&repo);
        Ok(StackRestackState {
            active: plan.is_some(),
            rebase_in_progress: rebase_in_progress(&repo),
            plan,
        })
    })
    .await
}

#[tauri::command]
pub async fn stack_restack(path: String, branch: String) -> Result<StackRestackResult, String> {
    let repo_path = path.clone();
    let outcome = spawn_git(move || {
        let repo = PathBuf::from(repo_path.trim());
        let branch = branch.trim().to_string();
        absolute_git_dir(&repo)?;
        if branch.is_empty() {
            return Err("Branch must not be empty.".into());
        }
        if rebase_in_progress(&repo) {
            return Err("A rebase is already in progress. Continue or abort it first.".into());
        }
        clear_plan(&repo);
        let plan = build_plan(&repo, &branch)?;
        run_plan(&repo, plan)
    })
    .await?;
    to_result(path, outcome).await
}

#[tauri::command]
pub async fn stack_restack_resume(path: String) -> Result<StackRestackResult, String> {
    let repo_path = path.clone();
    let outcome = spawn_git(move || {
        let repo = PathBuf::from(repo_path.trim());
        absolute_git_dir(&repo)?;
        let Some(mut plan) = read_plan(&repo) else {
            return Err("There is no restack in progress.".into());
        };
        if rebase_in_progress(&repo) {
            return Err(
                "The rebase is still in progress. Resolve the conflicts and continue first.".into(),
            );
        }
        if let Some(step) = plan.current.take() {
            let unfinished = branch_exists(&repo, &step.branch)
                && branch_exists(&repo, &step.parent)
                && !is_ancestor(&repo, &step.parent, &step.branch);
            if unfinished {
                plan.pending.insert(0, step);
            } else {
                plan.done.push(step.branch);
            }
        }
        run_plan(&repo, plan)
    })
    .await?;
    to_result(path, outcome).await
}

fn merged_branches(repo: &Path, base: &str) -> HashSet<String> {
    read(
        repo,
        &["branch", "--merged", base, "--format=%(refname:short)"],
    )
    .map(|out| {
        out.lines()
            .map(|l| l.trim().trim_start_matches("* ").trim().to_string())
            .filter(|l| !l.is_empty())
            .collect()
    })
    .unwrap_or_default()
}

fn merged_remote_branches(repo: &Path, base: &str) -> HashSet<String> {
    read(
        repo,
        &[
            "branch",
            "-r",
            "--merged",
            base,
            "--format=%(refname:short)",
        ],
    )
    .map(|out| {
        out.lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty() && !l.contains("->"))
            .collect()
    })
    .unwrap_or_default()
}

fn is_squash_merged(repo: &Path, base: &str, branch: &str) -> bool {
    let Some(out) = read(repo, &["cherry", base, branch]) else {
        return false;
    };
    let mut any = false;
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        any = true;
        if line.starts_with('+') {
            return false;
        }
    }
    any
}

fn collect_cleanup(repo: &Path, stale_days: u32) -> Result<BranchCleanupReport, String> {
    absolute_git_dir(repo)?;
    let base = default_branch(repo);
    let current = head_branch(repo);
    let merged = merged_branches(repo, &base);
    let merged_remotes = merged_remote_branches(repo, &base);
    let format = format!(
        "--format=%(refname:short){SEP}%(objectname){SEP}%(committerdate:iso-strict){SEP}%(committerdate:unix){SEP}%(upstream:short){SEP}%(contents:subject)"
    );
    let out = read(repo, &["for-each-ref", &format, "refs/heads"]).unwrap_or_default();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let mut candidates: Vec<CleanupCandidate> = Vec::new();
    for line in out.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(6, SEP).collect();
        if parts.len() < 5 {
            continue;
        }
        let name = parts[0].trim().to_string();
        if name.is_empty() || name == base || current.as_deref() == Some(name.as_str()) {
            continue;
        }
        let tip = parts[1].trim().to_string();
        let last_commit_at = parts[2].trim().to_string();
        let unix = parts[3].trim().parse::<i64>().unwrap_or(now);
        let upstream = {
            let raw = parts[4].trim();
            if raw.is_empty() {
                None
            } else {
                Some(raw.to_string())
            }
        };
        let subject = parts.get(5).map(|s| s.trim().to_string()).unwrap_or_default();
        let age_days = ((now - unix).max(0) / 86_400) as u32;
        let ahead = match upstream.as_deref() {
            Some(up) => read(repo, &["rev-list", "--count", &format!("{up}..{name}")])
                .and_then(|v| v.trim().parse::<u32>().ok())
                .unwrap_or(0),
            None => 0,
        };

        let kind = if merged.contains(&name) {
            "merged"
        } else if is_squash_merged(repo, &base, &name) {
            "squashMerged"
        } else if stale_days > 0 && age_days >= stale_days && ahead == 0 {
            "stale"
        } else {
            continue;
        };

        let remote_merged = match upstream.as_deref() {
            Some(up) => {
                merged_remotes.contains(up)
                    || (kind == "squashMerged" && is_squash_merged(repo, &base, up))
            }
            None => false,
        };

        candidates.push(CleanupCandidate {
            name,
            kind: kind.to_string(),
            last_commit_at,
            last_commit_age_days: age_days,
            ahead_of_upstream: ahead,
            has_upstream: upstream.is_some(),
            upstream,
            remote_merged,
            short_tip: short_hash(repo, &tip),
            tip,
            subject,
        });
    }

    candidates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(BranchCleanupReport {
        default_branch: base,
        stale_days,
        current_branch: current,
        candidates,
    })
}

#[tauri::command]
pub async fn branch_cleanup_candidates(
    path: String,
    stale_days: u32,
) -> Result<BranchCleanupReport, String> {
    spawn_git(move || collect_cleanup(&PathBuf::from(path.trim()), stale_days)).await
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
                "l8git-stack-test-{}-{}",
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

        fn path(&self) -> String {
            self.path.to_string_lossy().to_string()
        }

        fn git(&self, args: &[&str]) -> String {
            let (success, out) = run(&self.path, args);
            assert!(success, "git {args:?} failed: {out}");
            out
        }

        fn try_git(&self, args: &[&str]) -> (bool, String) {
            run(&self.path, args)
        }

        fn write(&self, file: &str, content: &str) {
            fs::write(self.path.join(file), content).unwrap();
        }

        fn commit(&self, file: &str, content: &str, message: &str) -> String {
            self.write(file, content);
            self.git(&["add", file]);
            self.git(&["commit", "-q", "-m", message]);
            self.git(&["rev-parse", "HEAD"])
        }

        fn commit_at(&self, file: &str, content: &str, message: &str, date: &str) {
            self.write(file, content);
            self.git(&["add", file]);
            let mut cmd = git_command();
            cmd.arg("-C").arg(&self.path);
            cmd.args(["commit", "-q", "-m", message]);
            cmd.env("GIT_AUTHOR_DATE", date);
            cmd.env("GIT_COMMITTER_DATE", date);
            cmd.env("GIT_EDITOR", NOOP_EDITOR);
            let status = cmd.status().unwrap();
            assert!(status.success(), "dated commit failed");
        }

        fn subjects(&self, branch: &str) -> Vec<String> {
            self.git(&["log", "--format=%s", branch])
                .lines()
                .map(|l| l.to_string())
                .collect()
        }
    }

    fn three_level_stack() -> TestRepo {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");
        repo.commit("c.txt", "base\n", "shared");
        repo.git(&["checkout", "-q", "-b", "feat-1"]);
        repo.commit("a.txt", "a\n", "feat-1 work");
        repo.git(&["checkout", "-q", "-b", "feat-2"]);
        repo.commit("b.txt", "b\n", "feat-2 work");
        repo.git(&["checkout", "-q", "-b", "feat-3"]);
        repo.commit("d.txt", "d\n", "feat-3 work");
        repo.git(&["config", "--local", "branch.feat-1.l8gitStackParent", "main"]);
        repo.git(&["config", "--local", "branch.feat-2.l8gitStackParent", "feat-1"]);
        repo.git(&["config", "--local", "branch.feat-3.l8gitStackParent", "feat-2"]);
        repo.git(&["checkout", "-q", "main"]);
        repo
    }

    fn stack_of<'a>(list: &'a StackList, root: &str) -> &'a Stack {
        list.stacks
            .iter()
            .find(|s| s.root == root)
            .unwrap_or_else(|| panic!("no stack with root {root}"))
    }

    #[tokio::test]
    async fn create_adopt_and_remove_maintain_the_chain() {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");
        repo.git(&["checkout", "-q", "-b", "loose"]);
        repo.commit("loose.txt", "l\n", "loose work");
        repo.git(&["checkout", "-q", "main"]);

        let list = stack_create_branch(repo.path(), "feat-1".into(), "main".into())
            .await
            .unwrap();
        let stack = stack_of(&list, "main");
        assert_eq!(stack.branches.len(), 1);
        assert_eq!(stack.branches[0].name, "feat-1");
        assert_eq!(stack.branches[0].level, 1);
        assert!(stack.branches[0].is_current);

        let list = stack_adopt(repo.path(), "loose".into(), "feat-1".into())
            .await
            .unwrap();
        let stack = stack_of(&list, "main");
        assert_eq!(stack.branches.len(), 2);
        assert_eq!(stack.branches[1].name, "loose");
        assert_eq!(stack.branches[1].level, 2);

        let cycle = stack_adopt(repo.path(), "feat-1".into(), "loose".into()).await;
        assert!(cycle.is_err(), "adopting a cycle must fail");

        let list = stack_remove(repo.path(), "loose".into()).await.unwrap();
        let stack = stack_of(&list, "main");
        assert_eq!(stack.branches.len(), 1);
        assert!(repo.try_git(&["show-ref", "--verify", "refs/heads/loose"]).0);
    }

    #[tokio::test]
    async fn list_reports_needs_restack_after_base_moves() {
        let repo = three_level_stack();

        let list = stack_list(repo.path()).await.unwrap();
        let stack = stack_of(&list, "main");
        assert_eq!(stack.branches.len(), 3);
        assert!(!stack.needs_restack);
        assert_eq!(stack.branches[0].ahead, 1);
        assert_eq!(stack.branches[0].behind, 0);
        assert_eq!(stack.branches[2].commits.len(), 1);
        assert_eq!(stack.branches[2].commits[0].subject, "feat-3 work");

        repo.git(&["checkout", "-q", "main"]);
        repo.commit("main.txt", "m\n", "main moves");

        let list = stack_list(repo.path()).await.unwrap();
        let stack = stack_of(&list, "main");
        assert!(stack.needs_restack);
        let feat1 = &stack.branches[0];
        assert!(feat1.needs_restack);
        assert_eq!(feat1.behind, 1);
        assert!(!stack.branches[1].needs_restack);
        assert!(!list.has_cycle);
        assert!(!list.has_broken);
    }

    #[tokio::test]
    async fn restack_rebuilds_every_level() {
        let repo = three_level_stack();
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("main.txt", "m\n", "main moves");

        let result = stack_restack(repo.path(), "feat-1".into()).await.unwrap();
        assert_eq!(result.status, "completed", "message: {}", result.message);
        assert_eq!(result.restacked, vec!["feat-1", "feat-2", "feat-3"]);
        assert!(!result.state.in_progress);

        let subjects = repo.subjects("feat-3");
        assert_eq!(
            subjects,
            vec![
                "feat-3 work".to_string(),
                "feat-2 work".to_string(),
                "feat-1 work".to_string(),
                "main moves".to_string(),
                "shared".to_string(),
                "root".to_string(),
            ]
        );
        assert!(is_ancestor(&repo.path, "main", "feat-1"));
        assert!(is_ancestor(&repo.path, "feat-1", "feat-2"));
        assert!(is_ancestor(&repo.path, "feat-2", "feat-3"));

        let list = stack_list(repo.path()).await.unwrap();
        assert!(!stack_of(&list, "main").needs_restack);
        assert_eq!(repo.git(&["rev-parse", "--abbrev-ref", "HEAD"]), "main");

        let again = stack_restack(repo.path(), "feat-1".into()).await.unwrap();
        assert_eq!(again.status, "noop");
        assert_eq!(again.skipped.len(), 3);
    }

    fn conflicting_stack() -> TestRepo {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");
        repo.commit("c.txt", "base\n", "shared");
        repo.git(&["checkout", "-q", "-b", "feat-1"]);
        repo.commit("a.txt", "a\n", "feat-1 work");
        repo.git(&["checkout", "-q", "-b", "feat-2"]);
        repo.commit("c.txt", "two\n", "feat-2 work");
        repo.git(&["checkout", "-q", "-b", "feat-3"]);
        repo.commit("d.txt", "d\n", "feat-3 work");
        repo.git(&["config", "--local", "branch.feat-1.l8gitStackParent", "main"]);
        repo.git(&["config", "--local", "branch.feat-2.l8gitStackParent", "feat-1"]);
        repo.git(&["config", "--local", "branch.feat-3.l8gitStackParent", "feat-2"]);
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("c.txt", "main-change\n", "main touches c");
        repo
    }

    #[tokio::test]
    async fn restack_stops_on_conflict_and_resumes_the_rest() {
        let repo = conflicting_stack();

        let result = stack_restack(repo.path(), "feat-1".into()).await.unwrap();
        assert_eq!(result.status, "conflict", "message: {}", result.message);
        assert_eq!(result.restacked, vec!["feat-1"]);
        assert_eq!(result.current.as_ref().unwrap().branch, "feat-2");
        assert_eq!(result.pending.len(), 1);
        assert_eq!(result.pending[0].branch, "feat-3");
        assert!(result.state.in_progress);
        assert!(result.state.conflicted_paths.contains(&"c.txt".to_string()));

        let state = stack_restack_state(repo.path()).await.unwrap();
        assert!(state.active);
        assert!(state.rebase_in_progress);
        assert_eq!(state.plan.as_ref().unwrap().pending.len(), 1);

        assert!(stack_restack_resume(repo.path()).await.is_err());

        repo.write("c.txt", "resolved\n");
        repo.git(&["add", "c.txt"]);
        crate::rebase::rebase_continue(repo.path()).await.unwrap();

        let resumed = stack_restack_resume(repo.path()).await.unwrap();
        assert_eq!(resumed.status, "completed", "message: {}", resumed.message);
        assert_eq!(resumed.restacked, vec!["feat-3"]);
        assert!(!resumed.state.in_progress);

        let subjects = repo.subjects("feat-3");
        assert_eq!(
            subjects,
            vec![
                "feat-3 work".to_string(),
                "feat-2 work".to_string(),
                "feat-1 work".to_string(),
                "main touches c".to_string(),
                "shared".to_string(),
                "root".to_string(),
            ]
        );
        assert!(is_ancestor(&repo.path, "feat-2", "feat-3"));
        let state = stack_restack_state(repo.path()).await.unwrap();
        assert!(!state.active);
    }

    #[tokio::test]
    async fn resume_after_abort_repeats_the_unfinished_level() {
        let repo = conflicting_stack();

        let result = stack_restack(repo.path(), "feat-1".into()).await.unwrap();
        assert_eq!(result.status, "conflict");

        crate::rebase::rebase_abort(repo.path()).await.unwrap();

        let resumed = stack_restack_resume(repo.path()).await.unwrap();
        assert_eq!(resumed.status, "conflict");
        assert_eq!(resumed.current.as_ref().unwrap().branch, "feat-2");
        assert_eq!(resumed.pending.len(), 1);

        repo.write("c.txt", "resolved\n");
        repo.git(&["add", "c.txt"]);
        crate::rebase::rebase_continue(repo.path()).await.unwrap();
        let done = stack_restack_resume(repo.path()).await.unwrap();
        assert_eq!(done.status, "completed");
        assert_eq!(done.restacked, vec!["feat-3"]);
    }

    #[tokio::test]
    async fn cycles_are_reported_as_errors() {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");
        repo.git(&["checkout", "-q", "-b", "a"]);
        repo.commit("a.txt", "a\n", "a work");
        repo.git(&["checkout", "-q", "-b", "b"]);
        repo.commit("b.txt", "b\n", "b work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["config", "--local", "branch.a.l8gitStackParent", "b"]);
        repo.git(&["config", "--local", "branch.b.l8gitStackParent", "a"]);

        let list = stack_list(repo.path()).await.unwrap();
        assert!(list.has_cycle);
        assert_eq!(list.cycles.len(), 1);
        assert_eq!(list.cycles[0], vec!["a".to_string(), "b".to_string()]);
        assert!(list.stacks.is_empty());
        assert!(list.errors.iter().any(|e| e.contains("cycle")));

        assert!(stack_restack(repo.path(), "a".into()).await.is_err());
    }

    #[tokio::test]
    async fn deleted_parent_marks_the_branch_as_broken() {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");
        repo.git(&["checkout", "-q", "-b", "feat-1"]);
        repo.commit("a.txt", "a\n", "feat-1 work");
        repo.git(&["checkout", "-q", "-b", "feat-2"]);
        repo.commit("b.txt", "b\n", "feat-2 work");
        repo.git(&["config", "--local", "branch.feat-1.l8gitStackParent", "main"]);
        repo.git(&["config", "--local", "branch.feat-2.l8gitStackParent", "feat-1"]);
        repo.git(&["branch", "-D", "feat-1"]);

        let list = stack_list(repo.path()).await.unwrap();
        assert!(list.has_broken);
        let stack = stack_of(&list, "feat-1");
        assert!(!stack.root_exists);
        assert!(stack.broken);
        assert_eq!(stack.branches.len(), 1);
        let entry = &stack.branches[0];
        assert_eq!(entry.name, "feat-2");
        assert!(entry.exists);
        assert!(!entry.parent_exists);
        assert!(entry.broken);
        assert!(list.errors.iter().any(|e| e.contains("feat-1")));

        assert!(stack_restack(repo.path(), "feat-2".into()).await.is_err());
    }

    #[tokio::test]
    async fn next_branch_name_appends_a_suffix() {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");
        assert_eq!(
            stack_next_branch_name(repo.path(), "feat".into())
                .await
                .unwrap(),
            "feat"
        );
        repo.git(&["branch", "feat"]);
        assert_eq!(
            stack_next_branch_name(repo.path(), "feat".into())
                .await
                .unwrap(),
            "feat-2"
        );
        repo.git(&["branch", "feat-2"]);
        assert_eq!(
            stack_next_branch_name(repo.path(), "feat-2".into())
                .await
                .unwrap(),
            "feat-3"
        );
        assert_eq!(
            stack_next_branch_name(repo.path(), "my feature!".into())
                .await
                .unwrap(),
            "my-feature"
        );
    }

    #[tokio::test]
    async fn cleanup_candidates_detect_merged_squashed_and_stale() {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");

        repo.git(&["checkout", "-q", "-b", "merged-branch"]);
        repo.commit("m.txt", "m\n", "merged work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["merge", "--no-ff", "-q", "-m", "merge branch", "merged-branch"]);

        repo.git(&["checkout", "-q", "-b", "squashed-branch"]);
        repo.commit("s.txt", "s\n", "squashed work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["merge", "--squash", "squashed-branch"]);
        repo.git(&["commit", "-q", "-m", "squash: apply squashed work"]);

        repo.git(&["checkout", "-q", "-b", "old-branch"]);
        repo.commit_at("o.txt", "o\n", "old work", "2020-01-01T00:00:00+0000");

        repo.git(&["checkout", "-q", "-b", "fresh-branch", "main"]);
        repo.commit("f.txt", "f\n", "fresh work");

        let report = branch_cleanup_candidates(repo.path(), 30).await.unwrap();
        assert_eq!(report.default_branch, "main");
        assert_eq!(report.current_branch.as_deref(), Some("fresh-branch"));

        let kinds: HashMap<String, String> = report
            .candidates
            .iter()
            .map(|c| (c.name.clone(), c.kind.clone()))
            .collect();
        assert_eq!(kinds.get("merged-branch").map(|s| s.as_str()), Some("merged"));
        assert_eq!(
            kinds.get("squashed-branch").map(|s| s.as_str()),
            Some("squashMerged")
        );
        assert_eq!(kinds.get("old-branch").map(|s| s.as_str()), Some("stale"));
        assert!(!kinds.contains_key("fresh-branch"), "current branch must be skipped");
        assert!(!kinds.contains_key("main"), "default branch must be skipped");

        let old = report
            .candidates
            .iter()
            .find(|c| c.name == "old-branch")
            .unwrap();
        assert!(old.last_commit_age_days > 365);
        assert_eq!(old.ahead_of_upstream, 0);
        assert!(!old.has_upstream);
        assert!(old.last_commit_at.starts_with("2020-01-01"));
        assert_eq!(old.subject, "old work");
    }

    #[tokio::test]
    async fn cleanup_candidates_report_whether_the_upstream_twin_is_merged() {
        let repo = TestRepo::new();
        repo.commit("base.txt", "base\n", "root");

        repo.git(&["checkout", "-q", "-b", "merged-branch"]);
        let merged_tip = repo.commit("m.txt", "m\n", "merged work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["merge", "--no-ff", "-q", "-m", "merge branch", "merged-branch"]);

        repo.git(&["checkout", "-q", "-b", "lonely-branch"]);
        repo.commit("l.txt", "l\n", "lonely work");
        repo.git(&["checkout", "-q", "main"]);
        repo.git(&["merge", "--no-ff", "-q", "-m", "merge lonely", "lonely-branch"]);

        repo.git(&["checkout", "-q", "-b", "old-branch", "main"]);
        repo.commit_at("o.txt", "o\n", "old work", "2020-01-01T00:00:00+0000");
        let old_tip = repo.git(&["rev-parse", "HEAD"]);
        repo.git(&["checkout", "-q", "main"]);

        repo.git(&["remote", "add", "origin", "."]);
        for (branch, tip) in [("merged-branch", &merged_tip), ("old-branch", &old_tip)] {
            repo.git(&[
                "update-ref",
                &format!("refs/remotes/origin/{branch}"),
                tip.trim(),
            ]);
            repo.git(&["config", &format!("branch.{branch}.remote"), "origin"]);
            repo.git(&[
                "config",
                &format!("branch.{branch}.merge"),
                &format!("refs/heads/{branch}"),
            ]);
        }

        let report = branch_cleanup_candidates(repo.path(), 30).await.unwrap();
        let by_name: HashMap<String, &CleanupCandidate> = report
            .candidates
            .iter()
            .map(|c| (c.name.clone(), c))
            .collect();

        let merged = by_name.get("merged-branch").unwrap();
        assert_eq!(merged.kind, "merged");
        assert_eq!(merged.upstream.as_deref(), Some("origin/merged-branch"));
        assert!(merged.remote_merged, "the upstream twin is merged into main");

        let old = by_name.get("old-branch").unwrap();
        assert_eq!(old.kind, "stale");
        assert!(
            !old.remote_merged,
            "a stale branch whose remote twin is unmerged must not be flagged"
        );

        let lonely = by_name.get("lonely-branch").unwrap();
        assert!(!lonely.has_upstream);
        assert!(!lonely.remote_merged, "without an upstream there is nothing to delete");
    }
}
