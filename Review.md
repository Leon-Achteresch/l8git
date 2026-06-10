# Code-Review l8git

Stand: 2026-06-09 · Branch `development` · v0.3.0
Umfang: Rust-Backend (`src-tauri/src`), Frontend (`src/lib`, `src/components`, `src/routes`), Build-Konfiguration.

---

## 1. Features mit Verbesserungsbedarf

### 1.1 Commit-Suche

| Problem | Fundstelle | Details |
|---|---|---|
| Volltext-Scan der gesamten Historie pro Suchanfrage | `git.rs:297` (`repo_search_commits`) | Jede Suche führt `git log --all --name-only` über **alle** Commits inkl. aller Dateipfade aus und filtert erst danach in Rust. Bei großen Repos (10k+ Commits) sind das hunderte MB Output pro Tastendruck. |
| Pagination wiederholt den kompletten Scan | `git.rs:366` | `skip` wird durch erneutes Durchlaufen aller Treffer realisiert → Laden von Seite N kostet O(gesamte Historie). Beim Infinite-Scroll der Suchergebnisse wird die Historie also immer wieder komplett gelesen. |
| Keine gezielten Git-Filter | – | `git log --grep`, `--author`, `-S`/`-G` und `-- <pfad>` würden das Filtern an Git delegieren und wären um Größenordnungen schneller. Alternativ: einmaliger Scan pro Query cachen und Seiten daraus servieren. |

### 1.2 Commit-Historie & Graph

- **Branch-Filter arbeitet nur auf dem geladenen Fenster** (`commit-history-panel.tsx:93-101`): `computeReachableHashes` kennt nur die bisher geladenen ≤80–N Commits. Liegt ein Branch-Tip oder Eltern-Commit außerhalb des Fensters, ist das Filterergebnis unvollständig und Graph-Lanes laufen ins Leere. Besser: Filterung serverseitig (`git log <branch>`), oder beim Aktivieren des Filters gezielt nachladen.
- **`tags_by_target` läuft bei jeder Log-Seite neu** (`git.rs:473`): Pro Infinite-Scroll-Seite ein `for-each-ref` über alle Tags. Bei Repos mit vielen Tags messbar; Tag-Map nur bei `open_repo` laden und im Frontend mergen.
- **`--skip`-Pagination wird mit der Tiefe teurer** (`git.rs:209`): `git log --all --date-order --skip=N` muss N Commits erneut traversieren. Für sehr tiefes Scrollen wäre Cursor-basierte Pagination (`--before` + letztem Hash) stabiler.
- **Avatar-Generation verwirft In-Flight-Batches** (`repo-store.ts:1553-1580`): `nextCommitAvatarGeneration` invalidiert bei jedem `loadMore` alle vorherigen, noch laufenden Avatar-Anfragen. Schnelles Scrollen → Avatare früherer Seiten kommen nie an. Ergebnisse sollten gemerged statt verworfen werden (Generation nur bei Repo-Wechsel/Removal erhöhen).

### 1.3 Pull Requests / Provider-Integration

- **Unbekannte Hosts werden als GitHub behandelt** (`pr.rs:249-255`): Gitea/Forgejo/selbstgehostete Server bekommen GitHub-API-Calls auf `/api/v3` und scheitern mit kryptischen Fehlern. GitLab ist explizit `Unsupported`. Mindestens: klare Fehlermeldung für unbekannte Hosts, perspektivisch GitLab-Support.
- **PR-Liste lädt immer bis zu 500 PRs (`state=all`, 10 Seiten) ohne Cache** (`pr.rs:449-484`): Jeder Panel-Besuch löst die volle Paginierung aus. `loadPRs` hat – anders als `reload`/`reloadStatus` – keine Koaleszierung/Debounce (`repo-store.ts:633`). ETag/`If-None-Match` oder ein kurzer TTL-Cache würde Rate-Limits schonen.
- **`gh_file_patch` paginiert pro Datei-Klick erneut durch alle PR-Dateien** (`pr.rs:610-638`); `bb_file_patch` lädt den **kompletten PR-Diff** pro Datei-Klick (`pr.rs:1032`). Ergebnis pro PR einmalig laden und im Frontend cachen.
- **Avatar-Auflösung: 1 API-Request pro Commit** (`pr.rs:1279` Semaphore 14): Beim Scrollen 80 Requests pro Seite gegen `/commits/{sha}` – GitHub-Rate-Limit (5000/h) ist bei großen Repos schnell aufgebraucht. Besser: Cache nach Autor-E-Mail statt `(repo, hash)`, GraphQL-Batching, oder Gravatar-Fallback lokal.

