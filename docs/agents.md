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

## Jira tickets

Bring your own Jira: under **Settings → Jira** you store the base URL, your account e-mail and an Atlassian API token. The token goes into the operating system's keychain — never into `localStorage` — and is never handed back to the UI; the settings page only shows a masked hint such as `••••1a2b`.

Tickets are linked **per conversation**, not per repository — two chats in the same repo are usually about different tickets. Right-click a chat in the agents sidebar and pick **Link Jira ticket**, then paste a key (`ABC-123`) or a Jira link. The ticket is resolved once, and its key and status then sit at the bottom right of that chat's row in the sidebar. The same menu unlinks it again.

### What the agent may do

Everything here is read-only. Three tools exist — read a ticket, read its comments, search by JQL — and all three only ever issue HTTP GET requests. Creating, editing, commenting and transitioning are not implemented.

The tools are also gated so an unused integration costs nothing:

| Situation | What the agent sees |
|---|---|
| Jira switched off, or no credentials | no Jira tools at all |
| Jira on, JQL search off | tools to read this chat's tickets (and their comments, if allowed) — and nothing else |
| JQL search on | additionally search and read any ticket your Jira account can see |

Which tickets a tool will actually return is checked on every call against what is linked to that chat right now. That split matters in practice: **linking a ticket works immediately, even in a chat that is already running**, while switching Jira itself on or off only reaches chats started afterwards — the CLI asks for the tool list once, when it connects.

Tool schemas are paid for in input tokens on every turn, which is why the list is rebuilt for each request instead of being declared once. Responses are trimmed the same way: Atlassian's rich-text format is flattened to plain text, only the relevant fields are requested, long descriptions are cut off, and search results carry no descriptions at all.

The master switch under **Settings → Jira** turns the whole feature off again at any time.

### How each CLI gets the tools

All four providers can use them, through whatever channel they support:

| Provider | Channel | Writes to config you own |
|---|---|---|
| Claude Code | l8git's in-process MCP server | no |
| OpenCode | handed the server per session over ACP | no |
| Codex | `~/.codex/config.toml` | yes |
| Cursor | `~/.cursor/mcp.json` | yes |

Codex and Cursor only read MCP servers from their own configuration files, so l8git adds an `l8git-jira` entry there and removes it again when you switch the feature — or the **Register with Codex and Cursor** switch — off. Because those files are the same ones your own Codex and Cursor sessions read, the tools show up there too; that switch is how you decline.

Under the hood the three of them talk to l8git's own binary, re-executed as a small MCP server. It reads your credentials from the keychain itself, so the token is never passed as an argument or an environment variable.

One caveat for Codex and Cursor: that server is started per repository and is never told which chat is asking, so it uses whichever conversation the repository currently has open. A chat running in the background therefore sees the tickets of the one on screen. Claude Code and OpenCode are handed the conversation directly and are not affected.

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
