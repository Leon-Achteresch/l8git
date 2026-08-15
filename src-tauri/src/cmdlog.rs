use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const MAX_ENTRIES: usize = 500;
const EVENT_NAME: &str = "git-command";
const MASK: &str = "***";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandEntry {
    pub seq: u64,
    pub repo_path: String,
    pub args: Vec<String>,
    pub exit_ok: bool,
    pub duration_ms: u64,
    pub started_at: String,
}

static SEQ: AtomicU64 = AtomicU64::new(1);

fn buffer() -> &'static Mutex<VecDeque<GitCommandEntry>> {
    static BUF: OnceLock<Mutex<VecDeque<GitCommandEntry>>> = OnceLock::new();
    BUF.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_ENTRIES)))
}

fn lock_buffer() -> MutexGuard<'static, VecDeque<GitCommandEntry>> {
    buffer().lock().unwrap_or_else(|e| e.into_inner())
}

fn app_slot() -> &'static OnceLock<AppHandle> {
    static APP: OnceLock<AppHandle> = OnceLock::new();
    &APP
}

pub(crate) fn set_app_handle(app: AppHandle) {
    let _ = app_slot().set(app);
}

pub(crate) fn app_handle() -> Option<&'static AppHandle> {
    app_slot().get()
}

fn mask_url(value: &str) -> String {
    let Some(scheme) = value.find("://") else {
        return value.to_string();
    };
    let rest_start = scheme + 3;
    let rest = &value[rest_start..];
    let authority_end = rest.find('/').unwrap_or(rest.len());
    let Some(at) = rest[..authority_end].rfind('@') else {
        return value.to_string();
    };
    format!("{}{MASK}@{}", &value[..rest_start], &rest[at + 1..])
}

pub(crate) fn mask_arg(arg: &str) -> String {
    let lower = arg.to_ascii_lowercase();
    let secret_key = lower.contains("authorization")
        || lower.contains("extraheader")
        || lower.contains("password")
        || lower.contains("access_token")
        || lower.contains("api_key");
    if secret_key {
        return match arg.find('=') {
            Some(eq) => format!("{}={MASK}", &arg[..eq]),
            None => MASK.to_string(),
        };
    }
    mask_url(arg)
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let doe = shifted.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

pub(crate) fn iso_from_millis(ms: u64) -> String {
    let secs = (ms / 1000) as i64;
    let millis = ms % 1000;
    let (year, month, day) = civil_from_days(secs.div_euclid(86_400));
    let tod = secs.rem_euclid(86_400);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        tod / 3600,
        (tod % 3600) / 60,
        tod % 60
    )
}

fn iso_now() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    iso_from_millis(ms)
}

fn push_entry(buf: &mut VecDeque<GitCommandEntry>, entry: GitCommandEntry) {
    buf.push_back(entry);
    while buf.len() > MAX_ENTRIES {
        buf.pop_front();
    }
}

fn recent(buf: &VecDeque<GitCommandEntry>, limit: usize) -> Vec<GitCommandEntry> {
    buf.iter().rev().take(limit).cloned().collect()
}

pub(crate) struct CommandSpan {
    repo_path: String,
    args: Vec<String>,
    started_at: String,
    started: Instant,
}

pub(crate) fn start<S: AsRef<str>>(repo_path: &str, args: &[S]) -> CommandSpan {
    CommandSpan {
        repo_path: repo_path.to_string(),
        args: args.iter().map(|a| mask_arg(a.as_ref())).collect(),
        started_at: iso_now(),
        started: Instant::now(),
    }
}

impl CommandSpan {
    pub(crate) fn finish(self, exit_ok: bool) {
        let entry = GitCommandEntry {
            seq: SEQ.fetch_add(1, Ordering::Relaxed),
            repo_path: self.repo_path,
            args: self.args,
            exit_ok,
            duration_ms: self.started.elapsed().as_millis() as u64,
            started_at: self.started_at,
        };
        push_entry(&mut lock_buffer(), entry.clone());
        if let Some(app) = app_handle() {
            let _ = app.emit(EVENT_NAME, &entry);
        }
    }
}

#[tauri::command]
pub fn git_command_log(limit: Option<usize>) -> Vec<GitCommandEntry> {
    let capped = limit.unwrap_or(MAX_ENTRIES).clamp(1, MAX_ENTRIES);
    recent(&lock_buffer(), capped)
}

#[tauri::command]
pub fn git_command_log_clear() {
    lock_buffer().clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(seq: u64) -> GitCommandEntry {
        GitCommandEntry {
            seq,
            repo_path: "/tmp/repo".into(),
            args: vec!["status".into()],
            exit_ok: true,
            duration_ms: 1,
            started_at: iso_from_millis(0),
        }
    }

    #[test]
    fn masks_credentials_embedded_in_urls() {
        assert_eq!(
            mask_arg("https://user:ghp_secret@github.com/acme/repo.git"),
            "https://***@github.com/acme/repo.git"
        );
        assert_eq!(
            mask_arg("https://ghp_secret@github.com/acme/repo.git"),
            "https://***@github.com/acme/repo.git"
        );
        assert_eq!(
            mask_arg("http://bot:pw@gitlab.local:8080/team/x.git"),
            "http://***@gitlab.local:8080/team/x.git"
        );
        assert_eq!(
            mask_arg("http.extraheader=Authorization: Basic aGVsbG8="),
            "http.extraheader=***"
        );
    }

    #[test]
    fn keeps_harmless_args_untouched() {
        assert_eq!(mask_arg("fetch"), "fetch");
        assert_eq!(mask_arg("--prune"), "--prune");
        assert_eq!(
            mask_arg("https://github.com/acme/repo.git"),
            "https://github.com/acme/repo.git"
        );
        assert_eq!(
            mask_arg("git@github.com:acme/repo.git"),
            "git@github.com:acme/repo.git"
        );
        assert_eq!(mask_arg("origin/main@{u}"), "origin/main@{u}");
    }

    #[test]
    fn ring_buffer_trims_to_capacity_and_keeps_newest() {
        let mut buf: VecDeque<GitCommandEntry> = VecDeque::new();
        for seq in 1..=(MAX_ENTRIES as u64 + 100) {
            push_entry(&mut buf, entry(seq));
        }
        assert_eq!(buf.len(), MAX_ENTRIES);
        assert_eq!(buf.front().unwrap().seq, 101);
        assert_eq!(buf.back().unwrap().seq, MAX_ENTRIES as u64 + 100);

        let newest = recent(&buf, 3);
        assert_eq!(
            newest.iter().map(|e| e.seq).collect::<Vec<_>>(),
            vec![600, 599, 598]
        );
        assert_eq!(recent(&buf, MAX_ENTRIES * 4).len(), MAX_ENTRIES);
    }

    #[test]
    fn formats_iso_timestamps_in_utc() {
        assert_eq!(iso_from_millis(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_from_millis(1_700_000_000_123), "2023-11-14T22:13:20.123Z");
    }

    #[test]
    fn span_records_masked_args() {
        let marker = format!("/tmp/l8git-cmdlog-{}", std::process::id());
        start(
            &marker,
            &["clone", "https://u:p@example.com/x.git", "/tmp/x"],
        )
        .finish(true);
        let logged = git_command_log(None)
            .into_iter()
            .find(|e| e.repo_path == marker)
            .expect("entry recorded");
        assert_eq!(logged.args[0], "clone");
        assert_eq!(logged.args[1], "https://***@example.com/x.git");
        assert!(logged.exit_ok);
        assert!(logged.started_at.ends_with('Z'));
        assert!(logged.seq > 0);
    }
}