### 1.4 Dashboard & Statistiken

- **Aggregationen basieren nur auf den geladenen ≤80 Commits** (`dashboard-aggregations.ts:34`, `:107`): „Commits pro Tag“, „Top Contributors“ etc. sind faktisch falsch, sobald die Historie größer ist als das Ladefenster. Die passenden Backend-Kommandos existieren bereits (`repo_activity_buckets`, `repo_contributor_stats`, `git.rs:4709/4826`) – das Dashboard sollte diese nutzen.
- **Branch-Klassifizierung „stale“ ist irreführend** (`dashboard-aggregations.ts:88-95`): Ein Branch gilt als stale, wenn sein Tip nicht im geladenen Commit-Fenster liegt – das trifft auf fast jeden älteren, aber aktiven Branch zu.
- **PR-Trend rückprojiziert nur aktuell offene PRs** (`dashboard-aggregations.ts:163-189`): Bereits geschlossene PRs fehlen in historischen Wochen komplett; der Trend zeigt nicht „offene PRs über Zeit“, sondern „heutige offene PRs, zurückgerechnet“.
- **`repos_overview` ohne Parallelitäts-Limit** (`git.rs:4923-4937`): Pro Repo ein `spawn_blocking`, darin je 4–5 Git-Prozesse. Bei 30+ Repos im Dashboard entsteht ein Prozess-Sturm; ein Semaphore (z. B. 4–8 gleichzeitig) fehlt.

### 1.5 Stash

- **Untracked-Dateien im Stash fehlen in der Dateiliste** (`git.rs:1992`): `stash_changed_files` diffed nur gegen Parent 1; mit `-u` gestashte Dateien (3. Parent) tauchen in der Inspektion nicht auf.
- **Index-basierte Operationen sind racy** (`git.rs:2092-2117`): `stash pop/drop` per `stash@{N}` – ändert sich die Liste zwischen Anzeige und Klick (z. B. durch den Watcher-Poll), trifft die Operation den falschen Stash. Sicherer: vor der Operation Hash verifizieren.

### 1.6 Submodule

- **4+ sequentielle Git-Aufrufe pro Submodul** (`git.rs:3932-3957`): `symbolic-ref`, `rev-parse @{u}`, `rev-list --count`, `status --porcelain` laufen seriell pro Submodul. Bei Monorepos mit 10+ Submodulen dauert `list_submodules` Sekunden – parallelisierbar wie `compute_status_entries`.
- **`get_submodule_commits` liefert fix 10 Commits ohne Paging** (`git.rs:4096`); die `is_pinned`-Heuristik mit beidseitigem `starts_with` (`git.rs:4120-4123`) kann bei kurzen Prefixen falsch matchen.

### 1.7 Bisect

- **`.git/BISECT_LOG` wird direkt gelesen** (`git.rs:4479`, `:4538`): Bricht in Worktrees und bei `gitdir:`-Verlinkungen. Korrekt: `git rev-parse --git-path BISECT_LOG` (wird bei `CHERRY_PICK_HEAD`/`MERGE_HEAD` bereits richtig gemacht).
- **`steps_remaining`-Parsing hängt am englischen Wort „roughly“** (`git.rs:4502`): Bricht bei lokalisierter Git-Ausgabe; `LC_ALL=C` für diese Aufrufe setzen.

