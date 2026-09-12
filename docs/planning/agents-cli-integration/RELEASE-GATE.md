# RELEASE-GATE — QA-08 Abschlussgate

Vollständigkeitsübersicht aller 154 Ticket-IDs aus `docs/planning/agents-cli-integration/tickets.json` (Referenzcommit siehe dort). Status ist eine Heuristik: Existenz und Inhalt von Tests unter `src/lib/agents/__tests__` (Dateiname bzw. Ticket-ID im Dateiinhalt) dienen als Indiz, kein Abnahmebeleg.

- **implementiert (verdrahtet)**: eine Testdatei ist nach der Ticket-ID benannt (z. B. `ask-06-elicitation.test.ts` für ASK-06).
- **implementiert (Baustein)**: die Ticket-ID taucht im Inhalt einer Testdatei auf, aber keine Datei trägt die ID im Namen.
- **prüfen**: keine direkte Namens-/Inhaltsübereinstimmung, aber Testdateien mit demselben Epic-Präfix existieren — Zuordnung unsicher, manuell verifizieren.
- **offen**: keine Testdatei mit Bezug zur Ticket-ID oder zum Epic-Präfix gefunden.

## Zusammenfassung

| Status | Anzahl |
|---|---|
| implementiert (verdrahtet) | 43 |
| implementiert (Baustein) | 24 |
| prüfen | 47 |
| offen | 40 |
| **Gesamt** | **154** |

**Wichtig:** P2-Tickets sind Teil des gewünschten Vollumfangs und dürfen nicht als stillschweigend gestrichen gelten. „offen“ und „prüfen“ Einträge sind entsprechend offene Lücken bzw. Klärungsbedarf, keine akzeptierten Auslassungen.

## Tickets

