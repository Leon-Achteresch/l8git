# l8git Remote — Mobile Companion

React-Native-App (Expo) unter `mobile/`, die sich über eine Ende-zu-Ende-verschlüsselte WebSocket-Verbindung mit einem oder mehreren l8git-Hosts verbindet und den vollen Funktionsumfang inklusive Agents-Tab bereitstellt.

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

## Screenshots

Aufgenommen im iPhone-17-Pro-Simulator (Expo Go) gegen einen laufenden `l8gitd` mit Live-Git-Daten — via mobilewright (`MW_ROUTES=/,/repos bunx mobilewright test shots` in `mobile/`, Ausgabe `/tmp/mw-shots/`, dann hierher kopieren).

| Home | Repos | Repo-Detail |
|---|---|---|
| ![Home](screenshots/home.png) | ![Repos](screenshots/repos.png) | ![Repo-Detail](screenshots/repo-detail.png) |

| Agents | Agent-Chat | Dashboard |
|---|---|---|
| ![Agents](screenshots/agents.png) | ![Agent-Chat](screenshots/agent-chat.png) | ![Dashboard](screenshots/dashboard.png) |

- **Home** — Glass-Buttons, Hosts als Story-Avatare mit Status-Ring, „For you“-Karten pro Repo (Branch, ↑↓, Dirty, Open/History), „Needs you“ mit Reviews, roten Pipelines, Agent-Approvals und eigenen PRs; schwebende Pill-Tab-Bar.
- **Repo-Detail** — Profil-Layout: geblurter Backdrop, rundes Repo-Avatar, Name + Branch, Stats-Reihe Ahead/Behind/Changes, Sektions-Chips (Status/History/Branches/Stash/PRs/CI), darunter Fetch/Pull/Push-Pills, Änderungsliste als Karte und Commit-Composer.
- **Repos** — Glass-Suche, Host-Sektionen mit Gradient-Avatar + Status-Ring, Repos als 2-spaltige Bild-Kacheln (Ahead/Behind-Chip, Dirty-Punkt, Branch); Long-Press vergisst das Repo.
- **Dashboard** — Übersichts-Kacheln (Repos, Commits 30d, Ahead/Behind), Commit-Aktivität als SVG-Sparkline, Sprach- und Branch-Statistik.
- **Agents** — Glass-Buttons für Approvals (mit Badge), Worktree-Reviews und neuen Thread; Filter-Chips; Threads aller vier Provider (Codex/Claude/OpenCode/Cursor) als Karten pro Repo mit rundem Agent-Avatar, Status-Chip und Vorschau.
- **Agent-Chat** — immersiver Blur-Hintergrund, Glass-Header mit Avatar/Titel/Status, Transkript direkt auf dem Hintergrund, weiße User-Bubbles, Glass-Composer („Type a message…“) mit Settings-Kreis und Senden-Kreis.
