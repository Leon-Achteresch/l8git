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
    let base =
        dirs::config_dir().ok_or_else(|| "Kein Konfigurationsverzeichnis gefunden.".to_string())?;
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

fn resolve_root(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("Pfad darf nicht leer sein.".into());
    }
    let resolved = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| format!("Pfad nicht auflösbar: {e}"))?;
    if !resolved.is_dir() {
        return Err("Pfad ist kein Ordner.".into());
    }
    Ok(resolved)
}

pub fn add_root(path: &str) -> Result<PathBuf, String> {
    let resolved = resolve_root(path)?;
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
        .map(PathBuf::from)
        .filter(|r| !r.as_os_str().is_empty())
        .collect()
}

fn is_path_key(key: &str) -> bool {
    let camel = super::dispatch::camel_case(key);
    PATH_ARG_KEYS.iter().any(|k| *k == camel)
}

pub fn check_path(allowed: &[PathBuf], raw: &str) -> Result<(), String> {
    if raw.is_empty() {
        return Ok(());
    }

    // `Path::is_absolute()` follows the host platform's path rules. On
    // Windows, however, a rooted POSIX-style path such as `/etc` is not
    // considered absolute because it has no drive prefix. Treat rooted and
    // drive-qualified paths consistently so a path cannot bypass the allowlist
    // merely by using the other platform's spelling.
    let candidate = Path::new(raw);
    let bytes = raw.as_bytes();
    let has_drive_prefix = bytes.len() >= 3 && bytes[1] == b':' && matches!(bytes[2], b'/' | b'\\');
    let is_absolute = candidate.is_absolute()
        || raw.starts_with('/')
        || raw.starts_with('\\')
        || has_drive_prefix;
    if !is_absolute {
        return Ok(());
    }
    if allowed.is_empty() {
        return Err(format!(
            "Kein Repo-Root freigegeben. `l8gitd allow <path>` ausführen (angefragt: {raw})"
        ));
    }
    for root in allowed {
        if crate::pathsafe::contained(root, candidate).is_ok() {
            return Ok(());
        }
    }
    Err(format!("Pfad ist nicht freigegeben: {raw}"))
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

fn root_path(base: &Path, raw: &str) -> PathBuf {
    // Git's `-C ""` leaves the working directory unchanged. Other relative
    // roots follow the daemon's cwd, without trimming valid filename bytes.
    if raw.is_empty() {
        base.to_path_buf()
    } else {
        base.join(raw)
    }
}

fn check_root_path(allowed: &[PathBuf], base: &Path, raw: &str) -> Result<(), String> {
    let candidate = root_path(base, raw);
    if allowed.is_empty() {
        return Err(format!(
            "Kein Repo-Root freigegeben. `l8gitd allow <path>` ausführen (angefragt: {raw})"
        ));
    }
    if allowed.iter().any(|root| crate::pathsafe::contained(root, &candidate).is_ok()) {
        return Ok(());
    }
    Err(format!("Pfad ist nicht freigegeben: {raw}"))
}

fn check_root_value(allowed: &[PathBuf], base: &Path, value: &Value) -> Result<(), String> {
    match value {
        Value::String(raw) => check_root_path(allowed, base, raw),
        Value::Array(items) => {
            for item in items {
                if let Value::String(raw) = item {
                    check_root_path(allowed, base, raw)?;
                }
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

/// Validate supplied repository/CWD arguments using their execution context.
/// Relative file arguments retain the generic `ensure_allowed` contract.
pub fn ensure_command_allowed(allowed: &[PathBuf], command: &str, args: &Value) -> Result<(), String> {
    let cwd = std::env::current_dir().map_err(|error| format!("Arbeitsverzeichnis nicht auflösbar: {error}"))?;
    ensure_command_allowed_from(allowed, command, args, &cwd)
}

fn ensure_command_allowed_from(
    allowed: &[PathBuf],
    command: &str,
    args: &Value,
    cwd: &Path,
) -> Result<(), String> {
    ensure_allowed(allowed, args)?;
    let Some(map) = args.as_object() else { return Ok(()); };
    let git_worktree = command.starts_with("git_worktree_");
    let worktree_base = map.get("path").and_then(Value::as_str).map(|raw| root_path(cwd, raw));
    for (key, value) in map {
        let key = super::dispatch::camel_case(key);
        if !PATH_ARG_KEYS.contains(&key.as_str()) && key != "repo" {
            continue;
        }
        let base = if git_worktree && matches!(key.as_str(), "worktreePath" | "newPath") {
            worktree_base.as_deref().ok_or_else(|| "Fehlendes Argument \"path\".".to_string())?
        } else {
            cwd
        };
        // PTY's explicitly empty cwd falls back to HOME rather than inheriting
        // the daemon cwd. Omitted cwd retains its separate launch contract.
        let pty_fallback = command == "pty_open" && key == "cwd" && value.as_str().is_some_and(|raw| {
            raw.is_empty() || (raw.trim().is_empty() && !root_path(cwd, raw).is_dir())
        });
        if pty_fallback {
            let fallback = dirs::home_dir().filter(|path| path.is_dir());
            check_root_path(allowed, fallback.as_deref().unwrap_or(cwd), "")?;
        } else {
            check_root_value(allowed, base, value)?;
        }
    }
    if command == "agent_transport_open" {
        if let Some(options) = map.get("options").and_then(Value::as_object) {
            let launch_base = options.get("cwd").and_then(Value::as_str).map(|raw| root_path(cwd, raw));
            for (key, value) in options {
                match super::dispatch::camel_case(key).as_str() {
                    "cwd" => check_root_value(allowed, cwd, value)?,
                    "addDirs" => check_root_value(allowed, launch_base.as_deref().unwrap_or(cwd), value)?,
                    _ => {}
                }
            }
        }
    }
    Ok(())
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
        assert!(
            ensure_allowed(&allowed, &json!({ "nested": [{ "cwd": "/private/tmp" }] })).is_err()
        );
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
        assert!(ensure_allowed(&allowed, &json!({ "options": { "add_dirs": ["/etc"] } })).is_err());
    }

    #[test]
    fn empty_allowlist_denies_absolute_paths_but_not_relative_ones() {
        assert!(ensure_allowed(&[], &json!({ "repoPath": "/tmp" })).is_err());
        assert!(ensure_allowed(&[], &json!({ "path": "src/lib.rs" })).is_ok());
        assert!(ensure_allowed(&[], &json!({ "message": "/tmp/not-a-path-arg" })).is_ok());
    }

    #[test]
    fn configured_roots_preserve_exact_path_strings() {
        let config = Config {
            roots: vec!["repo ".into(), "repo\n".into(), String::new()],
            ..Config::default()
        };
        assert_eq!(
            roots(&config),
            vec![PathBuf::from("repo "), PathBuf::from("repo\n")]
        );
    }

    #[cfg(unix)]
    #[test]
    fn allowing_whitespace_suffixed_roots_does_not_allow_their_neighbors() {
        let root = scratch("exact-allowed");
        for suffix in [" ", "\n"] {
            let exact = root.join(format!("repo{suffix}"));
            std::fs::create_dir_all(exact.join("src")).unwrap();
            let config = Config {
                roots: vec![exact.to_str().unwrap().into()],
                ..Config::default()
            };
            let allowed = roots(&config);
            assert!(ensure_allowed(
                &allowed,
                &json!({
                    "repoPath": exact.to_str().unwrap(),
                    "options": { "cwd": exact.join("src").to_str().unwrap() },
                    "dest": exact.join("new-worktree").to_str().unwrap()
                })
            )
            .is_ok());
            assert!(ensure_allowed(
                &allowed,
                &json!({ "repoPath": root.join("repo").to_str().unwrap() })
            )
            .is_err());
            assert!(ensure_allowed(
                &allowed,
                &json!({ "nested": [{ "base_path": root.join("repo").to_str().unwrap() }] })
            )
            .is_err());
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn allowing_plain_roots_does_not_allow_whitespace_suffixed_neighbors() {
        let root = scratch("exact-denied");
        let allowed = vec![root.join("repo")];
        for suffix in [" ", "\n"] {
            let outside = root.join(format!("repo{suffix}"));
            std::fs::create_dir_all(outside.join("src")).unwrap();
            assert!(
                ensure_allowed(&allowed, &json!({ "repoPath": outside.to_str().unwrap() }))
                    .is_err()
            );
            assert!(ensure_allowed(
                &allowed,
                &json!({ "paths": [root.join("repo").to_str().unwrap(), outside.to_str().unwrap()] })
            )
            .is_err());
            assert!(ensure_allowed(
                &allowed,
                &json!({ "nested": { "worktree_path": outside.join("src").to_str().unwrap() } })
            )
            .is_err());
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn root_registration_resolves_the_exact_directory_without_trimming() {
        let root = scratch("exact-register");
        for suffix in [" ", "\n"] {
            let exact = root.join(format!("repo{suffix}"));
            std::fs::create_dir_all(&exact).unwrap();
            assert_eq!(resolve_root(exact.to_str().unwrap()).unwrap(), exact);
            assert_ne!(exact, root.join("repo"));
        }
        assert!(resolve_root("").is_err());
        let file = root.join("file ");
        std::fs::write(&file, b"not a directory").unwrap();
        assert!(resolve_root(file.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn relative_path_allowlist_contract_preserves_whitespace() {
        for raw in ["", "src/lib.rs", "relative repo ", "relative repo\n", " "] {
            assert!(check_path(&[], raw).is_ok(), "{raw:?}");
            assert!(ensure_allowed(&[], &json!({ "repoPath": raw })).is_ok());
        }
    }

    #[test]
    fn command_roots_match_real_git_relative_and_empty_directory_resolution() {
        let root = scratch("command-git-cwd");
        let daemon = root.join("daemon");
        std::fs::create_dir_all(&daemon).unwrap();
        for repo in [&daemon, &root.join("repo")] {
            let output = std::process::Command::new("git").args(["init", "-q"])
                .arg(repo).output().unwrap();
            assert!(output.status.success());
        }
        std::fs::write(daemon.join("outside-only.txt"), b"scratch only\n").unwrap();
        std::fs::write(root.join("repo/allowed-only.txt"), b"scratch only\n").unwrap();
        let allowed = vec![root.join("repo")];
        for raw in ["", "."] {
            let read = std::process::Command::new("git").current_dir(&daemon)
                .args(["-C", raw, "status", "--porcelain"]).output().unwrap();
            assert!(read.status.success());
            assert!(String::from_utf8_lossy(&read.stdout).contains("outside-only.txt"));
            assert!(ensure_command_allowed_from(&allowed, "repo_status", &json!({ "path": raw }), &daemon).is_err());
            assert!(ensure_command_allowed_from(&[], "open_repo", &json!({ "path": raw }), &daemon).is_err());
        }
        let relative = "../repo";
        let read = std::process::Command::new("git").current_dir(&daemon)
            .args(["-C", relative, "status", "--porcelain"]).output().unwrap();
        assert!(read.status.success());
        assert!(String::from_utf8_lossy(&read.stdout).contains("allowed-only.txt"));
        assert!(ensure_command_allowed_from(&allowed, "repo_status", &json!({ "path": relative }), &daemon).is_ok());
        assert!(ensure_command_allowed_from(&allowed, "open_repo", &json!({ "path": "../daemon" }), &daemon).is_err());
        assert!(ensure_command_allowed_from(&allowed, "open_repo", &json!({ "path": "" }), &root.join("repo")).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn command_roots_validate_aliases_arrays_and_preserve_relative_file_arguments() {
        let root = scratch("command-aliases");
        let daemon = root.join("daemon");
        std::fs::create_dir_all(&daemon).unwrap();
        let allowed = vec![root.join("repo")];
        for key in ["path", "repoPath", "repo_path", "repo", "basePath", "base_path", "worktreePath", "worktree_path", "cwd", "dir", "directory"] {
            assert!(ensure_command_allowed_from(&allowed, "agent_review_summary", &json!({ key: "../repo" }), &daemon).is_ok(), "{key}");
            assert!(ensure_command_allowed_from(&allowed, "agent_review_summary", &json!({ key: "../daemon" }), &daemon).is_err(), "{key}");
        }
        for key in ["paths", "repoPaths", "repo_paths"] {
            assert!(ensure_command_allowed_from(&allowed, "repos_overview", &json!({ key: ["../repo", "../repo/src"] }), &daemon).is_ok());
            assert!(ensure_command_allowed_from(&allowed, "repos_overview", &json!({ key: ["../repo", "."] }), &daemon).is_err());
        }
        assert!(ensure_command_allowed_from(&allowed, "repo_read_file", &json!({
            "path": "../repo", "file": "src/main.rs", "filePath": "src/main.rs",
            "payload": { "path": "src/main.rs" }
        }), &daemon).is_ok());
        assert!(ensure_allowed(&[], &json!({ "path": "src/main.rs" })).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn worktree_relative_targets_follow_the_supplied_git_c_directory() {
        let root = scratch("command-worktree-base");
        let daemon = root.join("daemon");
        std::fs::create_dir_all(&daemon).unwrap();
        std::fs::create_dir_all(root.join("repo/src/existing-worktree")).unwrap();
        let allowed = vec![root.join("repo")];
        for command in ["git_worktree_add", "git_worktree_remove", "git_worktree_remove_checked", "git_worktree_lock", "git_worktree_unlock", "git_worktree_move"] {
            assert!(ensure_command_allowed_from(&allowed, command, &json!({
                "path": "../repo/src", "worktree_path": "existing-worktree", "newPath": "new-worktree"
            }), &daemon).is_ok(), "{command}");
            assert!(ensure_command_allowed_from(&allowed, command, &json!({
                "path": "../repo/src", "worktreePath": "../.."
            }), &daemon).is_err(), "{command}");
        }
        assert!(ensure_command_allowed_from(&allowed, "agent_review_summary", &json!({
            "basePath": "../repo", "worktreePath": "existing-worktree"
        }), &daemon).is_err());
        assert!(ensure_command_allowed_from(&allowed, "git_clone", &json!({ "dest": "../repo/clone" }), &daemon).is_ok());
        assert!(ensure_command_allowed_from(&allowed, "git_clone", &json!({ "dest": "../daemon/clone" }), &daemon).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn declared_agent_option_roots_are_checked_in_their_launch_context() {
        let root = scratch("command-options");
        let daemon = root.join("daemon");
        std::fs::create_dir_all(&daemon).unwrap();
        let allowed = vec![root.join("repo")];
        assert!(ensure_command_allowed_from(&allowed, "agent_transport_open", &json!({
            "options": { "cwd": "../repo", "add_dirs": ["src"] }
        }), &daemon).is_ok());
        assert!(ensure_command_allowed_from(&allowed, "agent_transport_open", &json!({
            "options": { "cwd": "../repo", "addDirs": ["../daemon"] }
        }), &daemon).is_err());
        assert!(ensure_command_allowed_from(&allowed, "agent_transport_open", &json!({
            "options": { "cwd": "." }
        }), &daemon).is_err());
        // Omitted default launch permissions remain separate from supplied roots.
        assert!(ensure_command_allowed_from(&[], "pty_open", &json!({}), &daemon).is_ok());
        assert!(ensure_command_allowed_from(&[], "opencode_cli", &json!({ "cwd": null }), &daemon).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn command_root_checks_preserve_whitespace_and_resolve_symlink_escapes() {
        use std::os::unix::fs::symlink;
        let root = scratch("command-exact");
        let daemon = root.join("daemon");
        std::fs::create_dir_all(&daemon).unwrap();
        for suffix in [" ", "\n"] {
            let exact = root.join(format!("repo{suffix}"));
            std::fs::create_dir_all(&exact).unwrap();
            let allowed = vec![exact];
            assert!(ensure_command_allowed_from(&allowed, "open_repo", &json!({ "path": format!("../repo{suffix}") }), &daemon).is_ok());
            assert!(ensure_command_allowed_from(&allowed, "open_repo", &json!({ "path": "../repo" }), &daemon).is_err());
        }
        symlink(&daemon, root.join("repo/escape")).unwrap();
        assert!(ensure_command_allowed_from(&[root.join("repo")], "repo_status", &json!({ "path": "../repo/escape" }), &daemon).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
