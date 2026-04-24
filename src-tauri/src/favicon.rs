use std::path::{Path, PathBuf};

/// Produces a data URL containing the provided bytes encoded as base64 with the given MIME type.
///
/// The returned string has the form `data:{mime};base64,{encoded}`.
///
/// # Examples
///
/// ```
/// let bytes = b"\x89PNG\r\n\x1a\n";
/// let url = encode_image_data_url(bytes, "image/png");
/// assert!(url.starts_with("data:image/png;base64,"));
/// ```
fn encode_image_data_url(bytes: &[u8], mime: &str) -> String {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{mime};base64,{b64}")
}

fn mime_for_path(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "image/x-icon",
    }
}

fn parse_size_value(s: &str) -> u32 {
    s.split_whitespace()
        .filter_map(|token| {
            if token.eq_ignore_ascii_case("any") {
                return Some(u32::MAX);
            }
            let (w, _) = token.split_once(|c: char| c == 'x' || c == 'X')?;
            w.parse::<u32>().ok()
        })
        .max()
        .unwrap_or(0)
}

/// Selects the largest icon entry from a web manifest and encodes it as a base64 data URL.
///
/// The function reads and parses the JSON manifest at `manifest_path`, expects an `icons` array,
/// and picks the icon entry with the highest parsed size (from the `sizes` field). The chosen
/// icon `src` is resolved relative to the manifest's parent directory (leading `/` is trimmed),
/// the icon file is read and its MIME type is determined (preferring the file extension unless it
/// is `image/x-icon`, in which case the manifest `type` is used if present). The icon bytes are
/// returned as a `data:` URL produced by `encode_image_data_url`.
///
/// # Parameters
///
/// - `manifest_path` — path to the web manifest JSON file; `src` values inside the manifest are
///   resolved relative to `manifest_path`'s parent directory.
///
/// # Returns
///
/// `Some(data_url)` containing the selected icon encoded as a base64 data URL, or `None` if the
/// manifest cannot be read/parsed, contains no usable icons, the selected icon file cannot be
/// read, or the icon file is empty.
///
/// # Examples
///
/// ```
/// use std::path::Path;
/// use serde_json::json;
///
/// // prepare a temporary directory and files
/// let dir = std::env::temp_dir().join("favicon_manifest_example");
/// let _ = std::fs::create_dir_all(&dir);
/// let icon_path = dir.join("icon.png");
/// std::fs::write(&icon_path, b"\x89PNG\r\n\x1a\n").unwrap(); // minimal PNG header bytes
/// let manifest = json!({
///     "icons": [ { "src": "icon.png", "sizes": "32x32", "type": "image/png" } ]
/// });
/// let manifest_path = dir.join("manifest.json");
/// std::fs::write(&manifest_path, manifest.to_string()).unwrap();
///
/// let data_url = super::favicon_from_manifest(Path::new(&manifest_path)).unwrap();
/// assert!(data_url.starts_with("data:image/png;base64,"));
/// ```
fn favicon_from_manifest(manifest_path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(manifest_path).ok()?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let icons = json.get("icons")?.as_array()?;

    let mut best: Option<(u32, String, Option<String>)> = None;
    for icon in icons {
        let src = icon.get("src").and_then(|v| v.as_str())?.to_string();
        let size = icon
            .get("sizes")
            .and_then(|v| v.as_str())
            .map(parse_size_value)
            .unwrap_or(0);
        let icon_type = icon
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if best.as_ref().map(|(s, _, _)| size > *s).unwrap_or(true) {
            best = Some((size, src, icon_type));
        }
    }

    let (_, src, icon_type) = best?;
    let base_dir = manifest_path.parent()?;
    let trimmed = src.trim_start_matches('/');
    let icon_path = base_dir.join(trimmed);
    let icon_bytes = std::fs::read(&icon_path).ok()?;
    if icon_bytes.is_empty() {
        return None;
    }
    let path_mime = mime_for_path(&icon_path);
    let mime = if path_mime != "image/x-icon" {
        path_mime.to_string()
    } else {
        icon_type
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| path_mime.to_string())
    };
    Some(encode_image_data_url(&icon_bytes, &mime))
}

