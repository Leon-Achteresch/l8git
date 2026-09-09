# EVT · Streaming, Tools und vollständige Ereignisabbildung

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="EVT-01"></a>

## EVT-01 · Claude-Rohereignisse zentral normalisieren

**Problem und Ziel:** Top-Level-Frames und system.subtype vor Store-Verarbeitung in kanonische Events übersetzen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-07, RUN-06

**Akzeptanzkriterien:**

- [ ] system/task_started, task_progress, task_updated, task_notification, status und Hooks erreichen dieselben fachlichen Handler wie kompatible ältere Formen.
- [ ] Jede im Referenzadapter behandelte Eventfamilie hat Mapping, bewusstes Ignore oder Versions-Ticket; unbekannte Kontrollanfragen werden nie pauschal als Erfolg beantwortet.

**Prüfung:** Referenz-Fixtures im tatsächlichen system-Envelope statt nur synthetischer Top-Level-Events.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-02"></a>

## EVT-02 · Text-Deltas und Assistant-Snapshots ohne Duplikate zusammenführen

**Problem und Ziel:** Token-Streaming mit finalen Assistant-Frames konsistent halten.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01

**Akzeptanzkriterien:**

- [ ] Text erscheint genau einmal, unabhängig davon, ob Snapshot vor oder nach Deltas kommt; fehlende Deltas nutzen Snapshot-Text.
- [ ] Wiederverwendete Block-Indizes erhalten neue Message-Identität; Text vor und nach Tool-Aufruf behält die Reihenfolge.

**Prüfung:** Permutationen aus Snapshot, Delta, Tool und result mit wiederverwendetem Index.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-03"></a>

## EVT-03 · Provider-gelieferte Thinking-Blöcke darstellen

**Problem und Ziel:** Verfügbare Reasoning-Ausgabe getrennt vom normalen Text anzeigen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-02

**Akzeptanzkriterien:**

- [ ] Nur tatsächlich gelieferte Thinking-Inhalte werden gerendert; Start, Teiltext und Ende sind zuordenbar und einklappbar.
- [ ] Opaque Signaturen und redacted-thinking-Payloads werden nicht als lesbarer Gedankentext ausgegeben; Export beachtet dieselbe Regel.

**Prüfung:** Thinking-Deltas, redigierter Block und nicht unterstützendes Modell.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-04"></a>

## EVT-04 · Partielle Tool-Argumente zuverlässig rekonstruieren

**Problem und Ziel:** input_json_delta ohne vorzeitiges Parse-Versagen in kanonische Tool-Aufrufe überführen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01

**Akzeptanzkriterien:**

- [ ] Unvollständiges JSON zeigt Streamingstatus; finaler Tool-Input ersetzt die Vorschau und aktualisiert abgeleitete Diff-/Question-/Plan-Daten.
- [ ] Parallele Tool-Blöcke werden per ToolUseId und Block-Identität isoliert; fehlerhaftes finales JSON wird sichtbar.

**Prüfung:** Verschachtelte JSON-Fragmente mit Escapes und zwei gleichzeitig laufenden Tools.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-05"></a>

## EVT-05 · Tool-Ergebnisse, Fortschritt und Fehler vollständig zeigen

**Problem und Ziel:** Resultate stabil mit Ursprungstool und Turn verknüpfen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-04

**Akzeptanzkriterien:**

- [ ] Text-, Bild- und strukturierte Ergebnisse sowie is_error werden unterschieden; elapsed/progress und Zusammenfassungen aktualisieren dieselbe Karte.
- [ ] Verspätetes oder doppeltes tool_result erzeugt keine fremde Karte; große Ausgaben sind begrenzt darstellbar und vollständig abrufbar, soweit gespeichert.

**Prüfung:** Toolresult vor finalem Assistant-Frame, doppeltes Resultat und mehrteiliger Inhalt.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-06"></a>

## EVT-06 · Bash- und Terminal-Ausführung mit Statusdetails rendern

**Problem und Ziel:** Befehle, CWD, Ausgabe, Exit und Hintergrundbetrieb nachvollziehbar anzeigen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-05

**Akzeptanzkriterien:**

- [ ] Command und Argumente werden als Daten gerendert; stdout/stderr, Laufzeit und Exitcode bleiben unterscheidbar.
- [ ] Abbruch, Fehler und detached Hintergrundprozess haben eigene Status; Kopieren führt nichts aus.

**Prüfung:** Erfolgreicher, fehlerhafter und abgebrochener Bash-Aufruf mit ANSI-Ausgabe.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-07"></a>

## EVT-07 · Dateiänderungen einschließlich Notebook-Edits normalisieren

