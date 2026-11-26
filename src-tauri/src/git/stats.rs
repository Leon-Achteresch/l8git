use super::*;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

#[derive(Serialize, Clone)]
pub struct ContributorStat {
    pub name: String,
    pub email: String,
    pub commits: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Serialize, Clone)]
pub struct ActivityBucket {
    pub bucket: String,
    pub commits: u32,
    pub insertions: u32,
    pub deletions: u32,
}

struct AggEntry<T> {
    head: String,
    recorded: Instant,
    value: T,
}

impl<T> AggEntry<T> {
    fn is_fresh(&self, head: &str, now: Instant) -> bool {
        self.head == head && now.duration_since(self.recorded) < AGG_CACHE_TTL
    }
}

type AggCache<T> = HashMap<String, AggEntry<T>>;

const AGG_CACHE_MAX: usize = 50;
// The sliding --since window changes even while HEAD stays fixed.
const AGG_CACHE_TTL: Duration = Duration::from_secs(5 * 60);

type RankedContributors = Arc<Vec<ContributorStat>>;

fn contributor_cache() -> &'static std::sync::Mutex<AggCache<RankedContributors>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<AggCache<RankedContributors>>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn activity_cache() -> &'static std::sync::Mutex<AggCache<Vec<ActivityBucket>>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<AggCache<Vec<ActivityBucket>>>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn agg_head_oid(repo: &PathBuf) -> Option<String> {
    run_git(repo, &["rev-parse", "HEAD"])
        .ok()
        .map(|out| out.trim().to_string())
        .filter(|oid| !oid.is_empty())
}

fn agg_cache_get<T: Clone>(
    cache: &'static std::sync::Mutex<AggCache<T>>,
    key: &str,
    head: &str,
) -> Option<T> {
    let map = cache.lock().ok()?;
    let entry = map.get(key)?;
    entry
        .is_fresh(head, Instant::now())
        .then(|| entry.value.clone())
}

fn agg_cache_put<T>(cache: &std::sync::Mutex<AggCache<T>>, key: String, head: String, value: T) {
    let Ok(mut map) = cache.lock() else { return };
    if map.len() >= AGG_CACHE_MAX && !map.contains_key(&key) {
        let oldest = map
            .iter()
            .min_by_key(|(_, entry)| entry.recorded)
            .map(|(key, _)| key.clone());
        if let Some(oldest) = oldest {
            map.remove(&oldest);
        }
    }
    map.insert(
        key,
        AggEntry {
            head,
            recorded: Instant::now(),
            value,
        },
    );
}

#[cfg(test)]
mod cache_tests {
    use super::*;

    #[test]
    fn contributor_summary_counts_every_author_and_only_transfers_the_leaders() {
        let stats: Vec<_> = (1..=70)
            .rev()
            .map(|commits| ContributorStat {
                name: commits.to_string(),
                email: String::new(),
                commits,
                insertions: 0,
                deletions: 0,
            })
            .collect();
        let summary = ContributorSummary::from_ranked(&stats);
        assert_eq!(summary.total, 70);
        assert_eq!(
            summary
                .leaders
                .iter()
                .map(|r| r.commits)
                .collect::<Vec<_>>(),
            [70, 69, 68, 67, 66]
        );
        assert_eq!(summary.other_commits, (1..=65u64).sum::<u64>());
        let empty = ContributorSummary::from_ranked(&[]);
        assert_eq!(
            (empty.total, empty.leaders.len(), empty.other_commits),
            (0, 0, 0)
        );
    }

    #[test]
    fn dashboard_statistics_expire_for_an_unchanged_head() {
        let now = Instant::now();
        let entry = AggEntry {
            head: "a".into(),
            recorded: now,
            value: 1,
        };
        assert!(entry.is_fresh("a", now + AGG_CACHE_TTL - Duration::from_millis(1)));
        assert!(!entry.is_fresh("a", now + AGG_CACHE_TTL));
        assert!(!entry.is_fresh("b", now));
    }

