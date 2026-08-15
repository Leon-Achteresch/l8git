use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use notify::{EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;
use tauri::{AppHandle, Emitter};

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

const MAX_SPLIT_DEPTH: usize = 2;
const POLL_INTERVAL: Duration = Duration::from_millis(300);

fn is_ignored_dir_name(name: &str) -> bool {
    IGNORED_DIR_NAMES.iter().any(|d| d.eq_ignore_ascii_case(name))
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
        if is_ignored_dir_name(name) {
            return true;
        }
        in_git_dir = name == ".git";
    }
    false
}

fn depth_from_root(roots: &[PathBuf], path: &Path) -> Option<usize> {
    relative_to_roots(roots, path).map(|rel| rel.components().count())
}

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

fn attach_git_dir<W: Watcher>(watcher: &mut W, root: &Path) {
    let git_dir = root.join(".git");
    if !git_dir.is_dir() {
        return;
    }
    let _ = watcher.watch(&git_dir, RecursiveMode::NonRecursive);
    for sub in ["refs", "worktrees", "info"] {
        let p = git_dir.join(sub);
        if p.is_dir() {
            let _ = watcher.watch(&p, RecursiveMode::Recursive);
        }
    }
}

#[tauri::command]
pub fn watch_repo(app: AppHandle, path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Pfad darf nicht leer sein".into());
    }
    let key = trimmed.to_string();

    {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        if reg.contains_key(&key) {
            return Ok(());
        }
    }

    let repo_path = PathBuf::from(&key);
    if !repo_path.exists() {
        return Err(format!("Pfad existiert nicht: {key}"));
    }

    let emit_key = key.clone();
    let app_handle = app.clone();
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let mut roots: Vec<PathBuf> = vec![repo_path.clone()];
    if let Ok(canonical) = repo_path.canonicalize() {
        if canonical != repo_path {
            roots.push(canonical);
        }
    }

    let (tx, rx) = channel();
    let mut debouncer = new_debouncer(Duration::from_millis(250), None, tx)
        .map_err(|e| format!("watcher init failed: {e}"))?;

    let mut shallow: HashSet<PathBuf> = HashSet::new();
    attach_dir(debouncer.watcher(), &roots, &repo_path, 0, &mut shallow);
    if shallow.is_empty() {
        return Err("watcher attach failed".into());
    }
    attach_git_dir(debouncer.watcher(), &repo_path);

    std::thread::spawn(move || {
        let mut debouncer = debouncer;
        let mut shallow = shallow;
        loop {
            if thread_stop.load(Ordering::Relaxed) {
                break;
            }
            let events = match rx.recv_timeout(POLL_INTERVAL) {
                Ok(Ok(events)) => events,
                Ok(Err(_)) => continue,
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => break,
            };
            let mut meaningful = false;
            for ev in &events {
                for p in &ev.paths {
                    if is_ignored_path(&roots, p) {
                        continue;
                    }
                    meaningful = true;
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
            if meaningful {
                let _ = app_handle.emit("repo-changed", &emit_key);
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
    let key = path.trim().to_string();
    if let Ok(mut reg) = registry().lock() {
        reg.remove(&key);
    }
    Ok(())
}
