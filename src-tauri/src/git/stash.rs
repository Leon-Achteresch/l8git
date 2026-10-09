use std::collections::HashSet;
use super::*;

fn stash_mutex(repo: &PathBuf) -> Result<std::sync::Arc<std::sync::Mutex<()>>, String> {
    static LOCKS: std::sync::OnceLock<std::sync::Mutex<HashMap<PathBuf, std::sync::Weak<std::sync::Mutex<()>>>>> = std::sync::OnceLock::new();
    let common = run_git(repo, &["rev-parse", "--git-common-dir"])?;
    let common = common.strip_suffix('\n').unwrap_or(&common);
    let key = repo.join(common).canonicalize().map_err(|e| e.to_string())?;
    let mut locks = LOCKS.get_or_init(Default::default).lock().map_err(|e| e.to_string())?;
    locks.retain(|_, weak| weak.strong_count() > 0);
    if let Some(lock) = locks.get(&key).and_then(|weak| weak.upgrade()) { return Ok(lock); }
    let lock = std::sync::Arc::new(std::sync::Mutex::new(()));
    locks.insert(key, std::sync::Arc::downgrade(&lock));
    Ok(lock)
}

fn checked_stash(repo: &PathBuf, index: u32, expected: &str) -> Result<String, String> {
    let actual = run_git(repo, &["rev-parse", "--verify", &stash_ref(index)])
        .map_err(|_| "__STASH_CHANGED__".to_string())?;
    if expected.is_empty() || actual.trim() != expected {
        return Err("__STASH_CHANGED__".into());
    }
    Ok(actual.trim().to_string())
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

pub(super) fn stash_index_from_ref(gd: &str) -> Option<u32> {
    let s = gd.trim();
    let open = s.find('{')?;
    let close = s.rfind('}')?;
    if close <= open + 1 {
        return None;
    }
    s[open + 1..close].parse().ok()
}

pub(super) fn parse_stash_gs(gs: &str) -> (String, String, String) {
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

fn stash_changed_files(repo: &PathBuf, sref: &str) -> Result<Vec<CommitChangedFile>, String> {
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
    let mut map = parse_numstat(&numstat);
    let untracked = format!("{sref}^3");
    let mut untracked_paths = HashSet::new();
    if run_git(repo, &["rev-parse", "--verify", &untracked]).is_ok() {
        let added = run_git(repo, &["diff-tree", "--root", "-r", "--no-commit-id", "--numstat", "-z", &untracked])?;
        let added = parse_numstat(&added);
        untracked_paths.extend(added.keys().cloned());
        map.extend(added);
    }
    let mut files: Vec<CommitChangedFile> = map
        .into_iter()
        .map(|(path, (adds, dels, binary))| CommitChangedFile {
            untracked: untracked_paths.contains(&path),
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
pub async fn list_stashes(path: String) -> Result<Vec<StashEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let sep = "\x1f";
        let fmt = format!("%gd{sep}%H{sep}%cI{sep}%gs");
        let out = run_git(
            &repo,
            &["stash", "list", &format!("--format={fmt}")],
        )?;
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
    }).await
}

#[tauri::command]
pub async fn git_stash_push(
    path: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = stash_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
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
    }).await
}

#[tauri::command]
pub async fn git_stash_pop(path: String, index: u32, expected_hash: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = stash_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let hash = checked_stash(&repo, index, &expected_hash)?;
        let sref = stash_ref(index);
        let out = run_git_merged_output(&repo, &["stash", "apply", "--quiet", &hash])?;
        // Applying is pinned to the object. If another process changes the list,
        // retain the stash instead of deleting a different entry.
        checked_stash(&repo, index, &expected_hash)?;
        run_git(&repo, &["stash", "drop", "--quiet", &sref])?;
        Ok(out)
    }).await
}

#[tauri::command]
pub async fn git_stash_apply(path: String, index: u32, expected_hash: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = stash_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let hash = checked_stash(&repo, index, &expected_hash)?;
        run_git_merged_output(&repo, &["stash", "apply", "--quiet", &hash])
    }).await
}

#[tauri::command]
pub async fn git_stash_drop(path: String, index: u32, expected_hash: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = stash_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let _hash = checked_stash(&repo, index, &expected_hash)?;
        let sref = stash_ref(index);
        run_git(&repo, &["stash", "drop", "--quiet", &sref])?;
        Ok(())
    }).await
}

#[derive(Serialize)]
pub struct StashInspectResponse {
    pub header: String,
    pub files: Vec<CommitChangedFile>,
}

#[tauri::command]
pub async fn git_stash_show(path: String, index: u32, expected_hash: Option<String>) -> Result<StashInspectResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let sref = match expected_hash {
            Some(expected) => checked_stash(&repo, index, &expected)?,
            None => run_git(&repo, &["rev-parse", "--verify", &stash_ref(index)])?.trim().to_string(),
        };
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
        let files = stash_changed_files(&repo, &sref)?;
        Ok(StashInspectResponse {
            header: header.trim().to_string(),
            files,
        })
    }).await
}

#[tauri::command]
pub async fn git_stash_file_diff(
    path: String,
    index: u32,
    file: String,
    expected_hash: Option<String>,
) -> Result<CommitFileDiffResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let f = file.trim();
        if f.is_empty() {
            return Err("Dateipfad fehlt".into());
        }
        let sref = match expected_hash {
            Some(expected) => checked_stash(&repo, index, &expected)?,
            None => run_git(&repo, &["rev-parse", "--verify", &stash_ref(index)])?.trim().to_string(),
        };
        let parent = format!("{sref}^1");
        let mut diff = run_git(&repo, &["diff", "--no-color", "-M", &parent, &sref, "--", f])?;
        let untracked = format!("{sref}^3");
        if run_git(&repo, &["rev-parse", "--verify", &untracked]).is_ok() {
            diff.push_str(&run_git(&repo, &["diff-tree", "--root", "-r", "-p", "--no-color", "--no-commit-id", &untracked, "--", f])?);
        }
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

#[tauri::command]
pub async fn git_stash_branch(path: String, index: u32, name: String, expected_hash: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let n = name.trim();
        if n.is_empty() {
            return Err("Branch-Name darf nicht leer sein".into());
        }
        let sref = stash_ref(index);
        let lock = stash_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let hash = checked_stash(&repo, index, &expected_hash)?;
        if n.starts_with('-') { return Err("Invalid branch name".into()); }
        run_git(&repo, &["check-ref-format", "--branch", n])?;
        let out = run_git_merged_output(&repo, &["stash", "branch", n, &hash])?;
        checked_stash(&repo, index, &expected_hash)?;
        run_git(&repo, &["stash", "drop", "--quiet", &sref])?;
        Ok(out)
    }).await
}
