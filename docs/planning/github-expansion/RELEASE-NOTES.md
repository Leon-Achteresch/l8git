# GitHub and Git workflow expansion

This release adds the GitHub and local Git workflows from the 78-item expansion. UI implementation was authored by Opus5.5; backend/services and independent reviews were handled separately.

## Features

- Pull requests: merge readiness and queue, metadata/reviewer management, templates and drafts, account-aware autocomplete, private review tasks and notes, reviewed-file memory, multiline old/new-side comments, commit-pinned review submission, permalinks and guarded batch suggestions.
- Issues and inbox: detailed issue management, YAML/Markdown templates, dependencies and sub-issues, Projects field editing, issue/review worktrees including fork PR fetch, resume context, saved searches, reminders, quiet hours and inbox grouping.
- GitHub Actions: searchable job logs, comparisons against earlier successful runs, typed workflow dispatch, artifact downloads, matrix/attempt evidence, isolated CI agent tasks and deployment status.
- Diffs and Git tools: whitespace/move/context options, file profiles, rendered Markdown, structured JSON/YAML and npm dependency comparisons; history search, range diff, guarded restore/snapshots, rerere, worktree profiles, bisect, sparse checkout, identity profiles, integration lab, conflict radar and pinned Git plans.
- Larger workflows: navigable file/PR/session map with optional lazy Three.js view, anchored review narratives, real agent-worktree check evidence and resumable non-atomic multi-repository initiatives.

## Known issues deliberately deferred

The user explicitly approved the three new P1 corrections and deferred these nine P2 findings. They remain present:

1. Some command/profile defaults exceed the backend300-second timeout limit.
2. Failed PR metadata saves can close an editor and lose unsaved text.
3. Email-only CODEOWNERS can be offered as reviewer logins and rejected by GitHub.
4. Inbox metadata can mix between multiple accounts on the same host.
5. Saved-search state or late responses can survive an account switch.
6. Transformed working-copy diffs can stay stale after external edits.
7. Changing suggestion selection while preview reads are pending can leave an obsolete apply plan.
8. PR refresh can retain an old inline patch/composer while a new head is used for drafts or review state.
9. Branch-scroll restoration can be consumed before the matching status list arrives.

See `FINAL-UI-REVIEW.md` for the concrete affected paths and triggers. These are not claimed as fixed.

## Scope and validation limits

The three approved P1 corrections prevent mention-editor render loops and stale PR/remote mutation targets. Independent high corrective reviews found no remaining confirmed issues in those corrections. The earlier approved nine review corrections are also implemented.

Local validation includes1712 frontend tests,783 native Rust tests,200 mobile tests,11 relay tests, TypeScript/locales, production build, bundle-secret/performance gates and production renderer readiness/memory budgets. The132 browser scenarios passed across the full run and targeted reruns; clean CI remains the final platform gate.

Native Windows/macOS installers and updater execution have not been manually exercised locally. Live GitHub checks were read-only query-shape checks; no external issue, comment, workflow or merge was created for testing. Many new strings outside English/German use English fallback text. Import analysis is limited to static relative JS/TS without JSX syntax; npm is the supported dependency-lock comparison. Logs are explicit snapshots rather than streams. Source/output/history/pagination limits are documented in the contract files; nested review comments beyond the first100 are disclosed as partial.
