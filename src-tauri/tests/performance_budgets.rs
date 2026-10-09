mod common;
use common::{json, TestRepo};
use l8git_lib::git;
use std::time::Instant;

fn resident_bytes() -> u64 {
    #[cfg(windows)]
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!("(Get-Process -Id {}).WorkingSet64", std::process::id()),
        ])
        .output()
        .expect("read benchmark process working set");
    #[cfg(not(windows))]
    let output = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output()
        .expect("read benchmark process RSS");
    assert!(output.status.success(), "RSS measurement failed");
    let bytes = String::from_utf8(output.stdout)
        .unwrap()
        .trim()
        .parse::<u64>()
        .expect("numeric RSS");
    #[cfg(not(windows))]
    let bytes = bytes * 1024;
    bytes
}

/// Generous shared-runner ceilings, intended to catch order-of-magnitude regressions.
#[tokio::test]
async fn status_and_diff_stay_bounded_on_a_fixed_large_worktree() {
    let repo = TestRepo::new("performance");
    repo.commit("large.txt", &"old line\n".repeat(10_000), "initial");
    repo.write("large.txt", &"changed line\n".repeat(10_000));
    for n in 0..1000 {
        repo.write(&format!("files/{n}.txt"), "untracked\n");
    }
    let start = Instant::now();
    let status = json(&git::repo_full_status(repo.s()).await.unwrap());
    let status_ms = start.elapsed().as_millis();
    assert_eq!(status["entries"].as_array().unwrap().len(), 1001);
    assert!(
        status_ms < 10_000,
        "status: {status_ms} ms exceeds 10000 ms"
    );
    let start = Instant::now();
    let diff = json(
        &git::repo_file_diff(repo.s(), "large.txt".into(), false, None)
            .await
            .unwrap(),
    );
    let diff_ms = start.elapsed().as_millis();
    assert!(diff["unstaged"].as_str().unwrap().contains("+changed line"));
    assert!(diff_ms < 5000, "diff: {diff_ms} ms exceeds 5000 ms");
    // The integration-test process links the native backend. This is its resident memory
    // after the workload, excluding the renderer and short-lived Git subprocesses.
    let rss_bytes = resident_bytes();
    assert!(
        rss_bytes < 512 * 1024 * 1024,
        "backend RSS {rss_bytes} exceeds 512 MiB"
    );
    println!("fixture 1000 files / 20000 changed lines: status_ms={status_ms}, diff_ms={diff_ms}, backend_rss_bytes={rss_bytes}");
}
