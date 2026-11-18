# Native macOS history date acceptance

Run from the repository root in a reserved macOS fixture session. The runner uses production assets, real Tauri command handlers and an incognito WKWebView. Its sandbox denies IP networking and writes to both synthetic Git repositories.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --history-dates
python3 -I scripts/native-submodule-acceptance.py --history-path
```

The fixture sets author and committer dates explicitly. Git independently reads the ISO values with `%aI` and `%cI` and the header values with `%ad` and `%cd` using its default date format.

| Commit | Git author ISO date | Git committer ISO date |
| --- | --- | --- |
| Different Git dates | `2025-07-10T11:15:00+02:00` | `2025-07-11T14:00:00-04:00` |
| Same Git dates | `2025-07-09T10:00:00+02:00` | `2025-07-09T10:00:00+02:00` |

## Recorded result

Two runs passed on Apple silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0 at development base `232b81f495ca8b25e9bd7fbaa889b38ad9c384bf`, which includes F54 product commit `104072e463a7261eab7301d26c998101d27f5e48`.

- The regular history row and open-repository IPC preserve the committer ISO date. The history tooltip labels its formatted value as the committer date.
- The collapsed inspector shows and labels the author date. Its machine-readable time and displayed value represent the instant from Git's author ISO date.
- The history and inspector expose their respective labels as screen-reader text. Trusted, process-scoped Enter and Space events open the inspector and retain focus on its disclosure button. The expanded header shows both Git values under `AuthorDate` and `CommitDate`.
- Switching from the differing-date commit to the equal-date commit presents the newly selected values with the inspector collapsed. Both date labels remain distinguishable even when the instants match.

Each run verified 36 local Git reads and two native commit-detail IPC calls bound to the selected hashes. The byte and mode snapshots matched all 57 fixture files, including worktree files, index, refs and Git configuration. The independent Git check confirmed unchanged refs and HEAD, clean status and absence of remotes. The F62 native path-history regression and two targeted headless Rust tests passed. The runner verified process exit and removal of the private profiles and repositories.

The accessibility check covers screen-reader text and trusted keyboard focus in the fixture. VoiceOver interaction, signed packaging, regular production startup and other platforms are separate acceptance scopes.
