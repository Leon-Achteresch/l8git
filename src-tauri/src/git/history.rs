use super::*;

/// Filter before pagination so a branch never depends on the loaded all-refs window.
#[derive(Clone, Default, serde::Deserialize, serde::Serialize)]
#[serde(default)]
pub struct HistoryFilter {
    pub refs: Vec<String>,
    pub author: String,
    pub since: String,
    pub until: String,
    pub query: String,
    pub file: String,
}

/// A history row plus, for single-file history, the file's path at that commit.
#[derive(Clone, Serialize)]
pub struct HistoryEntry {
    #[serde(flatten)]
    commit: Commit,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    /// Set on the commit that renamed the file into `path`.
    #[serde(skip_serializing_if = "Option::is_none")]
    previous_path: Option<String>,
}

/// `--follow` takes exactly one file; directories and pathspec magic keep plain history.
fn follows_renames(repo: &Path, file: &str) -> bool {
    !file.is_empty() && !file.starts_with(':') && !file.ends_with('/')
        && !file.contains(['*', '?', '[']) && !repo.join(file).is_dir()
}

/// Parses `log -z --name-status` output: each NUL-terminated commit record may be
/// followed by `\n<status>\0<path>\0[<new path>\0]` entries.
fn parse_follow_log(raw: &str) -> Vec<HistoryEntry> {
    let mut entries: Vec<(String, Vec<Vec<String>>)> = Vec::new();
    let mut tokens = raw.split('\0').filter(|token| !token.is_empty());
    while let Some(token) = tokens.next() {
        if let Some(status) = token.strip_prefix('\n') {
            let mut fields = vec![status.to_string()];
            let paths = if status.starts_with(['R', 'C']) { 2 } else { 1 };
            fields.extend(tokens.by_ref().take(paths).map(str::to_string));
            if let Some((_, changes)) = entries.last_mut() { changes.push(fields); }
        } else {
            entries.push((token.to_string(), Vec::new()));
        }
    }
    entries.into_iter().filter_map(|(record, changes)| {
        let commit = parse_commit_log(&record).pop()?;
        // Merges list no change, and a deleted directory may list several: leave the path unknown.
        let (path, previous_path) = match changes.as_slice() {
            [change] if change.len() == 3 && change[0].starts_with('R') => (change.get(2).cloned(), change.get(1).cloned()),
            [change] => (change.last().cloned(), None),
            _ => (None, None),
        };
        Some(HistoryEntry { commit, path, previous_path })
    }).collect()
}

/// `--follow` cannot skip, so each page re-reads all earlier rows. Windows are cached per repo path
/// and log arguments, valid while refs, Git configuration and history boundaries are unchanged.
struct FollowWindow { state: String, max_count: usize, entries: Vec<HistoryEntry> }

// shortcut: pages beyond the bounded window use uncached reads; use a streaming cursor if deeper paging is common.
const FOLLOW_CACHE_SLOTS: usize = 8;
const FOLLOW_CACHE_MAX_WINDOW: usize = 4096;
const FOLLOW_CACHE_MAX_BYTES: usize = 4 << 20;

fn follow_cache() -> &'static std::sync::Mutex<Vec<(String, FollowWindow)>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<Vec<(String, FollowWindow)>>> = std::sync::OnceLock::new();
    CACHE.get_or_init(Default::default)
}

