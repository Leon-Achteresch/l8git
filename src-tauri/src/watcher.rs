use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap};
use tauri::{AppHandle, Emitter};

// Per-repo watcher handle. Dropping the `Debouncer` stops the watcher thread.
struct Entry {
    _debouncer: Debouncer<notify::RecommendedWatcher, FileIdMap>,
}

fn registry() -> &'static Mutex<HashMap<String, Entry>> {
    static REG: OnceLock<Mutex<HashMap<String, Entry>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Start watching a repository for on-disk changes. Emits the
/// `repo-changed` event (payload: the repo path) whenever the working tree
/// or `.git/` metadata actually mutates. Paths inside `.git/objects` and
/// `.git/logs` are ignored because they fire on every fetch/gc without
/// meaningful UI impact.
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

    let mut debouncer = new_debouncer(
        Duration::from_millis(250),
        None,
        move |res: notify_debouncer_full::DebounceEventResult| {
            let events = match res {
                Ok(events) => events,
                Err(_) => return,
            };
            // Skip if every event is under .git/objects or .git/logs - those
            // fire on routine git internals and would spam the UI.
            let meaningful = events.iter().any(|ev| {
                ev.paths.iter().any(|p| {
                    let s = p.to_string_lossy();
                    !(s.contains("/.git/objects/")
                        || s.contains("\\.git\\objects\\")
                        || s.contains("/.git/logs/")
                        || s.contains("\\.git\\logs\\"))
                })
            });
            if !meaningful {
                return;
            }
            let _ = app_handle.emit("repo-changed", &emit_key);
        },
    )
    .map_err(|e| format!("watcher init failed: {e}"))?;

    debouncer
        .watcher()
        .watch(&repo_path, RecursiveMode::Recursive)
        .map_err(|e| format!("watcher attach failed: {e}"))?;

    registry()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(key, Entry { _debouncer: debouncer });

    let _ = app;
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