### 1.8 Merge / Pull / Push / Checkout

- **`git_push` hardcodet `origin`** beim Setzen des Upstreams (`git.rs:580`): Multi-Remote-Workflows (fork + upstream) können nicht auf andere Remotes pushen.
- **`git_pull` blockiert bei dirty Worktree immer** (`git.rs:525`): Kein `--autostash`-Angebot; Nutzer müssen manuell stashen.
- **`delete_remote_branch`/`delete_remote_tag` warten synchron auf `fetch --prune`** (`git.rs:1221`, `:1252`): Verdoppelt die wahrgenommene Latenz; das Prune kann im Hintergrund laufen.
- **Kein Fortschritt/Abbruch bei langen Operationen**: `git_clone` (`git.rs:676`), `fetch`, `push` liefern erst am Ende ein Ergebnis. Großes Clone = scheinbar eingefrorene App. `--progress` über stderr streamen (Tauri-Channel existiert bereits fürs Terminal) und Abbruch ermöglichen.

### 1.9 AI-Commit-Messages

- **API-Keys liegen im Klartext in `localStorage`** (`commit-prefs.ts:70` via zustand-persist): Für eine Desktop-App sollte der OS-Keychain (z. B. `tauri-plugin-stronghold`/`keyring`) genutzt werden.
- **Diff wird hart bei 48.000 Zeichen abgeschnitten** (`ai-commit.ts:10`, `:134`): Schnitt mitten in einer Datei; besser pro Datei kürzen (Header + erste Hunks behalten, Rest als Statistik zusammenfassen).

### 1.10 i18n

- **Backend-Fehlermeldungen sind hart deutsch** (durchgängig in `git.rs`, `pr.rs`, `credentials.rs`), während das Frontend i18next mit mehreren Sprachen nutzt. Backend sollte Fehler-Codes liefern, das Frontend übersetzt.
- **`format_blame_date` liefert deutsche relative Zeiten unabhängig von der App-Sprache** (`git.rs:3512-3532`): Besser nur den Timestamp liefern (ist als `timestamp` bereits vorhanden) und im Frontend mit `Intl.RelativeTimeFormat` formatieren – `formatRelativeTime` existiert schon (`dashboard-aggregations.ts:310`).

### 1.11 Robustheit & Sicherheit

- **Magic-String-Fehlerprotokoll** `__LOCAL_CHANGES_BLOCK__|a,b,c` (`git.rs:117`, `:527`, `:774`): Dateinamen mit Kommas zerbrechen das Format. Strukturierte Fehler (serde-Enum über `Result<_, ErrorPayload>`) wären robust.
- **Fehlender `--`-Separator bei Ref-Namen** (`git.rs:721` checkout, `:748` branch, `:1085` tag, `:805` merge, `:869` revert u. a.): Ein Branch-/Tag-Name, der mit `-` beginnt, wird als Flag interpretiert (Argument-Injection). `stage_files`/`restore` machen es mit `--` bereits richtig.
- **`repo_read_file`/`repo_write_file` ohne Pfad-Kapselung** (`git.rs:1689-1705`): `file` kann `../..` oder absolut sein; `PathBuf::join` mit absolutem Pfad ersetzt die Repo-Wurzel komplett. Kanonisierung + Prefix-Check ergänzen.
- **CSP ist deaktiviert** (`tauri.conf.json:27` `"csp": null`): In Kombination mit gerendertem Remote-Markdown (PR-Beschreibungen/Kommentare via `react-markdown`) sollte eine restriktive CSP gesetzt werden.
- **Watcher ohne Ref-Counting** (`watcher.rs:26-96`): Registry ist 1 Eintrag pro Pfad; sollte je ein zweiter Konsument `watch_repo`/`unwatch_repo` rufen, deaktiviert der erste Unmount den Watcher für alle. Aktuell nur ein Konsument – beim Ausbau aber eine Falle.

