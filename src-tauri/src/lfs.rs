use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::cmd::git_command;

pub const LFS_UNAVAILABLE: &str = "__LFS_UNAVAILABLE__";
const POINTER_HEADER: &str = "version https://git-lfs.github.com/spec/v1";
const POINTER_MAX_BYTES: u64 = 1024;
const DEFAULT_LS_FILES_LIMIT: usize = 500;

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub initialized: bool,
    pub has_attributes: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LfsPattern {
    pub pattern: String,
    pub source: String,
    pub excluded: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LfsFile {
    pub oid: String,
    pub path: String,
    pub size: String,
    pub downloaded: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LfsFileList {
    pub files: Vec<LfsFile>,
    pub total: usize,
    pub truncated: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LfsPointer {
    pub is_pointer: bool,
    pub oid: Option<String>,
    pub size: Option<u64>,
}

async fn spawn_git<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f)
        .await
        .expect("git blocking task panicked")
}

fn run_git(repo: &Path, args: &[&str]) -> (bool, String) {
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    match git_command().arg("-C").arg(repo).args(args).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout)
                .trim_end()
                .to_string();
            let stderr = String::from_utf8_lossy(&output.stderr)
                .trim_end()
                .to_string();
            let merged = match (stdout.is_empty(), stderr.is_empty()) {
                (false, false) => format!("{stdout}\n{stderr}"),
                (false, true) => stdout,
                (true, false) => stderr,
                (true, true) => String::new(),
            };
            span.finish(output.status.success());
            (output.status.success(), merged.trim().to_string())
        }
        Err(e) => {
            span.finish(false);
            (false, format!("failed to run git: {e}"))
        }
    }
}

fn lfs_version() -> Option<String> {
    let output = git_command().args(["lfs", "version"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

pub fn is_lfs_installed() -> bool {
    lfs_version().is_some()
}

fn ensure_installed() -> Result<String, String> {
    lfs_version().ok_or_else(|| LFS_UNAVAILABLE.to_string())
}

fn hooks_have_lfs(repo: &Path) -> bool {
    let Ok(dir) = crate::git::resolve_hooks_dir(&repo.to_path_buf()) else {
        return false;
    };
    ["pre-push", "post-checkout", "post-merge", "post-commit"]
        .iter()
        .any(|hook| match std::fs::read_to_string(dir.join(hook)) {
            Ok(text) => text.contains("git lfs") || text.contains("git-lfs"),
            Err(_) => false,
        })
}

fn filter_configured(repo: &Path) -> bool {
    let (ok, out) = run_git(repo, &["config", "--get", "filter.lfs.clean"]);
    ok && !out.trim().is_empty()
}

fn repository(path: &str) -> Result<PathBuf, String> {
    let repo = PathBuf::from(path);
    let root = crate::git::run_git(&repo, &["rev-parse", "--show-toplevel"])?;
    let root = root.strip_suffix('\n').unwrap_or(&root);
    #[cfg(windows)]
    let root = root.strip_suffix('\r').unwrap_or(root);
    PathBuf::from(root)
        .canonicalize()
        .map_err(|error| error.to_string())
}

fn relative_path(input: &str) -> Result<String, String> {
    use std::path::Component;
    #[cfg(windows)]
    let input = input.replace('\\', "/");
    let path = Path::new(&input);
    if input.is_empty()
        || input.contains('\0')
        || path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || path
            .components()
            .any(|part| part.as_os_str().eq_ignore_ascii_case(".git"))
    {
        return Err(format!("__INVALID_WORKTREE_PATH__|{input}"));
    }
    let normalized = path
        .components()
        .filter_map(|part| match part {
            Component::Normal(part) => Some(part),
            _ => None,
        })
        .collect::<PathBuf>();
    if normalized.as_os_str().is_empty() {
        return Err("File path must not be empty.".into());
    }
    let normalized = normalized.to_string_lossy().to_string();
    #[cfg(windows)]
    let normalized = normalized.replace('\\', "/");
    Ok(normalized)
}

fn attributes_sources(repo: &PathBuf) -> Result<Vec<(String, String)>, String> {
    let out = crate::git::run_git(
        repo,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            ".gitattributes",
            ":(glob)**/.gitattributes",
        ],
    )?;
    let mut paths = out
        .split_terminator('\0')
        .map(str::to_string)
        .collect::<Vec<_>>();
    match std::fs::symlink_metadata(repo.join(".gitattributes")) {
        Ok(_) => paths.push(".gitattributes".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    paths.sort();
    paths.dedup();
    let mut sources = Vec::new();
    for path in paths {
        let path = relative_path(&path)?;
        let text = match std::fs::symlink_metadata(repo.join(&path)) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!("__INVALID_WORKTREE_PATH__|{path}"))
            }
            Ok(metadata) if metadata.is_file() => {
                let abs = crate::pathsafe::resolve_in_root(repo, &path)?;
                std::fs::read_to_string(abs)
                    .map_err(|error| format!("Cannot read {path}: {error}"))?
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // Git consults the index when a tracked attributes file is
                // absent from the working tree.
                crate::git::run_git(repo, &["cat-file", "-p", &format!(":{path}")])?
            }
            Err(error) => return Err(error.to_string()),
            _ => return Err(format!("Not a regular attributes file: {path}")),
        };
        sources.push((path, text));
    }
    Ok(sources)
}

pub fn parse_attributes_patterns(text: &str, source: &str) -> Vec<LfsPattern> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim_start();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((pattern, attributes)) = attribute_pattern(line) else {
            continue;
        };
        let mut filter = None;
        for attribute in attributes.split_whitespace() {
            if let Some(value) = attribute.strip_prefix("filter=") {
                filter = Some(value);
            } else if matches!(attribute, "filter" | "-filter" | "!filter") {
                filter = None;
            }
        }
        if pattern.is_empty() || filter != Some("lfs") {
            continue;
        }
        out.push(LfsPattern {
            pattern,
            source: source.to_string(),
            excluded: false,
        });
    }
    out
}

