# DETAIL · Kleine Bedienfunktionen aus t3code

[Zur Gesamtübersicht](README.md)

Alle Tickets sind Entwürfe. „Ausbau“ bestätigt vorhandene Ansatzpunkte, nicht bereits bestandene Feature-Parität. Referenzen beschreiben das Vorbild; sie garantieren keine identische direkte CLI-Schnittstelle.

<a id="DETAIL-01"></a>

## DETAIL-01 · Gesendete Prompts mit Pfeiltasten wiederaufrufen

**Problem und Ziel:** Prompt-History im Composer ohne Konflikt mit Caretnavigation anbieten.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-04, CHAT-12

**Akzeptanzkriterien:**

- [ ] Leerer Composer ruft vorherige Texte auf; Up/Down navigiert nur unter definierten Caretbedingungen und respektiert visuell umgebrochene Zeilen.
- [ ] Bearbeiten beendet Recall-Modus; Anhänge gelten nicht als leerer Composer und werden nicht unbeabsichtigt erneut angehängt.

**Prüfung:** Mehrzeiliger Prompt, Attachment-only-Draft und Bearbeitung eines Recall-Texts.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-02"></a>

## DETAIL-02 · Prompt-Stash mit mehreren gespeicherten Entwürfen anbieten

**Problem und Ziel:** Text und Anhänge für spätere Verwendung zwischenparken.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-04, CHAT-07

**Akzeptanzkriterien:**

- [ ] Tastenkürzel speichert erst nach abgeschlossenen Uploads; ein Stash wird direkt, mehrere über Auswahl wiederhergestellt.
- [ ] Stashes behalten Hostbindung; fehlende/abgelaufene Uploads erlauben erneutes Anhängen oder Entfernen, ohne Text zu verlieren.

**Prüfung:** Zwei Stashes, anderer Host und abgelaufener Dateianhang.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-03"></a>

## DETAIL-03 · Assistant-Ausschnitte zitieren und zur Quelle springen

**Problem und Ziel:** Selektierten Antworttext mit eigener Anmerkung in den Composer übernehmen.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-11, HIST-06

**Akzeptanzkriterien:**

- [ ] Zitat speichert Text, Thread-/Message-ID und Quellenbereich; gesendetes Zitat führt zur passenden Stelle zurück.
- [ ] Gelöschte oder geänderte Quelle lässt gespeicherten Text lesbar; nicht unterstützte Mobile-Aktion wird nicht als vorhanden angeboten.

**Prüfung:** Zitat aus gestreamter Antwort, nachträgliches Fork und fehlende Quellnachricht.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-04"></a>

## DETAIL-04 · Dateien direkt an Frageantworten anhängen

**Problem und Ziel:** Freitextantworten mit Datei-/Bildkontext ergänzen.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P1  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** ASK-05, CHAT-07

**Akzeptanzkriterien:**

- [ ] Jede Frage besitzt eigenen Draft und Attachments; Auswahl, Text und Datei lassen sich nach unterstütztem Fragevertrag kombinieren.
- [ ] Uploadfehler blockieren Submit mit reparierbarem Draft; reine Auswahlfragen bieten keine nicht unterstützten Anhänge und normaler Composer bleibt separat.

**Prüfung:** Zwei Fragen, fehlgeschlagener Upload und wiederholtes Antworten nach Netzwerkfehler.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-05"></a>

## DETAIL-05 · Medien und erzeugte Dateien öffnen, speichern und teilen

**Problem und Ziel:** Bild-/Video-/PDF-/HTML-Ausgaben direkt aus dem Verlauf untersuchen.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** EVT-05, CHAT-07, SEC-06

**Akzeptanzkriterien:**

- [ ] Unterstützte Medien besitzen Vorschau und Save/Share; nicht unterstützte Wiedergabe bietet einen Download-/Open-Handoff.
- [ ] Externe Dateipfade werden nur nach Autorisierung read-only angezeigt; HTML-Vorschau erhält keinen Zugriff auf App-Session oder Nachbardateien.

**Prüfung:** Remote-PDF, gelöschtes Video und HTML mit Script sowie relativer Ressource.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-06"></a>

## DETAIL-06 · Screenshot-Kontext aus Desktop und Zwischenablage übernehmen

**Problem und Ziel:** UI-Probleme mit gezielt gewähltem Bildschirmbereich an den Agent geben.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-06, SEC-06

**Akzeptanzkriterien:**

- [ ] Aufnahme zeigt Vorschau vor Send; optionale App-Texterkennung ist gesondert sichtbar und abschaltbar.
- [ ] Plattformberechtigungen, Abbruch und nicht unterstützte Capture-Umgebung liefern klare Rückmeldung; Aufnahme startet keinen Prompt automatisch.

**Prüfung:** Capture-Abbruch, verweigerte OS-Berechtigung und Bild plus vorhandenem Draft.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-07"></a>

## DETAIL-07 · Spracheingabe als bearbeitbaren Prompt anbieten

