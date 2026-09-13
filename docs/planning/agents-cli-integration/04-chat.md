# CHAT · Composer und Session-Verwaltung

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="CHAT-01"></a>

## CHAT-01 · Neue Threads eindeutig an Repo und Provider-Instanz binden

**Problem und Ziel:** Thread-Erstellung und ersten Turn mit stabiler Identität versehen.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P0  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-09, RUN-04

**Akzeptanzkriterien:**

- [ ] Vor dem ersten Send sind Host, Repo, Instanz und Settings sichtbar; native SessionId wird erst aus belegter CLI-Zuordnung übernommen.
- [ ] Doppelklick auf Senden erzeugt keinen doppelten Turn; fehlgeschlagener Start erhält den Entwurf.

**Prüfung:** Doppel-Submit, erster Init mit abweichender nativer ID und Startfehler.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-02"></a>

## CHAT-02 · Laufenden Turn gezielt steuern oder Nachricht einreihen

**Problem und Ziel:** Steer und Queue als unterschiedliche, nachvollziehbare Benutzeraktionen anbieten.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-01, RUN-08, PROV-06

**Akzeptanzkriterien:**

- [ ] Bei unterstütztem Steer geht die Nachricht in denselben laufenden Turn; Queue wartet auf dessen Abschluss und zeigt Pending-/Delivered-Status.
- [ ] Nachricht kann vor Versand editiert oder entfernt werden; Reconnect und CLI-Replay bestätigen anhand ID statt bloß der ältesten Nachricht.

**Prüfung:** Drei Nachrichten, Reihenfolge, Sendefehler und wiederholtes User-Echo prüfen.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-03"></a>

## CHAT-03 · Abbrechen und nach Abbruch fortsetzen

**Problem und Ziel:** Stop-Schaltfläche und Fortsetzung konsistent über Sessionzustände führen.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P0  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** RUN-07, HIST-02

**Akzeptanzkriterien:**

- [ ] Benutzerabbruch erscheint als interrupted; offene Tools und Fragen erhalten einen terminalen Zustand.
- [ ] Erneutes Senden setzt denselben kompatiblen Thread fort; Antwort auf alte Frage startet keinen abgeschlossenen Turn neu.

**Prüfung:** Stop während Text, Tool und Frage jeweils mit anschließendem Resume.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-04"></a>

## CHAT-04 · Entwürfe pro Host, Instanz und Thread erhalten

**Problem und Ziel:** Text, Attachments und Composer-Einstellungen beim Navigieren erhalten.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-09, CHAT-01

**Akzeptanzkriterien:**

- [ ] Thread- und Providerwechsel mischen keine Drafts; Neustart stellt nicht gesendeten Text wieder her.
- [ ] Gelöschte Dateien oder fehlende Instanzen werden als reparierbarer Zustand angezeigt; erfolgreich bestätigtes Senden leert nur den richtigen Draft.

**Prüfung:** Zwischen zwei Hosts mit gleichnamigem Thread wechseln und App neu laden.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-05"></a>

## CHAT-05 · Datei-, Ordner- und Codebereich-Erwähnungen anschließen

**Problem und Ziel:** Kontext gezielt aus Repository, Diff und Editor an Claude übergeben.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-01, SEC-02

**Akzeptanzkriterien:**

- [ ] Erwähnungen enthalten aufgelösten Pfad, optional Zeilenbereich und Quelle; Suche berücksichtigt Repo-/Worktree-Kontext.
- [ ] Pfadreferenz wird nicht als implizite Zugriffsfreigabe behandelt; verschwundene und nicht zugängliche Dateien sind vor Send erkennbar.

**Prüfung:** Unicode-Pfad, gelöschte Datei, Symlink außerhalb Repo und mehrzeiliger Codebereich.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-06"></a>

## CHAT-06 · Bilder über Datei, Einfügen und Drag-and-drop senden

**Problem und Ziel:** Vorhandene Bildfähigkeit vollständig vom Composer bis zum Claude-Inhalt prüfen.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-01, EXT-02

**Akzeptanzkriterien:**

- [ ] Unterstützte Bildformate werden als native Content-Blöcke mit Vorschau, Entfernen und dokumentierten Größenlimits gesendet.
- [ ] Attachments stehen so vor dem letzten Befehls-Textblock, dass Slash- und Skill-Expansion erhalten bleibt.

**Prüfung:** Mehrere Bilder plus Skill, falscher MIME-Typ, Größenlimit und korrupte Datei.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-07"></a>

## CHAT-07 · Allgemeine Datei- und Dokumentanhänge einführen

**Problem und Ziel:** PDFs, Text und andere unterstützte Dateien getrennt von bloßen Erwähnungen behandeln.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-05, RUN-09, SEC-02

