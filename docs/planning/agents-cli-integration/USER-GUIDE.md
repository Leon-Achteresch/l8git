# Agents CLI integration — user guide

Short setup and usage guide for the `/agents` integration. For the full ticket backlog see [README](README.md).

## Einrichtung

- Installiere die CLI der gewünschten Provider-Instanz (z. B. Claude Code) und stelle sicher, dass sie im `PATH` liegt.
- Öffne `/agents` in l8git und lege eine Instanz an; l8git ruft die native CLI über einen lokalen Prozess auf, Zugangsdaten bleiben auf dem Host.
- Für Worktree-Sessions: `worktreeSessionOptions(path, projectDefaults?)` liefert `cwd`, `instanceId` und `repoPath`; ohne eigene Instanz greifen die dokumentierten Projekt-/Instanzdefaults.

## Permission-Modi

- Jede Provider-Instanz hat eine `approvalPolicy` und einen `sandboxMode`; Änderungen an Dateien oder Befehlsausführung laufen über explizite Zustimmung, solange keine strengere Policy aktiv ist.
- Nicht native Aktionen (z. B. Sprachtranskription ohne verfügbares Backend) werden als klar erkennbarer Fehlerzustand angezeigt statt stillschweigend zu no-op.

## Resume und Fork

- Threads lassen sich über `resume` mit der `nativeSessionId` fortsetzen.
- Ein bereits gemergter oder geschlossener Pull-Request archiviert keine danach fortgesetzte Arbeit; `linkPullRequest` verknüpft bewusst einen anderen PR, `unlinkPullRequest` stellt die automatische Ableitung wieder her.

## Rate-Limits

- Nutzungsdaten laufen über `usage`-Ereignisse (`AgentRateLimits`, primäres/sekundäres Fenster); Fehler- und Rate-Limit-Zustände sind in der mobilen Event-Paritätsmatrix (`mobile/lib/agents/event-parity.ts`) explizit den Capabilities `usage` und `rateLimit` zugeordnet.

## Diagnose-Export

- Terminalkontext lässt sich über `buildTerminalContext(lines, { maxLines, maxChars })` als redigierter, begrenzter Codeblock mit Herkunft (Command, CWD, Host) exportieren; Steuersequenzen werden entfernt, bevor der Block in Chat oder Export landet.
- Transkript-Zitate (`quoteSelection`) behalten Thread-/Item-ID und Auswahlbereich; `resolveQuoteSource` meldet fehlende Quellnachrichten, statt den Zitattext zu verwerfen.

## Grenzen

- Sprachaufnahme (`voice-input.ts`) durchläuft `idle → recording → transcribing → draft`; es gibt keinen Auto-Send, und eine nicht verfügbare Plattform wird über eine injizierbare Verfügbarkeitsprüfung gemeldet statt eine Audiomodalität vorzutäuschen.
