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
- [x] Hunk-/Zeilen-Staging in der UI aktivieren: `UnifiedDiffBody` ans Commit-Panel anbinden, `useCommitPanelHotkeys` anschließen, Debug-Logs entfernen
- [x] Commit-Suche entschärfen: Debounce im Frontend, Limit/Pagination im Backend statt Full-Scan pro Tastendruck
- [x] File-Watcher: `node_modules`, `target`, Build-Artefakte ignorieren
- [x] `read_repo_favicon` asynchron statt synchronem Tiefe-12-Plattenscan
- [x] Dashboard auf vorhandene Backend-Aggregationen umstellen (statt Berechnung aus ≤80 geladenen Commits)
- [ ] Dashboard-Folgearbeiten: Backend-Commands für Branch-Aktualität, Aktivitäts-Feed und Aggregations-Caching
- [x] Versionsnummern konsolidieren (package.json / tauri.conf.json / Cargo.toml / README-Badge, abgestimmt auf die Release-Pipeline)
- [x] README auf den echten Stand bringen (kein interaktives Rebase, kein LFS, 6 AI-Provider statt „OpenRouter")
- [x] CSP aktivieren, tote Dependencies entfernen (`@pierre/diffs`, `border-beam`), `.DS_Store`/leere Ordner aufräumen
- [ ] Opt-in-Telemetrie (PostHog) + Crash-Reporting — anonym, transparent, abschaltbar, quelloffen auditierbar

### Monat 2 — Interaktiver Rebase
- [x] Lokales Rebase: onto beliebige Ref, `--autostash`, continue/skip/abort mit Anbindung an den Konflikt-Editor
- [x] Visueller interaktiver Rebase: Drag-and-drop-Reorder, squash/fixup/drop/reword/edit als Ein-Klick-Aktionen im Graph
- [x] Lazygit-Klasse Shortcuts: „Amend in älteren Commit", „Fixup hierhin" direkt aus dem Commit-Kontextmenü
- [ ] Rebase-Folgearbeiten: Commit-Body im Reword vorbefüllen, Ref-Validierung in Dialog/Editor, `rebase_status` im Status-Poll, Windows-Smoke-Test der Sequence-Editor-Skripte

### Monat 3 — Universelles Undo & Qualität
- [x] Reflog-Ansicht
- [x] Operationsbasiertes Undo-Log: Merge/Rebase/Reset/Branch-Löschung rückgängig machen
- [x] Transparenz-Modus: jedes ausgeführte Git-Kommando in einem einsehbaren Log
- [x] Integrationstests für `git.rs` und `pr.rs` gegen Fixture-Repos, CI-Gate
- [x] Fortschrittsanzeige und Abbruch für clone/fetch/push
- [ ] Undo-Folgearbeiten: Branch-Restore-UI, Undo-Fehlertexte als Sentinels statt englischer Prosa
- [ ] Rust-Fehlermeldungen lokalisierbar machen (keine hartkodierten deutschen Strings)

## Q2 (Dez 2026–Feb 2027) — Daily Loop & Table Stakes

### Monat 4 — Diff-Erlebnis
- [x] Side-by-Side-Umschalter für alle Diff-Viewer, 2-Wege-Merge-Editor reaktivieren
- [x] Word-Level-Diff
- [x] Bild-Diff (Vorher/Nachher, Swipe, Onion-Skin)
- [x] Git-LFS-Grundsupport: Erkennung, Pointer-Anzeige, pull/track
- [ ] Media/LFS-Folgearbeiten: Index-Treeish für gestagte Bilder, LFS-Blob-Materialisierung für committete Seiten, PR-Blobs über Provider-API, Größen-Command statt Voll-Download für Nicht-Bilder
- [ ] Diff-Performance-Benchmark gegen Fork/GitKraken auf Monorepos, Ergebnis dokumentieren

### Monat 5 — Provider-Vollständigkeit
- [x] GitLab komplett: MRs (Liste, Detail, Review, Merge), Pipelines, self-hosted
- [x] Gitea/Forgejo-Erkennung statt stillem GitHub-Fallback, saubere Fehlermeldungen
- [x] Annotierte und signierte Tags
- [x] GPG/SSH-Commit-Signierung
- [x] Multi-Remote-Push (origin-Hardcode entfernen)
- [ ] Provider-Folgearbeiten: Live-Test gegen echte GitLab-Instanz, Pipeline-Retry für GitLab, Signier-Badge live aktualisieren

### Monat 6 — Flow & Onboarding
- [x] Command Palette auf alle Aktionen ausweiten (alles ohne Maus erreichbar)
- [x] Hotkey-Rebinding, Kontext-Hotkeys pro Panel
- [x] Onboarding auf den Aha-Moment trimmen: Repo öffnen → Graph + erste AI-Commit-Message ohne Konfiguration, interaktive Mini-Tour
- [ ] Retention-Messung live: Aktivierungsrate, D7/D30-Retention, Feature-Adoption (wartet auf PostHog-Entscheidung)
- [ ] Flow-Folgearbeiten: Terminal-Toggle und History-Pfeiltasten ins Rebinding-System, Settings-Hash-Navigation, Branch-aus-Commit-Dialog

## Q3 (Mär–Mai 2027) — AI-native Differenzierung

### Monat 7 — Agent-Review-Workflow
- [x] Dashboard aller laufenden Agents über alle Repos
- [x] Diff-Review pro Agent-Session mit Hunk-genauem Übernehmen/Verwerfen
- [x] Ein-Klick-Flow: Review → Commit → Merge zurück → Worktree aufräumen
- [x] AI-gestütztes Commit-Splitting für Agent-Output
- [ ] Agent-Review-Folgearbeiten: Übersichts-Diff-Stat auf agent_review_summary umstellen, App-weites Agent-Presence-Arming, Merge-Strategie-Auswahl im Abschluss-Flow, buildLanguageModel aus ai-commit.ts exportieren statt duplizieren

### Monat 8 — Stacked Branches/PRs
- [x] Stacks im Client: Branch-Kette erstellen, automatisches Restacking bei Basis-Änderungen
- [x] Stack als PR-Kette zu GitHub/GitLab submitten
- [x] Graph-Visualisierung der Stacks
- [x] Auto-Branch-Archiving für gemergte/stale Branches
- [ ] Stack-Folgearbeiten: Stack-Badges inline an Branch-Labels, global gemounteter Restack-Resume-Watcher, Graphite-artiger Ketten-Text im PR-Body, remote_merged-Flag für den Remote-Zwilling

### Monat 9 — Steuerbare AI in der Breite
- [x] AI-Konfliktlösung als Vorschlag im 3-Wege-Editor (nie Vollautomatik)
- [x] „Explain this branch/commit/diff"
- [x] AI-PR-Beschreibungen
- [x] Eigene Prompt-Templates überall, Reroll/Hint-Interaktion
- [x] Ollama/lokale Modelle als First-Class-Option
- [ ] AI-Folgearbeiten: repo_range_commits-Command für Branch-Explain jenseits der geladenen Seite, AI-Beschreibung im Stack-PR-Ketten-Dialog (braucht Body-Feld)

## Q4 (Jun–Aug 2027) — Team, Reichweite, Community

### Monat 10 — Review-Inbox & Daily-Loop-Vollausbau
- [x] Repo-übergreifende Inbox: meine PRs, angeforderte Reviews, rote CI-Läufe, laufende Agents
- [x] PR-Review vertiefen: Inline-Kommentar-Threads, Suggested Changes, Review-Drafts
- [x] Native Benachrichtigungen (CI rot, Review angefordert, Agent fertig)
- [ ] Inbox/Notification-Folgearbeiten: Hintergrund-Polling für CI/Review-Ereignisse, default_branch aus dem Provider-Payload, Notification-Klick-Navigation sobald das Tauri-Plugin Desktop-Clicks liefert

### Monat 11 — Reichweite & Community
- [ ] Linux-Polish: Wayland, HiDPI (braucht Linux-Testgerät)
- [x] Paket-Kanäle: Homebrew, winget, AUR, Flatpak — Manifeste + Publizier-Anleitung unter `packaging/`; Veröffentlichung selbst ist manuell
- [x] i18n-Ausbau (ES/FR/PT/ZH/JA) mit Lazy-Loading der Locales
- [x] Docs: Nutzerhandbuch unter `docs/` (Screenshots/Videos noch offen — brauchen laufende App)
- [ ] Öffentliche Roadmap auf GitHub, Discussions/Discord aktivieren (manuell auf github.com)
- [x] Contributor-Onboarding: CONTRIBUTING.md, Code of Conduct, Issue-/PR-Templates, Good-first-issue-Empfehlungsliste, schnelle PR-Reviews

### Monat 12 — v1.0 & Nachhaltigkeit
- [x] Stabilitäts-Sprint: alle „Folgearbeiten“-Punkte aus Q1–Q3 abgearbeitet
- [x] Security-Review durchgeführt (3 High, 2 Medium, 2 Low, 1 Info gefunden); Fixes in Arbeit
- [x] Sponsor-Link in README + FUNDING.yml (GitHub Sponsors auf github.com noch zu aktivieren)
- [ ] 1.0-Release: Show HN, Product Hunt (manuell, nach dem Launch-Sprint)

## Durchgängig (jedes Quartal)
- Performance-Budget: Startzeit, Status-Refresh, Graph-Rendering auf Monorepos als CI-Benchmark
- Bug-Turnaround unter einem Release-Zyklus
- KPIs: Aktivierung (Aha-Moment < 5 min), D30-Retention, DAU/WAU, Sessions/Tag (> 2 = Daily Loop erreicht), Adoption von Rebase/Undo/Agent-Review

---

## Umsetzungsstand

Die zwölf Monatspakete der Roadmap sind implementiert und auf `development` committet. Die Testabdeckung ist von ~100 auf 259 Rust- und 466 Frontend-Tests gewachsen (plus ein CI-Gate mit Locale-Paritätsprüfung); die App spricht sieben Sprachen.

Offen bleiben ausschließlich Punkte, die außerhalb des Codes liegen oder eine Entscheidung/Umgebung brauchen:
- **Telemetrie (Monat 1/6):** wartet auf die PostHog-Entscheidung (Instanz + Projekt-Key).
- **Diff-Benchmark (Monat 4):** manueller Vergleich gegen Fork/GitKraken auf echten Geräten.
- **Linux-Polish (Monat 11):** braucht ein Linux-Testgerät.
- **Reichweite (Monat 11/12):** Paket-Kanäle publizieren, GitHub Discussions/Sponsors aktivieren, Screenshots/Videos, Show-HN/Product-Hunt-Launch — alles manuell auf github.com bzw. den Plattformen.
- **Retention-Messung (Monat 6):** hängt an der Telemetrie-Entscheidung.

Die pro Monat gesammelten „Folgearbeiten“ wurden im Monat-12-Stabilitätssprint abgearbeitet; der Security-Review deckte 3 High-, 2 Medium- und 2 Low-Findings auf, deren Fixes separat einfließen.
