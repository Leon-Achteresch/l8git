# Upstream-Provenienz und Lizenz

[Übersicht](README.md) · Herkunft aller Referenzen in diesem Ordner und Regeln für Übernahmen aus t3code.

## Quelle

- Repository: [pingdotgg/t3code](https://github.com/pingdotgg/t3code)
- Gepinnter Commit: `6c583620ff7ad3235b135af7107c0543467eecfa`
- Referenzierte Dateien: [`ClaudeAdapter.ts`](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts), [`ClaudeAdapter.test.ts`](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), [`ClaudeSkills.test.ts`](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeSkills.test.ts), [`ProviderInstanceRegistryLive.test.ts`](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts), [`ClaudeExecutable.test.ts`](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Drivers/ClaudeExecutable.test.ts)
- Lizenz des Quell-Repositoriums: MIT ([`LICENSE`](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/LICENSE)), Copyright t3.gg / T3 Tools Inc.

## Was aus t3code übernommen wurde

- Testnamen und Zeilenverweise als Referenzidentifikatoren in [REFERENZTESTS.md](REFERENZTESTS.md) und [reference-coverage.json](reference-coverage.json), zur Nachverfolgung von Parität.
- Fachliches Verhalten (welche Events, Subtypes und Operationen existieren und wie sie sich verhalten sollen), dokumentiert in [FEATURE-MATRIX.md](FEATURE-MATRIX.md) und [REFERENCE-INVENTORY.md](REFERENCE-INVENTORY.md).
- Keine Quellcodezeile aus t3code wurde in dieses Planungspaket oder in l8git-Code kopiert. t3code ist Effect/TypeScript/Claude-Agent-SDK; l8git ist Tauri/Rust mit direktem JSONL-/Control-Transport. Eine wörtliche Übernahme wäre kein lauffähiger Port (siehe PROV-01 in [01-prov.md](01-prov.md)).

## Regeln für künftige Übernahmen

1. Jede kopierte oder wesentlich abgeleitete Implementierung (nicht nur Verhalten, sondern tatsächlicher Code oder Algorithmus) muss in einem Commit- und PR-Text Quelle, Commit-Hash und Datei nennen sowie diese Datei aktualisieren.
2. Reiner Verhaltensabgleich (”t3code macht X, wir bauen X analog in Rust“) ist keine Codeübernahme und braucht keinen Lizenzhinweis im Zielcode, aber die Ticket-/Testquelle bleibt in REFERENZTESTS.md/FEATURE-MATRIX.md verlinkt.
3. Wird eine MIT-lizenzierte Passage tatsächlich als Code übernommen, muss der MIT-Copyright- und Lizenzhinweis am Übernahmeort (Kommentar oder begleitende NOTICE-Datei) erhalten bleiben; l8gits eigene Lizenz regelt das Gesamtwerk, ersetzt aber nicht den Herkunftshinweis für die übernommene Passage.
4. Framework-/Laufzeitteile (Effect-Schemas, SDK-Aufrufe) werden nicht ungeprüft kopiert, weil sie technisch nicht auf Tauri/Rust übertragbar sind; nur das beobachtbare Verhalten wird portiert.
5. Der Referenzcommit `6c583620ff7ad3235b135af7107c0543467eecfa` ist fixiert. Ein Wechsel auf einen neueren t3code-Stand ist ein eigener, ausdrücklich dokumentierter Abgleich (neuer Commit-Hash, neue Zeilenverweise), keine stille Aktualisierung bestehender Tickets.
