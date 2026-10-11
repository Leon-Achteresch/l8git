use super::run_git;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock, Weak};

/// Coordinates mutations of shared refs and worktree registrations. Index
/// mutations retain their own per-worktree mutex; callers acquire this lock
/// before any of those locks to keep the order consistent across commands.
pub(crate) fn repo_coordination_mutex(repo: &PathBuf) -> Result<Arc<Mutex<()>>, String> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();

    let directory = run_git(
        repo,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?;
    // Remove only Git's record terminator. A bare common directory can itself
    // end in spaces or a newline, which are part of its exact filesystem name.
    let directory = directory.strip_suffix('\n').unwrap_or(&directory);
    let directory = PathBuf::from(directory);
    if !directory.is_absolute() {
        return Err("Git returned a relative common directory".into());
    }
    let key = directory
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let mut locks = LOCKS
        .get_or_init(Default::default)
        .lock()
        .map_err(|error| error.to_string())?;
    // Weak entries do not retain every repository ever opened by the app.
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    Ok(lock)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "l8git-repo-coordination-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn repo(&self, name: &str, bare: bool) -> PathBuf {
            let path = self.0.join(name);
            fs::create_dir_all(&path).unwrap();
            let arguments = if bare {
                vec!["-c", "init.defaultBranch=main", "init", "-q", "--bare", "."]
            } else {
                vec!["-c", "init.defaultBranch=main", "init", "-q", "."]
            };
            run_git(&path, &arguments).unwrap();
            if !bare {
                run_git(&path, &["config", "user.email", "test@example.com"]).unwrap();
                run_git(&path, &["config", "user.name", "Test"]).unwrap();
                run_git(&path, &["config", "commit.gpgsign", "false"]).unwrap();
                run_git(&path, &["commit", "--allow-empty", "-qm", "base"]).unwrap();
            }
            path
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn linked_worktrees_share_one_coordination_mutex() {
        let root = TestRoot::new();
        let repo = root.repo("main", false);
        let linked = root.0.join("linked");
        run_git(
            &repo,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                "agents/task",
                linked.to_str().unwrap(),
            ],
        )
        .unwrap();
        let main_lock = repo_coordination_mutex(&repo).unwrap();
        let linked_lock = repo_coordination_mutex(&linked).unwrap();
        assert!(Arc::ptr_eq(&main_lock, &linked_lock));
        let guard = main_lock.lock().unwrap();
        assert!(linked_lock.try_lock().is_err());
        drop(guard);
        assert!(linked_lock.try_lock().is_ok());
        // Shared coordination complements separate index mutation locks.
        assert!(!Arc::ptr_eq(
            &super::super::repo_mutation_mutex(&repo).unwrap(),
            &super::super::repo_mutation_mutex(&linked).unwrap()
        ));
    }

    #[test]
    fn independent_repositories_do_not_share_coordination_mutexes() {
        let root = TestRoot::new();
        let first = repo_coordination_mutex(&root.repo("first", false)).unwrap();
        let second = repo_coordination_mutex(&root.repo("second", false)).unwrap();
        assert!(!Arc::ptr_eq(&first, &second));
        let _guard = first.lock().unwrap();
        assert!(second.try_lock().is_ok());
    }

    #[test]
    fn paths_inside_the_same_repository_resolve_to_one_key() {
        let root = TestRoot::new();
        let repo = root.repo("main", false);
        let child = repo.join("subdirectory");
        fs::create_dir_all(&child).unwrap();
        let main_lock = repo_coordination_mutex(&repo).unwrap();
        assert!(Arc::ptr_eq(
            &main_lock,
            &repo_coordination_mutex(&child).unwrap()
        ));
    }

    #[test]
    fn registry_does_not_keep_unused_repository_locks_alive() {
        let root = TestRoot::new();
        let repo = root.repo("main", false);
        let lock = repo_coordination_mutex(&repo).unwrap();
        let weak = Arc::downgrade(&lock);
        drop(lock);
        assert!(weak.upgrade().is_none());
        let replacement = repo_coordination_mutex(&repo).unwrap();
        assert_eq!(Arc::strong_count(&replacement), 1);
    }

    #[tokio::test]
    async fn native_checkout_waits_for_shared_coordination_before_switching_a_linked_worktree() {
        let root = TestRoot::new();
        let repo = root.repo("main", false);
        let linked = root.0.join("linked");
        run_git(&repo, &["branch", "agents/other"]).unwrap();
        run_git(
            &repo,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                "agents/task",
                linked.to_str().unwrap(),
            ],
        )
        .unwrap();
        let coordination = repo_coordination_mutex(&repo).unwrap();
        let held = coordination.lock().unwrap();
        let path = linked.to_str().unwrap().to_owned();
        let mut operation = tokio::spawn(super::super::git_checkout(
            path,
            "agents/other".into(),
            false,
            None,
            None,
        ));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), &mut operation)
                .await
                .is_err()
        );
        assert_eq!(
            run_git(&linked, &["symbolic-ref", "--short", "HEAD"]).unwrap(),
            "agents/task\n"
        );
        drop(held);
        tokio::time::timeout(std::time::Duration::from_secs(5), operation)
            .await
            .expect("checkout did not resume after releasing coordination")
            .unwrap()
            .unwrap();
        assert_eq!(
            run_git(&linked, &["symbolic-ref", "--short", "HEAD"]).unwrap(),
            "agents/other\n"
        );
    }

    #[tokio::test]
    async fn native_worktree_creation_waits_for_shared_coordination_before_registering() {
        let root = TestRoot::new();
        let repo = root.repo("main", false);
        let linked = root.0.join("linked");
        let coordination = repo_coordination_mutex(&repo).unwrap();
        let held = coordination.lock().unwrap();
        let mut operation = tokio::spawn(super::super::git_worktree_add(
            repo.to_str().unwrap().to_owned(),
            linked.to_str().unwrap().to_owned(),
            None,
            Some("agents/new".into()),
        ));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), &mut operation)
                .await
                .is_err()
        );
        assert!(!linked.exists());
        assert!(run_git(&repo, &["show-ref", "--verify", "refs/heads/agents/new"]).is_err());
        drop(held);
        tokio::time::timeout(std::time::Duration::from_secs(5), operation)
            .await
            .expect("worktree creation did not resume after releasing coordination")
            .unwrap()
            .unwrap();
        assert!(linked.is_dir());
        assert_eq!(
            run_git(&linked, &["symbolic-ref", "--short", "HEAD"]).unwrap(),
            "agents/new\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn canonical_aliases_and_exact_bare_directory_names_preserve_identity() {
        use std::os::unix::fs::symlink;

        let root = TestRoot::new();
        let bare = root.repo("bare \n", true);
        let alias = root.0.join("alias");
        symlink(&bare, &alias).unwrap();
        let exact_lock = repo_coordination_mutex(&bare).unwrap();
        assert!(Arc::ptr_eq(
            &exact_lock,
            &repo_coordination_mutex(&alias).unwrap()
        ));
        assert!(bare.as_os_str().as_encoded_bytes().ends_with(b" \n"));
    }
}
