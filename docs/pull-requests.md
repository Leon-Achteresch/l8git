# Pull requests

[← Documentation index](README.md)

l8git talks to four hosting providers and adapts its UI to what each one can actually do.

## Providers

| Provider | Notes |
|----------|-------|
| **GitHub** | github.com and GitHub Enterprise (including `*.ghe.com`) |
| **GitLab** | gitlab.com and self-hosted instances — merge requests and pipelines |
| **Bitbucket** | bitbucket.org — pull requests and commit/PR pipeline statuses |
| **Gitea / Forgejo** | gitea.com, codeberg.org and self-hosted instances |

The provider is detected from the remote host, so self-hosted instances with a matching hostname are recognized instead of silently falling back to GitHub. Hosts that are not recognized are reported as unsupported rather than failing halfway through a request.

Capabilities are queried per provider — approvals, requesting changes, auto-merge, drafts, deleting the source branch, re-running checks, workflows, inline comments, draft reviews, thread resolution and the available merge strategies. Actions a provider does not support are not offered.

## Signing in

**Settings → Accounts** manages the connections. Per host you can:

- sign in through the **Git Credential Manager** if it is installed, or
- enter a **username and token** directly.

Tokens are stored in the OS keychain. The same credentials are used for HTTPS push/pull, so signing in once covers both API access and Git transport. Self-hosted hosts are added by entering the host name first.

Without a connected account the PR and CI panels explain what is missing and link straight to the sign-in dialog.

## Working with pull requests

The **Pull requests** panel lists the PRs of the repository, filterable by **Open**, **Merged**, **Closed** or **All**. Your own drafts get their own section.

### Creating

**New pull request** asks for base and compare branch (both pickable from a filtered branch list, with the current branch marked), a title and a description, and offers a **draft** toggle where the provider supports it. **AI description** drafts the body from the diff between the two branches; you can regenerate or refine it with a hint.

### Reading

The PR view shows description, labels, reviewers, checks and the conversation. Additionally:

- **Check out** the PR branch locally in one click.
- **Open in browser** for anything the desktop UI does not cover.
- Commit author avatars are resolved through the provider API.
- Very large diffs are not rendered inline; the view says so instead of hanging.

### Reviewing

- Comment on single lines to start an **inline thread**; replies, resolving and unresolving threads are supported where the provider allows it.
- Comments can be collected as **drafts** and submitted together as one review — the pending count is always visible, and you can discard all drafts at once. On providers without draft reviews, comments are posted one by one and the UI says so.
- Submit as **Comment**, **Approve** or **Request changes**, with a summary text.
- **Suggested changes** are rendered as applicable suggestions: you can apply one directly to the working tree. Suggestions that no longer match the file (moved lines, deleted target) are rejected with a clear reason instead of corrupting the file.

### Merging

Pick a merge strategy from the ones the provider reports (merge commit, squash, rebase), optionally adjust the merge message, and merge. On GitHub, **auto-merge** can be enabled and disabled so the PR merges once checks pass.

## CI

The **CI** panel has two modes:

- **HEAD checks** — the check runs and legacy commit statuses reported for the current commit.
- **Workflow runs** — the run list, filterable by all / running / failed / success.

For a run you can expand jobs and steps, **re-run** everything or only the failed jobs, **cancel** a running workflow, and load **annotations** for a check with its output. Bitbucket and GitLab pipeline statuses appear the same way.

GitHub Actions workflow files under `.github/workflows/` can be opened, edited and saved directly from the app.

## The inbox

The **Inbox** in the header aggregates across every repository in the workspace, so you do not have to walk through tabs to find out what needs you:

| Section | Contents |
|---------|----------|
| **My pull requests** | Your open PRs (needs a signed-in account so they can be matched by author) |
| **Review requested** | PRs waiting on your review |
| **Red CI runs** | Failed runs on default branches |
| **Running agents** | Agent sessions working or waiting for approval |

Each entry shows its check state (green, red, running, none), draft and reviewer badges, and how many approvals are still pending. Entries open in the app or in the browser. Repositories that could not be loaded are reported instead of silently disappearing.

## Notifications

Native system notifications bring you back to the app while the window is not focused. Each source fires at most once per minute, and every kind can be switched off individually under **Settings → Notifications**:

- a CI run flipped to red
- a review was requested from you
- an agent finished a turn or is waiting for approval
- a fetch, pull, push or clone that ran longer than ten seconds finished

## Related

- [Branches and stacks](branches-and-stacks.md#stacked-branches) — submitting a whole stack as a PR chain
- [Agents](agents.md)
