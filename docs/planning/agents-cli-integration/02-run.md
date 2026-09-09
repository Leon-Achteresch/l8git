# RUN · Prozesse, Transport und Wiederverbindung

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="RUN-01"></a>

## RUN-01 · Backend-Prozessfabriken pro Treiber registrieren

**Problem und Ziel:** provider_process-Match durch klar getrennte Startstrategien unter einer Registry ersetzen.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-03

**Akzeptanzkriterien:**

- [ ] Startdefinition enthält Executable, Argumentvektor, CWD, erlaubte Umgebung und Transportart; Frontend darf keine beliebige Shell-Zeile einschleusen.
- [ ] Rust behält Prozesshoheit und bestehende Session-/Transport-Zugriffskontrollen; Single-Turn-, JSONL- und ACP-Strategien bleiben möglich.

**Prüfung:** Fake-Prozesse für zwei Strategien einschließlich ungültiger Treiber-ID.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-02"></a>

## RUN-02 · Claude-Binary zuverlässig auf allen Desktop-Plattformen auflösen

**Problem und Ziel:** Konfigurierten Pfad, PATH, native Installation und Windows-Shims korrekt behandeln.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-01

**Akzeptanzkriterien:**

- [ ] Angezeigtes Executable entspricht dem tatsächlich gestarteten Programm; Pfade mit Leerzeichen, Unicode und Symlinks funktionieren.
- [ ] Windows .cmd/.bat/.ps1 wird kontrolliert auf ein unterstütztes Ziel aufgelöst oder mit konkreter Diagnose abgelehnt.

**Prüfung:** Resolver-Fixtures für macOS, Linux, Windows und defekte Symlinks.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-03"></a>

## RUN-03 · CLI-Version und Protokoll-Kompatibilität prüfen

**Problem und Ziel:** Vor dem ersten Turn unterstützte CLI-/SDK-Versionen und optionale Startflags ermitteln.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-02, PROV-06

**Akzeptanzkriterien:**

- [ ] Abnahme dokumentiert tatsächlich getestete Versionen statt erfundener Mindestversion; interne Control-Flags sind als instabil markiert.
- [ ] Ein unbekanntes Flag führt zu einem gezielten Kompatibilitätsfehler; nur optionale Fähigkeiten dürfen degradieren, Sicherheitsoptionen nicht.

**Prüfung:** Fake-CLI mit fehlendem Flag und bekannter älterer Version; einmal echter Start pro Support-Plattform.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-04"></a>

## RUN-04 · Initialize-Handshake und Readiness absichern

**Problem und Ziel:** Transport offen, CLI initialisiert und Session bereit als getrennte Zustände modellieren.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-03, PROV-07

**Akzeptanzkriterien:**

- [ ] Send wird erst nach erfolgreicher Initialisierung zugelassen oder kontrolliert gepuffert; Init-Metadaten aktualisieren nur die richtige Instanz.
- [ ] Früher Exit, leeres oder fehlerhaftes Initialize und gleichzeitige Connect-Aufrufe hinterlassen keine hängende Session.

**Prüfung:** Exit vor Handle-Rückgabe sowie zwei parallele Connect-Aufrufe simulieren.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-05"></a>

## RUN-05 · Control-Requests mit Timeout, Cancellation und Cleanup versehen

**Problem und Ziel:** pending-Map des ClaudeClient gegen dauerhaft offene Promises und verwaiste Antworten absichern.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-04

**Akzeptanzkriterien:**

- [ ] Jede Control-Anfrage endet durch Antwort, definierten Timeout, Abbruch, Sendefehler oder Close; langlaufender Turn wird nicht mit kurzem RPC-Timeout verwechselt.
- [ ] Späte, doppelte und fremde request_id ändern keinen bereits erledigten Zustand; Fehlerantwort und Cancel sind getrennt.

**Prüfung:** Fake-Timer für initialize, mcp_status, set_model, close und verspätete Responses.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-06"></a>

## RUN-06 · JSONL-Framing und begrenzte Puffer robust machen

