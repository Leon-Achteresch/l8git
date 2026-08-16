# Branches and stacks

[← Documentation index](README.md)

## The branch sidebar

Below the panel switcher the sidebar lists **Local**, **Remote** and **Tags**, each collapsible, with a filter field on top. Which sections start open is configurable under **Settings → Sidebar**.

From here you can:

- create a branch (`N` while the branch sidebar has focus)
- check out the focused branch (`Enter`)
- check out a remote branch, creating the local tracking branch
- delete a branch — if it is not fully merged, a second confirmation spells out that unmerged commits will be lost
- push to a specific remote (multi-remote setups are supported, nothing is hardcoded to `origin`)
- create annotated and signed tags, and delete local or remote tags

Branch actions are also reachable from the command palette (`Mod+K`).

## Merging

Merges run with an explicit strategy: a normal merge commit, `--ff-only`, `--no-ff`, or squash. If the merge conflicts, the merge banner appears with the conflicted paths and the conflict editor is one click away. See [Commits and staging](commits-and-staging.md#conflicts).

## Rebase

The rebase dialog asks for a **target branch or ref** — the commits of the current branch are replayed on top of it. You can also enter a custom ref such as `origin/main` or a hash.

- A **preview** lists the commits that will be replayed, so you know the scope before starting.
- **Stash local changes automatically** (`--autostash`) stashes uncommitted work before the rebase and restores it afterwards. Without it, a dirty working tree is rejected with a message naming the files.
- **Use a different new base (`--onto`)** separates the starting point from the new base.

While a rebase is in progress a banner offers **continue**, **skip** and **abort**, and conflicts open in the same conflict editor as merges. Stops for `edit` steps are shown with the commit subject.

## Interactive rebase

From a commit's context menu in the history (or `R` on the selected commit) you get the interactive rebase editor.

- Pick a **base commit** — every commit after it can be reordered and edited.
- Each commit gets an action: **pick**, **reword**, **squash**, **fixup**, **edit** or **drop**.
- Reorder by drag and drop, or with `Alt+↑` / `Alt+↓`. `↑` / `↓` navigate.
- Single-key actions: `p` pick, `r` reword, `s` squash, `f` fixup, `e` edit, `d` drop.
- A summary line says whether the order changed. Dropping commits requires a second confirming click, and the first commit of the range cannot be squashed or fixed up.

The commit context menu also offers the lazygit-style shortcuts directly:

- **Fixup here** — create a fixup commit for the selected commit from what is staged and autosquash it in.
- **Amend into this commit** — fold the staged changes into an older commit.

Every rebase is recorded in the undo log — see [Safety net](safety.md).

## Stacked branches

A stack is a chain of branches, each built on top of the previous one. The **Stacks** section in the sidebar detects these chains automatically and shows them by root and level.

- **Start a stack on `<branch>`** or **Create branch on top…** adds the next level; the new branch is created on top of its parent and checked out.
- **Restack** replays the whole chain after the base moved. Levels that are no longer on top of their parent are marked "needs restack". If a level conflicts, resolving it lets the rest of the chain continue automatically.
- **Submit stack as PRs** creates one pull request per level, each against its parent branch, starting at the root. Levels that already have a PR are skipped, and you can create the whole chain as drafts.
- **Detach from stack** removes a branch from the chain, **Check out** switches to it.
- Expanding a level shows its commits. Broken chains (a missing branch) and cycles are called out explicitly.

The commit graph visualizes the stack structure.

## Branch cleanup and archiving

The **Clean up** button next to the branch list finds branches you probably do not need any more:

- **Merged** — fully contained in the current state, including squash-merged branches.
- **Inactive** — no commit for longer than a configurable number of days (**Settings → Commits → Branch cleanup**). Inactive branches are listed but never preselected.

Archiving deletes the selected branches locally, optionally also the remote branch. The success toast has an **Undo** action that brings them straight back. A subtle badge on the button can point out cleanup candidates when you open a repository — no popup, no dialog; that hint can be turned off.

## Explaining a branch

**Explain branch** summarizes what a branch does compared to its base, using the configured AI provider. The same action exists for a single commit and for the current diff.

## Related

- [Pull requests](pull-requests.md) — turning branches and stacks into PRs
- [Safety net](safety.md) — undoing a rebase, reset or branch deletion
- [Keyboard shortcuts](shortcuts.md)
