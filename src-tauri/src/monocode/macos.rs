//! macOS chrome: traffic lights and WindowServer background blur.
//!
//! The overlay titlebar is ~28pt. Our HTML tab bar is 40px (`h-10`), so the
//! native `NSTitlebarContainerView` has to be stretched to match or the
//! traffic-light strip looks shorter than the rest of the chrome.
//!
//! Tao's `trafficLightPosition` re-runs `setFrame` on the titlebar *every
//! drawRect* using `window.frame().height`. That is why the buttons jumped
//! during live resize. We never set that option. Buttons are Auto Layout
//! pinned once. The container is `setFrame`'d to 40px on install,
//! resize, and focus — not from `drawRect`.
//!
//! Sidebar glass uses a transparent NSWindow plus
//! `CGSSetWindowBackgroundBlurRadius` (private WindowServer API). That
//! blurs the desktop behind the window; CSS only tints the sidebar on top.
//!
//! Fully clear `NSColor.clearColor` (alpha 0) plus a native shadow makes
//! macOS draw a chamfered gap at the corners. Tiny alpha (0.01) keeps the
//! shadow without that outline.

use std::collections::HashMap;
use std::ffi::{c_char, c_int, c_void};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};

use objc2::{
    MainThreadMarker,
};
use objc2_app_kit::{
    NSApplication, NSColor, NSRequestUserAttentionType,
    NSTitlebarSeparatorStyle, NSWindow,
};
use objc2_foundation::NSString;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{Manager, WebviewWindow, WindowEvent};

/// Must match the HTML title bar (`h-10` = 40px).
const TAB_BAR_HEIGHT: f64 = 40.0;
const BUTTON_SIZE: f64 = 14.0;
const LEFT_MARGIN: f64 = 12.0;
const BUTTON_SPACING: f64 = 6.0;
/// Vertically center 14pt buttons in the tab bar: (40 - 14) / 2.
const TOP_INSET: f64 = (TAB_BAR_HEIGHT - BUTTON_SIZE) / 2.0;

pub const BLUR_MIN: u8 = 1;
pub const BLUR_MAX: u8 = 64;
pub const BLUR_DEFAULT: u8 = 24;

const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

static PINNED: AtomicBool = AtomicBool::new(false);
static BLUR_RADIUS: AtomicU8 = AtomicU8::new(BLUR_DEFAULT);
static WINDOW_BADGES: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();

type CgsConnection = usize;
type SetBlurFn = unsafe extern "C" fn(CgsConnection, c_int, c_int) -> c_int;
type ConnectionFn = unsafe extern "C" fn() -> CgsConnection;

unsafe extern "C" {
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}

pub fn install(window: &WebviewWindow) {
    // Opaque for the dock bounce so the first frames are a solid field,
    // not a frosted desktop. Glass turns on after the first UI paint.
    prepare_launch(window);
    let _ = pin(window);

    let event_window = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(true) => {
            pin(&event_window);
        }
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
            stretch_titlebar(&event_window);
        }
        WindowEvent::Destroyed => set_window_badge(&event_window, 0),
        _ => {}
    });
}

/// Slack-style red count on the Dock icon. `count` is this window's pending
/// approvals; the tile shows the sum across windows.
pub fn set_window_badge(window: &WebviewWindow, count: u32) {
    let label = window.label().to_string();
    let apply = move || paint_window_badge(&label, count);
    if MainThreadMarker::new().is_some() {
        apply();
        return;
    }
    let _ = window.app_handle().run_on_main_thread(apply);
}

