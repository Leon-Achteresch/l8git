# l8git Remote — Mobile Companion

React-Native-App (Expo) unter `mobile/`, die sich über eine Ende-zu-Ende-verschlüsselte WebSocket-Verbindung mit einem oder mehreren l8git-Hosts verbindet und Git- sowie Agent-Funktionen bereitstellt. Desktop-only-Kommandos sind im Remote-Vertrag ausdrücklich ausgeschlossen.

Konzept und Wire-Protokoll: [CONCEPT.md](CONCEPT.md). Server-Interna: [SERVER-INTERNALS.md](SERVER-INTERNALS.md).

## Host starten

```bash
cd src-tauri
cargo build --features headless --bin l8gitd
./target/debug/l8gitd pair        # QR-Code + Pairing-JSON
./target/debug/l8gitd allow /pfad/zum/repo
./target/debug/l8gitd serve --port 8484 [--relay wss://...]
```

Die App scannt den QR-Code (oder fügt das JSON manuell ein) und verbindet sich per LAN oder Relay.

## Agenten-Review abschließen

Eine Datei zählt erst nach **Mark reviewed** als geprüft. Öffnen allein setzt keinen Haken. Die Bestätigung ist nur nach einer erfolgreich geladenen, aktuellen Vorschau möglich und gilt für deren Dateistand. Neue Änderungen, ein neuer Gesamtstand oder eine unterbrochene Host-Verbindung setzen die betroffenen Prüfmarkierungen zurück. Die Bestätigung vor dem Abschluss ist ein eigener Schritt.

Unter **Worktree reviews** prüfst du die Dateien einer Session und öffnest **Finish review**. Bestätige den aktuellen Stand, gib bei offenen Änderungen eine Commit-Nachricht ein und wähle die Merge-Strategie: Fast-forward, Fast-forward ausschließlich oder ein eigener Merge-Commit. Nach dem Commit wird die Bestätigung zurückgesetzt, damit du den entstandenen Stand vor dem Merge erneut prüfst. Ein sauberer Worktree überspringt den Commit-Schritt.

Die Prüfung bindet Aktionen an Host, Repository, Branches, Commit-Hashes und Dateiinhalte. Auch Binäränderungen ohne neue Zeilenstatistik verlangen eine erneute Bestätigung. Dateinamen und Repository-Pfade bleiben exakt erhalten. Zum Verwerfen zeigt die App zuerst eine Vorschau; die Aktion prüft denselben Dateistand erneut.

Commit, Merge und Aufräumen sind einzeln wiederaufnehmbar. Nach erfolgreichem Entfernen des Worktrees wird dieser Fortschritt gespeichert, bevor sein Branch gelöscht wird. Bei einem Abbruch erscheint die Session weiterhin als **Resume cleanup**, auch mit leerer Dateiliste oder ohne den früheren Worktree-Pfad. Ein inzwischen neu angelegter Branch am gleichen Namen bleibt geschützt. Git-Aktionen benötigen eine verbundene Host-Sitzung; ein nicht verfügbarer ausgewählter Agent-CLI verhindert den Git-Abschluss nicht.

## Screenshots

Die folgende Galerie ist ein älterer Referenzstand und keine Abnahme der aktuellen Version. Das bisherige Home-Bild zeigte einen Expo-Fehler und wurde deshalb aus der Produktgalerie entfernt. Der Repo-Header wurde inzwischen kompakter umgesetzt. Aktuelle Prüfgrenzen stehen im [Audit-Umsetzungsbericht](../audits/2026-09-06/IMPLEMENTATION.md).

Die ursprünglichen Aufnahmen entstanden laut damaliger Dokumentation im iPhone-17-Pro-Simulator (Expo Go) gegen `l8gitd` — via mobilewright (`MW_ROUTES=/,/repos bunx mobilewright test shots`, `bunx mobilewright test agents|details` in `mobile/`, Ausgabe `/tmp/mw-shots/`, dann hierher kopieren). Design-Regeln: [DESIGN.md](DESIGN.md).

| Repos (historisch) | Repo-Detail (historisch) | History (historisch) |
|---|---|---|
| ![Repos](screenshots/repos.png) | ![Repo-Detail](screenshots/repo-detail.png) | ![History](screenshots/repo-history.png) |

| Branches | Stash | PRs | CI |
|---|---|---|---|
| ![Branches](screenshots/repo-branches.png) | ![Stash](screenshots/repo-stash.png) | ![PRs](screenshots/repo-pr.png) | ![CI](screenshots/repo-ci.png) |

| Agents | Agent-Chat | Approvals | Reviews |
|---|---|---|---|
| ![Agents](screenshots/agents.png) | ![Agent-Chat](screenshots/agent-chat.png) | ![Approvals](screenshots/approvals.png) | ![Reviews](screenshots/reviews.png) |

| Dashboard | Settings | Commit-Detail | Diff |
|---|---|---|---|
| ![Dashboard](screenshots/dashboard.png) | ![Settings](screenshots/settings.png) | ![Commit](screenshots/commit-detail.png) | ![Diff](screenshots/diff.png) |

- **Home** — Glass-Buttons, Hosts als Story-Avatare mit Status-Ring, „For you“-Karten pro Repo (Branch, ↑↓, Dirty, Open/History), „Needs you“ mit Reviews, roten Pipelines, Agent-Approvals und eigenen PRs; schwebende Pill-Tab-Bar.
- **Repo-Detail (aktuell)** — kompakte Kopfzeile mit kleinem Repo-Avatar, Name, Branch und Inline-Status; Sektions-Chips mit 44-Punkt-Touchzielen geben Dateien und Composer mehr Raum. Die ältere Abbildung oben zeigt noch den großen Profil-Header.
- **Repos** — Glass-Suche, Host-Sektionen mit Gradient-Avatar + Status-Ring, Repos als 2-spaltige Bild-Kacheln (Ahead/Behind-Chip, Dirty-Punkt, Branch); Long-Press vergisst das Repo.
- **History / Branches / Stash / PRs / CI** — Sektionen unter dem Profil-Header: Glass-Suche, Filter-Chips (weiß aktiv), randlose Listen mit runden Avataren/Status-Bubbles, Aktions-Pills; Detailseiten (Commit, PR, CI-Run, Stash) mit Glass-Back-Kreis und Karten.
- **Approvals / Reviews** — Agent-Freigaben und Worktree-Reviews mit Glass-Header, Karten, weißer Approve-Pille.
- **Dashboard** — KPI-Kacheln (Repos, Commits 30d, Dirty, Ahead/Behind) als randlose Karten, Host-Sektion mit Gradient-Avatar, Repo-Kachel mit Sparkline, Aktivität/Sprachen/Contributors als Panels.
- **Settings** — Hosts als Profil-Karten (Avatar mit Status-Ring, Active-Chip, Endpoint, Auto-Connect-Switch, Connect/Forget), weiße „Add host“-Pille, Präferenzen als randlose Liste mit runden Icon-Bubbles.
- **Agents** — Glass-Buttons für Approvals (mit Badge), Worktree-Reviews und neuen Thread; Filter-Chips; Threads aller vier Provider (Codex/Claude/OpenCode/Cursor) als Karten pro Repo mit rundem Agent-Avatar, Status-Chip und Vorschau.
- **Agent-Chat** — immersiver Blur-Hintergrund, Glass-Header mit Avatar/Titel/Status, Transkript direkt auf dem Hintergrund, weiße User-Bubbles, Glass-Composer („Type a message…“) mit Settings-Kreis und Senden-Kreis.
