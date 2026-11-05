# Pinned patch test correction

The two-file suggestion test accidentally asserted one provider patch read per file. Opening the dialog explicitly reloads review threads, so an existing map and its refreshed map may both load the same correctly pinned patches.

Opus changed only `e2e/pr-ranges.spec.ts`: record the request boundary before opening; require exactly both unique filenames; validate every subsequent read against the exact repository path, PR number, head and base pins without filtering invalid reads away. Legitimate repeats are permitted. Apply payload, overlap/consent and no-resolve assertions are unchanged. No production source or deferred P2 was changed.

Validation: the complete narrow range spec passed4/4 (26.4seconds). Independent `/code-review high` of this delta against `/tmp/l8git-pr-test-before/pr-ranges.spec.ts` found no confirmed issues. This test does not cover or resolve the deferred preview-selection race.
