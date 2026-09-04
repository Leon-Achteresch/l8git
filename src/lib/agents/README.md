# Agents-Modul

Chat-Integration für AI-Coding-CLIs in l8git. UI unter `src/components/agents`, Logik hier, Prozess-Transport in `src-tauri/src/agent_transport.rs`.

## Architektur

```
UI (agents-page, chat pane, sidebar)
  → active-chat-store (Fassade: chatStoreFor(provider))
    → 4 Provider-Stores (codex | claude | cursor | opencode), gleiche AgentChatState-Schnittstelle
      → Provider-Clients (providers/*/client.ts)
        → JsonRpcProcessClient (rpc-client.ts) bzw. Einzel-Turn-Prozesse
          → openAgentTransport (transport.ts) → Tauri agent_transport_open (JSONL über stdio)
```

| Provider | Mechanismus |
|---|---|
| Codex | `codex app-server`, ein Prozess pro Thread (`session-manager.ts`), reichste RPC-Fläche |
| Claude Code | `claude --output-format stream-json`, Control-Requests via `--permission-prompt-tool stdio` |
| OpenCode | ACP (`opencode acp`), ein Prozess pro Repo, Sessions gemultiplext. `session/prompt` läuft ohne RPC-Timeout, weil ACP den Request für die gesamte Turn-Dauer offen hält |
| Cursor | `cursor-agent --print` pro Turn, Fortsetzung über `--resume`; Zusatzdaten werden aus CLI-Ausgaben geparst (`parseCursor*`) |

Provider-Fähigkeiten (welche Slash-Commands/UI-Flächen ein Provider hat) sind zentral in `provider-meta.ts` deklariert (`UNSUPPORTED_SLASH_COMMANDS`, `providerSupportsCapabilityCenter`). Neue Gates dort eintragen, nicht inline in Komponenten.

## Worktree-Sessions (`agent-worktrees.ts`)

Parallele Agent-Sessions in isolierten Git-Worktrees:

- **Erstellen** (Repo-Picker): Worktree unter `<repo>.worktrees/<slug>` mit Branch `agents/<slug>`; der Pfad fließt über `useAgentRepoPaths` in alle Stores ein und verhält sich wie ein normales Repo.
- **Arbeiten**: Turn-Ende löst Aufmerksamkeitssignale aus (`turn-attention.ts`): Dock-Bounce bei unfokussiertem Fenster, sonst Toast mit Sprung zum Thread. Das Chat-Dock zeigt die Zahl geänderter Dateien.
- **Landen** (Merge-Button im Picker): nur bei sauberem Worktree; merged `agents/<slug>` in den Basis-Branch, entfernt Worktree und Branch. Dirty-Base wird mit verständlicher Meldung abgelehnt; Merge-Konflikte landen im normalen Konfliktzustand des Basis-Repos.

## Nutzungs-Ledger (`usage-ledger.ts`)

Beobachtet `conversation.tokenUsage` aller vier Provider-Stores, verbucht positive Deltas pro Tag und Provider (localStorage `l8git-agent-usage`, 30 Tage) und bepreist sie über `token-cost.ts`. Die Sidebar zeigt Heute-Kosten/-Tokens, Tooltip die 7-Tage-Summe. Erstbeobachtungen eines Threads werden nur geseedet, nicht verbucht — geladene Historie zählt nicht als neuer Verbrauch.

## Charts (`chart-spec.ts`, `ui/agent-chart.tsx`)

