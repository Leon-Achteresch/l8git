# l8git Roadmap — September 2026 bis August 2027

l8git ist und bleibt vollständig Open Source (MIT). Keine Paywall, kein Fair-Source-Modell, keine proprietären Komponenten. Nachhaltigkeit über GitHub Sponsors / Open Collective.

**Positionierung zum 1.0-Launch:**
1. Der schnellste Git-Client (nativ, Tauri/Rust, kein Electron)
2. Der erste Git-Client für AI-Agent-Workflows
3. Der einzige vollwertige davon, der komplett Open Source ist

**Kernthese:** Der Differenzierer (AI-Agents + Worktrees + Terminal) ist bereits gebaut. Es fehlen die Table Stakes (Rebase, Undo, Hunk-Staging in der UI, Side-by-Side-Diff), an denen Nutzer in Woche 1 abspringen. Deshalb: Q1/Q2 Fundament reparieren, Q3 den AI-Vorsprung zementieren, Q4 Reichweite und Community.

---

## Q1 (Sep–Nov 2026) — Fundament & Vertrauen

### Monat 1 — Ernte & Ehrlichkeit
- [ ] Hunk-/Zeilen-Staging in der UI aktivieren: `UnifiedDiffBody` ans Commit-Panel anbinden, `useCommitPanelHotkeys` anschließen, Debug-Logs entfernen
- [ ] Commit-Suche entschärfen: Debounce im Frontend, Limit/Pagination im Backend statt Full-Scan pro Tastendruck
- [ ] File-Watcher: `node_modules`, `target`, Build-Artefakte ignorieren
- [ ] `read_repo_favicon` asynchron statt synchronem Tiefe-12-Plattenscan
- [ ] Dashboard auf vorhandene Backend-Aggregationen umstellen (statt Berechnung aus ≤80 geladenen Commits)
- [ ] Versionsnummern konsolidieren (package.json / tauri.conf.json / Cargo.toml / README-Badge, abgestimmt auf die Release-Pipeline)
- [ ] README auf den echten Stand bringen (kein interaktives Rebase, kein LFS, 6 AI-Provider statt „OpenRouter")
- [ ] CSP aktivieren, tote Dependencies entfernen (`@pierre/diffs`, `border-beam`), `.DS_Store`/leere Ordner aufräumen
- [ ] Opt-in-Telemetrie (PostHog) + Crash-Reporting — anonym, transparent, abschaltbar, quelloffen auditierbar

### Monat 2 — Interaktiver Rebase
- [ ] Lokales Rebase: onto beliebige Ref, `--autostash`, continue/skip/abort mit Anbindung an den Konflikt-Editor
- [ ] Visueller interaktiver Rebase: Drag-and-drop-Reorder, squash/fixup/drop/reword/edit als Ein-Klick-Aktionen im Graph
- [ ] Lazygit-Klasse Shortcuts: „Amend in älteren Commit", „Fixup hierhin" direkt aus dem Commit-Kontextmenü

### Monat 3 — Universelles Undo & Qualität
- [ ] Reflog-Ansicht
- [ ] Operationsbasiertes Undo-Log: Merge/Rebase/Reset/Branch-Löschung rückgängig machen
- [ ] Transparenz-Modus: jedes ausgeführte Git-Kommando in einem einsehbaren Log
- [ ] Integrationstests für `git.rs` und `pr.rs` gegen Fixture-Repos, CI-Gate
- [ ] Fortschrittsanzeige und Abbruch für clone/fetch/push
- [ ] Rust-Fehlermeldungen lokalisierbar machen (keine hartkodierten deutschen Strings)

## Q2 (Dez 2026–Feb 2027) — Daily Loop & Table Stakes

### Monat 4 — Diff-Erlebnis
- [ ] Side-by-Side-Umschalter für alle Diff-Viewer, 2-Wege-Merge-Editor reaktivieren
- [ ] Word-Level-Diff
- [ ] Bild-Diff (Vorher/Nachher, Swipe, Onion-Skin)
- [ ] Git-LFS-Grundsupport: Erkennung, Pointer-Anzeige, pull/track
- [ ] Diff-Performance-Benchmark gegen Fork/GitKraken auf Monorepos, Ergebnis dokumentieren

### Monat 5 — Provider-Vollständigkeit
- [ ] GitLab komplett: MRs (Liste, Detail, Review, Merge), Pipelines, self-hosted
- [ ] Gitea/Forgejo-Erkennung statt stillem GitHub-Fallback, saubere Fehlermeldungen
- [ ] Annotierte und signierte Tags
- [ ] GPG/SSH-Commit-Signierung
- [ ] Multi-Remote-Push (origin-Hardcode entfernen)

### Monat 6 — Flow & Onboarding
- [ ] Command Palette auf alle Aktionen ausweiten (alles ohne Maus erreichbar)
- [ ] Hotkey-Rebinding, Kontext-Hotkeys pro Panel
- [ ] Onboarding auf den Aha-Moment trimmen: Repo öffnen → Graph + erste AI-Commit-Message ohne Konfiguration, interaktive Mini-Tour
- [ ] Retention-Messung live: Aktivierungsrate, D7/D30-Retention, Feature-Adoption

## Q3 (Mär–Mai 2027) — AI-native Differenzierung

### Monat 7 — Agent-Review-Workflow
- [ ] Dashboard aller laufenden Agents über alle Repos
- [ ] Diff-Review pro Agent-Session mit Hunk-genauem Übernehmen/Verwerfen
- [ ] Ein-Klick-Flow: Review → Commit → Merge zurück → Worktree aufräumen
- [ ] AI-gestütztes Commit-Splitting für Agent-Output

### Monat 8 — Stacked Branches/PRs
- [ ] Stacks im Client: Branch-Kette erstellen, automatisches Restacking bei Basis-Änderungen
- [ ] Stack als PR-Kette zu GitHub/GitLab submitten
- [ ] Graph-Visualisierung der Stacks
- [ ] Auto-Branch-Archiving für gemergte/stale Branches

### Monat 9 — Steuerbare AI in der Breite
- [ ] AI-Konfliktlösung als Vorschlag im 3-Wege-Editor (nie Vollautomatik)
- [ ] „Explain this branch/commit/diff"
- [ ] AI-PR-Beschreibungen
- [ ] Eigene Prompt-Templates überall, Reroll/Hint-Interaktion
- [ ] Ollama/lokale Modelle als First-Class-Option

## Q4 (Jun–Aug 2027) — Team, Reichweite, Community

### Monat 10 — Review-Inbox & Daily-Loop-Vollausbau
- [ ] Repo-übergreifende Inbox: meine PRs, angeforderte Reviews, rote CI-Läufe, laufende Agents
- [ ] PR-Review vertiefen: Inline-Kommentar-Threads, Suggested Changes, Review-Drafts
- [ ] Native Benachrichtigungen (CI rot, Review angefordert, Agent fertig)

### Monat 11 — Reichweite & Community
- [ ] Linux-Polish: Wayland, HiDPI
- [ ] Paket-Kanäle: Homebrew, winget, AUR, Flatpak
- [ ] i18n-Ausbau (ES/FR/PT/ZH/JA) mit Lazy-Loading der Locales
- [ ] Docs-Site mit Screenshots und Videos
- [ ] Öffentliche Roadmap, GitHub Discussions/Discord
- [ ] Contributor-Onboarding: CONTRIBUTING.md, good first issues, schnelle PR-Reviews

### Monat 12 — v1.0 & Nachhaltigkeit
- [ ] Stabilitäts-Sprint und Security-Review (CSP, Tauri-Capabilities)
- [ ] GitHub Sponsors / Open Collective einrichten, Sponsor-Link in App und README, Sponsoren-Nennung im Changelog
- [ ] 1.0-Release: Show HN, Product Hunt

## Durchgängig (jedes Quartal)
- Performance-Budget: Startzeit, Status-Refresh, Graph-Rendering auf Monorepos als CI-Benchmark
- Bug-Turnaround unter einem Release-Zyklus
- KPIs: Aktivierung (Aha-Moment < 5 min), D30-Retention, DAU/WAU, Sessions/Tag (> 2 = Daily Loop erreicht), Adoption von Rebase/Undo/Agent-Review
