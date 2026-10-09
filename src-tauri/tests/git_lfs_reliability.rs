mod common;

use common::TestRepo;
use l8git_lib::lfs;

fn pointer() -> String {
    format!(
        "version https://git-lfs.github.com/spec/v1\noid sha256:{}\nsize 12345\n",
        "a".repeat(64)
    )
}

#[test]
fn pointers_require_valid_algorithm_digest_size_order_and_unique_keys() {
    let valid = pointer();
    assert!(lfs::parse_pointer(&valid).is_some());
    for invalid in [
        valid.replace("sha256:", "sha1:"),
        valid.replace(&"a".repeat(64), "abc"),
        valid.replace(&"a".repeat(64), &"A".repeat(64)),
        valid.replace("size 12345", "size -1"),
        valid.replace("size 12345", "size 18446744073709551615"),
        format!("{valid}oid sha256:{}\n", "b".repeat(64)),
        valid.replace("oid sha256:", "oid  sha256:"),
        format!(
            "version https://git-lfs.github.com/spec/v1\nsize 12345\noid sha256:{}\n",
            "a".repeat(64)
        ),
        format!("{valid}extra key\n"),
        format!("{valid}{}", " ".repeat(1024)),
    ] {
        assert!(lfs::parse_pointer(&invalid).is_none(), "{invalid:?}");
    }
    assert!(lfs::parse_pointer(&valid.replace(
        "https://git-lfs.github.com/spec/v1",
        "https://hawser.github.com/spec/v1"
    ))
    .is_some());
    let extended = valid.replace(
        "oid sha256:",
        &format!("ext-0-test-name sha256:{}\noid sha256:", "b".repeat(64)),
    );
    assert!(lfs::parse_pointer(&extended).is_some());
    assert!(lfs::parse_pointer(&extended.replace(
        "oid sha256:",
        &format!("ext-0-other sha256:{}\noid sha256:", "c".repeat(64))
    ))
    .is_none());
}

#[test]
fn attribute_patterns_decode_quotes_octal_utf8_and_ignore_false_filter_matches() {
    let text = concat!(
        "# filter=lfs in a comment\n",
        "\"space name/*.psd\" filter=lfs diff=lfs\n",
        "\"tab\\tname\\npart/*.png\" filter=lfs\n",
        "\"\\303\\244/*.bin\" filter=lfs\n",
        "normal.txt text # notfilter=lfs\n",
        "ignored.bin filter=lfs filter=other\n",
        "unset.bin filter=lfs !filter\n",
        "\"broken\\q\" filter=lfs\n",
    );
    let patterns = lfs::parse_attributes_patterns(text, "space source/.gitattributes");
    assert_eq!(patterns.len(), 3);
    assert_eq!(patterns[0].pattern, "space name/*.psd");
    assert_eq!(patterns[1].pattern, "tab\tname\npart/*.png");
    assert_eq!(patterns[2].pattern, "ä/*.bin");
    assert!(patterns
        .iter()
        .all(|pattern| pattern.source == "space source/.gitattributes"));
}

#[test]
fn json_file_list_preserves_paths_and_distinguishes_checkout_from_cache_presence() {
    let path = " leading\tpart\nfile (1.2 MB) ";
    let value = serde_json::json!({"files": [{
        "name":path,"size":12345,"checkout":false,"downloaded":true,
        "oid_type":"sha256","oid":"a".repeat(64),"version":"https://git-lfs.github.com/spec/v1"
    }]});
    let files = lfs::parse_ls_files_json(&value.to_string()).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, path);
    assert_eq!(files[0].size, "12345 B");
    assert!(!files[0].downloaded);
    assert!(lfs::parse_ls_files_json("{\"files\":null}")
        .unwrap()
        .is_empty());
    for invalid in [
        "{}",
        "not json",
        "{\"files\":{}}",
        "{\"files\":[{\"name\":\"missing-fields\"}]}",
    ] {
        assert!(lfs::parse_ls_files_json(invalid).is_err());
    }
    let mut invalid = value;
    invalid["files"][0]["oid"] = "bogus".into();
    assert!(lfs::parse_ls_files_json(&invalid.to_string()).is_err());
}

#[test]
fn json_patterns_preserve_special_paths_and_exclusion_state() {
    let value = serde_json::json!({"patterns": [
        {"pattern":" space\nname/*.psd ","source":"tab\tpath/.gitattributes","tracked":true},
        {"pattern":"*.excluded","source":".gitattributes","tracked":false,"lockable":false},
        {"pattern":"*.lockable","source":".gitattributes","tracked":false,"lockable":true}
    ]});
    let patterns = lfs::parse_track_json(&value.to_string()).unwrap();
    assert_eq!(patterns[0].pattern, " space\nname/*.psd ");
    assert_eq!(patterns[0].source, "tab\tpath/.gitattributes");
    assert!(!patterns[0].excluded);
    assert!(patterns[1].excluded);
    assert!(!patterns[2].excluded);
    assert!(lfs::parse_track_json("{}").is_err());
}

