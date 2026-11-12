use super::*;

pub(super) fn tags_by_target(repo: &PathBuf) -> HashMap<String, Vec<String>> {
    tag_map_from_refs(&tag_refs(repo))
}

/// Groups tag names by the commit they point at. Annotated tags are already
/// peeled in `TagRef::commit`, so this needs no git call of its own — callers
/// that also want the full tag list get both from a single `for-each-ref`.
pub(super) fn tag_map_from_refs(tags: &[TagRef]) -> HashMap<String, Vec<String>> {
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for tag in tags {
        if tag.commit.is_empty() || tag.name.is_empty() {
            continue;
        }
        map.entry(tag.commit.clone())
            .or_default()
            .push(tag.name.clone());
    }
    for names in map.values_mut() {
        names.sort();
    }
    map
}

const TAG_FIELD_SEP: char = '\u{001f}';
const TAG_RECORD_SEP: char = '\u{001e}';

pub fn parse_tag_refs(raw: &str) -> Vec<TagRef> {
    let mut tags: Vec<TagRef> = Vec::new();
    for record in raw.split(TAG_RECORD_SEP) {
        let record = record.trim_start_matches(['\n', '\r']);
        if record.trim().is_empty() {
            continue;
        }
        let mut fields = record.splitn(5, TAG_FIELD_SEP);
        let name = fields.next().unwrap_or("").trim();
        let object_type = fields.next().unwrap_or("").trim();
        let commit = fields.next().unwrap_or("").trim();
        let tagger = fields.next().unwrap_or("").trim();
        let contents = fields.next().unwrap_or("");
        if name.is_empty() || commit.is_empty() {
            continue;
        }
        if object_type != "tag" {
            tags.push(TagRef {
                name: name.to_string(),
                commit: commit.to_string(),
                kind: TAG_KIND_LIGHTWEIGHT.to_string(),
                message: None,
                tagger: None,
            });
            continue;
        }
        let signed = contents.contains("-----BEGIN PGP SIGNATURE-----")
            || contents.contains("-----BEGIN SSH SIGNATURE-----")
            || contents.contains("-----BEGIN SIGNED MESSAGE-----");
        let message = strip_signature_block(contents);
        tags.push(TagRef {
            name: name.to_string(),
            commit: commit.to_string(),
            kind: if signed {
                TAG_KIND_SIGNED
            } else {
                TAG_KIND_ANNOTATED
            }
            .to_string(),
            message: (!message.is_empty()).then_some(message),
            tagger: (!tagger.is_empty()).then(|| tagger.to_string()),
        });
    }
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    tags
}

fn strip_signature_block(contents: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("-----BEGIN PGP SIGNATURE-----")
            || trimmed.starts_with("-----BEGIN SSH SIGNATURE-----")
            || trimmed.starts_with("-----BEGIN SIGNED MESSAGE-----")
        {
            break;
        }
        out.push(line);
    }
    out.join("\n").trim().to_string()
}

pub(super) fn tag_refs(repo: &PathBuf) -> Vec<TagRef> {
    let format = format!(
        "%(refname:strip=2){s}%(objecttype){s}%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end){s}%(taggername){s}%(contents){r}",
        s = TAG_FIELD_SEP,
        r = TAG_RECORD_SEP
    );
    let Ok(out) = run_git(
        repo,
        &["for-each-ref", "refs/tags", &format!("--format={format}")],
    ) else {
        return Vec::new();
    };
    parse_tag_refs(&out)
}

#[tauri::command]
pub async fn git_tag_commit(
    path: String,
    name: String,
    commit: String,
    annotated: Option<bool>,
    message: Option<String>,
    sign: Option<bool>,
) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let tag = name.trim();
        if tag.is_empty() {
            return Err(required(Label::TagName));
        }
        reject_dash_arg(tag, Label::TagName)?;
        run_git(&repo, &["check-ref-format", &format!("refs/tags/{tag}")])?;
        let c = commit.trim();
        if c.is_empty() {
            return Err(required(Label::CommitHash));
        }
        let c = resolve_git_commit(&repo, c)?;
        let sign = sign.unwrap_or(false);
        let annotated = sign || annotated.unwrap_or(false);
        let msg = message.unwrap_or_default().trim().to_string();
        if annotated && msg.is_empty() {
            return Err(required(Label::TagMessage));
        }

        let mut parts: Vec<String> = vec!["tag".to_string()];
        if sign {
            parts.push("-s".to_string());
        } else if annotated {
            parts.push("-a".to_string());
        }
        if annotated {
            parts.push("-m".to_string());
            parts.push(msg);
        }
        parts.push(tag.to_string());
        parts.push(c);
        let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
        run_git(&repo, &args)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let tag = name.trim();
        if tag.is_empty() {
            return Err(required(Label::TagName));
        }
        run_git(&repo, &["tag", "-d", "--", tag])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_remote_tag(
    path: String,
    name: String,
    remote: String,
) -> Result<String, String> {
    spawn_git(move || {
        let repo = PathBuf::from(&path);
        let tag = name.trim();
        let r = remote.trim();
        if tag.is_empty() {
            return Err(required(Label::TagName));
        }
        if r.is_empty() {
            return Err(required(Label::Remote));
        }
        let r = normalized_remote(&repo, Some(r))?
            .ok_or_else(|| required(Label::Remote))?;
        reject_dash_arg(tag, Label::TagName)?;
        let out = run_git_merged_output(
            &repo,
            &["push", &r, "--delete", "--", &format!("refs/tags/{tag}")],
        )?;
        let _ = run_git_merged_output(&repo, &["fetch", "--prune", "--prune-tags", "--", &r]);
        Ok(out)
    })
    .await
}
