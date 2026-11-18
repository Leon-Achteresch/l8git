# Native macOS worktree catalog acceptance

Run the opt-in F39 launcher in a macOS desktop session reserved for this fixture. It uses fresh production assets in an incognito Tauri/Wry window with a private home and scratch directory.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --worktree-catalog
```

The bundled App starts its regular `watch_repo` / `unwatch_repo` lifecycle. Those calls run the real watcher. The fixture sink records each catalog notification and forwards it through the same Tauri `emit_to("main", ...)` path as the Desktop App. The regular Worktree panel handles the event and invokes the real `list_worktrees` through Tauri IPC. It displays the returned rows and the check time. The bridge also supplies counters to the acceptance script.

A launcher process outside the App's sandbox performs the fixture's external Git operations. It checks the resulting registration count independently. The window can read the two registered fixture repositories. The launcher proves that App writes and custom Git mutation commands are denied. Git uses a private environment with personal and system configuration disabled. The sandbox denies IP networking, and built assets and IPC use Tauri's local custom protocol. No port or external service is required.

## Recorded result

Passed on Apple silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0. `catalog-linked` had a `.git` file pointing to its registration in the separate `catalog-main` Common Dir. The output records `NATIVE_WORKTREE_TRACE` for watcher requests, native events and list IPC. `NATIVE_WORKTREE_EXTERNAL` reports independent Git counts, and `NATIVE_WORKTREE_RESULT` records visible UI assertions.

| Phase | Independent Git count | Visible catalog | New catalog events / list IPC |
| --- | --- | --- | --- |
| Open linked checkout | 2 | 2, including the parent and linked checkout | 0 / 1 |
| First idle window | 2 | 2 | 0 / 0 |
| Three external adds | 5 | 5, including all three added checkouts | 1 / 1 |
| Three external removes | 2 | 2, with the added rows gone | 1 / 1 |
| Open the independent repo | 1 | Its single main checkout | 0 / 1 |
| External add to the inactive repo | 3 in the linked catalog | 1 in the active repo | 0 / 0 in both repos |
| Return to the linked repo | 3 | 3, including the new checkout | 0 / 1 |

The 3.4-second quiet windows also span the existing directory-stat interval. The fixture finished with 56 protected files unchanged in bytes and mode. The window and its process exited, and the temporary App profile and fixture repositories were removed. The shared launcher’s F39 staging and F20/F21 submodule modes also passed with these assets.

This evidence covers the production renderer and real Desktop event and Git IPC in the private WKWebView fixture. The earlier macOS headless and Chromium runs have their original scopes. [Linux/inotify acceptance](linux-worktree-catalog-acceptance.md) remains a separate headless result. Signed packaging, regular startup services, Linux Tauri, Windows and network filesystems remain separate acceptance boundaries.
