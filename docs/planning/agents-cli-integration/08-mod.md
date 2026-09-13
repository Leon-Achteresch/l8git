# MOD · Modelle, Thinking und Laufzeitoptionen

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="MOD-01"></a>

## MOD-01 · Dynamischen Modellkatalog pro Instanz bereitstellen

**Problem und Ziel:** Vom CLI veröffentlichte Modelle und capabilities statt fixer Annahmen verwenden.

**Bereich:** /agents · Modelle, Thinking und Laufzeitoptionen  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-03, PROV-06

**Akzeptanzkriterien:**

- [ ] Modelle zeigen Label, native ID, Default und unterstützte Optionen; Katalog ist nach Instanz/Config/Version isoliert und manuell aktualisierbar.
- [ ] Autoritativ leerer Katalog leert veraltete Einträge; Offline-Fallback ist ausdrücklich als Cache markiert.

**Prüfung:** Zwei Accounts, leerer Refresh, Offlinezustand und nachträglich entzogenes Modell.

**Implementierungsanker in l8git:** `src/lib/agents/model-catalog.ts`, `src/lib/agents/providers/claude/client.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-model-menu.tsx`, `src/components/agents/composer/composer-effort-popover.tsx`, `src/lib/agents/provider-meta.ts`

**Referenz und Übernahmebasis:** [ClaudeModelCatalog.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelCatalog.ts), [ClaudeModelManifest.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelManifest.ts), [ClaudeCapabilitiesProbe.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeCapabilitiesProbe.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="MOD-02"></a>

## MOD-02 · Modellwechsel in laufender Session korrekt anwenden

**Problem und Ziel:** set_model mit bestätigtem UI-Zustand und effektivem Modell verbinden.

**Bereich:** /agents · Modelle, Thinking und Laufzeitoptionen  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** MOD-01, RUN-05

**Akzeptanzkriterien:**

- [ ] Wechsel erfolgt nur bei unterstützter Sessionfähigkeit; unverändertes effektives Modell löst keinen unnötigen Request aus.
- [ ] CLI-Ablehnung setzt die Anzeige zurück; tatsächliche Modell-ID aus Antworten kann Alias-Auswahl ergänzen, ohne sie zu zerstören.

**Prüfung:** Zwei Aliase für dieselbe API-ID und fehlgeschlagener Modellwechsel.

**Implementierungsanker in l8git:** `src/lib/agents/model-catalog.ts`, `src/lib/agents/providers/claude/client.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-model-menu.tsx`, `src/components/agents/composer/composer-effort-popover.tsx`, `src/lib/agents/provider-meta.ts`

**Referenz und Übernahmebasis:** [ClaudeModelCatalog.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelCatalog.ts), [ClaudeModelManifest.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelManifest.ts), [ClaudeCapabilitiesProbe.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeCapabilitiesProbe.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="MOD-03"></a>

## MOD-03 · Effort, Thinking-Toggle und Thinking-Budget differenzieren

**Problem und Ziel:** Unterschiedliche Claude-Steuerungsmechanismen passend zum Modell darstellen.

**Bereich:** /agents · Modelle, Thinking und Laufzeitoptionen  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** MOD-01, MOD-02

**Akzeptanzkriterien:**

- [ ] Auswählbar sind nur bestätigte Effort-Stufen; Budget, adaptives Thinking und Ein/Aus werden als unterschiedliche Fähigkeiten modelliert.
- [ ] Prompt-Schlüsselwörter wie ultrathink werden, falls unterstützt, nicht als native Effort-Stufe gesendet; /compact bleibt unverändert.

**Prüfung:** Unterstützendes und nicht unterstützendes Modell, Zahlenbudget und Compact mit Prompt-Effort.

**Implementierungsanker in l8git:** `src/lib/agents/model-catalog.ts`, `src/lib/agents/providers/claude/client.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-model-menu.tsx`, `src/components/agents/composer/composer-effort-popover.tsx`, `src/lib/agents/provider-meta.ts`

**Referenz und Übernahmebasis:** [ClaudeModelCatalog.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelCatalog.ts), [ClaudeModelManifest.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelManifest.ts), [ClaudeCapabilitiesProbe.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeCapabilitiesProbe.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="MOD-04"></a>

## MOD-04 · Claude-Fast-Modus capability-basiert freischalten

**Problem und Ziel:** Codex-only-Gate für /fast durch wirkliche Providerfähigkeit ersetzen.

**Bereich:** /agents · Modelle, Thinking und Laufzeitoptionen  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** MOD-01, CHAT-08

**Akzeptanzkriterien:**

- [ ] Fast wird nur für bestätigte Claude-Modelle angeboten und als gesonderte Option gespeichert.
- [ ] Aktivierung wirkt im tatsächlichen Start-/Turn-Aufruf; unbekannte oder abgelehnte Option wird nicht still ignoriert.

**Prüfung:** Referenzfall Fast unterstützt/unsupported und persistierte Einstellung nach Modellwechsel.

**Implementierungsanker in l8git:** `src/lib/agents/model-catalog.ts`, `src/lib/agents/providers/claude/client.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-model-menu.tsx`, `src/components/agents/composer/composer-effort-popover.tsx`, `src/lib/agents/provider-meta.ts`

**Referenz und Übernahmebasis:** [ClaudeModelCatalog.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelCatalog.ts), [ClaudeModelManifest.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelManifest.ts), [ClaudeCapabilitiesProbe.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeCapabilitiesProbe.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="MOD-05"></a>

## MOD-05 · Eigene Modell-IDs, Aliase und Fallbacks erhalten

**Problem und Ziel:** Router- und Enterprise-Modelle ohne unerwünschte Normalisierung nutzen.

**Bereich:** /agents · Modelle, Thinking und Laufzeitoptionen  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** MOD-01, SET-06, EVT-01

**Akzeptanzkriterien:**

- [ ] Benutzerdefinierte Modell-ID bleibt opak; automatische Klassifizierung ersetzt weder Alias noch Endpoint.
- [ ] Expliziter Fallback bzw. vom Provider gemeldeter Refusal-Fallback zeigt angefragtes und verwendetes Modell; kein stiller Wechsel in einen anderen Account.

**Prüfung:** Custom-Alias mit Namenskollision und model_refusal_fallback-Ereignis.

**Implementierungsanker in l8git:** `src/lib/agents/model-catalog.ts`, `src/lib/agents/providers/claude/client.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-model-menu.tsx`, `src/components/agents/composer/composer-effort-popover.tsx`, `src/lib/agents/provider-meta.ts`

**Referenz und Übernahmebasis:** [ClaudeModelCatalog.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelCatalog.ts), [ClaudeModelManifest.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelManifest.ts), [ClaudeCapabilitiesProbe.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeCapabilitiesProbe.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="MOD-06"></a>

## MOD-06 · System-Prompt, zusätzliche Regeln und Settings-Scope konfigurieren

**Problem und Ziel:** CLI-unterstützte Session-Instruktionen als typisierte Optionen anbieten.

**Bereich:** /agents · Modelle, Thinking und Laufzeitoptionen  
**Priorität:** P1  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-05, SEC-01

**Akzeptanzkriterien:**

- [ ] Append versus Replace sowie Datei versus Text sind eindeutig; wirksame Setting-Sources folgen Trust- und Managed-Regeln.
- [ ] Große Prompts werden nicht in Diagnose-Argumentlisten offengelegt; Änderungen bestehender Session werden nach bestätigter CLI-Semantik angewandt.

**Prüfung:** Append, Replace, fehlende Promptdatei und nicht vertrautes Repo mit Hook-Settings.

**Implementierungsanker in l8git:** `src/lib/agents/model-catalog.ts`, `src/lib/agents/providers/claude/client.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-model-menu.tsx`, `src/components/agents/composer/composer-effort-popover.tsx`, `src/lib/agents/provider-meta.ts`

**Referenz und Übernahmebasis:** [ClaudeModelCatalog.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelCatalog.ts), [ClaudeModelManifest.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelManifest.ts), [ClaudeCapabilitiesProbe.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeCapabilitiesProbe.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="MOD-07"></a>

## MOD-07 · Turn-Budget, Max-Turns und strukturierte Ausgabe anbieten

**Problem und Ziel:** Automatisierungsoptionen der CLI kontrolliert nutzbar machen.

**Bereich:** /agents · Modelle, Thinking und Laufzeitoptionen  
**Priorität:** P2  
**Herkunft:** Erweiterung / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-06, EVT-11, USE-01

**Akzeptanzkriterien:**

- [ ] JSON-Schema-Ausgabe, begrenzte Turns und Kostenlimit sind einzelne Capabilities; ungültige Schemas und nicht unterstützte Kombinationen werden vor Start abgewiesen.
- [ ] Budget-Ende und strukturierte Ausgabe mit erschöpften Retries werden als eigene Resultate angezeigt; Default-Chat wird nicht unbemerkt begrenzt.

**Prüfung:** Valides/invalides Schema, Max-Turns erreicht und Budgetterminal ohne erfolgreichen Text.

**Implementierungsanker in l8git:** `src/lib/agents/model-catalog.ts`, `src/lib/agents/providers/claude/client.ts`, `src/lib/agents/providers/claude/chat-store.ts`, `src/components/agents/composer/composer-model-menu.tsx`, `src/components/agents/composer/composer-effort-popover.tsx`, `src/lib/agents/provider-meta.ts`

**Referenz und Übernahmebasis:** [ClaudeModelCatalog.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelCatalog.ts), [ClaudeModelManifest.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/ClaudeModelManifest.ts), [ClaudeCapabilitiesProbe.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeCapabilitiesProbe.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