### 1.12 Tests & Tooling

- **Es existieren keinerlei Tests** – weder Rust-`#[cfg(test)]` noch JS/TS-Tests; CI besteht nur aus `release.yml`. Besonders die reinen Parser-Funktionen (`parse_numstat`, `parse_worktree_list`, `parse_gitmodules`, `parse_blame_porcelain`, `parse_stash_gs`, `buildGraph`, `conflict-parser`, `unified-diff`) sind ideale, billige Unit-Test-Kandidaten.
- **`package.json` enthält kein `lint`/`test`/`typecheck`-Script**; `bun.lock` und `package-lock.json` existieren parallel (zwei Paketmanager).

---

## 2. Mögliche Performance-Verbesserungen

### 2.1 Backend (Rust)

| # | Maßnahme | Fundstelle | Erwarteter Effekt |
|---|---|---|---|
| 1 | Commit-Suche auf `git log --grep/--author/-S` umstellen statt Full-Scan + Rust-Filter; Scan-Ergebnis pro Query cachen | `git.rs:297-397` | Größte Einzelverbesserung; Suche in großen Repos von Sekunden auf Millisekunden |
| 2 | `read_repo_favicon` ist ein **synchrones** Command mit rekursivem Festplatten-Scan bis Tiefe 12 (`any_ico_under_repo`) – läuft auf dem Main-Thread und kann die UI beim Repo-Öffnen einfrieren | `favicon.rs:79-156`, `:158` | `async` + `spawn_blocking`; Scan-Tiefe reduzieren oder Ergebnis pro Repo persistent cachen |
| 3 | `sniff_untracked` liest jede untracked Datei **vollständig**, um Zeilen zu zählen – eine einzige große Log-/Datendatei verlangsamt jeden Status-Poll | `git.rs:1309-1345` | Lese-Cap (z. B. 1–2 MB) einführen, darüber Schätzung/`–` anzeigen |
| 4 | Watcher beobachtet das gesamte Repo rekursiv inkl. `node_modules`, `target`, `dist` | `watcher.rs:77` | Build-/Install-Läufe erzeugen Event-Stürme (und sprengen auf Linux inotify-Limits). Ignorierliste beim Attach (nicht erst beim Filtern) bzw. nur Worktree-Top-Level + `.git/HEAD`, `.git/refs`, Index beobachten |
| 5 | `repos_overview`: Semaphore für `spawn_blocking`-Fanout | `git.rs:4923` | Verhindert 100+ parallele Git-Prozesse beim Dashboard-Öffnen |
| 6 | `list_submodules`: Submodul-Zusatzinfos parallelisieren | `git.rs:4045` | Linearer → konstanter Faktor bei vielen Submodulen |
| 7 | Tag-Map nicht pro `repo_log_page` neu laden | `git.rs:473` | Ein `for-each-ref` weniger pro Scroll-Seite |
| 8 | `compute_status_entries`/`repo_full_status` spawnen pro Aufruf 5 OS-Threads | `git.rs:1354-1366`, `:1495` | Bei Watcher-Bursts Thread-Churn; `tokio::join!` auf `spawn_blocking`-Handles oder kleiner Pool |
| 9 | `dirty_tracked_files` führt vor `pull`/`merge` ein zusätzliches `git status` aus, obwohl der Status im Frontend frisch vorliegt | `git.rs:501`, `:525`, `:772` | Optional Status-Hash mitgeben; spart einen Prozess-Spawn pro Operation |
| 10 | `ext_to_language`: ~1.250-zeiliges `match` in `git.rs` | `git.rs:2263-3498` | Funktional ok (statisches Match), aber in generiertes Modul auslagern → Kompilierzeit + Lesbarkeit von `git.rs` (4.937 Zeilen) |

### 2.2 Frontend (React/TS)

