# Read-only display diff contract (IDs 52–54)

Root owns `src-tauri/src/diff_preview.rs` and `src/lib/diff-preview.ts`. Opus owns UI integration.

`loadDiffPreview(path, request)` calls `repo_diff_preview`. Request: `{kind: 'staged'|'unstaged'|'compare'|'merge-base'|'commit', file, previousFile?, base?, head?, ignoreWhitespace: boolean, colorMoved: boolean, context: number}`. Context is 0–500 inclusive. Commit uses `head`; comparisons use `base` and `head`. Staged/unstaged read the current index/worktree. Untracked plain files remain handled by existing viewer.

Response: `{patch, movedLines, truncated, binary, baseSha, headSha}`. Historical refs are resolved to immutable hashes. `movedLines` contains **zero-based patch-line indices**, not source line numbers. ANSI colors are removed before return. Output is bounded to 1MiB and incomplete trailing lines are removed on truncation. Pure whitespace changes may return an empty patch, which means no changes under this display mode.

These are transformed display patches, never staging/discard/AI commit-splitting inputs. Preserve original guarded patch flow for mutations; disable partial mutation controls for transformed view or explicitly use original patch identity. A context expander increases `context` for the selected file/ref pair; initial value 3.

Do not silently mark these IDs done until viewers use the controls and behavioral tests cover them.
