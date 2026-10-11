# Commits and staging

[← Documentation index](README.md)

The **Commit** panel is the daily loop: see what changed, pick exactly what belongs in the next commit, write a message, commit.

## The change list

Changes are split into **Staged** and **Unstaged** sections, with untracked files listed as new. Conflicted files get their own **Conflicts** section with a badge. A filter field narrows a long list, and embedded Git repositories are marked as such instead of being treated as ordinary files.

Per file you can:

- stage or unstage it
- discard its changes (with a confirmation — this cannot be undone)
- discard several selected files at once, or all staged changes
- show Git blame
- view the diff
- edit the file directly

Shift-click selects a range in the visible file order, including tree view. Filtered files and collapsed folders stay outside the range. Filtering or collapsing also removes hidden files from the active selection. Stage and unstage act on the clicked section, so the staged row of a partially staged file unstages it. Section actions follow the current filename filter.

Before discarding, the preview lists every affected file, its line totals and the content to discard. You can exclude individual files. Discarding an **Unstaged** row keeps its staged changes; discarding a **Staged** row removes both staged and working tree changes for that file. Mixed selections retain each file's own scope. Untracked files are deleted, with a specific warning and a **Create a stash instead** action. Enable **Include untracked files** when backing those files up.

The preview captures file snapshots and checks them again before mutation, including binary files and index changes. If files changed, refresh the preview and review them again. Failed operations stay open with recovery guidance; if part of a mixed selection succeeded, refreshing shows only the remaining changes. Selected-line actions carry the displayed file snapshot through to the action, including when a discard confirmation stays open during a background refresh.

## Hunk and line staging

The diff has two view modes:

- **Staging** — stage hunks and single lines.
- **Edit** — edit the file inside the diff editor and save it back.

In staging mode:

- Every hunk has a **stage hunk** / **unstage hunk** action in its header.
- Click or drag across line numbers to select individual lines. The selection can then be staged, unstaged or discarded — "Stage 12 lines", "Discard 3 lines". Discarding lines is permanent and asks for confirmation.
- `S` stages or unstages the current selection, hunk or file.
- `[` and `]` jump to the previous/next hunk.
- `Escape` clears the line selection.

Partial selections retain the unselected lines, including when unstaging additions to a newly staged file or restoring selected lines from a staged deletion. Text patches preserve CRLF content and missing final newlines. Selecting text changes does not select an unrelated executable-mode change.

Selected hunks for one file are checked and applied together. If the file, index or restore source changed since the preview, the selection stops and the diff refreshes. An invalid later hunk leaves the whole batch unapplied. Oversized or unsupported text selections offer guidance to refresh, select fewer lines or use the file actions.

The diff itself can be shown **inline** or **side by side**, with word-level highlighting inside changed lines. Images and other media get a dedicated viewer with before/after, swipe and onion-skin comparison, fit and 1:1 zoom, and dimension/size readouts. Files tracked by Git LFS show an LFS badge; if only the pointer is available locally the viewer says so and you can run `git lfs pull` from the Tools panel.

## Writing the commit

- **Subject** and an optional **description** body.
- A conventional-commit type picker adds `feat:`, `fix:` and friends to the subject. Changing the type preserves the description, scope and breaking-change marker. You can edit the scope, toggle `!`, or remove the prefix.
- **Structure** adds an editable description for change/reason/validation, before/after behavior, or a breaking change and migration. It appends to existing text. Replace the TODO hints with your explanation.
- **Message help** offers suggestions about long or vague subjects, unfinished templates, line wrapping, whitespace and breaking-change explanations. These are advisory; they do not block a commit.
- Message help also adds `Refs`, `Closes` and `BREAKING CHANGE` trailers without replacing the description.
- Draft messages are saved locally per repository and survive switching repositories or reopening the app. Canceling or finishing an amendment restores the separate draft you were writing before it.
- Press `Enter` in the subject to open the description. `Ctrl+Enter` commits on Windows/Linux; `⌘+Enter` commits on macOS. Pasting a multiline message into the subject keeps its description intact.
- A default message template can be configured under **Settings → Commits**.
- If commit signing is configured, a badge shows the format (GPG or SSH) and the key. If the signing program is missing, the badge warns you before the commit fails.
- **Stash** puts the current changes aside without committing.
- **Amend** edits the current `HEAD` commit, even if another branch has a newer commit in the history graph. It supports message-only changes and refuses an unchanged amendment. The banner shows its target hash; a possibly published commit asks for confirmation.
- **Undo last commit** performs a soft reset of `HEAD~1`, keeping the changes staged. It asks for confirmation and reminds you that this is awkward if the commit was already pushed.

The commit button names the target branch, so you always see where the commit lands.

