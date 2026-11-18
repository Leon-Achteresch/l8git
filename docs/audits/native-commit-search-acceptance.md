# Native macOS commit search acceptance

Run from the repository root in a macOS desktop session reserved for the fixture. Reuse the existing Cargo target and frontend dependency cache.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --commit-search
```

The F46 harness loads the production renderer through Tauri's custom protocol in an incognito WKWebView. It registers the real `repo_search_commits`, `repo_log_page` and commit detail handlers for two synthetic local repositories. The launcher checks the object formats, the blob and missing object, and the contents of the first 80 history entries independently with Git.

## Recorded result

Passed on Apple-silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0 at product commit `4d688ac51d885465faf24ebcfbfbc5ab44fa8246`. The build produced SHA-256 `61a08dfdae26505757e4f432f7350a8cb8883295eabcd2d0b5b3f933b0cbbb06` for `dist/index.html` and `9666154fa0ed4afad49fcb96f259e29ef847d163c16c9edca3b25308cb7379b9` for the Vite manifest.

| Action | Visible result and native evidence |
| --- | --- |
| Search for the full SHA-256 of a commit beyond the initial page | The toolbar counted one hit. Next search match left focus in place. The Git trace confirmed the 80-commit initial load and IPC showed no additional page request for that repository. |
| Search for the full SHA-256 of an existing blob | The toolbar counted zero hits, even though a commit message mentioned the ID. |
| Search for a loaded commit using its full SHA-256 in uppercase | The toolbar counted one hit despite a second commit mentioning the ID. Next search match focused the row identified by the full lowercase ID. Selecting it passed that exact ID to the native detail handler and showed the expected subject and changed file. |
| Search for a missing full SHA-256 | The toolbar counted zero hits, even though a commit message mentioned the ID. |
| Switch to the SHA-1 repository | The active query reset. The exact 40-character ID focused the correct row and opened its details with the full ID. Searching for the previous repository's SHA-256 gave zero hits. |

Two fresh runs each verified six native search calls, two exact commit detail calls and 94 local Git read processes. Git Trace2 confirmed the matching object-format probes, searches and detail reads. The sandbox denies IP traffic and writes to both repositories. The preflight checks IP bind and protected worktree, ref, HEAD and index writes. Both runs matched all 139 protected files by bytes and mode and independently verified refs, HEAD, clean status and absence of remotes. The runner confirmed each owned process exited and its private fixture directory was removed.

The existing `--qualified-compare` mode passed with the same binary. All eight headless Rust commit-search tests passed with the existing Cargo target.

The existing Rust and Chromium results at the product commit remain separate evidence for F51. The native result covers the private unsigned WKWebView harness. Signed packaging, production startup, the daemon, Linux and Windows remain separate acceptance scopes.
