use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn escape_applescript_string(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '\\' => o.push_str("\\\\"),
            '"' => o.push_str("\\\""),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            _ => o.push(c),
        }
    }
    o.push('"');
    o
}

#[tauri::command]
pub async fn reveal_repo_folder(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || _reveal_repo_folder(path))
        .await
        .map_err(|e| e.to_string())?
}

fn _reveal_repo_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if !p.is_dir() {
        return Err("Pfad ist kein Ordner.".into());
    }

    #[cfg(target_os = "macos")]
    {
        let st = Command::new("open")
            .arg(&p)
            .status()
            .map_err(|e| format!("{e}"))?;
        if !st.success() {
            return Err("Ordner konnte nicht geöffnet werden.".into());
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        let st = Command::new("explorer")
            .arg(&p)
            .status()
            .map_err(|e| format!("{e}"))?;
        if !st.success() {
            return Err("Ordner konnte nicht geöffnet werden.".into());
        }
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let st = Command::new("xdg-open")
            .arg(&p)
            .status()
            .map_err(|e| format!("{e}"))?;
        if !st.success() {
            return Err("Ordner konnte nicht geöffnet werden.".into());
        }
        return Ok(());
    }

    #[cfg(not(any(
        target_os = "macos",
        target_os = "windows",
        all(unix, not(target_os = "macos"))
    )))]
    {
        Err("Platform not supported.".into())
    }
}

#[cfg(target_os = "windows")]
fn windows_git_bash_path() -> Option<PathBuf> {
    let from_env = |key: &str| std::env::var(key).ok().map(PathBuf::from);
    for base in [from_env("ProgramFiles"), from_env("ProgramFiles(x86)")] {
        if let Some(root) = base {
            let exe = root.join("Git").join("git-bash.exe");
            if exe.is_file() {
                return Some(exe);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn open_repo_terminal(path: String, use_git_bash: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || _open_repo_terminal(path, use_git_bash))
        .await
        .map_err(|e| e.to_string())?
}

fn _open_repo_terminal(path: String, use_git_bash: bool) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if !p.is_dir() {
        return Err("Pfad ist kein Ordner.".into());
    }

    #[cfg(target_os = "macos")]
    {
        let _ = use_git_bash;
        let canon = p.canonicalize().map_err(|e| format!("{e}"))?;
        let ps = canon.to_string_lossy();
        let lit = escape_applescript_string(&ps);
        let script = format!(
            "tell application \"Terminal\"\nactivate\ndo script (\"cd \" & quoted form of {})\nend tell",
            lit
        );
        let st = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map_err(|e| format!("{e}"))?;
        if !st.success() {
            return Err("Terminal konnte nicht geöffnet werden.".into());
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        if use_git_bash {
            if let Some(git_bash) = windows_git_bash_path() {
                Command::new(&git_bash)
                    .current_dir(&p)
                    .spawn()
                    .map_err(|e| format!("Git Bash konnte nicht gestartet werden: {e}"))?;
                return Ok(());
            }
            return Err(
                "Git Bash nicht gefunden (erwartet unter Programme\\Git, Git for Windows).".into(),
            );
        }
        let wd = p.to_string_lossy();
        if Command::new("wt")
            .args(["-d", wd.as_ref()])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        Command::new("cmd")
            .args(["/C", "start", "", "cmd"])
            .current_dir(&p)
            .spawn()
            .map_err(|e| format!("{e}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = use_git_bash;
        let wd = p.to_string_lossy().into_owned();
        if Command::new("x-terminal-emulator")
            .current_dir(&p)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        if Command::new("gnome-terminal")
            .current_dir(&p)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        if Command::new("konsole")
            .args(["--workdir", &wd])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        if Command::new("alacritty")
            .args(["--working-directory", &wd])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        if Command::new("kitty")
            .args(["--directory", &wd])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        if Command::new("xfce4-terminal")
            .arg(format!("--working-directory={wd}"))
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        Command::new("xterm")
            .current_dir(&p)
            .spawn()
            .map_err(|e| format!("Konnte kein Terminal starten: {e}"))?;
        return Ok(());
    }

    #[cfg(not(any(
        target_os = "macos",
        target_os = "windows",
        all(unix, not(target_os = "macos"))
    )))]
    {
        let _ = use_git_bash;
        Err("Platform not supported.".into())
    }
}

/// Persists a clipboard image to a temp file so it can be handed to a program
/// running in the embedded terminal (Claude Code recognises image file paths,
/// but not raw clipboard bytes on Windows). Returns the absolute path.
#[tauri::command]
pub async fn save_clipboard_image(
    bytes: Vec<u8>,
    ext: String,
    name: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || _save_clipboard_image(bytes, ext, name))
        .await
        .map_err(|e| e.to_string())?
}

