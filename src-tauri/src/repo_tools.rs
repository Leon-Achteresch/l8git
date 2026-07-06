use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A single runnable action declared by a repo tool.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Action {
    pub label: String,
    /// Command line executed with cwd = repo root (whitespace-split into program + args).
    pub run: String,
    /// Ask for confirmation before running (destructive actions).
    #[serde(default)]
    pub confirm: bool,
}

/// A tool = a named group of actions, declared in `.l8git/tools.json`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Tool {
    pub name: String,
    /// Optional path (relative to repo root) that must exist for the tool to be runnable.
    #[serde(default)]
    pub requires: Option<String>,
    pub actions: Vec<Action>,
    /// Computed at read time: `requires` absent or the required file/dir exists.
    #[serde(default)]
    pub available: bool,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    #[allow(dead_code)]
    #[serde(default)]
    version: u32,
    #[serde(default)]
    tools: Vec<Tool>,
}

/// Read `<path>/.l8git/tools.json` and return the declared tools.
/// Missing manifest → empty list (repos without a manifest simply show nothing).
#[tauri::command]
pub fn list_repo_tools(path: String) -> Result<Vec<Tool>, String> {
    let repo = PathBuf::from(path.trim());
    let manifest_path = repo.join(".l8git").join("tools.json");
    let raw = match std::fs::read_to_string(&manifest_path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("{}: {e}", manifest_path.display())),
    };

    let manifest: Manifest = serde_json::from_str(&raw)
        .map_err(|e| format!(".l8git/tools.json ist ungültig: {e}"))?;

    let tools = manifest
        .tools
        .into_iter()
        .map(|mut t| {
            t.available = match &t.requires {
                Some(req) if !req.trim().is_empty() => repo.join(req.trim()).exists(),
                _ => true,
            };
            t
        })
        .collect();
    Ok(tools)
}
