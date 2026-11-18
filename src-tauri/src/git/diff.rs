use super::*;

#[derive(Serialize)]
pub struct FileDiffResponse {
    staged: Option<String>,
    unstaged: Option<String>,
    untracked_plain: Option<String>,
    is_binary: bool,
    fingerprint: Option<String>,
}

#[tauri::command]
pub async fn repo_staged_diff(path: String) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        run_git(&repo, &["diff", "--cached", "--no-color"])
    })
    .await
}

#[tauri::command]
pub async fn repo_file_diff(
    path: String,
    file: String,
    untracked: bool,
    include_fingerprint: Option<bool>,
) -> Result<FileDiffResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let before = if include_fingerprint.unwrap_or(false) {
            Some(file_snapshot::fingerprint(&repo, &file)?)
        } else {
            None
        };
        let mut response = file_diff_impl(&repo, &file, untracked)?;
        if let Some(before) = before {
            if file_snapshot::fingerprint(&repo, &file)? != before {
                return Err(format!("__FILE_CHANGED__|{file}"));
            }
            response.fingerprint = Some(before);
        }
        Ok(response)
    })
    .await
}

fn file_diff_impl(repo: &PathBuf, file: &str, untracked: bool) -> Result<FileDiffResponse, String> {
    let abs = WorktreePathGuard::new(repo)?.path(file)?;
    if untracked {
        let metadata = std::fs::symlink_metadata(&abs)
            .map_err(|e| coded!(FileReadFailed, error = e))?;
        if metadata.is_dir() {
            return Ok(FileDiffResponse {
                staged: None,
                unstaged: None,
                untracked_plain: None,
                is_binary: true,
                fingerprint: None,
            });
        }
        let bytes = if metadata.file_type().is_symlink() {
            file_reads::worktree_link_text(repo, file)?
        } else if metadata.is_file() {
            use std::io::Read;
            let mut input = open_worktree_file(repo, file)?;
            let mut header = [0u8; 8000];
            let length = input.read(&mut header).map_err(|e| e.to_string())?;
            if looks_binary(&header[..length]) {
                return Ok(FileDiffResponse {
                    staged: None,
                    unstaged: None,
                    untracked_plain: None,
                    is_binary: true,
                    fingerprint: None,
                });
            }
            let mut bytes = header[..length].to_vec();
            input.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            bytes
        } else {
            return Err(format!("Cannot preview special file: {file}"));
        };
        if looks_binary(&bytes) {
            return Ok(FileDiffResponse {
                staged: None,
                unstaged: None,
                untracked_plain: None,
                is_binary: true,
                fingerprint: None,
            });
        }
        return Ok(FileDiffResponse {
            staged: None,
            unstaged: None,
            untracked_plain: Some(String::from_utf8_lossy(&bytes).to_string()),
            is_binary: false,
            fingerprint: None,
        });
    }
    let staged = run_git(
        repo,
        &[
            "--literal-pathspecs",
            "diff",
            "--cached",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--submodule=short",
            "--",
            file,
        ],
    )?;
    let unstaged = run_git(
        repo,
        &[
            "--literal-pathspecs",
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--submodule=short",
            "--",
            file,
        ],
    )?;
    let staged_nonempty = (!staged.trim().is_empty()).then_some(staged);
    let unstaged_nonempty = (!unstaged.trim().is_empty()).then_some(unstaged);
    let is_binary = [staged_nonempty.as_deref(), unstaged_nonempty.as_deref()]
        .into_iter()
        .flatten()
        .any(diff_reports_binary);
    if is_binary {
        return Ok(FileDiffResponse {
            staged: None,
            unstaged: None,
            untracked_plain: None,
            is_binary: true,
            fingerprint: None,
        });
    }
    Ok(FileDiffResponse {
        staged: staged_nonempty,
        unstaged: unstaged_nonempty,
        untracked_plain: None,
        is_binary: false,
        fingerprint: None,
    })
}

#[tauri::command]
pub async fn repo_read_file(path: String, file: String) -> Result<String, String> {
    spawn_git(move || {
        use std::io::Read;
        let mut input = open_worktree_file(&PathBuf::from(&path), &file)?;
        let mut content = String::new();
        input
            .read_to_string(&mut content)
            .map_err(|e| coded!(FileReadFailed, error = e))?;
        Ok(content)
    })
    .await
}

