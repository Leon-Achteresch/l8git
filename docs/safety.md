# Safety net

[← Documentation index](README.md)

Git is unforgiving when a tool hides what it does. l8git takes the opposite position: every operation is recorded, most are reversible, and nothing destructive happens without you seeing it first.

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

Before anything happens, a dialog shows the operation and the commit it will return to. **Undo never uses `--hard`**: your local changes are kept, or the undo is refused. Operations that cannot be reversed automatically say so and point you at the reflog.

Branch deletions performed through the cleanup dialog are undone from the toast that appears right after archiving — see [Branches and stacks](branches-and-stacks.md#branch-cleanup-and-archiving).

## Reflog

The reflog view lists where `HEAD` has been, newest first, loading more entries on demand. Per entry you can:

- **Copy the hash**
- **Reset to this entry (keep changes)** — `HEAD` moves, local changes are kept; if they conflict, Git aborts and nothing is lost
- **Reset to this entry (hard)** — `HEAD` moves and the working tree is overwritten

Both resets confirm first, and the hard variant states plainly that uncommitted changes are gone for good. Whenever an operation is not covered by the undo log, the reflog is the fallback: everything Git recorded is still reachable here.

## Git command log

The transparency log records **every git command l8git runs**, newest first, with its duration and exit status. There is no hidden Git activity.

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
- The agent session review locks accept/discard while the agent is writing.
- Long remote operations (clone, fetch, push) show progress and can be cancelled.

## Credentials and keys

Git credentials and AI API keys are stored in the OS keychain, never in plain text in a config file. Signing in through the Git Credential Manager is preferred where it is available.

## Related

- [Commits and staging](commits-and-staging.md)
- [Branches and stacks](branches-and-stacks.md)
