use super::tags::{tag_map_from_refs, tag_refs_with};
use super::{
    git_command, run_git_command, spawn_git, CommitFields, CommitSearchResult,
    COMMIT_PRETTY_FORMAT, COMMIT_TEXT_ENCODING,
};
use std::{collections::HashMap, path::PathBuf};

fn is_full_oid(hash: &str, width: usize) -> bool {
    hash.len() == width && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn search_git_command() -> std::process::Command {
    let mut command = git_command();
    command
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_OPTIONAL_LOCKS", "0");
    command
}

fn match_commit_record<'a>(
    needle: &str,
    record: &CommitFields<'_>,
    paths: impl Iterator<Item = &'a str>,
) -> Option<Vec<String>> {
    let mut matched_paths = Vec::new();
    let mut matched = record.hash.contains(needle)
        || record.author.to_lowercase().contains(needle)
        || record.email.to_lowercase().contains(needle)
        || record.subject.to_lowercase().contains(needle)
        || record.body.to_lowercase().contains(needle);
    for p in paths {
        if p.to_lowercase().contains(needle) {
            matched = true;
            matched_paths.push(p);
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
    Some(matched_paths.into_iter().map(str::to_owned).collect())
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
        let git = |args: &[&str]| run_git_command(search_git_command(), &repo, args);
        let object_format = git(&["rev-parse", "--show-object-format"])
            .map_err(|_| format!("'{path}' is not a git repository"))?;
        let width = match object_format.trim() {
            // Older Git versions echo an unrecognized rev-parse option.
            // Those versions only supported SHA-1 repositories.
            "sha1" | "--show-object-format" => 40,
            "sha256" => 64,
            _ => return Err("Unsupported Git object format for commit search".into()),
        };
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
        let exact_oid = is_full_oid(&needle, width);
        let refs = git(&["show-ref"]).unwrap_or_default();
        let head = git(&["rev-parse", "HEAD"]).unwrap_or_default();
        let cache_key =
            format!("{path}|{width}|{refs}|{head}|{needle}|{hide_t3}|{with_paths}|{scan:?}");
        if let Ok(cache) = CACHE.get_or_init(Default::default).lock() {
            if let Some((at, hits)) = cache.get(&cache_key) {
                if at.elapsed().as_secs() < 30 {
                    return Ok(hits.iter().skip(skip).take(capped).cloned().collect());
                }
            }
        }
        let tag_map = tag_map_from_refs(&tag_refs_with(&repo, search_git_command()));
        let max_count = scan.map(|n| format!("--max-count={n}"));
        let mut search_args = vec!["log", "-z", "--no-show-signature", "--no-notes"];
        if let Some(ref max) = max_count {
            search_args.push(max);
        }
        let exclude_arg = "--exclude=refs/t3/*".to_string();
        if hide_t3 {
            search_args.push(&exclude_arg);
        }
        search_args.extend_from_slice(&[
            "--all",
            "--date-order",
            COMMIT_TEXT_ENCODING,
            COMMIT_PRETTY_FORMAT,
        ]);
        if with_paths && !exact_oid {
            search_args.push("--name-only");
        }
        let out = git(&search_args)?;
        let mut records = out.split_terminator('\0');
        let mut out_results: Vec<CommitSearchResult> = Vec::new();
        while let Some(hash) = records.next() {
            let record = CommitFields::read(hash, &mut records)?;
            if !is_full_oid(hash, width) {
                return Err("Invalid Git object ID in commit search record".into());
            }
            // With pretty=format (not tformat), the empty NUL token is the
            // boundary between commits. Filenames can contain US and look
            // like metadata, so only read metadata at a record boundary.
            let paths = records.by_ref().take_while(|token| !token.is_empty());
            let matched_paths = if exact_oid {
                paths.for_each(drop);
                if !hash.eq_ignore_ascii_case(&needle) {
                    continue;
                }
                Vec::new()
            } else {
                let paths = paths.enumerate().filter_map(|(index, raw)| {
                    let path = if index == 0 {
                        raw.strip_prefix('\n').unwrap_or(raw)
                    } else {
                        raw
                    };
                    (!path.is_empty()).then_some(path)
                });
                let Some(matched) = match_commit_record(&needle, &record, paths) else {
                    continue;
                };
                matched
            };
            let tags = tag_map.get(hash).cloned().unwrap_or_default();
            out_results.push(CommitSearchResult {
                commit: record.into_commit(tags),
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
