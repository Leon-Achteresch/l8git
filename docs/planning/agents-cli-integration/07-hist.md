# HIST · History, Resume, Fork und Kontext-Checkpoints

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="HIST-01"></a>

## HIST-01 · Native Claude-History pro Instanz einlesen

**Problem und Ziel:** Bestehende CLI-Unterhaltungen inklusive externer Änderungen zuverlässig anzeigen.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-03, PROV-09

**Akzeptanzkriterien:**

- [ ] Scan berücksichtigt effektives Config-Verzeichnis und CWD; Titel, Zeiten und SessionId werden robust aus nativen Daten gelesen.
- [ ] Große History lädt seitenweise bzw. begrenzt; kaputte letzte JSONL-Zeile sperrt keine gesunden Sessions und Fehler werden angezeigt.

**Prüfung:** Tausende Sessions, beschädigte Datei und außerhalb l8git erzeugter neuer Turn.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="HIST-02"></a>

## HIST-02 · Resume-Cursor dauerhaft und atomar persistieren

**Problem und Ziel:** Nach App-/Host-Neustart dieselbe native Unterhaltung weiterführen.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** HIST-01, RUN-08

**Akzeptanzkriterien:**

- [ ] Persistiert werden Instanz, Config-Identität, native SessionId und ausschließlich belegte Resume-/Checkpoint-Daten.
- [ ] Gewöhnliches Resume setzt keinen veralteten resumeSessionAt-Cursor; ein Cursor wird nur für explizites Zurücksetzen verwendet.

**Prüfung:** Neustart nach Turnabschluss und Resume-Hook mit aktualisierter SessionId.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="HIST-03"></a>

## HIST-03 · Fehlende oder inkompatible Resume-Sessions behandeln

**Problem und Ziel:** Historyverlust und versehentlichen neuen Chat bei Resume-Fehlern vermeiden.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** HIST-02, RUN-03

**Akzeptanzkriterien:**

- [ ] Fehlende native Datei, andere Config-Identität und nicht mehr unterstützte Version liefern konkrete Wiederherstellungsoptionen.
- [ ] Neuer Thread oder Providerwechsel passiert nur nach bewusster Auswahl; bisheriger Chat bleibt lesbar.

**Prüfung:** Gelöschte native Session, geändertes Config-Verzeichnis und CLI-Downgrade.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="HIST-04"></a>

## HIST-04 · Fork ab gewähltem Gesprächspunkt unterstützen

**Problem und Ziel:** Bestehenden Fork-Ansatz um nachvollziehbare Abstammung und Checkpoints erweitern.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** HIST-02, PROV-06

**Akzeptanzkriterien:**

- [ ] Neuer Thread erhält eigene ID und Parent-/Checkpoint-Bezug; Originalthread und dessen Session bleiben unverändert.
- [ ] Verfügbare native Fork-/Resume-at-Operationen werden geprüft; unsupported wird nicht durch Kopieren sichtbaren Texts als vollständiger Fork ausgegeben.

**Prüfung:** Fork nach Toolturn, erneuter Start beider Threads und ungültiger Checkpoint.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="HIST-05"></a>

## HIST-05 · Gesprächs-Rollback getrennt von Datei-Restore implementieren

**Problem und Ziel:** N Turns bzw. einen Checkpoint zurücksetzen, ohne Dateizustand zu verwechseln.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** HIST-04, GIT-03

**Akzeptanzkriterien:**

- [ ] Adapter bestätigt, ob native Unterhaltung zurückgesetzt werden kann; Snapshot und Resume-Cursor passen anschließend zusammen.
- [ ] Datei-Restore wird separat ausgewählt; fehlende Conversation-Rollback-Capability verhindert kombinierte Aktionen vor jeder Dateiänderung.

**Prüfung:** Rollback mit Toolturns, fehlender Fähigkeit und anschließendem Resume.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="HIST-06"></a>

## HIST-06 · Transkript-Persistenz und Export-Schemata versionieren

**Problem und Ziel:** Kanonischen Chatverlauf einschließlich Tools, Fragen, Plänen und Attachments dauerhaft lesbar halten.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-07, HIST-01, RUN-08

**Akzeptanzkriterien:**

- [ ] Speicherung trennt Anwendungsevents und native History; klare Source-of-Truth-Regeln verhindern doppelte User-/Assistant-Nachrichten.
- [ ] Migration und begrenzter Replay sind definiert; ältere Schemas werden gelesen oder mit konkreter Upgrade-Anforderung abgewiesen.

**Prüfung:** Alter Text-only-Thread, neuer Dateianhang und Crash während Persistierung.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="HIST-07"></a>

## HIST-07 · Temporäre Sessions und gezielte Datenlöschung unterstützen

**Problem und Ziel:** Persistenzfreie Hilfssessions und bewusstes Löschen eigener Daten definieren.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P2  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** HIST-06, RUN-07

**Akzeptanzkriterien:**

- [ ] no-session-persistence wird nur angeboten, wenn unterstützt; temporäre Turns tauchen nicht unbeabsichtigt im Katalog auf.
- [ ] Löschung zeigt betroffene History, Anhänge und App-Metadaten; laufende Prozesse werden vorher beendet und unbeteiligte native Dateien bleiben erhalten.

**Prüfung:** Temporäre Session, Neustart sowie Löschfehler bei offener Datei.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="HIST-08"></a>

## HIST-08 · Externe Sessionänderungen und parallele Besitzer erkennen

**Problem und Ziel:** Gleichzeitige Arbeit in nativer CLI und l8git ohne stilles Überschreiben behandeln.

**Bereich:** /agents · History, Resume, Fork und Kontext-Checkpoints  
**Priorität:** P1  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** HIST-02, HIST-06

**Akzeptanzkriterien:**

- [ ] Externe neue Turns werden nachgeladen; konkurrierende Schreib-/Resume-Nutzung wird erkannt, soweit das native Protokoll dies erlaubt.
- [ ] Bei nicht sicher auflösbarer Konkurrenz wird Session read-only oder bewusst neu übernommen; keine unbelegte Behauptung exklusiven Besitzes.

**Prüfung:** Native History während offener l8git-Ansicht ändern und Resume-Konflikt simulieren.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src/lib/agents/session-catalog.ts`, `src/lib/agents/thread-refresh.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/storage-keys.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [ProviderSessionRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/persistence/ProviderSessionRuntime.ts), [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
