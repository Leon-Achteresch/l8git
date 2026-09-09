# CLI · Weitere native CLI-Flächen und explizite Versionsentscheidungen

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="CLI-01"></a>

## CLI-01 · Vollständiges natives Command-/Flag-Inventar versionieren

**Problem und Ziel:** Offizielle CLI-Oberfläche und tatsächliche Runtime einer freigegebenen Version als maschinenlesbaren Katalog erfassen.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P1  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** QA-01, RUN-03

**Akzeptanzkriterien:**

- [ ] Jeder Command und jede relevante Option besitzt Capability, Scope, Interaktivität, Konfliktregeln und Ticketzuordnung; interne SDK-Controls sind separat markiert.
- [ ] Unbekannte neue Flags werden nicht automatisch freigeschaltet; Terminal-only- und Infrastrukturflächen erhalten begründete Einordnung statt stiller Auslassung.

**Prüfung:** Offizielle CLI-Referenz, lokales Help und Test-Start gegen denselben Versionsstand abgleichen.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-02"></a>

## CLI-02 · Native Terminalübergabe und Diagnosemodi integrieren

**Problem und Ziel:** Interaktive native Funktionen über ein instanzgebundenes Terminal erreichbar machen.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, SET-08, SEC-01

**Akzeptanzkriterien:**

- [ ] Handoff übernimmt Binary, Config-Verzeichnis und CWD; sensible Umgebung wird nicht als sichtbarer Shelltext eingefügt.
- [ ] doctor, Safe-/Bare-/Restricted-Modi und TUI-Anzeigeoptionen sind explizite Diagnose-/Sessionstarts mit geprüfter Semantik; keine Änderung aktiver Sessions als Nebeneffekt.

**Prüfung:** Terminalstart in zweiter Instanz, Abbruch und nicht unterstützter Diagnosemodus.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-03"></a>

## CLI-03 · Native Chrome- und IDE-Anbindungen gezielt aktivieren

**Problem und Ziel:** CLI-eigene Integrationen zusätzlich zum bestehenden Playwright-MCP prüfen.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, EXT-12

**Akzeptanzkriterien:**

- [ ] Browser- und IDE-Optionen werden als getrennte Fähigkeiten mit Enable/Disable und tatsächlichem Verbindungsstatus geführt.
- [ ] l8git-Playwright-Konfiguration wird nicht überschrieben; fehlende Extension oder mehrere IDEs ergeben nachvollziehbaren Auswahl-/Handoff-Status.

**Prüfung:** Nicht vorhandene Browserintegration und zwei verfügbare IDE-Ziele.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-04"></a>

## CLI-04 · MCP-Channels und asynchrone externe Eingaben anbinden

**Problem und Ziel:** CLI-unterstützte Channel-/Notification-Flows ohne Vermischung mit Userprompts aufnehmen.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, EXT-13, EVT-01

**Akzeptanzkriterien:**

- [ ] Eingehendes Ereignis behält Server, Herkunft und Threadzuordnung; neue Arbeit zwischen Userturns bekommt einen nachvollziehbaren synthetischen Turn.
- [ ] Nicht vertrauenswürdiger externer Inhalt erteilt keine Tool-Permission; experimentelle Entwicklungs-Channels sind keine Defaultfreigabe.

**Prüfung:** Benachrichtigung zwischen Turns und fremder Channel mit Approval-artigem Inhalt.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-05"></a>

## CLI-05 · Wiederkehrende Aufgaben und native Automatisierungen erfassen

**Problem und Ziel:** Unterstützte Loop-/Schedule-Funktionen über dieselbe Task-Oberfläche verfügbar machen.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, TASK-07, RUN-09

**Akzeptanzkriterien:**

- [ ] Inventar weist nach, ob native Steuerung, Command-Dispatch oder Terminal nötig ist; Start, Status, Pause/Stop und Ablauf sind separat bedienbar.
- [ ] Neustart erzeugt keine doppelten Zeitpläne; Bedingungen für aktive CLI, Berechtigungen und persistente Laufzeit sind sichtbar.

**Prüfung:** Wiederverbindung bei fälliger Aufgabe und nicht unterstützende CLI-Version.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-06"></a>

## CLI-06 · Native Remote-/Cloud-Sessions getrennt von l8git-Remote anbinden

