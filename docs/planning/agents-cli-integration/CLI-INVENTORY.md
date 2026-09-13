# CLI-Inventar-Ergänzungen (CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08, CLI-09, CLI-10)

Ergänzt [17-cli.md](17-cli.md) um die tatsächlich implementierten Inventar-Einträge in `src/lib/agents/cli-commands.ts`.

## CLI-07 · Administrationsflächen

`install-github-app`, `runner`, `gateway` sind als `scope: "admin"` in `CLAUDE_CLI_COMMAND_INVENTORY` erfasst. `cliCommandCapability` liefert für sie immer `status: "unsupported"` mit `reason: "Administrationsfläche, nicht in /agents"`. l8git startet diese Flächen nicht aus `/agents`; sie benötigen einen eigenständigen Terminal-Handoff außerhalb des Chats.

## CLI-03 · Native Chrome- und IDE-Anbindungen

`chrome` und `ide` sind als eigenständige `scope: "chat"`-Einträge in `CLAUDE_CLI_COMMAND_INVENTORY` erfasst. `nativeIntegrationCapability(name, platform)` liefert je Plattform (`macos` | `windows` | `linux`) getrennt `supported`/`unsupported`. `buildClaudeLaunchArgs` akzeptiert `{ chrome?, ide? }` und setzt `--chrome`/`--ide` nur, wenn die Capability `supported` ist; sonst landet ein Grund in `warnings`, kein stiller No-op.

## CLI-04 · MCP-Channels und asynchrone externe Eingaben

`channels` ist als `scope: "admin"` mit `unsupportedReason` erfasst. `channelInputCapability(version)` liefert unabhängig von der Version immer `status: "unsupported"` mit demselben Grund, da MCP-Channel-Eingaben kein Default-Vertrauenspfad in `/agents` sind.

## CLI-05 · Wiederkehrende Aufgaben und native Automatisierungen

`schedule` ist als `scope: "admin"` mit `unsupportedReason` erfasst; `cliCommandCapability("schedule", ...)` liefert `unsupported`. Das Datenmodell `ScheduledTaskSummary` (`id`, `name`, `schedule`, `status`, optional `lastRunAt`/`nextRunAt`) steht für eine spätere reine Anzeige bereit, ohne eigene Ausführungslogik.

## CLI-06 · Native Remote-/Cloud-Sessions

`remote` ist als `scope: "admin"` mit `unsupportedReason: "Native Remote-/Cloud-Sessions sind eine eigene Remote-Ebene, getrennt von l8git-Remote"` erfasst. `classifySessionOrigin(sessionMeta)` ist eine reine Funktion und liefert `local` | `nativeRemote` | `l8gitRemote`; bei widersprüchlichen Flags gewinnt `l8gitRemote`.

## CLI-08 · Tool-Policies und exklusive MCP-/Plugin-Konfiguration

`buildClaudeLaunchArgs` akzeptiert zusätzlich `allowedTools[]` → `--allowedTools`, `disallowedTools[]` → `--disallowedTools`, `strictMcpConfig?` → `--strict-mcp-config` und `mcpConfigPaths[]` → wiederholte `--mcp-config`-Flags. Überschneiden sich `allowedTools` und `disallowedTools`, wirft die Funktion einen Fehler statt eines stillen No-ops.

## CLI-09 · Modell- und Output-Optionen

`buildClaudeLaunchArgs` akzeptiert zusätzlich:

- `outputFormat` (`text` | `json` | `stream-json`) → `--output-format`
- `jsonSchema` → `--json-schema`, nur zulässig wenn `outputFormat === "json"`, sonst Fehler
- `maxTurns` → `--max-turns`, muss `>= 1` sein
- `model` / `fallbackModel` → `--model` / `--fallback-model`; `fallbackModel` setzt `model` voraus und muss sich von ihm unterscheiden
- `thinkingEffort` → `--thinking-effort`

## TASK-08 · Native Background-Sessions und Agent-Teams

`nativeBackgroundSessionCapability(cliVersion)` in `src/lib/agents/capability-types.ts` liefert unabhängig von der übergebenen CLI-Version immer `status: "unsupported"` mit dem Grund, dass Discovery, Logs, Attach, Stop, Respawn, Entfernen und Team-Kommunikation für native Background-Sessions/Agent-Teams in l8git keinen nachgewiesenen Transport haben. Die übergebene `cliVersion` wird als `minVersion` durchgereicht, damit eine spätere Freischaltung an eine konkrete CLI-Version gebunden werden kann, statt eine globale Daemon-Aktion mit einer normalen Thread-Stop-Implementierung zu verwechseln. Kein Feature-Bau, kein stiller No-op: der Aufrufer erhält immer den Unsupported-Status samt Begründung.

## CLI-10 · Provider-Feedback

`buildFeedbackPreview({ message, diagnostics })` ist eine reine Funktion: sie redigiert bekannte Secret-Muster (`sk-...`, `ghp_...`, AWS-Keys) und liefert `{ text, includedFields }`. `sendFeedback(preview, confirm)` wirft ohne `confirm === true`; bei explizitem Versand liefert sie den Terminal-Handoff-Befehl `claude /bug <text>` statt eines eigenen Netzwerkaufrufs.