fn _save_clipboard_image(bytes: Vec<u8>, ext: String, name: Option<String>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("Leeres Bild.".into());
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut dir = std::env::temp_dir();
    dir.push("l8git-clip");
    let file_name = match name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(|n| {
            n.chars()
                .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') { c } else { '_' })
                .collect::<String>()
        }) {
        Some(safe) => {
            dir.push(format!("{nanos}"));
            safe
        }
        None => {
            let ext = match ext.trim().to_ascii_lowercase().as_str() {
                "jpg" | "jpeg" => "jpg",
                "gif" => "gif",
                "webp" => "webp",
                _ => "png",
            };
            format!("clip-{nanos}.{ext}")
        }
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("{e}"))?;
    dir.push(file_name);
    std::fs::write(&dir, &bytes).map_err(|e| format!("{e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(target_os = "windows")]
pub(crate) fn resolve_cli_path(name: &str) -> Option<PathBuf> {
    let exts: Vec<String> = std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
        .split(';')
        .map(|e| e.trim().to_ascii_lowercase())
        .filter(|e| !e.is_empty())
        .collect();
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    // Wird die App aus einer IDE oder einem verkuerzten Environment gestartet,
    // fehlen die npm-/bun-Bin-Verzeichnisse im PATH; die CLIs liegen trotzdem
    // an den ueblichen Installationsorten.
    if let Some(profile) = std::env::var_os("USERPROFILE").map(PathBuf::from) {
        dirs.push(profile.join(".bun/bin"));
        dirs.push(profile.join(".local/bin"));
        dirs.push(profile.join(".opencode/bin"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        dirs.push(appdata.join("npm"));
    }
    for dir in dirs {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn resolve_cli_path(name: &str) -> Option<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    // GUI-Apps bekommen auf macOS/Linux nur einen minimalen PATH; die üblichen
    // CLI-Installationsorte zusätzlich prüfen.
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".bun/bin"));
        dirs.push(home.join(".npm-global/bin"));
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    for dir in dirs {
        let p = dir.join(name);
        if let Ok(md) = p.metadata() {
            if md.is_file() && md.permissions().mode() & 0o111 != 0 {
                return Some(p);
            }
        }
    }
    None
}

pub(crate) fn cli_in_path(name: &str) -> bool {
    resolve_cli_path(name).is_some()
}

/// Returns the subset of `commands` that resolve to an executable on this
/// machine (PATH lookup, no processes spawned).
#[tauri::command]
pub async fn detect_clis(commands: Vec<String>) -> Vec<String> {
    tokio::task::spawn_blocking(move || {
        commands
            .into_iter()
            .filter(|c| !c.trim().is_empty() && cli_in_path(c.trim()))
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn open_repo_in_ide(path: String, ide_launch: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || _open_repo_in_ide(path, ide_launch))
        .await
        .map_err(|e| e.to_string())?
}

fn _open_repo_in_ide(path: String, ide_launch: String) -> Result<(), String> {
    let raw = ide_launch.trim();
    if raw.is_empty() {
        return Err("Keine IDE konfiguriert (Einstellungen).".into());
    }
    let repo = PathBuf::from(path.trim());
    if !repo.is_dir() {
        return Err("Repository-Pfad ungültig.".into());
    }

    let parts: Vec<String> = raw
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();
    if parts.is_empty() {
        return Err("Keine IDE konfiguriert.".into());
    }

    // `code`/`cursor` sind auf Windows .cmd-Shims: ohne CREATE_NO_WINDOW blitzt eine Konsole auf.
    let mut cmd = crate::cmd::cli_command(&parts[0]);
    for a in &parts[1..] {
        cmd.arg(a);
    }
    cmd.arg(&repo);
    cmd.spawn()
        .map_err(|e| format!("IDE konnte nicht gestartet werden: {e}"))?;
    Ok(())
}
