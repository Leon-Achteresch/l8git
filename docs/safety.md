# Safety net

[← Documentation index](README.md)

Use the operation preview, recovery tools and command log to understand a change before applying it. Git can recover commits and saved stashes; it cannot recover every discarded edit.

The three tools below live in the **Tools** panel of the sidebar and are also reachable from the command palette (`Mod+K`).

## Undo the last operation

**Undo last operation** reverses what you just did.

Supported operations:

| Operation | Undo behaviour |
|-----------|----------------|
| Merge | back to the pre-merge state |
| Rebase | back to the pre-rebase state |
| Reset | back to where `HEAD` was |
| Cherry-pick | back to before the pick |
| Revert | back to before the revert |
| Commit | the commit is undone, its changes stay **staged** |
| Amend | the amend is undone, the changes stay **staged** |

Before anything happens, a dialog shows the operation, current HEAD, destination and reset mode. The confirmation is tied to that preview. If another operation changes it, Undo stops and asks you to reload the preview. **Undo never uses `--hard`**: your local changes are kept, or the undo is refused. Operations that cannot be reversed automatically say so and point you at the reflog.

Branch deletions performed through the cleanup dialog are undone from the toast that appears right after archiving — see [Branches and stacks](branches-and-stacks.md#branch-cleanup-and-archiving).

## Reflog

The reflog view lists where `HEAD` has been, newest first, loading more entries on demand. Per entry you can:

- **Copy the hash**
- **Inspect commit** — read the commit and file diffs without restoring files
- **Create rescue branch** — attach a new branch to the selected commit without checking it out or changing local files
- **Reset to this entry (keep changes)** — `HEAD` moves, local changes are kept; if they conflict, Git aborts and nothing is lost
- **Reset to this entry (hard)** — `HEAD` moves and the working tree is overwritten

Both resets confirm the exact target hash and current HEAD. If either changes, select the entry again. A hard reset refuses dirty tracked files and untracked or ignored files that would be overwritten, listing the affected paths. Unrelated untracked files may remain. Reflog entries are local and can expire; use a rescue branch to retain an important commit.

## Git command log

The transparency log records Git commands from l8git's command runners, newest first, with their duration and exit status. Use it to trace repository operations and inspect failed commands.

- Filter the list, copy any command to run it yourself in a terminal
- Pause and resume live updates while you read
- Clear the log — this only discards the recording, your repositories are untouched

When you report a bug, the failing entry from this log is the single most useful thing to attach.

## Confirmations and guards

l8git asks before it destroys something, and the wording says what will actually be lost:

- Discarding file changes, several files at once, all staged changes, or a line selection
- Deleting a branch that is not fully merged — the dialog states that its commits will be permanently lost
- Dropping commits in the interactive rebase editor requires a second confirming click
- Discarding an agent's hunk or file in the session review
- A hard reset from the reflog

Additional guards:

- A rebase with a dirty working tree is refused unless you enable autostash — the files in the way are named.
- Starting a rebase while one is already in progress is refused; continue, skip or abort first.
- The commit-splitting flow verifies that the planned changes still exist before creating commits, and stops cleanly if the working tree moved on.
- File discard previews distinguish working-copy changes from staged changes and show new files that will be deleted. Exclude individual files or create a stash instead. Content fingerprints check disk contents, index entries and restore sources again before discard; changed files require a fresh preview.
- The agent session review locks accept/discard while the agent is writing. Its file and hunk discards also check the displayed content fingerprint, current HEAD and merge base immediately before applying changes. Binary file changes invalidate the preview too. Hunk patches are parsed by Git in both directions and must affect only the displayed file; rename, copy and permission changes are refused. Whole-file discard restores the merge base and stages that result; a file introduced by the session is removed without rewriting its existing commits.
- Finishing an agent session requires review confirmation and checks the base branch, both commit hashes, file contents, index entries, local edits and active Git operations. An edit invalidates that confirmation even if filenames and line counts stay the same, including binary files. The final content check, staging and commit share one backend operation that excludes other l8git staging or commit operations in the same backend between them. Git runs the repository's usual hooks, filters and signing configuration. Cleanup removes only a clean, integrated worktree. Its branch deletion verifies the reviewed branch tip and the destination tip in a Git reference transaction; a moved or recreated branch is preserved. An interrupted cleanup can be resumed. On mobile, checkpoints and actions stay bound to the original host, including recovery after a lost removal response.
- Long remote operations (clone, fetch, push) show progress and can be cancelled.

## Credentials and keys

Git credentials and AI API keys are stored in the OS keychain, never in plain text in a config file. Signing in through the Git Credential Manager is preferred where it is available.

## Related

- [Commits and staging](commits-and-staging.md)
- [Branches and stacks](branches-and-stacks.md)
