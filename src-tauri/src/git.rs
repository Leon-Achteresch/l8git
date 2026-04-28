use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;

use crate::cmd::git_command;

#[derive(Serialize)]
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

#[derive(Serialize)]
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
}

#[derive(Serialize)]
pub struct TagRef {
    name: String,
    commit: String,
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
    let output = git_command()
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git_merged_output_at(cwd: Option<&PathBuf>, args: &[&str]) -> Result<String, String> {
    let mut cmd = git_command();
    if let Some(dir) = cwd {
        cmd.arg("-C").arg(dir);
    }
    let output = cmd
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        let msg = match (stderr.is_empty(), stdout.is_empty()) {
            (false, false) => format!("{stderr}\n{stdout}"),
            (false, true) => stderr,
            (true, false) => stdout,
            (true, true) => "git: Befehl fehlgeschlagen".into(),
        };
        return Err(msg.trim().to_string());
    }

    let ok = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => String::new(),
    };
    Ok(ok.trim().to_string())
}

pub(crate) fn run_git_merged_output(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    run_git_merged_output_at(Some(repo), args)
}

fn tags_by_target(repo: &PathBuf) -> HashMap<String, Vec<String>> {
    const FMT: &str = "%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)\u{001f}%(refname:strip=2)";
    let Ok(out) = run_git(
        repo,
        &[
            "for-each-ref",
            "refs/tags",
            &format!("--format={FMT}"),
        ],
    ) else {
        return HashMap::new();
    };
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, '\x1f');
        let Some(oid) = parts.next() else {
            continue;
        };
        let Some(name) = parts.next() else {
            continue;
        };
        let oid = oid.trim();
        let name = name.trim();
        if oid.is_empty() || name.is_empty() {
            continue;
        }
        map.entry(oid.to_string())
            .or_default()
            .push(name.to_string());
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
) -> Result<Vec<Commit>, String> {
    let sep = "\x1f";
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b");
    let max_count = format!("--max-count={limit}");
    let mut args: Vec<String> = vec![
        "log".into(),
        "-z".into(),
        max_count,
        "--all".into(),
        "--date-order".into(),
        format!("--pretty=format:{format}"),
    ];
    if skip > 0 {
        args.insert(3, format!("--skip={skip}"));
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let log = run_git(repo, &arg_refs)?;

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
            let tags = tag_map.get(&hash).cloned().unwrap_or_default();
            Some(Commit {
                hash,
                short_hash,
                author,
                email,
                date,
                subject,
                body,
                parents,
                tags,
                author_avatar: None,
            })
        })
        .collect();

    Ok(commits)
}

fn is_commit_meta_token(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 41 {
        return false;
    }
    if b[40] != b'\x1f' {
        return false;
    }
    s[..40].chars().all(|c| c.is_ascii_hexdigit())
}

fn match_commit_record(
    needle: &str,
    author: &str,
    email: &str,
    subject: &str,
    body: &str,
    paths: &[String],
) -> Option<Vec<String>> {
    let mut matched_paths: Vec<String> = Vec::new();
    let mut matched = author.to_lowercase().contains(needle)
        || email.to_lowercase().contains(needle)
        || subject.to_lowercase().contains(needle)
        || body.to_lowercase().contains(needle);
    for p in paths {
        if p.to_lowercase().contains(needle) {
            matched = true;
            matched_paths.push(p.clone());
        }
    }
    if !matched {
        return None;
    }
    matched_paths.sort();
    matched_paths.dedup();
    const MAX_PATHS: usize = 12;
    if matched_paths.len() > MAX_PATHS {
        matched_paths.truncate(MAX_PATHS);
    }
    Some(matched_paths)
}

#[tauri::command]
pub fn repo_search_commits(
    path: String,
    query: String,
    skip: usize,
    limit: usize,
) -> Result<Vec<CommitSearchResult>, String> {
    let repo = PathBuf::from(&path);
    run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
        .map_err(|_| format!("'{path}' is not a git repository"))?;
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let tag_map = tags_by_target(&repo);
    let sep = "\x1f";
    let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b");
    let pretty = format!("--pretty=format:{format}");
    let out = run_git(
        &repo,
        &[
            "log",
            "-z",
            "--all",
            "--date-order",
            "--name-only",
            pretty.as_str(),
        ],
    )?;
    let tokens: Vec<&str> = out.split('\0').filter(|t| !t.is_empty()).collect();
    let capped = limit.min(500).max(1);
    let mut matched_seen = 0usize;
    let mut out_results: Vec<CommitSearchResult> = Vec::new();
    let mut i = 0usize;
    while i < tokens.len() {
        let meta = tokens[i];
        if !is_commit_meta_token(meta) {
            i += 1;
            continue;
        }
        let mut parts = meta.splitn(8, sep);
        let hash = parts.next().unwrap_or_default().to_string();
        let short_hash = parts.next().unwrap_or_default().to_string();
        let author = parts.next().unwrap_or_default().to_string();
        let email = parts.next().unwrap_or_default().to_string();
        let date = parts.next().unwrap_or_default().to_string();
        let parents_str = parts.next().unwrap_or_default();
        let subject = parts.next().unwrap_or_default().to_string();
        let body = parts.next().unwrap_or_default().to_string();
        i += 1;
        let mut paths: Vec<String> = Vec::new();
        while i < tokens.len() && !is_commit_meta_token(tokens[i]) {
            paths.push(tokens[i].to_string());
            i += 1;
        }
        let Some(matched_paths) = match_commit_record(
            needle.as_str(),
            author.as_str(),
            email.as_str(),
            subject.as_str(),
            body.as_str(),
            paths.as_slice(),
        ) else {
            continue;
        };
        if matched_seen < skip {
            matched_seen += 1;
            continue;
        }
        if out_results.len() >= capped {
            break;
        }
        let parents = parents_str
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        let tags = tag_map.get(&hash).cloned().unwrap_or_default();
        out_results.push(CommitSearchResult {
            commit: Commit {
                hash: hash.clone(),
                short_hash,
                author,
                email,
                date,
                subject,
                body,
                parents,
                tags,
                author_avatar: None,
            },
            matched_paths,
        });
        matched_seen += 1;
    }
    Ok(out_results)
}

#[tauri::command]
pub fn open_repo(path: String) -> Result<RepoInfo, String> {
    let repo = PathBuf::from(&path);

    run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
        .map_err(|_| format!("'{path}' is not a git repository"))?;

    let branch = run_git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "HEAD".into());

    let tag_map = tags_by_target(&repo);
    let commits = fetch_commits(&repo, 0, DEFAULT_INITIAL_COMMITS, &tag_map)?;
    let branches = list_branches(&repo).unwrap_or_default();
    let tags = tags_from_map(&tag_map);

    Ok(RepoInfo {
        path: repo.to_string_lossy().to_string(),
        branch,
        commits,
        branches,
        tags,
    })
}

fn tags_from_map(tag_map: &HashMap<String, Vec<String>>) -> Vec<TagRef> {
    let mut tags: Vec<TagRef> = tag_map
        .iter()
        .flat_map(|(commit, names)| {
            names.iter().map(move |name| TagRef {
                name: name.clone(),
                commit: commit.clone(),
            })
        })
        .collect();
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    tags
}

/// Load additional commits beyond what `open_repo` returned. Used by the
/// frontend virtualiser for infinite-scroll.
#[tauri::command]
pub fn repo_log_page(
    path: String,
    skip: usize,
    limit: usize,
) -> Result<Vec<Commit>, String> {
    let repo = PathBuf::from(&path);
    let tag_map = tags_by_target(&repo);
    let capped = limit.min(500).max(1);
    fetch_commits(&repo, skip, capped, &tag_map)
}

#[tauri::command]
pub fn git_fetch(
    path: String,
    prune_branches: Option<bool>,
    prune_tags: Option<bool>,
) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let prune_branches = prune_branches.unwrap_or(true);
    let prune_tags = prune_tags.unwrap_or(false);
    let mut args: Vec<&str> = vec!["fetch"];
    if prune_branches || prune_tags {
        args.push("--prune");
    }
    if prune_tags {
        args.push("--prune-tags");
    }
    run_git_merged_output(&repo, &args)
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    run_git_merged_output(&repo, &["pull"])
}

#[tauri::command]
pub fn git_push(
    path: String,
    set_upstream: bool,
    force_mode: Option<String>,
    tags_mode: Option<String>,
    atomic: Option<bool>,
    no_verify: Option<bool>,
    dry_run: Option<bool>,
) -> Result<String, String> {
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

    if set_upstream {
        let branch = run_git(&repo, &["symbolic-ref", "--short", "HEAD"])
            .map(|s| s.trim().to_string())?;
        args.push("-u".to_string());
        args.push("origin".to_string());
        args.push(branch);
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git_merged_output(&repo, &arg_refs)
}

#[tauri::command]
pub fn list_git_remotes(path: String) -> Result<Vec<GitRemote>, String> {
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
}

#[tauri::command]
pub fn set_git_remote_url(path: String, name: String, url: String) -> Result<String, String> {
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
}

#[tauri::command]
pub fn add_git_remote(path: String, name: String, url: String) -> Result<String, String> {
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
}

#[tauri::command]
pub fn branch_has_upstream(path: String) -> Result<bool, String> {
    let repo = PathBuf::from(path.trim());
    Ok(compute_has_upstream(&repo))
}

#[tauri::command]
pub fn repo_upstream_sync_counts(path: String) -> Result<UpstreamSyncCounts, String> {
    let repo = PathBuf::from(path.trim());
    Ok(compute_upstream_sync(&repo))
}

#[tauri::command]
pub fn git_clone(url: String, dest: String) -> Result<String, String> {
    let u = url.trim();
    let d = dest.trim();
    if u.is_empty() {
        return Err("Clone-URL darf nicht leer sein".into());
    }
    if d.is_empty() {
        return Err("Zielpfad darf nicht leer sein".into());
    }
    run_git_merged_output_at(None, &["clone", u, d])
}

#[tauri::command]
pub fn git_checkout(
    path: String,
    ref_name: String,
    create: bool,
    from_remote: Option<String>,
    base: Option<String>,
) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let name = ref_name.trim();
    if name.is_empty() {
        return Err("Branch- oder Ref-Name darf nicht leer sein".into());
    }
    if let Some(remote) = from_remote.filter(|s| !s.trim().is_empty()) {
        let r = remote.trim();
        run_git(
            &repo,
            &["checkout", "-b", name, "--track", r],
        )?;
        return Ok(());
    }
    if create {
        let mut args: Vec<String> = vec!["checkout".into(), "-b".into(), name.to_string()];
        if let Some(b) = base.filter(|s| !s.trim().is_empty()) {
            args.push(b.trim().to_string());
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &refs)?;
        return Ok(());
    }
    run_git(&repo, &["checkout", name])?;
    Ok(())
}

#[tauri::command]
pub fn git_create_branch(
    path: String,
    name: String,
    base: Option<String>,
    checkout: bool,
) -> Result<(), String> {
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
}

#[tauri::command]
pub fn git_merge(
    path: String,
    branch: String,
    strategy: Option<String>,
    message: Option<String>,
) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let b = branch.trim();
    if b.is_empty() {
        return Err("Branch-Name darf nicht leer sein".into());
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
pub fn git_revert_commit(
    path: String,
    commit: String,
    merge_mainline: Option<u8>,
) -> Result<String, String> {
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
}

#[derive(Serialize)]
pub struct CherryPickState {
    pub in_progress: bool,
    pub head: Option<String>,
    pub conflicted_paths: Vec<String>,
}

#[tauri::command]
pub fn git_cherry_pick(
    path: String,
    commits: Vec<String>,
    mainline: Option<u8>,
) -> Result<String, String> {
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
}

#[tauri::command]
pub fn git_cherry_pick_continue(path: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    run_git_merged_output(
        &repo,
        &["-c", "core.editor=true", "cherry-pick", "--continue"],
    )
}

#[tauri::command]
pub fn git_cherry_pick_skip(path: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    run_git_merged_output(&repo, &["cherry-pick", "--skip"])
}

#[tauri::command]
pub fn git_cherry_pick_abort(path: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    run_git_merged_output(&repo, &["cherry-pick", "--abort"])
}

#[tauri::command]
pub fn cherry_pick_state(path: String) -> Result<CherryPickState, String> {
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
}

#[tauri::command]
pub fn git_tag_commit(path: String, name: String, commit: String) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let tag = name.trim();
    if tag.is_empty() {
        return Err("Tag-Name darf nicht leer sein".into());
    }
    let c = commit.trim();
    if c.is_empty() {
        return Err("Commit-Hash darf nicht leer sein".into());
    }
    let parts = vec!["tag".to_string(), tag.to_string(), c.to_string()];
    let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
    run_git(&repo, &args)?;
    Ok(())
}