fn window_badges() -> &'static Mutex<HashMap<String, u32>> {
    WINDOW_BADGES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn paint_window_badge(label: &str, count: u32) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let mut map = window_badges()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    let previous: u32 = map.values().copied().sum();
    if count == 0 {
        map.remove(label);
    } else {
        map.insert(label.to_string(), count);
    }
    let total: u32 = map.values().copied().sum();
    drop(map);

    let ns_app = NSApplication::sharedApplication(mtm);
    let tile = ns_app.dockTile();
    tile.setShowsApplicationBadge(total > 0);
    if total == 0 {
        tile.setBadgeLabel(None);
    } else {
        let text = if total > 99 {
            "99+".to_string()
        } else {
            total.to_string()
        };
        tile.setBadgeLabel(Some(&NSString::from_str(&text)));
    }
    tile.display();

    if total > previous && !ns_app.isActive() {
        ns_app.requestUserAttention(NSRequestUserAttentionType::InformationalRequest);
    }
}

pub fn set_visible(window: &WebviewWindow, visible: bool) {
    let Some(ns_window) = ns_window(window) else {
        return;
    };
    for kind in button_kinds() {
        if let Some(button) = ns_window.standardWindowButton(kind) {
            button.setHidden(!visible);
        }
    }
}

pub fn set_background_blur_radius(window: &WebviewWindow, radius: u8) {
    let radius = radius.clamp(BLUR_MIN, BLUR_MAX);
    BLUR_RADIUS.store(radius, Ordering::Relaxed);
    apply_blur(window, radius);
}

/// Solid field behind the dock bounce. Same colour as the HTML sheet.
fn prepare_launch(window: &WebviewWindow) {
    set_launch_background(window, 23, 23, 23);
    let Some(ns_window) = ns_window(window) else {
        return;
    };
    ns_window.setHasShadow(true);
    ns_window.invalidateShadow();
    ns_window.setTitlebarSeparatorStyle(NSTitlebarSeparatorStyle::None);
}

fn set_launch_background(window: &WebviewWindow, r: u8, g: u8, b: u8) {
    let Some(ns_window) = ns_window(window) else {
        return;
    };
    ns_window.setOpaque(true);
    ns_window.setBackgroundColor(Some(&NSColor::colorWithRed_green_blue_alpha(
        r as f64 / 255.0,
        g as f64 / 255.0,
        b as f64 / 255.0,
        1.0,
    )));
}

/// Turn on desktop blur after the first UI paint.
pub fn enable_glass(window: &WebviewWindow) {
    prepare_glass(window);
    apply_blur(window, BLUR_RADIUS.load(Ordering::Relaxed));
}

fn prepare_glass(window: &WebviewWindow) {
    let Some(ns_window) = ns_window(window) else {
        return;
    };
    ns_window.setOpaque(false);
    // Fully clear + shadow leaves a jagged gap at the corners.
    ns_window.setBackgroundColor(Some(&NSColor::clearColor().colorWithAlphaComponent(0.01)));
    ns_window.setHasShadow(true);
    ns_window.invalidateShadow();
    ns_window.setTitlebarSeparatorStyle(NSTitlebarSeparatorStyle::None);
}

fn apply_blur(window: &WebviewWindow, radius: u8) {
    let Some(ns_window) = ns_window(window) else {
        return;
    };
    let Some(set_blur) = set_blur_fn() else {
        return;
    };
    let Some(connection) = cgs_connection() else {
        return;
    };
    let window_number = ns_window.windowNumber();
    if window_number <= 0 {
        return;
    }
    unsafe {
        set_blur(
            connection,
            window_number as c_int,
            radius.max(BLUR_MIN) as c_int,
        );
    }
}

fn pin(window: &WebviewWindow) -> bool {
    let Some(ns_window) = ns_window(window) else {
        return PINNED.load(Ordering::Relaxed);
    };
    unsafe {
        if !PINNED.load(Ordering::Relaxed) && !pin_ns_window(&ns_window) {
            return false;
        }
        stretch_ns_window(&ns_window);
    }
    true
}

fn stretch_titlebar(window: &WebviewWindow) {
    let Some(ns_window) = ns_window(window) else {
        return;
    };
    unsafe { stretch_ns_window(&ns_window) }
}