**Problem und Ziel:** Fragmentierte Bytes, große Tool-Ausgaben und Diagnosezeilen ohne Datenverlust verarbeiten.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-01

**Akzeptanzkriterien:**

- [ ] UTF-8 über Chunk-Grenzen, CRLF, mehrere Frames und letzter Frame ohne Newline werden korrekt gelesen; stdout und stderr bleiben getrennt.
- [ ] Größen- und Queue-Grenzen sind dokumentiert; Überschreitung erzeugt eine verwertbare Diagnose und keinen stillen Verlust kanonischer Events.

**Prüfung:** Fragment-/Burst-Fixtures, ungültiges JSON, riesiger Frame und ungültiges UTF-8.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-07"></a>

## RUN-07 · Graceful Stop und Prozessbaum-Cleanup implementieren

**Problem und Ziel:** Interrupt, Session schließen und App beenden mit klaren Eskalationsstufen behandeln.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-05, RUN-06

**Akzeptanzkriterien:**

- [ ] Interrupt beendet den Turn; Session-Stop räumt Requests, Streams und eigene Kindprozesse auf; nach Frist folgt kontrolliertes Kill.
- [ ] Ein Close-Fehler verliert den Prozesshandle nicht; Stop-All versucht alle Sessions und meldet aggregierte Fehler.

**Prüfung:** Unkooperativer Kindprozess, Close-Fehler und mehrere laufende Sessions.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-08"></a>

## RUN-08 · Replay, Deduplizierung und Lückenerkennung durchziehen

**Problem und Ziel:** Sequenznummern auch im Claude-Pfad nutzen und Ereignislücken nach Reconnect erkennen.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-07, RUN-05

**Akzeptanzkriterien:**

- [ ] Replay derselben EventId verändert Text, Usage und Approvals nur einmal; Lücken lösen Snapshot-/Resync-Verhalten aus.
- [ ] Reconnect sendet keinen bereits angenommenen Prompt oder Tool-Reply automatisch erneut; Sendestatus unklar wird ausdrücklich angezeigt.

**Prüfung:** Disconnect unmittelbar nach Send und vor Ack sowie wiederholter und lückenhafter Replay.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-09"></a>

## RUN-09 · Headless- und Mehrclient-Sessionbesitz definieren

**Problem und Ziel:** Desktop, Browser und Mobile an dieselbe authoritative Session anbinden.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P0  
**Herkunft:** Architektur-Erweiterung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-08, RUN-08

**Akzeptanzkriterien:**

- [ ] Runtime und In-App-Tools funktionieren auf dem Host ohne offenes Chatfenster; Clients abonnieren Zustände und reichen Commands ein.
- [ ] Disconnect eines Clients stoppt keinen fremden Turn; nur autorisierte Clients dürfen Antworten oder Stop senden.

**Prüfung:** Desktop schließen, Turn remote verfolgen und Approval einmalig vom zweiten Client beantworten.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="RUN-10"></a>

## RUN-10 · Idle-Reaper, Limits und Backpressure einführen

**Problem und Ziel:** Prozesszahl, Speicherverbrauch und Hintergrundlast bei vielen Threads begrenzen.

**Bereich:** /agents · Prozesse, Transport und Wiederverbindung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-07, RUN-09

**Akzeptanzkriterien:**

- [ ] Idle-Sessions werden mit Resume-Cursor geschlossen; aktive Turns und offene Rückfragen sind vor Reaping geschützt.
- [ ] Konfigurierbare Prozess-/Queue-Limits liefern Wartestatus; ein lauter Thread verdrängt keine Approval- oder Exit-Events.

**Prüfung:** Lastlauf mit 20 Fake-Sessions, Burst-Ausgabe und einer offenen Frage.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src/lib/agents/transport.ts`, `src/lib/agents/rpc-client.ts`, `src/lib/agents/providers/claude/client.ts`, `src-tauri/src/server/dispatch/agents.rs`

**Referenz und Übernahmebasis:** [ClaudeExecutable.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionReaper.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionReaper.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
