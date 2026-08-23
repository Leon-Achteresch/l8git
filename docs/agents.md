# Agents

[← Documentation index](README.md)

l8git embeds the AI coding CLIs you already use, so an agent session, its diff and the resulting commit all live in the same window as the rest of your Git work.

## The four providers

| Provider | CLI | How it runs |
|----------|-----|-------------|
| **Codex** | `codex` | `codex app-server`, one process per thread — the richest integration |
| **Claude Code** | `claude` | `claude --output-format stream-json`, approval prompts over stdio |
| **OpenCode** | `opencode` | ACP (`opencode acp`), one process per repository with multiplexed sessions |
| **Cursor** | `cursor-agent` | `cursor-agent --print` per turn, continued with `--resume` |

The CLI has to be installed and on your `PATH`; l8git spawns it, it does not bundle it. Providers differ in what they support (slash commands, settings surfaces, capability management) and the UI hides what a provider cannot do.

Open the **Agents** view from the header, pick a repository and a provider, and start a conversation.

## Chatting

- Conversations are listed per repository and can be renamed, pinned or archived. Older turns and older conversations load on demand.
- **Enter** sends, **Shift+Enter** adds a line. While a turn is running, Enter *steers* it instead of queuing a new message.
- Images can be attached (PNG, JPEG, GIF, WebP).
- Starter prompts are offered for an empty conversation: analyze the working tree, implement the next improvement, review the uncommitted changes.
- Thread actions: review the working tree, fork the conversation, compact the context.
- Where a provider exposes them, agent settings are editable inline — sandbox level (read only / write workspace / full access), approval policy, model, thinking effort, and mode (build or plan).
- Codex additionally has a **Capability Studio** for skills, MCP servers, plugins, apps and hooks, including an escape hatch to edit the raw `config.toml`, and an account menu showing usage against the short and weekly windows.

Any agent can render **charts**: it emits a fenced ` ```chart ` block with JSON (`bar`, `line` or `area`, one or more series), and the chat renders it as an interactive chart with tooltip and legend. The `/chart <what to visualize>` slash command appends the format documentation to the prompt so the agent knows how.

### Cost tracking

Token usage from all four providers is accumulated per day and priced with a built-in model price table. The sidebar shows today's cost and token count, with the seven-day total in the tooltip. Loading old history does not count as new usage.

## Worktree sessions

Instead of letting agents fight over one working tree, l8git can give each session its own Git worktree.

- **Creating** — a worktree is created at `<repo>.worktrees/<slug>` on a branch named `agents/<slug>`. It behaves like a normal repository in the app: its own status, diffs, commits and terminal.
- **Working** — when a turn ends, l8git gets your attention: a dock bounce if the window is not focused, otherwise a toast that jumps to the thread. The chat dock shows how many files the session has changed.
- **Landing** — the merge action in the repository picker merges `agents/<slug>` back into the base branch and removes the worktree and branch. It requires a clean worktree; a dirty base branch is rejected with an explanation, and merge conflicts land in the normal conflict state of the base repository.

Because several sessions can run in parallel, multiple agents can work on the same repository without stepping on each other.

## The agent overview

The overview lists every agent thread across the whole workspace: how many are running, how many wait for approval, total cost, and per thread the repository, branch, worktree and the number of uncommitted files. It is searchable by thread, repository or branch, and each entry has a status — running, waiting for approval, failed, or done.

Running and waiting agents also show up in the [Inbox](pull-requests.md#the-inbox).

## Reviewing what an agent did

**Review changes** opens the session review: the worktree's changes against the base branch, with counts for files, added and removed lines, commits, and uncommitted changes.

- Browse file by file. Binary files and new untracked files are labelled as such.
- Per hunk you can **keep** or **discard**; the same works for a whole file. Discarding asks for confirmation because the change is gone from the worktree afterwards.
- While the agent is still writing, the review stays readable but keeping and discarding is locked until the turn is done.

## Finishing a session

**Finish session** runs three steps, each on its own and each cancellable:

1. **Commit remaining changes** — write a message, or generate one with AI. A clean worktree skips this step.
2. **Merge back into the base branch** — on conflicts the conflict editor opens.
3. **Clean up worktree and branch** — the worktree is removed; the branch is only deleted when it is really merged, and you are told when it was kept.

Large agent output can be split into logical commits first — see [Commits and staging](commits-and-staging.md#splitting-changes-into-several-commits).

The whole flow is covered by the undo log, so a merge that went wrong can be rolled back from the history — see [Safety net](safety.md).

## Related

- [Commits and staging](commits-and-staging.md)
- [Safety net](safety.md)
