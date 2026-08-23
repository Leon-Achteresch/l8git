## What

<!-- What does this change? One or two sentences. -->

## Why

<!-- Which problem does it solve? Link the issue if there is one: Closes #123 -->

## How tested

<!-- What did you actually run or click? -->

- [ ] `bunx tsc --noEmit`
- [ ] `bun run test`
- [ ] `bun run build`
- [ ] `cargo test --all-targets` (in `src-tauri`, if the backend changed)
- [ ] Checked manually in `bun run tauri dev`

## Checklist

- [ ] New user-facing strings exist in **both** `src/locales/de.json` and `src/locales/en.json`
- [ ] Commit subjects follow Conventional Commits (`feat:`, `fix:`, `docs:`, …)
- [ ] Docs in `docs/` updated if behaviour changed
