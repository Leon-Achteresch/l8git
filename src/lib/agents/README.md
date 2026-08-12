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

Alle vier CLIs können interaktive Charts rendern — provider-unabhängig über Markdown statt vier Tool-Protokolle: Der Agent gibt einen \`\`\`chart-Codeblock mit JSON aus (`type: bar|line|area`, `series[{label, data[{x,y}]}]`, optional `title`/`xLabel`/`yLabel`/`stacked`), der Markdown-Renderer ersetzt ihn durch ein TanStack-Chart (`@tanstack/charts` + `@tanstack/react-charts`, Tooltip und Legende inklusive). Der Slash-Command `/chart <was visualisieren>` hängt die Formatdokumentation (`CHART_FORMAT_DOC`) an den Prompt, damit jeder Agent das Format kennt. Während des Streamens zeigt unvollständiges JSON einen Platzhalter; ungültige Blöcke fallen auf normale Code-Darstellung zurück. Serienfarben: `--ag-chart-1..8` in `agents.css` (validierte Palette, eigene Dark-Stufung); maximal 8 Serien, Validierung in `parseChartSpec`.

## Konventionen

- Fehler aus Stores propagieren lassen — die UI toastet abgelehnte Promises. Nur Best-Effort-Cleanup (`close()`, Branch-Löschung nach Merge) darf still scheitern.
- Thread-Listen-Scans sind über `thread-refresh.ts` mit 30-s-TTL gedrosselt.
- Preistabelle für Kostenanzeige: `token-cost.ts` (`MODEL_PRICES`), längster Key-Match gewinnt.

## Tests

`bun run test` (vitest, Konfiguration in `vitest.config.ts`). Tests liegen in `__tests__/`; Tauri-`invoke` und Transport werden per `vi.mock` ersetzt. Neue reine Funktionen (Parser, Ableitungen, Store-Logik) bekommen dort Tests.
