use super::{
    repo_mutation_mutex, resolve_git_commit, run_git, run_git_merged_output, spawn_git,
    validate_branch_name, WorktreePathGuard,
};
use serde::Serialize;
use std::{collections::BTreeMap, path::PathBuf};

#[derive(Serialize, Clone)]
pub struct SubmoduleEntry {
    pub name: String,
    pub path: String,
    pub url: String,
    pub commit: String,
    pub status: String,
    pub description: Option<String>,
    pub branch: Option<String>,
    pub remote_commit: Option<String>,
    pub behind_count: Option<i32>,
    pub local_changes: Option<u32>,
    pub is_detached: bool,
    pub gitmodules_raw: String,
}

#[derive(Serialize, Clone)]
pub struct SubmoduleCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub is_pinned: bool,
}

#[derive(Default)]
struct SubmoduleDefinition {
    name: String,
    path: String,
    url: String,
    branch: Option<String>,
}

#[derive(Default)]
struct Gitlink {
    commit: String,
    stage: u8,
    conflicted: bool,
}

struct SubmoduleRegistry {
    guard: WorktreePathGuard,
    raw: String,
    definitions: BTreeMap<String, SubmoduleDefinition>,
    gitlinks: BTreeMap<String, Gitlink>,
}

impl SubmoduleRegistry {
    fn read(repo: &PathBuf) -> Result<Self, String> {
        let guard = WorktreePathGuard::new(repo)?;
        let config_path = guard.regular_file(".gitmodules")?;
        let raw = match std::fs::read_to_string(config_path) {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(format!("Cannot read .gitmodules: {error}")),
        };
        let mut by_name: BTreeMap<String, SubmoduleDefinition> = BTreeMap::new();
        if !raw.is_empty() {
            // Git decodes quoting, escapes, comments and repeated assignments.
            // The first newline separates key/value; values may contain newlines.
            let config = run_git(
                repo,
                &["config", "--null", "--file", ".gitmodules", "--list"],
            )?;
            for record in config.split_terminator('\0') {
                let (key, value) = record.split_once('\n').unwrap_or((record, ""));
                let Some(key) = key.strip_prefix("submodule.") else {
                    continue;
                };
                let Some((name, field)) = key.rsplit_once('.') else {
                    continue;
                };
                if !matches!(field, "path" | "url" | "branch") {
                    continue;
                }
                let definition =
                    by_name
                        .entry(name.into())
                        .or_insert_with(|| SubmoduleDefinition {
                            name: name.into(),
                            ..Default::default()
                        });
                match field {
                    "path" => definition.path = value.into(),
                    "url" => definition.url = value.into(),
                    "branch" => definition.branch = Some(value.into()),
                    _ => unreachable!(),
                }
            }
        }
        let mut definitions = BTreeMap::new();
        for (_, definition) in by_name {
            guard.regular_file(&definition.path)?;
            if definitions.contains_key(&definition.path) {
                return Err(format!(
                    "Duplicate submodule path in .gitmodules: {}",
                    definition.path
                ));
            }
            definitions.insert(definition.path.clone(), definition);
        }
        let mut gitlinks: BTreeMap<String, Gitlink> = BTreeMap::new();
        let index = run_git(repo, &["ls-files", "--stage", "-z"])?;
        for record in index.split_terminator('\0') {
            let Some((header, path)) = record.split_once('\t') else {
                return Err("Invalid Git index record".into());
            };
            let fields: Vec<&str> = header.split_whitespace().collect();
            if fields.len() != 3 {
                return Err("Invalid Git index entry".into());
            }
            if fields[0] != "160000" {
                continue;
            }
            guard.regular_file(path)?;
            let stage = fields[2]
                .parse::<u8>()
                .map_err(|_| "Invalid Git index stage")?;
            let gitlink = gitlinks.entry(path.into()).or_default();
            gitlink.conflicted |= stage != 0;
            // Prefer ours for an unmerged gitlink, then theirs, then base.
            if gitlink.commit.is_empty()
                || stage == 0
                || stage == 2
                || (stage == 3 && gitlink.stage == 1)
            {
                gitlink.commit = fields[1].into();
                gitlink.stage = stage;
            }
        }
        Ok(Self {
            guard,
            raw,
            definitions,
            gitlinks,
        })
    }