#[tauri::command]
pub async fn repo_write_file(path: String, file: String, content: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let abs = WorktreePathGuard::new(&repo)?.regular_file(&file)?;
        std::fs::write(&abs, content)
            .map_err(|e| coded!(FileWriteFailed, error = e))
    })
    .await
}

#[tauri::command]
pub async fn repo_file_content_at(
    path: String,
    file: String,
    treeish: String,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let revision = (!treeish.is_empty()).then_some(treeish.as_str());
        match git_file_blob_oid(&repo, revision, &file)? {
            Some(oid) => run_git(&repo, &["cat-file", "-p", &oid]),
            None => Ok(String::new()),
        }
    })
    .await
}

#[derive(Serialize)]
pub struct CommitChangedFile {
    pub untracked: bool,
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
}

#[derive(Serialize)]
pub struct CommitInspectResponse {
    pub header: String,
    pub files: Vec<CommitChangedFile>,
    pub file_stats_unavailable: bool,
}

fn run_local_git(repo: &PathBuf, args: &[&str]) -> Result<String, String> {
    run_git_command(crate::cmd::local_git_command(), repo, args)
}

fn first_parent(repo: &PathBuf, commit: &str) -> Result<Option<String>, String> {
    let line = run_local_git(repo, &["rev-list", "--parents", "-n", "1", commit])?;
    Ok(line.split_whitespace().nth(1).map(str::to_owned))
}

fn commit_changed_files(
    repo: &PathBuf,
    commit: &str,
    parent: Option<&str>,
) -> Result<(Vec<CommitChangedFile>, bool), String> {
    let revisions = parent.map_or_else(|| vec!["--root", commit], |parent| vec![parent, commit]);
    let mut args = vec![
        "diff-tree",
        "-r",
        "--no-commit-id",
        "--no-ext-diff",
        "--no-textconv",
        "-z",
    ];
    let options_start = args.len();
    args.extend(["--numstat", "-M"]);
    args.extend(&revisions);
    let (map, stats_unavailable) = match run_local_git(repo, &args) {
        Ok(numstat) => (parse_numstat(&numstat), false),
        Err(stat_error) => {
            // The trees can still name changes when Git cannot read their contents.
            // Skip similarity detection: it would need the same unavailable blobs.
            args.truncate(options_start);
            args.extend(["--name-only", "--no-renames"]);
            args.extend(revisions);
            let paths = run_local_git(repo, &args).map_err(|_| stat_error)?;
            let map = paths
                .split_terminator('\0')
                .map(|path| (path.to_string(), (0, 0, false)))
                .collect();
            (map, true)
        }
    };
    let mut files: Vec<CommitChangedFile> = map
        .into_iter()
        .map(|(path, (adds, dels, binary))| CommitChangedFile {
            untracked: false,
            path,
            additions: adds,
            deletions: dels,
            binary,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok((files, stats_unavailable))
}

#[tauri::command]
pub async fn repo_commit_inspect(
    path: String,
    commit: String,
) -> Result<CommitInspectResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        if commit.trim().is_empty() {
            return Err(required(Label::CommitRef));
        }
        let commit =
            file_reads::commit_revision_with(crate::cmd::local_git_command(), &repo, &commit)?;
        let parent = first_parent(&repo, &commit)?;
        let (files, file_stats_unavailable) =
            commit_changed_files(&repo, &commit, parent.as_deref())?;
        let mut args = vec![
            "show",
            "--no-color",
            "--no-notes",
            "--no-patch",
            "--no-ext-diff",
            "--no-textconv",
            COMMIT_TEXT_ENCODING,
            "--format=fuller",
        ];
        if !file_stats_unavailable {
            args.push("--stat=200");
        }
        args.push(&commit);
        let header = run_local_git(&repo, &args)?;
        Ok(CommitInspectResponse {
            header: header.trim().to_string(),
            files,
            file_stats_unavailable,
        })
    })
    .await
}

#[derive(Serialize)]
pub struct CommitFileDiffResponse {
    pub diff: Option<String>,
    pub is_binary: bool,
}

