# Native macOS commit text acceptance

Run from the repository root in the reserved macOS fixture session. The existing F51 runner uses the production renderer and real Tauri command handlers inside a private, network-isolated WKWebView.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --history-text
python3 -I scripts/native-submodule-acceptance.py --commit-search
```

The launcher creates real SHA-1 and SHA-256 repositories with Latin-1 commits carrying an ISO-8859-1 header and UTF-8 commits using Git's default declaration. It checks the stored message bytes and confirms that ordinary Git logs emit Latin-1 bytes with the fixture's `i18n.logOutputEncoding=ISO-8859-1`. A separate Latin-1 commit in the SHA-256 repository is older than the first 80 history entries.

## Recorded result

Passed at product commit `c3186852f700a9ff6572591712ce204a08453166` on Apple silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0.

| Action | Native result |
| --- | --- |
| Open both repositories and view History | The rendered subjects match exactly. The real open-repository IPC returns the matching full IDs, subjects and bodies for each encoding. |
| Scroll the SHA-256 history | The renderer requests the next page at offset 80 and shows the older Latin-1 subject. The page IPC returns its exact body. |
| Search by uppercase full ID and by accented message body | Each query finds one hit and focuses the correct full-ID row in its repository. |
| Open the selected commit and expand its message | The detail IPC uses the full ID, and the rendered subject and body match the fixture exactly. |

Two fresh runs each verified eight search IPC calls, four detail IPC calls and 140 local Git read processes. Git Trace2 confirmed the fixture paths and successful message reads using `--encoding=UTF-8`. The sandbox preflight denied IP binds and writes to protected fixture data including both Git configurations. The before/after snapshots matched bytes and modes for all 143 files, including refs, index, working file and configuration. An independent Git check confirmed the refs, HEAD, clean worktree and absence of remotes. The runner confirmed that its processes had exited and its temporary profiles and repositories were gone. The F51 native regression and nine targeted headless Rust tests also passed.

This run covers the initial and paginated all-refs history, detail expansion and toolbar search. Filtered history retains the existing Rust and Chromium evidence. Signed packaging, the daemon, regular startup services, other platforms and other text surfaces are separate acceptance scopes. Incorrect or missing encoding declarations for non-UTF-8 data retain the existing Git decoding behavior.