    fn registered_path(&self, path: &str) -> Result<PathBuf, String> {
        let directory = self.guard.regular_file(path)?;
        if !self.gitlinks.contains_key(path) {
            return Err(format!("Not a registered submodule: {path}"));
        }
        Ok(directory)
    }

    fn selected_path(&self, selected: Option<&str>) -> Result<(), String> {
        if let Some(path) = selected {
            self.registered_path(path)?;
        }
        Ok(())
    }
}

fn extract_gitmodules_block(content: &str, name: &str) -> String {
    let mut lines = Vec::new();
    let mut in_block = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if in_block {
                break;
            }
            in_block = gitmodules_section_name(trimmed).as_deref() == Some(name);
        }
        if in_block {
            lines.push(line);
        }
    }
    lines.join("\n")
}

// Configuration values are parsed by Git; this only identifies the matching
// original stanza for display, including escaped names and trailing comments.
fn gitmodules_section_name(header: &str) -> Option<String> {
    let rest = header.strip_prefix('[')?.trim_start();
    let section = rest.get(..9)?;
    if !section.eq_ignore_ascii_case("submodule") {
        return None;
    }
    let rest = &rest[9..];
    if let Some(rest) = rest.strip_prefix('.') {
        return Some(rest.split_once(']')?.0.to_ascii_lowercase());
    }
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    let mut chars = rest.trim_start().strip_prefix('"')?.chars();
    let mut name = String::new();
    while let Some(ch) = chars.next() {
        match ch {
            '\\' => name.push(chars.next()?),
            '"' => return chars.as_str().trim_start().starts_with(']').then_some(name),
            _ => name.push(ch),
        }
    }
    None
}

struct SubmoduleExtra {
    head: String,
    is_detached: bool,
    remote_commit: Option<String>,
    behind_count: Option<i32>,
    local_changes: u32,
    description: Option<String>,
}

fn submodule_is_initialized(sub_dir: &PathBuf) -> Result<bool, String> {
    match std::fs::symlink_metadata(sub_dir.join(".git")) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
        _ => {}
    }
    let root = run_git(sub_dir, &["rev-parse", "--show-toplevel"])?;
    let root = root.strip_suffix('\n').unwrap_or(&root);
    #[cfg(windows)]
    let root = root.strip_suffix('\r').unwrap_or(root);
    let root = PathBuf::from(root)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let expected = sub_dir.canonicalize().map_err(|error| error.to_string())?;
    if root != expected {
        return Err(format!("__INVALID_WORKTREE_PATH__|{}", sub_dir.display()));
    }
    Ok(true)
}