    #[test]
    fn adding_a_dashboard_view_evicts_only_the_oldest_result() {
        let cache = std::sync::Mutex::new(HashMap::new());
        let start = Instant::now();
        for n in 0..AGG_CACHE_MAX {
            cache.lock().unwrap().insert(
                n.to_string(),
                AggEntry {
                    head: "a".into(),
                    recorded: start + Duration::from_millis(n as u64),
                    value: n,
                },
            );
        }
        agg_cache_put(&cache, "new".into(), "b".into(), 100);
        agg_cache_put(&cache, "1".into(), "c".into(), 200);
        let map = cache.lock().unwrap();
        assert_eq!(map.len(), AGG_CACHE_MAX);
        assert!(!map.contains_key("0"));
        assert_eq!(map["1"].value, 200);
        assert_eq!(map["new"].value, 100);
    }
}

#[derive(Serialize)]
pub struct RepoOverview {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub dirty_count: u32,
    pub last_commit_at: Option<i64>,
    pub commits_last_30d: Vec<u32>,
    pub error: Option<String>,
}

fn since_arg(days: u32) -> String {
    format!("--since={days}.days.ago")
}

#[derive(Default)]
struct ChangeTotals {
    commits: u32,
    insertions: u32,
    deletions: u32,
}

impl ChangeTotals {
    fn record_file(&mut self, line: &str) {
        let mut fields = line.splitn(3, '\t');
        if let (Some(added), Some(deleted), Some(_path)) =
            (fields.next(), fields.next(), fields.next())
        {
            if let (Ok(added), Ok(deleted)) = (added.parse::<u32>(), deleted.parse::<u32>()) {
                self.insertions = self.insertions.saturating_add(added);
                self.deletions = self.deletions.saturating_add(deleted);
            }
        }
    }
}

fn collect_contributor_stats(
    repo: &PathBuf,
    days: u32,
    include_merges: bool,
) -> Result<Vec<ContributorStat>, String> {
    let since = since_arg(days);
    let mut args: Vec<&str> = vec!["log", "--no-show-signature", "--no-notes"];
    if !include_merges {
        args.push("--no-merges");
    }
    args.extend_from_slice(&[&since, "--numstat", "--pretty=format:%x00%aN%x00%aE"]);
    let out = run_git(repo, &args)?;

    let mut map = HashMap::<(&str, &str), ChangeTotals>::new();
    let mut current: Option<&mut ChangeTotals> = None;
    for line in out.lines() {
        if let Some(header) = line.strip_prefix('\0') {
            current = header
                .split_once('\0')
                .filter(|(name, email)| !name.is_empty() || !email.is_empty())
                .map(|key| {
                    let totals = map.entry(key).or_default();
                    totals.commits = totals.commits.saturating_add(1);
                    totals
                });
        } else if let Some(totals) = &mut current {
            totals.record_file(line);
        }
    }
    let mut stats: Vec<ContributorStat> = map
        .into_iter()
        .map(|((name, email), totals)| ContributorStat {
            name: name.into(),
            email: email.into(),
            commits: totals.commits,
            insertions: totals.insertions,
            deletions: totals.deletions,
        })
        .collect();
    stats.sort_by(|a, b| {
        b.commits
            .cmp(&a.commits)
            .then(b.insertions.cmp(&a.insertions))
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.email.cmp(&b.email))
    });
    Ok(stats)
}

fn ranked_contributors(
    path: String,
    since_days: u32,
    merges: bool,
) -> Result<RankedContributors, String> {
    let repo = PathBuf::from(&path);
    let head = agg_head_oid(&repo);
    let key = format!("{path}|{since_days}|{merges}");
    if let Some(hit) = head
        .as_deref()
        .and_then(|oid| agg_cache_get(contributor_cache(), &key, oid))
    {
        return Ok(hit);
    }
    let stats = Arc::new(collect_contributor_stats(&repo, since_days, merges)?);
    if let Some(oid) = head {
        agg_cache_put(contributor_cache(), key, oid, Arc::clone(&stats));
    }
    Ok(stats)
}