#[tauri::command]
pub fn git_discard_files(
    path: String,
    files: Vec<String>,
    untracked: Vec<bool>,
) -> Result<(), String> {
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
}

#[tauri::command]
pub fn delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    let repo = PathBuf::from(&path);
    let flag = if force { "-D" } else { "-d" };
    run_git(&repo, &["branch", flag, &name])?;
    Ok(())
}

#[tauri::command]
pub fn delete_remote_branch(path: String, remote_ref: String) -> Result<String, String> {
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
    let out = run_git_merged_output(&repo, &["push", remote, "--delete", branch])?;
    let _ = run_git_merged_output(&repo, &["fetch", remote, "--prune"]);
    Ok(out)
}

#[tauri::command]
pub fn delete_tag(path: String, name: String) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let tag = name.trim();
    if tag.is_empty() {
        return Err("Tag-Name darf nicht leer sein".into());
    }
    run_git(&repo, &["tag", "-d", tag])?;
    Ok(())
}

#[tauri::command]
pub fn delete_remote_tag(path: String, name: String, remote: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let tag = name.trim();
    let r = remote.trim();
    if tag.is_empty() {
        return Err("Tag-Name darf nicht leer sein".into());
    }
    if r.is_empty() {
        return Err("Remote darf nicht leer sein".into());
    }
    let out = run_git_merged_output(&repo, &["push", r, "--delete", &format!("refs/tags/{tag}")])?;
    let _ = run_git_merged_output(&repo, &["fetch", r, "--prune", "--prune-tags"]);
    Ok(out)
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
            iter.next().unwrap_or("").to_string()
        } else {
            path_part.to_string()
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

    if head.iter().any(|&b| b == 0) {
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

fn compute_status_entries(repo: &PathBuf) -> Result<Vec<StatusEntry>, String> {
    // Run the three git invocations in parallel on worker threads so their
    // wait-times overlap. On Windows and weak CPUs this is ~2-3x faster than
    // sequential spawning.
    let repo_a = repo.clone();
    let repo_b = repo.clone();
    let repo_c = repo.clone();
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
        let file_path = raw[3..].to_string();

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

        if untracked {
            let abs = repo.join(&file_path);
            if let Some((is_binary, lines)) = sniff_untracked(&abs) {
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
pub fn repo_status(path: String) -> Result<Vec<StatusEntry>, String> {
    let repo = PathBuf::from(&path);
    compute_status_entries(&repo)
}

/// Combined command: performs all status-adjacent lookups in a single IPC
/// round-trip, with the underlying git invocations fanned out on worker
/// threads. Replaces three separate invoke() calls from the frontend.
#[tauri::command]
pub fn repo_full_status(path: String) -> Result<FullStatus, String> {
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
}

#[tauri::command]
pub fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let repo = PathBuf::from(&path);
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(files.iter().map(|s| s.as_str()));
    run_git(&repo, &args)?;
    Ok(())
}

#[tauri::command]
pub fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
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
}

#[tauri::command]
pub fn commit_changes(path: String, message: String) -> Result<(), String> {
    let repo = PathBuf::from(&path);
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("Commit-Nachricht darf nicht leer sein".into());
    }
    run_git(&repo, &["commit", "-m", trimmed])?;
    Ok(())
}

#[derive(Serialize)]
pub struct FileDiffResponse {
    staged: Option<String>,
    unstaged: Option<String>,
    untracked_plain: Option<String>,
    is_binary: bool,
}

#[tauri::command]
pub fn repo_file_diff(path: String, file: String, untracked: bool) -> Result<FileDiffResponse, String> {
    let repo = PathBuf::from(&path);
    if untracked {
        let abs = repo.join(&file);
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
}

#[derive(Serialize)]
pub struct CommitChangedFile {
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
pub fn repo_commit_inspect(path: String, commit: String) -> Result<CommitInspectResponse, String> {
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
}

#[derive(Serialize)]
pub struct CommitFileDiffResponse {
    pub diff: Option<String>,
    pub is_binary: bool,
}

#[tauri::command]
pub fn repo_commit_file_diff(
    path: String,
    commit: String,
    file: String,
) -> Result<CommitFileDiffResponse, String> {
    let repo = PathBuf::from(path.trim());
    let c = commit.trim();
    let f = file.trim();
    if c.is_empty() || f.is_empty() {
        return Err("Commit oder Dateipfad fehlt".into());
    }
    let diff = run_git(
        &repo,
        &["show", "--no-color", "--format=", c, "--", f],
    )
    .unwrap_or_default();
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
}

#[derive(Serialize)]
pub struct StashEntry {
    pub index: u32,
    pub refname: String,
    pub branch: String,
    pub subject: String,
    pub date: String,
    pub hash: String,
    pub message: String,
}

fn stash_ref(index: u32) -> String {
    format!("stash@{{{}}}", index)
}

fn stash_index_from_ref(gd: &str) -> Option<u32> {
    let s = gd.trim();
    let open = s.find('{')?;
    let close = s.rfind('}')?;
    if close <= open + 1 {
        return None;
    }
    s[open + 1..close].parse().ok()
}

fn parse_stash_gs(gs: &str) -> (String, String, String) {
    let full = gs.trim();
    if let Some(rest) = full.strip_prefix("WIP on ") {
        if let Some((branch, tail)) = rest.split_once(": ") {
            return (
                branch.trim().to_string(),
                tail.trim().to_string(),
                full.to_string(),
            );
        }
    }
    if let Some(rest) = full.strip_prefix("On ") {
        if let Some((branch, tail)) = rest.split_once(": ") {
            return (
                branch.trim().to_string(),
                tail.trim().to_string(),
                full.to_string(),
            );
        }
    }
    (
        String::new(),
        full.to_string(),
        full.to_string(),
    )
}

fn stash_changed_files(repo: &PathBuf, index: u32) -> Result<Vec<CommitChangedFile>, String> {
    let sref = stash_ref(index);
    let parent = format!("{sref}^1");
    let numstat = run_git(
        repo,
        &[
            "diff-tree",
            "-r",
            "--no-commit-id",
            "--numstat",
            "-z",
            "-M",
            &parent,
            &sref,
        ],
    )?;
    let map = parse_numstat(&numstat);
    let mut files: Vec<CommitChangedFile> = map
        .into_iter()
        .map(|(path, (adds, dels, binary))| CommitChangedFile {
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
pub fn list_stashes(path: String) -> Result<Vec<StashEntry>, String> {
    let repo = PathBuf::from(path.trim());
    let sep = "\x1f";
    let fmt = format!("%gd{sep}%H{sep}%cI{sep}%gs");
    let out = run_git(
        &repo,
        &["stash", "list", &format!("--format={fmt}")],
    )
    .unwrap_or_default();
    let mut entries = Vec::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(4, sep);
        let gd = parts.next().unwrap_or("").trim();
        let hash = parts.next().unwrap_or("").trim();
        let date = parts.next().unwrap_or("").trim();
        let gs = parts.next().unwrap_or("").trim();
        if gd.is_empty() || hash.is_empty() {
            continue;
        }
        let Some(idx) = stash_index_from_ref(gd) else {
            continue;
        };
        let (branch, subject, message) = parse_stash_gs(gs);
        entries.push(StashEntry {
            index: idx,
            refname: gd.to_string(),
            branch,
            subject,
            date: date.to_string(),
            hash: hash.to_string(),
            message,
        });
    }
    Ok(entries)
}

#[tauri::command]
pub fn git_stash_push(
    path: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let mut args: Vec<String> = vec!["stash".into(), "push".into()];
    if include_untracked {
        args.push("-u".into());
    }
    if keep_index {
        args.push("--keep-index".into());
    }
    if let Some(m) = message {
        let t = m.trim();
        if !t.is_empty() {
            args.push("-m".into());
            args.push(t.to_string());
        }
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git_merged_output(&repo, &refs)
}

#[tauri::command]
pub fn git_stash_pop(path: String, index: u32) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    run_git_merged_output(&repo, &["stash", "pop", "--quiet", &sref])
}

#[tauri::command]
pub fn git_stash_apply(path: String, index: u32) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    run_git_merged_output(&repo, &["stash", "apply", "--quiet", &sref])
}

#[tauri::command]
pub fn git_stash_drop(path: String, index: u32) -> Result<(), String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    run_git(&repo, &["stash", "drop", "--quiet", &sref])?;
    Ok(())
}

#[derive(Serialize)]
pub struct StashInspectResponse {
    pub header: String,
    pub files: Vec<CommitChangedFile>,
}

#[tauri::command]
pub fn git_stash_show(path: String, index: u32) -> Result<StashInspectResponse, String> {
    let repo = PathBuf::from(path.trim());
    let sref = stash_ref(index);
    let header = run_git(
        &repo,
        &[
            "show",
            "--no-color",
            "--no-patch",
            "--stat=200",
            "--format=fuller",
            &sref,
        ],
    )?;
    let files = stash_changed_files(&repo, index)?;
    Ok(StashInspectResponse {
        header: header.trim().to_string(),
        files,
    })
}

#[tauri::command]
pub fn git_stash_file_diff(
    path: String,
    index: u32,
    file: String,
) -> Result<CommitFileDiffResponse, String> {
    let repo = PathBuf::from(path.trim());
    let f = file.trim();
    if f.is_empty() {
        return Err("Dateipfad fehlt".into());
    }
    let sref = stash_ref(index);
    let diff = run_git(
        &repo,
        &["stash", "show", "-p", "--no-color", &sref, "--", f],
    )
    .unwrap_or_default();
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
}

#[tauri::command]
pub fn git_stash_branch(path: String, index: u32, name: String) -> Result<String, String> {
    let repo = PathBuf::from(path.trim());
    let n = name.trim();
    if n.is_empty() {
        return Err("Branch-Name darf nicht leer sein".into());
    }
    let sref = stash_ref(index);
    run_git_merged_output(&repo, &["stash", "branch", n, &sref])
}

fn list_branches(repo: &PathBuf) -> Result<Vec<Branch>, String> {
    let sep = "\x1f";
    let format = format!("%(HEAD){sep}%(refname){sep}%(objectname)");
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
            let mut parts = line.splitn(3, sep);
            let head = parts.next()?;
            let refname = parts.next()?;
            let tip = parts.next()?.trim().to_string();
            if tip.is_empty() {
                return None;
            }
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
            })
        })
        .collect();

    Ok(branches)
}

#[derive(Serialize)]
pub struct LanguageStat {
    pub language: String,
    pub color: String,
    pub bytes: u64,
    pub percent: f64,
}