fn attribute_pattern(line: &str) -> Option<(String, &str)> {
    if !line.starts_with('"') {
        let end = line.find(char::is_whitespace).unwrap_or(line.len());
        return Some((line[..end].into(), &line[end..]));
    }
    let bytes = line.as_bytes();
    let mut out = Vec::new();
    let mut i = 1;
    while i < bytes.len() {
        let byte = bytes[i];
        i += 1;
        if byte == b'"' {
            if !line[i..].starts_with(char::is_whitespace) {
                return None;
            }
            return Some((String::from_utf8(out).ok()?, &line[i..]));
        }
        if byte != b'\\' {
            out.push(byte);
            continue;
        }
        let escaped = *bytes.get(i)?;
        i += 1;
        out.push(match escaped {
            b'"' | b'\\' => escaped,
            b'a' => 7,
            b'b' => 8,
            b't' => b'\t',
            b'n' => b'\n',
            b'v' => 11,
            b'f' => 12,
            b'r' => b'\r',
            b'0'..=b'3' => {
                let second = *bytes.get(i)?;
                let third = *bytes.get(i + 1)?;
                if !matches!(second, b'0'..=b'7') || !matches!(third, b'0'..=b'7') {
                    return None;
                }
                i += 2;
                (escaped - b'0') * 64 + (second - b'0') * 8 + (third - b'0')
            }
            _ => return None,
        });
    }
    None
}