fn get_submodule_extra(sub_dir: &PathBuf) -> Result<Option<SubmoduleExtra>, String> {
    if !submodule_is_initialized(sub_dir)? {
        return Ok(None);
    }
    let head = resolve_git_commit(sub_dir, "HEAD")?;
    let is_detached = run_git(sub_dir, &["symbolic-ref", "--quiet", "HEAD"]).is_err();
    let upstream = resolve_git_commit(sub_dir, "@{u}").ok();
    let remote_commit = upstream
        .as_ref()
        .map(|hash| hash[..hash.len().min(7)].into());
    let behind_count = upstream
        .map(|upstream| {
            run_git(
                sub_dir,
                &["rev-list", "--count", &format!("{head}..{upstream}")],
            )?
            .trim()
            .parse::<i32>()
            .map_err(|_| "Invalid submodule upstream count".to_string())
        })
        .transpose()?;
    let status = run_git(
        sub_dir,
        &["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
    )?;
    let mut records = status.split_terminator('\0');
    let mut local_changes = 0u32;
    while let Some(record) = records.next() {
        if record.len() < 4 {
            return Err("Invalid submodule status record".into());
        }
        local_changes = local_changes.saturating_add(1);
        if record.as_bytes()[..2]
            .iter()
            .any(|status| matches!(status, b'R' | b'C'))
        {
            records.next().ok_or("Missing submodule rename source")?;
        }
    }
    let description = run_git(sub_dir, &["describe", "--all", "--always", &head])
        .ok()
        .map(|description| description.trim().into());
    Ok(Some(SubmoduleExtra {
        head,
        is_detached,
        remote_commit,
        behind_count,
        local_changes,
        description,
    }))
}

#[tauri::command]
pub async fn list_submodules(path: String) -> Result<Vec<SubmoduleEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let registry = SubmoduleRegistry::read(&repo)?;
        let mut paths = registry
            .gitlinks
            .keys()
            .chain(registry.definitions.keys())
            .collect::<Vec<_>>();
        paths.sort();
        paths.dedup();
        let mut entries = Vec::new();
        for path in paths {
            let definition = registry.definitions.get(path);
            let gitlink = registry.gitlinks.get(path);
            let sub_dir = registry.guard.regular_file(path)?;
            let extra = if gitlink.is_some() {
                get_submodule_extra(&sub_dir)?
            } else {
                None
            };
            let commit = gitlink
                .map(|gitlink| gitlink.commit.clone())
                .unwrap_or_default();
            let status = if gitlink.is_some_and(|gitlink| gitlink.conflicted) {
                "conflict"
            } else if let Some(extra) = &extra {
                if extra.head == commit {
                    "initialized"
                } else {
                    "modified"
                }
            } else {
                "uninitialized"
            };
            let name = definition
                .map(|definition| definition.name.clone())
                .unwrap_or_else(|| path.clone());
            entries.push(SubmoduleEntry {
                gitmodules_raw: extract_gitmodules_block(&registry.raw, &name),
                name,
                path: path.clone(),
                url: definition
                    .map(|definition| definition.url.clone())
                    .unwrap_or_default(),
                commit,
                status: status.into(),
                description: extra.as_ref().and_then(|extra| extra.description.clone()),
                branch: definition.and_then(|definition| definition.branch.clone()),
                remote_commit: extra.as_ref().and_then(|extra| extra.remote_commit.clone()),
                behind_count: extra.as_ref().and_then(|extra| extra.behind_count),
                local_changes: extra.as_ref().map(|extra| extra.local_changes),
                is_detached: extra.is_some_and(|extra| extra.is_detached),
            });
        }
        Ok(entries)
    })
    .await
}

fn parse_submodule_commits(
    out: &str,
    pinned: Option<&str>,
) -> Result<Vec<SubmoduleCommit>, String> {
    let fields = out.split_terminator('\0').collect::<Vec<_>>();
    if fields.len() % 5 != 0 {
        return Err("Invalid submodule commit record".into());
    }
    Ok(fields
        .chunks_exact(5)
        .map(|fields| SubmoduleCommit {
            hash: fields[0].into(),
            short_hash: fields[1].into(),
            message: fields[2].into(),
            author: fields[3].into(),
            date: fields[4].into(),
            is_pinned: pinned == Some(fields[0]),
        })
        .collect())
}

#[tauri::command]
pub async fn get_submodule_commits(
    path: String,
    submodule_path: String,
    pinned_commit: String,
) -> Result<Vec<SubmoduleCommit>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let registry = SubmoduleRegistry::read(&repo)?;
        let sub_dir = registry.registered_path(&submodule_path)?;
        if get_submodule_extra(&sub_dir)?.is_none() {
            return Err(format!("Submodule is not initialized: {submodule_path}"));
        }
        if pinned_commit.chars().any(char::is_control) {
            return Err("Invalid pinned submodule commit".into());
        }
        let pinned = if pinned_commit.is_empty() {
            None
        } else {
            Some(resolve_git_commit(&sub_dir, &pinned_commit)?)
        };
        let out = run_git(
            &sub_dir,
            &[
                "log",
                "-z",
                "--format=%H%x00%h%x00%s%x00%an%x00%ar",
                "-10",
                "HEAD",
                "--",
            ],
        )?;
        let mut commits = parse_submodule_commits(&out, pinned.as_deref())?;
        // Keep the recorded pin visible beyond ten local commits or on another history.
        if let Some(pinned) = &pinned {
            if !commits.iter().any(|commit| commit.is_pinned) {
                let out = run_git(
                    &sub_dir,
                    &[
                        "log",
                        "-z",
                        "--format=%H%x00%h%x00%s%x00%an%x00%ar",
                        "-1",
                        pinned,
                        "--",
                    ],
                )?;
                commits.extend(parse_submodule_commits(&out, Some(pinned))?);
            }
        }
        Ok(commits)
    })
    .await
}