const ICO_SEARCH_MAX_DEPTH: usize = 12;

const ICO_SEARCH_SKIP_DIR_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "out",
    "vendor",
    ".turbo",
    "coverage",
    ".nuxt",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
];

/// Checks whether the given path has an `ico` extension (case-insensitive).
///
/// # Returns
///
/// `true` if the path's extension is `ico` (case-insensitive), `false` otherwise.
///
/// # Examples
///
/// ```
/// use std::path::Path;
/// assert!(is_ico_file(Path::new("favicon.ico")));
/// assert!(is_ico_file(Path::new("ICON.IcO")));
/// assert!(!is_ico_file(Path::new("image.png")));
/// ```
fn is_ico_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("ico"))
}

/// Recursively collects `.ico` file paths beneath `dir` into `out`, bounded by `max_depth`.
///
/// Traversal stops when `rel_depth` exceeds `max_depth`. Unreadable directories are skipped. Directories
/// whose names appear in `ICO_SEARCH_SKIP_DIR_NAMES` (case-insensitive) or that start with `.` are not
/// traversed. Found files with an `ico` extension (case-insensitive) are pushed to `out`.
///
/// # Parameters
///
/// - `dir`: root directory to scan.
/// - `rel_depth`: current relative depth (use `0` for the initial call).
/// - `max_depth`: maximum allowed relative depth to traverse (inclusive).
/// - `out`: vector to receive matching `PathBuf` entries.
///
/// # Examples
///
/// ```
/// use std::fs;
/// use std::path::PathBuf;
/// let tmp = tempfile::tempdir().unwrap();
/// let ico = tmp.path().join("favicon.ico");
/// fs::write(&ico, b"ico").unwrap();
/// let mut found = Vec::new();
/// collect_ico_files(tmp.path(), 0, 2, &mut found);
/// assert!(found.iter().any(|p: &PathBuf| p.ends_with("favicon.ico")));
/// ```
fn collect_ico_files(
    dir: &Path,
    rel_depth: usize,
    max_depth: usize,
    out: &mut Vec<PathBuf>,
) {
    if rel_depth > max_depth {
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if ICO_SEARCH_SKIP_DIR_NAMES
                .iter()
                .any(|s| s.eq_ignore_ascii_case(name))
            {
                continue;
            }
            if name.starts_with('.') {
                continue;
            }
            collect_ico_files(&path, rel_depth + 1, max_depth, out);
        } else if is_ico_file(&path) {
            out.push(path);
        }
    }
}

/// Finds the best `.ico` file under a repository root.
///
/// Searches the directory tree under `root` (using collect_ico_files) up to
/// `ICO_SEARCH_MAX_DEPTH` and returns the best candidate if any are found.
/// Candidates are ordered by shallower paths (fewer path components) first,
/// then by deterministic lexicographic ordering of the path string.
///
/// # Returns
///
/// `Some(PathBuf)` with the chosen `.ico` file path, `None` if no `.ico` file was found.
///
/// # Examples
///
/// ```no_run
/// use std::path::Path;
/// // Search the current repository root for an .ico file
/// if let Some(path) = any_ico_under_repo(Path::new(".")) {
///     println!("Found icon: {}", path.display());
/// }
/// ```
fn any_ico_under_repo(root: &Path) -> Option<PathBuf> {
    let mut matches: Vec<PathBuf> = Vec::new();
    collect_ico_files(root, 0, ICO_SEARCH_MAX_DEPTH, &mut matches);
    if matches.is_empty() {
        return None;
    }
    matches.sort_by(|a, b| {
        let da = a.components().count();
        let db = b.components().count();
        da.cmp(&db).then_with(|| {
            a.to_string_lossy()
                .as_ref()
                .cmp(b.to_string_lossy().as_ref())
        })
    });
    matches.into_iter().next()
}

