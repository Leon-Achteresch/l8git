use super::*;

#[tauri::command]
pub async fn commit_changes(
    path: String,
    message: String,
    sign: Option<bool>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let trimmed = message.trim();
        if trimmed.is_empty() {
            return Err(required(Label::CommitMessage));
        }
        let mut args: Vec<&str> = vec!["commit"];
        match sign {
            Some(true) => args.push("-S"),
            Some(false) => args.push("--no-gpg-sign"),
            None => {}
        }
        args.push("-m");
        args.push(trimmed);
        run_git(&repo, &args)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn commit_amend(
    path: String,
    message: String,
    expected_head: Option<String>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let lock = repo_mutation_mutex(&repo)?;
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let trimmed = message.trim();
        if trimmed.is_empty() {
            return Err(required(Label::CommitMessage));
        }
        verify_expected_head(&repo, expected_head.as_deref())?;
        run_git(&repo, &["commit", "--amend", "-m", trimmed])?;
        Ok(())
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningScope {
    pub commit_sign: Option<bool>,
    pub tag_sign: Option<bool>,
    pub format: Option<String>,
    pub signing_key: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningInfo {
    pub commit_sign: bool,
    pub tag_sign: bool,
    pub format: String,
    pub signing_key: Option<String>,
    pub program: String,
    pub tool_available: bool,
    pub tool_version: Option<String>,
    pub local: SigningScope,
    pub global: SigningScope,
}

fn config_value(repo: &PathBuf, scope: Option<&str>, key: &str) -> Option<String> {
    let mut args: Vec<&str> = vec!["config"];
    if let Some(s) = scope {
        args.push(s);
    }
    args.push("--get");
    args.push(key);
    let value = run_git(repo, &args).ok()?;
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn config_bool(repo: &PathBuf, scope: Option<&str>, key: &str) -> Option<bool> {
    let raw = config_value(repo, scope, key)?;
    match raw.to_ascii_lowercase().as_str() {
        "true" | "yes" | "on" | "1" => Some(true),
        "false" | "no" | "off" | "0" | "" => Some(false),
        _ => None,
    }
}

fn signing_scope(repo: &PathBuf, scope: Option<&str>) -> SigningScope {
    SigningScope {
        commit_sign: config_bool(repo, scope, "commit.gpgsign"),
        tag_sign: config_bool(repo, scope, "tag.gpgsign"),
        format: config_value(repo, scope, "gpg.format"),
        signing_key: config_value(repo, scope, "user.signingkey"),
    }
}

fn probe_tool(program: &str, args: &[&str], read_version: bool) -> (bool, Option<String>) {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let Ok(out) = cmd.output() else {
        return (false, None);
    };
    if !read_version {
        return (true, None);
    }
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let version = stdout
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && l.chars().any(|c| c.is_ascii_digit()))
        .map(|l| l.to_string());
    (true, version)
}

pub fn signing_program(
    format: &str,
    configured: Option<String>,
) -> (String, Vec<&'static str>, bool) {
    let ssh_probe = vec!["-Y", "check-novalidate"];
    if let Some(p) = configured.filter(|p| !p.trim().is_empty()) {
        let p = p.trim().to_string();
        return if format == "ssh" {
            (p, ssh_probe, false)
        } else {
            (p, vec!["--version"], true)
        };
    }
    match format {
        "ssh" => ("ssh-keygen".to_string(), ssh_probe, false),
        "x509" => ("gpgsm".to_string(), vec!["--version"], true),
        _ => ("gpg".to_string(), vec!["--version"], true),
    }
}

#[tauri::command]
pub async fn commit_signing_info(path: String) -> Result<SigningInfo, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let local = signing_scope(&repo, Some("--local"));
        let global = signing_scope(&repo, Some("--global"));

        let commit_sign = config_bool(&repo, None, "commit.gpgsign").unwrap_or(false);
        let tag_sign = config_bool(&repo, None, "tag.gpgsign").unwrap_or(false);
        let format = config_value(&repo, None, "gpg.format")
            .map(|f| f.to_ascii_lowercase())
            .unwrap_or_else(|| "openpgp".to_string());
        let signing_key = config_value(&repo, None, "user.signingkey");

        let configured_program = config_value(&repo, None, &format!("gpg.{format}.program"))
            .or_else(|| config_value(&repo, None, "gpg.program"));
        let (program, probe_args, read_version) = signing_program(&format, configured_program);
        let (tool_available, tool_version) = probe_tool(&program, &probe_args, read_version);

        Ok(SigningInfo {
            commit_sign,
            tag_sign,
            format,
            signing_key,
            program,
            tool_available,
            tool_version,
            local,
            global,
        })
    })
    .await
}

#[tauri::command]
pub async fn set_commit_signing(
    path: String,
    commit_sign: Option<bool>,
    tag_sign: Option<bool>,
    format: Option<String>,
    signing_key: Option<String>,
) -> Result<SigningInfo, String> {
    let apply_path = path.clone();
    spawn_git(move || {
        let repo = PathBuf::from(&apply_path);
        let set = |key: &str, value: Option<String>| -> Result<(), String> {
            match value {
                Some(v) if !v.trim().is_empty() => {
                    run_git(&repo, &["config", "--local", key, v.trim()]).map(|_| ())
                }
                Some(_) => {
                    let _ = run_git(&repo, &["config", "--local", "--unset-all", key]);
                    Ok(())
                }
                None => Ok(()),
            }
        };
        set("commit.gpgsign", commit_sign.map(|v| v.to_string()))?;
        set("tag.gpgsign", tag_sign.map(|v| v.to_string()))?;
        set("gpg.format", format)?;
        set("user.signingkey", signing_key)?;
        Ok::<(), String>(())
    })
    .await?;
    commit_signing_info(path).await
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitSignature {
    pub state: String,
    pub code: String,
    pub signer: Option<String>,
    pub key: Option<String>,
}

pub fn parse_signature_status(raw: &str) -> CommitSignature {
    let line = raw.lines().next().unwrap_or("");
    let mut fields = line.splitn(3, '\u{001f}');
    let code = fields.next().unwrap_or("").trim().to_string();
    let signer = fields.next().unwrap_or("").trim().to_string();
    let key = fields.next().unwrap_or("").trim().to_string();
    let state = match code.as_str() {
        "G" => "good",
        "B" => "invalid",
        "U" | "X" | "Y" | "R" => "untrusted",
        "E" => "unknown_key",
        _ => "unsigned",
    };
    CommitSignature {
        state: state.to_string(),
        code: if code.is_empty() {
            "N".to_string()
        } else {
            code
        },
        signer: (!signer.is_empty()).then_some(signer),
        key: (!key.is_empty()).then_some(key),
    }
}

#[tauri::command]
pub async fn commit_signature_status(
    path: String,
    hash: String,
) -> Result<CommitSignature, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let c = hash.trim();
        if c.is_empty() {
            return Err(required(Label::CommitRef));
        }
        let out = run_git(
            &repo,
            &[
                "log",
                "-1",
                "--no-color",
                "--format=%G?\u{001f}%GS\u{001f}%GK",
                c,
            ],
        )?;
        Ok(parse_signature_status(&out))
    })
    .await
}
