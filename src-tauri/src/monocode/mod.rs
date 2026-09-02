pub mod checkpoint;
pub mod cursor_store;
pub mod fs;
pub mod harness;
pub mod linear;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod notes;
pub mod project_logo;
pub mod pty;
pub mod rate_limits;
pub mod search;
pub mod session_store;
pub mod skills;
pub mod window;
pub mod window_transfer;

// Phase 1 seam: spawn / kill harness children per MonoCode thread.
// Adapters own the protocol; this host only supervises processes.

/// Project directory for new sessions — prefer cwd, else home.
#[tauri::command]
pub fn default_cwd() -> String {
    if let Ok(cwd) = std::env::current_dir() {
        return cwd.to_string_lossy().into_owned();
    }
    dirs_home().unwrap_or_else(|| "~".into())
}

#[tauri::command]
pub fn home_dir() -> String {
    dirs_home().unwrap_or_else(|| "~".into())
}

pub(crate) struct PasswdIdentity {
    pub home: String,
    pub user: String,
    pub shell: String,
}

pub(crate) fn dirs_home() -> Option<String> {
    if let Some(home) = std::env::var_os("HOME") {
        let home = home.to_string_lossy().into_owned();
        if !home.is_empty() {
            return Some(home);
        }
    }
    passwd_identity().map(|id| id.home)
}

/// Finder-launched .app bundles often omit HOME/USER/SHELL. Fall back to the
/// passwd database so harness CLIs still find `~/.fx` and the login keychain.
pub(crate) fn passwd_identity() -> Option<PasswdIdentity> {
    #[cfg(unix)]
    {
        let uid = unsafe { libc::getuid() };
        let mut buf = vec![0u8; 4096];
        let mut pwd = unsafe { std::mem::zeroed::<libc::passwd>() };
        let mut result = std::ptr::null_mut::<libc::passwd>();
        let rc = unsafe {
            libc::getpwuid_r(
                uid,
                &mut pwd,
                buf.as_mut_ptr() as *mut libc::c_char,
                buf.len(),
                &mut result,
            )
        };
        if rc != 0 || result.is_null() {
            return None;
        }
        unsafe {
            let user = std::ffi::CStr::from_ptr(pwd.pw_name)
                .to_string_lossy()
                .into_owned();
            let home = std::ffi::CStr::from_ptr(pwd.pw_dir)
                .to_string_lossy()
                .into_owned();
            let shell = std::ffi::CStr::from_ptr(pwd.pw_shell)
                .to_string_lossy()
                .into_owned();
            if user.is_empty() || home.is_empty() {
                return None;
            }
            Some(PasswdIdentity { home, user, shell })
        }
    }
    #[cfg(not(unix))]
    {
        None
    }
}

#[tauri::command]
pub fn set_traffic_lights_visible(
    #[allow(unused_variables)] window: tauri::WebviewWindow,
    #[allow(unused_variables)] visible: bool,
) {
    #[cfg(target_os = "macos")]
    macos::set_visible(&window, visible);
}

#[tauri::command]
pub fn set_window_background_blur(
    #[allow(unused_variables)] window: tauri::WebviewWindow,
    #[allow(unused_variables)] radius: u8,
) {
    #[cfg(target_os = "macos")]
    macos::set_background_blur_radius(&window, radius);
}

#[tauri::command]
pub fn set_dock_badge(
    #[allow(unused_variables)] window: tauri::WebviewWindow,
    #[allow(unused_variables)] count: u32,
) {
    #[cfg(target_os = "macos")]
    macos::set_window_badge(&window, count);
}

#[tauri::command]
pub fn open_new_window(app: tauri::AppHandle) -> Result<(), String> {
    window::open_new_window(&app)
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    harness::reap_orphaned_harness_processes();
    session_store::init(app)?;
    checkpoint::init(app)?;
    #[cfg(target_os = "macos")]
    macos::request_badge_authorization();
    Ok(())
}

pub fn reap(handle: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(host) = handle.try_state::<harness::HarnessHost>() {
        host.kill_all();
    }
    if let Some(host) = handle.try_state::<pty::PtyHost>() {
        host.kill_all();
    }
}