fn follow_state(repo: &PathBuf) -> Option<String> {
    let refs = run_git(repo, &["show-ref", "--head"]).ok()?;
    let config = run_git(repo, &["config", "--null", "--list"]).ok()?;
    let mut state = format!("{refs}\0{config}");
    let paths = run_git(repo, &["rev-parse", "--git-path", "shallow", "--git-path", "info/grafts"]).ok()?;
    let mut paths = paths.lines();
    for name in ["shallow", "info/grafts"] {
        let path = PathBuf::from(paths.next()?);
        let path = if path.is_absolute() { path } else { repo.join(path) };
        let metadata = match std::fs::metadata(path) {
            Ok(metadata) => Some((metadata.len(), metadata.modified().ok()?)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => return None,
        };
        state.push_str(&format!("\0{name}:{metadata:?}"));
    }
    paths.next().is_none().then_some(state)
}

#[cfg(test)]
static FOLLOW_FETCHES: std::sync::Mutex<Vec<(PathBuf, usize)>> = std::sync::Mutex::new(Vec::new());

fn is_date_only(value: &str) -> bool {
    value.len() == 10 && value.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

/// Rows `skip..skip + limit` of a `--follow` log, reusing and geometrically growing a cached window.
fn follow_page(repo: &PathBuf, args: &[String], cacheable: bool, skip: usize, limit: usize) -> Result<Vec<HistoryEntry>, String> {
    let need = skip.saturating_add(limit);
    let key = format!("{}\0{}", repo.display(), args.join("\0"));
    let state = if cacheable && need <= FOLLOW_CACHE_MAX_WINDOW { follow_state(repo) } else { None };
    let mut window = need;
    if let (Some(state), Ok(cache)) = (&state, follow_cache().lock()) {
        if let Some((_, cached)) = cache.iter().find(|(k, w)| *k == key && w.state == *state) {
            if cached.max_count >= need || cached.entries.len() < cached.max_count {
                return Ok(cached.entries.iter().skip(skip).take(limit).cloned().collect());
            }
            window = need.max(cached.max_count * 2).min(FOLLOW_CACHE_MAX_WINDOW);
        }
    }
    let mut full = args.to_vec();
    full.insert(1, format!("--max-count={window}"));
    #[cfg(test)]
    FOLLOW_FETCHES.lock().unwrap().push((repo.clone(), window));
    let raw = run_git(repo, &full.iter().map(String::as_str).collect::<Vec<_>>())?;
    let entries = parse_follow_log(&raw);
    let page = entries.iter().skip(skip).take(limit).cloned().collect();
    // A ref/config change during log must not publish rows under the pre-read state.
    let state = state.filter(|state| follow_state(repo).as_ref() == Some(state));
    if let (Some(state), true, Ok(mut cache)) = (state, raw.len() <= FOLLOW_CACHE_MAX_BYTES, follow_cache().lock()) {
        cache.retain(|(k, _)| *k != key);
        if cache.len() >= FOLLOW_CACHE_SLOTS { cache.remove(0); }
        cache.push((key, FollowWindow { state, max_count: window, entries }));
    }
    Ok(page)
}

#[tauri::command]
pub async fn repo_history_page(path: String, filter: HistoryFilter, skip: usize, limit: usize) -> Result<Vec<HistoryEntry>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let limit = limit.clamp(1, 500);
        let follow = follows_renames(&repo, &filter.file);
        let mut args = vec!["log".to_string(), "-z".into(), "--date-order".into()];
        // `--skip` drops commits before `--follow` sees them, losing renames and file commits:
        // `follow_page` fetches through the page and skips in Rust instead.
        if !follow { args.extend([format!("--max-count={limit}"), format!("--skip={skip}")]); }
        args.push("--format=%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%P%x1f%s%x1f%b".into());
        for (flag, value) in [("--author", &filter.author), ("--since", &filter.since), ("--until", &filter.until), ("--grep", &filter.query)] {
            if !value.trim().is_empty() {
                let value = value.trim();
                // A date-only upper bound includes that whole local calendar day.
                let suffix = if is_date_only(value) {
                    if flag == "--until" { " 23:59:59" } else if flag == "--since" { " 00:00:00" } else { "" }
                } else { "" };
                args.push(format!("{flag}={value}{suffix}"));
            }
        }
        args.extend(["--fixed-strings".into(), "--regexp-ignore-case".into()]);
        if filter.refs.is_empty() { args.extend(["--exclude=refs/t3/*".into(), "--all".into()]); }
        for reference in &filter.refs {
            // Resolve to an object ID rather than passing user-controlled flags.
            if reference.starts_with('-') { return Err("Invalid revision".into()); }
            let hash = run_git(&repo, &["rev-parse", "--verify", &format!("{reference}^{{commit}}")])?;
            args.push(hash.trim().to_string());
        }
        if follow { args.extend(["--follow".into(), "--name-status".into()]); }
        args.push("--".into());
        if !filter.file.is_empty() { args.push(filter.file.clone()); }
        let mut entries: Vec<HistoryEntry> = if follow {
            // Relative dates ("2 weeks ago") move with the clock, so only absolute day bounds are cached.
            let cacheable = [&filter.since, &filter.until].iter().all(|v| v.trim().is_empty() || is_date_only(v.trim()));
            follow_page(&repo, &args, cacheable, skip, limit)?
        } else {
            let raw = run_git(&repo, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
            parse_commit_log(&raw).into_iter().map(|commit| HistoryEntry { commit, path: None, previous_path: None }).collect()
        };
        let tags = tags_by_target(&repo);
        for entry in &mut entries { apply_tags(std::slice::from_mut(&mut entry.commit), &tags); }
        Ok(entries)
    }).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git(repo: &PathBuf, args: &[&str]) { run_git(repo, args).unwrap(); }

    #[tokio::test]
    async fn single_file_history_follows_renames_across_pages() {
        let repo = std::env::temp_dir().join(format!("l8git-history-follow-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&repo);
        std::fs::create_dir_all(repo.join("src")).unwrap();
        let setup: [&[&str]; 5] = [&["-c", "init.defaultBranch=main", "init", "-q", "."], &["config", "user.email", "t@example.com"],
            &["config", "user.name", "T"], &["config", "commit.gpgsign", "false"], &["config", "core.autocrlf", "false"]];
        for args in setup { git(&repo, args); }
        let commit = |file: &str, line: &str, message: &str| {
            let target = repo.join(file);
            let mut text = std::fs::read_to_string(&target).unwrap_or_default();
            text.push_str(line);
            std::fs::write(&target, text).unwrap();
            git(&repo, &["add", "-A"]);
            git(&repo, &["commit", "-qm", message]);
        };
        commit("src/old.txt", "a\nb\nc\nd\n", "one");
        commit("src/old.txt", "e\n", "two");
        git(&repo, &["mv", "src/old.txt", "src/new.txt"]);
        git(&repo, &["commit", "-qm", "rename"]);
        commit("src/new.txt", "f\n", "three");

        let filter = HistoryFilter { file: "src/new.txt".into(), ..Default::default() };
        let mut entries = repo_history_page(repo.to_string_lossy().into(), filter.clone(), 0, 2).await.unwrap();
        entries.extend(repo_history_page(repo.to_string_lossy().into(), filter, 2, 2).await.unwrap());
        let rows: Vec<_> = entries.iter().map(|e| (e.commit.subject.as_str(), e.path.as_deref(), e.previous_path.as_deref())).collect();
        assert_eq!(rows, [
            ("three", Some("src/new.txt"), None),
            ("rename", Some("src/new.txt"), Some("src/old.txt")),
            ("two", Some("src/old.txt"), None),
            ("one", Some("src/old.txt"), None),
        ]);

        // Directory history keeps plain pathspec semantics.
        let dir = HistoryFilter { file: "src".into(), ..Default::default() };
        let entries = repo_history_page(repo.to_string_lossy().into(), dir, 0, 10).await.unwrap();
        assert_eq!(entries.len(), 4);
        assert!(entries.iter().all(|e| e.path.is_none()));
        let _ = std::fs::remove_dir_all(&repo);
    }

    #[tokio::test]
    async fn follow_pages_reuse_a_growing_cached_window_until_refs_change() {
        let repo = std::env::temp_dir().join(format!("l8git-history-follow-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&repo);
        std::fs::create_dir_all(&repo).unwrap();
        let setup: [&[&str]; 5] = [&["-c", "init.defaultBranch=main", "init", "-q", "."], &["config", "user.email", "t@example.com"],
            &["config", "user.name", "T"], &["config", "commit.gpgsign", "false"], &["config", "core.autocrlf", "false"]];
        for args in setup { git(&repo, args); }
        let commit = |file: &str, message: &str| {
            let target = repo.join(file);
            let mut text = std::fs::read_to_string(&target).unwrap_or_else(|_| "base\nlines\nkeep\nrename\n".into());
            text.push_str(message);
            text.push('\n');
            std::fs::write(&target, text).unwrap();
            git(&repo, &["add", "-A"]);
            git(&repo, &["commit", "-qm", message]);
        };
        for i in 0..6 { commit("old.txt", &format!("old{i}")); }
        git(&repo, &["mv", "old.txt", "new.txt"]);
        git(&repo, &["commit", "-qm", "rename"]);
        for i in 0..5 { commit("new.txt", &format!("new{i}")); }
        commit("other.txt", "unrelated");

        let path: String = repo.to_string_lossy().into();
        let fetches = || FOLLOW_FETCHES.lock().unwrap().iter().filter(|(r, _)| *r == repo).map(|(_, w)| *w).collect::<Vec<_>>();
        let subjects = |entries: Vec<HistoryEntry>| entries.into_iter().map(|e| e.commit.subject).collect::<Vec<_>>();
        let file = HistoryFilter { file: "new.txt".into(), ..Default::default() };
        let mut all = Vec::new();
        for page in 0..6 { all.extend(subjects(repo_history_page(path.clone(), file.clone(), page * 2, 2).await.unwrap())); }
        let expected: Vec<String> = (0..5).rev().map(|i| format!("new{i}")).chain(["rename".into()])
            .chain((0..6).rev().map(|i| format!("old{i}"))).collect();
        assert_eq!(all, expected);
        // Six pages need four log runs with doubling windows; the last one hits the end of history.
        assert_eq!(fetches(), [2, 4, 8, 16]);
        // Re-reading any loaded page, with fresh tags, runs no log.
        git(&repo, &["tag", "v1", "HEAD~3"]);
        let tagged = repo_history_page(path.clone(), file.clone(), 2, 2).await.unwrap();
        assert_eq!(fetches().len(), 5, "a new tag changes the ref state");
        assert_eq!(tagged[0].commit.tags, ["v1"]);
        assert_eq!(subjects(repo_history_page(path.clone(), file.clone(), 2, 2).await.unwrap()), ["new2", "new1"]);
        assert_eq!(fetches().len(), 5);

        // Another filter or branch is isolated: refs resolve to hashes inside the cache key.
        let grep = HistoryFilter { query: "new1".into(), ..file.clone() };
        assert_eq!(subjects(repo_history_page(path.clone(), grep, 0, 2).await.unwrap()), ["new1"]);
        git(&repo, &["branch", "before", "HEAD~4"]);
        let branch = HistoryFilter { refs: vec!["before".into()], ..file.clone() };
        assert_eq!(subjects(repo_history_page(path.clone(), branch, 0, 2).await.unwrap()), ["new1", "new0"]);
        assert_eq!(fetches().len(), 7);

        // A new commit invalidates the cached window instead of serving stale rows.
        commit("new.txt", "newest");
        assert_eq!(subjects(repo_history_page(path.clone(), file.clone(), 0, 2).await.unwrap()), ["newest", "new4"]);
        assert_eq!(fetches().len(), 8);
        // Config and shallow boundaries can change without moving any ref.
        git(&repo, &["config", "core.useReplaceRefs", "false"]);
        repo_history_page(path.clone(), file.clone(), 0, 2).await.unwrap();
        assert_eq!(fetches().len(), 9);
        let head_only = HistoryFilter { refs: vec!["HEAD".into()], ..file.clone() };
        assert_eq!(repo_history_page(path.clone(), head_only.clone(), 0, 2).await.unwrap().len(), 2);
        let before = fetches().len();
        let head = run_git(&repo, &["rev-parse", "HEAD"]).unwrap();
        let shallow = repo.join(".git/shallow");
        std::fs::write(&shallow, head).unwrap();
        assert_eq!(subjects(repo_history_page(path.clone(), head_only, 0, 2).await.unwrap()), ["newest"]);
        assert_eq!(fetches().len(), before + 1);
        std::fs::remove_file(shallow).unwrap();
        // Relative dates move with the clock and are never cached.
        let before = fetches().len();
        let relative = HistoryFilter { since: "10 years ago".into(), ..file.clone() };
        for _ in 0..2 { repo_history_page(path.clone(), relative.clone(), 0, 2).await.unwrap(); }
        assert_eq!(fetches().len(), before + 2);
        // Pages past the window limit fall back to an exact uncached read.
        let deep = repo_history_page(path.clone(), file.clone(), FOLLOW_CACHE_MAX_WINDOW, 2).await.unwrap();
        assert!(deep.is_empty());
        assert_eq!(fetches().last(), Some(&(FOLLOW_CACHE_MAX_WINDOW + 2)));
        assert!(follow_cache().lock().unwrap().len() <= FOLLOW_CACHE_SLOTS);
        let _ = std::fs::remove_dir_all(&repo);
    }
}