**Problem und Ziel:** Vorhandene Audio-Aktion auf tatsächlich unterstützte lokale Transkription oder klaren Handoff abbilden.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Versionsprüfung  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-04, UX-04

**Akzeptanzkriterien:**

- [ ] Transkript wird an Auswahlposition eingefügt und erst nach Review gesendet; unterstützte Plattformen und Sprachen sind ausgewiesen.
- [ ] Abbruch, Audio-Unterbrechung und Navigation erhalten bisherigen Draft und räumen temporäres Audio auf; keine vorgetäuschte Claude-Audiomodalität.

**Prüfung:** Unterbrochene Aufnahme und nicht unterstützte Plattform.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-08"></a>

## DETAIL-08 · Thread-Reihenfolge, Snooze und Settle synchronisieren

**Problem und Ziel:** Feine Threadorganisation zusätzlich zu Pin und Archiv anbieten.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-10, UX-03, TASK-04

**Akzeptanzkriterien:**

- [ ] Reorder funktioniert per Drag und Tastaturaktion; Pin, Unpin, Snooze, Wake, Settle und Un-settle behalten definierte Positionen.
- [ ] Reihenfolge wird hostseitig gespeichert; automatische Ablage betrifft keine aktiven Turns, offenen Approvals oder laufenden Subagents.

**Prüfung:** Cross-Device-Reorder, Drop über Bereichsgrenze und offene Frage beim Auto-Settle.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-09"></a>

## DETAIL-09 · Threadsuche und Verweise über mehrere Hosts ergänzen

**Problem und Ziel:** Threadtitel und sichtbare Nachrichten über die Command-Palette finden.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-10, HIST-06, UX-03

**Akzeptanzkriterien:**

- [ ] Ergebnisse zeigen Host/Instanz/Repo und springen zum passenden Thread bzw. Nachricht; Index berücksichtigt tatsächlichen sichtbaren Inhalt.
- [ ] Offlinehost und gelöschte Nachricht bleiben nachvollziehbar; keine Suche über fremde nicht autorisierte Hosts.

**Prüfung:** Gleichnamige Threads, Nachrichtenfund und offline befindlicher Host.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-10"></a>

## DETAIL-10 · PR-Verknüpfung und Projektdefaults für Agentthreads übernehmen

**Problem und Ziel:** Arbeitskontext und Startdefaults mit vorhandener Git-Oberfläche verbinden.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** GIT-01, GIT-05, DETAIL-08

**Akzeptanzkriterien:**

- [ ] Thread kann Branch-PR erkennen oder bewusst anderen PR verknüpfen; neuer Thread nutzt dokumentierte Projekt-/Instanzdefaults.
- [ ] Merge-/Close-Zustand archiviert keine inzwischen fortgesetzte Arbeit; Unlink stellt Defaultableitung wieder her.

**Prüfung:** Bereits gemergter PR mit neuer Aktivität und anderes Projekt mit eigenem Modelldefault.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.

<a id="DETAIL-11"></a>

## DETAIL-11 · Terminalausgabe als Promptkontext mitgeben

**Problem und Ziel:** Ausgewählte Terminalausgabe, Command und CWD in Agentfrage übernehmen.

**Bereich:** /agents · Kleine Bedienfunktionen aus t3code  
**Priorität:** P2  
**Herkunft:** T3-Referenz / Ausbau  
**Status:** Entwurf – nicht implementiert/abgenommen durch dieses Ticketpaket  
**Abhängigkeiten:** CHAT-05, EVT-06, SEC-06

**Akzeptanzkriterien:**

- [ ] Kontext wird als Vorschau im Composer gezeigt und bleibt von neuen Eingaben getrennt; Auswahlumfang ist begrenzt und kopierbar.
- [ ] Terminal-Reconnect erhält begrenzten Scrollback; terminaleigene Steuersequenzen führen in Chat und Export nichts aus.

**Prüfung:** ANSI-Ausgabe, langer Scrollback und Terminal auf anderem Host.

**Implementierungsanker in l8git:** `src/routes/agents.tsx`, `src/components/agents/composer/agent-composer.tsx`, `src/components/agents/sidebar/agents-sidebar.tsx`, `src/lib/agents/composer-drafts.ts`, `src/lib/agents/transcript-rows.ts`

**Referenz und Übernahmebasis:** [composer.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/composer.md), [question-attachments.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/question-attachments.md), [thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/thread-sidebar.md), [snap-shot.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/user/snap-shot.md), [assistant-citations.md](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/docs/internals/assistant-citations.md)

**Abnahmehinweis:** Bestehendes Verhalten zuerst gegen diese Kriterien prüfen und nur die Lücke implementieren. Nicht unterstützte native Operationen benötigen einen nachgewiesenen Capability-Status; keine stillen No-ops. Die Referenz ist auf Commit `6c583620ff7ad3235b135af7107c0543467eecfa` fixiert.
