use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;

use crate::cmd::git_command;

pub const MAX_MEDIA_BYTES: u64 = 20 * 1024 * 1024;
pub const FILE_TOO_LARGE: &str = "__FILE_TOO_LARGE__";

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileBytes {
    pub base64: String,
    pub mime: String,
    pub size: u64,
    pub is_binary: bool,
}

async fn spawn_git<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f)
        .await
        .expect("git blocking task panicked")
}

fn too_large(size: u64) -> String {
    format!("{FILE_TOO_LARGE}|{size}")
}

fn git_bytes(repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let span = crate::cmdlog::start(&repo.to_string_lossy(), args);
    let output = match git_command().arg("-C").arg(repo).args(args).output() {
        Ok(output) => output,
        Err(e) => {
            span.finish(false);
            return Err(format!("failed to run git: {e}"));
        }
    };
    span.finish(output.status.success());
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = match (stderr.is_empty(), stdout.is_empty()) {
            (false, _) => stderr,
            (true, false) => stdout,
            (true, true) => "git command failed".to_string(),
        };
        return Err(message);
    }
    Ok(output.stdout)
}

fn object_size(repo: &Path, spec: &str) -> Result<u64, String> {
    let raw = git_bytes(repo, &["cat-file", "-s", spec])?;
    String::from_utf8_lossy(&raw)
        .trim()
        .parse::<u64>()
        .map_err(|_| format!("Unable to read object size for {spec}"))
}

pub fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|&b| b == 0)
}

fn ext_of(rel_path: &str) -> String {
    Path::new(rel_path)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

fn mime_from_extension(rel_path: &str) -> Option<&'static str> {
    match ext_of(rel_path).as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" | "jpe" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "ico" | "cur" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

fn mime_from_magic(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("image/bmp");
    }
    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) || bytes.starts_with(&[0x00, 0x00, 0x02, 0x00])
    {
        return Some("image/x-icon");
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        let brand = &bytes[8..12];
        if brand == b"avif" || brand == b"avis" {
            return Some("image/avif");
        }
    }
    if looks_like_svg(bytes) {
        return Some("image/svg+xml");
    }
    None
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(2048)];
    if head.contains(&0) {
        return false;
    }
    let text = String::from_utf8_lossy(head);
    let trimmed = text
        .trim_start()
        .trim_start_matches('\u{feff}')
        .trim_start();
    if trimmed.starts_with("<svg") {
        return true;
    }
    (trimmed.starts_with("<?xml") || trimmed.starts_with("<!DOCTYPE svg")) && text.contains("<svg")
}

pub fn detect_mime(bytes: &[u8], rel_path: &str) -> String {
    if let Some(mime) = mime_from_magic(bytes) {
        return mime.to_string();
    }
    if let Some(mime) = mime_from_extension(rel_path) {
        if mime != "image/svg+xml" || !is_binary(bytes) {
            return mime.to_string();
        }
    }
    if is_binary(bytes) {
        "application/octet-stream".to_string()
    } else {
        "text/plain".to_string()
    }
}

fn read_working_tree(repo: &Path, rel_path: &str) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let input = crate::git::open_worktree_file(&repo.to_path_buf(), rel_path)?;
    let meta = input
        .metadata()
        .map_err(|e| format!("Cannot inspect {rel_path}: {e}"))?;
    if meta.len() > MAX_MEDIA_BYTES {
        return Err(too_large(meta.len()));
    }
    // A file can grow after the metadata check. Keep the allocation bounded
    // and let the caller report an over-limit result from the actual bytes.
    let mut bytes = Vec::new();
    input
        .take(MAX_MEDIA_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read {rel_path}: {e}"))?;
    Ok(bytes)
}

fn read_treeish(repo: &Path, treeish: &str, rel_path: &str) -> Result<Vec<u8>, String> {
    let oid = crate::git::git_file_blob_oid(&repo.to_path_buf(), Some(treeish), rel_path)?
        .ok_or_else(|| format!("File not found in revision: {rel_path}"))?;
    let size = object_size(repo, &oid)?;
    if size > MAX_MEDIA_BYTES {
        return Err(too_large(size));
    }
    git_bytes(repo, &["cat-file", "blob", &oid])
}

pub fn file_bytes(repo: &Path, treeish: Option<&str>, rel_path: &str) -> Result<FileBytes, String> {
    let rel = crate::git::literal_file_path(rel_path)?;
    let bytes = match treeish.filter(|t| !t.is_empty()) {
        Some(tree) => read_treeish(repo, tree, &rel)?,
        None => read_working_tree(repo, &rel)?,
    };
    let size = bytes.len() as u64;
    if size > MAX_MEDIA_BYTES {
        return Err(too_large(size));
    }
    let mime = detect_mime(&bytes, &rel);
    let binary = is_binary(&bytes);
    Ok(FileBytes {
        base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        mime,
        size,
        is_binary: binary,
    })
}

