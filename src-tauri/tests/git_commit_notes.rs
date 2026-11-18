mod common;

use common::{git_raw, scratch_path, TestRepo};
use l8git_lib::git::{repo_commit_inspect, repo_commit_note};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const NOTES_REF: &str = "refs/notes/commits";

async fn note(repo: &TestRepo, commit: &str) -> Value {
    let outcome = repo_commit_note(repo.s(), commit.into()).await.unwrap();
    serde_json::to_value(outcome).unwrap()
}

fn add_note(repo: &TestRepo, commit: &str, text: &[u8]) -> String {
    repo.write_bytes("note-fixture", text);
    let oid = repo.git(&["hash-object", "-w", "--", "note-fixture"]);
    repo.git(&[
        "notes",
        "--ref=commits",
        "add",
        "--allow-empty",
        "-f",
        "-C",
        &oid,
        commit,
    ]);
    oid
}

fn snapshot(path: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn collect(path: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in fs::read_dir(path).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_dir() {
                collect(&entry.path(), files);
            } else {
                files.insert(entry.path(), fs::read(entry.path()).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    collect(path, &mut files);
    files
}

#[tokio::test]
async fn local_note_is_exact_read_only_and_bound_to_the_selected_checkout_and_commit() {
    let repo = TestRepo::new("commit-notes");
    let first = repo.commit("first.txt", "first\n", "initial");
    let second = repo.commit("first.txt", "second\n", "second");
    assert_eq!(
        note(&repo, &first).await,
        json!({"notesRef": NOTES_REF, "status": "missing"})
    );
    let text = "  <b>literal</b> — *Markdown*\n第二行\n\n";
    add_note(&repo, &first, text.as_bytes());
    repo.git(&["notes", "--ref=private", "add", "-m", "other ref", &second]);
    repo.git(&["config", "core.notesRef", "refs/notes/private"]);
    repo.git(&["config", "notes.displayRef", "refs/notes/*"]);
    // Exercise a packed default ref and a linked checkout with a .git file.
    repo.git(&["pack-refs", "--all"]);
    let linked_path = scratch_path("notes-linked");
    repo.git(&[
        "worktree",
        "add",
        "--detach",
        linked_path.to_str().unwrap(),
        &second,
    ]);
    let linked = TestRepo::adopt(linked_path);
    let unrelated = TestRepo::new("notes-unrelated");
    // Git's path-prefix field can include newlines on Unix.
    let nested = repo.path.join(if cfg!(unix) {
        "\nsha1\nnested"
    } else {
        "nested"
    });
    fs::create_dir(&nested).unwrap();
    let repo_before = snapshot(&repo.path);
    let linked_before = snapshot(&linked.path);
    let expected = json!({"notesRef": NOTES_REF, "status": "text", "text": text});
    assert_eq!(note(&repo, &first).await, expected);
    assert_eq!(note(&linked, &first.to_ascii_uppercase()).await, expected);
    assert_eq!(
        note(&repo, &second).await,
        json!({"notesRef": NOTES_REF, "status": "missing"})
    );
    assert!(repo_commit_note(unrelated.s(), first.clone())
        .await
        .is_err());
    assert!(
        repo_commit_note(nested.display().to_string(), first.clone())
            .await
            .is_err()
    );
    let inspect =
        serde_json::to_value(repo_commit_inspect(repo.s(), first).await.unwrap()).unwrap();
    assert!(!inspect["header"].as_str().unwrap().contains("literal</b>"));
    assert_eq!(snapshot(&repo.path), repo_before);
    assert_eq!(snapshot(&linked.path), linked_before);
}

#[tokio::test]
async fn distinguishes_empty_and_bounded_text_from_incompatible_objects_and_read_errors() {
    let repo = TestRepo::new("commit-notes-limits");
    let commit = repo.commit("tracked", "text\n", "initial");
    let empty = add_note(&repo, &commit, b"");
    assert_eq!(
        note(&repo, &commit).await,
        json!({"notesRef": NOTES_REF, "status": "text", "text": ""})
    );
    for invalid in ["HEAD", "--help", &commit[..7], &empty, &"0".repeat(40)] {
        assert!(repo_commit_note(repo.s(), invalid.into()).await.is_err());
    }
    for binary in [b"plain\0text".as_slice(), b"\xff"] {
        add_note(&repo, &commit, binary);
        assert_eq!(note(&repo, &commit).await["status"], "unsupported");
    }
    let at_limit = "a".repeat(64 * 1024);
    add_note(&repo, &commit, at_limit.as_bytes());
    assert_eq!(note(&repo, &commit).await["text"], at_limit);
    add_note(&repo, &commit, &vec![b'a'; 64 * 1024 + 1]);
    assert_eq!(note(&repo, &commit).await["status"], "too_large");

    let missing = add_note(&repo, &commit, b"will be missing");
    fs::remove_file(
        repo.path
            .join(".git/objects")
            .join(&missing[..2])
            .join(&missing[2..]),
    )
    .unwrap();
    assert!(repo_commit_note(repo.s(), commit.clone()).await.is_err());

    // Construct a malformed mapping with a regular-file tree entry whose
    // object is actually a commit. Git lists it as a note, so check its type.
    let mut entry = format!("100644 {commit}\0").into_bytes();
    entry.extend(
        (0..commit.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&commit[i..i + 2], 16).unwrap()),
    );
    repo.write_bytes("note-fixture", &entry);
    let tree = repo.git(&[
        "hash-object",
        "--literally",
        "-w",
        "-t",
        "tree",
        "note-fixture",
    ]);
    let notes_commit = repo.git(&["commit-tree", &tree, "-m", "incompatible note fixture"]);
    repo.git(&["update-ref", NOTES_REF, &notes_commit]);
    assert_eq!(note(&repo, &commit).await["status"], "unsupported");
    fs::write(repo.path.join(".git/refs/notes/commits"), "broken ref\n").unwrap();
    assert!(repo_commit_note(repo.s(), commit).await.is_err());
}

#[tokio::test]
async fn reads_sha256_notes_in_a_bare_repository_and_requires_the_full_object_id() {
    let path = scratch_path("notes-bare-sha256");
    fs::create_dir(&path).unwrap();
    let (ok, output) = git_raw(&path, &["init", "--bare", "--object-format=sha256"]);
    assert!(ok, "{output}");
    let bare = TestRepo::adopt(path);
    bare.write("empty-tree", "");
    let tree = bare.git(&["hash-object", "-t", "tree", "-w", "empty-tree"]);
    let commit = bare.git(&["commit-tree", &tree, "-m", "bare fixture"]);
    assert_eq!(commit.len(), 64);
    add_note(&bare, &commit, b"bare text\n");
    assert_eq!(note(&bare, &commit).await["text"], "bare text\n");
    assert!(repo_commit_note(bare.s(), commit[..40].into())
        .await
        .is_err());
    assert!(
        repo_commit_note(bare.path.join("objects").display().to_string(), commit)
            .await
            .is_err()
    );
}
