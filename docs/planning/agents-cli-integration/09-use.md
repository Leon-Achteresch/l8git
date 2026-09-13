# USE · Kontext, Token, Kosten und Limits

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="USE-01"></a>

## USE-01 · Turn-Usage, Session-Summen und aktive Kontextgröße trennen

**Problem und Ziel:** Kumulierte Token nicht als belegtes Kontextfenster interpretieren.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-11, RUN-08

**Akzeptanzkriterien:**

- [ ] input, output, cache-read und cache-write werden getrennt pro Turn erfasst; Kontextzähler und insgesamt verarbeitete Tokens sind eigene Felder.
- [ ] Wiederholte Resultate und geladene History erhöhen das Ledger nicht erneut; fehlende Cachezähler tragen 0 zur Summe bei; unbekannte Messwerte bleiben gesondert gekennzeichnet.

**Prüfung:** Zwei Turns, Replay, Historyimport und Resultat ohne Cachefelder.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="USE-02"></a>

## USE-02 · Kontextanzeige aus autoritativen Usage-Daten ableiten

**Problem und Ziel:** Kontextmeter mit realem Modellfenster und Compaction-Zustand anzeigen.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** USE-01, MOD-01

**Akzeptanzkriterien:**

- [ ] Prozent basiert auf aktiven Tokens und bestätigtem Fenster; unbekannt bleibt unbekannt statt erfundener Kapazität.
- [ ] Anzeige kann auf 100 Prozent begrenzt sein, Rohsummen bleiben ungekürzt; spätes altes Assistant-Frame überschreibt keine jüngere Compaction-Messung.

**Prüfung:** Oversized-Usage, unbekanntes Fenster und out-of-order Compaction/Assistant.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="USE-03"></a>

## USE-03 · Manuelle Kompaktierung mit Fortschritt anbieten

**Problem und Ziel:** /compact und Kontextmeter-Aktion in einen einheitlichen Ablauf führen.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01, USE-02, CHAT-08

**Akzeptanzkriterien:**

- [ ] Capability entscheidet native Operation oder Slash-Turn; Start, Erfolg und Fehler erscheinen im Verlauf.
- [ ] compact_boundary wird auch unter system erkannt; Kompaktierung verändert keine Usage-Gesamthistorie und startet keinen doppelten User-Turn.

**Prüfung:** Compact im langen Thread, Abbruch und älterer Assistant-Snapshot danach.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="USE-04"></a>

## USE-04 · Auto-Compact und Resume-Compact konfigurierbar machen

**Problem und Ziel:** CLI-Default, explizite Schwelle und Rückfrage beim Resume abbilden.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** USE-03, ASK-05, SET-05

**Akzeptanzkriterien:**

- [ ] Unterstützte Schwellen werden anhand getesteter CLI validiert; Setting verändert Kompaktierungszeitpunkt, nicht Modellkapazität.
- [ ] Resume-Compact-Rückfrage nutzt gemeinsame Question-UI und merkt gewählte Präferenz nur im erklärten Scope.

**Prüfung:** Leere Einstellung, ungültige Schwelle und Ablehnen einer Resume-Compaction.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="USE-05"></a>

## USE-05 · Kostenanzeige mit Herkunft und Instanzzuordnung ausbauen

**Problem und Ziel:** Tatsächliche Providerkosten und lokal geschätzte Kosten unterscheidbar machen.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** USE-01, MOD-01

**Akzeptanzkriterien:**

- [ ] Pro Turn, Tag, Modell und Instanz sind Tokens und Kosten aggregierbar; Schätzung ist gekennzeichnet und unbekannter Preis bleibt offen.
- [ ] Preisquelle/Stand und Währung sind sichtbar; Abonnementverbrauch wird nicht als tatsächlich belasteter API-Preis ausgegeben.

**Prüfung:** Gemischte Modelle, unbekannter Preis und dupliziertes Resultat.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="USE-06"></a>

## USE-06 · Rate-Limit-Ereignisse mit Reset und Wartezustand darstellen

**Problem und Ziel:** Parkenden Turn von einem Fehler oder endlos arbeitenden Agent unterscheiden.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-01, EVT-11, CHAT-03

**Akzeptanzkriterien:**

- [ ] rate_limit_event zeigt betroffenen Bucket, Beobachtungszeit und plausiblen Reset; mehrere Fenster bleiben getrennt.
- [ ] Wiederholungen werden pro Turn/Bucket dedupliziert; malformed Reset entfernt nicht die Warnung; Stop bleibt möglich.

**Prüfung:** Interleaving zweier Limits, ungültiger Reset und derselbe Grenzwert im nächsten Turn.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="USE-07"></a>

## USE-07 · Subscription- und Overage-Limits instanzgebunden anzeigen

**Problem und Ziel:** Bestehenden Usage-Fetch mit Live-Limits und Accountkontext verbinden.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** SET-02, USE-06

**Akzeptanzkriterien:**

- [ ] Cache, Refresh und Resetdaten gehören zur richtigen Instanz; benannte Modell-Buckets werden aus Providerdaten abgeleitet.
- [ ] Abgelaufenes Login, fehlende Berechtigung und erschöpfte Overage-Nutzung sind sichtbar; kein Credential-Inhalt geht ans Frontend.

**Prüfung:** Zwei Accounts und erschöpfte Overage bei gleichzeitigem Modelllimit.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="USE-08"></a>

## USE-08 · Retries und Wiederaufnahme ohne doppelte Arbeit behandeln

**Problem und Ziel:** api_retry und temporäre Überlastung im Turn darstellen.

**Bereich:** /agents · Kontext, Token, Kosten und Limits  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** USE-06, RUN-08

**Akzeptanzkriterien:**

- [ ] Retry-Versuch, Verzögerung und Fehlerkategorie werden angezeigt; CLI-eigener Retry löst keinen zweiten App-Send aus.
- [ ] Nach terminalem Fehler bleibt Wiederholung bewusst; kein automatischer Provider-/Accountwechsel und keine erneute Toolfreigabe durch Replay.

**Prüfung:** 429/529 mit CLI-Retry, Limitende und Disconnect vor Resultat.

**Implementierungsanker in l8git:** `src/lib/agents/usage-ledger.ts`, `src/lib/agents/token-cost.ts`, `src/lib/agents/rate-limits.ts`, `src-tauri/src/claude_usage.rs`, `src/components/agents/ui/agent-context-usage.tsx`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [claudeUsageLimits.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.ts), [claudeUsageLimits.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/claudeUsageLimits.test.ts), [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [usage.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/usage.md), [providers-claude.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/providers-claude.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
