use super::{file_reads, spawn_git, WorktreePathGuard};
use crate::{cmd::git_command, cmdlog};
use serde::Serialize;
use std::{io::Write, path::PathBuf, process::Stdio};

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
