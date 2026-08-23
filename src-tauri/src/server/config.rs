use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_PORT: u16 = 8484;

pub const PATH_ARG_KEYS: &[&str] = &[
    "path",
    "paths",
    "repoPath",
    "repoPaths",
    "repoRoot",
    "rootPath",
    "basePath",
    "cwd",
    "dir",
    "directory",
    "worktree",
    "worktreePath",
    "addDirs",
    "targetPath",
    "destPath",
    "dest",
    "newPath",
    "destination",
];

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub roots: Vec<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub relay: Option<String>,
}

pub fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or_else(|| "Kein Konfigurationsverzeichnis gefunden.".to_string())?;
    Ok(base.join("l8gitd"))
}

pub fn config_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("config.json"))
}

pub fn load() -> Config {
    let Ok(path) = config_path() else {
        return Config::default();
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Config::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save(config: &Config) -> Result<(), String> {
    let dir = config_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Konfiguration nicht schreibbar: {e}"))?;
    let path = dir.join("config.json");
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| format!("Konfiguration nicht schreibbar: {e}"))
}

pub fn add_root(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Pfad darf nicht leer sein.".into());
    }
    let resolved = PathBuf::from(trimmed)
        .canonicalize()
        .map_err(|e| format!("Pfad nicht auflösbar: {e}"))?;
    if !resolved.is_dir() {
        return Err("Pfad ist kein Ordner.".into());
    }
    let mut config = load();
    let entry = resolved.to_string_lossy().to_string();
    if !config.roots.iter().any(|r| r == &entry) {
        config.roots.push(entry);
        save(&config)?;
    }
    Ok(resolved)
}

pub fn roots(config: &Config) -> Vec<PathBuf> {
    config
        .roots
        .iter()
        .map(|r| PathBuf::from(r.trim()))
        .filter(|r| !r.as_os_str().is_empty())
        .collect()
}

fn is_path_key(key: &str) -> bool {
    let camel = super::dispatch::camel_case(key);
    PATH_ARG_KEYS.iter().any(|k| *k == camel)
}

pub fn check_path(allowed: &[PathBuf], raw: &str) -> Result<(), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let candidate = Path::new(trimmed);
    if !candidate.is_absolute() {
        return Ok(());
    }
    if allowed.is_empty() {
        return Err(format!(
            "Kein Repo-Root freigegeben. `l8gitd allow <path>` ausführen (angefragt: {trimmed})"
        ));
    }
    for root in allowed {
        if crate::pathsafe::contained(root, candidate).is_ok() {
            return Ok(());
        }
    }
    Err(format!("Pfad ist nicht freigegeben: {trimmed}"))
}

pub fn ensure_allowed(allowed: &[PathBuf], args: &Value) -> Result<(), String> {
    match args {
        Value::Object(map) => {
            for (key, value) in map {
                if is_path_key(key) {
                    match value {
                        Value::String(raw) => check_path(allowed, raw)?,
                        Value::Array(items) => {
                            for item in items {
                                if let Value::String(raw) = item {
                                    check_path(allowed, raw)?;
                                }
                            }
                        }
                        _ => {}
                    }
                }
                ensure_allowed(allowed, value)?;
            }
            Ok(())
        }
        Value::Array(items) => {
            for item in items {
                ensure_allowed(allowed, item)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "l8gitd-allow-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join("repo/src")).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn allows_paths_inside_registered_roots() {
        let root = scratch("inside");
        let allowed = vec![root.join("repo")];
        let args = json!({
            "repoPath": root.join("repo").to_string_lossy(),
            "path": "src/main.rs",
            "options": { "cwd": root.join("repo/src").to_string_lossy() }
        });
        assert!(ensure_allowed(&allowed, &args).is_ok());
    }

    #[test]
    fn rejects_absolute_paths_outside_roots_and_nested_escapes() {
        let root = scratch("outside");
        let allowed = vec![root.join("repo")];
        assert!(ensure_allowed(&allowed, &json!({ "repoPath": "/etc" })).is_err());
        assert!(ensure_allowed(
            &allowed,
            &json!({ "nested": [{ "cwd": "/private/tmp" }] })
        )
        .is_err());
        assert!(ensure_allowed(
            &allowed,
            &json!({ "repoPath": root.join("repo/../").to_string_lossy() })
        )
        .is_err());
    }

    #[test]
    fn path_arrays_are_checked_element_by_element() {
        let root = scratch("array");
        let allowed = vec![root.join("repo")];
        let inside = root.join("repo").to_string_lossy().into_owned();
        assert!(ensure_allowed(&allowed, &json!({ "paths": [inside.clone()] })).is_ok());
        assert!(ensure_allowed(&allowed, &json!({ "paths": [inside, "/etc"] })).is_err());
        assert!(ensure_allowed(&allowed, &json!({ "paths": ["relative/repo"] })).is_ok());
    }

    #[test]
    fn clone_and_worktree_move_destinations_are_guarded() {
        let root = scratch("dest");
        let allowed = vec![root.join("repo")];
        assert!(ensure_allowed(&allowed, &json!({ "dest": "/tmp/anywhere" })).is_err());
        assert!(ensure_allowed(&allowed, &json!({ "newPath": "/tmp/anywhere" })).is_err());
        assert!(ensure_allowed(&allowed, &json!({ "basePath": "/tmp/anywhere" })).is_err());
        assert!(ensure_allowed(
            &allowed,
            &json!({ "dest": root.join("repo/clone").to_string_lossy() })
        )
        .is_ok());
    }

    #[test]
    fn extra_agent_directories_are_guarded_like_every_other_path_argument() {
        let root = scratch("adddirs");
        let allowed = vec![root.join("repo")];
        let inside = root.join("repo/src").to_string_lossy().into_owned();
        assert!(ensure_allowed(&allowed, &json!({ "options": { "addDirs": [inside] } })).is_ok());
        assert!(ensure_allowed(
            &allowed,
            &json!({ "options": { "addDirs": ["/etc", "/tmp"] } })
        )
        .is_err());
        assert!(ensure_allowed(
            &allowed,
            &json!({ "options": { "add_dirs": ["/etc"] } })
        )
        .is_err());
    }

    #[test]
    fn empty_allowlist_denies_absolute_paths_but_not_relative_ones() {
        assert!(ensure_allowed(&[], &json!({ "repoPath": "/tmp" })).is_err());
        assert!(ensure_allowed(&[], &json!({ "path": "src/lib.rs" })).is_ok());
        assert!(ensure_allowed(&[], &json!({ "message": "/tmp/not-a-path-arg" })).is_ok());
    }
}
