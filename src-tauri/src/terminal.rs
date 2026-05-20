use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use base64::Engine;
use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

static SESSIONS: Lazy<Mutex<HashMap<u64, Session>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(1));

fn next_session_id() -> u64 {
    let mut g = NEXT_ID.lock().unwrap();
    let id = *g;
    *g = g.saturating_add(1);
    id
}

#[derive(Serialize, Clone)]
struct TerminalDataEvent {
    session: u64,
    data: String,
}

#[derive(Serialize, Clone)]
struct TerminalExitEvent {
    session: u64,
    code: Option<i32>,
}

fn resolve_shell(preferred: Option<&str>) -> (String, Vec<String>) {
    if let Some(raw) = preferred {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let mut parts = trimmed.split_whitespace().map(String::from);
            if let Some(prog) = parts.next() {
                return (prog, parts.collect());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let from_env = |key: &str| std::env::var(key).ok().map(PathBuf::from);
        for base in [from_env("ProgramFiles"), from_env("ProgramFiles(x86)")] {
            if let Some(root) = base {
                let pwsh = root.join("PowerShell").join("7").join("pwsh.exe");
                if pwsh.is_file() {
                    return (pwsh.to_string_lossy().into_owned(), vec![]);
                }
            }
        }
        if let Ok(sysroot) = std::env::var("SystemRoot") {
            let powershell = PathBuf::from(sysroot)
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe");
            if powershell.is_file() {
                return (powershell.to_string_lossy().into_owned(), vec![]);
            }
        }
        return ("cmd.exe".to_string(), vec![]);
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(sh) = std::env::var("SHELL") {
            if !sh.trim().is_empty() {
                return (sh, vec!["-l".to_string()]);
            }
        }
        ("/bin/bash".to_string(), vec!["-l".to_string()])
    }
}

#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    path: String,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<u64, String> {
    let cwd = PathBuf::from(path.trim());
    if !cwd.is_dir() {
        return Err("Pfad ist kein Ordner.".into());
    }

    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let (prog, args) = resolve_shell(shell.as_deref());
    let mut cmd = CommandBuilder::new(prog);
    for a in args {
        cmd.arg(a);
    }
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    if let Ok(path_env) = std::env::var("PATH") {
        cmd.env("PATH", path_env);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let session_id = next_session_id();

    SESSIONS.lock().unwrap().insert(
        session_id,
        Session {
            writer,
            master: pair.master,
            child,
        },
    );

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let engine = base64::engine::general_purpose::STANDARD;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let encoded = engine.encode(&buf[..n]);
                    let _ = app_handle.emit(
                        "terminal:data",
                        TerminalDataEvent {
                            session: session_id,
                            data: encoded,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        let exit_code = {
            let mut sessions = SESSIONS.lock().unwrap();
            sessions
                .get_mut(&session_id)
                .and_then(|s| s.child.wait().ok())
                .map(|status| status.exit_code() as i32)
        };

        SESSIONS.lock().unwrap().remove(&session_id);

        let _ = app_handle.emit(
            "terminal:exit",
            TerminalExitEvent {
                session: session_id,
                code: exit_code,
            },
        );
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn terminal_write(session: u64, data: String) -> Result<(), String> {
    let engine = base64::engine::general_purpose::STANDARD;
    let bytes = engine.decode(data.as_bytes()).map_err(|e| e.to_string())?;
    let mut sessions = SESSIONS.lock().unwrap();
    let s = sessions
        .get_mut(&session)
        .ok_or_else(|| "Unbekannte Terminal-Sitzung.".to_string())?;
    s.writer.write_all(&bytes).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(session: u64, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = SESSIONS.lock().unwrap();
    let s = sessions
        .get(&session)
        .ok_or_else(|| "Unbekannte Terminal-Sitzung.".to_string())?;
    s.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_close(session: u64) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().unwrap();
    if let Some(mut s) = sessions.remove(&session) {
        let _ = s.child.kill();
    }
    Ok(())
}