pub fn parse_track_output(text: &str) -> Vec<LfsPattern> {
    let mut out: Vec<LfsPattern> = Vec::new();
    let mut excluded = false;
    for raw in text.lines() {
        let lower = raw.trim().to_ascii_lowercase();
        if lower.starts_with("listing tracked") {
            excluded = false;
            continue;
        }
        if lower.starts_with("listing excluded") {
            excluded = true;
            continue;
        }
        if !raw.starts_with(' ') && !raw.starts_with('\t') {
            continue;
        }
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let (pattern, source) = match (line.rfind(" ("), line.ends_with(')')) {
            (Some(idx), true) => (
                line[..idx].trim().to_string(),
                line[idx + 2..line.len() - 1].trim().to_string(),
            ),
            _ => (line.to_string(), String::new()),
        };
        if pattern.is_empty() {
            continue;
        }
        if out
            .iter()
            .any(|p| p.pattern == pattern && p.excluded == excluded)
        {
            continue;
        }
        out.push(LfsPattern {
            pattern,
            source,
            excluded,
        });
    }
    out
}

pub fn parse_ls_files_line(line: &str) -> Option<LfsFile> {
    let line = line.trim_end_matches(['\r', '\n']);
    if line.is_empty() {
        return None;
    }
    let mut parts = line.splitn(3, ' ');
    let oid = parts.next()?.trim();
    let marker = parts.next()?.trim();
    let rest = parts.next()?;
    if oid.is_empty() || rest.is_empty() {
        return None;
    }
    if !oid.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    if marker != "*" && marker != "-" {
        return None;
    }
    let (path, size) = match (rest.rfind(" ("), rest.ends_with(')')) {
        (Some(idx), true) => (
            rest[..idx].to_string(),
            rest[idx + 2..rest.len() - 1].trim().to_string(),
        ),
        _ => (rest.to_string(), String::new()),
    };
    if path.is_empty() {
        return None;
    }
    Some(LfsFile {
        oid: oid.to_string(),
        path,
        size,
        downloaded: marker == "*",
    })
}

#[derive(Deserialize)]
struct JsonLfsFile {
    name: String,
    size: u64,
    checkout: bool,
    oid_type: String,
    oid: String,
}

pub fn parse_ls_files_json(text: &str) -> Result<Vec<LfsFile>, String> {
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("Cannot parse git lfs ls-files JSON: {error}"))?;
    let files = value
        .get("files")
        .ok_or("Git LFS JSON is missing its files array")?;
    if files.is_null() {
        return Ok(Vec::new());
    }
    let files: Vec<JsonLfsFile> = serde_json::from_value(files.clone())
        .map_err(|error| format!("Invalid Git LFS file record: {error}"))?;
    files
        .into_iter()
        .map(|file| {
            if file.oid_type != "sha256"
                || pointer_oid(&format!("sha256:{}", file.oid)).is_none()
                || file.name.is_empty()
                || file.name.contains('\0')
                || file.size > i64::MAX as u64
            {
                return Err("Invalid Git LFS file metadata".into());
            }
            Ok(LfsFile {
                path: file.name,
                oid: file.oid,
                size: format!("{} B", file.size),
                // Preserve the existing * marker semantics: a full working file.
                // JSON downloaded describes the separate local object cache.
                downloaded: file.checkout,
            })
        })
        .collect()
}

fn unsupported_json_option(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    [
        "unknown flag: --json",
        "unknown option: --json",
        "unknown option 'json'",
        "unknown option \"json\"",
        "unrecognized option '--json'",
        "flag provided but not defined: -json",
        "unknown long flag '--json'",
    ]
    .iter()
    .any(|message| error.contains(message))
}

