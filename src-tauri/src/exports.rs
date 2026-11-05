use std::path::PathBuf;
use base64::{engine::general_purpose::STANDARD, Engine};

const MAX_BINARY_EXPORT: usize = 64 * 1024 * 1024;

fn decode_export(encoded: &str, limit: usize) -> Result<Vec<u8>, String> {
    // Bound allocation before decoding untrusted renderer input.
    if encoded.len() > limit.div_ceil(3) * 4 {
        return Err("Binary export exceeds the 64 MiB download limit".into());
    }
    let bytes = STANDARD.decode(encoded).map_err(|error| format!("Invalid export encoding: {error}"))?;
    if bytes.len() > limit { return Err("Binary export exceeds the 64 MiB download limit".into()); }
    Ok(bytes)
}

fn write_binary_export(path: String, encoded: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !target.is_absolute() || target.file_name().is_none() {
        return Err("Choose an absolute export file path".into());
    }
    let bytes = decode_export(&encoded, MAX_BINARY_EXPORT)?;
    let parent = target.parent().ok_or("Missing export directory")?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
    let temporary = parent.join(format!(".l8git-download-{}-{stamp}", std::process::id()));
    let result = (|| {
        use std::io::Write;
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        let mut file = options.open(&temporary).map_err(|error| error.to_string())?;
        file.write_all(&bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        std::fs::rename(&temporary, &target).map_err(|error| error.to_string())
    })();
    if result.is_err() { let _ = std::fs::remove_file(temporary); }
    result
}

/// Saves a user-selected downloaded artifact atomically. No URLs or credentials accepted.
#[tauri::command]
pub async fn save_user_export_bytes(path: String, base64: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || write_binary_export(path, base64)).await.map_err(|error| error.to_string())?
}

/// A user-selected JSON export. Credentials never pass through this command.
#[tauri::command]
pub async fn save_user_export(path: String, contents: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let target = PathBuf::from(path);
        if target.extension().and_then(|e| e.to_str()) != Some("json") || contents.len() > 2_000_000 {
            return Err("Export must be a JSON file smaller than 2 MB".into());
        }
        serde_json::from_str::<serde_json::Value>(&contents).map_err(|e| e.to_string())?;
        let parent = target.parent().ok_or("Missing export directory")?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let tmp = parent.join(format!(".l8git-export-{}-{stamp}.json", std::process::id()));
        let result = (|| {
            use std::io::Write;
            let mut options = std::fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            let mut file = options.open(&tmp).map_err(|e| e.to_string())?;
            file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &target).map_err(|e| e.to_string())
        })();
        if result.is_err() { let _ = std::fs::remove_file(tmp); }
        result
    }).await.map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub struct RuntimeDiagnostics {
    os: &'static str,
    arch: &'static str,
    git_version: Option<String>,
}

#[tauri::command]
pub async fn runtime_diagnostics() -> Result<RuntimeDiagnostics, String> {
    tokio::task::spawn_blocking(|| {
        let git_version = crate::cmd::git_command().arg("--version").output().ok()
            .filter(|out| out.status.success())
            .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string());
        RuntimeDiagnostics { os: std::env::consts::OS, arch: std::env::consts::ARCH, git_version }
    }).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_export_bounds_decoded_bytes_and_rejects_invalid_input() {
        assert_eq!(decode_export("AAH/", 3).unwrap(), vec![0, 1, 255]);
        assert!(decode_export("AAH/", 2).is_err());
        assert!(decode_export("AAH/AA==", 3).is_err());
        assert!(decode_export("not base64!", 64).is_err());
        assert!(write_binary_export("relative.zip".into(), "AAH/".into()).is_err());
    }

    #[test]
    fn binary_export_preserves_bytes_and_leaves_no_temporary_file() {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let directory = std::env::temp_dir().join(format!("l8git-export-test-{}-{stamp}", std::process::id()));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("artifact.zip");
        let result = write_binary_export(path.to_string_lossy().into(), "UEsAAf8=".into());
        assert!(result.is_ok(), "{result:?}");
        assert_eq!(std::fs::read(&path).unwrap(), vec![80, 75, 0, 1, 255]);
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