#[tauri::command]
pub async fn repo_contributor_stats(
    path: String,
    since_days: u32,
    limit: Option<u32>,
    include_merges: Option<bool>,
) -> Result<Vec<ContributorStat>, String> {
    spawn_git(move || {
        let stats = ranked_contributors(path, since_days, include_merges.unwrap_or(false))?;
        let count = limit.map_or(stats.len(), |n| stats.len().min(n as usize));
        Ok(stats[..count].to_vec())
    })
    .await
}

#[derive(Serialize)]
pub struct ContributorSummary {
    total: usize,
    leaders: Vec<ContributorStat>,
    other_commits: u64,
}

impl ContributorSummary {
    fn from_ranked(stats: &[ContributorStat]) -> Self {
        let total = stats.len();
        let other_commits = stats.iter().skip(5).map(|row| u64::from(row.commits)).sum();
        let leaders = stats[..5.min(total)].to_vec();
        Self {
            total,
            leaders,
            other_commits,
        }
    }
}

#[tauri::command]
pub async fn repo_contributor_summary(
    path: String,
    since_days: u32,
) -> Result<ContributorSummary, String> {
    spawn_git(move || {
        let stats = ranked_contributors(path, since_days, false)?;
        Ok(ContributorSummary::from_ranked(&stats))
    })
    .await
}

fn days_since_epoch(ts: i64) -> i64 {
    ts.div_euclid(86_400)
}

fn ymd_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

fn bucket_key(ts: i64, bucket: &str) -> String {
    let day = days_since_epoch(ts);
    match bucket {
        "month" => {
            let (y, m, _d) = ymd_from_days(day);
            format!("{y:04}-{m:02}-01")
        }
        "week" => {
            // epoch day 0 (1970-01-01) was a Thursday; Monday-aligned start.
            let weekday = (day + 3).rem_euclid(7);
            let monday = day - weekday;
            let (y, m, d) = ymd_from_days(monday);
            format!("{y:04}-{m:02}-{d:02}")
        }
        _ => {
            let (y, m, d) = ymd_from_days(day);
            format!("{y:04}-{m:02}-{d:02}")
        }
    }
}

fn collect_activity_buckets(
    repo: &PathBuf,
    days: u32,
    bucket: &str,
    include_merges: bool,
) -> Result<Vec<ActivityBucket>, String> {
    let since = since_arg(days);
    let mut args: Vec<&str> = vec!["log", "--no-show-signature", "--no-notes"];
    if !include_merges {
        args.push("--no-merges");
    }
    args.extend_from_slice(&[&since, "--numstat", "--pretty=format:%x00%ct"]);
    let out = run_git(repo, &args)?;

    let mut by_key = std::collections::BTreeMap::<String, ChangeTotals>::new();
    let mut current: Option<&mut ChangeTotals> = None;
    for line in out.lines() {
        if let Some(header) = line.strip_prefix('\0') {
            current = header.parse::<i64>().ok().filter(|ts| *ts > 0).map(|ts| {
                let totals = by_key.entry(bucket_key(ts, bucket)).or_default();
                totals.commits = totals.commits.saturating_add(1);
                totals
            });
        } else if let Some(totals) = &mut current {
            totals.record_file(line);
        }
    }
    Ok(by_key
        .into_iter()
        .map(|(bucket, totals)| ActivityBucket {
            bucket,
            commits: totals.commits,
            insertions: totals.insertions,
            deletions: totals.deletions,
        })
        .collect())
}

#[tauri::command]
pub async fn repo_activity_buckets(
    path: String,
    since_days: u32,
    bucket: String,
    include_merges: Option<bool>,
) -> Result<Vec<ActivityBucket>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let kind = match bucket.as_str() {
            "month" | "week" | "day" => bucket.as_str(),
            _ => "day",
        };
        let merges = include_merges.unwrap_or(false);
        let head = agg_head_oid(&repo);
        let key = format!("{}|{since_days}|{kind}|{merges}", repo.to_string_lossy());
        if let Some(hit) = head
            .as_deref()
            .and_then(|oid| agg_cache_get(activity_cache(), &key, oid))
        {
            return Ok(hit);
        }
        let fresh = collect_activity_buckets(&repo, since_days, kind, merges)?;
        if let Some(oid) = head {
            agg_cache_put(activity_cache(), key, oid, fresh.clone());
        }
        Ok(fresh)
    })
    .await
}

