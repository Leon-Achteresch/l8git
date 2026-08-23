use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::cmd::git_command;

pub const LFS_UNAVAILABLE: &str = "__LFS_UNAVAILABLE__";
const POINTER_HEADER: &str = "version https://git-lfs.github.com/spec/v1";
const POINTER_MAX_BYTES: u64 = 4096;
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
            let stdout = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
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

fn git_dir(repo: &Path) -> Option<PathBuf> {
    let (ok, out) = run_git(repo, &["rev-parse", "--git-dir"]);
    if !ok || out.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(out.trim());
    if candidate.is_absolute() {
        Some(candidate)
    } else {
        Some(repo.join(candidate))
    }
}

fn hooks_have_lfs(repo: &Path) -> bool {
    let Some(dir) = git_dir(repo) else {
        return false;
    };
    ["pre-push", "post-checkout", "post-merge", "post-commit"]
        .iter()
        .any(|hook| match std::fs::read_to_string(dir.join("hooks").join(hook)) {
            Ok(text) => text.contains("git lfs") || text.contains("git-lfs"),
            Err(_) => false,
        })
}

fn filter_configured(repo: &Path) -> bool {
    let (ok, out) = run_git(repo, &["config", "--get", "filter.lfs.clean"]);
    ok && !out.trim().is_empty()
}

fn attributes_files(repo: &Path) -> Vec<PathBuf> {
    let (ok, out) = run_git(
        repo,
        &["ls-files", "--cached", "--others", "--exclude-standard", "*.gitattributes", ".gitattributes"],
    );
    let mut files: Vec<PathBuf> = Vec::new();
    if ok {
        for line in out.lines() {
            let rel = line.trim();
            if rel.is_empty() {
                continue;
            }
            let abs = repo.join(rel);
            if abs.is_file() && !files.contains(&abs) {
                files.push(abs);
            }
        }
    }
    let root = repo.join(".gitattributes");
    if root.is_file() && !files.contains(&root) {
        files.push(root);
    }
    files
}

fn has_lfs_attributes(repo: &Path) -> bool {
    attributes_files(repo).iter().any(|file| {
        std::fs::read_to_string(file)
            .map(|text| text.contains("filter=lfs"))
            .unwrap_or(false)
    })
}

