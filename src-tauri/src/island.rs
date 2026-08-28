//! Standalone Dynamic Island window.
//!
//! The island normally lives as an overlay inside the main window. Detaching it
//! spawns a second, borderless always-on-top webview that renders the same UI on
//! its own, so the island stays usable while l8git itself is minimized. Both
//! webviews load the same bundle; the frontend branches on the window label.

use serde::Serialize;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

pub const ISLAND_LABEL: &str = "island";
const MAIN_LABEL: &str = "main";

const DEFAULT_WIDTH: f64 = 420.0;
const DEFAULT_HEIGHT: f64 = 220.0;
const MIN_WIDTH: f64 = 160.0;
const MIN_HEIGHT: f64 = 48.0;
const MAX_WIDTH: f64 = 1200.0;
const MAX_HEIGHT: f64 = 900.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandWindowState {
    pub open: bool,
    pub main_minimized: bool,
    pub main_visible: bool,
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

/// True when the point sits on a monitor that is attached right now.
///
/// The remembered position comes from local storage and can outlive the
/// display it was saved on. An island placed off screen would be unrecoverable:
/// it has no decorations, no taskbar entry and no visible surface to drag.
fn position_is_visible(app: &AppHandle, x: f64, y: f64) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        return false;
    };
    monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let origin = monitor.position().to_logical::<f64>(scale);
        let size = monitor.size().to_logical::<f64>(scale);
        x >= origin.x
            && y >= origin.y
            && x < origin.x + size.width
            && y < origin.y + size.height
    })
}

/// Creates the island window if it does not exist yet, otherwise shows it.
fn ensure_island(app: &AppHandle, position: Option<(f64, f64)>) -> Result<(), String> {
    let position = position.filter(|&(x, y)| position_is_visible(app, x, y));

    if let Some(window) = app.get_webview_window(ISLAND_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        if let Some((x, y)) = position {
            let _ = window.set_position(LogicalPosition::new(x, y));
        }
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(app, ISLAND_LABEL, WebviewUrl::default())
        .title("l8git Island")
        .inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        // Resizable so the frontend can size the window to the island as it
        // animates; without decorations there is no handle to drag anyway.
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true);

    if let Some((x, y)) = position {
        builder = builder.position(x, y);
    } else {
        builder = builder.center();
    }

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = window.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)));
    }
    // Keep the island above full-screen spaces on macOS instead of hiding behind them.
    #[cfg(target_os = "macos")]
    {
        let _ = window.set_visible_on_all_workspaces(true);
    }

    Ok(())
}

/// The island outlives nothing: when the main window goes away, so does it.
/// Without this a detached island would keep the process alive after l8git was
/// closed.
pub fn wire_lifecycle(app: &AppHandle) {
    let Some(main) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    let handle = app.clone();
    main.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Some(island) = handle.get_webview_window(ISLAND_LABEL) {
                let _ = island.close();
            }
        }
    });
}

fn window_state(app: &AppHandle) -> IslandWindowState {
    let open = app
        .get_webview_window(ISLAND_LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let main = app.get_webview_window(MAIN_LABEL);
    IslandWindowState {
        open,
        main_minimized: main
            .as_ref()
            .and_then(|w| w.is_minimized().ok())
            .unwrap_or(false),
        main_visible: main
            .as_ref()
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(true),
    }
}

#[tauri::command]
pub fn island_window_open(
    app: AppHandle,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<IslandWindowState, String> {
    let position = match (x, y) {
        (Some(x), Some(y)) => Some((x, y)),
        _ => None,
    };
    ensure_island(&app, position)?;
    Ok(window_state(&app))
}

#[tauri::command]
pub fn island_window_close(app: AppHandle) -> Result<IslandWindowState, String> {
    if let Some(window) = app.get_webview_window(ISLAND_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    // The window is destroyed asynchronously — report the state we are heading to.
    Ok(IslandWindowState {
        open: false,
        ..window_state(&app)
    })
}

#[tauri::command]
pub fn island_window_state(app: AppHandle) -> IslandWindowState {
    window_state(&app)
}

/// Resizes the island window to the natural size of its content.
#[tauri::command]
pub fn island_window_set_size(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let Some(window) = app.get_webview_window(ISLAND_LABEL) else {
        return Ok(());
    };
    window
        .set_size(LogicalSize::new(
            clamp(width, MIN_WIDTH, MAX_WIDTH),
            clamp(height, MIN_HEIGHT, MAX_HEIGHT),
        ))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn island_window_set_always_on_top(app: AppHandle, value: bool) -> Result<(), String> {
    let Some(window) = app.get_webview_window(ISLAND_LABEL) else {
        return Ok(());
    };
    window.set_always_on_top(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn main_window_minimize(app: AppHandle) -> Result<IslandWindowState, String> {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(window_state(&app))
}

#[tauri::command]
pub fn main_window_restore(app: AppHandle) -> Result<IslandWindowState, String> {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        window.unminimize().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(window_state(&app))
}

#[tauri::command]
pub fn main_window_toggle_minimize(app: AppHandle) -> Result<IslandWindowState, String> {
    // Hiding the application (Cmd+H on macOS) leaves the window neither
    // minimized nor visible, and minimizing it again would keep it away.
    let state = window_state(&app);
    if state.main_minimized || !state.main_visible {
        main_window_restore(app)
    } else {
        main_window_minimize(app)
    }
}

#[cfg(test)]
mod tests {
    use super::clamp;
    use super::{MAX_HEIGHT, MAX_WIDTH, MIN_HEIGHT, MIN_WIDTH};

    #[test]
    fn clamp_keeps_values_inside_bounds() {
        assert_eq!(clamp(10.0, MIN_WIDTH, MAX_WIDTH), MIN_WIDTH);
        assert_eq!(clamp(5000.0, MIN_WIDTH, MAX_WIDTH), MAX_WIDTH);
        assert_eq!(clamp(300.0, MIN_WIDTH, MAX_WIDTH), 300.0);
        assert_eq!(clamp(0.0, MIN_HEIGHT, MAX_HEIGHT), MIN_HEIGHT);
    }
}