| # | Maßnahme | Fundstelle | Erwarteter Effekt |
|---|---|---|---|
| 1 | Dashboard auf Backend-Aggregationen (`repo_activity_buckets`, `repo_contributor_stats`) umstellen | `dashboard-aggregations.ts` | Korrekte Zahlen **und** weniger Arbeit im Renderer |
| 2 | `buildGraph` kopiert pro Zeile `lanesBefore`/`lanesAfter`/`laneOrigins*` (4 Arrays × Zeilen × Lanes) | `graph.ts:169-247` | Bei 1.000+ geladenen Commits spürbarer GC-Druck; Lane-Deltas statt Voll-Kopien speichern |
| 3 | `graphKey`/`branchesKey` als `join("|")` über alle Hashes bei jedem Render-Memo | `commit-list.tsx:95-103` | O(n)-Stringbau pro Render; stattdessen `commits`-Referenz + Länge oder letzte Hash als Key |
| 4 | Range-Select & Keyboard-Navigation nutzen `hashList.indexOf` (O(n) pro Tastendruck) | `commit-history-panel.tsx:140-214` | `Map<hash, index>` einmal memoisieren |
| 5 | Globaler `keydown`-Listener wird bei jeder Selektionsänderung neu registriert (Deps enthalten `selectedHashes`, `cursorHash`, …) | `commit-history-panel.tsx:156-236` | Handler-Logik in `useRef`/`useEventCallback` ziehen, Listener stabil halten |
| 6 | Avatar-Batches mergen statt per Generation verwerfen | `repo-store.ts:1553` | Weniger verlorene/erneute Avatar-Requests beim Scrollen |
| 7 | `loadPRs` mit derselben In-Flight-Koaleszierung versehen wie `reload`/`reloadStatus` | `repo-store.ts:633` | Doppel-Fetches beim Tab-Wechsel vermeiden |
| 8 | PR-Datei-Patches im Frontend cachen (pro PR + head_sha) | PR-Files-Tab | Spart wiederholte teure Provider-Roundtrips (siehe 1.3) |

### 2.3 Architektur / IPC

- **Reload-Strategie ist grob**: Nach fast jeder Mutation wird `open_repo` komplett neu geladen (Commits + Branches + Tags). Für z. B. `tagCommit` oder `deleteBranch` würde ein gezieltes Nachladen von Branches/Tags reichen. Die Koaleszierung (150 ms) in `repo-store.ts:14-25` fängt viel ab – gut gelöst –, aber die Payload pro Reload bleibt unnötig groß.
- **Fortschritts-Streaming**: Für `clone`/`fetch`/`push` einen Tauri-`Channel` nutzen (Infrastruktur existiert seit der Terminal-Umstellung), statt auf Prozessende zu warten.

---

## 3. Priorisierte Top-10 (Aufwand → Nutzen)

1. **Commit-Suche auf Git-Filter umstellen** (1.1) – größter Perf-Gewinn.
2. **`read_repo_favicon` async machen + Scan begrenzen** (2.1 #2) – behebt UI-Freezes beim Öffnen großer Repos.
3. **Dashboard auf Backend-Statistiken umstellen** (1.4) – behebt falsche Zahlen.
4. **`--`-Separator + strukturierte Fehler statt Magic-Strings** (1.11) – Robustheit/Sicherheit, geringer Aufwand.
5. **Watcher-Ignorierliste (node_modules/target/dist)** (2.1 #4).
6. **API-Keys in den OS-Keychain** (1.9).
7. **`sniff_untracked` Lese-Cap** (2.1 #3) – schneller Status-Poll garantiert.
8. **Avatar-Strategie: E-Mail-Cache/Batching** (1.3) – Rate-Limits & Netzwerk.
9. **Bisect/Worktree-Kompatibilität via `--git-path`** (1.7).
10. **Unit-Tests für die Parser-Schicht** (1.12) – sichert alle weiteren Refactorings ab.
