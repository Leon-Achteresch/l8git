# Native macOS staging metadata acceptance

The F39 acceptance uses the opt-in F20/F21 fixture launcher with fresh production assets in a separate macOS Tauri/Wry window. Run it in a reserved desktop session with `sandbox-exec`, Python 3.9 or newer and the existing project build dependencies.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --staging-metadata
```

The launcher builds a disposable repository with no remote, a pure `chmod` change and two separated text hunks. Git uses a private environment with system and global configuration disabled. The window starts with empty nonpersistent WebKit storage and loads assets through Tauri's custom protocol. The fixture bridge dispatches the real staging commands for one exact canonical repository. Whole-file operations accept only `mode.sh`. Checked stage and unstage of a single hunk accept only `text.txt`. Bulk staging, a mode hunk, an out-of-scope repository and a synthetic keychain request are rejected. The script drives the regular Commit panel's controls inside the fixture window.

`sandbox-exec` denies IP and limits filesystem writes to the synthetic Git directory, private home and scratch, and `/dev/null`. The preflight tests a denied IP bind, denied writes to the worktree and a protected sentinel outside the repository, and an allowed Git-directory write. The launcher snapshots file digests and modes outside the expected index and object changes. The launcher's own child exits on completion. The timeout terminates its process group. The launcher removes the temporary profile and repository.

## Recorded result

Passed on arm64 macOS 27.0.1 (26A434) with Apple Git 2.54.0. The production build included TypeScript and Vite. The build produced the existing large-chunk warnings, and the example linked with an `__EMBED_INFO_PLIST` warning.

| Check | Observed result |
| --- | --- |
| Unstaged and staged mode change | The native Commit panel showed `old mode 100644` and `new mode 100755` on the selected side. The live IPC returned those exact patch lines, and the panel exposed no hunk or line controls. |
| Whole-file actions | The real `stage_files` and `unstage_files` calls moved the mode patch to the index and back to the worktree. |
| Text-hunk actions | The first of two hunks entered the index through `git_apply_reviewed_hunks:stage`. The second remained in the worktree. `git_apply_reviewed_hunks:unstage` restored both edits to the worktree diff. |
| Final Git state | The four calls above were the entire accepted mutation trace. Independent Git reads found an empty staged diff, the original unstaged diff and no remotes. All 24 protected files retained their bytes and modes. |
| Cleanup and shared-runner regression | The native process exited and the private staging fixture and profile were removed. The default F20/F21 submodule fixture also passed against the fresh assets, with all 192 fixture files unchanged. Its process and temporary files were removed. |

The `dist/index.html` SHA-256 was `b86fa7fcbf9969333ba7de618de36b484885be411dde69a9eb2a5ff99d9ea253`. The Vite manifest SHA-256 was `74cdfe323ee8d87526dc37d814941434c4ddc96d6feadffac1eda917fa4f06bd`.

The evidence covers the production renderer and real local Git IPC in the isolated macOS example. Signed packaging, production startup services and runtime on Windows and Linux remain separate acceptance boundaries.