#[tauri::command]
pub async fn repo_file_bytes_at(
    path: String,
    treeish: Option<String>,
    file_path: String,
) -> Result<FileBytes, String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        file_bytes(&repo, treeish.as_deref(), &file_path)
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
            let path = std::env::temp_dir().join(format!(
                "l8git-media-test-{}-{}",
                std::process::id(),
                id
            ));
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
            let out = git_command()
                .arg("-C")
                .arg(&self.path)
                .args(args)
                .output()
                .unwrap_or_else(|e| panic!("git {args:?}: {e}"));
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).to_string()
        }

        fn write(&self, name: &str, bytes: &[u8]) {
            fs::write(self.path.join(name), bytes).unwrap();
        }

        fn commit(&self, message: &str) {
            self.git(&["add", "-A"]);
            self.git(&["commit", "-q", "-m", message]);
        }
    }

    fn png_bytes() -> Vec<u8> {
        let mut v = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        v.extend_from_slice(&[0, 0, 0, 13, b'I', b'H', b'D', b'R']);
        v.extend_from_slice(&[0u8; 32]);
        v
    }

    #[test]
    fn detects_mime_from_magic_bytes() {
        assert_eq!(detect_mime(&png_bytes(), "a.bin"), "image/png");
        assert_eq!(
            detect_mime(&[0xFF, 0xD8, 0xFF, 0xE0, 0x00], "a"),
            "image/jpeg"
        );
        assert_eq!(detect_mime(b"GIF89a....", "a"), "image/gif");
        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&[0x10, 0, 0, 0]);
        webp.extend_from_slice(b"WEBPVP8 ");
        assert_eq!(detect_mime(&webp, "a"), "image/webp");
        assert_eq!(detect_mime(b"BM\x00\x00\x00\x00", "a"), "image/bmp");
        assert_eq!(detect_mime(&[0, 0, 1, 0, 1, 0], "a"), "image/x-icon");
        let mut avif = vec![0, 0, 0, 0x20];
        avif.extend_from_slice(b"ftypavif");
        avif.extend_from_slice(&[0u8; 8]);
        assert_eq!(detect_mime(&avif, "a"), "image/avif");
        assert_eq!(
            detect_mime(b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", "a"),
            "image/svg+xml"
        );
        assert_eq!(
            detect_mime(b"<?xml version=\"1.0\"?>\n<svg></svg>", "a"),
            "image/svg+xml"
        );
    }

    #[test]
    fn falls_back_to_extension_and_generic_types() {
        assert_eq!(detect_mime(&[1, 2, 3, 0, 4], "logo.png"), "image/png");
        assert_eq!(
            detect_mime(&[1, 2, 3, 0, 4], "blob.dat"),
            "application/octet-stream"
        );
        assert_eq!(detect_mime(b"hello world", "notes.txt"), "text/plain");
    }

    #[test]
    fn binary_detection_uses_nul_bytes() {
        assert!(is_binary(&png_bytes()));
        assert!(!is_binary(b"plain text\nwith lines\n"));
        assert!(!is_binary(&[]));
        let mut late_nul = vec![b'a'; 9000];
        late_nul.push(0);
        assert!(!is_binary(&late_nul));
    }

    #[test]
    fn preserves_literal_relative_paths() {
        assert_eq!(
            crate::git::literal_file_path("./src/a.png").unwrap(),
            "src/a.png"
        );
        assert_eq!(crate::git::literal_file_path(" a.png ").unwrap(), " a.png ");
        #[cfg(unix)]
        assert_eq!(
            crate::git::literal_file_path("src\\a.png").unwrap(),
            "src\\a.png"
        );
        assert!(crate::git::literal_file_path("/a/b.png").is_err());
    }

    #[test]
    fn reads_bytes_from_working_tree() {
        let repo = TestRepo::new();
        let png = png_bytes();
        repo.write("logo.png", &png);
        let out = file_bytes(&repo.path, None, "logo.png").unwrap();
        assert_eq!(out.mime, "image/png");
        assert_eq!(out.size, png.len() as u64);
        assert!(out.is_binary);
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(out.base64)
            .unwrap();
        assert_eq!(decoded, png);
    }

    #[test]
    fn reads_bytes_from_commit() {
        let repo = TestRepo::new();
        let first = png_bytes();
        repo.write("logo.png", &first);
        repo.commit("add logo");
        let mut second = first.clone();
        second.extend_from_slice(&[7u8; 16]);
        repo.write("logo.png", &second);
        repo.commit("update logo");

        let head = file_bytes(&repo.path, Some("HEAD"), "logo.png").unwrap();
        assert_eq!(head.size, second.len() as u64);
        let parent = file_bytes(&repo.path, Some("HEAD~1"), "logo.png").unwrap();
        assert_eq!(parent.size, first.len() as u64);
        assert_eq!(parent.mime, "image/png");
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(parent.base64)
            .unwrap();
        assert_eq!(decoded, first);
    }

    #[test]
    fn missing_path_in_treeish_reports_error() {
        let repo = TestRepo::new();
        repo.write("a.txt", b"hi");
        repo.commit("init");
        let err = file_bytes(&repo.path, Some("HEAD"), "nope.png").unwrap_err();
        assert!(!err.is_empty());
        assert!(!err.starts_with(FILE_TOO_LARGE));
    }

    #[test]
    fn rejects_too_large_files_in_working_tree() {
        let repo = TestRepo::new();
        let size = MAX_MEDIA_BYTES + 1024;
        let file = repo.path.join("big.bin");
        let f = fs::File::create(&file).unwrap();
        f.set_len(size).unwrap();
        drop(f);
        let err = file_bytes(&repo.path, None, "big.bin").unwrap_err();
        assert_eq!(err, format!("{FILE_TOO_LARGE}|{size}"));
    }

    #[test]
    fn rejects_too_large_files_in_treeish() {
        let repo = TestRepo::new();
        let size = MAX_MEDIA_BYTES + 512;
        let file = repo.path.join("big.bin");
        let f = fs::File::create(&file).unwrap();
        f.set_len(size).unwrap();
        drop(f);
        repo.commit("big");
        let err = file_bytes(&repo.path, Some("HEAD"), "big.bin").unwrap_err();
        assert_eq!(err, format!("{FILE_TOO_LARGE}|{size}"));
    }

    #[test]
    fn empty_path_is_rejected() {
        let repo = TestRepo::new();
        assert!(file_bytes(&repo.path, None, "   ").is_err());
    }

    fn decoded(bytes: FileBytes) -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .decode(bytes.base64)
            .unwrap()
    }

    #[test]
    fn media_uses_exact_live_and_historical_paths_and_rejects_revision_options() {
        let repo = TestRepo::new();
        // Windows forbids trailing spaces and `*` in file names.
        let names: [&str; 2] = if cfg!(windows) {
            [" a b.png", "literal[name].png"]
        } else {
            [" a.png ", "literal*name.png"]
        };
        for name in names {
            repo.write(name, b"\x89PNG\r\n\x1a\n\0 original\n");
        }
        #[cfg(unix)]
        repo.write("back\\slash.png", b"literal Unix backslash\0\n");
        repo.commit("media paths");
        for name in names {
            let expected = b"\x89PNG\r\n\x1a\n\0 original\n";
            assert_eq!(
                decoded(file_bytes(&repo.path, None, name).unwrap()),
                expected
            );
            assert_eq!(
                decoded(file_bytes(&repo.path, Some("HEAD"), name).unwrap()),
                expected
            );
        }
        #[cfg(unix)]
        for revision in [None, Some("HEAD")] {
            assert_eq!(
                decoded(file_bytes(&repo.path, revision, "back\\slash.png").unwrap()),
                b"literal Unix backslash\0\n"
            );
        }
        let outside = TestRepo::new();
        let output = outside.path.join("read-output");
        assert!(file_bytes(
            &repo.path,
            Some(&format!("--output={}", output.display())),
            names[0]
        )
        .is_err());
        assert!(!output.exists());
        for path in ["../secret.png", "/secret.png", ".git/config"] {
            for revision in [None, Some("HEAD")] {
                assert!(file_bytes(&repo.path, revision, path).is_err());
            }
        }
        for revision in ["HEAD\n", "missing-ref", " "] {
            assert!(file_bytes(&repo.path, Some(revision), names[0]).is_err());
        }
    }

    #[cfg(unix)]
    #[test]
    fn media_live_reads_reject_symlinks_and_special_files_but_history_ignores_live_parents() {
        use std::os::unix::ffi::OsStrExt;
        use std::os::unix::fs::symlink;
        let repo = TestRepo::new();
        let outside = TestRepo::new();
        outside.write("a.txt", b"external fixture must not be read\n");
        fs::create_dir(repo.path.join("dir")).unwrap();
        repo.write("dir/a.txt", b"historical fixture\n");
        repo.commit("initial");
        fs::remove_dir_all(repo.path.join("dir")).unwrap();
        symlink(&outside.path, repo.path.join("dir")).unwrap();
        symlink(outside.path.join("a.txt"), repo.path.join("link.txt")).unwrap();
        symlink(repo.path.join(".git"), repo.path.join("metadata")).unwrap();
        let fifo =
            std::ffi::CString::new(repo.path.join("pipe.txt").as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        for file in ["dir/a.txt", "link.txt", "metadata/config", "pipe.txt"] {
            assert!(file_bytes(&repo.path, None, file).is_err());
        }
        assert_eq!(
            decoded(file_bytes(&repo.path, Some("HEAD"), "dir/a.txt").unwrap()),
            b"historical fixture\n"
        );
    }
}