#[test]
fn legacy_listing_preserves_leading_and_trailing_filename_spaces() {
    let entry = lfs::parse_ls_files_line("4d7a214614 *  leading name  (123 B)").unwrap();
    assert_eq!(entry.path, " leading name ");
    assert_eq!(entry.size, "123 B");
    let entry = lfs::parse_ls_files_line("4d7a214614 - plain trailing ").unwrap();
    assert_eq!(entry.path, "plain trailing ");
}

#[tokio::test]
async fn pointer_lookup_rejects_invalid_paths_and_refs_with_real_errors() {
    let repo = TestRepo::new("lfs-invalid");
    repo.commit("asset.psd", &pointer(), "pointer");
    for file in ["../outside", "/tmp/outside", ".git/config", ""] {
        assert!(lfs::lfs_pointer_info(repo.s(), file.into(), None)
            .await
            .is_err());
        assert!(
            lfs::lfs_pointer_info(repo.s(), file.into(), Some("HEAD".into()))
                .await
                .is_err()
        );
    }
    for rev in ["--all", "missing-ref", "HEAD\n", "", " "] {
        assert!(
            lfs::lfs_pointer_info(repo.s(), "asset.psd".into(), Some(rev.into()))
                .await
                .is_err()
        );
    }
    let tree = repo.rev("HEAD^{tree}");
    assert!(
        lfs::lfs_pointer_info(repo.s(), "asset.psd".into(), Some(tree))
            .await
            .unwrap()
            .is_pointer
    );
    assert!(
        !lfs::lfs_pointer_info(repo.s(), "missing.psd".into(), Some("HEAD".into()))
            .await
            .unwrap()
            .is_pointer
    );
}

#[tokio::test]
async fn indexed_attributes_remain_visible_after_the_worktree_copy_is_deleted() {
    let repo = TestRepo::new("lfs-index-attrs");
    repo.commit(
        ".gitattributes",
        "\"space name/*.psd\" filter=lfs -text\n",
        "attributes",
    );
    std::fs::remove_file(repo.path.join(".gitattributes")).unwrap();
    assert!(lfs::lfs_available(repo.s()).await.unwrap().has_attributes);
    repo.write(
        ".gitattributes",
        "# filter=lfs is only a comment\nplain.txt notfilter=lfs\n",
    );
    assert!(!lfs::lfs_available(repo.s()).await.unwrap().has_attributes);
    assert!(
        lfs::lfs_available(repo.path.join("missing").to_string_lossy().into())
            .await
            .is_err()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn pointer_and_attributes_paths_preserve_unix_backslashes_whitespace_and_newlines() {
    let repo = TestRepo::new("lfs-exact-path");
    let file = " leading\tpart\nname\\literal ";
    repo.commit(file, &pointer(), "special pointer");
    assert!(
        lfs::lfs_pointer_info(repo.s(), file.into(), None)
            .await
            .unwrap()
            .is_pointer
    );
    assert!(
        lfs::lfs_pointer_info(repo.s(), file.into(), Some("HEAD".into()))
            .await
            .unwrap()
            .is_pointer
    );
    repo.commit(" ", &pointer(), "space-only pointer name");
    assert!(
        lfs::lfs_pointer_info(repo.s(), " ".into(), None)
            .await
            .unwrap()
            .is_pointer
    );
    repo.write(
        "space\ttab\nname/.gitattributes",
        "\"space name/*.psd\" filter=lfs\n",
    );
    assert!(lfs::lfs_available(repo.s()).await.unwrap().has_attributes);
    // A historical object lookup does not depend on a live parent directory.
    repo.commit("removed/asset.psd", &pointer(), "historical nested pointer");
    std::fs::remove_dir_all(repo.path.join("removed")).unwrap();
    assert!(
        lfs::lfs_pointer_info(repo.s(), "removed/asset.psd".into(), Some("HEAD".into()))
            .await
            .unwrap()
            .is_pointer
    );
}

#[cfg(unix)]
#[tokio::test]
async fn symlinked_pointer_and_attributes_never_read_outside_the_worktree() {
    use std::os::unix::fs::symlink;
    let repo = TestRepo::new("lfs-links");
    let outside = TestRepo::new("lfs-links-outside");
    outside.write("asset.psd", &pointer());
    outside.write("attributes", "*.psd filter=lfs\n");
    symlink(outside.path.join("asset.psd"), repo.path.join("asset.psd")).unwrap();
    assert!(lfs::lfs_pointer_info(repo.s(), "asset.psd".into(), None)
        .await
        .is_err());
    repo.commit_all("symlink asset");
    assert!(
        !lfs::lfs_pointer_info(repo.s(), "asset.psd".into(), Some("HEAD".into()))
            .await
            .unwrap()
            .is_pointer
    );
    symlink(
        outside.path.join("attributes"),
        repo.path.join(".gitattributes"),
    )
    .unwrap();
    assert!(lfs::lfs_available(repo.s()).await.is_err());
    std::fs::remove_file(repo.path.join(".gitattributes")).unwrap();
    symlink(&outside.path, repo.path.join("outside-link")).unwrap();
    assert!(
        lfs::lfs_pointer_info(repo.s(), "outside-link/asset.psd".into(), None)
            .await
            .is_err()
    );
}
