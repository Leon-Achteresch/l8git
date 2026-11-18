use crate::coded;
use crate::error::{required, Label};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use notify::{EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;

struct Entry {
    stop: Arc<AtomicBool>,
}

impl Drop for Entry {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn registry() -> &'static Mutex<HashMap<String, Entry>> {
    static REG: OnceLock<Mutex<HashMap<String, Entry>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

const IGNORED_DIR_NAMES: &[&str] = &[
    "node_modules",
    "bower_components",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".astro",
    ".turbo",
    ".parcel-cache",
    ".cache",
    ".yarn",
    ".pnpm-store",
    "coverage",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".gradle",
    ".idea",
    ".terraform",
    "DerivedData",
    "Pods",
    ".angular",
    ".dart_tool",
    "Debug",
    "Release",
    "cmake-build-debug",
    "cmake-build-release",
];

#[cfg_attr(target_os = "macos", allow(dead_code))]
const MAX_SPLIT_DEPTH: usize = 2;
const POLL_INTERVAL: Duration = Duration::from_millis(300);
const CATALOG_PROBE_INTERVAL: Duration = Duration::from_secs(3);
pub(crate) const WORKTREE_CATALOG_EVENT: &str = "repo-worktrees-changed";

fn is_ignored_dir_name(name: &str) -> bool {
    IGNORED_DIR_NAMES
        .iter()
        .any(|d| d.eq_ignore_ascii_case(name))
}

fn relative_to_roots<'a>(roots: &[PathBuf], path: &'a Path) -> Option<&'a Path> {
    roots.iter().find_map(|root| path.strip_prefix(root).ok())
}

fn is_ignored_path(roots: &[PathBuf], path: &Path) -> bool {
    let Some(rel) = relative_to_roots(roots, path) else {
        return false;
    };
    let mut in_git_dir = false;
    for comp in rel.components() {
        let Component::Normal(raw) = comp else {
            continue;
        };
        let Some(name) = raw.to_str() else {
            continue;
        };
        if in_git_dir && (name == "objects" || name == "logs") {
            return true;
        }
        if in_git_dir && name.ends_with(".lock") {
            return true;
        }
        if is_ignored_dir_name(name) {
            return true;
        }
        in_git_dir = name == ".git";
    }
    false
}

fn is_git_meta_path(roots: &[PathBuf], path: &Path) -> bool {
    let Some(rel) = relative_to_roots(roots, path) else {
        return false;
    };
    let mut comps = rel.components().filter_map(|c| match c {
        Component::Normal(raw) => raw.to_str(),
        _ => None,
    });
    if comps.next() != Some(".git") {
        return false;
    }
    !matches!(comps.next(), Some("index") | None)
}

// Membership changes live under the common directory, even for a .git file.
fn is_catalog_change(catalog: &Path, path: &Path, kind: EventKind) -> bool {
    if matches!(kind, EventKind::Access(_)) {
        return false;
    }
    let Ok(relative) = path.strip_prefix(catalog) else {
        return false;
    };
    match relative.components().count() {
        0 | 1 => true,
        2 => relative.file_name().is_some_and(|name| name == "gitdir"),
        _ => false,
    }
}

fn catalog_stamp(catalog: &Path) -> Result<Option<SystemTime>, std::io::ErrorKind> {
    match std::fs::metadata(catalog) {
        Ok(metadata) => metadata.modified().map(Some).map_err(|error| error.kind()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.kind()),
    }
}

