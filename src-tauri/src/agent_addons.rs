use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::pathsafe::contained;

/// Wo eine CLI ihre MCP-Server im Repository erwartet.
/// Codex fehlt hier bewusst: dessen Konfiguration schreibt der App-Server
/// selbst (`mcp_servers.*` in der config.toml), siehe `capability-store.ts`.
const TARGETS: &[(&str, &str)] = &[
    ("claude", ".mcp.json"),
    ("cursor", ".cursor/mcp.json"),
    ("opencode", "opencode.json"),
];

/// Konfigurationsdateien bleiben klein; alles darüber ist ein Bedienfehler.
const MAX_CONFIG_BYTES: usize = 512 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonConfigFile {
    provider: String,
    file: String,
    exists: bool,
    contents: String,
}

fn target_file(path: &str, provider: &str) -> Result<PathBuf, String> {
    let relative = TARGETS
        .iter()
        .find(|(id, _)| *id == provider)
        .map(|(_, file)| *file)
        .ok_or_else(|| format!("Für {provider} wird die MCP-Konfiguration nicht als Datei verwaltet."))?;
    let repo = PathBuf::from(path.trim());
    if !repo.is_dir() {
        return Err("Arbeitsverzeichnis existiert nicht.".into());
    }
    let repo_canon = repo
        .canonicalize()
        .map_err(|error| format!("Ungültiges Arbeitsverzeichnis: {error}"))?;
    // `relative` ist eine Konstante ohne "..", der Pfad kann also nur über
    // einen Symlink aus dem Repository zeigen. Das prüfen wir, sobald die
    // Datei existiert — vorher gibt es nichts zu kanonisieren.
    let candidate = repo_canon.join(relative);
    if candidate.exists() {
        return contained(&repo_canon, &candidate);
    }
    Ok(candidate)
}

fn read_target(provider: String, file: &Path) -> Result<AddonConfigFile, String> {
    if fs::metadata(file).is_ok_and(|meta| meta.len() > MAX_CONFIG_BYTES as u64) {
        return Err("Die MCP-Konfiguration ist zu groß zum Bearbeiten.".into());
    }
    let (exists, contents) = match fs::read_to_string(file) {
        Ok(text) => (true, text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (false, String::new()),
        Err(error) => return Err(error.to_string()),
    };
    Ok(AddonConfigFile {
        provider,
        file: file.to_string_lossy().to_string(),
        exists,
        contents,
    })
}

/// Liest die MCP-Konfigurationsdatei einer CLI. Fehlt sie, kommt sie als
/// leerer Inhalt zurück — die Oberfläche legt sie beim Schreiben an.
#[tauri::command]
pub async fn agent_addon_config_read(
    path: String,
    provider: String,
) -> Result<AddonConfigFile, String> {
    tokio::task::spawn_blocking(move || {
        let file = target_file(&path, &provider)?;
        read_target(provider, &file)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Schreibt die MCP-Konfigurationsdatei einer CLI. Der Inhalt wird vorher als
/// JSON geprüft, damit ein Fehler in der Oberfläche keine kaputte Datei
/// hinterlässt.
#[tauri::command]
pub async fn agent_addon_config_write(
    path: String,
    provider: String,
    contents: String,
) -> Result<AddonConfigFile, String> {
    tokio::task::spawn_blocking(move || {
        if contents.len() > MAX_CONFIG_BYTES {
            return Err("Die MCP-Konfiguration ist zu groß zum Speichern.".into());
        }
        serde_json::from_str::<serde_json::Value>(&contents)
            .map_err(|error| format!("Ungültiges JSON: {error}"))?;
        let file = target_file(&path, &provider)?;
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(&file, contents).map_err(|error| error.to_string())?;
        read_target(provider, &file)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "l8git-addons-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn resolves_the_file_per_provider() {
        let repo = scratch("targets");
        assert!(target_file(repo.to_str().unwrap(), "claude")
            .unwrap()
            .ends_with(".mcp.json"));
        assert!(target_file(repo.to_str().unwrap(), "cursor")
            .unwrap()
            .ends_with("mcp.json"));
        assert!(target_file(repo.to_str().unwrap(), "opencode")
            .unwrap()
            .ends_with("opencode.json"));
        assert!(target_file(repo.to_str().unwrap(), "codex").is_err());
        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn reads_a_missing_file_as_empty() {
        let repo = scratch("missing");
        let file = target_file(repo.to_str().unwrap(), "claude").unwrap();
        let result = read_target("claude".into(), &file).unwrap();
        assert!(!result.exists);
        assert!(result.contents.is_empty());
        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn resolves_a_target_whose_directory_does_not_exist_yet() {
        let repo = scratch("nodir");
        let file = target_file(repo.to_str().unwrap(), "cursor").unwrap();
        assert!(!file.exists());
        assert!(file.starts_with(&repo));
        assert!(read_target("cursor".into(), &file).is_ok_and(|result| !result.exists));
        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn reads_back_what_was_written() {
        let repo = scratch("roundtrip");
        let file = target_file(repo.to_str().unwrap(), "cursor").unwrap();
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "{\n  \"mcpServers\": {}\n}\n").unwrap();
        let result = read_target("cursor".into(), &file).unwrap();
        assert!(result.exists);
        assert!(result.contents.contains("mcpServers"));
        let _ = fs::remove_dir_all(&repo);
    }
}
