use std::path::{Path, PathBuf};

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

fn is_ico_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("ico"))
}

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
