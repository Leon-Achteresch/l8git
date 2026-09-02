use std::sync::atomic::{AtomicU32, Ordering};

#[cfg(target_os = "macos")]
use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);


pub fn open_new_window(app: &AppHandle) -> Result<(), String> {
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or("missing main window config")?
        .clone();

    let id = WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed);
    config.label = format!("window-{id}");

    let window = WebviewWindowBuilder::from_config(app, &config)
        .map_err(|err| err.to_string())?
        .build()
        .map_err(|err| err.to_string())?;

    #[cfg(target_os = "macos")]
    crate::monocode::macos::install(&window);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_decorations(false);
        let _ = window.set_shadow(true);
    }

    let _ = window.set_focus();
    Ok(())
}

/// Desktop blur goes on after the first UI paint, not during the dock bounce.
#[tauri::command]
pub fn enable_window_glass(window: WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        let _ = window.set_background_color(Some(Color(0, 0, 0, 3)));
        crate::monocode::macos::enable_glass(&window);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
    }
}

/// Close with a running chat hides the webview so the harness child keeps going.
#[tauri::command]
pub fn hide_window(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|err| err.to_string())
}

/// Finish an idle close. `destroy` skips CloseRequested so the JS handler
/// does not loop; `close` would fire it again.
#[tauri::command]
pub fn destroy_window(window: WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|err| err.to_string())
}





/// Persist already happened in JS. Show windows so window-state doesn't save hidden.
#[tauri::command]
pub fn confirm_quit(app: AppHandle) {
    for window in app.webview_windows().values() {
        let _ = window.show();
    }
    // Belt and braces. `RunEvent::Exit` reaps too, and it also runs before the
    // process is gone, but a macOS terminate that skips the run loop would not
    // reach it — and `kill_all`'s SIGKILL wait only works while we're alive.
    if let Some(host) = app.try_state::<crate::monocode::harness::HarnessHost>() {
        host.kill_all();
    }
    if let Some(host) = app.try_state::<crate::monocode::pty::PtyHost>() {
        host.kill_all();
    }
    app.exit(0);
}