fn catalog_members(catalog: &Path) -> std::io::Result<HashSet<std::ffi::OsString>> {
    let mut members = HashSet::new();
    let entries = match std::fs::read_dir(catalog) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(members),
        Err(error) => return Err(error),
    };
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_dir() && entry.path().join("gitdir").try_exists()? {
            members.insert(entry.file_name());
        }
    }
    Ok(members)
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn depth_from_root(roots: &[PathBuf], path: &Path) -> Option<usize> {
    relative_to_roots(roots, path).map(|rel| rel.components().count())
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn attach_dir<W: Watcher>(
    watcher: &mut W,
    roots: &[PathBuf],
    dir: &Path,
    depth: usize,
    shallow: &mut HashSet<PathBuf>,
) {
    if depth >= MAX_SPLIT_DEPTH {
        let _ = watcher.watch(dir, RecursiveMode::Recursive);
        return;
    }
    let Some(rel) = relative_to_roots(roots, dir) else {
        return;
    };
    let rel = rel.to_path_buf();
    if watcher.watch(dir, RecursiveMode::NonRecursive).is_err() {
        return;
    }
    shallow.insert(rel);
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let child = entry.path();
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let Some(name) = child.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name == ".git" || is_ignored_dir_name(name) {
            continue;
        }
        attach_dir(watcher, roots, &child, depth + 1, shallow);
    }
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn attach_git_dir<W: Watcher>(watcher: &mut W, root: &Path) {
    let git_dir = root.join(".git");
    if !git_dir.is_dir() {
        return;
    }
    let _ = watcher.watch(&git_dir, RecursiveMode::NonRecursive);
    for sub in ["refs", "info"] {
        let p = git_dir.join(sub);
        if p.is_dir() {
            let _ = watcher.watch(&p, RecursiveMode::Recursive);
        }
    }
}

#[tauri::command]
pub fn watch_repo(path: String) -> Result<(), String> {
    watch_repo_inner(path)
}

pub(crate) fn watch_repo_inner(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err(required(Label::Path));
    }
    let key = path;

    {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        if reg.contains_key(&key) {
            return Ok(());
        }
    }

    let repo_path = PathBuf::from(&key);
    if !repo_path.exists() {
        return Err(coded!(PathNotFound, path = key));
    }

    let emit_key = key.clone();
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let mut roots: Vec<PathBuf> = vec![repo_path.clone()];
    if let Ok(canonical) = repo_path.canonicalize() {
        if canonical != repo_path {
            roots.push(canonical);
        }
    }

    let (tx, rx) = channel();
    let mut debouncer = new_debouncer(Duration::from_millis(600), None, tx)
        .map_err(|e| format!("watcher init failed: {e}"))?;

    #[allow(unused_mut)]
    let mut shallow: HashSet<PathBuf> = HashSet::new();
    #[cfg(target_os = "macos")]
    {
        // ponytail: FSEvents streams are always recursive; notify emulates
        // NonRecursive by filtering, so split watches only multiply events.
        debouncer
            .watcher()
            .watch(&repo_path, RecursiveMode::Recursive)
            .map_err(|e| format!("watcher attach failed: {e}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        attach_dir(debouncer.watcher(), &roots, &repo_path, 0, &mut shallow);
        if shallow.is_empty() {
            return Err("watcher attach failed".into());
        }
        attach_git_dir(debouncer.watcher(), &repo_path);
    }

    let catalog_path = crate::git::repo_common_dir(&repo_path)
        .ok()
        .map(|common| common.join("worktrees"));
    let stamp = catalog_path.as_deref().map(catalog_stamp);
    let members = catalog_path
        .as_deref()
        .and_then(|path| catalog_members(path).ok());
    let catalog = catalog_path.map(|catalog| {
        let common = catalog.parent().expect("catalog has a common directory");
        let inside_root = roots.iter().any(|root| common.starts_with(root));
        let attach_catalog = !cfg!(target_os = "macos") || !inside_root;
        if attach_catalog {
            // Keep watching the parent when Git removes the last worktree
            // and later creates the catalog directory again.
            let already_watched =
                !cfg!(target_os = "macos") && roots.iter().any(|root| common == root.join(".git"));
            if !already_watched {
                let _ = debouncer
                    .watcher()
                    .watch(common, RecursiveMode::NonRecursive);
            }
            if catalog.is_dir() {
                let _ = debouncer
                    .watcher()
                    .watch(&catalog, RecursiveMode::Recursive);
            }
        }
        (catalog, attach_catalog)
    });

    std::thread::spawn(move || {
        let mut debouncer = debouncer;
        let mut shallow = shallow;
        let mut members = members;
        let mut stamp = stamp;
        let mut next_probe = Instant::now() + CATALOG_PROBE_INTERVAL;
        loop {
            if thread_stop.load(Ordering::Relaxed) {
                break;
            }
            let events = match rx.recv_timeout(POLL_INTERVAL) {
                Ok(Ok(events)) => events,
                Ok(Err(_)) | Err(RecvTimeoutError::Timeout) => Vec::new(),
                Err(RecvTimeoutError::Disconnected) => break,
            };
            let mut meaningful = false;
            let mut git_meta = false;
            let mut catalog_changed = false;
            for ev in &events {
                for p in &ev.paths {
                    if let Some((catalog_path, attach_catalog)) = &catalog {
                        if is_catalog_change(catalog_path, p, ev.kind) {
                            catalog_changed = true;
                            if *attach_catalog && p == catalog_path && catalog_path.is_dir() {
                                let _ = debouncer
                                    .watcher()
                                    .watch(catalog_path, RecursiveMode::Recursive);
                            }
                        }
                    }
                    if relative_to_roots(&roots, p).is_none() || is_ignored_path(&roots, p) {
                        continue;
                    }
                    meaningful = true;
                    if is_git_meta_path(&roots, p) {
                        git_meta = true;
                    }
                    if !matches!(ev.kind, EventKind::Create(_)) {
                        continue;
                    }
                    if !p.is_dir() {
                        continue;
                    }
                    let covered = p
                        .parent()
                        .and_then(|parent| relative_to_roots(&roots, parent))
                        .map(|rel| shallow.contains(rel))
                        .unwrap_or(false);
                    if !covered {
                        continue;
                    }
                    let Some(depth) = depth_from_root(&roots, p) else {
                        continue;
                    };
                    attach_dir(debouncer.watcher(), &roots, p, depth, &mut shallow);
                }
            }
            // Cover catalog membership updates that the filesystem watcher
            // coalesced away. In steady state this is at most one directory
            // stat per active watcher each interval and no renderer request.
            if let Some((path, attach_catalog)) = &catalog {
                let now = Instant::now();
                if now >= next_probe {
                    next_probe = now + CATALOG_PROBE_INTERVAL;
                    let next = Some(catalog_stamp(path));
                    if next != stamp {
                        catalog_changed = true;
                        if *attach_catalog && stamp == Some(Ok(None)) && path.is_dir() {
                            let _ = debouncer.watcher().watch(path, RecursiveMode::Recursive);
                        }
                    }
                    stamp = next;
                }
            }
            if let Some((path, _)) = catalog.as_ref().filter(|_| catalog_changed) {
                // One filesystem burst can arrive as multiple debounced batches.
                // Read only after a relevant event and emit when membership changes.
                let current = catalog_members(path).ok();
                if current.is_none() || current != members {
                    crate::sink::emit(WORKTREE_CATALOG_EVENT, &emit_key);
                }
                members = current;
            }
            if meaningful {
                crate::sink::emit("repo-changed", &emit_key);
            }
            if git_meta {
                crate::sink::emit("repo-git-changed", &emit_key);
            }
        }
    });

    registry()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(key, Entry { stop });

    Ok(())
}

#[tauri::command]
pub fn unwatch_repo(path: String) -> Result<(), String> {
    unwatch_repo_inner(path)
}

pub(crate) fn unwatch_repo_inner(path: String) -> Result<(), String> {
    let key = path;
    if let Ok(mut reg) = registry().lock() {
        reg.remove(&key);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_git_noise_but_keeps_index_and_refs() {
        let roots = vec![PathBuf::from("/r")];
        assert!(is_ignored_path(&roots, Path::new("/r/.git/index.lock")));
        assert!(is_ignored_path(&roots, Path::new("/r/.git/objects/ab/cd")));
        assert!(is_ignored_path(&roots, Path::new("/r/node_modules/x/y.js")));
        assert!(!is_ignored_path(&roots, Path::new("/r/.git/index")));
        assert!(!is_ignored_path(&roots, Path::new("/r/Cargo.lock")));
        assert!(!is_ignored_path(
            &roots,
            Path::new("/r/.git/refs/heads/main")
        ));
        assert!(!is_ignored_path(&roots, Path::new("/r/src/main.rs")));
    }

    #[test]
    fn git_meta_covers_refs_and_head_but_not_index_or_worktree() {
        let roots = vec![PathBuf::from("/r")];
        assert!(is_git_meta_path(&roots, Path::new("/r/.git/HEAD")));
        assert!(is_git_meta_path(
            &roots,
            Path::new("/r/.git/refs/heads/main")
        ));
        assert!(is_git_meta_path(&roots, Path::new("/r/.git/packed-refs")));
        assert!(!is_git_meta_path(&roots, Path::new("/r/.git/index")));
        assert!(!is_git_meta_path(&roots, Path::new("/r/.git")));
        assert!(!is_git_meta_path(&roots, Path::new("/r/src/main.rs")));
    }
}