pub fn parse_pointer(text: &str) -> Option<(String, u64)> {
    if text.len() >= POINTER_MAX_BYTES as usize {
        return None;
    }
    let mut lines = text.trim().lines();
    let first = lines.next()?;
    if !matches!(
        first,
        POINTER_HEADER
            | "version https://hawser.github.com/spec/v1"
            | "version http://git-media.io/v/2"
    ) {
        return None;
    }
    let mut oid = None;
    let mut size = None;
    let mut extensions = std::collections::HashSet::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let (key, value) = line.split_once(' ')?;
        match key {
            "oid" if oid.is_none() && size.is_none() => oid = Some(pointer_oid(value)?.to_string()),
            "size" if oid.is_some() && size.is_none() => {
                let parsed = value.parse::<u64>().ok()?;
                if parsed > i64::MAX as u64 {
                    return None;
                }
                size = Some(parsed);
            }
            key if oid.is_none() && key.starts_with("ext-") => {
                let mut fields = key.splitn(3, '-');
                fields.next()?;
                let priority = fields.next()?;
                let name = fields.next()?;
                if priority.len() != 1
                    || !priority.bytes().all(|byte| byte.is_ascii_digit())
                    || name.is_empty()
                    || !name.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.')
                    })
                    || !extensions.insert(priority)
                {
                    return None;
                }
                pointer_oid(value)?;
            }
            _ => return None,
        }
    }
    match (oid, size) {
        (Some(oid), Some(size)) => Some((oid, size)),
        _ => None,
    }
}