| ID | Titel | Status | Testbeleg (Heuristik) |
|---|---|---|---|
| PROV-01 | [PROV-01] Übernahmeentscheidung CLI-Protokoll versus Agent SDK dokumentieren | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-02 | [PROV-02] DriverKind, InstanceId, ThreadId und native SessionId trennen | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-03 | [PROV-03] Gemeinsamen AgentProviderAdapter definieren | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-04 | [PROV-04] Eine Driver-Registry statt paralleler Provider-Listen | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-05 | [PROV-05] Provider-Instanzen mit eigener Konfiguration verwalten | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-06 | [PROV-06] Capability-Vertrag mit Gründen und Versionsgrenzen | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-07 | [PROV-07] Kanonische Commands und Runtime-Events versionieren | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-08 | [PROV-08] Gemeinsamen Session-Orchestrator und Projektionen aufbauen | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-09 | [PROV-09] Bestehende Daten auf Standardinstanzen migrieren | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-10 | [PROV-10] Bestehende vier Adapter schrittweise hinter die Registry migrieren | implementiert (Baustein) | `migration-regression.test.ts`, `prov-adapter-migration.test.ts` |
| PROV-11 | [PROV-11] Neutralen Erweiterungstest mit fünftem Test-Treiber liefern | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| PROV-12 | [PROV-12] Provider-SPI und Portierungsleitfaden dokumentieren | prüfen | `prov-adapter-contract.test.ts`, `prov-adapter-migration.test.ts`, `prov-capabilities.test.ts`, `prov-events.test.ts` (+3) |
| RUN-01 | [RUN-01] Backend-Prozessfabriken pro Treiber registrieren | offen | — |
| RUN-02 | [RUN-02] Claude-Binary zuverlässig auf allen Desktop-Plattformen auflösen | offen | — |
| RUN-03 | [RUN-03] CLI-Version und Protokoll-Kompatibilität prüfen | offen | — |
| RUN-04 | [RUN-04] Initialize-Handshake und Readiness absichern | offen | — |
| RUN-05 | [RUN-05] Control-Requests mit Timeout, Cancellation und Cleanup versehen | offen | — |
| RUN-06 | [RUN-06] JSONL-Framing und begrenzte Puffer robust machen | offen | — |
| RUN-07 | [RUN-07] Graceful Stop und Prozessbaum-Cleanup implementieren | offen | — |
| RUN-08 | [RUN-08] Replay, Deduplizierung und Lückenerkennung durchziehen | offen | — |
| RUN-09 | [RUN-09] Headless- und Mehrclient-Sessionbesitz definieren | offen | — |
| RUN-10 | [RUN-10] Idle-Reaper, Limits und Backpressure einführen | offen | — |
| SET-01 | [SET-01] Provider-Einrichtung mit eindeutigem Readiness-Status | offen | — |
| SET-02 | [SET-02] Claude-Login und Logout instanzgebunden ausführen | offen | — |
| SET-03 | [SET-03] CLAUDE_CONFIG_DIR und Account-Isolation unterstützen | offen | — |
| SET-04 | [SET-04] Instanz-Umgebungsvariablen mit Secret-Verweisen speichern | offen | — |
| SET-05 | [SET-05] Binary, Startoptionen und wirksame Settings bearbeiten | offen | — |
| SET-06 | [SET-06] Router und Cloud-Backends als Claude-Presets abbilden | offen | — |
| SET-07 | [SET-07] CLI-Update nur über nachgewiesenen Installationsbesitzer | offen | — |
| SET-08 | [SET-08] Diagnosebericht und Support-Export redigieren | offen | — |
| CHAT-01 | [CHAT-01] Neue Threads eindeutig an Repo und Provider-Instanz binden | implementiert (verdrahtet) | `chat-10.test.ts` |
| CHAT-02 | [CHAT-02] Laufenden Turn gezielt steuern oder Nachricht einreihen | implementiert (verdrahtet) | `chat-02-steer-queue.test.ts` |
| CHAT-03 | [CHAT-03] Abbrechen und nach Abbruch fortsetzen | implementiert (verdrahtet) | `chat-03-resume.test.ts` |
| CHAT-04 | [CHAT-04] Entwürfe pro Host, Instanz und Thread erhalten | prüfen | `chat-02-steer-queue.test.ts`, `chat-03-resume.test.ts`, `chat-08-route-slash-command.test.ts`, `chat-09-suggestions.test.ts` (+1) |
| CHAT-05 | [CHAT-05] Datei-, Ordner- und Codebereich-Erwähnungen anschließen | prüfen | `chat-02-steer-queue.test.ts`, `chat-03-resume.test.ts`, `chat-08-route-slash-command.test.ts`, `chat-09-suggestions.test.ts` (+1) |
| CHAT-06 | [CHAT-06] Bilder über Datei, Einfügen und Drag-and-drop senden | implementiert (Baustein) | `composer-attachments-tickets.test.ts` |
| CHAT-07 | [CHAT-07] Allgemeine Datei- und Dokumentanhänge einführen | implementiert (Baustein) | `composer-attachments-tickets.test.ts` |
| CHAT-08 | [CHAT-08] CLI-Befehle und App-Slash-Commands eindeutig routen | implementiert (verdrahtet) | `chat-08-route-slash-command.test.ts` |
| CHAT-09 | [CHAT-09] Prompt-Vorschläge und Folgeaktionen darstellen | implementiert (verdrahtet) | `chat-09-suggestions.test.ts` |
| CHAT-10 | [CHAT-10] Thread-Liste mit Suche, Pins, Archiv und Titel vervollständigen | implementiert (verdrahtet) | `chat-10.test.ts` |
| CHAT-11 | [CHAT-11] Nachrichten kopieren, exportieren und gezielt erneut senden | prüfen | `chat-02-steer-queue.test.ts`, `chat-03-resume.test.ts`, `chat-08-route-slash-command.test.ts`, `chat-09-suggestions.test.ts` (+1) |
| CHAT-12 | [CHAT-12] Tastatur, Fokus, Sprache und Zugänglichkeit abschließen | prüfen | `chat-02-steer-queue.test.ts`, `chat-03-resume.test.ts`, `chat-08-route-slash-command.test.ts`, `chat-09-suggestions.test.ts` (+1) |
| EVT-01 | [EVT-01] Claude-Rohereignisse zentral normalisieren | implementiert (verdrahtet) | `evt-11-result-classification.test.ts` |
| EVT-02 | [EVT-02] Text-Deltas und Assistant-Snapshots ohne Duplikate zusammenführen | prüfen | `evt-11-result-classification.test.ts` |
| EVT-03 | [EVT-03] Provider-gelieferte Thinking-Blöcke darstellen | implementiert (Baustein) | `thinking-blocks.test.ts` |
| EVT-04 | [EVT-04] Partielle Tool-Argumente zuverlässig rekonstruieren | prüfen | `evt-11-result-classification.test.ts` |
| EVT-05 | [EVT-05] Tool-Ergebnisse, Fortschritt und Fehler vollständig zeigen | implementiert (Baustein) | `claude-tool-events.test.ts` |
| EVT-06 | [EVT-06] Bash- und Terminal-Ausführung mit Statusdetails rendern | implementiert (Baustein) | `bash-tool-status.test.ts` |
| EVT-07 | [EVT-07] Dateiänderungen einschließlich Notebook-Edits normalisieren | implementiert (Baustein) | `claude-tool-events.test.ts` |
| EVT-08 | [EVT-08] Read, Suche, Web und Bildansicht differenziert darstellen | implementiert (Baustein) | `tool-result-labels.test.ts` |
| EVT-09 | [EVT-09] TodoWrite und Task-Abhängigkeiten als Schritteliste abbilden | implementiert (Baustein) | `claude-tool-events.test.ts` |
| EVT-10 | [EVT-10] Hook-Lebenszyklus und CLI-Mitteilungen zuordnen | implementiert (Baustein) | `claude-tool-events.test.ts` |
| EVT-11 | [EVT-11] Terminale Ergebnisse und Fehlerursachen korrekt priorisieren | implementiert (verdrahtet) | `evt-11-result-classification.test.ts` |
| EVT-12 | [EVT-12] Streaming-Rendering unter Last stabil halten | prüfen | `evt-11-result-classification.test.ts` |
| ASK-01 | [ASK-01] Claude-Permission-Modi ohne falsche Sandbox-Zusage abbilden | implementiert (Baustein) | `claude-tool-events.test.ts` |
| ASK-02 | [ASK-02] Modell- und Permission-Änderungen auf betroffene Session begrenzen | implementiert (verdrahtet) | `claude-session-scoped-permissions.test.ts`, `task-02-subagent-model.test.ts` |
| ASK-03 | [ASK-03] Approve-once, Reject und Session-Freigabe abbilden | implementiert (Baustein) | `task-progress.test.ts` |
| ASK-04 | [ASK-04] Permission-Änderungen und zusätzliche Verzeichnisse bestätigen | implementiert (verdrahtet) | `task-04-status-patches.test.ts` |
| ASK-05 | [ASK-05] AskUserQuestion mit Einzelwahl, Mehrfachwahl und Freitext | implementiert (verdrahtet) | `task-05-workflow-grouping.test.ts` |
| ASK-06 | [ASK-06] MCP-Elicitation einschließlich Abbruch und URL-Flow | implementiert (verdrahtet) | `ask-06-elicitation.test.ts`, `task-06-subagent-usage.test.ts` |
| ASK-07 | [ASK-07] ExitPlanMode als Planentscheidung behandeln | implementiert (verdrahtet) | `task-07-background-stop.test.ts` |
| ASK-08 | [ASK-08] Offene Requests bei Abort, Exit und Reconnect auflösen | implementiert (Baustein) | `claude-session-scoped-permissions.test.ts` |
| ASK-09 | [ASK-09] Approval-Inbox und Aufmerksamkeitsnavigation anbieten | implementiert (verdrahtet) | `ask-09-pending-approvals.test.ts` |
| HIST-01 | [HIST-01] Native Claude-History pro Instanz einlesen | prüfen | `hist-05-rollback.test.ts` |
| HIST-02 | [HIST-02] Resume-Cursor dauerhaft und atomar persistieren | prüfen | `hist-05-rollback.test.ts` |
| HIST-03 | [HIST-03] Fehlende oder inkompatible Resume-Sessions behandeln | prüfen | `hist-05-rollback.test.ts` |
| HIST-04 | [HIST-04] Fork ab gewähltem Gesprächspunkt unterstützen | implementiert (Baustein) | `session-catalog.test.ts` |
| HIST-05 | [HIST-05] Gesprächs-Rollback getrennt von Datei-Restore implementieren | implementiert (verdrahtet) | `hist-05-rollback.test.ts` |
| HIST-06 | [HIST-06] Transkript-Persistenz und Export-Schemata versionieren | prüfen | `hist-05-rollback.test.ts` |
| HIST-07 | [HIST-07] Temporäre Sessions und gezielte Datenlöschung unterstützen | implementiert (Baustein) | `session-catalog.test.ts` |
| HIST-08 | [HIST-08] Externe Sessionänderungen und parallele Besitzer erkennen | prüfen | `hist-05-rollback.test.ts` |
| MOD-01 | [MOD-01] Dynamischen Modellkatalog pro Instanz bereitstellen | prüfen | `mod-04-fast-mode.test.ts`, `mod-05-model-alias.test.ts`, `mod-07-turn-budget.test.ts` |
| MOD-02 | [MOD-02] Modellwechsel in laufender Session korrekt anwenden | prüfen | `mod-04-fast-mode.test.ts`, `mod-05-model-alias.test.ts`, `mod-07-turn-budget.test.ts` |
| MOD-03 | [MOD-03] Effort, Thinking-Toggle und Thinking-Budget differenzieren | prüfen | `mod-04-fast-mode.test.ts`, `mod-05-model-alias.test.ts`, `mod-07-turn-budget.test.ts` |
| MOD-04 | [MOD-04] Claude-Fast-Modus capability-basiert freischalten | implementiert (verdrahtet) | `mod-04-fast-mode.test.ts` |
| MOD-05 | [MOD-05] Eigene Modell-IDs, Aliase und Fallbacks erhalten | implementiert (verdrahtet) | `mod-05-model-alias.test.ts` |
| MOD-06 | [MOD-06] System-Prompt, zusätzliche Regeln und Settings-Scope konfigurieren | prüfen | `mod-04-fast-mode.test.ts`, `mod-05-model-alias.test.ts`, `mod-07-turn-budget.test.ts` |
| MOD-07 | [MOD-07] Turn-Budget, Max-Turns und strukturierte Ausgabe anbieten | implementiert (verdrahtet) | `mod-07-turn-budget.test.ts` |
| USE-01 | [USE-01] Turn-Usage, Session-Summen und aktive Kontextgröße trennen | implementiert (verdrahtet) | `use-01-usage-ledger.test.ts` |
| USE-02 | [USE-02] Kontextanzeige aus autoritativen Usage-Daten ableiten | implementiert (verdrahtet) | `use-02-context-usage.test.ts` |
| USE-03 | [USE-03] Manuelle Kompaktierung mit Fortschritt anbieten | implementiert (verdrahtet) | `use-03-compact.test.ts` |
| USE-04 | [USE-04] Auto-Compact und Resume-Compact konfigurierbar machen | implementiert (verdrahtet) | `use-04-compact-settings.test.ts` |
| USE-05 | [USE-05] Kostenanzeige mit Herkunft und Instanzzuordnung ausbauen | implementiert (verdrahtet) | `use-05-cost-breakdown.test.ts` |
| USE-06 | [USE-06] Rate-Limit-Ereignisse mit Reset und Wartezustand darstellen | implementiert (verdrahtet) | `use-06-rate-limits.test.ts` |
| USE-07 | [USE-07] Subscription- und Overage-Limits instanzgebunden anzeigen | prüfen | `use-01-usage-ledger.test.ts`, `use-02-context-usage.test.ts`, `use-03-compact.test.ts`, `use-04-compact-settings.test.ts` (+3) |
| USE-08 | [USE-08] Retries und Wiederaufnahme ohne doppelte Arbeit behandeln | implementiert (verdrahtet) | `use-08-retry.test.ts` |
| EXT-01 | [EXT-01] Skill-Discovery mit Scope, Frontmatter und Overrides prüfen | offen | — |
| EXT-02 | [EXT-02] Skill-Auswahl und Dispatch einschließlich Anhängen korrigieren | implementiert (Baustein) | `composer-attachments-tickets.test.ts` |
| EXT-03 | [EXT-03] Skills und benutzerdefinierte Commands bearbeiten | offen | — |
| EXT-04 | [EXT-04] Custom Agents mit Modell, Tools und Scope verwalten | offen | — |
| EXT-05 | [EXT-05] MCP-Inventar, Verbindung und Toolkatalog anzeigen | offen | — |
| EXT-06 | [EXT-06] MCP-Konfiguration, OAuth und Reconnect vervollständigen | offen | — |
| EXT-07 | [EXT-07] l8git-MCP-Tools in hostseitige Tool-Registry überführen | offen | — |
| EXT-08 | [EXT-08] Hooks verwalten und Aktivierung nachvollziehbar machen | offen | — |
| EXT-09 | [EXT-09] Plugin- und Marketplace-Lebenszyklus vervollständigen | offen | — |
| EXT-10 | [EXT-10] CLAUDE.md, Rules und Memory kontextbezogen verwalten | offen | — |
| EXT-11 | [EXT-11] Capability-Sync und Import mit Vorschau erhalten | offen | — |
| EXT-12 | [EXT-12] Browser-, Chart- und Barcode-Addons vollständig erhalten | offen | — |
| EXT-13 | [EXT-13] MCP-Prompts, Resources und weitere Protokollflächen prüfen | offen | — |
| TASK-01 | [TASK-01] Subagent-Starts mit Elternbeziehung normalisieren | implementiert (Baustein) | `claude-tool-events.test.ts` |
| TASK-02 | [TASK-02] Subagent-Modell, Effort, Rolle und Titel korrekt anzeigen | implementiert (verdrahtet) | `task-02-subagent-model.test.ts` |
| TASK-03 | [TASK-03] Subagent-Fortschritt und Ausgabe getrennt darstellen | implementiert (Baustein) | `task-progress.test.ts` |
| TASK-04 | [TASK-04] Task-Statuspatches und Abschluss vollständig abbilden | implementiert (verdrahtet) | `task-04-status-patches.test.ts` |
| TASK-05 | [TASK-05] Workflow-Mitglieder, Phasen und Fanout darstellen | implementiert (verdrahtet) | `task-05-workflow-grouping.test.ts` |
| TASK-06 | [TASK-06] Subagent-Usage ohne doppelte Hauptturn-Kosten verbuchen | implementiert (verdrahtet) | `task-06-subagent-usage.test.ts` |
| TASK-07 | [TASK-07] Hintergrundaufgaben einzeln anzeigen und stoppen | implementiert (verdrahtet) | `task-07-background-stop.test.ts` |
| TASK-08 | [TASK-08] Native Background-Sessions und Agent-Teams auf Anschluss prüfen | prüfen | `task-02-subagent-model.test.ts`, `task-04-status-patches.test.ts`, `task-05-workflow-grouping.test.ts`, `task-06-subagent-usage.test.ts` (+2) |
| GIT-01 | [GIT-01] Worktree-Session mit korrektem CWD und Instanz starten | offen | — |
| GIT-02 | [GIT-02] Live-Diffs und Dateizähler mit echten Änderungen synchronisieren | offen | — |
| GIT-03 | [GIT-03] Datei-Checkpoints und gezielten Restore anbieten | offen | — |
| GIT-04 | [GIT-04] Review-Start und Findings an Thread und Diff binden | offen | — |
| GIT-05 | [GIT-05] Finish-Flow für Commit, Merge und Aufräumen erhalten | offen | — |
| GIT-06 | [GIT-06] CLI-Textgenerierung für Titel und Git-Texte kapseln | offen | — |
| UX-01 | [UX-01] Provider-/Instanzpicker und Settingsflächen vereinheitlichen | implementiert (verdrahtet) | `ux-01.test.ts` |
| UX-02 | [UX-02] Agent-Übersicht und Benachrichtigungen pro Instanz ableiten | prüfen | `ux-01.test.ts` |
| UX-03 | [UX-03] Remote-Protokoll um Instanzen und kanonische Events erweitern | prüfen | `ux-01.test.ts` |
| UX-04 | [UX-04] Mobile-Chat mit voller Claude-Funktionsparität absichern | prüfen | `ux-01.test.ts` |
| UX-05 | [UX-05] Offlinezustand und Snapshot-Aufholung verständlich machen | prüfen | `ux-01.test.ts` |
| UX-06 | [UX-06] Onboarding und Bedienungsdokumentation aktualisieren | prüfen | `ux-01.test.ts` |
| SEC-01 | [SEC-01] Repo-Trust und native Settings-Ausführung erhalten | offen | — |
| SEC-02 | [SEC-02] Pfad-, Repo- und Transportbesitz serverseitig prüfen | offen | — |
| SEC-03 | [SEC-03] Konfigurationsänderungen atomar und verlustfrei schreiben | offen | — |
| SEC-04 | [SEC-04] Sensitive Daten über Persistenz und Telemetrie redigieren | offen | — |
| SEC-05 | [SEC-05] Unbekannte Controls und nicht unterstützte Aktionen korrekt ablehnen | implementiert (verdrahtet) | `claude-provider-adapter-sec05.test.ts`, `rpc-client.test.ts` |
| SEC-06 | [SEC-06] Untrusted Chat-/Tool-Inhalte sicher rendern und exportieren | implementiert (Baustein) | `sanitize-content.test.ts` |
| QA-01 | [QA-01] Referenzinventar für jedes CLI-/Adapter-Feature pflegen | prüfen | `qa-05-stress.test.ts` |
| QA-02 | [QA-02] Sanitisierte Claude-Protokoll-Fixtures und Fake-CLI erstellen | prüfen | `qa-05-stress.test.ts` |
| QA-03 | [QA-03] Gemeinsame Provider-Konformität und Migrationsregression prüfen | implementiert (Baustein) | `migration-regression.test.ts` |
| QA-04 | [QA-04] Claude-End-to-End-Abnahme auf unterstützten Plattformen durchführen | prüfen | `qa-05-stress.test.ts` |
| QA-05 | [QA-05] Crash-, Race- und Performance-Abnahme durchführen | implementiert (verdrahtet) | `qa-05-stress.test.ts` |
| QA-06 | [QA-06] Upstream-Provenienz und Lizenzhinweise für Übernahmen dokumentieren | prüfen | `qa-05-stress.test.ts` |
| QA-07 | [QA-07] Gestufte Aktivierung und Rückfall auf vorhandene Adapter vorbereiten | prüfen | `qa-05-stress.test.ts` |
| QA-08 | [QA-08] Abschlussgate für vollständige Claude-Integration veröffentlichen | prüfen | `qa-05-stress.test.ts` |
| DETAIL-01 | [DETAIL-01] Gesendete Prompts mit Pfeiltasten wiederaufrufen | prüfen | `detail-09-search-threads.test.ts` |
| DETAIL-02 | [DETAIL-02] Prompt-Stash mit mehreren gespeicherten Entwürfen anbieten | prüfen | `detail-09-search-threads.test.ts` |
| DETAIL-03 | [DETAIL-03] Assistant-Ausschnitte zitieren und zur Quelle springen | prüfen | `detail-09-search-threads.test.ts` |
| DETAIL-04 | [DETAIL-04] Dateien direkt an Frageantworten anhängen | implementiert (Baustein) | `composer-attachments-tickets.test.ts` |
| DETAIL-05 | [DETAIL-05] Medien und erzeugte Dateien öffnen, speichern und teilen | implementiert (Baustein) | `composer-attachments-tickets.test.ts` |
| DETAIL-06 | [DETAIL-06] Screenshot-Kontext aus Desktop und Zwischenablage übernehmen | implementiert (Baustein) | `composer-attachments-tickets.test.ts` |
| DETAIL-07 | [DETAIL-07] Spracheingabe als bearbeitbaren Prompt anbieten | prüfen | `detail-09-search-threads.test.ts` |
| DETAIL-08 | [DETAIL-08] Thread-Reihenfolge, Snooze und Settle synchronisieren | implementiert (Baustein) | `session-catalog-snooze.test.ts` |
| DETAIL-09 | [DETAIL-09] Threadsuche und Verweise über mehrere Hosts ergänzen | implementiert (verdrahtet) | `detail-09-search-threads.test.ts` |
| DETAIL-10 | [DETAIL-10] PR-Verknüpfung und Projektdefaults für Agentthreads übernehmen | prüfen | `detail-09-search-threads.test.ts` |
| DETAIL-11 | [DETAIL-11] Terminalausgabe als Promptkontext mitgeben | prüfen | `detail-09-search-threads.test.ts` |
| CLI-01 | [CLI-01] Vollständiges natives Command-/Flag-Inventar versionieren | implementiert (verdrahtet) | `cli-10-feedback.test.ts` |
| CLI-02 | [CLI-02] Native Terminalübergabe und Diagnosemodi integrieren | prüfen | `cli-03-native-integrations.test.ts`, `cli-04-channel-input.test.ts`, `cli-05-scheduled-tasks.test.ts`, `cli-06-session-origin.test.ts` (+7) |
| CLI-03 | [CLI-03] Native Chrome- und IDE-Anbindungen gezielt aktivieren | implementiert (verdrahtet) | `cli-03-native-integrations.test.ts` |
| CLI-04 | [CLI-04] MCP-Channels und asynchrone externe Eingaben anbinden | implementiert (verdrahtet) | `cli-04-channel-input.test.ts` |
| CLI-05 | [CLI-05] Wiederkehrende Aufgaben und native Automatisierungen erfassen | implementiert (verdrahtet) | `cli-05-scheduled-tasks.test.ts` |
| CLI-06 | [CLI-06] Native Remote-/Cloud-Sessions getrennt von l8git-Remote anbinden | implementiert (verdrahtet) | `cli-06-session-origin.test.ts` |
| CLI-07 | [CLI-07] Self-hosted Runner und Gateway als Administrationsflächen einordnen | implementiert (verdrahtet) | `cli-07-admin-inventory.test.ts` |
| CLI-08 | [CLI-08] Tool-Policies und exklusive MCP-/Plugin-Konfiguration anbieten | implementiert (verdrahtet) | `cli-08-tool-policies.test.ts` |
| CLI-09 | [CLI-09] Erweiterte Modell- und Output-Optionen inventarisieren | implementiert (verdrahtet) | `cli-09-launch-args.test.ts` |
| CLI-10 | [CLI-10] Provider-Feedback mit Vorschau und explizitem Versand ermöglichen | implementiert (verdrahtet) | `cli-10-feedback.test.ts` |

## Geprüfte Umgebung

- CLI-Versionen und Plattformen: siehe `docs/planning/agents-cli-integration/E2E-ACCEPTANCE.md` (QA-04); dieses Gate übernimmt keine eigene Versions-/Plattformmatrix.
- Kein pauschales Feature-Paritätsversprechen: jede Zeile mit Status „offen“ oder „prüfen“ ist eine verbleibende Lücke und muss vor einem Release entweder geschlossen oder als begründete Nichtverfügbarkeit dokumentiert werden.

