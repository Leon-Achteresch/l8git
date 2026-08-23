use std::io::Read;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

const DEFAULT_PORT: u16 = 8484;
const MISSING_BINARY: &str = "l8gitd nicht gefunden — mit `cargo build --features headless --bin l8gitd` bauen und in den PATH legen.";

static CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    #[serde(default)]
    roots: Vec<String>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    relay: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    running: bool,
    managed: bool,
    port: u16,
    relay: Option<String>,
    roots: Vec<String>,
    binary: Option<String>,
    config_path: Option<String>,
}

fn config_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or_else(|| "Kein Konfigurationsverzeichnis gefunden.".to_string())?;
    Ok(base.join("l8gitd").join("config.json"))
}

fn load() -> Config {
    config_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save(config: &Config) -> Result<(), String> {
    let path = config_path()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

fn listening(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok()
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "l8gitd.exe"
    } else {
        "l8gitd"
    }
}

fn binary() -> Option<PathBuf> {
    let name = binary_name();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(sibling) = exe.parent().map(|d| d.join(name)) {
            if sibling.is_file() {
                return Some(sibling);
            }
        }
    }
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

fn managed() -> bool {
    let mut guard = CHILD.lock().unwrap();
    match guard.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => true,
            _ => {
                *guard = None;
                false
            }
        },
        None => false,
    }
}

#[tauri::command]
pub fn remote_status() -> RemoteStatus {
    let config = load();
    let port = config.port.unwrap_or(DEFAULT_PORT);
    RemoteStatus {
        running: listening(port),
        managed: managed(),
        port,
        relay: config.relay,
        roots: config.roots,
        binary: binary().map(|p| p.display().to_string()),
        config_path: config_path().ok().map(|p| p.display().to_string()),
    }
}

#[tauri::command]
pub fn remote_set_config(port: u16, relay: Option<String>) -> Result<RemoteStatus, String> {
    if port == 0 {
        return Err("Ungültiger Port.".to_string());
    }
    let mut config = load();
    config.port = Some(port);
    config.relay = relay
        .map(|r| r.trim().to_string())
        .filter(|r| !r.is_empty());
    save(&config)?;
    Ok(remote_status())
}

#[tauri::command]
pub fn remote_start() -> Result<RemoteStatus, String> {
    let config = load();
    let port = config.port.unwrap_or(DEFAULT_PORT);
    if listening(port) {
        return Ok(remote_status());
    }
    let exe = binary().ok_or_else(|| MISSING_BINARY.to_string())?;
    let mut command = Command::new(&exe);
    command
        .arg("serve")
        .arg("--port")
        .arg(port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| format!("{}: {e}", exe.display()))?;

    for _ in 0..25 {
        if listening(port) {
            *CHILD.lock().unwrap() = Some(child);
            return Ok(remote_status());
        }
        if let Ok(Some(_)) = child.try_wait() {
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    let _ = child.kill();
    let mut message = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let _ = stderr.read_to_string(&mut message);
    }
    let _ = child.wait();
    let message = message.trim().to_string();
    Err(if message.is_empty() {
        format!("l8gitd konnte nicht auf Port {port} starten.")
    } else {
        message
    })
}

fn run_cli(args: &[&str]) -> Result<String, String> {
    let exe = binary().ok_or_else(|| MISSING_BINARY.to_string())?;
    let output = Command::new(&exe)
        .args(args)
        .output()
        .map_err(|e| format!("{}: {e}", exe.display()))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            format!("l8gitd {} fehlgeschlagen.", args.join(" "))
        } else {
            message
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pairing {
    qr: String,
    json: String,
}

#[tauri::command]
pub fn remote_pair() -> Result<Pairing, String> {
    let stdout = run_cli(&["pair"])?;
    let json = stdout
        .lines()
        .rev()
        .find(|line| line.trim_start().starts_with('{'))
        .ok_or_else(|| "Kein Pairing-JSON von l8gitd erhalten.".to_string())?
        .trim()
        .to_string();
    let qr = stdout.replace(&json, "").trim_matches('\n').to_string();
    Ok(Pairing { qr, json })
}

#[tauri::command]
pub fn remote_add_root(path: String) -> Result<RemoteStatus, String> {
    run_cli(&["allow", &path])?;
    Ok(remote_status())
}

#[tauri::command]
pub fn remote_remove_root(path: String) -> Result<RemoteStatus, String> {
    let mut config = load();
    config.roots.retain(|root| root != &path);
    save(&config)?;
    Ok(remote_status())
}

#[tauri::command]
pub fn remote_stop() -> Result<RemoteStatus, String> {
    let child = CHILD.lock().unwrap().take();
    match child {
        Some(mut child) => {
            let _ = child.kill();
            let _ = child.wait();
            Ok(remote_status())
        }
        None => Err("Der Server läuft nicht in dieser App — extern gestartete Prozesse müssen extern beendet werden.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::listening;
    use std::net::TcpListener;

    #[test]
    fn listening_detects_open_and_closed_ports() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(listening(port));
        drop(listener);
        assert!(!listening(port));
    }
}
