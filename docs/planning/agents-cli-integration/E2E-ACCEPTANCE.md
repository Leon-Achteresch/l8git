# E2E-ACCEPTANCE — QA-04 Claude-End-to-End-Abnahme

Abnahmeprotokoll für die reale Claude-CLI-Integration (`claude --output-format stream-json`). Jede Zeile muss mit einem
tatsächlich durchgeführten Lauf ausgefüllt werden — keine behaupteten Tests ohne Beleg. Automatisierter Rauchtest:
`e2e/agents-claude.spec.ts` (Playwright, `test.skip`, wenn `claude` nicht auf PATH liegt; deckt Readiness, Start und Stop
über das Control-Protokoll ab).

## Kernflows je Betriebssystem

Pro Zeile: CLI-Version (`claude --version`), Ergebnis (bestanden/fehlgeschlagen/nicht verfügbar), Datum, Tester, Log-Referenz.

### macOS

| Flow | CLI-Version | Ergebnis | Datum | Tester | Log |
|---|---|---|---|---|---|
| Readiness (`system/init` nach `initialize`) | | | | | |
| Start (Prozessstart, erste Antwort) | | | | | |
| Approval (`control_request` Permission, Antwort) | | | | | |
| Question (`AskUserQuestion`, Auswahl) | | | | | |
| Plan (Plan-Mode-Turn, Freigabe) | | | | | |
| Resume (`--resume` mit vorhandener Session-ID) | | | | | |
| Fork (Session-Fork ab Nachricht) | | | | | |
| Rate-Limit (Rate-Limit-Event, UI-Reaktion) | | | | | |
| Stop (Interrupt/Prozessende, kein Zombie) | | | | | |

### Linux

| Flow | CLI-Version | Ergebnis | Datum | Tester | Log |
|---|---|---|---|---|---|
| Readiness | | | | | |
| Start | | | | | |
| Approval | | | | | |
| Question | | | | | |
| Plan | | | | | |
| Resume | | | | | |
| Fork | | | | | |
| Rate-Limit | | | | | |
| Stop | | | | | |

### Windows

| Flow | CLI-Version | Ergebnis | Datum | Tester | Log |
|---|---|---|---|---|---|
| Readiness | | | | | |
| Start | | | | | |
| Approval | | | | | |
| Question | | | | | |
| Plan | | | | | |
| Resume | | | | | |
| Fork | | | | | |
| Rate-Limit | | | | | |
| Stop | | | | | |

## Erweiterte Matrix

Nicht verfügbare Features bleiben **offen**, nicht „bestanden“ — kein stilles Streichen.

| Feature | macOS | Linux | Windows | Anmerkung |
|---|---|---|---|---|
| Zwei parallele Instanzen | offen | offen | offen | |
| MCP-Server | offen | offen | offen | |
| Skills | offen | offen | offen | |
| Subagents | offen | offen | offen | |
| Attachments | offen | offen | offen | |
| Compact | offen | offen | offen | |
| Worktree-Session | offen | offen | offen | |
| Remote-Session | offen | offen | offen | |

## Automatisierter Rauchtest

- Datei: `e2e/agents-claude.spec.ts`.
- Übersprungen, wenn `claude` nicht auf `PATH` auffindbar ist (`which`/`where`).
- Deckt ab: Prozessstart, `initialize`-Control-Request, Empfang von `system`/`init`, sauberer Stopp (`SIGTERM` +
  geschlossenes stdin) ohne offenen Prozess.
- Deckt bewusst nicht ab: Approval/Question/Plan/Resume/Fork/Rate-Limit — diese erfordern eine reale, authentifizierte
  Konversation und werden manuell gemäß obiger Matrix erfasst.

## Prüfung

- Jede Zeile der Kernflow-Tabellen ist mit einem reproduzierbaren Lauf, bereinigten Logs (keine Secrets/Tokens) und
  einer CLI-Version belegt.
- Kein Eintrag gilt als „bestanden“, ohne dass der Lauf tatsächlich stattgefunden hat.
