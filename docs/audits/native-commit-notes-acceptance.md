# Native macOS commit notes acceptance

Run the opt-in fixture in a macOS desktop session reserved for this test.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --commit-notes
```

The launcher builds two temporary Git repositories without remotes. They share one commit ID and carry different notes on it. The primary also has an alternate-ref note, an empty blob, text at the size limit, text one byte above the limit, and a Notes entry whose blob is missing. The opt-in Tauri example serves the production assets through its local custom protocol in an incognito WKWebView. It exposes the production Git handlers through Tauri IPC and restricts the handler to the fixture repositories. The assertions use the rendered History panel and commit detail controls.

The sandbox denies IP networking and writes to either repository. The preflight verifies IP bind and write denial for a tracked file and both Notes refs. The WebView verifies empty local storage and rejects an out-of-scope Notes request and an attempted staging command. Git inherits the private test home, disabled personal and system configuration, and an empty transport allowlist. The launcher compares file hashes and modes, all refs including HEAD, index and working-tree status, and the absence of remotes.

## Recorded result

Passed on Apple silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0. Production asset SHA-256 values were `0851781e204902bfa1bebf5a5a084efd64872ee35e7b0f96793fb9a0eb225dad` for `dist/index.html` and `4aa2df49fb838034ae74f359fbab9013d7ec088d255ce7b40757ac39ece76fa1` for the Vite manifest.

| Action | Visible result | Git and IPC evidence |
| --- | --- | --- |
| Open History and select a commit | Commit subject, expanded message and ordinary file diff. Notes stay collapsed. | Zero Notes calls. The normal details run `git show --no-notes`. |
| Expand Local Git note | Exact UTF-8 text with HTML tags and Markdown characters displayed literally, plus `refs/notes/commits`. Message and diff stay visible. | One IPC call identifies the selected path and full SHA. Git resolves and reads the blob. |
| Select the commit annotated only on an alternate ref | No local note under the displayed standard ref. | The lookup on `refs/notes/commits` exits 1. |
| Select and expand the empty note | The note is empty. The source ref is visible. | A zero-byte blob read succeeds. |
| Expand the two boundary cases | 65,536 bytes render. 65,537 bytes show the size limit state. | Git reads the first blob. For the second, it reads the size and stops before reading the text. |
| Expand the entry with the missing blob | A read error with Retry. | Mapping lookup succeeds; the blob type lookup exits 128. |
| Switch A → B → A | The disclosure starts collapsed at each selection. The same SHA shows B's note in B and the original note on return to A. | Each explicit read targets the active repository and selected SHA. |

`NATIVE_NOTES_RESULT` recorded success with eight calls in each of two fresh runs. The launcher matched all eight `NATIVE_NOTES_IPC` entries and the ordered start and exit records of 42 actual Notes subprocesses in Git Trace2. It also checked regular commit detail reads in both repositories. All 95 protected files retained their bytes and modes. Independent Git checks confirmed identical refs, clean checkouts and no remotes. The owned window and process exited and the temporary profile and repos were removed on each run. The existing staging, worktree and submodule modes also passed with these assets.

The three Git integration tests, one Notes process-boundary test, and three dispatcher coverage tests passed. The ten tests in `commit-notes.spec.ts` and `history-workflows.spec.ts` also passed in private headless Chromium with one worker. The Chromium Notes tests cover delayed replies across commit and repository switches. This native result covers the production renderer and real Desktop Git IPC in the isolated WKWebView fixture. Signed packaging, production startup services, and Linux and Windows runtimes remain separate acceptance boundaries.
