use super::*;
use super::coordination::RemoteProcessLock;

pub const REMOTE_CANCELED: &str = "__REMOTE_CANCELED__";
const PROGRESS_EVENT: &str = "git-progress";
const PROGRESS_DONE_EVENT: &str = "git-progress-done";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProgressEvent {
    pub op_id: String,
    pub repo_path: String,
    pub op: String,
    pub phase: String,
    pub percent: Option<u8>,
    pub detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProgressDone {
    pub op_id: String,
    pub repo_path: String,
    pub op: String,
    pub ok: bool,
    pub canceled: bool,
    pub message: String,
}

#[derive(Debug, PartialEq)]
struct ProgressLine {
    phase: String,
    percent: Option<u8>,
    detail: String,
}

#[derive(Clone)]
struct RemoteOp {
    child: std::sync::Arc<RemoteChild>,
    canceled: std::sync::Arc<std::sync::atomic::AtomicBool>,
    #[cfg(windows)]
    job: std::sync::Arc<std::sync::Mutex<Option<crate::pty::job::PtyJob>>>,
}

struct RemoteChild {
    process: std::sync::Mutex<Option<std::process::Child>>,
}

impl RemoteChild {
    fn new(child: std::process::Child) -> Self {
        Self {
            process: std::sync::Mutex::new(Some(child)),
        }
    }

    // Called once, after both output pipes close. Release the lock between
    // checks so a helper that closes its pipes early can still be canceled.
    fn wait(&self) -> std::io::Result<std::process::ExitStatus> {
        let mut delay = std::time::Duration::from_millis(1);
        loop {
            let mut process = self.process.lock().unwrap_or_else(|err| err.into_inner());
            let result = process
                .as_mut()
                .expect("remote child has one waiter")
                .try_wait();
            match result {
                Ok(Some(status)) => {
                    process.take();
                    return Ok(status);
                }
                Err(err) => {
                    process.take();
                    return Err(err);
                }
                Ok(None) => {}
            }
            drop(process);
            std::thread::sleep(delay);
            delay = (delay * 2).min(std::time::Duration::from_millis(32));
        }
    }
}

/// A caller-owned cancellation handle for one scoped request. The public
/// operation-ID registry never sees these requests.
#[derive(Default)]
pub(crate) struct ScopedRemoteCancellation {
    state: std::sync::Mutex<ScopedRemoteState>,
}

#[derive(Default)]
struct ScopedRemoteState {
    canceled: bool,
    running: Option<RemoteOp>,
}

impl ScopedRemoteCancellation {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub(crate) fn cancel(&self) {
        let mut state = self.state.lock().unwrap_or_else(|err| err.into_inner());
        state.canceled = true;
        if let Some(op) = state.running.as_ref() {
            op.canceled.store(true, std::sync::atomic::Ordering::Relaxed);
            kill_remote_op(op);
        }
    }
}

struct StreamOutcome {
    success: bool,
    stdout: String,
    stderr: String,
    canceled: bool,
}

fn remote_ops() -> &'static std::sync::Mutex<HashMap<String, RemoteOp>> {
    static REG: std::sync::OnceLock<std::sync::Mutex<HashMap<String, RemoteOp>>> =
        std::sync::OnceLock::new();
    REG.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn parse_progress_chunk(chunk: &str) -> Option<ProgressLine> {
    let mut text = chunk.trim();
    while let Some(rest) = text.strip_prefix("remote:") {
        text = rest.trim_start();
    }
    let (phase, rest) = text.split_once(':')?;
    let phase = phase.trim();
    if phase.is_empty()
        || !phase
            .chars()
            .all(|c| c.is_ascii_alphabetic() || c == ' ' || c == '-')
    {
        return None;
    }
    let rest = rest.trim();
    if !rest.starts_with(|c: char| c.is_ascii_digit()) {
        return None;
    }
    let (digits, after) = rest.split_at(rest.bytes().take_while(u8::is_ascii_digit).count());
    let (percent, detail) = match after.strip_prefix('%') {
        Some(tail) => (
            digits.parse::<u32>().ok().map(|v| v.min(100) as u8),
            tail.trim().to_string(),
        ),
        None => (None, rest.to_string()),
    };
    Some(ProgressLine {
        phase: phase.to_string(),
        percent,
        detail,
    })
}

fn record_progress_line(
    bytes: &[u8],
    kept: &mut Vec<String>,
    on_progress: &mut impl FnMut(ProgressLine),
) {
    let decoded = String::from_utf8_lossy(bytes);
    let text = decoded.trim_end();
    if text.is_empty() {
        return;
    }
    match parse_progress_chunk(text) {
        Some(line) => {
            let keep = line.percent.is_none() || line.detail.contains("done.");
            on_progress(line);
            if keep {
                kept.push(text.to_owned());
            }
        }
        None => kept.push(text.to_owned()),
    }
}

fn read_progress_stream<R: std::io::Read>(
    mut stream: R,
    mut on_progress: impl FnMut(ProgressLine),
) -> String {
    let mut buffer = [0; 8192];
    let mut partial = Vec::new();
    let mut kept = Vec::new();
    loop {
        let count = match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => count,
            Err(err) if err.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        };
        let bytes = &buffer[..count];
        let mut start = 0;
        for end in memchr::memchr2_iter(b'\r', b'\n', bytes) {
            let line = &bytes[start..end];
            if partial.is_empty() {
                record_progress_line(line, &mut kept, &mut on_progress);
            } else {
                partial.extend_from_slice(line);
                record_progress_line(&partial, &mut kept, &mut on_progress);
                partial.clear();
            }
            start = end + 1;
        }
        partial.extend_from_slice(&bytes[start..]);
    }
    record_progress_line(&partial, &mut kept, &mut on_progress);
    kept.join("\n")
}

