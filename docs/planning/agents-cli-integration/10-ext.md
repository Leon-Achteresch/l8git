# EXT · Skills, MCP, Hooks, Plugins und native Erweiterungen

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="EXT-01"></a>

## EXT-01 · Skill-Discovery mit Scope, Frontmatter und Overrides prüfen

**Problem und Ziel:** Native Claude-Skills entsprechend wirksamer CLI-Konfiguration auffinden.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-03, SET-05

**Akzeptanzkriterien:**

- [ ] Config-/Repo-/Plugin-Quellen, Namenskollisionen und Managed-/Local-Overrides sind sichtbar; deaktivierte Skills werden nicht als nutzbar angeboten.
- [ ] user-invocable und disable-model-invocation inklusive unterstützter YAML-Boolean-Formen werden berücksichtigt; Verhalten ist gegen unterstützte CLI verifiziert.

**Prüfung:** Namenskollision, defektes Frontmatter, YAML no und verschachteltes Repo-CWD.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-02"></a>

## EXT-02 · Skill-Auswahl und Dispatch einschließlich Anhängen korrigieren

**Problem und Ziel:** Skill-Erwähnung zuverlässig in echte CLI-Invocation übersetzen.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-01, CHAT-01

**Akzeptanzkriterien:**

- [ ] Picker zeigt Beschreibungen und manuellen Aufrufstatus; unbekannter oder deaktivierter Skill wird nicht als verfügbar ausgegeben.
- [ ] Native Command-Expansion bleibt durch Textblock-Reihenfolge erhalten; mehrere nur manuell aufrufbare Skills werden vor Send erklärt statt scheinbar alle ausgeführt.

**Prüfung:** Skill plus Bild, zwei manuelle Skills und unbekannte Dollar-Erwähnung.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-03"></a>

## EXT-03 · Skills und benutzerdefinierte Commands bearbeiten

**Problem und Ziel:** Bestehende Create-/Edit-/Duplicate-/Delete-Aktionen auf Instanzen und Scopes erweitern.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-01, SEC-03

**Akzeptanzkriterien:**

- [ ] Editor erhält Frontmatter und Begleitdateien; Validierung, Quellenpfad und Zielscope sind sichtbar.
- [ ] Änderungen schreiben atomar und aktualisieren den Katalog; fremde Dateien und kollidierende Namen werden nicht still überschrieben.

**Prüfung:** Mehrdatei-Skill duplizieren, Dateikonflikt und fehlerhafte Metadaten speichern.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-04"></a>

## EXT-04 · Custom Agents mit Modell, Tools und Scope verwalten

**Problem und Ziel:** Native Agent-Definitionen auffinden, bearbeiten und für Starts auswählen.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-03, MOD-01

**Akzeptanzkriterien:**

- [ ] Name, Beschreibung, Instruktionen und CLI-unterstützte Modell-/Tool-/Permission-Felder bleiben erhalten.
- [ ] CLI-only-Felder werden nicht aus Dateien entfernt; ungültige oder nicht unterstützte Definitionen sind gekennzeichnet und starten nicht still den Default-Agent.

**Prüfung:** Repo-/User-Agent mit gleichem Namen und unbekanntem optionalem Feld.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-05"></a>

## EXT-05 · MCP-Inventar, Verbindung und Toolkatalog anzeigen

**Problem und Ziel:** Laufende und konfigurierte MCP-Server pro Instanz und Repo zusammenführen.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-06, SET-03

**Akzeptanzkriterien:**

- [ ] Stdio, HTTP und unterstützte Legacy-Transporte zeigen Status, Quelle, Tools und Auth-Bedarf; Statusfehler sind keine leere Erfolgsliste.
- [ ] Refresh, deaktivierte Server und Katalogänderungen aktualisieren nur betroffene Sessions; Tokens werden nur durch nötige Toolregistrierung belastet.

**Prüfung:** Server offline, leerer Tools-Katalog und zwei Repos mit gleichnamigem Server.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-06"></a>

## EXT-06 · MCP-Konfiguration, OAuth und Reconnect vervollständigen

**Problem und Ziel:** Server hinzufügen, bearbeiten, entfernen und anmelden.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-05, SET-04, SEC-03

**Akzeptanzkriterien:**

- [ ] Transport, URL/Command, Args und Secret-Verweise werden validiert; OAuth nutzt die richtige Instanz und unterstützt Abbruch.
- [ ] Bestehende fremde Config bleibt erhalten; Neustartbedarf ist sichtbar und Tool-Reconnect beantwortet keine alte Anfrage doppelt.

**Prüfung:** Abgebrochener OAuth, defekte Config und Serverwechsel mit laufendem Tool.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-07"></a>

## EXT-07 · l8git-MCP-Tools in hostseitige Tool-Registry überführen

**Problem und Ziel:** Jira, Charts, Barcodes und weitere eigene Tools unabhängig vom Frontend verfügbar halten.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-09, EXT-05, SEC-02

**Akzeptanzkriterien:**

- [ ] Registry liefert Schema, Handler, Capability und Ergebnis pro Tool; unbekanntes tools/call erzeugt einen echten Fehler statt Render-Erfolgsbestätigung.
- [ ] Toolaufrufe sind an Host/Instanz/Thread/Repo gebunden; ausblendbare Jira-Tools respektieren vorhandene Feature- und Zugriffsgates.