fn pointer_oid(value: &str) -> Option<&str> {
    let digest = value.strip_prefix("sha256:")?;
    (digest.len() == 64
        && digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')))
    .then_some(digest)
}

fn pointer_head(
    repo: &PathBuf,
    treeish: Option<&str>,
    rel: &str,
) -> Result<Option<String>, String> {
    match treeish {
        Some(tree) => {
            if tree.starts_with('-') || tree.chars().any(char::is_control) {
                return Err("Invalid tree revision".into());
            }
            let tree = crate::git::run_git(
                repo,
                &[
                    "rev-parse",
                    "--verify",
                    "--end-of-options",
                    &format!("{tree}^{{tree}}"),
                ],
            )?;
            let out = crate::git::run_git(
                repo,
                &[
                    "--literal-pathspecs",
                    "ls-tree",
                    "-z",
                    tree.trim(),
                    "--",
                    rel,
                ],
            )?;
            if out.is_empty() {
                return Ok(None);
            }
            let (header, _) = out.split_once('\t').ok_or("Invalid Git tree record")?;
            let fields = header.split_whitespace().collect::<Vec<_>>();
            if fields.len() != 3 {
                return Err("Invalid Git tree record".into());
            }
            if fields[1] != "blob" || !matches!(fields[0], "100644" | "100755") {
                return Ok(None);
            }
            let size_out = crate::git::run_git(repo, &["cat-file", "-s", fields[2]])?;
            let size: u64 = size_out
                .trim()
                .parse()
                .map_err(|_| "Invalid Git object size")?;
            if size >= POINTER_MAX_BYTES {
                return Ok(None);
            }
            crate::git::run_git(repo, &["cat-file", "-p", fields[2]]).map(Some)
        }
        None => {
            let abs = repo.join(rel);
            let meta = match std::fs::symlink_metadata(&abs) {
                Ok(meta) => meta,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(error.to_string()),
            };
            if meta.file_type().is_symlink() {
                return Err(format!("__INVALID_WORKTREE_PATH__|{rel}"));
            }
            if !meta.is_file() || meta.len() >= POINTER_MAX_BYTES {
                return Ok(None);
            }
            let abs = crate::pathsafe::resolve_in_root(repo, rel)?;
            let file = std::fs::File::open(abs).map_err(|error| error.to_string())?;
            let mut buf = Vec::new();
            file.take(POINTER_MAX_BYTES)
                .read_to_end(&mut buf)
                .map_err(|error| error.to_string())?;
            Ok(String::from_utf8(buf).ok())
        }
    }
}

fn map_lfs_error(message: String) -> String {
    let lower = message.to_ascii_lowercase();
    if lower.contains("'lfs' is not a git command")
        || lower.contains("git: 'lfs' is not a git command")
        || lower.contains("git-lfs: command not found")
    {
        return LFS_UNAVAILABLE.to_string();
    }
    if message.trim().is_empty() {
        "git lfs failed".to_string()
    } else {
        message
    }
}

fn status_for(repo: &PathBuf) -> Result<LfsStatus, String> {
    let version = lfs_version();
    let installed = version.is_some();
    let initialized = installed && (filter_configured(repo) || hooks_have_lfs(repo));
    let sources = attributes_sources(repo)?;
    Ok(LfsStatus {
        installed,
        version,
        initialized,
        has_attributes: sources
            .iter()
            .any(|(source, text)| !parse_attributes_patterns(text, source).is_empty()),
    })
}

fn tracked_patterns_for(repo: &PathBuf) -> Result<Vec<LfsPattern>, String> {
    if is_lfs_installed() {
        let args = ["lfs", "track", "--json"];
        let span = crate::cmdlog::start(&repo.to_string_lossy(), &args);
        let output = git_command()
            .arg("-C")
            .arg(repo)
            .args(args)
            .env("GIT_LFS_TRACK_NO_INSTALL_HOOKS", "1")
            .output()
            .map_err(|error| error.to_string())?;
        span.finish(output.status.success());
        if output.status.success() {
            return parse_track_json(&String::from_utf8_lossy(&output.stdout));
        }
        let error = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        if !unsupported_json_option(&error) {
            return Err(map_lfs_error(error.trim().into()));
        }
    }
    let mut out: Vec<LfsPattern> = Vec::new();
    for (source, text) in attributes_sources(repo)? {
        for pattern in parse_attributes_patterns(&text, &source) {
            if !out
                .iter()
                .any(|p| p.pattern == pattern.pattern && p.source == pattern.source)
            {
                out.push(pattern);
            }
        }
    }
    Ok(out)
}

pub fn parse_track_json(text: &str) -> Result<Vec<LfsPattern>, String> {
    #[derive(Deserialize)]
    struct Pattern {
        pattern: String,
        source: String,
        tracked: bool,
        #[serde(default)]
        lockable: bool,
    }
    #[derive(Deserialize)]
    struct Patterns {
        patterns: Vec<Pattern>,
    }
    let patterns: Patterns = serde_json::from_str(text)
        .map_err(|error| format!("Cannot parse git lfs track JSON: {error}"))?;
    Ok(patterns
        .patterns
        .into_iter()
        .map(|pattern| LfsPattern {
            pattern: pattern.pattern,
            source: pattern.source,
            excluded: !pattern.tracked && !pattern.lockable,
        })
        .collect())
}

#[tauri::command]
pub async fn lfs_available(path: String) -> Result<LfsStatus, String> {
    spawn_git(move || {
        let repo = repository(&path)?;
        status_for(&repo)
    })
    .await
}

#[tauri::command]
pub async fn lfs_tracked_patterns(path: String) -> Result<Vec<LfsPattern>, String> {
    spawn_git(move || {
        let repo = repository(&path)?;
        tracked_patterns_for(&repo)
    })
    .await
}

#[tauri::command]
pub async fn lfs_track(path: String, pattern: String) -> Result<String, String> {
    spawn_git(move || {
        ensure_installed()?;
        let repo = repository(&path)?;
        let lock = crate::git::repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        attributes_sources(&repo)?;
        if pattern.trim().is_empty() || pattern.contains('\0') {
            return Err("Pattern must not be empty.".into());
        }
        let (ok, out) = run_git(&repo, &["lfs", "track", "--", &pattern]);
        if ok {
            Ok(out)
        } else {
            Err(map_lfs_error(out))
        }
    })
    .await
}

#[tauri::command]
pub async fn lfs_untrack(path: String, pattern: String) -> Result<String, String> {
    spawn_git(move || {
        ensure_installed()?;
        let repo = repository(&path)?;
        let lock = crate::git::repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        attributes_sources(&repo)?;
        if pattern.trim().is_empty() || pattern.contains('\0') {
            return Err("Pattern must not be empty.".into());
        }
        let (ok, out) = run_git(&repo, &["lfs", "untrack", "--", &pattern]);
        if ok {
            Ok(out)
        } else {
            Err(map_lfs_error(out))
        }
    })
    .await
}

#[tauri::command]
pub async fn lfs_ls_files(path: String, limit: Option<u32>) -> Result<LfsFileList, String> {
    spawn_git(move || {
        ensure_installed()?;
        let repo = repository(&path)?;
        let all = match crate::git::run_git(&repo, &["lfs", "ls-files", "--json"]) {
            Ok(out) => parse_ls_files_json(&out)?,
            Err(error) if unsupported_json_option(&error) => {
                let out = crate::git::run_git(&repo, &["lfs", "ls-files", "--size"]).map_err(map_lfs_error)?;
                out.lines().filter(|line| !line.is_empty()).map(|line| parse_ls_files_line(line)
                    .ok_or_else(|| "Cannot parse this Git LFS file listing; update Git LFS for JSON support.".to_string())).collect::<Result<Vec<_>, _>>()?
            },
            Err(error) => return Err(map_lfs_error(error)),
        };
        let total = all.len();
        let cap = match limit {
            Some(0) | None => DEFAULT_LS_FILES_LIMIT,
            Some(n) => n as usize,
        };
        let truncated = total > cap;
        let files = all.into_iter().take(cap).collect();
        Ok(LfsFileList {
            files,
            total,
            truncated,
        })
    })
    .await
}

#[tauri::command]
pub async fn lfs_pull(path: String) -> Result<String, String> {
    spawn_git(move || {
        ensure_installed()?;
        let repo = repository(&path)?;
        let lock = crate::git::repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        let (ok, out) = run_git(&repo, &["lfs", "pull"]);
        if ok {
            Ok(out)
        } else {
            Err(map_lfs_error(out))
        }
    })
    .await
}

#[tauri::command]
pub async fn lfs_pointer_info(
    path: String,
    file_path: String,
    treeish: Option<String>,
) -> Result<LfsPointer, String> {
    spawn_git(move || {
        let repo = repository(&path)?;
        let rel = relative_path(&file_path)?;
        let tree = match treeish {
            Some(tree) => {
                if tree.trim().is_empty() || tree.chars().any(char::is_control) {
                    return Err("Invalid tree revision".into());
                }
                Some(tree.trim().to_string())
            }
            None => None,
        };
        let head = pointer_head(&repo, tree.as_deref(), &rel)?;
        let parsed = head.as_deref().and_then(parse_pointer);
        Ok(match parsed {
            Some((oid, size)) => LfsPointer {
                is_pointer: true,
                oid: Some(oid),
                size: Some(size),
            },
            None => LfsPointer {
                is_pointer: false,
                oid: None,
                size: None,
            },
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRepo {
        path: PathBuf,
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    impl TestRepo {
        fn new() -> TestRepo {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path =
                std::env::temp_dir().join(format!("l8git-lfs-test-{}-{}", std::process::id(), id));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            let repo = TestRepo { path };
            repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
            repo.git(&["config", "user.email", "test@example.com"]);
            repo.git(&["config", "user.name", "Test"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            let (ok, out) = run_git(&self.path, args);
            assert!(ok, "git {args:?} failed: {out}");
            out
        }

        fn str_path(&self) -> String {
            self.path.to_string_lossy().to_string()
        }

        fn write(&self, name: &str, content: &str) {
            fs::write(self.path.join(name), content).unwrap();
        }

        fn commit(&self, message: &str) {
            self.git(&["add", "-A"]);
            self.git(&["commit", "-q", "-m", message]);
        }
    }

    const POINTER_TEXT: &str = "version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 12345\n";

    #[test]
    fn parses_real_pointer_text() {
        let (oid, size) = parse_pointer(POINTER_TEXT).unwrap();
        assert_eq!(
            oid,
            "4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393"
        );
        assert_eq!(size, 12345);
    }

    #[test]
    fn json_fallback_only_matches_an_explicit_unsupported_flag() {
        assert!(unsupported_json_option("Error: unknown flag: --json"));
        assert!(unsupported_json_option(
            "flag provided but not defined: -json"
        ));
        assert!(!unsupported_json_option(
            "Authentication failed for JSON endpoint"
        ));
        assert!(!unsupported_json_option("unknown flag: --remote-json"));
        assert!(!unsupported_json_option("invalid config file"));
    }

    #[test]
    fn lfs_hooks_follow_the_configured_hooks_path() {
        let repo = TestRepo::new();
        let hooks = repo.path.join("hooks with spaces");
        fs::create_dir_all(&hooks).unwrap();
        fs::write(hooks.join("pre-push"), "#!/bin/sh\ngit lfs pre-push\n").unwrap();
        repo.git(&["config", "core.hooksPath", "hooks with spaces"]);
        assert!(hooks_have_lfs(&repo.path));
    }

    #[test]
    fn rejects_non_pointer_content() {
        assert!(parse_pointer("hello world\n").is_none());
        assert!(parse_pointer("").is_none());
        assert!(parse_pointer("version https://git-lfs.github.com/spec/v1\nsize 1\n").is_none());
        assert!(
            parse_pointer("version https://git-lfs.github.com/spec/v1\noid sha256:abc\n").is_none()
        );
        assert!(parse_pointer(&format!("prefix\n{POINTER_TEXT}")).is_none());
    }

    #[test]
    fn parses_track_output() {
        let out = "Listing tracked patterns\n    *.psd (.gitattributes)\n    assets/*.png (assets/.gitattributes)\nListing excluded patterns\n    *.tmp (.gitattributes)\n";
        let patterns = parse_track_output(out);
        assert_eq!(
            patterns,
            vec![
                LfsPattern {
                    pattern: "*.psd".into(),
                    source: ".gitattributes".into(),
                    excluded: false
                },
                LfsPattern {
                    pattern: "assets/*.png".into(),
                    source: "assets/.gitattributes".into(),
                    excluded: false
                },
                LfsPattern {
                    pattern: "*.tmp".into(),
                    source: ".gitattributes".into(),
                    excluded: true
                },
            ]
        );
    }

    #[test]
    fn parses_gitattributes_fallback() {
        let text = "# comment\n*.psd filter=lfs diff=lfs merge=lfs -text\n*.md text\n*.bin filter=lfs -text\n";
        let patterns = parse_attributes_patterns(text, ".gitattributes");
        assert_eq!(patterns.len(), 2);
        assert_eq!(patterns[0].pattern, "*.psd");
        assert_eq!(patterns[1].pattern, "*.bin");
        assert!(!patterns[0].excluded);
    }

    #[test]
    fn parses_ls_files_lines() {
        let downloaded = parse_ls_files_line("4d7a214614 * assets/my logo.psd (1.2 MB)").unwrap();
        assert_eq!(downloaded.oid, "4d7a214614");
        assert_eq!(downloaded.path, "assets/my logo.psd");
        assert_eq!(downloaded.size, "1.2 MB");
        assert!(downloaded.downloaded);

        let pointer_only = parse_ls_files_line("4d7a214614 - a.psd").unwrap();
        assert!(!pointer_only.downloaded);
        assert_eq!(pointer_only.size, "");

        assert!(parse_ls_files_line("").is_none());
        assert!(parse_ls_files_line("garbage line here").is_none());
    }

    #[tokio::test]
    async fn tracked_patterns_fall_back_to_gitattributes() {
        let repo = TestRepo::new();
        repo.write(
            ".gitattributes",
            "*.psd filter=lfs diff=lfs merge=lfs -text\n*.txt text\n",
        );
        repo.commit("attrs");
        let patterns = lfs_tracked_patterns(repo.str_path()).await.unwrap();
        assert!(patterns.iter().any(|p| p.pattern == "*.psd"));
        assert!(!patterns.iter().any(|p| p.pattern == "*.txt"));
    }

    #[tokio::test]
    async fn status_reports_attributes_without_panicking() {
        let repo = TestRepo::new();
        let clean = lfs_available(repo.str_path()).await.unwrap();
        assert!(!clean.has_attributes);
        assert_eq!(clean.installed, is_lfs_installed());
        if !clean.installed {
            assert!(!clean.initialized);
            assert!(clean.version.is_none());
        }

        repo.write(
            ".gitattributes",
            "*.psd filter=lfs diff=lfs merge=lfs -text\n",
        );
        repo.commit("attrs");
        let tracked = lfs_available(repo.str_path()).await.unwrap();
        assert!(tracked.has_attributes);
    }

    #[tokio::test]
    async fn status_on_missing_repo_returns_a_repository_error() {
        let missing = std::env::temp_dir().join("l8git-lfs-does-not-exist");
        assert!(lfs_available(missing.to_string_lossy().to_string())
            .await
            .is_err());
    }

    #[tokio::test]
    async fn pointer_info_reads_working_tree_and_commit() {
        let repo = TestRepo::new();
        repo.write("logo.psd", POINTER_TEXT);
        repo.write("notes.txt", "just text\n");
        repo.commit("pointer");

        let working = lfs_pointer_info(repo.str_path(), "logo.psd".into(), None)
            .await
            .unwrap();
        assert!(working.is_pointer);
        assert_eq!(working.size, Some(12345));
        assert_eq!(
            working.oid.as_deref(),
            Some("4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393")
        );

        let committed = lfs_pointer_info(repo.str_path(), "./logo.psd".into(), Some("HEAD".into()))
            .await
            .unwrap();
        assert_eq!(committed, working);

        let plain = lfs_pointer_info(repo.str_path(), "notes.txt".into(), None)
            .await
            .unwrap();
        assert_eq!(
            plain,
            LfsPointer {
                is_pointer: false,
                oid: None,
                size: None
            }
        );

        let missing = lfs_pointer_info(repo.str_path(), "nope.psd".into(), Some("HEAD".into()))
            .await
            .unwrap();
        assert!(!missing.is_pointer);

        assert!(lfs_pointer_info(repo.str_path(), "".into(), None)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn commands_report_unavailable_without_git_lfs() {
        if is_lfs_installed() {
            return;
        }
        let repo = TestRepo::new();
        for err in [
            lfs_track(repo.str_path(), "*.psd".into())
                .await
                .unwrap_err(),
            lfs_untrack(repo.str_path(), "*.psd".into())
                .await
                .unwrap_err(),
            lfs_pull(repo.str_path()).await.unwrap_err(),
            lfs_ls_files(repo.str_path(), None).await.unwrap_err(),
        ] {
            assert_eq!(err, LFS_UNAVAILABLE);
        }
    }

    #[tokio::test]
    async fn track_and_list_with_real_git_lfs() {
        if !is_lfs_installed() {
            return;
        }
        let repo = TestRepo::new();
        repo.git(&["lfs", "install", "--local"]);
        lfs_track(repo.str_path(), "*.psd".into()).await.unwrap();

        let patterns = lfs_tracked_patterns(repo.str_path()).await.unwrap();
        assert!(patterns.iter().any(|p| p.pattern == "*.psd"));

        let status = lfs_available(repo.str_path()).await.unwrap();
        assert!(status.installed);
        assert!(status.initialized);
        assert!(status.has_attributes);

        repo.write("art.psd", "binary-ish payload for lfs\n");
        repo.commit("art");

        let listed = lfs_ls_files(repo.str_path(), Some(10)).await.unwrap();
        assert!(listed.files.iter().any(|f| f.path == "art.psd"));
        assert!(!listed.truncated);

        let pointer = lfs_pointer_info(repo.str_path(), "art.psd".into(), Some("HEAD".into()))
            .await
            .unwrap();
        assert!(pointer.is_pointer);
        assert!(pointer.size.unwrap() > 0);

        lfs_untrack(repo.str_path(), "*.psd".into()).await.unwrap();
        let after = lfs_tracked_patterns(repo.str_path()).await.unwrap();
        assert!(!after.iter().any(|p| p.pattern == "*.psd" && !p.excluded));
    }
}