**Akzeptanzkriterien:**

- [ ] Uploads werden hostseitig außerhalb des Repo gespeichert; Adapter wählt dokumentiertes natives Format oder offen gekennzeichnete Pfadreferenz.
- [ ] Limits, Aufbewahrung, Löschung und ältere Client-Versionen sind berücksichtigt; kein Kopieren ins Repo zur Umgehung von Permissions.

**Prüfung:** Remote-Upload mit PDF, fehlender Datei und älterem Client-Schema.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-08"></a>

## CHAT-08 · CLI-Befehle und App-Slash-Commands eindeutig routen

**Problem und Ziel:** Lokale Aktionen und von Claude veröffentlichte Commands ohne Namenskonflikte verfügbar machen.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-06, EXT-02, RUN-04

**Akzeptanzkriterien:**

- [ ] Katalog zeigt Name, Alias, Argumenthinweis, Herkunft und Verfügbarkeit; ein CLI-Command wird nicht versehentlich von einem App-Alias verschluckt.
- [ ] TUI-only-Befehle erhalten Terminal-Handoff; unterstützte Befehle werden mit unverändertem Argumenttext gesendet.

**Prüfung:** Kollidierendes /clear, unbekannter Slash, quoted Argument und Commands-Refresh.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-09"></a>

## CHAT-09 · Prompt-Vorschläge und Folgeaktionen darstellen

**Problem und Ziel:** Vom Provider angebotene Prompt-Suggestions als bearbeitbare Vorschläge anbieten.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P2  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-04, EVT-01

**Akzeptanzkriterien:**

- [ ] Vorschläge werden dem richtigen abgeschlossenen Turn zugeordnet und verfallen bei neuer Eingabe.
- [ ] Klick übernimmt in den Composer; keine automatische Sendung und kein Ersatz eigener Entwürfe.

**Prüfung:** Später Vorschlag nach Threadwechsel und existierender Draft.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-10"></a>

## CHAT-10 · Thread-Liste mit Suche, Pins, Archiv und Titel vervollständigen

**Problem und Ziel:** Vorhandene Thread-Verwaltung für mehrere Instanzen und große History erhalten.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** PROV-09, HIST-01, RUN-07

**Akzeptanzkriterien:**

- [ ] Suchen, Umbenennen, Pin, Archivieren und Wiederherstellen behalten stabile Identitäten; Statusfilter berücksichtigen laufend und wartet auf Antwort.
- [ ] Löschen unterscheidet l8git-Metadaten und native History; aktive Session wird geordnet beendet und Umfang der Löschung angezeigt.

**Prüfung:** Zwei gleichnamige Threads, Archiv mit aktiver Session und fehlgeschlagene native Löschung.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-11"></a>

## CHAT-11 · Nachrichten kopieren, exportieren und gezielt erneut senden

**Problem und Ziel:** Kleine Chat-Aktionen inklusive fehlgeschlagenem Turn sauber definieren.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P2  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-02, HIST-04, SEC-06

**Akzeptanzkriterien:**

- [ ] Kopie und Markdown-/JSON-Export erhalten Text, Tool-Zusammenfassungen und Anhänge als Referenzen; private Thinking-Signaturen werden entfernt.
- [ ] Retry ist eine bewusste Aktion mit Hinweis bei unklarem Annahmestatus; Edit-and-resend nutzt Fork/Rollback statt Historie still umzuschreiben.

**Prüfung:** Fehlgeschlagener Send, unklarer Ack und Export eines Threads mit Toolfehlern.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="CHAT-12"></a>

## CHAT-12 · Tastatur, Fokus, Sprache und Zugänglichkeit abschließen

**Problem und Ziel:** Composer, Menüs, Fragen und Statusanzeigen vollständig bedienbar machen.

**Bereich:** /agents · Composer und Session-Verwaltung  
**Priorität:** P1  
**Herkunft:** l8git-Bestand / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-08, ASK-03, UX-02

**Akzeptanzkriterien:**

- [ ] Send/Zeilenumbruch, Escape/Stop und Command-Picker funktionieren mit Fokusregeln; Screenreader bekommen sinnvolle Zustandswechsel ohne Token-Spam.
- [ ] Alle neuen Texte nutzen vorhandene Locale-Struktur; lange Namen und kleine Fenster zerstören keine Bedienflächen.

**Prüfung:** Tastatur-E2E und manuelle Screenreader-Abnahme in Deutsch und Englisch.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/session-catalog.ts`, `src-tauri/src/claude.rs`, `src/lib/agents/providers/claude/chat-store.ts`

**Referenz und Übernahmebasis:** [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [ProviderSessionDirectory.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Services/ProviderSessionDirectory.ts), [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
