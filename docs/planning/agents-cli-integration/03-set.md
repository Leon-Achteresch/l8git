# SET · Einrichtung, Accounts und Instanzkonfiguration

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="SET-01"></a>

## SET-01 · Provider-Einrichtung mit eindeutigem Readiness-Status

**Problem und Ziel:** Nicht installiert, inkompatibel, ausgeloggt, bereit und gestört getrennt anzeigen.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-05, RUN-03

**Akzeptanzkriterien:**

- [ ] Setup zeigt Instanz, Host, Binary und Version; Installations- und Login-Hilfe passen zur tatsächlichen Plattform.
- [ ] Hintergrund-Healthcheck startet weder Chat noch Hooks, MCP-Server oder Login-Browser; aktive Capability-Probe ist gesondert gekennzeichnet.

**Prüfung:** Öffnen der Einstellungen bei Fake-CLI protokolliert ausschließlich zulässige Diagnoseaufrufe.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SET-02"></a>

## SET-02 · Claude-Login und Logout instanzgebunden ausführen

**Problem und Ziel:** Bestehende CLI-Authentifizierung auf die gewählte Konfiguration begrenzen.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-03, RUN-07

**Akzeptanzkriterien:**

- [ ] Login zeigt Fortschritt, Browser-/Terminal-Handoff, Abbruch und bestätigten Auth-Status; ein Browseraufruf allein zählt nicht als Erfolg.
- [ ] Logout sperrt neue Starts und beendet betroffene Sessions vor Cachebereinigung; andere Accounts bleiben unverändert.

**Prüfung:** Zwei Accounts mit einem abgebrochenen Login und Logout während aktivem Turn.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SET-03"></a>

## SET-03 · CLAUDE_CONFIG_DIR und Account-Isolation unterstützen

**Problem und Ziel:** Eigene Konfigurationsverzeichnisse ohne Umwidmung von HOME verwenden.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-05, RUN-02

**Akzeptanzkriterien:**

- [ ] Auth, History, Skills, Modelle, Usage und Starts verwenden denselben aufgelösten Config-Pfad; Default bleibt bestehende CLI-Konfiguration.
- [ ] Caches und Resume-Identität berücksichtigen Config-Verzeichnis und Executable; Wechsel über Account-Grenzen wird abgelehnt.

**Prüfung:** Zwei Verzeichnisse mit identischen Sessionnamen und unterschiedlichen Modellkatalogen.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SET-04"></a>

## SET-04 · Instanz-Umgebungsvariablen mit Secret-Verweisen speichern

**Problem und Ziel:** Router-/API-Konfiguration ohne Geheimnisse in Launch-Argumenten unterstützen.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-05, RUN-01

**Akzeptanzkriterien:**

- [ ] Sensitive Werte landen in vorhandener sicherer Credential-Speicherung und werden nur beim Host-Start aufgelöst; explizit leere Werte bleiben leer.
- [ ] IPC-Reads, Logs, Exporte und Fehlermeldungen sind redigiert; Updates maskierter Werte überschreiben gespeicherte Secrets nicht versehentlich.

**Prüfung:** Secret-Marker in Startumgebung vorhanden, in Settings-Response und Fehlerlog abwesend.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SET-05"></a>

## SET-05 · Binary, Startoptionen und wirksame Settings bearbeiten

**Problem und Ziel:** Typisierte providerabhängige Optionen mit sichtbarer Herkunft anbieten.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-06, SET-03, SET-04

**Akzeptanzkriterien:**

- [ ] Binary, CWD, Konfigurationspfad und erlaubte Extra-Argumente werden validiert; konkurrierende transport- oder sicherheitsrelevante Flags sind gesperrt.
- [ ] UI zeigt, ob Änderung sofort, für nächsten Turn oder nach Session-Neustart gilt; Herkunft user/project/local/managed ist nachvollziehbar.

**Prüfung:** Argumente mit Quotes, Leerwerten und doppeltem input-format sowie Managed-Override prüfen.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SET-06"></a>

## SET-06 · Router und Cloud-Backends als Claude-Presets abbilden

**Problem und Ziel:** Claude-kompatible Endpoints sowie CLI-unterstützte Bedrock-/Vertex-/Foundry-Konfigurationen als Instanzoptionen erfassen.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-04, SET-05, MOD-01

**Akzeptanzkriterien:**

- [ ] Presets setzen nur dokumentierte CLI-Umgebung; Account- und Abrechnungsquelle sind sichtbar, Modell-IDs bleiben unverändert durchreichbar.
- [ ] Unterstützte Features werden pro Backend geprüft; OAuth- und API-Key-Konflikte liefern eine Diagnose ohne automatisches Löschen von Credentials.

**Prüfung:** Gemockte Umgebungsauflösung plus optionaler manueller Smoke-Test je freigegebenem Backend.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SET-07"></a>

## SET-07 · CLI-Update nur über nachgewiesenen Installationsbesitzer

**Problem und Ziel:** Update-Hinweis und bewusste Aktualisierung für native Installation und Paketmanager anbieten.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-02, RUN-07, SET-01

**Akzeptanzkriterien:**

- [ ] Auflösung unterscheidet Installer, npm-Prefix und manuelle Installation; unklare Eigentümerschaft erlaubt nur Anleitung.
- [ ] Vor Update werden Pfad und Sperre erneut geprüft; laufende Sessions werden nicht unter einem ausgetauschten Binary weiterbetrieben.

**Prüfung:** Geändertes Symlink-Ziel zwischen Hinweis und Update sowie falscher npm-Prefix.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SET-08"></a>

## SET-08 · Diagnosebericht und Support-Export redigieren

**Problem und Ziel:** Installations- und Verbindungsprobleme mit verwertbaren Daten untersuchbar machen.

**Bereich:** /agents · Einrichtung, Accounts und Instanzkonfiguration  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-05, SET-04

**Akzeptanzkriterien:**

- [ ] Bericht enthält Versionen, Driver, Instanz, Zustandsübergänge und strukturelle Fehlercodes; Prompt-/Tool-Inhalte sind standardmäßig ausgeschlossen.
- [ ] Vollständigerer Trace ist explizit zuschaltbar, zeitlich begrenzt und vor Export einsehbar; Secrets werden unabhängig davon entfernt.

**Prüfung:** Test mit Secret-Markern in stderr, URL, Environment und verschachtelter Fehlerursache.

**Implementierungsanker in l8git:** `src-tauri/src/claude.rs`, `src-tauri/src/claude_usage.rs`, `src/lib/agents/providers/claude/chat-store.ts`, `src/lib/agents/model-catalog.ts`, `src/lib/agent-integrations.ts`

**Referenz und Übernahmebasis:** [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ClaudeDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeDriver.ts), [ClaudeProvider.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeProvider.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md), [providerMaintenance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/providerMaintenance.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