pub(crate) fn ns_window(window: &WebviewWindow) -> Option<objc2::rc::Retained<NSWindow>> {
    let Ok(handle) = window.window_handle() else {
        return None;
    };
    let RawWindowHandle::AppKit(appkit) = handle.as_raw() else {
        return None;
    };
    let ns_view: *mut objc2::runtime::AnyObject = appkit.ns_view.as_ptr().cast();
    if ns_view.is_null() {
        return None;
    }
    let view = unsafe { &*ns_view.cast::<objc2_app_kit::NSView>() };
    view.window()
}

fn button_kinds() -> [objc2_app_kit::NSWindowButton; 3] {
    use objc2_app_kit::NSWindowButton;
    [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ]
}

unsafe fn pin_ns_window(window: &NSWindow) -> bool {
    let kinds = button_kinds();
    let Some(close) = window.standardWindowButton(kinds[0]) else {
        return false;
    };
    let Some(titlebar) = close.superview() else {
        return false;
    };

    titlebar.setClipsToBounds(false);
    if let Some(container) = titlebar.superview() {
        container.setClipsToBounds(false);
    }

    for (i, kind) in kinds.iter().enumerate() {
        let Some(button) = window.standardWindowButton(*kind) else {
            continue;
        };
        button.setTranslatesAutoresizingMaskIntoConstraints(false);
        let x = LEFT_MARGIN + i as f64 * (BUTTON_SIZE + BUTTON_SPACING);
        let w = button.widthAnchor().constraintEqualToConstant(BUTTON_SIZE);
        let h = button.heightAnchor().constraintEqualToConstant(BUTTON_SIZE);
        let leading = button
            .leadingAnchor()
            .constraintEqualToAnchor_constant(&titlebar.leadingAnchor(), x);
        let top = button
            .topAnchor()
            .constraintEqualToAnchor_constant(&titlebar.topAnchor(), TOP_INSET);
        w.setActive(true);
        h.setActive(true);
        leading.setActive(true);
        top.setActive(true);
    }

    PINNED.store(true, Ordering::Relaxed);
    true
}

unsafe fn stretch_ns_window(window: &NSWindow) {
    let kinds = button_kinds();
    let Some(close) = window.standardWindowButton(kinds[0]) else {
        return;
    };
    let Some(titlebar) = close.superview() else {
        return;
    };
    let Some(container) = titlebar.superview() else {
        return;
    };

    let parent_height = container
        .superview()
        .map(|parent| parent.frame().size.height)
        .unwrap_or_else(|| window.frame().size.height);

    let mut frame = container.frame();
    frame.size.height = TAB_BAR_HEIGHT;
    frame.origin.y = parent_height - TAB_BAR_HEIGHT;
    container.setFrame(frame);

    let mut inner = titlebar.frame();
    inner.origin.y = 0.0;
    inner.size.height = TAB_BAR_HEIGHT;
    inner.size.width = frame.size.width;
    titlebar.setFrame(inner);
}

fn set_blur_fn() -> Option<SetBlurFn> {
    static FN: OnceLock<Option<SetBlurFn>> = OnceLock::new();
    *FN.get_or_init(|| dlsym_fn(b"CGSSetWindowBackgroundBlurRadius\0"))
}

fn cgs_connection() -> Option<CgsConnection> {
    static FN: OnceLock<Option<ConnectionFn>> = OnceLock::new();
    let function = (*FN.get_or_init(|| {
        dlsym_fn(b"CGSDefaultConnectionForThread\0").or_else(|| dlsym_fn(b"CGSMainConnectionID\0"))
    }))?;
    let connection = unsafe { function() };
    (connection != 0).then_some(connection)
}

fn dlsym_fn<T>(symbol: &[u8]) -> Option<T> {
    unsafe {
        let ptr = dlsym(RTLD_DEFAULT, symbol.as_ptr().cast());
        if ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute_copy(&ptr))
        }
    }
}
