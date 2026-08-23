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

Selecting multiple files works as expected; the actions apply to the whole selection.

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

The diff itself can be shown **inline** or **side by side**, with word-level highlighting inside changed lines. Images and other media get a dedicated viewer with before/after, swipe and onion-skin comparison, fit and 1:1 zoom, and dimension/size readouts. Files tracked by Git LFS show an LFS badge; if only the pointer is available locally the viewer says so and you can run `git lfs pull` from the Tools panel.

## Writing the commit

- **Subject** and an optional **description** body.
- A conventional-commit type picker prepends `feat:`, `fix:` and friends to the subject.
- A default message template can be configured under **Settings → Commits**.
- If commit signing is configured, a badge shows the format (GPG or SSH) and the key. If the signing program is missing, the badge warns you before the commit fails.
- **Stash** puts the current changes aside without committing.
- **Amend** folds the staged changes into the previous commit; a banner makes the amend state obvious.
- **Undo last commit** performs a soft reset of `HEAD~1`, keeping the changes staged. It asks for confirmation and reminds you that this is awkward if the commit was already pushed.

The commit button names the target branch, so you always see where the commit lands.

## AI commit messages

The sparkle button next to the message field generates a commit message from the staged diff.

- Providers: OpenAI, Anthropic, Google, OpenRouter, Ollama (local, no key) or any OpenAI-compatible endpoint.
- First use opens a small setup dialog: pick a provider, paste a key, optionally name a model — then the message is generated right away. Keys go into the OS keychain.
- The output language can be set globally and overridden **per repository**.
- After generating you can **regenerate**, or **refine with a hint** ("mention the migration", "keep it shorter").
- The prompt template is editable under **Settings → AI**.

## Splitting changes into several commits

"Split changes with AI" takes everything pending and proposes a set of logical commits.

- The changes are broken into units (hunks, whole files, new files); the AI groups them and drafts a commit message per group.
- You can edit everything before applying: rename groups, move selected units between groups, add or delete groups, rewrite messages. Every unit must belong to exactly one group, and every non-empty group needs a message.
- Applying stages and commits group by group with a progress indicator. **Stop after this commit** cancels between two commits — commits that were already created stay, the rest remains unstaged in the working tree.
- The staging area is reset to perform the split; your files are not touched.
- If the working tree moved on since the proposal was generated, the split aborts with a clear message and you generate a new proposal.

This is especially useful after an agent session produced a large pile of changes — see [Agents](agents.md).

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
