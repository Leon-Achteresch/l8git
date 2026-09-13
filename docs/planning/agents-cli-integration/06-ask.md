# ASK · Permissions, Planfreigaben und Rückfragen

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="ASK-01"></a>

## ASK-01 · Claude-Permission-Modi ohne falsche Sandbox-Zusage abbilden

**Problem und Ziel:** Gemeinsame UI-Auswahl auf tatsächliche Claude-Modi und Rechte abbilden.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-06, RUN-03

**Akzeptanzkriterien:**

- [ ] default, acceptEdits, plan, dontAsk und bypassPermissions werden nur entsprechend geprüfter Version angeboten; auto erhält eigenes Versions-Gate.
- [ ] UI unterscheidet Approval-Modus und echte Sandbox; vorhandene Repo-Trust-Grenzen bleiben wirksam und werden nicht wegen Providerwechsel erweitert.

**Prüfung:** Kombinationen aus Trust, Plan, Approval und Sandbox einschließlich alter CLI.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-02"></a>

## ASK-02 · Modell- und Permission-Änderungen auf betroffene Session begrenzen

**Problem und Ziel:** Globale Seiteneffekte beim Verlassen des Planmodus und Setzen von Optionen verhindern.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-01, RUN-05

**Akzeptanzkriterien:**

- [ ] Planfreigabe ändert nur den ausgewählten Thread; paralleler Thread behält seine bisherigen Permissions.
- [ ] CLI-Ablehnung wird sichtbar und UI-Einstellung wird zurückgerollt; keine still geschluckten setPermissionMode-Fehler.

**Prüfung:** Zwei Claude-Threads mit unterschiedlichen Modi und einem abgelehnten Control-Request.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-03"></a>

## ASK-03 · Approve-once, Reject und Session-Freigabe abbilden

**Problem und Ziel:** Tool-Permissions über stabile Requests und originale Optionswerte beantworten.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-01, EVT-04

**Akzeptanzkriterien:**

- [ ] Karte zeigt Tool, relevante Argumente, CWD, Grund und angefragte Rechte; once, deny und session werden exakt übersetzt.
- [ ] Dauerhafte oder Session-Regeln entstehen nur bei entsprechender Entscheidung; Lesewerkzeuge und Agent-Tools werden korrekt klassifiziert.

**Prüfung:** Referenzfälle canUseTool, acceptForSession und gleiche Toolnamen in zwei Sessions.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-04"></a>

## ASK-04 · Permission-Änderungen und zusätzliche Verzeichnisse bestätigen

**Problem und Ziel:** Vom CLI angefragte Rules und Pfadfreigaben differenziert behandeln.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-03, SEC-02

**Akzeptanzkriterien:**

- [ ] Regelvorschläge werden mit Scope und Wirkung angezeigt; modifizierte Tool-Inputs werden nur bei unterstützter Antwortform zurückgesendet.
- [ ] Netzwerk- oder Verzeichnisfreigaben erweitern keine anderen Threads; nicht unterstützte Rechte liefern einen expliziten Fehler.

**Prüfung:** Rule-Update, externes Verzeichnis und ungültige native Permission-Option.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-05"></a>

## ASK-05 · AskUserQuestion mit Einzelwahl, Mehrfachwahl und Freitext

**Problem und Ziel:** Alle strukturierten Claude-Fragen vollständig in die gemeinsame Frage-UI überführen.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-03, EVT-01

**Akzeptanzkriterien:**

- [ ] Mehrere Fragen, Header, Beschreibungen, Optionen, Other und multiSelect sind bedienbar; Antworten behalten native Schlüssel.
- [ ] Auch bei Full Access wird eine inhaltliche Frage nicht automatisch bestätigt; validierte Antwort wird der richtigen Request-ID zugeordnet.

**Prüfung:** Mehrere Fragen mit gleichen Labels, Freitext und Full-Access-Session.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-06"></a>

## ASK-06 · MCP-Elicitation einschließlich Abbruch und URL-Flow

**Problem und Ziel:** Schema-basierte MCP-Rückfragen von Tool-Permissions unterscheiden.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-05, EXT-06

**Akzeptanzkriterien:**

- [ ] Unterstützte Feldtypen, Pflichtfelder, Auswahl und Cancel/Decline/Accept werden korrekt validiert und zurückgegeben.
- [ ] URL-Elicitation öffnet nur einen geprüften Link auf Nutzeraktion; unbekannte Schemas werden verständlich als nicht unterstützt angezeigt.

**Prüfung:** Ungültiges Required-Feld, URL-Flow, Abbruch und nicht unterstütztes Schema.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-07"></a>

## ASK-07 · ExitPlanMode als Planentscheidung behandeln

**Problem und Ziel:** Plan anzeigen und bewussten Übergang in Ausführung ermöglichen.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-02, ASK-05

**Akzeptanzkriterien:**

- [ ] Plantext wird sowohl aus Control-Input als auch Assistant-Snapshot gewonnen und dedupliziert; Ablehnen erlaubt Feedback.
- [ ] Ohne Zustimmung wird Planmodus nicht automatisch verlassen; Zustimmung übernimmt nur explizit gewählte Rechte und nur im richtigen Thread.

**Prüfung:** Plan ohne Control-Text, doppelter Snapshot und parallele Plan-Sessions.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-08"></a>

## ASK-08 · Offene Requests bei Abort, Exit und Reconnect auflösen

**Problem und Ziel:** Hängende Dialoge und doppelte Antworten vermeiden.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-08, RUN-09, ASK-05

**Akzeptanzkriterien:**

- [ ] Bereits abgebrochener AbortSignal, spätere Cancellation, CLI-Exit und Stop beenden wartende Fragen und Approvals deterministisch.
- [ ] Über zwei Clients kann ein Request genau einmal beantwortet werden; Reconnect stellt offene Requests wieder her, erledigte bleiben erledigt.

**Prüfung:** Abort vor Listener-Registrierung und zwei zeitgleiche Antworten vom Desktop/Mobile.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="ASK-09"></a>

## ASK-09 · Approval-Inbox und Aufmerksamkeitsnavigation anbieten

**Problem und Ziel:** Offene Entscheidungen über Repos und Instanzen auffindbar halten.

**Bereich:** /agents · Permissions, Planfreigaben und Rückfragen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-08, UX-02

**Akzeptanzkriterien:**

- [ ] Badge, Liste und Deep-Link zeigen Host, Instanz, Thread, Requestart und Wartezeit; Öffnen fokussiert die richtige Karte.
- [ ] Keine Auto-Antwort durch Vorauswahl; Benachrichtigung enthält keine sensiblen Tool-Argumente.

**Prüfung:** Gleichzeitige Fragen in drei Threads, Hintergrundfenster und bereits erledigter Deep-Link.

**Implementierungsanker in l8git:** `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-permission-menu.tsx`, `src/components/agents/ui/agent-question-card.tsx`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [permission-modes.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/permission-modes.md), [ProviderRuntimeIngestion.approval.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.approval.test.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
