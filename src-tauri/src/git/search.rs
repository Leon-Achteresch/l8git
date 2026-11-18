use super::tags::{tag_map_from_refs, tag_refs_with};
use super::{git_command, run_git_command, spawn_git, Commit, CommitSearchResult};
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
        let sep = "\x1f";
        let format = format!("%H{sep}%h{sep}%an{sep}%ae{sep}%cI{sep}%P{sep}%s{sep}%b%x00");
        let pretty = format!("--pretty=format:{format}");
        let max_count = scan.map(|n| format!("--max-count={n}"));
        let mut search_args = vec!["log", "-z", "--no-show-signature", "--no-notes"];
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
        let out = git(&search_args)?;
        let mut records = out.split_terminator('\0');
        let mut out_results: Vec<CommitSearchResult> = Vec::new();
        while let Some(meta) = records.next() {
            let [hash, short_hash, author, email, date, parents, subject, body]: [&str; 8] = meta
                .splitn(8, sep)
                .collect::<Vec<_>>()
                .try_into()
                .map_err(|_| "Invalid Git commit search record")?;
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
                let paths: Vec<String> = paths
                    .enumerate()
                    .filter_map(|(index, raw)| {
                        let path = if index == 0 {
                            raw.strip_prefix('\n').unwrap_or(raw)
                        } else {
                            raw
                        };
                        (!path.is_empty()).then(|| path.to_string())
                    })
                    .collect();
                let Some(matched) = match_commit_record(
                    &needle, hash, short_hash, author, email, subject, body, &paths,
                ) else {
                    continue;
                };
                matched
            };
            let parents = parents.split_whitespace().map(String::from).collect();
            let tags = tag_map.get(hash).cloned().unwrap_or_default();
            out_results.push(CommitSearchResult {
                commit: Commit {
                    hash: hash.to_string(),
                    short_hash: short_hash.to_string(),
                    author: author.to_string(),
                    email: email.to_string(),
                    date: date.to_string(),
                    subject: subject.to_string(),
                    body: body.to_string(),
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
