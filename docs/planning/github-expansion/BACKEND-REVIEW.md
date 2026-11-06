# Independent backend review — high

Scope: this task's backend and non-UI diff against development HEAD `0cb17e0`, including untracked new modules. Existing user edits in `app-shell.tsx` and all Opus UI are excluded. Read-only reviewer: `backend_high_review`. No files changed by the reviewer. Findings reproduced in isolated Bun scripts; live hosting-provider accounts and Windows/macOS were not exercised.

Status: **user explicitly approved all nine combined review findings; fixes in progress**. No proven P0/P1 in inspected native Git/CAS, download/export and execution paths. This is a backend-package review, not approval of all 78 items or final release readiness.

1. **P2 — Same-version dependency classification changes disappear.** `src/lib/github-expansion/analysis.ts:45` filters only on versions. Moving `x@1.0.0` from development to runtime returns no dependency change, despite changing production installation. Proposed fix: compare presence/version/direct/development/optional before and after, retaining both classifications and a regression test.
2. **P2 — JSX rendered text becomes a false import edge.** `src/lib/change-workflow/dependencies.ts:75` treats `export const App = () => <p>import('./server')</p>;` as executable import syntax. Proposed fix: JSX-aware parsing or explicit JSX/TSX exclusion until supported; regression test must reject the false edge.
3. **P2 — Completed mentionable connections restart.** `src/lib/github-expansion/api.ts:158` returns null for an exhausted user/team cursor, which the next request treats as an initial page. Three user pages and two team pages take six rounds with repeats. Proposed fix: independently track and skip exhausted connections; unequal multi-round pagination regression test.

Per `/home/leon/.codex/AGENTS.md`, fixes waited for approval. The user answered both the initial three-finding question and the combined nine-finding question affirmatively ("Alle drei beheben", "Alle neun beheben"). Backend fixes are assigned to Codex; all UI fixes exclusively to Opus 5.5. Regression tests and final aggregate/UI review remain required.

Other verification snapshot: full frontend suite 211 suites / 1667 tests passed; mobile 26 suites / 200 tests passed; relay 11 tests passed; root serial native all-target gate passed before later source/evidence/export additions, which separately passed 25 advanced-Git and two binary-export fixtures. Production Vite build passed and build budget/security script passed (startup gzip 356264 bytes below 460800-byte cap; sentinel absent). Final settled-source gates remain required.