fn kill_remote_op(op: &RemoteOp) {
    let mut process = op
        .child
        .process
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    let Some(child) = process.as_mut() else {
        return;
    };
    let pid = child.id();
    #[cfg(windows)]
    {
        // Git may launch a shell for aliases and that shell can outlive the
        // git process. Closing the job object terminates the complete tree.
        if let Ok(mut job) = op.job.lock() {
            drop(job.take());
        }
        let _ = crate::cmd::cli_command("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.kill();
    }
    #[cfg(unix)]
    {
        // Keep the group leader unreaped while signaling. This also prevents
        // a delayed cancel from reaching an unrelated, recycled PID.
        if unsafe { libc::kill(-(pid as i32), libc::SIGTERM) } != 0 {
            let _ = child.kill();
            return;
        }
        // Give Git time to release locks, then stop any helper that ignored
        // TERM, even one that has already closed its inherited output pipes.
        std::thread::sleep(std::time::Duration::from_millis(250));
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
}

#[cfg(windows)]
fn create_remote_job(
    pid: u32,
) -> std::sync::Arc<std::sync::Mutex<Option<crate::pty::job::PtyJob>>> {
    let job = crate::pty::job::PtyJob::create_for(pid)
        .map_err(|error| log::warn!("remote git job-object setup failed for pid={pid}: {error}"))
        .ok();
    std::sync::Arc::new(std::sync::Mutex::new(job))
}

fn run_git_streamed(
    cwd: Option<&PathBuf>,
    args: &[String],
    op_id: Option<&str>,
    lock: Option<&RemoteProcessLock>,
    scope: Option<&ScopedRemoteCancellation>,
    mut scoped: Option<std::sync::MutexGuard<'_, ScopedRemoteState>>,
    spawn_guard: impl Sized,
    on_progress: impl FnMut(ProgressLine),
) -> Result<StreamOutcome, String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    let mut cmd = git_command();
    if scope.is_some() {
        // Keep the user's Git transport/credential policy. The fixture passes
        // its stricter file-only policy through the inherited environment.
        cmd.args(["-c", "protocol.ext.allow=never"]).env("GIT_NO_LAZY_FETCH", "1");
    }
    if let Some(dir) = cwd {
        cmd.arg("-C").arg(dir);
    }
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    if let Some(lock) = lock {
        lock.inherit(&mut cmd);
    }

    let child = cmd.spawn();
    drop(spawn_guard);
    let mut child = child.map_err(|e| format!("failed to run git: {e}"))?;
    #[cfg(windows)]
    let job = create_remote_job(child.id());
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let shared = Arc::new(RemoteChild::new(child));
    let canceled = Arc::new(AtomicBool::new(false));

    let operation = RemoteOp {
        child: shared.clone(),
        canceled: canceled.clone(),
        #[cfg(windows)]
        job,
    };
    if let Some(state) = scoped.as_mut() {
        state.running = Some(operation);
    } else if let (Some(op_id), Ok(mut reg)) = (op_id, remote_ops().lock()) {
        reg.insert(op_id.to_owned(), operation);
    }
    drop(scoped);

    let stdout_thread = std::thread::spawn(move || {
        let mut raw: Vec<u8> = Vec::new();
        if let Some(mut out) = stdout {
            let _ = std::io::Read::read_to_end(&mut out, &mut raw);
        }
        String::from_utf8_lossy(&raw).to_string()
    });

    let stderr_text = match stderr {
        Some(err) => read_progress_stream(err, on_progress),
        None => String::new(),
    };
    let stdout_text = stdout_thread.join().unwrap_or_default();

    let status = shared.wait().map_err(|err| err.to_string());

    if let Some(scope) = scope {
        scope.state.lock().unwrap_or_else(|err| err.into_inner()).running = None;
    } else if let (Some(op_id), Ok(mut reg)) = (op_id, remote_ops().lock()) {
        reg.remove(op_id);
    }

    let canceled = canceled.load(Ordering::Relaxed);
    if !canceled {
        if let (Some(lock), Ok(status)) = (lock, &status) {
            lock.finish(*status);
        }
    }
    Ok(StreamOutcome {
        success: status.map(|s| s.success()).unwrap_or(false) && !canceled,
        stdout: stdout_text.trim().to_string(),
        stderr: stderr_text.trim().to_string(),
        canceled,
    })
}

fn emit_progress(event: &GitProgressEvent) {
    crate::sink::emit(PROGRESS_EVENT, event);
}

fn emit_progress_done(event: &GitProgressDone) {
    crate::sink::emit(PROGRESS_DONE_EVENT, event);
}

pub(super) fn run_remote_op(
    op: &str,
    repo_path: &str,
    cwd: Option<&PathBuf>,
    args: Vec<String>,
    op_id: Option<String>,
    lock: Option<&RemoteProcessLock>,
) -> Result<String, String> {
    run_remote_op_with_spawn_guard(op, repo_path, cwd, args, op_id, lock, None, None, ())
}

pub(super) type ScopedProgress = Box<dyn Fn(GitProgressEvent) + Send + 'static>;

/// Hold the caller's authorization lock until the start attempt finishes.
pub(super) fn run_remote_op_with_spawn_guard(
    op: &str,
    repo_path: &str,
    cwd: Option<&PathBuf>,
    args: Vec<String>,
    op_id: Option<String>,
    lock: Option<&RemoteProcessLock>,
    scope: Option<&ScopedRemoteCancellation>,
    scoped_progress: Option<ScopedProgress>,
    spawn_guard: impl Sized,
) -> Result<String, String> {
    let op_id = op_id
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty());
    if op_id.is_none() && scope.is_none() {
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        return run_git_merged_output_at(cwd, &refs, lock, spawn_guard);
    }

    let mut args = args;
    if op_id.is_some() {
        args.insert(1, "--progress".to_string());
    }

    let scoped = scope.map(|scope| scope.state.lock().unwrap_or_else(|err| err.into_inner()));
    if scoped.as_ref().is_some_and(|state| state.canceled) {
        return Err(REMOTE_CANCELED.into());
    }
    let span = cmdlog::start(repo_path, &args);
    let outcome = run_git_streamed(cwd, &args, op_id.as_deref(), lock, scope, scoped, spawn_guard, |line| {
        let Some(op_id) = &op_id else { return };
        let event = GitProgressEvent {
            op_id: op_id.clone(),
            repo_path: repo_path.to_string(),
            op: op.to_string(),
            phase: line.phase,
            percent: line.percent,
            detail: line.detail,
        };
        if let Some(deliver) = &scoped_progress {
            deliver(event);
        } else if scope.is_none() {
            emit_progress(&event);
        }
    });

    let done = |ok: bool, canceled: bool, message: &str| {
        let Some(op_id) = op_id.as_ref().filter(|_| scope.is_none()) else { return };
        emit_progress_done(&GitProgressDone {
            op_id: op_id.clone(),
            repo_path: repo_path.to_string(),
            op: op.to_string(),
            ok,
            canceled,
            message: message.to_string(),
        });
    };

    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(e) => {
            span.finish(false);
            done(false, false, &e);
            return Err(e);
        }
    };
    span.finish(outcome.success);

    if outcome.canceled {
        done(false, true, REMOTE_CANCELED);
        return Err(REMOTE_CANCELED.to_string());
    }
    if !outcome.success {
        let message = merged_failure_message(&outcome.stdout, &outcome.stderr);
        done(false, false, &message);
        return Err(message);
    }
    let message = merged_ok_message(&outcome.stdout, &outcome.stderr);
    done(true, false, &message);
    Ok(message)
}