fn ext_to_language(ext: &str) -> Option<(&'static str, &'static str)> {
match ext {
        "1" => Some(("Roff", "#ecdebe")),
        "1in" => Some(("Roff", "#ecdebe")),
        "1m" => Some(("Roff", "#ecdebe")),
        "1x" => Some(("Roff", "#ecdebe")),
        "2" => Some(("Roff", "#ecdebe")),
        "2da" => Some(("2-Dimensional Array", "#38761D")),
        "3" => Some(("Roff", "#ecdebe")),
        "3in" => Some(("Roff", "#ecdebe")),
        "3m" => Some(("Roff", "#ecdebe")),
        "3p" => Some(("Roff", "#ecdebe")),
        "3pm" => Some(("Roff", "#ecdebe")),
        "3qt" => Some(("Roff", "#ecdebe")),
        "3x" => Some(("Roff", "#ecdebe")),
        "4" => Some(("Roff", "#ecdebe")),
        "4dform" => Some(("JSON", "#292929")),
        "4dm" => Some(("4D", "#004289")),
        "4dproject" => Some(("JSON", "#292929")),
        "4gl" => Some(("Genero 4gl", "#63408e")),
        "4th" => Some(("Forth", "#341708")),
        "5" => Some(("Roff", "#ecdebe")),
        "6" => Some(("Roff", "#ecdebe")),
        "6pl" => Some(("Raku", "#0000fb")),
        "6pm" => Some(("Raku", "#0000fb")),
        "7" => Some(("Roff", "#ecdebe")),
        "8" => Some(("Roff", "#ecdebe")),
        "8xp" => Some(("TI Program", "#A0AA87")),
        "9" => Some(("Roff", "#ecdebe")),
        "_coffee" => Some(("CoffeeScript", "#244776")),
        "_js" => Some(("JavaScript", "#f1e05a")),
        "_ls" => Some(("LiveScript", "#499886")),
        "a51" => Some(("Assembly", "#6E4C13")),
        "abap" => Some(("ABAP", "#E8274B")),
        "action" => Some(("ROS Interface", "#22314e")),
        "ada" => Some(("Ada", "#02f88c")),
        "adb" => Some(("Ada", "#02f88c")),
        "adml" => Some(("XML", "#0060ac")),
        "admx" => Some(("XML", "#0060ac")),
        "ado" => Some(("Stata", "#1a5f91")),
        "adp" => Some(("Tcl", "#e4cc98")),
        "ads" => Some(("Ada", "#02f88c")),
        "afm" => Some(("Adobe Font Metrics", "#fa0f00")),
        "agc" => Some(("Apollo Guidance Computer", "#0B3D91")),
        "agda" => Some(("Agda", "#315665")),
        "ahk" => Some(("AutoHotkey", "#6594b9")),
        "ahkl" => Some(("AutoHotkey", "#6594b9")),
        "aidl" => Some(("AIDL", "#34EB6B")),
        "aj" => Some(("AspectJ", "#a957b0")),
        "ak" => Some(("Aiken", "#640ff8")),
        "al" => Some(("AL", "#3AA2B5")),
        "alg" => Some(("ALGOL", "#D1E0DB")),
        "als" => Some(("Alloy", "#64C800")),
        "ampl" => Some(("AMPL", "#E6EFBB")),
        "angelscript" => Some(("AngelScript", "#C7D7DC")),
        "anim" => Some(("Unity3D Asset", "#222c37")),
        "ant" => Some(("XML", "#0060ac")),
        "apacheconf" => Some(("ApacheConf", "#d12127")),
        "apex" => Some(("Apex", "#1797c0")),
        "apib" => Some(("API Blueprint", "#2ACCA8")),
        "apl" => Some(("APL", "#5A8164")),
        "app" => Some(("Erlang", "#B83998")),
        "applescript" => Some(("AppleScript", "#101F1F")),
        "arc" => Some(("Arc", "#aa2afe")),
        "arr" => Some(("Pyret", "#ee1e10")),
        "as" => Some(("ActionScript", "#882B0F")),
        "asax" => Some(("ASP.NET", "#9400ff")),
        "asc" => Some(("AGS Script", "#B9D9FF")),
        "ascx" => Some(("ASP.NET", "#9400ff")),
        "asd" => Some(("Common Lisp", "#3fb68b")),
        "asddls" => Some(("ABAP CDS", "#555e25")),
        "ash" => Some(("AGS Script", "#B9D9FF")),
        "ashx" => Some(("ASP.NET", "#9400ff")),
        "asm" => Some(("Assembly", "#6E4C13")),
        "asmx" => Some(("ASP.NET", "#9400ff")),
        "asp" => Some(("Classic ASP", "#6a40fd")),
        "aspx" => Some(("ASP.NET", "#9400ff")),
        "asset" => Some(("Unity3D Asset", "#222c37")),
        "astro" => Some(("Astro", "#ff5a03")),
        "asy" => Some(("Asymptote", "#ff0000")),
        "au3" => Some(("AutoIt", "#1C3552")),
        "aug" => Some(("Augeas", "#9CC134")),
        "auk" => Some(("Awk", "#c30e9b")),
        "aux" => Some(("TeX", "#3D6117")),
        "avdl" => Some(("Avro IDL", "#0040FF")),
        "avsc" => Some(("JSON", "#292929")),
        "aw" => Some(("PHP", "#4F5D95")),
        "awk" => Some(("Awk", "#c30e9b")),
        "axaml" => Some(("XML", "#0060ac")),
        "axd" => Some(("ASP.NET", "#9400ff")),
        "axi" => Some(("NetLinx", "#0aa0ff")),
        "axml" => Some(("XML", "#0060ac")),
        "axs" => Some(("NetLinx", "#0aa0ff")),
        "b" => Some(("Brainfuck", "#2F2530")),
        "bal" => Some(("Ballerina", "#FF5000")),
        "bas" => Some(("BASIC", "#ff0000")),
        "bash" => Some(("Shell", "#89e051")),
        "bat" => Some(("Batchfile", "#C1F12E")),
        "bats" => Some(("Shell", "#89e051")),
        "bb" => Some(("BlitzBasic", "#00FFAE")),
        "bbappend" => Some(("BitBake", "#00bce4")),
        "bbclass" => Some(("BitBake", "#00bce4")),
        "bbx" => Some(("TeX", "#3D6117")),
        "bdy" => Some(("PLSQL", "#dad8d8")),
        "be" => Some(("Berry", "#15A13C")),
        "bf" => Some(("Beef", "#a52f4e")),
        "bi" => Some(("FreeBASIC", "#141AC9")),
        "bib" => Some(("BibTeX", "#778899")),
        "bibtex" => Some(("BibTeX", "#778899")),
        "bicep" => Some(("Bicep", "#519aba")),
        "bicepparam" => Some(("Bicep", "#519aba")),
        "bison" => Some(("Bison", "#6A463F")),
        "blade" => Some(("Blade", "#f7523f")),
        "bmx" => Some(("BlitzMax", "#cd6400")),
        "bones" => Some(("JavaScript", "#f1e05a")),
        "boo" => Some(("Boo", "#d4bec1")),
        "boot" => Some(("Clojure", "#db5855")),
        "bpl" => Some(("Boogie", "#c80fa0")),
        "bqn" => Some(("BQN", "#2b7067")),
        "brd" => Some(("KiCad Legacy Layout", "#2f4aab")),
        "brs" => Some(("Brightscript", "#662D91")),
        "bru" => Some(("Bru", "#F4AA41")),
        "bs" => Some(("Bluespec BH", "#12223c")),
        "bsl" => Some(("1C Enterprise", "#814CCC")),
        "bst" => Some(("BuildStream", "#006bff")),
        "bsv" => Some(("Bluespec", "#12223c")),
        "builder" => Some(("Ruby", "#701516")),
        "builds" => Some(("XML", "#0060ac")),
        "bzl" => Some(("Starlark", "#76d275")),
        "c" => Some(("C", "#555555")),
        "c++" => Some(("C++", "#f34b7d")),
        "c3" => Some(("C3", "#2563eb")),
        "cabal" => Some(("Cabal Config", "#483465")),
        "caddyfile" => Some(("Caddyfile", "#22b638")),
        "cairo" => Some(("Cairo", "#ff4a48")),
        "cake" => Some(("C#", "#178600")),
        "capnp" => Some(("Cap'n Proto", "#c42727")),
        "carbon" => Some(("Carbon", "#222222")),
        "cats" => Some(("C", "#555555")),
        "cbx" => Some(("TeX", "#3D6117")),
        "cc" => Some(("C++", "#f34b7d")),
        "ccproj" => Some(("XML", "#0060ac")),
        "ccxml" => Some(("XML", "#0060ac")),
        "cdc" => Some(("Cadence", "#00ef8b")),
        "cdf" => Some(("Wolfram Language", "#dd1100")),
        "cds" => Some(("CAP CDS", "#0092d1")),
        "ceylon" => Some(("Ceylon", "#dfa535")),
        "cfc" => Some(("ColdFusion CFC", "#ed2cd6")),
        "cfg" => Some(("HAProxy", "#106da9")),
        "cfm" => Some(("ColdFusion", "#ed2cd6")),
        "cfml" => Some(("ColdFusion", "#ed2cd6")),
        "cgi" => Some(("Perl", "#0298c3")),
        "cginc" => Some(("HLSL", "#aace60")),
        "ch" => Some(("xBase", "#403a40")),
        "chpl" => Some(("Chapel", "#8dc63f")),
        "circom" => Some(("Circom", "#707575")),
        "cirru" => Some(("Cirru", "#ccccff")),
        "cj" => Some(("Cangjie", "#00868B")),
        "cjs" => Some(("JavaScript", "#f1e05a")),
        "cjsx" => Some(("CoffeeScript", "#244776")),
        "ck" => Some(("ChucK", "#3f8000")),
        "cl" => Some(("Common Lisp", "#3fb68b")),
        "cl2" => Some(("Clojure", "#db5855")),
        "clar" => Some(("Clarity", "#5546ff")),
        "click" => Some(("Click", "#E4E6F3")),
        "clixml" => Some(("XML", "#0060ac")),
        "clj" => Some(("Clojure", "#db5855")),
        "cljc" => Some(("Clojure", "#db5855")),
        "cljs" => Some(("Clojure", "#db5855")),
        "cljscm" => Some(("Clojure", "#db5855")),
        "cljx" => Some(("Clojure", "#db5855")),
        "clp" => Some(("CLIPS", "#00A300")),
        "cls" => Some(("TeX", "#3D6117")),
        "clue" => Some(("Clue", "#0009b5")),
        "clw" => Some(("Clarion", "#db901e")),
        "cmake" => Some(("CMake", "#DA3434")),
        "cmd" => Some(("Batchfile", "#C1F12E")),
        "cmp" => Some(("Gerber Image", "#d20b00")),
        "cnc" => Some(("G-code", "#D08CF2")),
        "cnf" => Some(("INI", "#d1dbe0")),
        "cocci" => Some(("SmPL", "#c94949")),
        "code-snippets" => Some(("JSON with Comments", "#292929")),
        "code-workspace" => Some(("JSON with Comments", "#292929")),
        "coffee" => Some(("CoffeeScript", "#244776")),
        "command" => Some(("Shell", "#89e051")),
        "containerfile" => Some(("Dockerfile", "#384d54")),
        "cook" => Some(("Cooklang", "#E15A29")),
        "coq" => Some(("Rocq Prover", "#d0b68c")),
        "cp" => Some(("C++", "#f34b7d")),
        "cpp" => Some(("C++", "#f34b7d")),
        "cppm" => Some(("C++", "#f34b7d")),
        "cproject" => Some(("XML", "#0060ac")),
        "cps" => Some(("Component Pascal", "#B0CE4E")),
        "cql" => Some(("CQL", "#006091")),
        "cr" => Some(("Crystal", "#000100")),
        "cs" => Some(("C#", "#178600")),
        "csc" => Some(("GSC", "#FF6800")),
        "cscfg" => Some(("XML", "#0060ac")),
        "csd" => Some(("Csound Document", "#1a1a1a")),
        "csdef" => Some(("XML", "#0060ac")),
        "cshtml" => Some(("HTML+Razor", "#512be4")),
        "csl" => Some(("XML", "#0060ac")),
        "cson" => Some(("CSON", "#244776")),
        "csproj" => Some(("XML", "#0060ac")),
        "css" => Some(("CSS", "#663399")),
        "csv" => Some(("CSV", "#237346")),
        "csx" => Some(("C#", "#178600")),
        "ct" => Some(("XML", "#0060ac")),
        "ctl" => Some(("Visual Basic 6.0", "#2c6353")),
        "ctp" => Some(("PHP", "#4F5D95")),
        "cts" => Some(("TypeScript", "#3178c6")),
        "cu" => Some(("Cuda", "#3A4E3A")),
        "cue" => Some(("CUE", "#5886E1")),
        "cuh" => Some(("Cuda", "#3A4E3A")),
        "curry" => Some(("Curry", "#531242")),
        "cwl" => Some(("Common Workflow Language", "#B5314C")),
        "cxx" => Some(("C++", "#f34b7d")),
        "cylc" => Some(("Cylc", "#00b3fd")),
        "cyp" => Some(("Cypher", "#34c0eb")),
        "cypher" => Some(("Cypher", "#34c0eb")),
        "d" => Some(("D", "#ba595e")),
        "d2" => Some(("D2", "#526ee8")),
        "dae" => Some(("COLLADA", "#F1A42B")),
        "darcspatch" => Some(("Darcs Patch", "#8eff23")),
        "dart" => Some(("Dart", "#00B4AB")),
        "das" => Some(("Daslang", "#d3d3d3")),
        "dats" => Some(("ATS", "#1ac620")),
        "db2" => Some(("SQLPL", "#e38c00")),
        "dcl" => Some(("Clean", "#3F85AF")),
        "ddl" => Some(("PLSQL", "#dad8d8")),
        "decls" => Some(("BlitzBasic", "#00FFAE")),
        "depproj" => Some(("XML", "#0060ac")),
        "dfm" => Some(("Pascal", "#E3F171")),
        "dfy" => Some(("Dafny", "#FFEC25")),
        "dhall" => Some(("Dhall", "#dfafff")),
        "di" => Some(("D", "#ba595e")),
        "dita" => Some(("XML", "#0060ac")),
        "ditamap" => Some(("XML", "#0060ac")),
        "ditaval" => Some(("XML", "#0060ac")),
        "djs" => Some(("Dogescript", "#cca760")),
        "dlm" => Some(("IDL", "#a3522f")),
        "dm" => Some(("DM", "#447265")),
        "do" => Some(("Stata", "#1a5f91")),
        "dockerfile" => Some(("Dockerfile", "#384d54")),
        "dof" => Some(("INI", "#d1dbe0")),
        "doh" => Some(("Stata", "#1a5f91")),
        "dot" => Some(("Graphviz (DOT)", "#2596be")),
        "dotsettings" => Some(("XML", "#0060ac")),
        "dpatch" => Some(("Darcs Patch", "#8eff23")),
        "dpr" => Some(("Pascal", "#E3F171")),
        "druby" => Some(("Mirah", "#c7a938")),
        "dsc" => Some(("DenizenScript", "#FBEE96")),
        "dsp" => Some(("Faust", "#c37240")),
        "dsr" => Some(("Visual Basic 6.0", "#2c6353")),
        "dtx" => Some(("TeX", "#3D6117")),
        "duby" => Some(("Mirah", "#c7a938")),
        "dwl" => Some(("DataWeave", "#003a52")),
        "dyalog" => Some(("APL", "#5A8164")),
        "dyl" => Some(("Dylan", "#6c616e")),
        "dylan" => Some(("Dylan", "#6c616e")),
        "e" => Some(("Eiffel", "#4d6977")),
        "eb" => Some(("Easybuild", "#069406")),
        "ebuild" => Some(("Gentoo Ebuild", "#9400ff")),
        "ec" => Some(("eC", "#913960")),
        "ecl" => Some(("ECL", "#8a1267")),
        "eclass" => Some(("Gentoo Eclass", "#9400ff")),
        "eclxml" => Some(("ECL", "#8a1267")),
        "ecr" => Some(("HTML+ECR", "#2e1052")),
        "ect" => Some(("EJS", "#a91e50")),
        "edge" => Some(("Edge", "#0dffe0")),
        "edgeql" => Some(("EdgeQL", "#31A7FF")),
        "editorconfig" => Some(("EditorConfig", "#fff1f2")),
        "eh" => Some(("eC", "#913960")),
        "ejs" => Some(("EJS", "#a91e50")),
        "el" => Some(("Emacs Lisp", "#c065db")),
        "eliom" => Some(("OCaml", "#ef7a08")),
        "eliomi" => Some(("OCaml", "#ef7a08")),
        "elm" => Some(("Elm", "#60B5CC")),
        "elv" => Some(("Elvish", "#55BB55")),
        "em" => Some(("EmberScript", "#FFF4F3")),
        "emacs" => Some(("Emacs Lisp", "#c065db")),
        "emberscript" => Some(("EmberScript", "#FFF4F3")),
        "env" => Some(("Dotenv", "#e5d559")),
        "epj" => Some(("Ecere Projects", "#913960")),
        "eps" => Some(("PostScript", "#da291c")),
        "epsi" => Some(("PostScript", "#da291c")),
        "eq" => Some(("EQ", "#a78649")),
        "erb" => Some(("HTML+ERB", "#701516")),
        "erl" => Some(("Erlang", "#B83998")),
        "es" => Some(("Erlang", "#B83998")),
        "es6" => Some(("JavaScript", "#f1e05a")),
        "escript" => Some(("Erlang", "#B83998")),
        "esdl" => Some(("EdgeQL", "#31A7FF")),
        "ex" => Some(("Elixir", "#6e4a7e")),
        "exs" => Some(("Elixir", "#6e4a7e")),
        "eye" => Some(("Ruby", "#701516")),
        "f" => Some(("Fortran", "#4d41b1")),
        "f03" => Some(("Fortran Free Form", "#4d41b1")),
        "f08" => Some(("Fortran Free Form", "#4d41b1")),
        "f77" => Some(("Fortran", "#4d41b1")),
        "f90" => Some(("Fortran Free Form", "#4d41b1")),
        "f95" => Some(("Fortran Free Form", "#4d41b1")),
        "factor" => Some(("Factor", "#636746")),
        "fan" => Some(("Fantom", "#14253c")),
        "fancypack" => Some(("Fancy", "#7b9db4")),
        "fbs" => Some(("FlatBuffers", "#ed284a")),
        "fcgi" => Some(("Lua", "#000080")),
        "feature" => Some(("Gherkin", "#5B2063")),
        "filters" => Some(("XML", "#0060ac")),
        "fir" => Some(("FIRRTL", "#2f632f")),
        "fish" => Some(("fish", "#4aae47")),
        "flex" => Some(("JFlex", "#DBCA00")),
        "flf" => Some(("FIGlet Font", "#FFDDBB")),
        "flix" => Some(("Flix", "#d44a45")),
        "flux" => Some(("FLUX", "#88ccff")),
        "fnc" => Some(("PLSQL", "#dad8d8")),
        "fnl" => Some(("Fennel", "#fff3d7")),
        "for" => Some(("Forth", "#341708")),
        "forth" => Some(("Forth", "#341708")),
        "fp" => Some(("GLSL", "#5686a5")),
        "fpp" => Some(("Fortran", "#4d41b1")),
        "fr" => Some(("Forth", "#341708")),
        "frag" => Some(("GLSL", "#5686a5")),
        "frg" => Some(("GLSL", "#5686a5")),
        "frm" => Some(("VBA", "#867db1")),
        "frt" => Some(("Forth", "#341708")),
        "fs" => Some(("F#", "#b845fc")),
        "fsh" => Some(("GLSL", "#5686a5")),
        "fshader" => Some(("GLSL", "#5686a5")),
        "fsi" => Some(("F#", "#b845fc")),
        "fsproj" => Some(("XML", "#0060ac")),
        "fst" => Some(("F*", "#572e30")),
        "fsti" => Some(("F*", "#572e30")),
        "fsx" => Some(("F#", "#b845fc")),
        "fth" => Some(("Forth", "#341708")),
        "ftl" => Some(("Fluent", "#ffcc33")),
        "ftlh" => Some(("FreeMarker", "#0050b2")),
        "fun" => Some(("Standard ML", "#dc566d")),
        "fut" => Some(("Futhark", "#5f021f")),
        "fx" => Some(("FLUX", "#88ccff")),
        "fxh" => Some(("HLSL", "#aace60")),
        "fxml" => Some(("XML", "#0060ac")),
        "fy" => Some(("Fancy", "#7b9db4")),
        "g" => Some(("G-code", "#D08CF2")),
        "g4" => Some(("ANTLR", "#9DC3FF")),
        "gaml" => Some(("GAML", "#FFC766")),
        "gap" => Some(("GAP", "#0000cc")),
        "gawk" => Some(("Awk", "#c30e9b")),
        "gbl" => Some(("Gerber Image", "#d20b00")),
        "gbo" => Some(("Gerber Image", "#d20b00")),
        "gbp" => Some(("Gerber Image", "#d20b00")),
        "gbr" => Some(("Gerber Image", "#d20b00")),
        "gbs" => Some(("Gerber Image", "#d20b00")),
        "gco" => Some(("G-code", "#D08CF2")),
        "gcode" => Some(("G-code", "#D08CF2")),
        "gd" => Some(("GAP", "#0000cc")),
        "gdnlib" => Some(("Godot Resource", "#355570")),
        "gdns" => Some(("Godot Resource", "#355570")),
        "gdshader" => Some(("GDShader", "#478CBF")),
        "gdshaderinc" => Some(("GDShader", "#478CBF")),
        "ged" => Some(("GEDCOM", "#003058")),
        "gemspec" => Some(("Ruby", "#701516")),
        "geo" => Some(("GLSL", "#5686a5")),
        "geojson" => Some(("JSON", "#292929")),
        "geom" => Some(("GLSL", "#5686a5")),
        "gf" => Some(("Grammatical Framework", "#ff0000")),
        "gi" => Some(("GAP", "#0000cc")),
        "gitconfig" => Some(("Git Config", "#F44D27")),
        "gitignore" => Some(("Ignore List", "#000000")),
        "gjs" => Some(("Glimmer JS", "#F5835F")),
        "gko" => Some(("Gerber Image", "#d20b00")),
        "glade" => Some(("XML", "#0060ac")),
        "gleam" => Some(("Gleam", "#ffaff3")),
        "glf" => Some(("Glyph", "#c1ac7f")),
        "glsl" => Some(("GLSL", "#5686a5")),
        "glslf" => Some(("GLSL", "#5686a5")),
        "glslv" => Some(("GLSL", "#5686a5")),
        "gltf" => Some(("JSON", "#292929")),
        "gml" => Some(("Game Maker Language", "#71b417")),
        "gms" => Some(("GAMS", "#f49a22")),
        "gmx" => Some(("XML", "#0060ac")),
        "gnu" => Some(("Gnuplot", "#f0a9f0")),
        "gnuplot" => Some(("Gnuplot", "#f0a9f0")),
        "go" => Some(("Go", "#00ADD8")),
        "god" => Some(("Ruby", "#701516")),
        "gohtml" => Some(("Go Template", "#00ADD8")),
        "golo" => Some(("Golo", "#88562A")),
        "gotmpl" => Some(("Go Template", "#00ADD8")),
        "gp" => Some(("Gnuplot", "#f0a9f0")),
        "gpb" => Some(("Gerber Image", "#d20b00")),
        "gpt" => Some(("Gerber Image", "#d20b00")),
        "gpx" => Some(("XML", "#0060ac")),
        "gql" => Some(("GraphQL", "#e10098")),
        "grace" => Some(("Grace", "#615f8b")),
        "gradle" => Some(("Gradle", "#02303a")),
        "graphql" => Some(("GraphQL", "#e10098")),
        "graphqls" => Some(("GraphQL", "#e10098")),
        "groovy" => Some(("Groovy", "#4298b8")),
        "grt" => Some(("Groovy", "#4298b8")),
        "grxml" => Some(("XML", "#0060ac")),
        "gs" => Some(("GDScript", "#355570")),
        "gsc" => Some(("GSC", "#FF6800")),
        "gsh" => Some(("GSC", "#FF6800")),
        "gshader" => Some(("GLSL", "#5686a5")),
        "gsp" => Some(("Groovy Server Pages", "#4298b8")),
        "gst" => Some(("Gosu", "#82937f")),
        "gsx" => Some(("Gosu", "#82937f")),
        "gtl" => Some(("Gerber Image", "#d20b00")),
        "gto" => Some(("Gerber Image", "#d20b00")),
        "gtp" => Some(("Gerber Image", "#d20b00")),
        "gtpl" => Some(("Groovy", "#4298b8")),
        "gts" => Some(("Glimmer TS", "#3178c6")),
        "gv" => Some(("Graphviz (DOT)", "#2596be")),
        "gvy" => Some(("Groovy", "#4298b8")),
        "gyp" => Some(("Python", "#3572A5")),
        "gypi" => Some(("Python", "#3572A5")),
        "h" => Some(("C", "#555555")),
        "h++" => Some(("C++", "#f34b7d")),
        "ha" => Some(("Hare", "#9d7424")),
        "hack" => Some(("Hack", "#878787")),
        "haml" => Some(("Haml", "#ece2a9")),
        "handlebars" => Some(("Handlebars", "#f7931e")),
        "har" => Some(("JSON", "#292929")),
        "hats" => Some(("ATS", "#1ac620")),
        "hb" => Some(("Harbour", "#0e60e3")),
        "hbs" => Some(("Handlebars", "#f7931e")),
        "hc" => Some(("HolyC", "#ffefaf")),
        "hcl" => Some(("HCL", "#844FBA")),
        "heex" => Some(("HTML+EEX", "#6e4a7e")),
        "hh" => Some(("C++", "#f34b7d")),
        "hhi" => Some(("Hack", "#878787")),
        "hic" => Some(("Clojure", "#db5855")),
        "hip" => Some(("HIP", "#4F3A4F")),
        "hlsl" => Some(("HLSL", "#aace60")),
        "hlsli" => Some(("HLSL", "#aace60")),
        "hocon" => Some(("HOCON", "#9ff8ee")),
        "hoon" => Some(("hoon", "#00b171")),
        "hpp" => Some(("C++", "#f34b7d")),
        "hqf" => Some(("SQF", "#3F3F3F")),
        "hql" => Some(("HiveQL", "#dce200")),
        "hrl" => Some(("Erlang", "#B83998")),
        "hs" => Some(("Haskell", "#5e5086")),
        "hs-boot" => Some(("Haskell", "#5e5086")),
        "hsc" => Some(("Haskell", "#5e5086")),
        "hta" => Some(("HTML", "#e34c26")),
        "htm" => Some(("HTML", "#e34c26")),
        "html" => Some(("HTML", "#e34c26")),
        "http" => Some(("HTTP", "#005C9C")),
        "hurl" => Some(("Hurl", "#FF0288")),
        "hx" => Some(("Haxe", "#df7900")),
        "hxml" => Some(("HXML", "#f68712")),
        "hxsl" => Some(("Haxe", "#df7900")),
        "hxx" => Some(("C++", "#f34b7d")),
        "hy" => Some(("Hy", "#7790B2")),
        "hzp" => Some(("XML", "#0060ac")),
        "i" => Some(("Assembly", "#6E4C13")),
        "i3" => Some(("Modula-3", "#223388")),
        "ical" => Some(("iCalendar", "#ec564c")),
        "ice" => Some(("Slice", "#003fa2")),
        "iced" => Some(("CoffeeScript", "#244776")),
        "icl" => Some(("Clean", "#3F85AF")),
        "icls" => Some(("XML", "#0060ac")),
        "ics" => Some(("iCalendar", "#ec564c")),
        "idc" => Some(("C", "#555555")),
        "idr" => Some(("Idris", "#b30000")),
        "ig" => Some(("Modula-3", "#223388")),
        "ihlp" => Some(("Stata", "#1a5f91")),
        "ijm" => Some(("ImageJ Macro", "#99AAFF")),
        "ijs" => Some(("J", "#9EEDFF")),
        "ik" => Some(("Ioke", "#078193")),
        "ily" => Some(("LilyPond", "#9ccc7c")),
        "imba" => Some(("Imba", "#16cec6")),
        "iml" => Some(("XML", "#0060ac")),
        "inc" => Some(("PHP", "#4F5D95")),
        "ini" => Some(("INI", "#d1dbe0")),
        "inl" => Some(("C++", "#f34b7d")),
        "ino" => Some(("C++", "#f34b7d")),
        "ins" => Some(("TeX", "#3D6117")),
        "intr" => Some(("Dylan", "#6c616e")),
        "io" => Some(("Io", "#a9188d")),
        "iol" => Some(("Jolie", "#843179")),
        "ipf" => Some(("IGOR Pro", "#0000cc")),
        "ipp" => Some(("C++", "#f34b7d")),
        "ipynb" => Some(("Jupyter Notebook", "#DA5B0B")),
        "isl" => Some(("Inno Setup", "#264b99")),
        "ispc" => Some(("ISPC", "#2D68B1")),
        "iss" => Some(("Inno Setup", "#264b99")),
        "iuml" => Some(("PlantUML", "#fbbd16")),
        "ivy" => Some(("XML", "#0060ac")),
        "ixx" => Some(("C++", "#f34b7d")),
        "j" => Some(("Jasmin", "#d03600")),
        "j2" => Some(("Jinja", "#a52a22")),
        "jac" => Some(("Jac", "#FC792D")),
        "jade" => Some(("Pug", "#a86454")),
        "jai" => Some(("Jai", "#ab8b4b")),
        "jake" => Some(("JavaScript", "#f1e05a")),
        "janet" => Some(("Janet", "#0886a5")),
        "jav" => Some(("Java", "#b07219")),
        "java" => Some(("Java", "#b07219")),
        "javascript" => Some(("JavaScript", "#f1e05a")),
        "jbuilder" => Some(("Ruby", "#701516")),
        "jcl" => Some(("JCL", "#d90e09")),
        "jelly" => Some(("XML", "#0060ac")),
        "jflex" => Some(("JFlex", "#DBCA00")),
        "jinja" => Some(("Jinja", "#a52a22")),
        "jinja2" => Some(("Jinja", "#a52a22")),
        "jison" => Some(("Jison", "#56b3cb")),
        "jisonlex" => Some(("Jison Lex", "#56b3cb")),
        "jl" => Some(("Julia", "#a270ba")),
        "jq" => Some(("JSONiq", "#40d47e")),
        "js" => Some(("JavaScript", "#f1e05a")),
        "jsb" => Some(("JavaScript", "#f1e05a")),
        "jscad" => Some(("JavaScript", "#f1e05a")),
        "jsfl" => Some(("JavaScript", "#f1e05a")),
        "jsh" => Some(("Java", "#b07219")),
        "jslib" => Some(("JavaScript", "#f1e05a")),
        "jsm" => Some(("JavaScript", "#f1e05a")),
        "json" => Some(("JSON", "#292929")),
        "json-tmlanguage" => Some(("JSON", "#292929")),
        "json5" => Some(("JSON5", "#267CB9")),
        "jsonc" => Some(("JSON with Comments", "#292929")),
        "jsonl" => Some(("JSON", "#292929")),
        "jsonld" => Some(("JSONLD", "#0c479c")),
        "jsonnet" => Some(("Jsonnet", "#0064bd")),
        "jsp" => Some(("Java Server Pages", "#2A6277")),
        "jspre" => Some(("JavaScript", "#f1e05a")),
        "jsproj" => Some(("XML", "#0060ac")),
        "jss" => Some(("JavaScript", "#f1e05a")),
        "jst" => Some(("EJS", "#a91e50")),
        "jsx" => Some(("JavaScript", "#f1e05a")),
        "jte" => Some(("Java Template Engine", "#2A6277")),
        "just" => Some(("Just", "#384d54")),
        "k" => Some(("KCL", "#7ABABF")),
        "kak" => Some(("KakouneScript", "#6f8042")),
        "kdl" => Some(("KDL", "#ffb3b3")),
        "kicad_mod" => Some(("KiCad Layout", "#2f4aab")),
        "kicad_pcb" => Some(("KiCad Layout", "#2f4aab")),
        "kicad_sch" => Some(("KiCad Schematic", "#2f4aab")),
        "kicad_sym" => Some(("KiCad Schematic", "#2f4aab")),
        "kicad_wks" => Some(("KiCad Layout", "#2f4aab")),
        "kid" => Some(("Genshi", "#951531")),
        "kk" => Some(("Koka", "#215166")),
        "kml" => Some(("XML", "#0060ac")),
        "kojo" => Some(("Scala", "#c22d40")),
        "krl" => Some(("KRL", "#28430A")),
        "ks" => Some(("KerboScript", "#41adf0")),
        "ksh" => Some(("Shell", "#89e051")),
        "ksy" => Some(("Kaitai Struct", "#773b37")),
        "kt" => Some(("Kotlin", "#A97BFF")),
        "ktm" => Some(("Kotlin", "#A97BFF")),
        "kts" => Some(("Kotlin", "#A97BFF")),
        "kv" => Some(("kvlang", "#1da6e0")),
        "l" => Some(("Lex", "#DBCA00")),
        "lagda" => Some(("Literate Agda", "#315665")),
        "langium" => Some(("Langium", "#2c8c87")),
        "lark" => Some(("Lark", "#2980B9")),
        "las" => Some(("Lasso", "#999999")),
        "lasso" => Some(("Lasso", "#999999")),
        "lasso8" => Some(("Lasso", "#999999")),
        "lasso9" => Some(("Lasso", "#999999")),
        "latte" => Some(("Latte", "#f2a542")),
        "launch" => Some(("XML", "#0060ac")),
        "lbx" => Some(("TeX", "#3D6117")),
        "leex" => Some(("HTML+EEX", "#6e4a7e")),
        "lektorproject" => Some(("INI", "#d1dbe0")),
        "leo" => Some(("Leo", "#C4FFC2")),
        "less" => Some(("Less", "#1d365d")),
        "lex" => Some(("Lex", "#DBCA00")),
        "lfe" => Some(("LFE", "#4C3023")),
        "lgt" => Some(("Logtalk", "#295b9a")),
        "lhs" => Some(("Literate Haskell", "#5e5086")),
        "libsonnet" => Some(("Jsonnet", "#0064bd")),
        "lid" => Some(("Dylan", "#6c616e")),
        "lidr" => Some(("Idris", "#b30000")),
        "ligo" => Some(("LigoLANG", "#0e74ff")),
        "linq" => Some(("C#", "#178600")),
        "liq" => Some(("Liquidsoap", "#990066")),
        "liquid" => Some(("Liquid", "#67b8de")),
        "lisp" => Some(("Common Lisp", "#3fb68b")),
        "litcoffee" => Some(("Literate CoffeeScript", "#244776")),
        "livecodescript" => Some(("LiveCode Script", "#0c5ba5")),
        "lkml" => Some(("LookML", "#652B81")),
        "ll" => Some(("LLVM", "#185619")),
        "lmi" => Some(("Python", "#3572A5")),
        "logtalk" => Some(("Logtalk", "#295b9a")),
        "lol" => Some(("LOLCODE", "#cc9900")),
        "lookml" => Some(("LookML", "#652B81")),
        "lp" => Some(("Answer Set Programming", "#A9CC29")),
        "lpr" => Some(("Pascal", "#E3F171")),
        "ls" => Some(("LiveScript", "#499886")),
        "lsl" => Some(("LSL", "#3d9970")),
        "lslp" => Some(("LSL", "#3d9970")),
        "lsp" => Some(("Common Lisp", "#3fb68b")),
        "ltx" => Some(("TeX", "#3D6117")),
        "lua" => Some(("Lua", "#000080")),
        "luau" => Some(("Luau", "#00A2FF")),
        "lvclass" => Some(("LabVIEW", "#fede06")),
        "lvlib" => Some(("LabVIEW", "#fede06")),
        "lvproj" => Some(("LabVIEW", "#fede06")),
        "ly" => Some(("LilyPond", "#9ccc7c")),
        "m" => Some(("Objective-C", "#438eff")),
        "m2" => Some(("Macaulay2", "#d8ffff")),
        "m3" => Some(("Modula-3", "#223388")),
        "m3u" => Some(("M3U", "#179C7D")),
        "m3u8" => Some(("M3U", "#179C7D")),
        "ma" => Some(("Wolfram Language", "#dd1100")),
        "mak" => Some(("Makefile", "#427819")),
        "make" => Some(("Makefile", "#427819")),
        "makefile" => Some(("Makefile", "#427819")),
        "mako" => Some(("Mako", "#7e858d")),
        "man" => Some(("Roff", "#ecdebe")),
        "mao" => Some(("Mako", "#7e858d")),
        "marko" => Some(("Marko", "#42bff2")),
        "mask" => Some(("Mask", "#f97732")),
        "mat" => Some(("Unity3D Asset", "#222c37")),
        "mata" => Some(("Stata", "#1a5f91")),
        "matah" => Some(("Stata", "#1a5f91")),
        "mathematica" => Some(("Wolfram Language", "#dd1100")),
        "matlab" => Some(("MATLAB", "#e16737")),
        "mawk" => Some(("Awk", "#c30e9b")),
        "maxhelp" => Some(("Max", "#c4a79c")),
        "maxpat" => Some(("Max", "#c4a79c")),
        "maxproj" => Some(("Max", "#c4a79c")),
        "mbt" => Some(("MoonBit", "#b92381")),
        "mc" => Some(("Monkey C", "#8D6747")),
        "mcfunction" => Some(("mcfunction", "#E22837")),
        "mch" => Some(("B (Formal Method)", "#8aa8c5")),
        "mcmeta" => Some(("JSON", "#292929")),
        "mcr" => Some(("MAXScript", "#00a6a6")),
        "md" => Some(("GCC Machine Description", "#FFCFAB")),
        "mdoc" => Some(("Roff", "#ecdebe")),
        "mdpolicy" => Some(("XML", "#0060ac")),
        "mdx" => Some(("MDX", "#fcb32c")),
        "me" => Some(("Roff", "#ecdebe")),
        "mermaid" => Some(("Mermaid", "#ff3670")),
        "meta" => Some(("Unity3D Asset", "#222c37")),
        "metal" => Some(("Metal", "#8f14e9")),
        "metta" => Some(("MeTTa", "#6a5acd")),
        "mg" => Some(("Modula-3", "#223388")),
        "mint" => Some(("Mint", "#02b046")),
        "mir" => Some(("YAML", "#cb171e")),
        "mirah" => Some(("Mirah", "#c7a938")),
        "mjml" => Some(("XML", "#0060ac")),
        "mjs" => Some(("JavaScript", "#f1e05a")),
        "mk" => Some(("Makefile", "#427819")),
        "mkfile" => Some(("Makefile", "#427819")),
        "mkii" => Some(("TeX", "#3D6117")),
        "mkiv" => Some(("TeX", "#3D6117")),
        "mkvi" => Some(("TeX", "#3D6117")),
        "ml" => Some(("OCaml", "#ef7a08")),
        "ml4" => Some(("OCaml", "#ef7a08")),
        "mli" => Some(("OCaml", "#ef7a08")),
        "mligo" => Some(("CameLIGO", "#3be133")),
        "mlir" => Some(("MLIR", "#5EC8DB")),
        "mll" => Some(("OCaml", "#ef7a08")),
        "mly" => Some(("OCaml", "#ef7a08")),
        "mm" => Some(("Objective-C++", "#6866fb")),
        "mmd" => Some(("Mermaid", "#ff3670")),
        "mo" => Some(("Modelica", "#de1d31")),
        "mod" => Some(("Modula-2", "#10253f")),
        "mojo" => Some(("Mojo", "#ff4c1f")),
        "moo" => Some(("Mercury", "#ff2b2b")),
        "moon" => Some(("MoonScript", "#ff4585")),
        "move" => Some(("Move", "#4a137a")),
        "mpl" => Some(("JetBrains MPS", "#21D789")),
        "mps" => Some(("JetBrains MPS", "#21D789")),
        "mq4" => Some(("MQL4", "#62A8D6")),
        "mq5" => Some(("MQL5", "#4A76B8")),
        "mqh" => Some(("MQL4", "#62A8D6")),
        "mrc" => Some(("mIRC Script", "#3d57c3")),
        "ms" => Some(("MAXScript", "#00a6a6")),
        "msd" => Some(("JetBrains MPS", "#21D789")),
        "msg" => Some(("OMNeT++ MSG", "#a0e0a0")),
        "mspec" => Some(("Ruby", "#701516")),
        "mt" => Some(("Wolfram Language", "#dd1100")),
        "mtml" => Some(("MTML", "#b7e1f4")),
        "mts" => Some(("TypeScript", "#3178c6")),
        "mu" => Some(("mupad", "#244963")),
        "mud" => Some(("ZIL", "#dc75e5")),
        "mustache" => Some(("Mustache", "#724b3b")),
        "mxml" => Some(("XML", "#0060ac")),
        "mxt" => Some(("Max", "#c4a79c")),
        "mysql" => Some(("SQL", "#e38c00")),
        "mzn" => Some(("MiniZinc", "#06a9e6")),
        "n" => Some(("Nemerle", "#3d3c6e")),
        "nanorc" => Some(("nanorc", "#2d004d")),
        "nas" => Some(("Assembly", "#6E4C13")),
        "nasm" => Some(("Assembly", "#6E4C13")),
        "natvis" => Some(("XML", "#0060ac")),
        "nawk" => Some(("Awk", "#c30e9b")),
        "nb" => Some(("Wolfram Language", "#dd1100")),
        "nbp" => Some(("Wolfram Language", "#dd1100")),
        "nc" => Some(("nesC", "#94B0C7")),
        "ncl" => Some(("NCL", "#28431f")),
        "ndproj" => Some(("XML", "#0060ac")),
        "ne" => Some(("Nearley", "#990000")),
        "nearley" => Some(("Nearley", "#990000")),
        "ned" => Some(("OMNeT++ NED", "#08607c")),
        "nf" => Some(("Nextflow", "#3ac486")),
        "nginx" => Some(("Nginx", "#009639")),
        "nginxconf" => Some(("Nginx", "#009639")),
        "nim" => Some(("Nim", "#ffc200")),
        "nimble" => Some(("Nim", "#ffc200")),
        "nimrod" => Some(("Nim", "#ffc200")),
        "nims" => Some(("Nim", "#ffc200")),
        "nit" => Some(("Nit", "#009917")),
        "nix" => Some(("Nix", "#7e7eff")),
        "njk" => Some(("Nunjucks", "#3d8137")),
        "njs" => Some(("JavaScript", "#f1e05a")),
        "nl" => Some(("NewLisp", "#87AED7")),
        "nlogo" => Some(("NetLogo", "#ff6375")),
        "nomad" => Some(("HCL", "#844FBA")),
        "nproj" => Some(("XML", "#0060ac")),
        "nqp" => Some(("Raku", "#0000fb")),
        "nr" => Some(("Noir", "#2f1f49")),
        "nse" => Some(("Lua", "#000080")),
        "nss" => Some(("NWScript", "#111522")),
        "nu" => Some(("Nushell", "#4E9906")),
        "numpy" => Some(("NumPy", "#9C8AF9")),
        "numpyw" => Some(("NumPy", "#9C8AF9")),
        "numsc" => Some(("NumPy", "#9C8AF9")),
        "nuspec" => Some(("XML", "#0060ac")),
        "nut" => Some(("Squirrel", "#800000")),
        "ny" => Some(("Common Lisp", "#3fb68b")),
        "odd" => Some(("XML", "#0060ac")),
        "odin" => Some(("Odin", "#60AFFE")),
        "ol" => Some(("Jolie", "#843179")),
        "omgrofl" => Some(("Omgrofl", "#cabbff")),
        "ooc" => Some(("ooc", "#b0b77e")),
        "opal" => Some(("Opal", "#f7ede0")),
        "opencl" => Some(("OpenCL", "#ed2e2d")),
        "orc" => Some(("Csound", "#1a1a1a")),
        "os" => Some(("1C Enterprise", "#814CCC")),
        "osm" => Some(("XML", "#0060ac")),
        "outjob" => Some(("Altium Designer", "#A89663")),
        "overpassql" => Some(("OverpassQL", "#cce2aa")),
        "owl" => Some(("Web Ontology Language", "#5b70bd")),
        "oxygene" => Some(("Oxygene", "#cdd0e3")),
        "oz" => Some(("Oz", "#fab738")),
        "p" => Some(("OpenEdge ABL", "#5ce600")),
        "p4" => Some(("P4", "#7055b5")),
        "p6" => Some(("Raku", "#0000fb")),
        "p6l" => Some(("Raku", "#0000fb")),
        "p6m" => Some(("Raku", "#0000fb")),
        "p8" => Some(("Lua", "#000080")),
        "pac" => Some(("JavaScript", "#f1e05a")),
        "pact" => Some(("Pact", "#F7A8B8")),
        "pan" => Some(("Pan", "#cc0000")),
        "parrot" => Some(("Parrot", "#f3ca0a")),
        "pas" => Some(("Pascal", "#E3F171")),
        "pascal" => Some(("Pascal", "#E3F171")),
        "pat" => Some(("Max", "#c4a79c")),
        "pb" => Some(("PureBasic", "#5a6986")),
        "pbi" => Some(("PureBasic", "#5a6986")),
        "pbt" => Some(("PowerBuilder", "#8f0f8d")),
        "pcbdoc" => Some(("Altium Designer", "#A89663")),
        "pck" => Some(("PLSQL", "#dad8d8")),
        "pcss" => Some(("PostCSS", "#dc3a0c")),
        "pd_lua" => Some(("Lua", "#000080")),
        "pddl" => Some(("PDDL", "#0d00ff")),
        "pde" => Some(("Processing", "#0096D8")),
        "peggy" => Some(("PEG.js", "#234d6b")),
        "pegjs" => Some(("PEG.js", "#234d6b")),
        "pep" => Some(("Pep8", "#C76F5B")),
        "per" => Some(("Genero per", "#d8df39")),
        "perl" => Some(("Perl", "#0298c3")),
        "pfa" => Some(("PostScript", "#da291c")),
        "pgsql" => Some(("PLpgSQL", "#336790")),
        "ph" => Some(("Perl", "#0298c3")),
        "php" => Some(("Hack", "#878787")),
        "php3" => Some(("PHP", "#4F5D95")),
        "php4" => Some(("PHP", "#4F5D95")),
        "php5" => Some(("PHP", "#4F5D95")),
        "phps" => Some(("PHP", "#4F5D95")),
        "phpt" => Some(("PHP", "#4F5D95")),
        "phtml" => Some(("HTML+PHP", "#4f5d95")),
        "pig" => Some(("PigLatin", "#fcd7de")),
        "pike" => Some(("Pike", "#005390")),
        "pkb" => Some(("PLSQL", "#dad8d8")),
        "pkgproj" => Some(("XML", "#0060ac")),
        "pkl" => Some(("Pkl", "#6b9543")),
        "pks" => Some(("PLSQL", "#dad8d8")),
        "pl" => Some(("Perl", "#0298c3")),
        "pl6" => Some(("Raku", "#0000fb")),
        "plantuml" => Some(("PlantUML", "#fbbd16")),
        "plb" => Some(("PLSQL", "#dad8d8")),
        "plist" => Some(("XML Property List", "#0060ac")),
        "plot" => Some(("Gnuplot", "#f0a9f0")),
        "pls" => Some(("PLSQL", "#dad8d8")),
        "plsql" => Some(("PLSQL", "#dad8d8")),
        "plt" => Some(("Gnuplot", "#f0a9f0")),
        "pluginspec" => Some(("Ruby", "#701516")),
        "plx" => Some(("Perl", "#0298c3")),
        "pm" => Some(("Perl", "#0298c3")),
        "pm6" => Some(("Raku", "#0000fb")),
        "pml" => Some(("Promela", "#de0000")),
        "pmod" => Some(("Pike", "#005390")),
        "podsl" => Some(("Common Lisp", "#3fb68b")),
        "podspec" => Some(("Ruby", "#701516")),
        "pogo" => Some(("PogoScript", "#d80074")),
        "polar" => Some(("Polar", "#ae81ff")),
        "por" => Some(("Portugol", "#f8bd00")),
        "postcss" => Some(("PostCSS", "#dc3a0c")),
        "pov" => Some(("POV-Ray SDL", "#6bac65")),
        "pp" => Some(("Puppet", "#302B6D")),
        "pprx" => Some(("REXX", "#d90e09")),
        "praat" => Some(("Praat", "#c8506d")),
        "prawn" => Some(("Ruby", "#701516")),
        "prc" => Some(("PLSQL", "#dad8d8")),
        "prefab" => Some(("Unity3D Asset", "#222c37")),
        "prefs" => Some(("INI", "#d1dbe0")),
        "prg" => Some(("xBase", "#403a40")),
        "prisma" => Some(("Prisma", "#0c344b")),
        "prjpcb" => Some(("Altium Designer", "#A89663")),
        "pro" => Some(("Prolog", "#74283c")),
        "proj" => Some(("XML", "#0060ac")),
        "prolog" => Some(("Prolog", "#74283c")),
        "properties" => Some(("INI", "#d1dbe0")),
        "props" => Some(("XML", "#0060ac")),
        "prw" => Some(("xBase", "#403a40")),
        "ps" => Some(("PostScript", "#da291c")),
        "ps1" => Some(("PowerShell", "#012456")),
        "ps1xml" => Some(("XML", "#0060ac")),
        "psc" => Some(("Papyrus", "#6600cc")),
        "psc1" => Some(("XML", "#0060ac")),
        "psd1" => Some(("PowerShell", "#012456")),
        "psgi" => Some(("Perl", "#0298c3")),
        "psm1" => Some(("PowerShell", "#012456")),
        "pt" => Some(("XML", "#0060ac")),
        "pubxml" => Some(("XML", "#0060ac")),
        "pug" => Some(("Pug", "#a86454")),
        "puml" => Some(("PlantUML", "#fbbd16")),
        "purs" => Some(("PureScript", "#1D222D")),
        "pwn" => Some(("Pawn", "#dbb284")),
        "pxd" => Some(("Cython", "#fedf5b")),
        "pxi" => Some(("Cython", "#fedf5b")),
        "py" => Some(("Python", "#3572A5")),
        "py3" => Some(("Python", "#3572A5")),
        "pyde" => Some(("Python", "#3572A5")),
        "pyi" => Some(("Python", "#3572A5")),
        "pyp" => Some(("Python", "#3572A5")),
        "pyt" => Some(("Python", "#3572A5")),
        "pytb" => Some(("Python traceback", "#3572A5")),
        "pyw" => Some(("Python", "#3572A5")),
        "pyx" => Some(("Cython", "#fedf5b")),
        "q" => Some(("HiveQL", "#dce200")),
        "qasm" => Some(("OpenQASM", "#AA70FF")),
        "qbs" => Some(("QML", "#44a51c")),
        "qc" => Some(("QuakeC", "#975777")),
        "qhelp" => Some(("XML", "#0060ac")),
        "ql" => Some(("CodeQL", "#140f46")),
        "qll" => Some(("CodeQL", "#140f46")),
        "qml" => Some(("QML", "#44a51c")),
        "qs" => Some(("Q#", "#fed659")),
        "r" => Some(("R", "#198CE7")),
        "r2" => Some(("Rebol", "#358a5b")),
        "r3" => Some(("Rebol", "#358a5b")),
        "rabl" => Some(("Ruby", "#701516")),
        "rake" => Some(("Ruby", "#701516")),
        "raku" => Some(("Raku", "#0000fb")),
        "rakumod" => Some(("Raku", "#0000fb")),
        "raml" => Some(("RAML", "#77d9fb")),
        "rascript" => Some(("RAScript", "#2C97FA")),
        "razor" => Some(("HTML+Razor", "#512be4")),
        "rb" => Some(("Ruby", "#701516")),
        "rbi" => Some(("Ruby", "#701516")),
        "rbs" => Some(("RBS", "#701516")),
        "rbuild" => Some(("Ruby", "#701516")),
        "rbw" => Some(("Ruby", "#701516")),
        "rbx" => Some(("Ruby", "#701516")),
        "rbxs" => Some(("Lua", "#000080")),
        "rchit" => Some(("GLSL", "#5686a5")),
        "rd" => Some(("R", "#198CE7")),
        "rdf" => Some(("XML", "#0060ac")),
        "re" => Some(("C++", "#f34b7d")),
        "reb" => Some(("Rebol", "#358a5b")),
        "rebol" => Some(("Rebol", "#358a5b")),
        "red" => Some(("Red", "#f50000")),
        "reds" => Some(("Red", "#f50000")),
        "reek" => Some(("YAML", "#cb171e")),
        "reg" => Some(("Windows Registry Entries", "#52d5ff")),
        "regex" => Some(("Regular Expression", "#009a00")),
        "regexp" => Some(("Regular Expression", "#009a00")),
        "rego" => Some(("Open Policy Agent", "#7d9199")),
        "rei" => Some(("Reason", "#ff5847")),
        "religo" => Some(("ReasonLIGO", "#ff5847")),
        "res" => Some(("ReScript", "#ed5051")),
        "resi" => Some(("ReScript", "#ed5051")),
        "resource" => Some(("RobotFramework", "#00c0b5")),
        "resx" => Some(("XML", "#0060ac")),
        "rex" => Some(("REXX", "#d90e09")),
        "rexx" => Some(("REXX", "#d90e09")),
        "rg" => Some(("Rouge", "#cc0088")),
        "rhtml" => Some(("HTML+ERB", "#701516")),
        "ring" => Some(("Ring", "#2D54CB")),
        "riot" => Some(("Riot", "#A71E49")),
        "rkt" => Some(("Racket", "#3c5caa")),
        "rktd" => Some(("Racket", "#3c5caa")),
        "rktl" => Some(("Racket", "#3c5caa")),
        "rl" => Some(("Ragel", "#9d5200")),
        "rmiss" => Some(("GLSL", "#5686a5")),
        "rnh" => Some(("RUNOFF", "#665a4e")),
        "rno" => Some(("RUNOFF", "#665a4e")),
        "robot" => Some(("RobotFramework", "#00c0b5")),
        "roc" => Some(("Roc", "#7c38f5")),
        "rockspec" => Some(("Lua", "#000080")),
        "roff" => Some(("Roff", "#ecdebe")),
        "ron" => Some(("RON", "#a62c00")),
        "rpgle" => Some(("RPGLE", "#2BDE21")),
        "rpy" => Some(("Python", "#3572A5")),
        "rq" => Some(("SPARQL", "#0C4597")),
        "rs" => Some(("Rust", "#dea584")),
        "rsc" => Some(("Rascal", "#fffaa0")),
        "rss" => Some(("XML", "#0060ac")),
        "rsx" => Some(("R", "#198CE7")),
        "ru" => Some(("Ruby", "#701516")),
        "ruby" => Some(("Ruby", "#701516")),
        "rviz" => Some(("YAML", "#cb171e")),
        "s" => Some(("Assembly", "#6E4C13")),
        "sail" => Some(("Sail", "#259dd5")),
        "sarif" => Some(("JSON", "#292929")),
        "sas" => Some(("SAS", "#B34936")),
        "sass" => Some(("Sass", "#a53b70")),
        "sats" => Some(("ATS", "#1ac620")),
        "sbatch" => Some(("Shell", "#89e051")),
        "sbt" => Some(("Scala", "#c22d40")),
        "sc" => Some(("Scala", "#c22d40")),
        "scad" => Some(("OpenSCAD", "#e5cd45")),
        "scala" => Some(("Scala", "#c22d40")),
        "scaml" => Some(("Scaml", "#bd181a")),
        "scd" => Some(("SuperCollider", "#46390b")),
        "sce" => Some(("Scilab", "#ca0f21")),
        "scenic" => Some(("Scenic", "#fdc700")),
        "sch" => Some(("Scheme", "#1e4aec")),
        "schdoc" => Some(("Altium Designer", "#A89663")),
        "sci" => Some(("Scilab", "#ca0f21")),
        "scm" => Some(("Scheme", "#1e4aec")),
        "sco" => Some(("Csound Score", "#1a1a1a")),
        "scpt" => Some(("AppleScript", "#101F1F")),
        "scrbl" => Some(("Racket", "#3c5caa")),
        "scss" => Some(("SCSS", "#c6538c")),
        "scxml" => Some(("XML", "#0060ac")),
        "sdc" => Some(("Tcl", "#e4cc98")),
        "sed" => Some(("sed", "#64b970")),
        "self" => Some(("Self", "#0579aa")),
        "sexp" => Some(("Common Lisp", "#3fb68b")),
        "sfproj" => Some(("XML", "#0060ac")),
        "sfv" => Some(("Simple File Verification", "#C9BFED")),
        "sh" => Some(("Shell", "#89e051")),
        "shader" => Some(("GLSL", "#5686a5")),
        "shen" => Some(("Shen", "#120F14")),
        "shproj" => Some(("XML", "#0060ac")),
        "sig" => Some(("Standard ML", "#dc566d")),
        "sj" => Some(("Objective-J", "#ff0c5a")),
        "sjs" => Some(("JavaScript", "#f1e05a")),
        "sl" => Some(("Slash", "#007eff")),
        "slang" => Some(("Slang", "#1fbec9")),
        "sld" => Some(("Scheme", "#1e4aec")),
        "slim" => Some(("Slim", "#2b2b2b")),
        "slint" => Some(("Slint", "#2379F4")),
        "slnx" => Some(("XML", "#0060ac")),
        "sls" => Some(("SaltStack", "#646464")),
        "slurm" => Some(("Shell", "#89e051")),
        "sma" => Some(("Pawn", "#dbb284")),
        "smithy" => Some(("Smithy", "#c44536")),
        "smk" => Some(("Snakemake", "#419179")),
        "sml" => Some(("Standard ML", "#dc566d")),
        "snakefile" => Some(("Snakemake", "#419179")),
        "snap" => Some(("Jest Snapshot", "#15c213")),
        "snip" => Some(("Vim Snippet", "#199f4b")),
        "snippet" => Some(("Vim Snippet", "#199f4b")),
        "snippets" => Some(("Vim Snippet", "#199f4b")),
        "sol" => Some(("Solidity", "#AA6746")),
        "soy" => Some(("Closure Templates", "#0d948f")),
        "sp" => Some(("SourcePawn", "#f69e1d")),
        "sparql" => Some(("SPARQL", "#0C4597")),
        "spc" => Some(("PLSQL", "#dad8d8")),
        "spec" => Some(("Python", "#3572A5")),
        "spin" => Some(("Propeller Spin", "#7fa2a7")),
        "sps" => Some(("Scheme", "#1e4aec")),
        "sqf" => Some(("SQF", "#3F3F3F")),
        "sql" => Some(("SQL", "#e38c00")),
        "sqlrpgle" => Some(("RPGLE", "#2BDE21")),
        "sra" => Some(("PowerBuilder", "#8f0f8d")),
        "srdf" => Some(("XML", "#0060ac")),
        "srt" => Some(("SRecode Template", "#348a34")),
        "sru" => Some(("PowerBuilder", "#8f0f8d")),
        "srv" => Some(("ROS Interface", "#22314e")),
        "srw" => Some(("PowerBuilder", "#8f0f8d")),
        "ss" => Some(("Scheme", "#1e4aec")),
        "ssjs" => Some(("JavaScript", "#f1e05a")),
        "sss" => Some(("SugarSS", "#2fcc9f")),
        "st" => Some(("Smalltalk", "#596706")),
        "stan" => Some(("Stan", "#b2011d")),
        "star" => Some(("Starlark", "#76d275")),
        "sthlp" => Some(("Stata", "#1a5f91")),
        "stl" => Some(("STL", "#373b5e")),
        "story" => Some(("Gherkin", "#5B2063")),
        "storyboard" => Some(("XML", "#0060ac")),
        "sttheme" => Some(("XML Property List", "#0060ac")),
        "sty" => Some(("TeX", "#3D6117")),
        "styl" => Some(("Stylus", "#ff6347")),
        "sublime-build" => Some(("JSON with Comments", "#292929")),
        "sublime-color-scheme" => Some(("JSON with Comments", "#292929")),
        "sublime-commands" => Some(("JSON with Comments", "#292929")),
        "sublime-completions" => Some(("JSON with Comments", "#292929")),
        "sublime-keymap" => Some(("JSON with Comments", "#292929")),
        "sublime-macro" => Some(("JSON with Comments", "#292929")),
        "sublime-menu" => Some(("JSON with Comments", "#292929")),
        "sublime-mousemap" => Some(("JSON with Comments", "#292929")),
        "sublime-project" => Some(("JSON with Comments", "#292929")),
        "sublime-settings" => Some(("JSON with Comments", "#292929")),
        "sublime-snippet" => Some(("XML", "#0060ac")),
        "sublime-syntax" => Some(("YAML", "#cb171e")),
        "sublime-theme" => Some(("JSON with Comments", "#292929")),
        "sublime-workspace" => Some(("JSON with Comments", "#292929")),
        "sublime_metrics" => Some(("JSON with Comments", "#292929")),
        "sublime_session" => Some(("JSON with Comments", "#292929")),
        "surql" => Some(("SurrealQL", "#ff00a0")),
        "sv" => Some(("SystemVerilog", "#DAE1C2")),
        "svelte" => Some(("Svelte", "#ff3e00")),
        "svg" => Some(("SVG", "#ff9900")),
        "svh" => Some(("SystemVerilog", "#DAE1C2")),
        "svx" => Some(("mdsvex", "#5f9ea0")),
        "sw" => Some(("Sway", "#00F58C")),
        "swift" => Some(("Swift", "#F05138")),
        "syntax" => Some(("YAML", "#cb171e")),
        "t" => Some(("Perl", "#0298c3")),
        "tab" => Some(("SQL", "#e38c00")),
        "tac" => Some(("Python", "#3572A5")),
        "tact" => Some(("Tact", "#48b5ff")),
        "tag" => Some(("Java Server Pages", "#2A6277")),
        "talon" => Some(("Talon", "#333333")),
        "targets" => Some(("XML", "#0060ac")),
        "tcc" => Some(("C++", "#f34b7d")),
        "tcl" => Some(("Tcl", "#e4cc98")),
        "templ" => Some(("templ", "#66D0DD")),
        "tesc" => Some(("GLSL", "#5686a5")),
        "tese" => Some(("GLSL", "#5686a5")),
        "tex" => Some(("TeX", "#3D6117")),
        "textgrid" => Some(("TextGrid", "#c8506d")),
        "tf" => Some(("HCL", "#844FBA")),
        "tfstate" => Some(("JSON", "#292929")),
        "tftpl" => Some(("Terraform Template", "#7b42bb")),
        "tfvars" => Some(("HCL", "#844FBA")),
        "thor" => Some(("Ruby", "#701516")),
        "thrift" => Some(("Thrift", "#D12127")),
        "thy" => Some(("Isabelle", "#FEFE00")),
        "tl" => Some(("Teal", "#00B1BC")),
        "tla" => Some(("TLA", "#4b0079")),
        "tlv" => Some(("TL-Verilog", "#C40023")),
        "tm" => Some(("Tcl", "#e4cc98")),
        "tmac" => Some(("Roff", "#ecdebe")),
        "tmcommand" => Some(("XML Property List", "#0060ac")),
        "tmdl" => Some(("TMDL", "#f0c913")),
        "tml" => Some(("XML", "#0060ac")),
        "tmlanguage" => Some(("XML Property List", "#0060ac")),
        "tmpl" => Some(("Go Template", "#00ADD8")),
        "tmpreferences" => Some(("XML Property List", "#0060ac")),
        "tmsnippet" => Some(("XML Property List", "#0060ac")),
        "tmtheme" => Some(("XML Property List", "#0060ac")),
        "tmux" => Some(("Shell", "#89e051")),
        "toc" => Some(("TeX", "#3D6117")),
        "tofu" => Some(("HCL", "#844FBA")),
        "toit" => Some(("Toit", "#c2c9fb")),
        "toml" => Some(("TOML", "#9c4221")),
        "tool" => Some(("Shell", "#89e051")),
        "topojson" => Some(("JSON", "#292929")),
        "tpb" => Some(("PLSQL", "#dad8d8")),
        "tpl" => Some(("Smarty", "#f0c040")),
        "tpp" => Some(("C++", "#f34b7d")),
        "tps" => Some(("PLSQL", "#dad8d8")),
        "tres" => Some(("Godot Resource", "#355570")),
        "trg" => Some(("PLSQL", "#dad8d8")),
        "trigger" => Some(("Apex", "#1797c0")),
        "ts" => Some(("TypeScript", "#3178c6")),
        "tscn" => Some(("Godot Resource", "#355570")),
        "tsp" => Some(("TypeSpec", "#4A3665")),
        "tst" => Some(("GAP", "#0000cc")),
        "tsv" => Some(("TSV", "#237346")),
        "tsx" => Some(("TSX", "#3178c6")),
        "tu" => Some(("Turing", "#cf142b")),
        "twig" => Some(("Twig", "#c1d026")),
        "txl" => Some(("TXL", "#0178b8")),
        "txx" => Some(("C++", "#f34b7d")),
        "typ" => Some(("Typst", "#239dad")),
        "uc" => Some(("UnrealScript", "#a54c4d")),
        "udf" => Some(("SQL", "#e38c00")),
        "udo" => Some(("Csound", "#1a1a1a")),
        "ui" => Some(("XML", "#0060ac")),
        "unity" => Some(("Unity3D Asset", "#222c37")),
        "uno" => Some(("Uno", "#9933cc")),
        "upc" => Some(("Unified Parallel C", "#4e3617")),
        "uplc" => Some(("Untyped Plutus Core", "#36adbd")),
        "ur" => Some(("UrWeb", "#ccccee")),
        "urdf" => Some(("XML", "#0060ac")),
        "url" => Some(("INI", "#d1dbe0")),
        "urs" => Some(("UrWeb", "#ccccee")),
        "ux" => Some(("XML", "#0060ac")),
        "v" => Some(("Verilog", "#b2b7f8")),
        "vala" => Some(("Vala", "#a56de2")),
        "vapi" => Some(("Vala", "#a56de2")),
        "vark" => Some(("Gosu", "#82937f")),
        "vb" => Some(("Visual Basic .NET", "#945db7")),
        "vba" => Some(("VBA", "#867db1")),
        "vbhtml" => Some(("Visual Basic .NET", "#945db7")),
        "vbproj" => Some(("XML", "#0060ac")),
        "vbs" => Some(("VBScript", "#15dcdc")),
        "vcf" => Some(("TSV", "#237346")),
        "vcl" => Some(("VCL", "#148AA8")),
        "vcxproj" => Some(("XML", "#0060ac")),
        "vdf" => Some(("Valve Data Format", "#f26025")),
        "veo" => Some(("Verilog", "#b2b7f8")),
        "vert" => Some(("GLSL", "#5686a5")),
        "vh" => Some(("SystemVerilog", "#DAE1C2")),
        "vhd" => Some(("VHDL", "#adb2cb")),
        "vhdl" => Some(("VHDL", "#adb2cb")),
        "vhf" => Some(("VHDL", "#adb2cb")),
        "vhi" => Some(("VHDL", "#adb2cb")),
        "vho" => Some(("VHDL", "#adb2cb")),
        "vhost" => Some(("ApacheConf", "#d12127")),
        "vhs" => Some(("VHDL", "#adb2cb")),
        "vht" => Some(("VHDL", "#adb2cb")),
        "vhw" => Some(("VHDL", "#adb2cb")),
        "vim" => Some(("Vim Script", "#199f4b")),
        "vimrc" => Some(("Vim Script", "#199f4b")),
        "viw" => Some(("SQL", "#e38c00")),
        "vmb" => Some(("Vim Script", "#199f4b")),
        "volt" => Some(("Volt", "#1F1F1F")),
        "vrx" => Some(("GLSL", "#5686a5")),
        "vs" => Some(("GLSL", "#5686a5")),
        "vsh" => Some(("GLSL", "#5686a5")),
        "vshader" => Some(("GLSL", "#5686a5")),
        "vsixmanifest" => Some(("XML", "#0060ac")),
        "vssettings" => Some(("XML", "#0060ac")),
        "vstemplate" => Some(("XML", "#0060ac")),
        "vtl" => Some(("Velocity Template Language", "#507cff")),
        "vto" => Some(("Vento", "#ff0080")),
        "vue" => Some(("Vue", "#41b883")),
        "vw" => Some(("PLSQL", "#dad8d8")),
        "vxml" => Some(("XML", "#0060ac")),
        "vy" => Some(("Vyper", "#9F4CF2")),
        "w" => Some(("CWeb", "#00007a")),
        "wast" => Some(("WebAssembly", "#04133b")),
        "wat" => Some(("WebAssembly", "#04133b")),
        "watchr" => Some(("Ruby", "#701516")),
        "wdl" => Some(("WDL", "#42f1f4")),
        "webapp" => Some(("JSON", "#292929")),
        "webmanifest" => Some(("JSON", "#292929")),
        "wgsl" => Some(("WGSL", "#1a5e9a")),
        "whiley" => Some(("Whiley", "#d5c397")),
        "wisp" => Some(("wisp", "#7582D1")),
        "wit" => Some(("WebAssembly Interface Type", "#6250e7")),
        "wixproj" => Some(("XML", "#0060ac")),
        "wl" => Some(("Wolfram Language", "#dd1100")),
        "wlk" => Some(("Wollok", "#a23738")),
        "wls" => Some(("Wolfram Language", "#dd1100")),
        "wlt" => Some(("Wolfram Language", "#dd1100")),
        "wlua" => Some(("Lua", "#000080")),
        "workflow" => Some(("HCL", "#844FBA")),
        "wren" => Some(("Wren", "#383838")),
        "ws" => Some(("Witcher Script", "#ff0000")),
        "wsdl" => Some(("XML", "#0060ac")),
        "wsf" => Some(("XML", "#0060ac")),
        "wsgi" => Some(("Python", "#3572A5")),
        "wxi" => Some(("XML", "#0060ac")),
        "wxl" => Some(("XML", "#0060ac")),
        "wxs" => Some(("XML", "#0060ac")),
        "x" => Some(("DirectX 3D File", "#aace60")),
        "x10" => Some(("X10", "#4B6BEF")),
        "x3d" => Some(("XML", "#0060ac")),
        "x68" => Some(("Motorola 68K Assembly", "#005daa")),
        "xacro" => Some(("XML", "#0060ac")),
        "xaml" => Some(("XML", "#0060ac")),
        "xc" => Some(("XC", "#99DA07")),
        "xdc" => Some(("Tcl", "#e4cc98")),
        "xht" => Some(("HTML", "#e34c26")),
        "xhtml" => Some(("HTML", "#e34c26")),
        "xib" => Some(("XML", "#0060ac")),
        "xlf" => Some(("XML", "#0060ac")),
        "xliff" => Some(("XML", "#0060ac")),
        "xmi" => Some(("XML", "#0060ac")),
        "xml" => Some(("XML", "#0060ac")),
        "xmp" => Some(("XML", "#0060ac")),
        "xojo_code" => Some(("Xojo", "#81bd41")),
        "xojo_menu" => Some(("Xojo", "#81bd41")),
        "xojo_report" => Some(("Xojo", "#81bd41")),
        "xojo_script" => Some(("Xojo", "#81bd41")),
        "xojo_toolbar" => Some(("Xojo", "#81bd41")),
        "xojo_window" => Some(("Xojo", "#81bd41")),
        "xproj" => Some(("XML", "#0060ac")),
        "xpy" => Some(("Python", "#3572A5")),
        "xq" => Some(("XQuery", "#5232e7")),
        "xql" => Some(("XQuery", "#5232e7")),
        "xqm" => Some(("XQuery", "#5232e7")),
        "xquery" => Some(("XQuery", "#5232e7")),
        "xqy" => Some(("XQuery", "#5232e7")),
        "xrl" => Some(("Erlang", "#B83998")),
        "xsd" => Some(("XML", "#0060ac")),
        "xsh" => Some(("Xonsh", "#285EEF")),
        "xsjs" => Some(("JavaScript", "#f1e05a")),
        "xsjslib" => Some(("JavaScript", "#f1e05a")),
        "xsl" => Some(("XSLT", "#EB8CEB")),
        "xslt" => Some(("XSLT", "#EB8CEB")),
        "xspec" => Some(("XML", "#0060ac")),
        "xtend" => Some(("Xtend", "#24255d")),
        "xul" => Some(("XML", "#0060ac")),
        "xzap" => Some(("ZAP", "#0d665e")),
        "y" => Some(("Yacc", "#4B6C4B")),
        "yacc" => Some(("Yacc", "#4B6C4B")),
        "yaml" => Some(("MiniYAML", "#ff1111")),
        "yaml-tmlanguage" => Some(("YAML", "#cb171e")),
        "yap" => Some(("Prolog", "#74283c")),
        "yar" => Some(("YARA", "#220000")),
        "yara" => Some(("YARA", "#220000")),
        "yasnippet" => Some(("YASnippet", "#32AB90")),
        "yml" => Some(("MiniYAML", "#ff1111")),
        "yrl" => Some(("Erlang", "#B83998")),
        "yul" => Some(("Yul", "#794932")),
        "yy" => Some(("Yacc", "#4B6C4B")),
        "yyp" => Some(("JSON", "#292929")),
        "zap" => Some(("ZAP", "#0d665e")),
        "zcml" => Some(("XML", "#0060ac")),
        "zep" => Some(("Zephir", "#118f9e")),
        "zig" => Some(("Zig", "#ec915c")),
        "zil" => Some(("ZIL", "#dc75e5")),
        "zimpl" => Some(("Zimpl", "#d67711")),
        "zmodel" => Some(("Zmodel", "#ff7100")),
        "zmpl" => Some(("Zimpl", "#d67711")),
        "zpl" => Some(("Zimpl", "#d67711")),
        "zs" => Some(("ZenScript", "#00BCD1")),
        "zsh" => Some(("Shell", "#89e051")),
        "zsh-theme" => Some(("Shell", "#89e051")),
        _ => None,
    }
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
                    .map(|(a, d, ts, s)| (a, d, ts, s))
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
pub fn repo_blame(
    path: String,
    file: String,
    commit: Option<String>,
) -> Result<Vec<BlameEntry>, String> {
    let repo = PathBuf::from(&path);
    let mut args = vec!["blame", "--porcelain"];
    if let Some(ref c) = commit {
        args.push(c.as_str());
    }
    args.push("--");
    args.push(file.as_str());
    let output = run_git(&repo, &args)?;
    Ok(parse_blame_porcelain(&output))
}

#[tauri::command]
pub fn repo_language_stats(path: String) -> Result<Vec<LanguageStat>, String> {
    let repo = PathBuf::from(path.trim());
    let out = run_git(&repo, &["ls-tree", "-r", "-l", "HEAD"])?;

    let mut byte_map: HashMap<&'static str, (u64, &'static str)> = HashMap::new();
    let mut total_bytes: u64 = 0;

    for line in out.lines() {
        let parts: Vec<&str> = line.splitn(5, '\t').collect();
        if parts.len() < 2 {
            continue;
        }
        let meta_parts: Vec<&str> = parts[0].split_whitespace().collect();
        if meta_parts.len() < 4 {
            continue;
        }
        let size_str = meta_parts[3];
        let Ok(size) = size_str.parse::<u64>() else {
            continue;
        };
        let file_path = parts[1].trim();
        let ext = file_path
            .rsplit('.')
            .next()
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let Some((lang, color)) = ext_to_language(&ext) else {
            continue;
        };
        let entry = byte_map.entry(lang).or_insert((0, color));
        entry.0 += size;
        total_bytes += size;
    }

    if total_bytes == 0 {
        return Ok(Vec::new());
    }

    let mut stats: Vec<LanguageStat> = byte_map
        .into_iter()
        .map(|(language, (bytes, color))| LanguageStat {
            language: language.to_string(),
            color: color.to_string(),
            bytes,
            percent: (bytes as f64 / total_bytes as f64) * 100.0,
        })
        .collect();

    stats.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    Ok(stats)
}