fn is_missing_promisor_blob(repo: &PathBuf, commit: &str, file: &str, oid: &str) -> bool {
    // A bare missing OID can be ignored as an input revision, even with
    // allow-promisor. Visit the blob through its pinned commit and literal path
    // so Git checks whether an unavailable object encountered there is promised.
    let probe = |mode| {
        run_git_command_output(
            crate::cmd::local_git_command(),
            repo,
            &[
                "--literal-pathspecs",
                "rev-list",
                "--objects",
                "--no-object-names",
                "--no-walk",
                mode,
                commit,
                "--",
                file,
            ],
        )
        .ok()
        .filter(|output| output.stderr.is_empty())
    };
    let missing = format!("?{oid}");
    probe("--missing=print").is_some_and(|out| {
        out.stdout
            .split(|&byte| byte == b'\n')
            .any(|line| line == missing.as_bytes())
    }) && probe("--missing=allow-promisor").is_some_and(|out| {
        out.stdout
            .split(|&byte| byte == b'\n')
            .any(|line| line == commit.as_bytes())
    })
}

fn commit_file_diff(
    repo: &PathBuf,
    revision: &str,
    file: &str,
) -> Result<CommitFileDiffResponse, String> {
    let commit = file_reads::commit_revision_with(crate::cmd::local_git_command(), repo, revision)?;
    let file = file_reads::file_path(file)?;
    let parent = first_parent(repo, &commit)?;
    // diff-tree avoids ambiguous empty --format handling on older Git for Windows.
    let mut args = vec![
        "--literal-pathspecs",
        "diff-tree",
        "-p",
        "--no-commit-id",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
    ];
    args.push(parent.as_deref().unwrap_or("--root"));
    args.extend([commit.as_str(), "--", &file]);
    let diff = run_git_command_output(crate::cmd::local_git_command(), repo, &args)
        .and_then(|output| {
            // Git can return success with a partial patch and a read diagnostic.
            if !output.stderr.is_empty() {
                return Err(merged_failure_message(
                    "",
                    &String::from_utf8_lossy(&output.stderr),
                ));
            }
            Ok(String::from_utf8_lossy(&output.stdout).into_owned())
        })
        .map_err(|error| {
            let missing = [Some(commit.as_str()), parent.as_deref()]
                .into_iter()
                .flatten()
                .any(|rev| {
                    let oid = file_reads::commit_tree_blob_oid(
                        crate::cmd::local_git_command(),
                        repo,
                        rev,
                        &file,
                    );
                    matches!(oid, Ok(Some(oid)) if is_missing_promisor_blob(repo, rev, &file, &oid))
                });
            if missing {
                coded!(GitMissingLocalCommitFile)
            } else {
                error
            }
        })?;

    if diff_reports_binary(&diff) {
        return Ok(CommitFileDiffResponse {
            diff: None,
            is_binary: true,
        });
    }
    Ok(CommitFileDiffResponse {
        diff: (!diff.trim().is_empty()).then_some(diff),
        is_binary: false,
    })
}

#[tauri::command]
pub async fn repo_commit_file_diff(
    path: String,
    commit: String,
    file: String,
) -> Result<CommitFileDiffResponse, String> {
    spawn_git(move || commit_file_diff(&PathBuf::from(&path), &commit, &file)).await
}

#[derive(Serialize)]
pub struct RangeCommitsResponse {
    pub commits: Vec<Commit>,
    pub files: Vec<CommitChangedFile>,
    pub total_commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub truncated: bool,
}

const RANGE_MAX_COMMITS: usize = 400;
const RANGE_MAX_FILES: usize = 500;

fn range_commits(repo: &PathBuf, spec: &str, limit: usize) -> Result<Vec<Commit>, String> {
    let format = "--format=%H%x00%h%x00%an%x00%ae%x00%cI%x00%P%x00%s%x00%b";
    let max_count = format!("--max-count={limit}");
    let out = run_git(repo, &["log", "-z", &max_count, format, spec])?;
    let fields: Vec<&str> = out.split_terminator('\0').collect();
    Ok(fields
        .chunks_exact(8)
        .map(|parts| {
            let parents = parts[5].split_whitespace().map(|s| s.to_string()).collect();
            Commit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                email: parts[3].to_string(),
                date: parts[4].to_string(),
                subject: parts[6].to_string(),
                body: parts[7].to_string(),
                parents,
                tags: Vec::new(),
                author_avatar: None,
            }
        })
        .collect())
}

