# Native macOS compare rename acceptance

Run from the repository root in the reserved macOS fixture session. Reuse the existing frontend dependencies and Cargo target. Build the renderer and the fixture example only.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 ./node_modules/.bin/vite build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --compare-rename
```

The fixture uses the existing Compare test host with private profile and separate temporary Git repositories. The launcher creates an original file, moves it unchanged and rewrites it in a third commit. An independent `git diff --name-status --find-renames -l1000` confirms `R100 old.txt → new.txt` for the first comparison and separate `A new.txt` and `D old.txt` for the second.

## Recorded result

Two final instrumented runs passed on Apple silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0 at product commit `63b98eafa0d2dad2c37f92768c32470a9da66ad5`.

- The regular Compare view opens through the command palette. The first comparison shows Renamed, the previous path and the existing Git rename patch for both paths.
- Comparing the same base to the rewritten commit shows Added and Deleted separately. Selecting the entries shows their respective added and removed content. Neither request carries a previous path.
- Trusted, process-scoped Enter opens the named explanation dialog. Escape closes it and restores focus in both comparisons. The recorded application IPC sequence is unchanged across each disclosure cycle. The test host excludes its own keyboard and observation commands from that assertion.
- Each completed run verified two comparison summary IPC calls, three pinned file-diff IPC calls and 45 Git read processes. The trace confirms the existing rename-detection flags and pathname arguments. The initial count-only probe observed a counter difference without recording the command name. It showed the expected Rename comparison and no extra comparison or diff call. Both subsequent command-name-instrumented runs passed.

The sandbox denies IP networking and writes to either fixture repository. The snapshots matched all 61 files by bytes and mode, including refs, Git configuration, index and working files. Independent Git checks confirmed unchanged refs and HEAD, clean worktrees and absence of remotes. The fixture processes exited and their temporary directories were removed. The targeted Git rename regression also passed.

This evidence covers direct comparison in the private unsigned WKWebView fixture. Signed packaging, regular production startup and other platforms are separate acceptance scopes.
