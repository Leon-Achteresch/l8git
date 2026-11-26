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

#[tokio::test]
async fn background_status_counts_large_untracked_text() {
    let repo = TestRepo::new("idle-status");
    let lines = 1_048_576;
    repo.write("build-output.txt", &"a thirty-two byte log message!!\n".repeat(lines));
    let mut samples = Vec::new();
    let mut path_samples = Vec::new();
    for round in 0..7 {
        for compact in [round % 2 == 0, round % 2 != 0] {
            let start = Instant::now();
            if compact {
                let status = git::repo_status_paths(repo.s()).await.unwrap();
                path_samples.push(start.elapsed().as_secs_f64() * 1000.0);
                let entry = &json(&status)[0];
                assert_eq!(entry["path"], "build-output.txt");
                assert_eq!(entry["untracked"], true);
                assert!(entry.get("additions_unstaged").is_none());
            } else {
                let status = git::repo_status(repo.s()).await.unwrap();
                samples.push(start.elapsed().as_secs_f64() * 1000.0);
                assert_eq!(json(&status)[0]["additions_unstaged"], lines);
            }
        }
    }
    samples.sort_by(f64::total_cmp);
    path_samples.sort_by(f64::total_cmp);
    println!("32 MiB untracked text: full_status_median_ms={:.2}, path_status_median_ms={:.2}", samples[3], path_samples[3]);
    assert!(samples[3] < 2000.0);
}

#[cfg(unix)]
#[tokio::test]
async fn untracked_link_counts_its_text_independently_of_its_target() {
    let repo = TestRepo::new("link-status");
    std::os::unix::fs::symlink("/dev/zero", repo.path.join("device-link")).unwrap();
    let status = json(&git::repo_status(repo.s()).await.unwrap());
    assert_eq!(status[0]["path"], "device-link");
    assert_eq!(status[0]["binary"], false);
    assert_eq!(status[0]["additions_unstaged"], 1);
}
