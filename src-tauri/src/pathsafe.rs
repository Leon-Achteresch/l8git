use std::path::{Path, PathBuf};

pub fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("Ungültiges Repo-Verzeichnis: {e}"))?;
    let joined = root_canon.join(rel);
    verify_within(&root_canon, joined)
}

pub fn contained(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("Ungültiges Repo-Verzeichnis: {e}"))?;
    verify_within(&root_canon, candidate.to_path_buf())
}

fn verify_within(root_canon: &Path, joined: PathBuf) -> Result<PathBuf, String> {
    let resolved = match joined.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let parent = joined
                .parent()
                .ok_or_else(|| "Ungültiger Zielpfad.".to_string())?;
            let parent_canon = parent
                .canonicalize()
                .map_err(|e| format!("Ungültiger Zielpfad: {e}"))?;
            let name = joined
                .file_name()
                .ok_or_else(|| "Ungültiger Zielpfad.".to_string())?;
            parent_canon.join(name)
        }
    };
    if !resolved.starts_with(root_canon) {
        return Err("Pfad liegt außerhalb des Repositories.".into());
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::resolve_in_root;
    use std::fs;

    fn scratch(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "l8git-pathsafe-{tag}-{}-{}",
            std::process::id(),
            fastrand_like()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    fn fastrand_like() -> u128 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    }

    #[test]
    fn accepts_paths_inside_the_root() {
        let root = scratch("inside");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/a.txt"), "x").unwrap();
        let resolved = resolve_in_root(&root, "src/a.txt").unwrap();
        assert!(resolved.starts_with(&root));
        let new_file = resolve_in_root(&root, "src/new.txt").unwrap();
        assert!(new_file.starts_with(&root));
    }

    #[test]
    fn rejects_parent_traversal_and_absolute_paths() {
        let root = scratch("escape");
        fs::create_dir_all(root.join("sub")).unwrap();
        assert!(resolve_in_root(&root, "../secret.txt").is_err());
        assert!(resolve_in_root(&root, "sub/../../secret.txt").is_err());
        assert!(resolve_in_root(&root, "/etc/hosts").is_err());
    }
}