/// Porcelain v2 puts branch information and changes in one status snapshot.
fn overview_status(repo: &PathBuf) -> Result<(String, UpstreamSyncCounts, u32), String> {
    let status = run_git(
        repo,
        &[
            "--no-optional-locks",
            "status",
            "--porcelain=v2",
            "-z",
            "--branch",
            "--ahead-behind",
            "--untracked-files=normal",
        ],
    );
    let mut branch = String::new();
    let mut sync = UpstreamSyncCounts {
        ahead: 0,
        behind: 0,
    };
    let mut changed = 0u32;
    let raw = match status {
        Ok(raw) => raw,
        Err(error) => {
            // A bare repository still has branch/history data but no worktree status.
            if !run_git(repo, &["rev-parse", "--is-bare-repository"])
                .is_ok_and(|bare| bare.trim() == "true")
            {
                return Err(error);
            }
            let branch = run_git(repo, &["symbolic-ref", "--short", "HEAD"])
                .unwrap_or_else(|_| "HEAD".into());
            return Ok((branch.trim().into(), compute_upstream_sync(repo), 0));
        }
    };
    let mut records = raw.split_terminator('\0');
    while let Some(record) = records.next() {
        if let Some(name) = record.strip_prefix("# branch.head ") {
            branch = if name == "(detached)" { "HEAD" } else { name }.into();
        } else if let Some(counts) = record.strip_prefix("# branch.ab +") {
            if let Some((ahead, behind)) = counts.split_once(" -") {
                sync.ahead = ahead.parse().unwrap_or(0);
                sync.behind = behind.parse().unwrap_or(0);
            }
        } else if record.starts_with("2 ") {
            records.next(); // Previous name belongs to this rename/copy entry.
            changed += 1;
        } else if record.starts_with("1 ") || record.starts_with("? ") || record.starts_with("u ") {
            changed += 1;
        }
    }
    Ok((branch, sync, changed))
}

fn collect_repo_overview(path: String) -> RepoOverview {
    let repo = PathBuf::from(&path);
    let name = repo
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let (branch, sync, dirty_count) = match overview_status(&repo) {
        Ok(status) => status,
        Err(error) => {
            return RepoOverview {
                path,
                name,
                branch: String::new(),
                ahead: 0,
                behind: 0,
                dirty_count: 0,
                last_commit_at: None,
                commits_last_30d: vec![0; 30],
                error: Some(error),
            }
        }
    };

    let last_commit_at = run_git(&repo, &["log", "-1", "--format=%ct"])
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok());

    let mut counts = vec![0u32; 30];
    if let Ok(out) = run_git(
        &repo,
        &[
            "log",
            "--no-merges",
            "--since=30.days.ago",
            "--pretty=format:%ct",
        ],
    ) {
        let now_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let now_day = days_since_epoch(now_secs);
        for line in out.lines() {
            let ts: i64 = match line.trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let days_ago = now_day - days_since_epoch(ts);
            if (0..30).contains(&days_ago) {
                let idx = 29 - days_ago as usize;
                counts[idx] = counts[idx].saturating_add(1);
            }
        }
    }

    RepoOverview {
        path,
        name,
        branch,
        ahead: sync.ahead,
        behind: sync.behind,
        dirty_count,
        last_commit_at,
        commits_last_30d: counts,
        error: None,
    }
}

#[tauri::command]
pub async fn repos_overview(paths: Vec<String>) -> Result<Vec<RepoOverview>, String> {
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
    let mut handles = Vec::with_capacity(paths.len());
    for p in paths {
        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| e.to_string())?;
        handles.push(tokio::task::spawn_blocking(move || {
            let _permit = permit;
            collect_repo_overview(p)
        }));
    }
    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        match h.await {
            Ok(ov) => out.push(ov),
            Err(_) => continue,
        }
    }
    Ok(out)
}