fn range_log_numstat(
    repo: &PathBuf,
    spec: &str,
    limit: usize,
) -> Result<Vec<CommitChangedFile>, String> {
    let max_count = format!("--max-count={limit}");
    let out = run_git(
        repo,
        &[
            "log",
            "--no-renames",
            "--numstat",
            "-z",
            "--format=",
            &max_count,
            spec,
        ],
    )?;
    Ok(parse_numstat(&out)
        .into_iter()
        .map(|(path, (additions, deletions, binary))| CommitChangedFile {
            untracked: false,
            path,
            additions,
            deletions,
            binary,
        })
        .collect())
}

fn range_diff_numstat(
    repo: &PathBuf,
    base: &str,
    head: &str,
) -> Result<Vec<CommitChangedFile>, String> {
    let out = run_git(
        repo,
        &[
            "diff",
            "--numstat",
            "-z",
            "--no-renames",
            &format!("{base}...{head}"),
        ],
    )?;
    Ok(parse_numstat(&out)
        .into_iter()
        .map(|(path, (additions, deletions, binary))| CommitChangedFile {
            untracked: false,
            path,
            additions,
            deletions,
            binary,
        })
        .collect())
}

#[tauri::command]
pub async fn repo_range_commits(
    path: String,
    base: Option<String>,
    head: String,
    limit: Option<u32>,
) -> Result<RangeCommitsResponse, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let head = head.trim().to_string();
        if head.is_empty() {
            return Err(required(Label::HeadRef));
        }
        let head = resolve_git_commit(&repo, &head)?;
        let base = base
            .map(|b| b.trim().to_string())
            .filter(|b| !b.is_empty())
            .map(|b| resolve_git_commit(&repo, &b))
            .transpose()?;
        let limit = (limit.unwrap_or(60) as usize).clamp(1, RANGE_MAX_COMMITS);
        let spec = match base.as_deref() {
            Some(b) => format!("{b}..{head}"),
            None => head.clone(),
        };

        let total_commits = run_git(&repo, &["rev-list", "--count", &spec])?
            .trim()
            .parse::<u32>()
            .map_err(|error| format!("Invalid Git commit count: {error}"))?;
        let commits = range_commits(&repo, &spec, limit)?;

        let mut files = match base.as_deref() {
            Some(b) => range_diff_numstat(&repo, b, &head)?,
            None => range_log_numstat(&repo, &spec, limit)?,
        };
        files.sort_by(|a, b| {
            (b.additions.saturating_add(b.deletions))
                .cmp(&(a.additions.saturating_add(a.deletions)))
                .then_with(|| a.path.cmp(&b.path))
        });
        let files_truncated = files.len() > RANGE_MAX_FILES;
        files.truncate(RANGE_MAX_FILES);

        let additions = files
            .iter()
            .fold(0u32, |sum, file| sum.saturating_add(file.additions));
        let deletions = files
            .iter()
            .fold(0u32, |sum, file| sum.saturating_add(file.deletions));
        Ok(RangeCommitsResponse {
            truncated: files_truncated || total_commits as usize > commits.len(),
            commits,
            files,
            total_commits,
            additions,
            deletions,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::BTreeMap, fs, path::Path};

    #[tokio::test]
    async fn partial_clone_commit_file_diff_stays_local_and_classifies_only_promised_blobs() {
        struct Fixture(PathBuf);
        impl Drop for Fixture {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let root = Fixture(std::env::temp_dir().join(format!(
            "l8git-f59-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )));
        fs::create_dir(&root.0).unwrap();

        fn setup_git(repo: &PathBuf, args: &[&str]) -> String {
            let mut command = crate::cmd::git_command();
            command
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_CONFIG_GLOBAL", repo.join("nonexistent-global-config"))
                .env("GIT_ALLOW_PROTOCOL", "file")
                .env("GIT_TERMINAL_PROMPT", "0")
                .args([
                    "-c",
                    "user.name=Fixture",
                    "-c",
                    "user.email=fixture@example.invalid",
                    "-c",
                    "commit.gpgSign=false",
                ]);
            run_git_command(command, repo, args).unwrap()
        }

        fn snapshot(path: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
            fn collect(root: &Path, path: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
                for entry in fs::read_dir(path).unwrap() {
                    let entry = entry.unwrap();
                    let path = entry.path();
                    if entry.file_type().unwrap().is_dir() {
                        collect(root, &path, files);
                    } else {
                        files.insert(
                            path.strip_prefix(root).unwrap().into(),
                            fs::read(&path).unwrap(),
                        );
                    }
                }
            }
            let mut files = BTreeMap::new();
            collect(path, path, &mut files);
            files
        }

        let source = root.0.join("source");
        let partial = root.0.join("partial");
        fs::create_dir(&source).unwrap();
        setup_git(&source, &["init", "-q"]);
        setup_git(&source, &["config", "uploadpack.allowFilter", "true"]);
        fs::write(
            source.join("missing.txt"),
            "previous large line\n".repeat(64),
        )
        .unwrap();
        fs::write(source.join("present.txt"), "first\n").unwrap();
        setup_git(&source, &["add", "."]);
        setup_git(&source, &["commit", "-qm", "Fixture base"]);
        fs::write(source.join("missing.txt"), "small head\n").unwrap();
        fs::write(source.join("present.txt"), "second\n").unwrap();
        setup_git(&source, &["commit", "-qam", "Fixture tip"]);
        setup_git(
            &root.0,
            &[
                "clone",
                "-q",
                "--no-local",
                "--no-checkout",
                "--filter=blob:limit=100",
                source.to_str().unwrap(),
                partial.to_str().unwrap(),
            ],
        );

        // The tree references an unavailable parent blob and an available head
        // blob. A file-only check of the selected commit would miss this case.
        let missing = setup_git(&source, &["rev-parse", "HEAD^:missing.txt"]);
        let missing = missing.trim();
        let known = run_local_git(
            &partial,
            &[
                "rev-list",
                "--objects",
                "--no-object-names",
                "--missing=print",
                missing,
            ],
        )
        .unwrap();
        assert_eq!(known.trim(), format!("?{missing}"));
        let before = snapshot(&root.0);
        let repo = partial.to_str().unwrap().to_string();
        let detail = repo_commit_inspect(repo.clone(), "HEAD".into())
            .await
            .unwrap();
        assert!(detail.header.contains("Fixture tip"));
        assert!(detail.file_stats_unavailable);
        assert_eq!(
            detail
                .files
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>(),
            ["missing.txt", "present.txt"],
        );
        let readable = repo_commit_file_diff(repo.clone(), "HEAD".into(), "present.txt".into())
            .await
            .unwrap();
        let diff = readable.diff.unwrap();
        assert!(diff.contains("-first\n+second"));
        assert_eq!(
            repo_commit_file_diff(repo.clone(), "HEAD".into(), "missing.txt".into())
                .await
                .err()
                .unwrap(),
            coded!(GitMissingLocalCommitFile),
        );
        assert_eq!(
            repo_commit_file_diff(repo.clone(), "HEAD^".into(), "missing.txt".into())
                .await
                .err()
                .unwrap(),
            coded!(GitMissingLocalCommitFile),
        );
        for (revision, path) in [
            ("no-such-revision", "missing.txt"),
            ("HEAD", "../missing.txt"),
        ] {
            assert_ne!(
                repo_commit_file_diff(repo.clone(), revision.into(), path.into())
                    .await
                    .err()
                    .unwrap(),
                coded!(GitMissingLocalCommitFile),
            );
        }
        assert!(
            repo_commit_file_diff(repo, "HEAD".into(), "not-in-tree".into())
                .await
                .unwrap()
                .diff
                .is_none()
        );
        assert_eq!(snapshot(&root.0), before);

        // Configuration alone cannot turn an ordinary missing loose object
        // into a promisor blob. Remove the local blob after committing it.
        setup_git(&source, &["config", "remote.origin.promisor", "true"]);
        fs::write(source.join("ordinary.txt"), "locally created blob\n").unwrap();
        setup_git(&source, &["add", "ordinary.txt"]);
        setup_git(&source, &["commit", "-qm", "Local only"]);
        let oid = setup_git(&source, &["rev-parse", "HEAD:ordinary.txt"]);
        let oid = oid.trim();
        fs::remove_file(source.join(".git/objects").join(&oid[..2]).join(&oid[2..])).unwrap();
        let before = snapshot(&root.0);
        assert_ne!(
            commit_file_diff(&source, "HEAD", "ordinary.txt")
                .err()
                .unwrap(),
            coded!(GitMissingLocalCommitFile),
        );
        assert_eq!(snapshot(&root.0), before);
    }
}
