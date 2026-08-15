#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

pub fn scratch_path(tag: &str) -> PathBuf {
    let id = COUNTER.fetch_add(1, Ordering::SeqCst);
    let path = std::env::temp_dir().join(format!(
        "l8git-it-{tag}-{}-{}",
        std::process::id(),
        id
    ));
    let _ = fs::remove_dir_all(&path);
    path
}

pub fn git_raw(cwd: &Path, args: &[&str]) -> (bool, String) {
    let out = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .unwrap_or_else(|e| panic!("git {args:?}: {e}"));
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let merged = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => String::new(),
    };
    (out.status.success(), merged)
}

pub struct TestRepo {
    pub path: PathBuf,
    keep: bool,
}

impl Drop for TestRepo {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

impl TestRepo {
    pub fn new(tag: &str) -> TestRepo {
        let path = scratch_path(tag);
        fs::create_dir_all(&path).unwrap();
        let repo = TestRepo { path, keep: false };
        repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
        repo.configure();
        repo
    }

    pub fn bare(tag: &str) -> TestRepo {
        let path = scratch_path(tag);
        fs::create_dir_all(&path).unwrap();
        let repo = TestRepo { path, keep: false };
        repo.git(&["-c", "init.defaultBranch=main", "init", "-q", "--bare", "."]);
        repo
    }

    pub fn adopt(path: PathBuf) -> TestRepo {
        let repo = TestRepo { path, keep: false };
        repo.configure();
        repo
    }

    fn configure(&self) {
        for pair in [
            ("user.email", "test@example.com"),
            ("user.name", "Test User"),
            ("commit.gpgsign", "false"),
            ("tag.gpgsign", "false"),
            ("core.autocrlf", "false"),
            ("gc.auto", "0"),
            ("advice.detachedHead", "false"),
            ("merge.conflictstyle", "merge"),
            ("protocol.file.allow", "always"),
        ] {
            self.git(&["config", pair.0, pair.1]);
        }
    }

    pub fn s(&self) -> String {
        self.path.to_string_lossy().to_string()
    }

    pub fn file_url(&self) -> String {
        format!("file://{}", self.path.to_string_lossy())
    }

    pub fn git(&self, args: &[&str]) -> String {
        let (ok, out) = git_raw(&self.path, args);
        assert!(ok, "git {args:?} failed: {out}");
        out
    }

    pub fn try_git(&self, args: &[&str]) -> (bool, String) {
        git_raw(&self.path, args)
    }

    /// Untrimmed stdout — patches must keep their trailing newline, otherwise
    /// `git apply` rejects them as corrupt.
    pub fn git_out(&self, args: &[&str]) -> String {
        let out = Command::new("git")
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

    pub fn write(&self, file: &str, content: &str) {
        let abs = self.path.join(file);
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&abs, content).unwrap();
    }

    pub fn write_bytes(&self, file: &str, content: &[u8]) {
        let abs = self.path.join(file);
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&abs, content).unwrap();
    }

    pub fn read(&self, file: &str) -> String {
        fs::read_to_string(self.path.join(file)).unwrap_or_default()
    }

    pub fn exists(&self, file: &str) -> bool {
        self.path.join(file).exists()
    }

    pub fn commit(&self, file: &str, content: &str, message: &str) -> String {
        self.write(file, content);
        self.git(&["add", "--", file]);
        self.git(&["commit", "-q", "-m", message]);
        self.head()
    }

    pub fn commit_all(&self, message: &str) -> String {
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "-m", message]);
        self.head()
    }

    pub fn head(&self) -> String {
        self.git(&["rev-parse", "HEAD"])
    }

    pub fn rev(&self, spec: &str) -> String {
        self.git(&["rev-parse", spec])
    }

    pub fn branch(&self) -> String {
        self.git(&["rev-parse", "--abbrev-ref", "HEAD"])
    }

    pub fn subjects(&self) -> Vec<String> {
        self.git(&["log", "--format=%s"])
            .lines()
            .map(|l| l.to_string())
            .collect()
    }

    /// Untrimmed on the left so the two-column `XY` prefix stays intact.
    pub fn porcelain(&self) -> String {
        self.git_out(&["status", "--porcelain=v1"]).trim_end().to_string()
    }
}

/// Repo with three commits on `main` plus a `feature` branch that edits the
/// same file, so merging it into `main` conflicts.
pub fn conflicting_repo(tag: &str) -> TestRepo {
    let repo = TestRepo::new(tag);
    repo.commit("shared.txt", "base\n", "c1");
    repo.git(&["branch", "feature"]);
    repo.commit("shared.txt", "main side\n", "c2 main");
    repo.git(&["checkout", "-q", "feature"]);
    repo.commit("shared.txt", "feature side\n", "c3 feature");
    repo.git(&["checkout", "-q", "main"]);
    repo
}

/// Working repo wired to a bare `file://` remote called `origin`, with `main`
/// pushed and tracking. Returns `(work, bare)`; drop order cleans both up.
pub fn repo_with_remote(tag: &str) -> (TestRepo, TestRepo) {
    let bare = TestRepo::bare(&format!("{tag}-bare"));
    let work = TestRepo::new(&format!("{tag}-work"));
    work.commit("README.md", "hello\n", "initial");
    work.git(&["remote", "add", "origin", &bare.file_url()]);
    work.git(&["push", "-q", "-u", "origin", "main"]);
    (work, bare)
}

/// A second clone of the same bare remote, used to simulate a concurrent
/// pusher for fetch/pull/force-with-lease scenarios.
pub fn clone_of(bare: &TestRepo, tag: &str) -> TestRepo {
    let dest = scratch_path(tag);
    let parent = dest.parent().unwrap().to_path_buf();
    let (ok, out) = git_raw(
        &parent,
        &[
            "clone",
            "-q",
            &bare.file_url(),
            &dest.to_string_lossy(),
        ],
    );
    assert!(ok, "clone failed: {out}");
    TestRepo::adopt(dest)
}

/// `Result::unwrap_err` needs `T: Debug`, which the command payload structs do
/// not derive; this keeps the error assertions readable without touching them.
pub fn expect_err<T>(result: Result<T, String>) -> String {
    match result {
        Ok(_) => panic!("expected an error, got Ok"),
        Err(e) => e,
    }
}

pub fn json(value: &impl serde::Serialize) -> serde_json::Value {
    serde_json::to_value(value).unwrap()
}

pub fn find_entry<'a>(
    entries: &'a serde_json::Value,
    path: &str,
) -> &'a serde_json::Value {
    entries
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["path"] == path)
        .unwrap_or_else(|| panic!("no status entry for {path} in {entries}"))
}