/// Locates and returns a repository favicon as a base64-encoded data URL.
///
/// Attempts the following resolution steps in order and returns the first successful result:
/// 1. Common direct favicon file paths (e.g., `favicon.ico`, `public/favicon.ico`).
/// 2. Icons declared in web manifests (e.g., `manifest.json`, `manifest.webmanifest`).
/// 3. Icons referenced by Expo config files (`app.json`, `app.config.json`).
/// 4. A repository-wide search for any `.ico` file (bounded depth and skipping common large directories).
///
/// # Arguments
///
/// * `path` - Filesystem path to the repository root to search.
///
/// # Returns
///
/// `Some(String)` containing a `data:{mime};base64,...` URL for the first found non-empty icon, `None` if no usable favicon is found.
///
/// # Examples
///
/// ```no_run
/// let favicon = read_repo_favicon("/path/to/repo".to_string());
/// if let Some(data_url) = favicon {
///     println!("Found favicon: {}", data_url);
/// }
/// ```
#[tauri::command]
pub fn read_repo_favicon(path: String) -> Option<String> {
    let root = PathBuf::from(&path);
    let favicon_candidates = [
        "favicon.ico",
        "public/favicon.ico",
        "static/favicon.ico",
        "src/favicon.ico",
        "assets/favicon.ico",
        "app/favicon.ico",
    ];

    for rel in favicon_candidates {
        let p = root.join(rel);
        if let Ok(bytes) = std::fs::read(&p) {
            if !bytes.is_empty() {
                return Some(encode_image_data_url(&bytes, "image/x-icon"));
            }
        }
    }

    let manifest_candidates = [
        "manifest.json",
        "manifest.webmanifest",
        "public/manifest.json",
        "public/manifest.webmanifest",
        "static/manifest.json",
        "static/manifest.webmanifest",
        "src/manifest.json",
        "src/manifest.webmanifest",
        "app/manifest.json",
        "app/manifest.webmanifest",
        "assets/manifest.json",
        "assets/manifest.webmanifest",
    ];

    for rel in manifest_candidates {
        let p = root.join(rel);
        if let Some(icon) = favicon_from_manifest(&p) {
            return Some(icon);
        }
    }

    let expo_candidates = ["app.json", "app.config.json"];
    for rel in expo_candidates {
        let p = root.join(rel);
        if let Some(icon) = favicon_from_expo_config(&p) {
            return Some(icon);
        }
    }

    if let Some(ico) = any_ico_under_repo(&root) {
        if let Ok(bytes) = std::fs::read(&ico) {
            if !bytes.is_empty() {
                return Some(encode_image_data_url(&bytes, "image/x-icon"));
            }
        }
    }

    None
}

fn favicon_from_expo_config(config_path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(config_path).ok()?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let expo = json.get("expo").unwrap_or(&json);

    let candidates = [
        expo.pointer("/web/favicon").and_then(|v| v.as_str()),
        expo.pointer("/icon").and_then(|v| v.as_str()),
        expo.pointer("/ios/icon").and_then(|v| v.as_str()),
        expo.pointer("/android/icon").and_then(|v| v.as_str()),
        expo.pointer("/android/adaptiveIcon/foregroundImage")
            .and_then(|v| v.as_str()),
    ];

    let base_dir = config_path.parent()?;
    for rel in candidates.into_iter().flatten() {
        let icon_path = base_dir.join(rel.trim_start_matches("./").trim_start_matches('/'));
        let Ok(icon_bytes) = std::fs::read(&icon_path) else {
            continue;
        };
        if icon_bytes.is_empty() {
            continue;
        }
        let mime = mime_for_path(&icon_path);
        return Some(encode_image_data_url(&icon_bytes, mime));
    }
    None
}