pub fn cancel_remote_op(op_id: &str) -> bool {
    let key = op_id.trim().to_string();
    let entry = match remote_ops().lock() {
        Ok(registry) => registry.get(&key).cloned(),
        Err(error) => {
            log::warn!("remote-op registry poisoned: {error}");
            None
        }
    };
    let Some(entry) = entry else {
        return false;
    };
    entry
        .canceled
        .store(true, std::sync::atomic::Ordering::Relaxed);
    kill_remote_op(&entry);
    true
}

#[tauri::command]
pub async fn git_remote_cancel(op_id: String) -> Result<bool, String> {
    Ok(spawn_git(move || cancel_remote_op(&op_id)).await)
}

#[cfg(test)]
pub(crate) fn track_remote_op_for_test(op_id: &str, child: std::process::Child) {
    #[cfg(windows)]
    let job = create_remote_job(child.id());
    if let Ok(mut registry) = remote_ops().lock() {
        registry.insert(
            op_id.to_string(),
            RemoteOp {
                child: std::sync::Arc::new(RemoteChild::new(child)),
                canceled: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
                #[cfg(windows)]
                job,
            },
        );
    }
}

#[cfg(test)]
pub(crate) fn remote_op_canceled_for_test(op_id: &str) -> Option<bool> {
    remote_ops()
        .lock()
        .ok()?
        .get(op_id)
        .map(|op| op.canceled.load(std::sync::atomic::Ordering::Relaxed))
}