Alle vier CLIs können interaktive Charts rendern — provider-unabhängig über Markdown statt vier Tool-Protokolle: Der Agent gibt einen \`\`\`chart-Codeblock mit JSON aus (`type: bar|line|area`, `series[{label, data[{x,y}]}]`, optional `title`/`xLabel`/`yLabel`/`stacked`), der Markdown-Renderer ersetzt ihn durch ein TanStack-Chart (`@tanstack/charts` + `@tanstack/react-charts`, Tooltip und Legende inklusive). Der Slash-Command `/chart <was visualisieren>` hängt die Formatdokumentation (`CHART_FORMAT_DOC`) an den Prompt, damit jeder Agent das Format kennt. Während des Streamens zeigt unvollständiges JSON einen Platzhalter; ungültige Blöcke fallen auf normale Code-Darstellung zurück. Serienfarben: `--ag-chart-1..8` in `index.css` (validierte Palette, eigene Dark-Stufung); maximal 8 Serien, Validierung in `parseChartSpec`.

## Jira-Tools (`../jira`)

Der In-Process-MCP-Server `l8git`, mit dem Claude Code gestartet wird
(`agent_transport.rs`, `--mcp-config … "type":"sdk"`), beantwortet `tools/list`
und `tools/call` in `providers/claude/chat-store.ts`. Neben `render_chart`
liefert er die lesenden Jira-Tools — aber nur, solange sie etwas nützen: ist das
Feature aus, fehlen Zugangsdaten oder ist weder ein Ticket verknüpft noch die
JQL-Suche freigeschaltet, ist die Liste leer und kostet keine Tokens.

Codex, OpenCode und Cursor haben keinen In-Process-Kanal und bekommen stattdessen
l8gits eigene Binary als Stdio-MCP-Server (`l8git mcp-jira`): OpenCode per ACP
`mcpServers` pro Sitzung, Codex und Cursor über einen Eintrag in ihrer eigenen
Konfiguration. Welcher Provider welchen Kanal hat, steht in `provider-meta.ts`
(`agentToolChannel`), das Auf- und Abräumen in `../jira/jira-sync.ts`. Details in
`../jira/README.md`.

## Addons (`barcode-spec.ts`, `browser-addon.ts`, `capabilities/agent-addon-studio.tsx`)

Zwei providerunabhängige Erweiterungen, erreichbar über den Puzzle-Knopf in der Chat-Kopfzeile oder `/addons`.

**Barcode-Renderer** — analog zu den Charts über Markdown statt über vier Tool-Protokolle: Der Agent gibt einen \`\`\`barcode-Codeblock mit JSON aus (`format`, `value`, optional `label`/`caption`/`scale`/`height`/`includeText`; mehrere Codes über `items[]` mit optionalem `title`), der Markdown-Renderer ersetzt ihn durch scannbare SVGs (bwip-js, lazy geladen). Damit werden Daten aus beliebigen Quellen — typischerweise MCP-Tools — direkt am Scanner abgreifbar. 39 kuratierte Symbologien (1D, 2D, Post) sind in `BARCODE_FORMATS` mit Eingaberegeln und Beispielwert dokumentiert und fließen in `BARCODE_FORMAT_DOC`; weitere bwip-js-IDs sind erlaubt, aber nicht dokumentiert. Der Slash-Command `/barcode <was codieren>` hängt die Formatdoku an den Prompt. Claude Code bekommt `BARCODE_TOOL` über den In-App-MCP-Server, Codex als persistiertes App-Server-Dynamic-Tool und OpenCode über den sitzungsgebundenen `l8git-renderers`-MCP-Server; keine der beiden neuen Integrationen verändert die CLI-Konfiguration des Nutzers. Das Code-Panel bleibt in beiden Themes weiß — Scanner brauchen den harten Kontrast —, Ruhezonen setzt `barcodeRenderOptions` (10 Module bei 1D, 4 bei 2D). Klick auf den Code öffnet ihn groß genug zum Abscannen vom Bildschirm.

**Claude in Browser** — echter Browser-Zugriff für alle vier CLIs über den Playwright-MCP-Server (`npx -y @playwright/mcp@latest`), damit End-to-End-Tests direkt aus dem Chat laufen. Das Studio schreibt den Servereintrag ins jeweilige Format: `.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor), `opencode.json` (OpenCode) über `agent_addon_config_read`/`agent_addon_config_write`, Codex über `saveMcpServer` des Capability-Stores in seine eigene `config.toml`. `applyServerEntry` bearbeitet die Datei nur an dieser einen Stelle: fremde Schlüssel, andere Server und deren Reihenfolge bleiben erhalten, ungültiges JSON wird nicht überschrieben. Optionen (Browser, Headless, isoliertes Profil, Viewport, Gerät, erlaubte Origins, Zusatz-Caps) werden aus der bestehenden Argumentliste zurückgelesen, sind also nach einem Neustart wieder sichtbar. `/browser <was testen>` bzw. der Knopf im Studio schickt `browserE2ePrompt()` — die Anleitung nennt die tatsächlichen Playwright-Tool-Namen und verlangt Belege (Snapshot, Konsole, Netzwerk) statt „hat geklappt“.

## Konventionen

- Fehler aus Stores propagieren lassen — die UI toastet abgelehnte Promises. Nur Best-Effort-Cleanup (`close()`, Branch-Löschung nach Merge) darf still scheitern.
- Thread-Listen-Scans sind über `thread-refresh.ts` mit 30-s-TTL gedrosselt.
- Preistabelle für Kostenanzeige: `token-cost.ts` (`MODEL_PRICES`), längster Key-Match gewinnt.

## Tests

`bun run test` (vitest, Konfiguration in `vitest.config.ts`). Tests liegen in `__tests__/`; Tauri-`invoke` und Transport werden per `vi.mock` ersetzt. Neue reine Funktionen (Parser, Ableitungen, Store-Logik) bekommen dort Tests.
