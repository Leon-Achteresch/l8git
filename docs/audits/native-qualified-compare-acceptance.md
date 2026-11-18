# Native macOS qualified comparison acceptance

Run in a macOS desktop session reserved for this fixture. Reuse the existing Cargo target and frontend dependency cache.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --qualified-compare
```

The harness loads the built application in the incognito WKWebView through Tauri's local custom protocol. It registers the real `repo_compare_commits` and `repo_compare_file_diff` handlers for two temporary Git repositories. The harness exercises the regular command palette and Compare controls. An independent Python process sets up the refs and performs the single external deletion. The application sandbox denies IP networking and writes to either repository.

## Recorded result

Passed on Apple silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0 at product commit `2d21b19430f5254071da215357f25af9949285e0`. Asset SHA-256 values were `61a08dfdae26505757e4f432f7350a8cb8883295eabcd2d0b5b3f933b0cbbb06` for `dist/index.html` and `9666154fa0ed4afad49fcb96f259e29ef847d163c16c9edca3b25308cb7379b9` for the Vite manifest.

| Compare action | Visible result and native evidence |
| --- | --- |
| Open Compare from the command palette | `origin/main` displayed. The qualified base `refs/remotes/origin/main` resolved to the fixture base. |
| Select local branch `release` | `refs/heads/release` resolved to its commit. The diff showed `native-f46-local`. |
| Select annotated tag `release` | `refs/tags/release` resolved to the tag object, then to its distinct commit. The diff showed `native-f46-tag`. |
| Select the local tracking ref `origin/release` | `refs/remotes/origin/release` resolved to its distinct local commit. The diff showed `native-f46-remote`. |
| Enter `HEAD~1` and a full SHA | The expected pair and changed line rendered through the free revision path. |
| Refresh after external deletion of the chosen local branch | Compare displayed an error naming `refs/heads/release` with a Retry action and kept the selection. The fixture's shadow tag still resolved through Git's ordinary revision lookup. The exact Compare lookup failed. |
| Switch repositories and reopen Compare | The new repository used its own default revisions and displayed its own diff. |

Each of two fresh runs validated eight summary IPC calls and seven pinned file-diff IPC calls. Git Trace2 showed 122 and 123 read processes and confirmed the exact lookup arguments, the failed lookup after deletion, and tag-object peeling. The sandbox preflight denied an IP bind and writes to the worktree, HEAD, selected ref and the second repository's index. The independent file snapshot retained bytes and modes for all 73 protected files. The separate Git check matched every remaining ref and HEAD, clean worktrees and empty remote lists. The owned windows and processes exited and temporary profiles and repositories were removed. The existing worktree and Notes modes of the shared harness also passed.

This evidence covers the regular production renderer and native Compare IPC inside the private WKWebView harness. The existing Rust Git and Chromium regression results remain separate. Abort behavior remains covered in Chromium. Signed bundles, production startup services and Linux and Windows runtimes remain separate acceptance boundaries.
