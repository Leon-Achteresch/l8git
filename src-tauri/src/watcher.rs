use crate::coded;
use crate::error::{required, Label};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use notify::event::{AccessKind, AccessMode, ModifyKind};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer_opt, Debouncer, FileIdCache, NoCache};

#[derive(Default)]
struct Registration {
    started: OnceLock<Result<(), String>>,
    stopped: Mutex<bool>,
}

fn registry() -> &'static Mutex<HashMap<String, Arc<Registration>>> {
    static REG: OnceLock<Mutex<HashMap<String, Arc<Registration>>>> = OnceLock::new();
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

// Status and diff reads can generate their own access events. Keep write-close
// notifications because some watchers use those to signal a completed save.
fn read_only_event(kind: EventKind) -> bool {
    matches!(
        kind,
        EventKind::Access(
            AccessKind::Read | AccessKind::Open(_) | AccessKind::Close(AccessMode::Read)
        )
    )
}

// The common directory holds linked checkout paths and lock state.
fn is_catalog_change(catalog: &Path, path: &Path, kind: EventKind) -> bool {
    if matches!(kind, EventKind::Access(_)) {
        return false;
    }
    let Ok(relative) = path.strip_prefix(catalog) else {
        return false;
    };
    match relative.components().count() {
        0 | 1 => true,
        2 => relative.file_name().is_some_and(|name| name == "gitdir" || name == "locked"),
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

#[derive(PartialEq, Eq)]
struct CatalogFile {
    modified: SystemTime,
    length: u64,
}

fn catalog_file(path: &Path) -> std::io::Result<Option<CatalogFile>> {
    match std::fs::metadata(path) {
        Ok(file) => Ok(Some(CatalogFile { modified: file.modified()?, length: file.len() })),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

type RegistrationFiles = (CatalogFile, Option<CatalogFile>);
type CatalogMember = (std::ffi::OsString, RegistrationFiles);

fn registration_files(path: &Path) -> std::io::Result<Option<RegistrationFiles>> {
    let Some(gitdir) = catalog_file(&path.join("gitdir"))? else {
        return Ok(None);
    };
    Ok(Some((gitdir, catalog_file(&path.join("locked"))?)))
}

fn catalog_snapshot(catalog: &Path) -> std::io::Result<Vec<CatalogMember>> {
    let mut members = Vec::new();
    let entries = match std::fs::read_dir(catalog) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(members),
        Err(error) => return Err(error),
    };
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            if let Some(files) = registration_files(&entry.path())? {
                members.push((entry.file_name(), files));
            }
        }
    }
    members.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    Ok(members)
}

// A move or lock can leave the catalog directory's own mtime unchanged.
// Bound the fallback I/O independently of how many linked checkouts exist.
fn registrations_changed(catalog: &Path, members: &[CatalogMember], cursor: &mut usize) -> bool {
    for _ in 0..members.len().min(16) {
        let index = *cursor % members.len();
        *cursor = index + 1;
        let (name, previous) = &members[index];
        match registration_files(&catalog.join(name)) {
            Ok(Some(current)) if current == *previous => {}
            _ => return true,
        }
    }
    false
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn depth_from_root(roots: &[PathBuf], path: &Path) -> Option<usize> {
    relative_to_roots(roots, path).map(|rel| rel.components().count())
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn attach_dir<W: Watcher, C: FileIdCache>(
    watcher: &mut Debouncer<W, C>,
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
fn attach_git_dir<W: Watcher, C: FileIdCache>(watcher: &mut Debouncer<W, C>, root: &Path) {
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
    let registration = registry().lock().map_err(|err| err.to_string())?
        .entry(path.clone()).or_default().clone();
    let result = registration.started.get_or_init(|| start_watcher(&path, registration.clone()));
    if result.is_err() {
        let mut registrations = registry().lock().map_err(|err| err.to_string())?;
        if registrations.get(&path).is_some_and(|entry| Arc::ptr_eq(entry, &registration)) {
            registrations.remove(&path);
        }
    }
    result.clone()
}

fn start_watcher(key: &str, registration: Arc<Registration>) -> Result<(), String> {
    let repo_path = PathBuf::from(key);
    if !repo_path.exists() {
        return Err(coded!(PathNotFound, path = key));
    }

    let emit_key = key.to_owned();
    let mut roots: Vec<PathBuf> = vec![repo_path.clone()];
    if let Ok(canonical) = repo_path.canonicalize() {
        if canonical != repo_path {
            roots.push(canonical);
        }
    }

    let (tx, rx) = channel();
    let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NoCache>(
        Duration::from_millis(600),
        None,
        tx,
        NoCache::new(),
        notify::Config::default(),
    )
        .map_err(|e| format!("watcher init failed: {e}"))?;

    #[allow(unused_mut)]
    let mut shallow: HashSet<PathBuf> = HashSet::new();
    #[cfg(target_os = "macos")]
    {
        // ponytail: FSEvents streams are always recursive; notify emulates
        // NonRecursive by filtering, so split watches only multiply events.
        debouncer
            .watch(&repo_path, RecursiveMode::Recursive)
            .map_err(|e| format!("watcher attach failed: {e}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        attach_dir(&mut debouncer, &roots, &repo_path, 0, &mut shallow);
        if shallow.is_empty() {
            return Err("watcher attach failed".into());
        }
        attach_git_dir(&mut debouncer, &repo_path);
    }

    let catalog_path = crate::git::repo_common_dir(&repo_path)
        .ok()
        .map(|common| common.join("worktrees"));
    let stamp = catalog_path.as_deref().map(catalog_stamp);
    let members = catalog_path
        .as_deref()
        .and_then(|path| catalog_snapshot(path).ok());
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
                    .watch(common, RecursiveMode::NonRecursive);
            }
            if catalog.is_dir() {
                let _ = debouncer
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
        let mut probe_cursor = 0;
        let mut next_probe = Instant::now() + CATALOG_PROBE_INTERVAL;
        loop {
            let events = match rx.recv_timeout(POLL_INTERVAL) {
                Ok(Ok(events)) => events,
                Ok(Err(_)) | Err(RecvTimeoutError::Timeout) => Vec::new(),
                Err(RecvTimeoutError::Disconnected) => break,
            };
            if *registration.stopped.lock().unwrap_or_else(|err| err.into_inner()) {
                break;
            }
            let mut meaningful = false;
            let mut git_meta = false;
            let mut catalog_changed = false;
            for ev in &events {
                if read_only_event(ev.kind) {
                    continue;
                }
                for p in &ev.paths {
                    if let Some((catalog_path, attach_catalog)) = &catalog {
                        if is_catalog_change(catalog_path, p, ev.kind) {
                            catalog_changed = true;
                            if *attach_catalog && p == catalog_path && catalog_path.is_dir() {
                                let _ = debouncer
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
                    if !matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(_))) {
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
                    attach_dir(&mut debouncer, &roots, p, depth, &mut shallow);
                }
            }
            // Recover coalesced events without spawning Git or notifying the
            // renderer until the catalog actually changes.
            if let Some((path, attach_catalog)) = &catalog {
                let now = Instant::now();
                if now >= next_probe {
                    next_probe = now + CATALOG_PROBE_INTERVAL;
                    let next = Some(catalog_stamp(path));
                    if next != stamp {
                        catalog_changed = true;
                        if *attach_catalog && stamp == Some(Ok(None)) && path.is_dir() {
                            let _ = debouncer.watch(path, RecursiveMode::Recursive);
                        }
                    }
                    if !catalog_changed {
                        catalog_changed = members.as_ref().is_none_or(|known| {
                            registrations_changed(path, known, &mut probe_cursor)
                        });
                    }
                    stamp = next;
                }
            }
            let notify_catalog = if let Some((path, _)) = catalog.as_ref().filter(|_| catalog_changed) {
                // One filesystem burst can arrive as multiple debounced batches.
                // Check membership, moves and lock changes once per relevant batch.
                let current = catalog_snapshot(path).ok();
                let changed = current != members;
                members = current;
                changed
            } else {
                false
            };
            if !notify_catalog && !meaningful && !git_meta {
                continue;
            }
            // Stop and publish are ordered for this registration only. A
            // replaced watcher cannot emit into a later visit to the same path.
            let stopped = registration.stopped.lock().unwrap_or_else(|err| err.into_inner());
            if *stopped {
                break;
            }
            if notify_catalog {
                crate::sink::emit(WORKTREE_CATALOG_EVENT, &emit_key);
            }
            if meaningful {
                crate::sink::emit("repo-changed", &emit_key);
            }
            if git_meta {
                crate::sink::emit("repo-git-changed", &emit_key);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn unwatch_repo(path: String) -> Result<(), String> {
    unwatch_repo_inner(path)
}

pub(crate) fn unwatch_repo_inner(path: String) -> Result<(), String> {
    let registration = registry().lock().map_err(|err| err.to_string())?.remove(&path);
    if let Some(registration) = registration {
        *registration.stopped.lock().unwrap_or_else(|err| err.into_inner()) = true;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_probe_checks_later_registrations_without_a_directory_change() {
        let root = std::env::temp_dir().join(format!("l8git-catalog-probe-{}", std::process::id()));
        std::fs::create_dir(&root).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        for index in 0..20 {
            let entry = root.join(format!("tree-{index:02}"));
            std::fs::create_dir(&entry).unwrap();
            std::fs::write(entry.join("gitdir"), "first location").unwrap();
        }
        let members = catalog_snapshot(&root).unwrap();
        let stamp = catalog_stamp(&root);
        std::fs::write(root.join("tree-19/gitdir"), "a different location").unwrap();
        assert_eq!(catalog_stamp(&root), stamp);
        let mut cursor = 0;
        assert!(!registrations_changed(&root, &members, &mut cursor));
        assert!(registrations_changed(&root, &members, &mut cursor));
        let refreshed = catalog_snapshot(&root).unwrap();
        assert!(!registrations_changed(&root, &refreshed, &mut cursor));
        assert!(!registrations_changed(&root, &[], &mut cursor));
    }

    #[test]
    fn native_reads_do_not_queue_refreshes_but_saves_do() {
        for kind in [
            AccessKind::Read,
            AccessKind::Open(AccessMode::Read),
            AccessKind::Close(AccessMode::Read),
        ] {
            assert!(read_only_event(EventKind::Access(kind)));
        }
        assert!(!read_only_event(EventKind::Access(AccessKind::Close(
            AccessMode::Write
        ))));
        assert!(!read_only_event(EventKind::Modify(ModifyKind::Any)));
    }

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