pub fn parse_attributes_patterns(text: &str, source: &str) -> Vec<LfsPattern> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || !line.contains("filter=lfs") {
            continue;
        }
        let Some(pattern) = line.split_whitespace().next() else {
            continue;
        };
        if pattern.is_empty() {
            continue;
        }
        out.push(LfsPattern {
            pattern: pattern.to_string(),
            source: source.to_string(),
            excluded: false,
        });
    }
    out
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
        if out.iter().any(|p| p.pattern == pattern && p.excluded == excluded) {
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
    let line = line.trim_end();
    if line.trim().is_empty() {
        return None;
    }
    let mut parts = line.trim_start().splitn(3, ' ');
    let oid = parts.next()?.trim();
    let marker = parts.next()?.trim();
    let rest = parts.next()?.trim();
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
            rest[..idx].trim().to_string(),
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

pub fn parse_pointer(text: &str) -> Option<(String, u64)> {
    let mut lines = text.lines();
    let first = lines.next()?.trim();
    if first != POINTER_HEADER {
        return None;
    }
    let mut oid = None;
    let mut size = None;
    for line in lines {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("oid ") {
            let value = rest.trim();
            let digest = value.split_once(':').map(|(_, d)| d).unwrap_or(value).trim();
            if !digest.is_empty() {
                oid = Some(digest.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("size ") {
            size = rest.trim().parse::<u64>().ok();
        }
    }
    match (oid, size) {
        (Some(oid), Some(size)) => Some((oid, size)),
        _ => None,
    }
}

fn normalize_rel_path(input: &str) -> String {
    let unified = input.trim().replace('\\', "/");
    let trimmed = unified.trim_start_matches("./");
    trimmed.trim_start_matches('/').to_string()
}

fn pointer_head(repo: &Path, treeish: Option<&str>, rel: &str) -> Option<String> {
    match treeish {
        Some(tree) => {
            let spec = format!("{tree}:{rel}");
            let (ok, size_out) = run_git(repo, &["cat-file", "-s", &spec]);
            if !ok {
                return None;
            }
            let size: u64 = size_out.trim().parse().ok()?;
            if size > POINTER_MAX_BYTES {
                return None;
            }
            let (ok, content) = run_git(repo, &["show", &spec]);
            if !ok {
                return None;
            }
            Some(content)
        }
        None => {
            let abs = repo.join(rel);
            let meta = std::fs::metadata(&abs).ok()?;
            if !meta.is_file() || meta.len() > POINTER_MAX_BYTES {
                return None;
            }
            let mut file = std::fs::File::open(&abs).ok()?;
            let mut buf = vec![0u8; POINTER_MAX_BYTES as usize];
            let n = file.read(&mut buf).ok()?;
            buf.truncate(n);
            String::from_utf8(buf).ok()
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

fn status_for(repo: &Path) -> LfsStatus {
    let version = lfs_version();
    let installed = version.is_some();
    let initialized = installed && (filter_configured(repo) || hooks_have_lfs(repo));
    LfsStatus {
        installed,
        version,
        initialized,
        has_attributes: has_lfs_attributes(repo),
    }
}

fn tracked_patterns_for(repo: &Path) -> Result<Vec<LfsPattern>, String> {
    if is_lfs_installed() {
        let (ok, out) = run_git(repo, &["lfs", "track"]);
        if ok {
            return Ok(parse_track_output(&out));
        }
    }
    let mut out: Vec<LfsPattern> = Vec::new();
    for file in attributes_files(repo) {
        let Ok(text) = std::fs::read_to_string(&file) else {
            continue;
        };
        let source = file
            .strip_prefix(repo)
            .unwrap_or(file.as_path())
            .to_string_lossy()
            .replace('\\', "/");
        for pattern in parse_attributes_patterns(&text, &source) {
            if !out.iter().any(|p| p.pattern == pattern.pattern) {
                out.push(pattern);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn lfs_available(path: String) -> Result<LfsStatus, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        Ok(status_for(&repo))
    })
    .await
}

#[tauri::command]
pub async fn lfs_tracked_patterns(path: String) -> Result<Vec<LfsPattern>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path.trim());
        tracked_patterns_for(&repo)
    })
    .await
}

#[tauri::command]
pub async fn lfs_track(path: String, pattern: String) -> Result<String, String> {
    spawn_git(move || {
        ensure_installed()?;
        let repo = PathBuf::from(path.trim());
        let pattern = pattern.trim().to_string();
        if pattern.is_empty() {
            return Err("Pattern must not be empty.".into());
        }
        let (ok, out) = run_git(&repo, &["lfs", "track", &pattern]);
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
        let repo = PathBuf::from(path.trim());
        let pattern = pattern.trim().to_string();
        if pattern.is_empty() {
            return Err("Pattern must not be empty.".into());
        }
        let (ok, out) = run_git(&repo, &["lfs", "untrack", &pattern]);
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
        let repo = PathBuf::from(path.trim());
        let (ok, out) = run_git(&repo, &["lfs", "ls-files", "--size"]);
        if !ok {
            return Err(map_lfs_error(out));
        }
        let all: Vec<LfsFile> = out.lines().filter_map(parse_ls_files_line).collect();
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
        let repo = PathBuf::from(path.trim());
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
        let repo = PathBuf::from(path.trim());
        let rel = normalize_rel_path(&file_path);
        if rel.is_empty() {
            return Err("File path must not be empty.".into());
        }
        let tree = treeish
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(|t| t.to_string());
        let head = pointer_head(&repo, tree.as_deref(), &rel);
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
    fn rejects_non_pointer_content() {
        assert!(parse_pointer("hello world\n").is_none());
        assert!(parse_pointer("").is_none());
        assert!(parse_pointer("version https://git-lfs.github.com/spec/v1\nsize 1\n").is_none());
        assert!(parse_pointer(
            "version https://git-lfs.github.com/spec/v1\noid sha256:abc\n"
        )
        .is_none());
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
        let downloaded =
            parse_ls_files_line("4d7a214614 * assets/my logo.psd (1.2 MB)").unwrap();
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

        repo.write(".gitattributes", "*.psd filter=lfs diff=lfs merge=lfs -text\n");
        repo.commit("attrs");
        let tracked = lfs_available(repo.str_path()).await.unwrap();
        assert!(tracked.has_attributes);
    }

    #[tokio::test]
    async fn status_on_missing_repo_does_not_panic() {
        let missing = std::env::temp_dir().join("l8git-lfs-does-not-exist");
        let status = lfs_available(missing.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(!status.has_attributes);
        assert!(!status.initialized);
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

        assert!(lfs_pointer_info(repo.str_path(), "  ".into(), None)
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
            lfs_track(repo.str_path(), "*.psd".into()).await.unwrap_err(),
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
