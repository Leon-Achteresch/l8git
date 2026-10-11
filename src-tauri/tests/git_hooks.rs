mod common;

use common::{expect_err, json, scratch_path, TestRepo};
use l8git_lib::git;

#[tokio::test]
async fn linked_worktrees_share_the_hooks_git_actually_uses() {
    let repo = TestRepo::new("hooks-shared");
    repo.commit("base.txt", "base\n", "base");
    let linked_path = scratch_path("hooks-linked");
    repo.git(&["worktree", "add", "-q", "-b", "linked", linked_path.to_str().unwrap()]);
    let linked = TestRepo::adopt(linked_path);
    git::save_git_hook(linked.s(), "pre-commit".into(), "#!/bin/sh\necho shared\n".into()).await.unwrap();
    assert_eq!(repo.read(".git/hooks/pre-commit"), "#!/bin/sh\necho shared\n");
    assert_eq!(git::get_git_hook_content(repo.s(), "pre-commit".into()).await.unwrap(), "#!/bin/sh\necho shared\n");
    let hooks = json(&git::list_git_hooks(linked.s()).await.unwrap());
    assert!(hooks.as_array().unwrap().iter().any(|hook| hook["name"] == "pre-commit" && hook["exists"] == true && hook["is_enabled"] == true));
    git::delete_git_hook(linked.s(), "pre-commit".into()).await.unwrap();
    assert!(!repo.exists(".git/hooks/pre-commit"));
}

#[tokio::test]
async fn relative_custom_hooks_are_resolved_from_the_worktree_root() {
    let repo = TestRepo::new("hooks-custom");
    repo.git(&["config", "core.hooksPath", "custom hooks"]);
    std::fs::create_dir_all(repo.path.join("nested")).unwrap();
    let nested = repo.path.join("nested").to_string_lossy().into_owned();
    git::save_git_hook(nested.clone(), "pre-push".into(), "#!/bin/sh\necho custom\n".into()).await.unwrap();
    assert!(repo.exists("custom hooks/pre-push"));
    assert!(!repo.exists("nested/custom hooks/pre-push"));
    assert_eq!(git::get_git_hook_content(nested, "pre-push".into()).await.unwrap(), "#!/bin/sh\necho custom\n");
}

#[cfg(unix)]
#[tokio::test]
async fn hook_and_repository_paths_preserve_spaces_newlines_and_backslashes() {
    let mut repo = TestRepo::new("hooks-exact-root");
    let exact = std::path::PathBuf::from(format!("{} \\ \n", repo.s()));
    std::fs::rename(&repo.path, &exact).unwrap();
    repo.path = exact;
    repo.git(&["config", "core.hooksPath", " hooks\\name\n "]);
    git::save_git_hook(repo.s(), "pre-commit".into(), "#!/bin/sh\necho exact-hook\n".into()).await.unwrap();
    assert!(repo.exists(" hooks\\name\n /pre-commit"));
    assert_eq!(git::get_git_hook_content(repo.s(), "pre-commit".into()).await.unwrap(), "#!/bin/sh\necho exact-hook\n");
    let result = git::run_git_hook(repo.s(), "pre-commit".into()).await.unwrap();
    assert_eq!(result.exit_code, 0);
    assert_eq!(result.output, "exact-hook");
}

#[tokio::test]
async fn invalid_hook_names_and_repositories_return_errors() {
    let repo = TestRepo::new("hooks-invalid");
    for name in ["../outside", "pre-commit/../../outside", "unknown-hook"] {
        assert!(git::save_git_hook(repo.s(), name.into(), "bad".into()).await.is_err());
        assert!(git::get_git_hook_content(repo.s(), name.into()).await.is_err());
        assert!(git::delete_git_hook(repo.s(), name.into()).await.is_err());
    }
    assert!(!repo.exists(".git/outside"));
    let absent = scratch_path("hooks-not-a-repository");
    std::fs::create_dir_all(&absent).unwrap();
    let error = expect_err(git::list_git_hooks(absent.to_string_lossy().into_owned()).await);
    assert!(!error.is_empty());
    std::fs::remove_dir_all(absent).unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn simultaneous_message_hooks_use_separate_private_temporary_files() {
    let first = TestRepo::new("hooks-message-first");
    let second = TestRepo::new("hooks-message-second");
    first.commit("file.txt", "first\n", "first private message");
    second.commit("file.txt", "second\n", "second private message");
    let script = "#!/bin/sh\nprintf '%s\\n' \"$1\"\nsleep 0.1\ncat \"$1\"\n";
    git::save_git_hook(first.s(), "commit-msg".into(), script.into()).await.unwrap();
    git::save_git_hook(second.s(), "commit-msg".into(), script.into()).await.unwrap();
    let (a, b) = tokio::join!(git::run_git_hook(first.s(), "commit-msg".into()), git::run_git_hook(second.s(), "commit-msg".into()));
    let a = a.unwrap();
    let b = b.unwrap();
    assert_eq!(a.exit_code, 0);
    assert_eq!(b.exit_code, 0);
    assert!(a.output.contains("first private message"));
    assert!(!a.output.contains("second private message"));
    assert!(b.output.contains("second private message"));
    let first_file = a.output.lines().next().unwrap();
    let second_file = b.output.lines().next().unwrap();
    assert_ne!(first_file, second_file);
    assert!(!std::path::Path::new(first_file).exists());
    assert!(!std::path::Path::new(second_file).exists());
}