**Problem und Ziel:** Write, Edit, MultiEdit und NotebookEdit präzise in Dateikarten abbilden.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-04

**Akzeptanzkriterien:**

- [ ] Pfad, Operation und Vorschau werden nach finalem Input aktualisiert; mehrere Änderungen derselben Datei bleiben nachvollziehbar.
- [ ] Tool-Input gilt nicht als Beweis einer tatsächlichen Änderung; Git-/Filesystem-Diff liefert den finalen Stand.

**Prüfung:** Fehlgeschlagenes Edit, mehrere Hunks, neue Datei und Notebook-Zelle.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-08"></a>

## EVT-08 · Read, Suche, Web und Bildansicht differenziert darstellen

**Problem und Ziel:** Lesende Tools mit passenden Ergebniskarten statt pauschalem Command-Status zeigen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-05, SEC-06

**Akzeptanzkriterien:**

- [ ] Read, Glob, Grep, WebSearch und WebFetch behalten Such-/Datei-/URL-Kontext und Toolresultat.
- [ ] Bildansicht wird nur bei belegtem Bildinhalt bzw. eindeutigem Bild-Read aktiviert; ausführbare HTML-Ausgaben werden nicht injiziert.

**Prüfung:** Textdatei mit irreführendem Namen, echter Bild-Read und Web-Ergebnis mit unsicherem Link.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-09"></a>

## EVT-09 · TodoWrite und Task-Abhängigkeiten als Schritteliste abbilden

**Problem und Ziel:** Plan-/Taskfortschritt einschließlich Statusänderungen und Blockern zeigen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01

**Akzeptanzkriterien:**

- [ ] TodoWrite sowie unterstützte TaskCreate/TaskUpdate/TaskList-Ereignisse werden stabilen Schritten zugeordnet; leerer Titel erhält einen sinnvollen Fallback.
- [ ] Ersetzen einer Liste, blockedBy und abgeschlossene Schritte funktionieren ohne doppelte Einträge.

**Prüfung:** Leerer Todo-Text, ersetzte Liste und zyklische/fehlende Task-Referenz.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-10"></a>

## EVT-10 · Hook-Lebenszyklus und CLI-Mitteilungen zuordnen

**Problem und Ziel:** Hook-Start, Fortschritt, Antwort und nützliche Systemnachrichten sichtbar machen.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01

**Akzeptanzkriterien:**

- [ ] Hookstatus nutzt stabile Identität, Eventname, Dauer und Erfolg/Fehler; system-Envelope wird korrekt gelesen.
- [ ] Interne Command-/Memory-/Plugin-/Worker-Mitteilungen werden gezielt verarbeitet oder still ignoriert; Warnungen wie permission_denied bleiben sichtbar.

**Prüfung:** hook_started/progress/response, unbekannte Info und echte Permission-Warnung.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-11"></a>

## EVT-11 · Terminale Ergebnisse und Fehlerursachen korrekt priorisieren

**Problem und Ziel:** is_error, subtype und terminal_reason gemeinsam auswerten.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01, CHAT-03

**Akzeptanzkriterien:**

- [ ] Aborted tools/streaming werden interrupted; Auth, Modell, Bild, Budget, Promptlänge, strukturierte Ausgabe und Overload werden unterscheidbar failed.
- [ ] Ein result ohne aktiven Turn erzeugt keinen Abschluss; spätere harmlose Frames überschreiben keine belegte terminale Fehlerursache.

**Prüfung:** Referenzfälle für success plus 529, expired auth, unknown terminal_reason und result ohne Turn.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EVT-12"></a>

## EVT-12 · Streaming-Rendering unter Last stabil halten

**Problem und Ziel:** Bestehendes Batching, Virtualisierung und Scrollverhalten auf kanonische Events ausrichten.

**Bereich:** /agents · Streaming, Tools und vollständige Ereignisabbildung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-02, EVT-05, RUN-10

**Akzeptanzkriterien:**

- [ ] Batches werden vor finalen Frames geleert; manuelles Hochscrollen bleibt stabil und Auto-Follow kehrt nur bewusst zurück.
- [ ] Große Transkripte bleiben bedienbar; Approval-/Stop-Aktionen sind während eines Output-Bursts erreichbar.

**Prüfung:** Vergleichsmessung mit 10000 Transcript-Zeilen und Burst-Fixture auf dokumentierter Hardware.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/types.ts`, `src/lib/agents/transcript-rows.ts`, `src/lib/agents/plugins/content.ts`, `src/components/agents/run/agent-run-detail.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts), [ProviderRuntimeIngestion.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
