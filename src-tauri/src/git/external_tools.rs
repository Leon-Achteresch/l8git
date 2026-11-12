use super::{resolve_git_commit, run_git, spawn_git};
use crate::cmd::git_command;
use serde::Serialize;
use std::path::PathBuf;

// External diff/merge tools. Git config is the only store: `diff.tool` / `merge.tool`.
// Launches run in a blocking task and take no repo lock, so a tool left open for
// hours never stalls other git operations.

pub const NO_DIFF_TOOL: &str = "__NO_DIFF_TOOL__";
pub const NO_MERGE_TOOL: &str = "__NO_MERGE_TOOL__";

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct ToolOption {
    pub name: String,
    pub available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalToolSettings {
    pub diff_tool: Option<String>,
    pub merge_tool: Option<String>,
    pub diff_tools: Vec<ToolOption>,
    pub merge_tools: Vec<ToolOption>,
}

/// Parses `git difftool|mergetool --tool-help`. Tools in the first block are
/// available, those after "not currently available" are not.
pub(crate) fn parse_tool_help(raw: &str) -> Vec<ToolOption> {
    let mut out: Vec<ToolOption> = Vec::new();
    let mut available = true;
    let mut user_defined = false;
    for line in raw.lines() {
        if line.contains("not currently available") {
            available = false;
            user_defined = false;
            continue;
        }
        if line.trim() == "user-defined:" {
            user_defined = true;
            continue;
        }
        let Some(entry) = line.strip_prefix("\t\t") else {
            if !line.starts_with('\t') {
                user_defined = false;
            }
            continue;
        };
        let Some(token) = entry.split_whitespace().next() else { continue };
        // User-defined entries read "<name>.cmd <command>".
        let name = if user_defined { token.strip_suffix(".cmd").unwrap_or(token) } else { token };
        if !out.iter().any(|t| t.name == name) {
            out.push(ToolOption { name: name.to_string(), available });
        }
    }
    out
}

/// Arguments for `git difftool`. `mode`: "unstaged" (worktree vs index),
/// "staged" (index vs HEAD) or "commit" (`base` vs `commit`).
pub(crate) fn difftool_args(
    mode: &str,
    revs: Option<(&str, &str)>,
    file: &str,
) -> Result<Vec<String>, String> {
    let mut args = vec!["difftool".to_string(), "--no-prompt".to_string()];
    match (mode, revs) {
        ("unstaged", None) => {}
        ("staged", None) => args.push("--cached".into()),
        ("commit", Some((base, commit))) => {
            args.push(base.into());
            args.push(commit.into());
        }
        _ => return Err(format!("Invalid difftool mode: {mode}")),
    }
    args.push("--".into());
    args.push(file.into());
    Ok(args)
}

pub(crate) fn mergetool_args(file: &str) -> Vec<String> {
    vec!["mergetool".into(), "--no-prompt".into(), "--".into(), file.into()]
}

fn config_get(repo: Option<&PathBuf>, key: &str) -> Option<String> {
    let mut cmd = git_command();
    match repo {
        Some(repo) => cmd.arg("-C").arg(repo).args(["config", "--get", key]),
        None => cmd.args(["config", "--global", "--get", key]),
    };
    let output = cmd.output().ok()?;
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (output.status.success() && !value.is_empty()).then_some(value)
}

fn tool_help(command: &str) -> Vec<ToolOption> {
    let Ok(output) = git_command().args([command, "--tool-help"]).output() else {
        return Vec::new();
    };
    parse_tool_help(&String::from_utf8_lossy(&output.stdout))
}

fn check_file(file: &str) -> Result<(), String> {
    if file.trim().is_empty() || file.chars().any(char::is_control) {
        return Err(format!("Invalid path: {file}"));
    }
    Ok(())
}

fn open_difftool_blocking(
    repo: PathBuf,
    file: String,
    mode: String,
    commit: Option<String>,
) -> Result<(), String> {
    check_file(&file)?;
    // `git difftool` falls back to merge.tool; with neither it would pick a
    // terminal tool that hangs without a TTY.
    if config_get(Some(&repo), "diff.tool").is_none() && config_get(Some(&repo), "merge.tool").is_none() {
        return Err(NO_DIFF_TOOL.into());
    }
    let revs = match (mode.as_str(), commit) {
        ("commit", Some(commit)) => {
            let commit = resolve_git_commit(&repo, &commit)?;
            let base = match run_git(&repo, &["rev-parse", "--verify", "--quiet", &format!("{commit}^")]) {
                Ok(parent) => parent.trim().to_string(),
                // Root commit: diff against the empty tree.
                Err(_) => run_git(&repo, &["hash-object", "-t", "tree", "--stdin"])?.trim().to_string(),
            };
            Some((base, commit))
        }
        _ => None,
    };
    let args = difftool_args(&mode, revs.as_ref().map(|(b, c)| (b.as_str(), c.as_str())), &file)?;
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git(&repo, &args).map(|_| ())
}

fn open_mergetool_blocking(repo: PathBuf, file: String) -> Result<(), String> {
    check_file(&file)?;
    if config_get(Some(&repo), "merge.tool").is_none() {
        return Err(NO_MERGE_TOOL.into());
    }
    let args = mergetool_args(&file);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git(&repo, &args).map(|_| ())
}

/// Resolves when the tool exits.
#[tauri::command]
pub async fn git_open_difftool(
    path: String,
    file: String,
    mode: String,
    commit: Option<String>,
) -> Result<(), String> {
    spawn_git(move || open_difftool_blocking(PathBuf::from(path), file, mode, commit)).await
}

/// Resolves when the tool exits; the caller refreshes status afterwards.
#[tauri::command]
pub async fn git_open_mergetool(path: String, file: String) -> Result<(), String> {
    spawn_git(move || open_mergetool_blocking(PathBuf::from(path), file)).await
}

#[tauri::command]
pub async fn git_external_tool_settings() -> Result<ExternalToolSettings, String> {
    spawn_git(|| {
        Ok(ExternalToolSettings {
            diff_tool: config_get(None, "diff.tool"),
            merge_tool: config_get(None, "merge.tool"),
            diff_tools: tool_help("difftool"),
            merge_tools: tool_help("mergetool"),
        })
    })
    .await
}

/// `kind`: "diff" or "merge". `None` unsets the global key.
#[tauri::command]
pub async fn git_set_external_tool(kind: String, tool: Option<String>) -> Result<(), String> {
    spawn_git(move || {
        let tool = tool.map(|value| value.trim().to_owned()).filter(|value| !value.is_empty());
        let key = match kind.as_str() {
            "diff" => "diff.tool",
            "merge" => "merge.tool",
            _ => return Err(format!("Invalid tool kind: {kind}")),
        };
        let mut cmd = git_command();
        cmd.args(["config", "--global"]);
        match tool.as_deref() {
            Some(tool) if tool.starts_with('-') || tool.chars().any(char::is_control) => {
                return Err(format!("Invalid tool name: {tool}"));
            }
            Some(tool) => cmd.args([key, tool]),
            None => cmd.args(["--unset", key]),
        };
        let output = cmd.output().map_err(|e| format!("failed to run git: {e}"))?;
        // Exit 5: the key was not set, which is what unset wants anyway.
        if output.status.success() || (tool.is_none() && output.status.code() == Some(5)) {
            return Ok(());
        }
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tool_help_sections() {
        let raw = "'git difftool --tool=<tool>' may be set to one of the following:\n\
\t\tmeld             Use Meld (requires a graphical session)\n\
\t\tvimdiff\n\
\tuser-defined:\n\
\t\tfake.cmd echo hi\n\
\n\
The following tools are valid, but not currently available:\n\
\t\tbc               Use Beyond Compare (requires a graphical session)\n\
\t\tmeld             duplicate\n\
\n\
Some of the tools listed above only work in a windowed\n\
environment. If run in a terminal-only session, they will fail.\n";
        let tools = parse_tool_help(raw);
        let got: Vec<(&str, bool)> = tools.iter().map(|t| (t.name.as_str(), t.available)).collect();
        assert_eq!(got, vec![("meld", true), ("vimdiff", true), ("fake", true), ("bc", false)]);
        assert!(parse_tool_help("No suitable tool for 'git mergetool --tool=<tool>' found.\n").is_empty());
    }

    #[test]
    fn builds_difftool_and_mergetool_args() {
        assert_eq!(difftool_args("unstaged", None, "a b.txt").unwrap(), ["difftool", "--no-prompt", "--", "a b.txt"]);
        assert_eq!(difftool_args("staged", None, "f").unwrap(), ["difftool", "--no-prompt", "--cached", "--", "f"]);
        assert_eq!(
            difftool_args("commit", Some(("p", "c")), "f").unwrap(),
            ["difftool", "--no-prompt", "p", "c", "--", "f"]
        );
        assert!(difftool_args("commit", None, "f").is_err());
        assert!(difftool_args("bogus", None, "f").is_err());
        assert_eq!(mergetool_args("-x"), ["mergetool", "--no-prompt", "--", "-x"]);
    }

    #[test]
    fn launches_configured_fake_difftool() {
        let repo = std::env::temp_dir().join(format!("l8git-difftool-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&repo);
        std::fs::create_dir_all(&repo).unwrap();
        let git = |args: &[&str]| run_git(&repo, args).unwrap();
        git(&["-c", "init.defaultBranch=main", "init", "-q", "."]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        git(&["config", "commit.gpgsign", "false"]);
        git(&["config", "core.autocrlf", "false"]);
        std::fs::write(repo.join("f.txt"), "one\n").unwrap();
        git(&["add", "f.txt"]);
        git(&["commit", "-qm", "root"]);
        std::fs::write(repo.join("f.txt"), "two\n").unwrap();
        git(&["commit", "-qam", "second"]);
        std::fs::write(repo.join("f.txt"), "three\n").unwrap();

        // Unset tool: friendly marker instead of git falling back to a terminal tool.
        // Local empty values shadow whatever the CI machine has globally.
        git(&["config", "diff.tool", ""]);
        git(&["config", "merge.tool", ""]);
        let path = repo.to_string_lossy().into_owned();
        let run = |mode: &str, commit: Option<&str>| {
            open_difftool_blocking(PathBuf::from(&path), "f.txt".into(), mode.into(), commit.map(String::from))
        };
        assert_eq!(run("unstaged", None).unwrap_err(), NO_DIFF_TOOL);

        // Git runs the tool command through its own sh on every platform.
        let marker = repo.join("marker.txt").to_string_lossy().replace('\\', "/");
        git(&["config", "diff.tool", "fake"]);
        git(&["config", "difftool.fake.cmd", &format!("cat \"$LOCAL\" \"$REMOTE\" >> '{marker}'")]);
        run("unstaged", None).unwrap();
        run("commit", Some("HEAD")).unwrap();
        run("commit", Some("HEAD~1")).unwrap();
        let written = std::fs::read_to_string(repo.join("marker.txt")).unwrap();
        assert_eq!(written, "two\nthree\none\ntwo\none\n");

        let _ = std::fs::remove_dir_all(&repo);
    }
}