**Problem und Ziel:** Optionalen CLI-eigenen Cloud-Dispatch, Remote Control und Rückübernahme bewerten und anschließen.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, HIST-03, UX-03

**Akzeptanzkriterien:**

- [ ] Capabilitymatrix trennt lokalen Hosttransport, native Remote-Steuerung, neue Cloudaufgabe und Wiederaufnahme einer Cloudsession.
- [ ] Zielumgebung, Upload-/Repo-Kontext und Handoff sind vor Start sichtbar; nicht verfügbare Auth-/Transportwege werden nicht emuliert.

**Prüfung:** Gemockter Cloud-Dispatch, fremde Session-ID und abgebrochener Handoff.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-07"></a>

## CLI-07 · Self-hosted Runner und Gateway als Administrationsflächen einordnen

**Problem und Ziel:** Vollständigen CLI-Katalog auch für außerhalb des normalen Agentchats liegende Infrastruktur behandeln.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, SET-04, CLI-02

**Akzeptanzkriterien:**

- [ ] Je Funktion ist Diagnose-/Setup-Handoff oder gesonderte Integration dokumentiert; l8git startet keine Infrastruktur beim Öffnen von /agents.
- [ ] Installation, Registrierung, Token-Erstellung und Prozessstop sind eigenständige bewusste Vorgänge; sensible Resultate bleiben in geschützter Oberfläche.

**Prüfung:** Fake-Setup mit Abbruch und Redaktionsprüfung erzeugter Test-Credentials.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-08"></a>

## CLI-08 · Tool-Policies und exklusive MCP-/Plugin-Konfiguration anbieten

**Problem und Ziel:** Built-in-Toolauswahl, Allow-/Deny-Regeln und Session-Erweiterungen typisiert modellieren.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P1  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, ASK-04, EXT-06, EXT-09

**Akzeptanzkriterien:**

- [ ] Verfügbare Tools und erlaubnisfreie Tools sind getrennte Einstellungen; Regeln zeigen Scope und native Semantik einschließlich MCP-Wildcards.
- [ ] Strict-MCP, temporäre Pluginquelle und Slash-Disable greifen nur nach Versions-/Konfliktprüfung; kein Freitext-Flag überschreibt zentrale Transport- oder Trustregeln.

**Prüfung:** Leere Tools-Liste, MCP-Regel und Konflikt zwischen Session- und Managed-Settings.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-09"></a>

## CLI-09 · Erweiterte Modell- und Output-Optionen inventarisieren

**Problem und Ziel:** Advisor, Ultracode, Output Styles und Beta-/Cacheoptionen nicht in generischen Settings verlieren.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, MOD-03, MOD-06

**Akzeptanzkriterien:**

- [ ] Jede Option erhält belegten Modell-/Account-/Versionsscope und korrekten Start-/Turn-Pfad; reine TUI-Optionen erhalten Handoff.
- [ ] Unbekannte Optionen werden nicht optimistisch gesendet; native Modifikationen bleiben von l8git-Renderer- und Systemprompt-Einstellungen getrennt.

**Prüfung:** Nicht berechtigter Account, Modellwechsel und kollidierende Promptoptionen.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CLI-10"></a>

## CLI-10 · Provider-Feedback mit Vorschau und explizitem Versand ermöglichen

**Problem und Ziel:** Vorhandenen submit_feedback-Ansatz und optionale UploadFeedback-Fähigkeit ehrlich verfügbar machen.

**Bereich:** /agents · Weitere native CLI-Flächen und explizite Versionsentscheidungen  
**Priorität:** P2  
**Herkunft:** l8git-Bestand / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CLI-01, SET-08, SEC-04

**Akzeptanzkriterien:**

- [ ] Instanz meldet tatsächliche Unterstützung; Nutzer sieht Umfang von Kommentar, Verlauf und Diagnose vor Versand.
- [ ] Ohne bewussten Versand verlässt nichts den Host; unsupported oder fehlgeschlagener Upload bleibt als Fehler sichtbar.

**Prüfung:** Ablehnung, unsupported CLI und redigierter Testverlauf mit Geheimnismarker.

**Implementierungsanker in l8git:** `src/lib/agents/cli-commands.ts`, `src/lib/agents/slash-commands.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
