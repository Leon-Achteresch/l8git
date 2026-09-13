# TASK · Subagents, Aufgaben und Hintergrundprozesse

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="TASK-01"></a>

## TASK-01 · Subagent-Starts mit Elternbeziehung normalisieren

**Problem und Ziel:** Agent-/Task-Toolaufrufe und task_started konsistent verbinden.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01, EVT-04

**Akzeptanzkriterien:**

- [ ] AgentId, TaskId, parent_tool_use_id und owningAgentId bleiben getrennt und bilden verschachtelte Arbeit ab.
- [ ] Tool-Aufruf und nachfolgendes Task-Event erzeugen eine gemeinsame Aktivität statt doppelter Agentkarten.

**Prüfung:** Task vor/nach Tool-Frame und verschachtelter Subagent.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="TASK-02"></a>

## TASK-02 · Subagent-Modell, Effort, Rolle und Titel korrekt anzeigen

**Problem und Ziel:** Konkrete Laufzeitmetadaten statt pauschaler Hauptagent-Einstellungen darstellen.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** TASK-01, MOD-01

**Akzeptanzkriterien:**

- [ ] Explizite Agent-Overrides haben Vorrang vor Session-Defaults; authoritative Assistant-Modell-ID verfeinert den Eintrag.
- [ ] Früh eintreffende Subagent-Snapshots werden gepuffert und gehen vor späterem task_started nicht verloren.

**Prüfung:** Modell-Snapshot vor Start, numerischer Effort und fehlender Titel.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="TASK-03"></a>

## TASK-03 · Subagent-Fortschritt und Ausgabe getrennt darstellen

**Problem und Ziel:** Laufende Unteraufgaben mit Beschreibung, letzter Aktion und Text sichtbar machen.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** TASK-01, EVT-05

**Akzeptanzkriterien:**

- [ ] task_progress zeigt Summary, last_tool_name und zugeordnete Ausgabe; Hauptchat und Kindtranskript werden nicht vermischt.
- [ ] skip_transcript und nur vorhandene Ausgabe werden respektiert; verspäteter Fortschritt reaktiviert keine abgeschlossene Aufgabe.

**Prüfung:** Fortschritt nach Abschluss und Subagent ohne freigegebenes Transkript.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="TASK-04"></a>

## TASK-04 · Task-Statuspatches und Abschluss vollständig abbilden

**Problem und Ziel:** task_updated und task_notification einschließlich Fehler, Pause und Background-Status verarbeiten.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** TASK-03, EVT-11

**Akzeptanzkriterien:**

- [ ] pending/running/completed/failed/cancelled sowie unterstützte paused/backgrounded-Zustände sind korrekt übersetzt.
- [ ] Endzeit, Output-Datei und Fehler werden übernommen; Kill und Turn-Abbruch beenden offene Kindaufgaben deterministisch.

**Prüfung:** Statuspatch mit end_time, Cancel ohne Resultat und Task-Notification nach Hauptturn.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="TASK-05"></a>

## TASK-05 · Workflow-Mitglieder, Phasen und Fanout darstellen

**Problem und Ziel:** Vom CLI veröffentlichte koordinierte Workflows in vorhandene Run-Ansicht integrieren.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** TASK-02, TASK-03

**Akzeptanzkriterien:**

- [ ] Mitglieder, Rollen, Phasen und Hierarchie bleiben stabil bei wiederholten Snapshots; geänderte Inhalte aktualisieren genau den richtigen Eintrag.
- [ ] Coalescing identischer Snapshots verliert weder Usage noch Beschreibung; unbekannte Workflow-Form bleibt als generische Aufgabe sichtbar.

**Prüfung:** Identischer Snapshot, danach reine Usage- und reine Phasenänderung.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="TASK-06"></a>

## TASK-06 · Subagent-Usage ohne doppelte Hauptturn-Kosten verbuchen

**Problem und Ziel:** Task-Token und Laufzeiten informativ darstellen und sauber aggregieren.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** TASK-03, USE-01

**Akzeptanzkriterien:**

- [ ] Task-Usage wird je Aufgabe angezeigt; totals aus Resultat und task_progress werden nach dokumentierter Semantik abgeglichen.
- [ ] Kontext- und Kostenanzeige addiert keine bereits enthaltenen Kindkosten doppelt; fehlende Daten bleiben unbekannt.

**Prüfung:** Mehrere Tasks plus result mit Gesamtusage und fehlenden Cachezählern.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="TASK-07"></a>

## TASK-07 · Hintergrundaufgaben einzeln anzeigen und stoppen

**Problem und Ziel:** /ps, /stop und vorhandene Terminalmethoden zu verlässlichen Task-Aktionen machen.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** TASK-04, RUN-07, CHAT-08

**Akzeptanzkriterien:**

- [ ] Liste zeigt eigene Prozesse/Aufgaben mit Zustand und erlaubten Aktionen; Stop-einzeln und Stop-alle sind getrennt.
- [ ] task_id/process_id wird korrekt gesendet; nicht mehr existierende Aufgabe führt zu abgeschlossener Anzeige statt Endlosschleife.

**Prüfung:** Stop eines von zwei Tasks und Race mit natürlichem Prozessende.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="TASK-08"></a>

## TASK-08 · Native Background-Sessions und Agent-Teams auf Anschluss prüfen

**Problem und Ziel:** Über t3code-Parität hinausgehende CLI-Agent-/Daemon-Funktionen als klar versionierte Erweiterung erfassen.

**Bereich:** /agents · Subagents, Aufgaben und Hintergrundprozesse  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** TASK-07, HIST-08, RUN-03

**Akzeptanzkriterien:**

- [ ] Discovery, Logs, Attach, Stop, Respawn, Entfernen und Team-Kommunikation erhalten jeweils nachgewiesenen Transport oder Terminal-Handoff.
- [ ] Fremde native Sessions werden nicht ohne Besitzprüfung gestoppt; globale Daemon-Aktionen sind separat ausgewiesen und keine normale Thread-Stop-Implementierung.

**Prüfung:** Fake-native Sessionliste, fremder Besitzer und nicht unterstützte Attach-Schnittstelle.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/run/agent-run-fanout.tsx`, `src/components/agents/run/agent-run-row.tsx`, `src/components/agents/ui/agent-steps-card.tsx`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [providerRuntime.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerRuntime.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
