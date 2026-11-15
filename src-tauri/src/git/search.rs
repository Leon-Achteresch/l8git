use super::{run_git, spawn_git, tags_by_target, Commit, CommitSearchResult};
use std::{collections::HashMap, path::PathBuf};

fn is_commit_meta_token(s: &str) -> bool {
    let Some((hash, _)) = s.split_once('\x1f') else {
        return false;
    };
    matches!(hash.len(), 40 | 64) && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod metadata_tests {
    use super::is_commit_meta_token;

    #[test]
    fn accepts_both_git_object_formats_without_confusing_paths_or_unicode() {
        assert!(is_commit_meta_token(&format!(
            "{}\x1fshort\x1fauthor",
            "a".repeat(40)
        )));
        assert!(is_commit_meta_token(&format!(
            "{}\x1fshort\x1fauthor",
            "B".repeat(64)
        )));
        for token in [
            "ä".repeat(30),
            format!("{}\x1fpath", "a".repeat(41)),
            "file/path".into(),
            format!("{}\x1fpath", "g".repeat(64)),
        ] {
            assert!(!is_commit_meta_token(&token));
        }
    }
}

fn match_commit_record(
    needle: &str,
    hash: &str,
    short_hash: &str,
    author: &str,
    email: &str,
    subject: &str,
    body: &str,
    paths: &[String],
) -> Option<Vec<String>> {
    let mut matched_paths: Vec<String> = Vec::new();
    let mut matched = hash.to_lowercase().contains(needle)
        || short_hash.to_lowercase().contains(needle)
        || author.to_lowercase().contains(needle)
        || email.to_lowercase().contains(needle)
        || subject.to_lowercase().contains(needle)
        || body.to_lowercase().contains(needle);
    for p in paths {
        if p.to_lowercase().contains(needle) {
            matched = true;
            matched_paths.push(p.clone());
        }
    }
    if !matched {
        return None;
    }
    matched_paths.sort();
    matched_paths.dedup();
    const MAX_PATHS: usize = 12;
    if matched_paths.len() > MAX_PATHS {
        matched_paths.truncate(MAX_PATHS);
    }
    Some(matched_paths)
}

const SEARCH_MIN_QUERY_LEN: usize = 2;
const SEARCH_MAX_SCAN_LIMIT: usize = 50_000;

#[tauri::command]
pub async fn repo_search_commits(
    path: String,
    query: String,
    skip: usize,
    limit: usize,
    hide_t3_checkpoints: Option<bool>,
    search_paths: Option<bool>,
    scan_limit: Option<usize>,
) -> Result<Vec<CommitSearchResult>, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git(&repo, &["rev-parse", "--is-inside-work-tree"])
            .map_err(|_| format!("'{path}' is not a git repository"))?;
        let needle = query.trim().to_lowercase();
        if needle.chars().count() < SEARCH_MIN_QUERY_LEN {
            return Ok(Vec::new());
        }
        let hide_t3 = hide_t3_checkpoints.unwrap_or(true);
        let with_paths = search_paths.unwrap_or(true);
        let capped = limit.clamp(1, 500);
        let scan = scan_limit.map(|n| n.clamp(1, SEARCH_MAX_SCAN_LIMIT).saturating_add(skip));
        type SearchCache = HashMap<String, (std::time::Instant, Vec<CommitSearchResult>)>;
        static CACHE: std::sync::OnceLock<std::sync::Mutex<SearchCache>> =
            std::sync::OnceLock::new();
        let refs = run_git(&repo, &["show-ref"]).unwrap_or_default();
        let head = run_git(&repo, &["rev-parse", "HEAD"]).unwrap_or_default();
        let cache_key = format!("{path}|{refs}|{head}|{needle}|{hide_t3}|{with_paths}|{scan:?}");
        if let Ok(cache) = CACHE.get_or_init(Default::default).lock() {
            if let Some((at, hits)) = cache.get(&cache_key) {
                if at.elapsed().as_secs() < 30 {
                    return Ok(hits.iter().skip(skip).take(capped).cloned().collect());
                }
            }
        }
        let tag_map = tags_by_target(&repo);
        let sep = "\x1f";
        let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b%x00");
        let pretty = format!("--pretty=format:{format}");
        let max_count = scan.map(|n| format!("--max-count={n}"));
        let mut search_args: Vec<&str> = vec!["log", "-z"];
        if let Some(ref max) = max_count {
            search_args.push(max);
        }
        let exclude_arg = "--exclude=refs/t3/*".to_string();
        if hide_t3 {
            search_args.push(&exclude_arg);
        }
        search_args.extend_from_slice(&["--all", "--date-order", pretty.as_str()]);
        if with_paths {
            search_args.push("--name-only");
        }
        let out = run_git(&repo, &search_args)?;
        let tokens: Vec<&str> = out.split('\0').filter(|t| !t.is_empty()).collect();
        let mut out_results: Vec<CommitSearchResult> = Vec::new();
        let mut i = 0usize;
        while i < tokens.len() {
            let meta = tokens[i];
            if !is_commit_meta_token(meta) {
                i += 1;
                continue;
            }
            let mut parts = meta.splitn(8, sep);
            let hash = parts.next().unwrap_or_default().to_string();
            let short_hash = parts.next().unwrap_or_default().to_string();
            let author = parts.next().unwrap_or_default().to_string();
            let email = parts.next().unwrap_or_default().to_string();
            let date = parts.next().unwrap_or_default().to_string();
            let parents_str = parts.next().unwrap_or_default();
            let subject = parts.next().unwrap_or_default().to_string();
            let body = parts.next().unwrap_or_default().to_string();
            i += 1;
            let mut paths: Vec<String> = Vec::new();
            let mut first_path_token = true;
            while i < tokens.len() && !is_commit_meta_token(tokens[i]) {
                let raw = tokens[i];
                let p = if first_path_token {
                    raw.strip_prefix('\n').unwrap_or(raw)
                } else {
                    raw
                };
                first_path_token = false;
                if !p.is_empty() {
                    paths.push(p.to_string());
                }
                i += 1;
            }
            let Some(matched_paths) = match_commit_record(
                needle.as_str(),
                hash.as_str(),
                short_hash.as_str(),
                author.as_str(),
                email.as_str(),
                subject.as_str(),
                body.as_str(),
                paths.as_slice(),
            ) else {
                continue;
            };
            let parents = parents_str
                .split_whitespace()
                .map(|s| s.to_string())
                .collect();
            let tags = tag_map.get(&hash).cloned().unwrap_or_default();
            out_results.push(CommitSearchResult {
                commit: Commit {
                    hash: hash.clone(),
                    short_hash,
                    author,
                    email,
                    date,
                    subject,
                    body,
                    parents,
                    tags,
                    author_avatar: None,
                },
                matched_paths,
            });
        }
        let page = out_results
            .iter()
            .skip(skip)
            .take(capped)
            .cloned()
            .collect();
        if out_results.len() <= 10_000 {
            if let Ok(mut cache) = CACHE.get_or_init(Default::default).lock() {
                cache.retain(|_, (at, _)| at.elapsed().as_secs() < 30);
                if cache.len() >= 8 {
                    cache.clear();
                }
                cache.insert(cache_key, (std::time::Instant::now(), out_results));
            }
        }
        Ok(page)
    })
    .await
}