fn submodule_action(
    repo: &PathBuf,
    selected: Option<&str>,
    action: &str,
    flags: &[&str],
) -> Result<String, String> {
    let registry = SubmoduleRegistry::read(repo)?;
    registry.selected_path(selected)?;
    // A .git file with a changed core.worktree must not redirect operations to
    // a different working copy, even when the registered directory is safe.
    for path in registry
        .gitlinks
        .keys()
        .filter(|path| selected.is_none_or(|selected| path.as_str() == selected))
    {
        submodule_is_initialized(&registry.registered_path(path)?)?;
    }
    let mut args = vec!["--literal-pathspecs", "submodule", action];
    args.extend(flags);
    if let Some(path) = selected {
        args.extend(["--", path]);
    }
    run_git_merged_output(repo, &args)
}

#[tauri::command]
pub async fn git_submodule_init(
    path: String,
    submodule_path: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|_| "Git mutation lock poisoned")?;
        submodule_action(&repo, submodule_path.as_deref(), "init", &[])
    })
    .await
}

#[tauri::command]
pub async fn git_submodule_update(
    path: String,
    submodule_path: Option<String>,
    init: bool,
    recursive: bool,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|_| "Git mutation lock poisoned")?;
        let mut flags = Vec::new();
        if init {
            flags.push("--init");
        }
        if recursive {
            flags.push("--recursive");
        }
        submodule_action(&repo, submodule_path.as_deref(), "update", &flags)
    })
    .await
}

#[tauri::command]
pub async fn git_submodule_sync(
    path: String,
    submodule_path: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|_| "Git mutation lock poisoned")?;
        submodule_action(&repo, submodule_path.as_deref(), "sync", &[])
    })
    .await
}

fn validate_submodule_name(name: &str) -> Result<(), String> {
    use std::path::{Component, Path};
    let path = Path::new(name);
    if name.is_empty()
        || name.starts_with('-')
        || name.contains(['\0', '\n', '\r'])
        || !path
            .components()
            .any(|part| matches!(part, Component::Normal(_)))
        || path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || path
            .components()
            .any(|part| part.as_os_str().eq_ignore_ascii_case(".git"))
    {
        return Err(format!("Invalid submodule name: {name}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn git_submodule_add(
    path: String,
    url: String,
    subpath: String,
    name: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|_| "Git mutation lock poisoned")?;
        let registry = SubmoduleRegistry::read(&repo)?;
        let sub_dir = registry.guard.regular_file(&subpath)?;
        submodule_is_initialized(&sub_dir)?;
        if registry.gitlinks.contains_key(&subpath) || registry.definitions.contains_key(&subpath) {
            return Err(format!("Submodule path already registered: {subpath}"));
        }
        if url.trim().is_empty() || url.starts_with('-') || url.contains('\0') {
            return Err("Invalid submodule URL".into());
        }
        let effective_name = name.as_deref().unwrap_or(&subpath);
        validate_submodule_name(effective_name)?;
        if registry
            .definitions
            .values()
            .any(|definition| definition.name == effective_name)
        {
            return Err(format!(
                "Submodule name already registered: {effective_name}"
            ));
        }
        if let Some(branch) = &branch {
            validate_branch_name(&repo, branch)?;
        }
        let mut args: Vec<String> = vec![
            "--literal-pathspecs".into(),
            "submodule".into(),
            "add".into(),
        ];
        if let Some(branch) = branch {
            args.extend(["-b".into(), branch]);
        }
        if let Some(name) = name {
            args.extend(["--name".into(), name]);
        }
        args.extend(["--".into(), url, subpath]);
        let args = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git_merged_output(&repo, &args)
    })
    .await
}

#[tauri::command]
pub async fn git_submodule_deinit(
    path: String,
    submodule_path: String,
    force: bool,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|_| "Git mutation lock poisoned")?;
        submodule_action(
            &repo,
            Some(&submodule_path),
            "deinit",
            if force { &["--force"] } else { &[] },
        )
    })
    .await
}
