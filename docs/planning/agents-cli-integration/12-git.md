# GIT · Repository-, Worktree- und Review-Anbindung

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="GIT-01"></a>

## GIT-01 · Worktree-Session mit korrektem CWD und Instanz starten

**Problem und Ziel:** Parallele Agentarbeit in bestehenden l8git-Worktrees erhalten.

**Bereich:** /agents · Repository-, Worktree- und Review-Anbindung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-01, RUN-04

**Akzeptanzkriterien:**

- [ ] Thread verweist auf Basisrepo, Worktree, Branch und Providerinstanz; CLI startet im richtigen Verzeichnis und History bleibt zuordenbar.
- [ ] Worktree-Erzeugung ist idempotent bzw. kollisionssicher; fehlschlagender CLI-Start löscht keine vorhandenen Nutzerdaten.

**Prüfung:** Zwei parallele Worktrees mit gleichem Namenswunsch und fehlgeschlagener Session.

**Implementierungsanker in l8git:** `src/lib/agents/agent-worktrees.ts`, `src/lib/agents/agent-review.ts`, `src/lib/agents/thread-diff.ts`, `src/lib/agents/worktree-diff.ts`, `src/components/agents/worktree-review/use-agent-review.ts`, `src-tauri/src/agent_review.rs`

**Referenz und Übernahmebasis:** [ProviderService.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ProviderService.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [overview.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/overview.md), [project-settings.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/project-settings.md), [source-control.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/source-control.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="GIT-02"></a>

## GIT-02 · Live-Diffs und Dateizähler mit echten Änderungen synchronisieren

**Problem und Ziel:** Toolmeldungen und Git-Zustand für die Review-Ansicht verknüpfen.

**Bereich:** /agents · Repository-, Worktree- und Review-Anbindung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-07, TASK-04

**Akzeptanzkriterien:**

- [ ] Während und nach Turn werden echte geänderte Dateien angezeigt; Änderungen von Hooks und Subagents sind enthalten.
- [ ] Ein vom Agent behauptetes Edit ohne tatsächlichen Dateidiff zählt nicht als erfolgreich; Refresh bleibt gedrosselt und reagiert auf Turn-Ende.

**Prüfung:** Änderung durch Hook, fehlgeschlagenes Tool und externe Dateiänderung.

**Implementierungsanker in l8git:** `src/lib/agents/agent-worktrees.ts`, `src/lib/agents/agent-review.ts`, `src/lib/agents/thread-diff.ts`, `src/lib/agents/worktree-diff.ts`, `src/components/agents/worktree-review/use-agent-review.ts`, `src-tauri/src/agent_review.rs`

**Referenz und Übernahmebasis:** [ProviderService.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ProviderService.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [overview.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/overview.md), [project-settings.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/project-settings.md), [source-control.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/source-control.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="GIT-03"></a>

## GIT-03 · Datei-Checkpoints und gezielten Restore anbieten

**Problem und Ziel:** Sicheren Dateizustand vor/zwischen Agentturns für Rücknahme erfassen.

**Bereich:** /agents · Repository-, Worktree- und Review-Anbindung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** GIT-02, HIST-02

**Akzeptanzkriterien:**

- [ ] Checkpoint identifiziert erfasste Dateien und Basis; Restore zeigt Vorschau und bewahrt spätere fremde Änderungen durch Konflikterkennung.
- [ ] Native files_persisted ist nur Metadatum nach bestätigter Semantik; Conversation-Rollback und Git-/Datei-Restore sind separat.

**Prüfung:** Untracked-Datei, binäre Datei und manuelle Änderung nach Checkpoint.

**Implementierungsanker in l8git:** `src/lib/agents/agent-worktrees.ts`, `src/lib/agents/agent-review.ts`, `src/lib/agents/thread-diff.ts`, `src/lib/agents/worktree-diff.ts`, `src/components/agents/worktree-review/use-agent-review.ts`, `src-tauri/src/agent_review.rs`

**Referenz und Übernahmebasis:** [ProviderService.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ProviderService.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [overview.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/overview.md), [project-settings.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/project-settings.md), [source-control.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/source-control.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="GIT-04"></a>

## GIT-04 · Review-Start und Findings an Thread und Diff binden

**Problem und Ziel:** Vorhandenen Review-Flow mit Claude als Provider durchgängig nutzen.

**Bereich:** /agents · Repository-, Worktree- und Review-Anbindung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** GIT-02, CHAT-05, MOD-07

**Akzeptanzkriterien:**

- [ ] Review-Instruktionen referenzieren gewählten Diff-/Branch-Stand; Findings behalten Datei- und Zeilenbezug.
- [ ] Optionaler nativer Review-/Ultrareview-Befehl ist als separate Versionsfähigkeit geführt und postet ohne bewusste Aktion nichts extern.

**Prüfung:** Review eines Worktrees und veralteter Finding-Zeilen nach neuer Änderung.

**Implementierungsanker in l8git:** `src/lib/agents/agent-worktrees.ts`, `src/lib/agents/agent-review.ts`, `src/lib/agents/thread-diff.ts`, `src/lib/agents/worktree-diff.ts`, `src/components/agents/worktree-review/use-agent-review.ts`, `src-tauri/src/agent_review.rs`

**Referenz und Übernahmebasis:** [ProviderService.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ProviderService.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [overview.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/overview.md), [project-settings.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/project-settings.md), [source-control.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/source-control.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="GIT-05"></a>

## GIT-05 · Finish-Flow für Commit, Merge und Aufräumen erhalten

**Problem und Ziel:** Bestehende Prüf-, Commit- und Merge-Schritte in Provider-Architektur einbinden.

**Bereich:** /agents · Repository-, Worktree- und Review-Anbindung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** GIT-01, GIT-04, RUN-07

**Akzeptanzkriterien:**

- [ ] Review-/Teststatus und Dirty-Zustand sind vor Finish sichtbar; Merge-Konflikte gehen in vorhandenen Konfliktworkflow.
- [ ] Worktree/Branch werden erst nach bestätigtem Erfolg und Prüfung aktiver Sessions entfernt; abgebrochener Merge bleibt wiederaufnehmbar.

**Prüfung:** Dirty-Basis, Mergekonflikt und aktiver zweiter Thread im selben Worktree.

**Implementierungsanker in l8git:** `src/lib/agents/agent-worktrees.ts`, `src/lib/agents/agent-review.ts`, `src/lib/agents/thread-diff.ts`, `src/lib/agents/worktree-diff.ts`, `src/components/agents/worktree-review/use-agent-review.ts`, `src-tauri/src/agent_review.rs`

**Referenz und Übernahmebasis:** [ProviderService.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ProviderService.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [overview.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/overview.md), [project-settings.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/project-settings.md), [source-control.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/source-control.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="GIT-06"></a>

## GIT-06 · CLI-Textgenerierung für Titel und Git-Texte kapseln

**Problem und Ziel:** Optional Titel, Branchname, Committext und PR-Beschreibung über dieselbe Instanz erzeugen.

**Bereich:** /agents · Repository-, Worktree- und Review-Anbindung  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-05, SEC-01, MOD-07

**Akzeptanzkriterien:**

- [ ] Eigener TextGeneration-Port teilt Account-/Modellkonfiguration, aber keinen Chat-Turn; bestehender AI-Provider bleibt explizit auswählbar.
- [ ] Hilfsaufrufe starten keine unbeabsichtigten Workspace-Tools, Hooks oder MCP-Server; wenn dies nicht sicher unterbindbar ist, ist die Funktion nicht verfügbar.

**Prüfung:** Verbose-CLI-Ausgabe, Schemafehler und Repo mit aktivem Startup-Hook.

**Implementierungsanker in l8git:** `src/lib/agents/agent-worktrees.ts`, `src/lib/agents/agent-review.ts`, `src/lib/agents/thread-diff.ts`, `src/lib/agents/worktree-diff.ts`, `src/components/agents/worktree-review/use-agent-review.ts`, `src-tauri/src/agent_review.rs`

**Referenz und Übernahmebasis:** [ProviderService.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ProviderService.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [overview.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/overview.md), [project-settings.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/project-settings.md), [source-control.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/source-control.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
