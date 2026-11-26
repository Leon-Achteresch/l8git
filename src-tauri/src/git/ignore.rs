use super::{file_reads, spawn_git, WorktreePathGuard};
use crate::{cmd::git_command, cmdlog};
use serde::Serialize;
use std::{
    collections::HashSet,
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
    process::Stdio,
};

fn literal_ignore_pattern(file: &str) -> Result<String, String> {
    if file.contains('\n') {
        return Err(crate::coded!(GitIgnoreMultilinePath));
    }
    let path = file_reads::file_path(file)?;
    let mut rule = String::from("/");
    for ch in path.chars() {
        match ch {
            '\r' => rule.push_str("[\r]"),
            '\\' | '*' | '?' | '[' | ']' | ' ' => {
                rule.push('\\');
                rule.push(ch);
            }
            _ => rule.push(ch),
        }
    }
    if file.ends_with('/') {
        rule.push('/');
    }
    Ok(rule)
}

fn append_ignore_patterns(path: &Path, patterns: &[String], literal: bool) -> Result<(), String> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true).append(true).create(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000); // Open the reparse point itself.
    }
    let io_error = |error: std::io::Error| format!(".gitignore: {error}");
    let mut file = options.open(path).map_err(io_error)?;
    let metadata = file.metadata().map_err(io_error)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("__INVALID_WORKTREE_PATH__|.gitignore".into());
    }
    let mut existing = Vec::new();
    file.rewind().map_err(io_error)?;
    file.read_to_end(&mut existing).map_err(io_error)?;
    let crlf = existing
        .split_inclusive(|byte| *byte == b'\n')
        .next()
        .is_some_and(|first| first.ends_with(b"\r\n"));
    let eol = if crlf { b"\r\n".as_slice() } else { b"\n" };
    // A later exception can re-include a selected file. Its new rule must
    // come after that exception even if an identical earlier rule exists.
    let mut known: HashSet<&[u8]> = existing
        .rsplit(|byte| *byte == b'\n')
        .take_while(|line| !literal || !line.starts_with(b"!"))
        .map(|line| line.strip_suffix(b"\r").unwrap_or(line))
        .collect();
    let mut addition = Vec::new();
    for pattern in patterns {
        if known.insert(pattern.as_bytes()) {
            if addition.is_empty() && !existing.is_empty() && !existing.ends_with(b"\n") {
                addition.extend_from_slice(eol);
            }
            addition.extend_from_slice(pattern.as_bytes());
            addition.extend_from_slice(eol);
        }
    }
    file.write_all(&addition).map_err(io_error)
}

#[tauri::command]
pub async fn add_to_gitignore(
    path: String,
    patterns: Vec<String>,
    literal_paths: Option<bool>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(path);
        let literal = literal_paths.unwrap_or(false);
        let patterns: Vec<String> = if literal {
            patterns
                .iter()
                .map(|p| literal_ignore_pattern(p))
                .collect::<Result<_, _>>()?
        } else {
            patterns
                .into_iter()
                .map(|p| p.trim().to_owned())
                .filter(|p| !p.is_empty() && !p.contains(['\n', '\0']))
                .collect()
        };
        if patterns.is_empty() {
            return Ok(());
        }
        let lock = super::repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let directory = if literal {
            WorktreePathGuard::new(&repo)?.root
        } else {
            repo
        };
        append_ignore_patterns(&directory.join(".gitignore"), &patterns, literal)
    })
    .await
}

#[derive(Debug, Serialize)]
pub struct IgnoreRule {
    pub source: String,
    pub line: u64,
    pub pattern: String,
}

#[derive(Debug, Serialize)]
pub struct IgnoreExplanation {
    pub file: String,
    pub ignored: bool,
    pub rule: Option<IgnoreRule>,
}

