# PROV · Provider-Verträge und erweiterbare Architektur

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="PROV-01"></a>

## PROV-01 · Übernahmeentscheidung CLI-Protokoll versus Agent SDK dokumentieren

**Problem und Ziel:** Den t3code-SDK-Adapter auf den vorhandenen Tauri-Transport abbilden und eine belastbare Implementierungsentscheidung treffen.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Architektur  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** Keine

**Akzeptanzkriterien:**

- [ ] ADR vergleicht direkten stream-json-Adapter und SDK-Sidecar anhand Prozesshoheit, Packaging, Control-Protokoll, Testbarkeit und Plattformen.
- [ ] Für jede benötigte SDK-Operation sind CLI-Äquivalent oder belegte Lücke benannt; Standardempfehlung bleibt der vorhandene Rust-Transport, ein Sidecar braucht einen begründeten ADR-Nachtrag.

**Prüfung:** Review gegen ClaudeAdapter, lokalen Client und mindestens einen echten Initialize-/Turn-/Approval-Trace.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-02"></a>

## PROV-02 · DriverKind, InstanceId, ThreadId und native SessionId trennen

**Problem und Ziel:** Eigenständige Identitäten statt eines einzigen Provider-Strings einführen.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-01

**Akzeptanzkriterien:**

- [ ] DriverKind ist ein validierter offener Bezeichner; InstanceId ist separat typisiert; native IDs werden nicht mit l8git-Thread-IDs verwechselt.
- [ ] Persistierte Referenzen enthalten Host und Instanz; gleiche native Session-IDs zweier Instanzen kollidieren nicht.

**Prüfung:** Typ- und Schemafälle für falsche IDs, unbekannte Treiber und doppelte native IDs.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-03"></a>

## PROV-03 · Gemeinsamen AgentProviderAdapter definieren

**Problem und Ziel:** Start, Send, Steer, Interrupt, Stop, Read, Resume, Approvals, Fragen und Events hinter einem neutralen Vertrag bündeln.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-02

**Akzeptanzkriterien:**

- [ ] Pflichtmethoden haben definierte Fehler und Lebenszyklen; optionale Methoden sind über Capabilities erreichbar.
- [ ] Kernvertrag importiert weder Codex-Protokolltypen noch Claude-Frame-Typen; jeder Adapter muss denselben Konformitätstest bestehen.

**Prüfung:** Minimaladapter kompiliert und besteht Start-/Turn-/Stop-Vertrag ohne Claude- oder Codex-Abhängigkeit.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-04"></a>

## PROV-04 · Eine Driver-Registry statt paralleler Provider-Listen

**Problem und Ziel:** Metadaten, Factory, Konfigurationsschema, Symbole und Extension Points zentral registrieren.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-03

**Akzeptanzkriterien:**

- [ ] provider-registry, provider-meta und active-chat-store beziehen Auswahl und Auflösung aus einer gemeinsamen Quelle.
- [ ] Unbekannte oder deaktivierte Provider werden explizit als nicht verfügbar behandelt; kein stiller Rückfall auf Codex.

**Prüfung:** Unbekannten Treiber laden und sicherstellen, dass kein fremder Prozess startet.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-05"></a>

## PROV-05 · Provider-Instanzen mit eigener Konfiguration verwalten

**Problem und Ziel:** Mehrere Konfigurationen desselben CLI-Treibers unabhängig erzeugen, benennen, deaktivieren und entfernen.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-04

**Akzeptanzkriterien:**

- [ ] Instanz besitzt Adapter, Katalog, Auth-Status und Cleanup; zwei Claude-Instanzen teilen keinen veränderlichen Cache.
- [ ] Deaktivieren sperrt neue Starts; Umgang mit aktiven Sessions ist sichtbar und deterministisch; historische Threads bleiben lesbar.

**Prüfung:** Zwei Instanzen starten, eine deaktivieren und Isolation der anderen nachweisen.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-06"></a>

## PROV-06 · Capability-Vertrag mit Gründen und Versionsgrenzen

**Problem und Ziel:** Statische Boolesche Fähigkeiten und Negativlisten durch präzise Laufzeitfähigkeiten ersetzen.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-03

**Akzeptanzkriterien:**

- [ ] Jede Fähigkeit meldet supported, unsupported oder unavailable mit Grund sowie möglicher Mindestversion; native und emulierte Umsetzung sind unterscheidbar.
- [ ] Unterstützte Optionen werden aus Instanz, CLI-Version, Modell und Sessionzustand abgeleitet; Backend prüft dieselben Gates wie UI.

**Prüfung:** Matrix für Bilder, Steer, Rollback, Compact, Fast, MCP und Questions einschließlich veralteter CLI.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-07"></a>

## PROV-07 · Kanonische Commands und Runtime-Events versionieren

**Problem und Ziel:** Neutrale Ereignisse für Session, Turn, Text, Tools, Aufgaben, Approvals, Usage und Fehler definieren.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-02, PROV-03

**Akzeptanzkriterien:**

