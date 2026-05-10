use std::path::PathBuf;
use std::process::Command;

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
pub fn reveal_repo_folder(path: String) -> Result<(), String> {
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
        Err("Plattform nicht unterstützt.".into())
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
pub fn open_repo_terminal(path: String, use_git_bash: bool) -> Result<(), String> {
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
        Err("Plattform nicht unterstützt.".into())
    }
}

#[tauri::command]
pub fn open_repo_in_ide(path: String, ide_launch: String) -> Result<(), String> {
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

    let mut cmd = Command::new(&parts[0]);
    for a in &parts[1..] {
        cmd.arg(a);
    }
    cmd.arg(&repo);
    cmd.spawn()
        .map_err(|e| format!("IDE konnte nicht gestartet werden: {e}"))?;
    Ok(())
}
