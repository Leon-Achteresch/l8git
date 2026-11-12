use super::*;

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

type AggCache<T> = HashMap<String, (String, T)>;

const AGG_CACHE_MAX: usize = 50;

fn contributor_cache() -> &'static std::sync::Mutex<AggCache<Vec<ContributorStat>>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<AggCache<Vec<ContributorStat>>>> =
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
    let (cached_head, value) = map.get(key)?;
    (cached_head == head).then(|| value.clone())
}

fn agg_cache_put<T>(
    cache: &'static std::sync::Mutex<AggCache<T>>,
    key: String,
    head: String,
    value: T,
) {
    let Ok(mut map) = cache.lock() else { return };
    if map.len() >= AGG_CACHE_MAX && !map.contains_key(&key) {
        map.clear();
    }
    map.insert(key, (head, value));
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

fn collect_contributor_stats(
    repo: &PathBuf,
    days: u32,
    include_merges: bool,
) -> Result<Vec<ContributorStat>, String> {
    let since = since_arg(days);
    let mut args: Vec<&str> = vec!["log"];
    if !include_merges {
        args.push("--no-merges");
    }
    args.extend_from_slice(&[&since, "--numstat", "--pretty=format:%x00%aN%x1f%aE"]);
    let out = run_git(repo, &args)?;

    let mut map: HashMap<(String, String), (u32, u32, u32)> = HashMap::new();
    let mut current: Option<(String, String)> = None;
    for raw_line in out.split('\n') {
        if let Some(rest) = raw_line.strip_prefix('\u{0}') {
            let mut parts = rest.splitn(2, '\u{001f}');
            let name = parts.next().unwrap_or("").trim().to_string();
            let email = parts.next().unwrap_or("").trim().to_string();
            if name.is_empty() && email.is_empty() {
                current = None;
                continue;
            }
            let key = (name.clone(), email.clone());
            map.entry(key.clone()).or_insert((0, 0, 0)).0 += 1;
            current = Some(key);
            continue;
        }
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let Some(key) = current.as_ref() else {
            continue;
        };
        let mut fields = line.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        if adds_s == "-" || dels_s == "-" {
            continue;
        }
        let adds: u32 = adds_s.parse().unwrap_or(0);
        let dels: u32 = dels_s.parse().unwrap_or(0);
        let entry = map.entry(key.clone()).or_insert((0, 0, 0));
        entry.1 += adds;
        entry.2 += dels;
    }

    let mut stats: Vec<ContributorStat> = map
        .into_iter()
        .map(
            |((name, email), (commits, insertions, deletions))| ContributorStat {
                name,
                email,
                commits,
                insertions,
                deletions,
            },
        )
        .collect();
    stats.sort_by(|a, b| {
        b.commits
            .cmp(&a.commits)
            .then(b.insertions.cmp(&a.insertions))
    });
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
        let repo = PathBuf::from(&path);
        let merges = include_merges.unwrap_or(false);
        let head = agg_head_oid(&repo);
        let key = format!("{}|{since_days}|{merges}", repo.to_string_lossy());
        let mut stats = match head
            .as_deref()
            .and_then(|oid| agg_cache_get(contributor_cache(), &key, oid))
        {
            Some(hit) => hit,
            None => {
                let fresh = collect_contributor_stats(&repo, since_days, merges)?;
                if let Some(oid) = head {
                    agg_cache_put(contributor_cache(), key, oid, fresh.clone());
                }
                fresh
            }
        };
        if let Some(n) = limit {
            stats.truncate(n as usize);
        }
        Ok(stats)
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
    let mut args: Vec<&str> = vec!["log"];
    if !include_merges {
        args.push("--no-merges");
    }
    args.extend_from_slice(&[&since, "--numstat", "--pretty=format:%x00%ct"]);
    let out = run_git(repo, &args)?;

    let mut by_key: std::collections::BTreeMap<String, (u32, u32, u32)> =
        std::collections::BTreeMap::new();
    let mut current_key: Option<String> = None;
    for raw_line in out.split('\n') {
        if let Some(rest) = raw_line.strip_prefix('\u{0}') {
            let ts: i64 = rest.trim().parse().unwrap_or(0);
            if ts <= 0 {
                current_key = None;
                continue;
            }
            let key = bucket_key(ts, bucket);
            by_key.entry(key.clone()).or_insert((0, 0, 0)).0 += 1;
            current_key = Some(key);
            continue;
        }
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let Some(key) = current_key.as_ref() else {
            continue;
        };
        let mut fields = line.splitn(3, '\t');
        let adds_s = fields.next().unwrap_or("");
        let dels_s = fields.next().unwrap_or("");
        if adds_s == "-" || dels_s == "-" {
            continue;
        }
        let adds: u32 = adds_s.parse().unwrap_or(0);
        let dels: u32 = dels_s.parse().unwrap_or(0);
        let entry = by_key.entry(key.clone()).or_insert((0, 0, 0));
        entry.1 += adds;
        entry.2 += dels;
    }

    Ok(by_key
        .into_iter()
        .map(
            |(bucket, (commits, insertions, deletions))| ActivityBucket {
                bucket,
                commits,
                insertions,
                deletions,
            },
        )
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

fn collect_repo_overview(path: String) -> RepoOverview {
    let repo = PathBuf::from(&path);
    let name = repo
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let head_ok = run_git(&repo, &["rev-parse", "--git-dir"]).is_ok();
    if !head_ok {
        return RepoOverview {
            path,
            name,
            branch: String::new(),
            ahead: 0,
            behind: 0,
            dirty_count: 0,
            last_commit_at: None,
            commits_last_30d: vec![0; 30],
            error: Some("not a git repository".into()),
        };
    }

    let branch = run_git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let sync = compute_upstream_sync(&repo);

    let dirty_count = match run_git(
        &repo,
        &["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
    ) {
        Ok(out) => out.split('\0').filter(|s| !s.is_empty()).count() as u32,
        Err(_) => 0,
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