#[cfg(test)]
pub(crate) fn forget_remote_op_for_test(op_id: &str) {
    if let Ok(mut registry) = remote_ops().lock() {
        registry.remove(op_id);
    }
}

#[cfg(test)]
mod remote_progress_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempPath {
        path: PathBuf,
    }

    impl Drop for TempPath {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn temp_path(tag: &str) -> TempPath {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path =
            std::env::temp_dir().join(format!("l8git-progress-{tag}-{}-{id}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        TempPath { path }
    }

    fn stream(
        cwd: Option<&PathBuf>,
        args: &[&str],
        op_id: &str,
    ) -> (StreamOutcome, Vec<ProgressLine>) {
        let owned: Vec<String> = args.iter().map(|a| a.to_string()).collect();
        let mut lines: Vec<ProgressLine> = Vec::new();
        let outcome = run_git_streamed(cwd, &owned, Some(op_id), None, None, None, (), |line| lines.push(line)).unwrap();
        (outcome, lines)
    }

    fn phase_percent(lines: &[ProgressLine], phase: &str) -> Vec<Option<u8>> {
        lines
            .iter()
            .filter(|l| l.phase == phase)
            .map(|l| l.percent)
            .collect()
    }

    #[test]
    fn fragmented_progress_survives_interruptions_and_multibyte_boundaries() {
        use std::io::{Error, ErrorKind, Read, Result};

        struct Fragments<'a>(&'a [u8], bool);
        impl Read for Fragments<'_> {
            fn read(&mut self, output: &mut [u8]) -> Result<usize> {
                self.1 = !self.1;
                if self.1 {
                    return Err(Error::from(ErrorKind::Interrupted));
                }
                self.0.read(&mut output[..1])
            }
        }

        let input = "remote: Counting objects: 20% (1/5)\r\nremote: Counting objects: 100% (5/5), done.\r\n   \n日本語";
        let mut lines = Vec::new();
        let transcript =
            read_progress_stream(Fragments(input.as_bytes(), false), |line| lines.push(line));
        assert_eq!(
            phase_percent(&lines, "Counting objects"),
            [Some(20), Some(100)]
        );
        assert_eq!(
            transcript,
            "remote: Counting objects: 100% (5/5), done.\n日本語"
        );
    }

    #[test]
    fn parses_captured_progress_stream() {
        let captured = "remote: Enumerating objects: 62, done.        \rremote: Counting objects:  50% (31/62)        \rremote: Counting objects: 100% (62/62), done.        \rReceiving objects:  98% (61/62)\rReceiving objects: 100% (62/62), 1.16 MiB | 35.94 MiB/s, done.\nResolving deltas: 100% (10/10), done.\nTo /tmp/origin.git\n * [new branch]      HEAD -> main\n";

        let mut lines: Vec<ProgressLine> = Vec::new();
        let transcript = read_progress_stream(captured.as_bytes(), |line| lines.push(line));

        assert_eq!(lines.len(), 6);
        assert_eq!(lines[0].phase, "Enumerating objects");
        assert_eq!(lines[0].percent, None);
        assert_eq!(lines[0].detail, "62, done.");
        assert_eq!(lines[1].phase, "Counting objects");
        assert_eq!(lines[1].percent, Some(50));
        assert_eq!(lines[1].detail, "(31/62)");
        assert_eq!(lines[3].phase, "Receiving objects");
        assert_eq!(lines[3].percent, Some(98));
        assert_eq!(lines[4].percent, Some(100));
        assert_eq!(lines[4].detail, "(62/62), 1.16 MiB | 35.94 MiB/s, done.");
        assert_eq!(lines[5].phase, "Resolving deltas");

        assert!(!transcript.contains("50%"), "transcript: {transcript}");
        assert!(!transcript.contains("98%"), "transcript: {transcript}");
        assert!(transcript.contains("To /tmp/origin.git"));
        assert!(transcript.contains("[new branch]"));
        assert!(transcript.lines().count() < 8);
    }

    #[test]
    fn ignores_non_progress_output() {
        assert!(parse_progress_chunk("Cloning into 'x'...").is_none());
        assert!(parse_progress_chunk("remote: Total 62 (delta 0), reused 0").is_none());
        assert!(parse_progress_chunk("To C:\\repos\\demo").is_none());
        assert!(parse_progress_chunk("fatal: repository 'x' not found").is_none());
        assert!(parse_progress_chunk("").is_none());
        let updating = parse_progress_chunk("Updating files:  67% (2/3)").unwrap();
        assert_eq!(updating.phase, "Updating files");
        assert_eq!(updating.percent, Some(67));
    }

    #[test]
    fn streams_progress_for_push_fetch_and_clone() {
        let bare = temp_path("bare");
        let work = temp_path("work");
        let clone = temp_path("clone");
        std::fs::create_dir_all(&bare.path).unwrap();
        std::fs::create_dir_all(&work.path).unwrap();
        run_git(
            &bare.path,
            &["-c", "init.defaultBranch=main", "init", "--bare", "-q", "."],
        )
        .unwrap();
        run_git(
            &work.path,
            &["-c", "init.defaultBranch=main", "init", "-q", "."],
        )
        .unwrap();
        run_git(&work.path, &["config", "user.email", "test@example.com"]).unwrap();
        run_git(&work.path, &["config", "user.name", "Test"]).unwrap();
        run_git(&work.path, &["config", "commit.gpgsign", "false"]).unwrap();
        for n in 1..=8 {
            std::fs::write(work.path.join(format!("f{n}.txt")), format!("{n}\n")).unwrap();
        }
        run_git(&work.path, &["add", "-A"]).unwrap();
        run_git(&work.path, &["commit", "-q", "-m", "initial"]).unwrap();

        let bare_url = bare.path.to_string_lossy().to_string();
        let (pushed, push_lines) = stream(
            Some(&work.path),
            &["push", "--progress", "-u", &bare_url, "HEAD:main"],
            "test-push",
        );
        assert!(pushed.success, "push failed: {}", pushed.stderr);
        assert!(
            phase_percent(&push_lines, "Writing objects").contains(&Some(100)),
            "phases: {:?}",
            push_lines.iter().map(|l| &l.phase).collect::<Vec<_>>()
        );

        let (cloned, clone_lines) = stream(
            None,
            &[
                "clone",
                "--progress",
                "--no-local",
                &bare_url,
                &clone.path.to_string_lossy(),
            ],
            "test-clone",
        );
        assert!(cloned.success, "clone failed: {}", cloned.stderr);
        assert!(
            phase_percent(&clone_lines, "Receiving objects").contains(&Some(100)),
            "phases: {:?}",
            clone_lines.iter().map(|l| &l.phase).collect::<Vec<_>>()
        );
        assert!(clone_lines.len() > phase_percent(&clone_lines, "Receiving objects").len());

        run_git(&clone.path, &["config", "user.email", "test@example.com"]).unwrap();
        run_git(&clone.path, &["config", "user.name", "Test"]).unwrap();
        run_git(&clone.path, &["config", "commit.gpgsign", "false"]).unwrap();
        std::fs::write(clone.path.join("next.txt"), "next\n").unwrap();
        run_git(&clone.path, &["add", "-A"]).unwrap();
        run_git(&clone.path, &["commit", "-q", "-m", "second"]).unwrap();
        run_git(&clone.path, &["push", "-q", "origin", "HEAD:main"]).unwrap();

        let (fetched, fetch_lines) = stream(
            Some(&work.path),
            &["fetch", "--progress", &bare_url, "main"],
            "test-fetch",
        );
        assert!(fetched.success, "fetch failed: {}", fetched.stderr);
        assert!(
            phase_percent(&fetch_lines, "Counting objects").contains(&Some(100)),
            "phases: {:?}",
            fetch_lines.iter().map(|l| &l.phase).collect::<Vec<_>>()
        );
        assert!(!fetched.canceled);
    }

    #[test]
    fn registry_is_empty_after_completed_op() {
        let repo = temp_path("registry");
        std::fs::create_dir_all(&repo.path).unwrap();
        run_git(&repo.path, &["init", "-q", "."]).unwrap();
        let (outcome, _) = stream(
            Some(&repo.path),
            &["status", "--porcelain"],
            "test-registry",
        );
        assert!(outcome.success);
        assert!(!remote_ops().lock().unwrap().contains_key("test-registry"));
    }

    #[tokio::test]
    async fn cancel_reports_false_for_unknown_op() {
        assert!(!git_remote_cancel("no-such-op".into()).await.unwrap());
    }

    #[tokio::test]
    async fn cancel_kills_running_op_and_its_children() {
        let repo = temp_path("cancel");
        std::fs::create_dir_all(&repo.path).unwrap();
        run_git(&repo.path, &["init", "-q", "."]).unwrap();
        let path = repo.path.clone();
        let started = std::time::Instant::now();
        let runner = tokio::task::spawn_blocking(move || {
            stream(
                Some(&path),
                &["-c", "alias.slowop=!sleep 20", "slowop"],
                "test-cancel",
            )
        });

        let mut registered = false;
        for _ in 0..150 {
            if remote_ops().lock().unwrap().contains_key("test-cancel") {
                registered = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(registered, "op was never registered");
        assert!(git_remote_cancel("test-cancel".into()).await.unwrap());

        let (outcome, _) = runner.await.unwrap();
        assert!(outcome.canceled);
        assert!(!outcome.success);
        assert!(
            started.elapsed() < std::time::Duration::from_secs(15),
            "cancel did not stop the child process"
        );
        assert!(!remote_ops().lock().unwrap().contains_key("test-cancel"));
    }

    #[cfg(unix)]
    #[test]
    fn cancel_stops_helpers_that_ignore_term_even_after_they_close_their_pipes() {
        use std::time::{Duration, Instant};

        for (id, redirect) in [
            ("ignore-term", ""),
            ("ignore-term-closed", "exec >/dev/null 2>&1; "),
        ] {
            let repo = temp_path(id);
            std::fs::create_dir_all(&repo.path).unwrap();
            run_git(&repo.path, &["init", "-q", "."]).unwrap();
            let path = repo.path.clone();
            let runner = std::thread::spawn(move || {
                let alias = format!(
                    "alias.fixture=!{redirect}trap '' TERM; touch ready; \
                     for n in 1 2 3 4 5 6 7 8 9 10; do sleep 0.2; \
                     if test -f release; then touch escaped; break; fi; done"
                );
                stream(Some(&path), &["-c", &alias, "fixture"], id)
            });
            let deadline = Instant::now() + Duration::from_secs(5);
            while !repo.path.join("ready").exists() {
                assert!(Instant::now() < deadline, "helper did not start");
                std::thread::sleep(Duration::from_millis(10));
            }
            let started = Instant::now();
            assert!(cancel_remote_op(id));
            std::fs::write(repo.path.join("release"), "").unwrap();
            assert!(runner.join().unwrap().0.canceled);
            assert!(started.elapsed() < Duration::from_millis(1500));
            std::thread::sleep(Duration::from_millis(350));
            assert!(
                !repo.path.join("escaped").exists(),
                "{id} survived cancellation"
            );
        }
    }
    #[cfg(all(feature = "headless", any(target_os = "macos", target_os = "linux")))]
    #[tokio::test]
    async fn scoped_cancellation_only_stops_the_owned_child_with_the_same_operation_id() {
        use std::sync::Arc;
        use std::time::Duration;

        // An alias gives the actual process runner a bounded synthetic child
        // without changing the fetch contract or hitting an external transport.
        let first = Arc::new(ScopedRemoteCancellation::default());
        let second = Arc::new(ScopedRemoteCancellation::default());
        let launch = |scope: Arc<ScopedRemoteCancellation>| {
            tokio::task::spawn_blocking(move || {
                let args = ["-c", "alias.scopedfixture=!sleep 10", "scopedfixture"].map(str::to_owned);
                let state = scope.state.lock().unwrap();
                run_git_streamed(None, &args, Some("same-id"), None, Some(&scope), Some(state), (), |_| {}).unwrap()
            })
        };
        let owner = launch(first.clone());
        let competitor = launch(second.clone());
        tokio::time::timeout(Duration::from_secs(4), async {
            while first.state.lock().unwrap().running.is_none()
                || second.state.lock().unwrap().running.is_none()
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await.unwrap();
        assert!(!git_remote_cancel("same-id".into()).await.unwrap());
        first.cancel();
        let result = tokio::time::timeout(Duration::from_secs(4), owner).await.unwrap().unwrap();
        assert!(result.canceled);
        assert!(first.state.lock().unwrap().running.is_none());
        assert!(second.state.lock().unwrap().running.is_some());
        second.cancel();
        let result = tokio::time::timeout(Duration::from_secs(4), competitor).await.unwrap().unwrap();
        assert!(result.canceled);
        assert!(second.state.lock().unwrap().running.is_none());
    }

}