Before committing, the panel checks the current Git status again. Empty staging areas and unresolved conflicts have a specific explanation. Amend and undo also check that `HEAD` is still the commit you reviewed; if it changed, the operation stops and asks you to review it again. Errors keep your draft available for correction.

## AI commit messages

The sparkle button next to the message field generates a commit message from the staged diff.

- Providers: OpenAI, Anthropic, Google, OpenRouter, Ollama (local, no key) or any OpenAI-compatible endpoint.
- First use opens a small setup dialog: pick a provider, paste a key, optionally name a model — then the message is generated right away. Keys go into the OS keychain.
- The output language can be set globally and overridden **per repository**.
- After generating you can **regenerate**, or **refine with a hint** ("mention the migration", "keep it shorter").
- Canceling generation restores your previous message. Its backup is persisted while AI streams, so reopening the app after an interrupted generation restores the manual draft rather than incomplete output.
- If the staged diff changes while generation is running, the generated result is rejected and your previous draft returns. Review the staging area and generate again. An empty model response also keeps the previous draft.
- The prompt template is editable under **Settings → AI**.

## Splitting changes into several commits

"Split changes with AI" takes everything pending and proposes a set of logical commits.

- The changes are broken into units (hunks, whole files, new files); the AI groups them and drafts a commit message per group.
- You can edit everything before applying: rename groups, move selected units between groups, add or delete groups, rewrite messages. Each group's message has the same conventional type picker, editable structures and optional message help as the main composer. Every unit must belong to exactly one group, and every non-empty group needs a message.
- Applying stages and commits group by group with a progress indicator. **Stop after this commit** cancels between two commits — commits that were already created stay, the rest remains unstaged in the working tree.
- Preparing a proposal flattens the staging area so all pending changes can be grouped; the dialog reports when it did so. Your working files are not modified.
- Before each group, the remaining text hunks are compared with the reviewed proposal. Changed content, context or hunk counts stop the split before that group starts staging. Identical edits at different positions retain their assigned groups, even when earlier commits shift line numbers.
- If you staged other changes after planning, the split stops and preserves that staged selection. Review the current staging area before preparing a new plan.
- Each group checks the reviewed branch, commit, complete index and the raw contents of every planned file, including whole files assigned to later groups. It prepares the entire group in a separate index before replacing the real index and running a normal Git commit. Other l8git operations in the same backend cannot stage or change branches between those steps.
- Git hooks, clean filters and signing still run normally. If the commit fails, the group's staged changes stay available for review. Existing commits remain. **Generate a new proposal** reads the current changes again, so it does not reuse units from an earlier, partly completed split; preparing that new proposal flattens staging again.

This is especially useful after an agent session produced a large pile of changes — see the [Agents user guide](planning/agents-cli-integration/USER-GUIDE.md).

## Comparing and reviewing history

Select exactly two history commits and choose **Compare**, or open **Compare commits** from the command palette. Enter branches, tags or commit IDs as **Base** and **Head**, then apply the comparison. **Direct** compares their snapshots. **Common ancestor** compares the shared base with Head, showing the work added on that side.

The summary records resolved commit hashes and pins file diffs to those hashes. Inspect renames, metadata, binaries and media; filter by path or status, mark reviewed files and hide them to focus on remaining work. Review marks apply to the current comparison and reset when it changes. Oversized lists and patches show a truncation notice.

**Export review** downloads a local Markdown report with full commit hashes, comparison mode, every listed file, change totals and review marks. Hidden reviewed files are included. A checkmark records your review state; it does not certify correctness. The report identifies truncated file lists.

History search applies message, author, date and path filters together. Message search includes commit bodies. Advanced filters validate the date range before applying it, and date shortcuts fill the range. Named saved searches retain filters per repository, including selected branch scope. Failed pagination preserves loaded commits and offers a retry.

## Explaining a diff

**Explain diff** sends the current diff to the configured AI provider and returns a readable summary. The same action exists for a single commit and for a whole branch against its base (see [Branches and stacks](branches-and-stacks.md)). Explanations can be copied out.

## Conflicts

Conflicted files cannot be shown as a normal diff; the panel offers **Open conflict editor** instead.

The conflict editor is a three-way view of base, ours and theirs. You edit the merged result directly and mark the file resolved, which stages it. An **AI suggestion** can propose a resolution — it is always a proposal you review, never applied automatically.

Merge, rebase and cherry-pick states are visible as banners with continue / skip / abort actions and the list of conflicted paths.

## Related

- [Branches and stacks](branches-and-stacks.md) — rebase, fixup and amend into older commits
- [Safety net](safety.md) — undoing commits, resets and merges
- [Keyboard shortcuts](shortcuts.md)
