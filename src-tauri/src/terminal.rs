use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::{Channel, InvokeResponseBody};

const REPLAY_CAP: usize = 256 * 1024;

struct SharedInner {
    buffer: VecDeque<u8>,
    paused: bool,
    on_data: Channel<InvokeResponseBody>,
}

struct Shared {
    inner: Mutex<SharedInner>,
}

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    shared: Arc<Shared>,
}

static SESSIONS: Lazy<Mutex<HashMap<u64, Session>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(1));

fn next_session_id() -> u64 {
    let mut g = NEXT_ID.lock().unwrap();
    let id = *g;
    *g = g.saturating_add(1);
    id
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

const DEFAULT_CELL_WIDTH_PX: u16 = 9;
const DEFAULT_CELL_HEIGHT_PX: u16 = 17;

fn compute_pty_size(
    cols: Option<u16>,
    rows: Option<u16>,
    pixel_width: Option<u16>,
    pixel_height: Option<u16>,
) -> PtySize {
    let cols = cols.unwrap_or(80).max(1);
    let rows = rows.unwrap_or(24).max(1);
    let pixel_width = pixel_width
        .filter(|v| *v > 0)
        .unwrap_or_else(|| cols.saturating_mul(DEFAULT_CELL_WIDTH_PX));
    let pixel_height = pixel_height
        .filter(|v| *v > 0)
        .unwrap_or_else(|| rows.saturating_mul(DEFAULT_CELL_HEIGHT_PX));
    PtySize {
        rows,
        cols,
        pixel_width,
        pixel_height,
    }
}

#[tauri::command]
pub async fn terminal_open(
    path: String,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    pixel_width: Option<u16>,
    pixel_height: Option<u16>,
    on_data: Channel<InvokeResponseBody>,
    on_exit: Channel<InvokeResponseBody>,
) -> Result<u64, String> {
    let cwd = PathBuf::from(path.trim());
    if !cwd.is_dir() {
        return Err("Pfad ist kein Ordner.".into());
    }

    let pty_system = native_pty_system();
    let size = compute_pty_size(cols, rows, pixel_width, pixel_height);
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

    let shared = Arc::new(Shared {
        inner: Mutex::new(SharedInner {
            buffer: VecDeque::new(),
            paused: false,
            on_data,
        }),
    });

    SESSIONS.lock().unwrap().insert(
        session_id,
        Session {
            writer,
            master: pair.master,
            child,
            shared: shared.clone(),
        },
    );

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let mut inner = shared.inner.lock().unwrap();
                    inner.buffer.extend(&buf[..n]);
                    let overflow = inner.buffer.len().saturating_sub(REPLAY_CAP);
                    if overflow > 0 {
                        inner.buffer.drain(..overflow);
                    }
                    if !inner.paused
                        && inner
                            .on_data
                            .send(InvokeResponseBody::Raw(buf[..n].to_vec()))
                            .is_err()
                    {
                        break;
                    }
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

        let payload = serde_json::to_string(&exit_code).unwrap_or_else(|_| "null".to_string());
        let _ = on_exit.send(InvokeResponseBody::Json(payload));
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn terminal_write(session: u64, data: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().unwrap();
    let s = sessions
        .get_mut(&session)
        .ok_or_else(|| "Unbekannte Terminal-Sitzung.".to_string())?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(
    session: u64,
    cols: u16,
    rows: u16,
    pixel_width: Option<u16>,
    pixel_height: Option<u16>,
) -> Result<(), String> {
    let sessions = SESSIONS.lock().unwrap();
    let s = sessions
        .get(&session)
        .ok_or_else(|| "Unbekannte Terminal-Sitzung.".to_string())?;
    s.master
        .resize(compute_pty_size(
            Some(cols),
            Some(rows),
            pixel_width,
            pixel_height,
        ))
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

#[tauri::command]
pub async fn terminal_detach(session: u64) -> Result<(), String> {
    let shared = {
        let sessions = SESSIONS.lock().unwrap();
        sessions.get(&session).map(|s| s.shared.clone())
    };
    if let Some(shared) = shared {
        shared.inner.lock().unwrap().paused = true;
    }
    Ok(())
}

#[tauri::command]
pub async fn terminal_attach(session: u64) -> Result<(), String> {
    let shared = {
        let sessions = SESSIONS.lock().unwrap();
        sessions.get(&session).map(|s| s.shared.clone())
    };
    if let Some(shared) = shared {
        let mut inner = shared.inner.lock().unwrap();
        if !inner.buffer.is_empty() {
            let bytes: Vec<u8> = inner.buffer.iter().copied().collect();
            let _ = inner.on_data.send(InvokeResponseBody::Raw(bytes));
        }
        inner.paused = false;
    }
    Ok(())
}
