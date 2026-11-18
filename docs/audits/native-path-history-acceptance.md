# Native macOS path history acceptance

Run from the repository root in a reserved macOS fixture session. The runner loads the production renderer and real Tauri command handlers in an incognito WKWebView. Its sandbox denies IP networking and writes to both synthetic repositories.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --history-path
python3 -I scripts/native-submodule-acceptance.py --history-text
```

The fixture creates a document, renames it on the first-parent branch, adds an unrelated file on the other branch and merges the branches. Git independently confirms both merge parents and an unchanged `docs/` tree relative to the first parent.

## Recorded result

Two runs passed at product commit `bf437ca72ac31171625581c9154766b6034ded96` on Apple silicon macOS 27.0.1 (26A434), Apple Git 2.54.0.

| Action | Native result |
| --- | --- |
| Open the History panel | The regular graph shows the merge and the original document commit. |
| Filter by `docs/` and by `:(glob)docs/**` | Both modes omit the fixture merge and keep the document and rename commits. Trace2 confirms path reads without `--follow`. |
| Filter by `docs/topic.txt` | The merge remains absent. The rename shows `docs/old.txt` as the previous path. Trace2 confirms `--follow --name-status`. |
| Activate the existing remove control using Enter | The active chip's accessible description points to the visible explanation. A trusted key event and activation remove the only filter, restore focus to the history query, and bring back the merge. |
| Combine the path with message search and remove the path using Space | A trusted key event and activation return focus to the query. The next IPC and Git query retain the message filter and clear the path. |

The runner sends Enter and Space to its own fixture process and checks the trusted WebKit events and resulting button activation. The two runs verified five history filter IPC calls each and 37 and 34 local Git reads respectively. The before/after snapshots matched bytes and modes for all 71 files, including configuration, refs, index and worktree. A separate Git check confirmed unchanged refs, HEAD and clean status. The runner verified process exit and removal of temporary profiles and repositories.

The adjacent F40 native history-text regression and three targeted Rust Git-history tests passed. Native combined-filter coverage uses message search. Branch retention is covered by the earlier Chromium test. The native evidence is scoped to the private fixture, with signed packaging, regular production startup, daemon and other platforms as separate acceptance scopes.
