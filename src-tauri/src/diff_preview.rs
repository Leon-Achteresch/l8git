//! Read-only display diffs. These transformed patches must never feed staging.
use crate::git::{literal_file_path, resolve_git_commit, run_git};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;
use std::process::Stdio;

const LIMIT: usize = 1_048_576;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiffPreviewRequest {
    pub kind: String,
    pub file: String,
    pub previous_file: Option<String>,
    pub base: Option<String>,
    pub head: Option<String>,
    pub ignore_whitespace: bool,
    pub color_moved: bool,
    pub context: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffPreviewResponse {
    pub patch: String,
    pub moved_lines: Vec<usize>,
    pub truncated: bool,
    pub binary: bool,
    pub base_sha: Option<String>,
    pub head_sha: Option<String>,
}

fn strip_colors(output: &str) -> (String, Vec<usize>) {
    let mut patch = String::with_capacity(output.len());
    let mut moved = Vec::new();
    for (index, line) in output.split_inclusive('\n').enumerate() {
        let mut rest = line;
        let mut is_moved = false;
        while let Some(start) = rest.find("\u{1b}[") {
            patch.push_str(&rest[..start]);
            let suffix = &rest[start + 2..];
            if let Some(end) = suffix.find('m') {
                let code = &suffix[..end];
                if code.split(';').any(|code| code == "35" || code == "36") { is_moved = true; }
                rest = &suffix[end + 1..];
            } else {
                patch.push_str(&rest[start..]);
                rest = "";
                break;
            }
        }
        patch.push_str(rest);
        if is_moved { moved.push(index); }
    }
    (patch, moved)
}

fn preview(repo: PathBuf, request: DiffPreviewRequest) -> Result<DiffPreviewResponse, String> {
    if request.context > 500 { return Err("Diff context must be between 0 and 500 lines".into()); }
    let file = literal_file_path(&request.file)?;
    let previous = request.previous_file.as_deref().map(literal_file_path).transpose()?;
    let mut args = vec!["--literal-pathspecs".to_string()];
    if request.color_moved {
        for setting in ["color.diff.meta=normal", "color.diff.frag=normal", "color.diff.func=normal", "color.diff.old=normal", "color.diff.new=normal", "color.diff.context=normal", "color.diff.whitespace=normal", "color.diff.oldMoved=magenta", "color.diff.newMoved=cyan", "color.diff.oldMovedAlternative=magenta", "color.diff.newMovedAlternative=cyan"] {
            args.extend(["-c".to_string(), setting.to_string()]);
        }
    }
    let (base_sha, head_sha, revisions) = match request.kind.as_str() {
        "staged" => {
            args.push("diff".into());
            args.push("--cached".into());
            (resolve_git_commit(&repo, "HEAD").ok(), None, vec![])
        }
        "unstaged" => { args.push("diff".into()); (None, None, vec![]) }
        "compare" | "merge-base" => {
            let base = resolve_git_commit(&repo, request.base.as_deref().ok_or("Missing base ref")?)?;
            let head = resolve_git_commit(&repo, request.head.as_deref().ok_or("Missing head ref")?)?;
            let base = if request.kind == "merge-base" { run_git(&repo, &["merge-base", &base, &head])?.trim().to_string() } else { base };
            args.push("diff".into());
            (Some(base.clone()), Some(head.clone()), vec![base, head])
        }
        "commit" => {
            let head = resolve_git_commit(&repo, request.head.as_deref().ok_or("Missing commit ref")?)?;
            let parents = run_git(&repo, &["rev-list", "--parents", "-n", "1", &head])?;
            let parent = parents.split_whitespace().nth(1).map(str::to_string);
            args.extend(["diff-tree".into(), "-p".into(), "-r".into(), "--no-commit-id".into()]);
            let revisions = if let Some(parent) = &parent { vec![parent.clone(), head.clone()] } else { args.push("--root".into()); vec![head.clone()] };
            (parent, Some(head), revisions)
        }
        _ => return Err("Unsupported diff preview kind".into()),
    };
    args.extend(["--no-ext-diff".into(), "--no-textconv".into(), "--find-renames".into(), "-l1000".into(), format!("--unified={}", request.context)]);
    args.push(if request.color_moved { "--color=always" } else { "--no-color" }.into());
    args.push(if request.color_moved { "--color-moved=blocks" } else { "--color-moved=no" }.into());
    if request.ignore_whitespace { args.push("--ignore-all-space".into()); }
    args.extend(revisions);
    args.extend(["--".into(), file]);
    if let Some(previous) = previous { args.push(previous); }
    let borrowed: Vec<&str> = args.iter().map(String::as_str).collect();
    let span = crate::cmdlog::start(&repo.to_string_lossy(), &borrowed);
    let mut child = crate::cmd::git_command().arg("-C").arg(&repo).args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|error| error.to_string())?;
    let mut stdout = child.stdout.take().ok_or("Missing diff stdout")?;
    let mut stderr = child.stderr.take().ok_or("Missing diff stderr")?;
    let errors = std::thread::spawn(move || {
        let mut output = Vec::new();
        let _ = (&mut stderr).take(65_536).read_to_end(&mut output);
        let _ = std::io::copy(&mut stderr, &mut std::io::sink());
        output
    });
    let mut bytes = Vec::new();
    let read = (&mut stdout).take(LIMIT as u64 + 1).read_to_end(&mut bytes);
    let truncated = bytes.len() > LIMIT;
    drop(stdout);
    if truncated || read.is_err() { let _ = child.kill(); }
    let status = child.wait().map_err(|error| error.to_string())?;
    let errors = errors.join().unwrap_or_default();
    span.finish(status.success() || truncated);
    read.map_err(|error| error.to_string())?;
    if !status.success() && !truncated { return Err(String::from_utf8_lossy(&errors).trim().into()); }
    bytes.truncate(LIMIT);
    let mut output = String::from_utf8_lossy(&bytes).to_string();
    if truncated { output.truncate(output.rfind('\n').map(|index| index + 1).unwrap_or(0)); }
    let (patch, moved_lines) = if request.color_moved { strip_colors(&output) } else { (output, vec![]) };
    let binary = patch.lines().any(|line| line.starts_with("Binary files ") || line.starts_with("GIT binary patch"));
    Ok(DiffPreviewResponse { patch, moved_lines, truncated, binary, base_sha, head_sha })
}

#[tauri::command]
pub async fn repo_diff_preview(path: String, request: DiffPreviewRequest) -> Result<DiffPreviewResponse, String> {
    tokio::task::spawn_blocking(move || preview(PathBuf::from(path), request)).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn moved_lines_are_zero_based_patch_lines_with_colors_removed() {
        let (patch, moved) = strip_colors("header\n\u{1b}[35m-old\u{1b}[m\n\u{1b}[36m+new\u{1b}[m\n+ordinary\n");
        assert_eq!(patch, "header\n-old\n+new\n+ordinary\n");
        assert_eq!(moved, vec![1, 2]);
    }
}