- [ ] Events tragen schemaVersion, EventId, Sequenz, Host-/Instanz-/Thread-/Turn-Bezug und erforderliche native Zuordnung.
- [ ] Parser behandelt unbekannte optionale Felder vorwärtskompatibel und ungültige Pflichtfelder als kontrollierten Protokollfehler.

**Prüfung:** Serialisierungs-/Replay-Fixtures über TypeScript und Rust einschließlich unbekanntem Event.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-08"></a>

## PROV-08 · Gemeinsamen Session-Orchestrator und Projektionen aufbauen

**Problem und Ziel:** Provider-Protokollverarbeitung von Chat-State, Aufmerksamkeitszustand und Persistenz entkoppeln.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-07, RUN-01

**Akzeptanzkriterien:**

- [ ] Ein gemeinsamer Reducer verarbeitet kanonische Events; Sessionbesitz und Prozesslebensdauer hängen nicht von einer gemounteten Chat-Komponente ab.
- [ ] Fehler eines Threads stoppen keine anderen Threads; Orchestrator setzt nur normalisierte Commands ab.

**Prüfung:** Zwei gleichzeitige Provider-Turns mit Navigationswechsel und einem Prozessfehler.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-09"></a>

## PROV-09 · Bestehende Daten auf Standardinstanzen migrieren

**Problem und Ziel:** Alte Provider-Keys, Threads, Pins, Drafts, Usage und Jira-Zuordnungen erhalten.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-05, PROV-07

**Akzeptanzkriterien:**

- [ ] Migration ist versioniert, atomar und wiederholbar; codex, claude, cursor und opencode erhalten deterministische Standardinstanzen.
- [ ] Unbekannte Konfigurationen bleiben verlustfrei erhalten; Rückfall auf alte App-Version wird geprüft und bei inkompatiblen Daten erklärt.

**Prüfung:** Kopie alter Fixtures zweimal migrieren und alle IDs sowie Zuordnungen vergleichen.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-10"></a>

## PROV-10 · Bestehende vier Adapter schrittweise hinter die Registry migrieren

**Problem und Ziel:** Claude, Codex, OpenCode und Cursor ohne Featureverlust in das Pattern überführen.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-08, PROV-09

**Akzeptanzkriterien:**

- [ ] Pro Provider existiert eine Vorher-/Nachher-Capability-Matrix; die Codex-lastige AgentChatState-Fassade bleibt nur ein befristeter Kompatibilitätsadapter.
- [ ] Migration kann je Provider aktiviert werden; Terminal-Provider Gemini und Copilot behalten ihre bisherige Oberfläche.

**Prüfung:** Vorhandene Agent-Tests plus Start, History, Send und Stop für alle vier Adapter.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-11"></a>

## PROV-11 · Neutralen Erweiterungstest mit fünftem Test-Treiber liefern

**Problem und Ziel:** Erweiterbarkeit praktisch belegen, statt sie nur im Interface zu behaupten.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P1  
**Herkunft:** Architektur-Erweiterung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-10

**Akzeptanzkriterien:**

- [ ] Ein Fake-CLI-Treiber wird ausschließlich über Factory, Schema und Registrierung ergänzt; Chat-UI und zentraler Orchestrator benötigen keine Provider-Verzweigung.
- [ ] Teilfähigkeiten wie fehlendes Steer oder fehlende Bilder sind im UI korrekt sichtbar und backendseitig abgesichert.

**Prüfung:** Konformitätssuite mit minimalem und vollständigem Fake-Treiber ausführen.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="PROV-12"></a>

## PROV-12 · Provider-SPI und Portierungsleitfaden dokumentieren

**Problem und Ziel:** Weitere CLIs mit reproduzierbaren Schritten und Kompatibilitätsregeln anschließbar machen.

**Bereich:** /agents · Provider-Verträge und erweiterbare Architektur  
**Priorität:** P1  
**Herkunft:** Architektur-Erweiterung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-11

**Akzeptanzkriterien:**

- [ ] Leitfaden beschreibt Registrierung, Transportwahl, Eventnormalisierung, Capabilities, Persistenz, Cleanup und Test-Fixtures.
- [ ] Versionspolitik und Verhalten bei unbekannten Treibern sind erklärt; ein kleines lauffähiges Referenz-Plugin dient als Beispiel, kein ungesichertes Remote-Code-Laden.

**Prüfung:** Neue Integration anhand des Leitfadens gegen PROV-11 nachvollziehen.

**Implementierungsanker in l8git:** `src/lib/agents/provider-registry.ts`, `src/lib/agents/provider-meta.ts`, `src/lib/agents/provider-store.ts`, `src/lib/agents/active-chat-store.ts`, `src/lib/agents/types.ts`, `src-tauri/src/agent_transport.rs`

**Referenz und Übernahmebasis:** [ProviderDriver.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ProviderDriver.ts), [ProviderAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderAdapter.ts), [providerInstance.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/packages/contracts/src/providerInstance.ts), [builtInDrivers.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/builtInDrivers.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
