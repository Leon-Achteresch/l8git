# Bestandsanalyse und Übernahmebasis

[Übersicht](README.md) · Stand 2026-09-09 · Quellabgleich, keine Laufzeitabnahme.

## l8git ist keine Neuimplementierung ab null

Die bestehende [Moduldokumentation](../../../src/lib/agents/README.md) beschreibt vier Chat-Provider und zwei zusätzliche Terminal-Einträge. Der gelesene Code bestätigt bereits Claude-Initialisierung, Modelle, Approval-/Frage-/Plan-Flows, native History, Resume/Fork, Attachments, Compact, MCP, Skills/Hooks/Plugins, Hintergrundaufgaben, Usage und Worktree-Reviews. Deshalb sind entsprechende Tickets Ausbau-, Normalisierungs- und Abnahmetickets. Es wäre falsch, all diese Funktionen als vollständig fehlend einzuplanen.

| Beobachtung im gelesenen Arbeitsbaum | Auswirkung auf den Plan | Tickets |
| --- | --- | --- |
| Zwei `AGENT_PROVIDERS`-Listen in `provider-registry.ts` und `provider-meta.ts`, geschlossene NativeAgentProvider-Union und if-Kette in `active-chat-store.ts`. | Registrierung und Fähigkeiten haben mehrere Änderungsstellen; unbekannter Provider kann über Defaultpfad auf Codex fallen. | [PROV-02](01-prov.md#PROV-02), [PROV-04](01-prov.md#PROV-04), [PROV-06](01-prov.md#PROV-06) |
| `AgentChatState` kommt aus dem Codex-Chatstore und wird von den anderen Providern erfüllt. | Gemeinsamer Vertrag sollte unabhängig von einer spezifischen Implementierung entstehen. | [PROV-03](01-prov.md#PROV-03), [PROV-08](01-prov.md#PROV-08), [PROV-10](01-prov.md#PROV-10) |
| `provider_process` enthält CLI-spezifische Startzweige; Claude startet direkt mit stream-json- und Control-Flags. | Rust-Prozesshoheit erhalten; Protokollunterstützung prüfen, bevor SDK-Aufrufe übernommen werden. | [PROV-01](01-prov.md#PROV-01), [RUN-01](02-run.md#RUN-01), [RUN-03](02-run.md#RUN-03) |
| `ClaudeClient.request` legt Promises in einer Map ohne eigenen Timeout ab; `close()` schließt den Transport, löst aber diese Map nicht selbst auf. | Close-/Exit-/Timeout-Races gezielt mit Tests absichern. Kein Nachweis eines bereits beobachteten Nutzerfehlers. | [RUN-05](02-run.md#RUN-05), [RUN-07](02-run.md#RUN-07) |
| `handleClaudeMessage` behandelt task/status/hook-Namen teilweise als `event.type`; `system` wird explizit für `init` geprüft. | Gegen tatsächliche CLI-Frames mit `system.subtype` testen; der t3code-Adapter behandelt diese Hülle explizit. | [EVT-01](05-evt.md#EVT-01), [EVT-10](05-evt.md#EVT-10), [TASK-01](11-task.md#TASK-01), [USE-03](09-use.md#USE-03) |
| `leavePlanMode` sendet den geänderten Modus an alle offenen Claude-Clients. | Einstellungsscope muss pro Thread/Instanz isoliert werden. | [ASK-02](06-ask.md#ASK-02), [PROV-05](01-prov.md#PROV-05) |
| Zahlreiche Capability-Reads nutzen Catch-Fallbacks auf leere Listen; einige gemeinsame Methoden sind leere Claude-Implementierungen. | Fehler, unsupported und erfolgreich leeres Ergebnis müssen auseinandergehalten werden. | [PROV-06](01-prov.md#PROV-06), [SEC-05](14-sec.md#SEC-05) |
| `/fast`, `/memories`, `/import` und `/usage` sind für Claude in CODEX_ONLY_COMMANDS gesperrt. | Für jedes Feature tatsächliche Native-/UI-Fähigkeit bestimmen; keine pauschale Freischaltung. | [MOD-04](08-mod.md#MOD-04), [USE-07](09-use.md#USE-07), [EXT-10](10-ext.md#EXT-10), [EXT-11](10-ext.md#EXT-11) |
| Claude-interne MCP-Anfragen werden im Frontend beantwortet; unbekanntes tools/call kann in einen allgemeinen Renderer-Ack fallen. | Hostseitige Tool-Registry und korrekte Unknown-Tool-Fehler planen. | [EXT-07](10-ext.md#EXT-07), [SEC-05](14-sec.md#SEC-05), [RUN-09](02-run.md#RUN-09) |
| `transport.ts` liefert Sequenzen, der ClaudeClient-Handler verarbeitet jedoch nur die Nachricht. | Idempotenz und Reconnect-Semantik auch im Claude-Pfad ausdrücklich nachweisen. | [RUN-08](02-run.md#RUN-08), [USE-01](09-use.md#USE-01), [ASK-08](06-ask.md#ASK-08) |
| `result`-Verarbeitung nutzt überwiegend is_error/subtype; t3code prüft zusätzlich terminal_reason und vorherige Fehlerbelege. | Abbruch, falscher Erfolg und Überschreiben der echten Fehlerursache als eigene Regressionen erfassen. | [EVT-11](05-evt.md#EVT-11), [USE-06](09-use.md#USE-06), [USE-08](09-use.md#USE-08) |
| Viele Agent-UI-Dateien sind lokal geändert, einschließlich neuer Kontext-/Frage-/Schrittkomponenten. | UI-Bestand vor Umsetzung erneut prüfen; diese Tickets sind keine Aufforderung zum Überschreiben laufender Arbeit. | [CHAT-12](04-chat.md#CHAT-12), [EVT-09](05-evt.md#EVT-09), [USE-02](09-use.md#USE-02) |

## Was konkret aus t3code übernommen werden soll

| Referenz | Übernahmeprinzip | Anpassung für l8git |
| --- | --- | --- |
| [ProviderDriver](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts) und [ProviderInstance](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts) | Treiber und konfigurierte Instanzen getrennt, unabhängige Lebenszyklen und Continuation-Identität. | Neutrale TS-/Rust-Verträge statt flächendeckender Effect-Einführung. |
| [ProviderAdapter](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts) | Session-/Turn-Operationen, Events und begrenzte optionale Fähigkeiten am Adapterrand. | Bestehende l8git-Features wie Capability-Studio und native History zusätzlich aufnehmen. |
| [ClaudeAdapter](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts) und [Tests](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts) | Reihenfolge-/Duplikatbehandlung, Control-/Question-Semantik, Task-Linkage, Fehler- und Usage-Normalisierung. | SDK-Funktion und JSONL-Control-Frame sind nicht automatisch austauschbar; tatsächlichen Wire-Support belegen. |
| [ClaudeHome](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts) | Konfigurationspfad und Resume-/Accountidentität gemeinsam behandeln. | Alle vorhandenen Rust-History-/Auth-/Usage-Zugriffe ebenfalls instanzfähig machen. |
| [ClaudeSkills](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts) und [Dispatch](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts) | Native Skill-Quellen, Overrides, manuelle Invocation und Blockreihenfolge. | Capability-Studio erhalten und mit tatsächlichem CLI-Verhalten abgleichen. |
| [ClaudeExecutable](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.ts) | Plattformgerechte Executable-/Shim-Auflösung. | Rust-Launcher berücksichtigen; SDK-spezifische Node-Beschränkungen nicht blind übernehmen. |
| [Provider constraints](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md) | Probes ohne Setup-Nebeneffekte, wahrheitsgemäße Capabilities, Account- und Attachmentgrenzen. | Bestehende Repo-Trust-/Server-Autorisierungsregeln weiterverwenden. |

## Bewusst keine behauptete 1:1-Parität

- t3code konsumiert `prompt_suggestion` ohne UI. Das geplante Vorschlags-UI ist l8git-Ausbau.
- Im referenzierten Adapter kürzt `rollbackThread` zunächst den In-Memory-Verlauf und aktualisiert den Resume-Cursor. Das beweist keinen allgemeinen atomaren Datei- und Konversations-Restore. [HIST-05](07-hist.md#HIST-05) und [GIT-03](12-git.md#GIT-03) verlangen getrennte Nachweise.
- MCP-/Hook-/Plugin-Verwaltung ist in l8git bereits breiter als ein einfacher Runtime-Adapter. Die vorhandenen Funktionen sollen erhalten und in das Pattern eingepasst werden.
- Neue Cloud-, Daemon-, Channel-, Advisor- oder Infrastrukturflächen im Epic CLI sind Versionsprüfungen und optionale Integrationspfade innerhalb des gewünschten Vollumfangs. Ihr Vorhandensein in einer Referenz oder Dokumentation beweist keinen getesteten l8git-Support.
- t3code dokumentiert einzelne Mobile-Unterschiede. Die Tickets verlangen eine explizite Plattformmatrix, statt jede Desktop-Aktion still auf Mobile zu versprechen.

## Referenz und Lizenz

Der untersuchte Commit ist `6c583620ff7ad3235b135af7107c0543467eecfa`. [LICENSE](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/LICENSE) enthält den MIT-Lizenztext von T3 Tools Inc. [QA-06](15-qa.md#QA-06) erfasst die Herkunft und erforderlichen Hinweise für tatsächliche Codeübernahmen. Das vorliegende Paket enthält Tickettexte und Quellverweise, keinen kopierten produktiven Adaptercode.
