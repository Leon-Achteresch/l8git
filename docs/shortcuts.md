# Keyboard shortcuts

[← Documentation index](README.md)

`Mod` is **Cmd** on macOS and **Ctrl** everywhere else. Press `Mod+/` at any time to see the current bindings inside the app.

## Global

| Shortcut | Action |
|----------|--------|
| `Mod+K` | Open command palette |
| `Mod+R` | Reload active repository |
| `F5` | Reload active repository (alternate) |
| `Mod+Shift+R` | Reload all repositories |
| `Mod+O` | Open local repository |
| `Mod+,` | Settings |
| `Mod+/` | Show keyboard shortcuts |

## Navigation

| Shortcut | Action |
|----------|--------|
| `Mod+1` … `Mod+8` | Switch to sidebar panel 1 to 8 |

The slots follow the order of the panels in the sidebar, so they respect the reordering and hiding you configure under **Settings → Sidebar**.

## History

Active while the commit history has focus.

| Shortcut | Action |
|----------|--------|
| `C` | Check out the selected commit (detached HEAD) |
| `R` | Interactive rebase from the selection |
| `Y` | Copy the commit hash |

## Commit panel

Active while the commit panel has focus.

| Shortcut | Action |
|----------|--------|
| `S` | Stage or unstage the selection, hunk or file |
| `[` | Previous hunk |
| `]` | Next hunk |
| `Escape` | Clear the line selection |

## Branch sidebar

| Shortcut | Action |
|----------|--------|
| `N` | New branch |
| `Enter` | Check out the focused branch |

## Rebinding

**Settings → Hotkeys** lets you rebind every shortcut above.

- Click a binding and press the key combination you want; it is recorded directly.
- Conflicts are detected and marked. Panel-scoped bindings (history, commit, branch) may reuse the same key as long as they belong to different panels — a conflict with a global shortcut is always flagged.
- Each row can be reset individually, or reset everything at once.
- Bindings are stored locally, per installation.

## Context keys that are not rebindable

These are fixed keys inside specific surfaces:

**Interactive rebase editor**

| Key | Action |
|-----|--------|
| `P` | pick |
| `R` | reword |
| `S` | squash |
| `F` | fixup |
| `E` | edit |
| `D` | drop |
| `Alt+↑` / `Alt+↓` | Move the commit up or down |
| `↑` / `↓` | Move between commits |

**Search and command palette**

| Key | Action |
|-----|--------|
| `Mod+Enter` | Check out the selected branch instead of jumping to its history |

**Agent chat**

| Key | Action |
|-----|--------|
| `Enter` | Send — or steer the turn while one is running |
| `Shift+Enter` | New line |

**Terminal dock**

| Input | Action |
|-------|--------|
| `Shift+click` on a shell entry | Open a new terminal instance |

## Related

- [Getting started](getting-started.md#command-palette-and-search)
- [Commits and staging](commits-and-staging.md#hunk-and-line-staging)
- [Branches and stacks](branches-and-stacks.md#interactive-rebase)
