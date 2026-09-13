# SEC · Bestehende Sicherheitsgrenzen und Datenintegrität

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="SEC-01"></a>

## SEC-01 · Repo-Trust und native Settings-Ausführung erhalten

**Problem und Ziel:** Provider-Refactoring darf Hooks, Projektsettings und Permission-Bypass nicht unbeabsichtigt freischalten.

**Bereich:** /agents · Bestehende Sicherheitsgrenzen und Datenintegrität  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-06, RUN-01

**Akzeptanzkriterien:**

- [ ] Untrusted-Repos laden weiterhin nur erlaubte Settings-Sources; Discovery und Healthcheck führen keine Projektbefehle aus.
- [ ] Trustwechsel hat expliziten Scope; keine Gleichsetzung von vertrauenswürdigem Repo mit automatisch aktivem Full Access.

**Prüfung:** Bösartiger Testhook in untrusted Repo und Wechsel in vertrauenswürdiges Repo ohne Bypass-Aktivierung.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/server/dispatch/agents.rs`, `src/lib/agents/plugins/content.ts`, `src/lib/agents/browser-addon.ts`

**Referenz und Übernahmebasis:** [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md), [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SEC-02"></a>

## SEC-02 · Pfad-, Repo- und Transportbesitz serverseitig prüfen

**Problem und Ziel:** Commands, Anhänge, Toolaufrufe und Dateizugriffe nur im autorisierten Kontext ausführen.

**Bereich:** /agents · Bestehende Sicherheitsgrenzen und Datenintegrität  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-02, RUN-01

**Akzeptanzkriterien:**

- [ ] Pfade werden kanonisiert; Traversal, Symlink-Ausbruch und fremde Session-/Transport-IDs werden nach bestehender Policy behandelt.
- [ ] Zusätzliche Verzeichnisse sind getrennte Freigaben; ein Dateianhang oder MCP-Aufruf hebt die CLI-Sandbox nicht auf.

**Prüfung:** Fremde Thread-ID, ../-Pfad, Symlink und manipulierte Remote-Request.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/server/dispatch/agents.rs`, `src/lib/agents/plugins/content.ts`, `src/lib/agents/browser-addon.ts`

**Referenz und Übernahmebasis:** [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md), [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SEC-03"></a>

## SEC-03 · Konfigurationsänderungen atomar und verlustfrei schreiben

**Problem und Ziel:** CLI-eigene Dateien bei Settings-, MCP-, Skill- und Plugin-Aktionen schützen.

**Bereich:** /agents · Bestehende Sicherheitsgrenzen und Datenintegrität  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-03

**Akzeptanzkriterien:**

- [ ] Fremde Felder bleiben erhalten; ungültige Datei wird nicht überschrieben; Schreibvorgang prüft zwischenzeitliche Änderung.
- [ ] Backup-/Rollback-Verhalten ist definiert; teilweise fehlschlagende Mehrdatei-Operation berichtet Einzelresultate.

**Prüfung:** Zwei gleichzeitige Editoren, kaputtes JSON und Schreibfehler nach erster Datei.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/server/dispatch/agents.rs`, `src/lib/agents/plugins/content.ts`, `src/lib/agents/browser-addon.ts`

**Referenz und Übernahmebasis:** [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md), [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SEC-04"></a>

## SEC-04 · Sensitive Daten über Persistenz und Telemetrie redigieren

**Problem und Ziel:** Tokens, Keys und private Credentialwerte dürfen weder UI noch Logs/Exporte verlassen.

**Bereich:** /agents · Bestehende Sicherheitsgrenzen und Datenintegrität  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-04, PROV-07

**Akzeptanzkriterien:**

- [ ] Gemeinsame Redaktionsschicht deckt URLs, Args, stderr, rohe Frames und Fehlerketten ab; Secrets werden über Referenzen gespeichert.
- [ ] Diagnose ist standardmäßig strukturell; Trace-Aktivierung und Aufbewahrung sind getrennt von normalem Verlauf.

**Prüfung:** Secret-Marker durch alle Fehler-, Persistenz- und Exportpfade verfolgen.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/server/dispatch/agents.rs`, `src/lib/agents/plugins/content.ts`, `src/lib/agents/browser-addon.ts`

**Referenz und Übernahmebasis:** [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md), [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SEC-05"></a>

## SEC-05 · Unbekannte Controls und nicht unterstützte Aktionen korrekt ablehnen

**Problem und Ziel:** Scheinbar erfolgreiche No-ops im gemeinsamen Vertrag ausschließen.

**Bereich:** /agents · Bestehende Sicherheitsgrenzen und Datenintegrität  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-06, RUN-05, EXT-07

**Akzeptanzkriterien:**

- [ ] Fehlende Methode oder Capability liefert typed unsupported; leere Liste bedeutet nur tatsächlich erfolgreich leeres Inventar.
- [ ] Unknown control_request wird gemäß Protokoll abgelehnt, unknown tools/call liefert Tool-/RPC-Fehler; nichts wird als generischer Render-Erfolg quittiert.

**Prüfung:** Unbekannter Control-Subtype, Toolname und Claude-Aufruf einer Codex-only-Methode.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/server/dispatch/agents.rs`, `src/lib/agents/plugins/content.ts`, `src/lib/agents/browser-addon.ts`

**Referenz und Übernahmebasis:** [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md), [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="SEC-06"></a>

## SEC-06 · Untrusted Chat-/Tool-Inhalte sicher rendern und exportieren

**Problem und Ziel:** Modell- und Tooltext bleibt Dateninhalt auch in Rich-Renderern.

**Bereich:** /agents · Bestehende Sicherheitsgrenzen und Datenintegrität  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Bestandsschutz  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-05

**Akzeptanzkriterien:**

- [ ] Markdown, Links, ANSI und Tool-JSON führen kein Script aus; Dateilinks prüfen erlaubtes Schema und Kontext.
- [ ] Opaque Thinking-Signaturen, Secretwerte und nicht freigegebene Anhänge fehlen im Export; Charts/Barcodes haben Größe-/Schema-Limits.

**Prüfung:** Script-/URL-Injection, riesiger Rendererblock und fehlerhaftes strukturiertes Toolresultat.

**Implementierungsanker in l8git:** `src-tauri/src/agent_transport.rs`, `src-tauri/src/claude.rs`, `src/lib/agent-trust-prefs.ts`, `src-tauri/src/server/dispatch/agents.rs`, `src/lib/agents/plugins/content.ts`, `src/lib/agents/browser-addon.ts`

**Referenz und Übernahmebasis:** [providers.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/providers.md), [ClaudeHome.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeHome.ts), [ProviderInstanceEnvironment.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderInstanceEnvironment.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