**Prüfung:** Headless-Jira-Aufruf, unbekannter Toolname und fremder Thread-Kontext.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-08"></a>

## EXT-08 · Hooks verwalten und Aktivierung nachvollziehbar machen

**Problem und Ziel:** Native Hook-Dateien, Matcher, Quellen und Aktivierungszustände bearbeiten.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-03, EVT-10, SEC-01

**Akzeptanzkriterien:**

- [ ] Create/Edit/Disable berücksichtigt CLI-Eventschema und Scope; relevante Start-/Tool-/Stop-/Compaction-Hooks werden inventarisiert.
- [ ] Untrusted-Repo-Hooks laufen nicht beim bloßen Inventarscan; Laufzeitfehler und tatsächliche Hook-Aktivität sind nachvollziehbar.

**Prüfung:** Hook mit Matcher, Managed-Override und Start eines nicht vertrauten Repos.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-09"></a>

## EXT-09 · Plugin- und Marketplace-Lebenszyklus vervollständigen

**Problem und Ziel:** Installieren, Aktivieren, Deaktivieren, Aktualisieren und Entfernen pro Scope anbieten.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-03, EXT-05, SET-05

**Akzeptanzkriterien:**

- [ ] Pluginquelle, Version, installierter Zustand und Konflikte sind sichtbar; Skills, Hooks und MCP aus Plugins werden der Quelle zugeordnet.
- [ ] CLI-Fehler bleiben sichtbar; Deinstallation entfernt keine fremden Dateien und laufende Sessions zeigen Reload-/Restartbedarf.

**Prüfung:** Defektes Plugin, Update mit geänderten Tools und Deinstallation während aktiver Session.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-10"></a>

## EXT-10 · CLAUDE.md, Rules und Memory kontextbezogen verwalten

**Problem und Ziel:** Instruktionen und persistente Erinnerung als eigene native Capability behandeln.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-03, CHAT-08, SEC-03

**Akzeptanzkriterien:**

- [ ] Wirksame Quellen und Scope sind einsehbar; Create/Edit von CLAUDE.md und Rules erhält fremde Inhalte.
- [ ] Native Memory-Kommandos werden nur bei belegter Unterstützung angeboten; Codex-only-Import/Memory-Methoden werden nicht als Claude-Erfolg mit leerer Liste emuliert.

**Prüfung:** Verschachtelte Regeln, nicht schreibbare Managed-Datei und unsupported Memory-Kommando.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-11"></a>

## EXT-11 · Capability-Sync und Import mit Vorschau erhalten

**Problem und Ziel:** Vorhandenen CLI-übergreifenden Sync in das Pattern integrieren.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-03, EXT-08, SEC-03

**Akzeptanzkriterien:**

- [ ] Plan zeigt create/update/same/unsupported samt Quell- und Zielinstanz; inkompatible Formate werden nicht blind kopiert.
- [ ] Anwendung besitzt Backup, Einzelresultate und Wiederholbarkeit; native Claude-Import-Befehle werden separat auf Version und Dry-Run geprüft.

**Prüfung:** Skill-/Hook-Sync mit Namenskonflikt, Teilausfall und erneutem Anwenden.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-12"></a>

## EXT-12 · Browser-, Chart- und Barcode-Addons vollständig erhalten

**Problem und Ziel:** Bestehende l8git-Extras unter dem Provider-Pattern weiter nutzbar machen.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-07, EXT-06, EVT-05

**Akzeptanzkriterien:**

- [ ] Native MCP- und Markdown-Renderer funktionieren pro unterstütztem Toolkanal; ungültige Chart-/Barcode-Daten bleiben sicherer Fallback.
- [ ] Browser-MCP-Einstellungen bewahren fremde Config; Browsererfolg basiert auf Toolbelegen, Renderer-Ack bestätigt nur tatsächlich verarbeitete Ausgabe.

**Prüfung:** Bestehende Addon-/Renderer-Tests plus Claude-Turn mit je einer Ausgabe.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="EXT-13"></a>

## EXT-13 · MCP-Prompts, Resources und weitere Protokollflächen prüfen

**Problem und Ziel:** Über tools/list und tools/call hinausgehende MCP-Funktionen explizit inventarisieren.

**Bereich:** /agents · Skills, MCP, Hooks, Plugins und native Erweiterungen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EXT-05, EXT-07, ASK-06

**Akzeptanzkriterien:**

- [ ] Für Resources, Resource-Links, Prompts, Notifications und Elicitation ist je Feature native Nutzung, eigene UI oder unsupported dokumentiert.
- [ ] Nur von CLI und MCP-Version bestätigte Flächen werden angeboten; nicht implementierte Methoden liefern korrekte Protokollfehler.

**Prüfung:** Stub-MCP mit Resource, Prompt, Notification und unbekannter Methode.

**Implementierungsanker in l8git:** `src/lib/agents/capability-hub.ts`, `src/lib/agents/capability-store.ts`, `src/lib/agents/capability-market.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src-tauri/src/claude.rs`, `src-tauri/src/agent_addons.rs`, `src/lib/agents/renderer-mcp.ts`

**Referenz und Übernahmebasis:** [ClaudeSkills.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.ts), [ClaudeSkillDispatch.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts), [McpProviderSession.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/mcp/McpProviderSession.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