// No quoting, trimming or line splitting: all four verbose fields are NUL-delimited.
fn parse_match(file: String, bytes: &[u8]) -> Result<IgnoreExplanation, String> {
    let invalid = || "Invalid git check-ignore response".to_string();
    let fields: Vec<_> = bytes.split(|b| *b == 0).collect();
    if fields.len() != 5 || !fields[4].is_empty() {
        return Err(invalid());
    }
    let text = |index: usize| std::str::from_utf8(fields[index]).map_err(|_| invalid());
    let source = text(0)?.to_owned();
    let line = text(1)?.parse::<u64>().map_err(|_| invalid())?;
    let pattern = text(2)?.to_owned();
    if source.is_empty() || line == 0 || pattern.is_empty() || text(3)? != file {
        return Err(invalid());
    }
    Ok(IgnoreExplanation {
        ignored: !pattern.starts_with('!'),
        file,
        rule: Some(IgnoreRule {
            source,
            line,
            pattern,
        }),
    })
}

/// Explain one literal worktree-root-relative path. Uses Git's actual index and
/// exclude configuration; tracked paths are deliberately not treated as ignored.
/// No enumeration, rule edits, index writes or automatic follow-up operations.
#[tauri::command]
pub async fn git_check_ignore(path: String, file: String) -> Result<IgnoreExplanation, String> {
    spawn_git(move || {
        file_reads::file_path(&file)?;
        if file.len() > 16_384 {
            return Err("Ignore path is too long".into());
        }
        let root = WorktreePathGuard::new(&PathBuf::from(path))?.root;
        WorktreePathGuard {
            cwd: root.clone(),
            root: root.clone(),
        }
        .path(&file)?;
        // check-ignore rejects literal pathspec magic, even the global flag.
        // Prefixing ./ avoids magic at the start without altering filename data.
        let input_path = format!("./{file}");
        let args = ["check-ignore", "--verbose", "-z", "--stdin"];
        let span = cmdlog::start(&root.to_string_lossy(), &args);
        let mut child = git_command()
            .arg("-C")
            .arg(&root)
            .args(args)
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env_remove("GIT_LITERAL_PATHSPECS")
            .env_remove("GIT_GLOB_PATHSPECS")
            .env_remove("GIT_NOGLOB_PATHSPECS")
            .env_remove("GIT_ICASE_PATHSPECS")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to run git: {e}"))?;
        let write = {
            let mut input = child.stdin.take().ok_or("Missing git stdin")?;
            input
                .write_all(input_path.as_bytes())
                .and_then(|_| input.write_all(&[0]))
        };
        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        let code = output.status.code();
        span.finish(matches!(code, Some(0 | 1)) && write.is_ok());
        if !matches!(code, Some(0 | 1)) {
            return Err(super::merged_failure_message(
                "",
                &String::from_utf8_lossy(&output.stderr),
            ));
        }
        write.map_err(|e| format!("failed to send ignore path: {e}"))?;
        if code == Some(1) && output.stdout.is_empty() {
            return Ok(IgnoreExplanation {
                file,
                ignored: false,
                rule: None,
            });
        }
        if code != Some(0) {
            return Err("Invalid git check-ignore exit status/output".into());
        }
        let mut result = parse_match(input_path, &output.stdout)?;
        result.file = file;
        Ok(result)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nul_protocol_preserves_data_and_rejects_incomplete_or_ambiguous_records() {
        let result = parse_match("a\nb\tc".into(), b" rules:\n\t\0\x32\0!a*\0a\nb\tc\0").unwrap();
        assert!(!result.ignored);
        assert_eq!(result.rule.unwrap().source, " rules:\n\t");
        for bytes in [
            b"source\x001\0pattern\0file".as_slice(),
            b"source\x001\0pattern\0other\0",
            b"source\x000\0pattern\0file\0",
            b"source\x001\0pattern\0file\0extra\0",
            b"source\x001\0\xff\0file\0",
        ] {
            assert!(parse_match("file".into(), bytes).is_err());
        }
    }
}
