# Native macOS commit-file acceptance for a partial clone

Use the existing private fixture host on the reserved macOS desktop. The runner creates a read-only Git fixture and private app data, uses the Tauri custom protocol and denies IP networking before the host starts.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 ./node_modules/.bin/vite build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --partial-clone --headless
# After the desktop is assigned to this acceptance:
python3 -I scripts/native-submodule-acceptance.py --partial-clone
```

The launcher creates a local filtered clone with `blob:limit=100`. Both commits and their trees are local. The old blob of one changed file is absent, and another changed file has readable content on both sides. In the second repository, the launcher removes a locally authored parent blob that Git has never been promised. This repository also has a promisor setting, which tests that configuration alone is insufficient. The launcher verifies the two object absences independently.

The native scenario opens History and selects the exact commit and file through the production renderer. It expects the partial-clone explanation, a normal patch for the other file and the generic diff failure after switching repositories. The host uses the existing Tauri command handlers for both repositories. The launcher verifies the pinned diff IPC calls, and Trace2 checks for the real patch and object-proof processes.

## Recorded results

At F59 product commit `e4aa362`, Apple Git 2.54.0 and macOS arm64 passed the headless command-level run from the rebuilt example. The sandbox preflight denied an IP bind and writes to fixture worktree files, index, refs and configuration. Trace2 verified 29 Git processes with zero fetch and upload-pack starts. All 71 protected files matched by bytes and mode, and independent reads verified HEAD, refs, clean status and the expected synthetic remotes. The process exited and the temporary home, repositories and trace were deleted.

The visible WKWebView run passed after desktop assignment. Two commit-inspector IPC calls selected the pinned commits, and three file-diff IPC calls selected `missing.txt`, `present.txt` and `ordinary.txt` in the expected repositories. The renderer showed the missing-parent-blob hint, the readable patch and the generic diff error. The initial test observed the readable patch in the renderer dump but timed out on its span-specific assertion. The successful run checked the rendered patch line and the active file.

The native trace verified 73 Git processes with zero fetch and upload-pack starts. All 71 files matched, the independent Git metadata checks passed and the private Tauri process exited. The launcher removed its private fixture directory. This covers the unsigned fixture host with the production renderer. Signed packaging and other platforms are separate.
