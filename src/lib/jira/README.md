# Jira-Modul

Lesender Jira-Zugriff (BYOK) für das Agents-Fenster. UI in
`src/components/settings/jira-card.tsx` und
`src/components/agents/chat/agent-jira-panel.tsx`, HTTP-Schicht in
`src-tauri/src/jira.rs`.

## Architektur

```
Sidenav-Panel / Einstellungen
  → jira-store.ts (Schalter + verknüpfte Tickets, persistiert in kv)
      │
      ├─ Tauri-Commands (jira_*) → src-tauri/src/jira.rs → Jira REST v3 (nur GET)
      │
      ├─ jira-tools.ts (welche Tools sieht der Agent gerade?)
      │    → In-Process-MCP-Server "l8git" in providers/claude/chat-store.ts
      │      → jira-runtime.ts (Tool-Ausführung + kompakte Textausgabe)
      │
      └─ jira-policy.json + jira-sync.ts (Registrierung bei Codex/OpenCode/Cursor)
           → l8git mcp-jira --repo <pfad>  (src-tauri/src/jira_mcp.rs)
             → dieselben Funktionen in jira.rs
```

## Nur lesend

Es gibt drei Tools — `jira_get_issue`, `jira_get_comments`, `jira_search_issues` —
und drei Backend-Commands dahinter. Alle setzen ausschließlich HTTP-GET ab;
Anlegen, Ändern, Kommentieren und Statuswechsel sind nicht implementiert und
lassen sich auch nicht über Parameter erreichen.

## Token-Budget

Tool-Schemata kosten Input-Tokens in *jedem* Turn, deshalb wird die Toolliste
pro `tools/list` neu gebaut (`jiraToolsFor`):

| Zustand | Tools |
|---|---|
| Feature aus, oder keine Zugangsdaten | keine |
| Kein Ticket verknüpft und Suche aus | keine |
| Ticket verknüpft, Suche aus | `jira_get_issue` (+ `jira_get_comments`), `key` als `enum` der verknüpften Keys |
| Suche an | zusätzlich `jira_search_issues`, `key` als freier String |

Zusätzlich schrumpfen die Antworten: ADF wird in Klartext geflacht, Felder
werden serverseitig per `fields=`-Projektion begrenzt, Beschreibungen werden auf
`MAX_BODY_CHARS` gekürzt und Trefferlisten enthalten gar keine Beschreibung.

## Wie die vier CLIs an die Tools kommen

Jeder Provider hat einen anderen Kanal; `provider-meta.ts` deklariert ihn
zentral (`agentToolChannel`), Aufbau und Abbau macht `jira-sync.ts`.

| Provider | Kanal | Schreibt in fremde Konfiguration? |
|---|---|---|
| Claude Code | In-Process-SDK-Server (`--mcp-config … "type":"sdk"`) | nein |
| OpenCode | `mcpServers` an ACP `session/new\|load\|resume\|fork` | nein |
| Codex | `mcp_servers.l8git-jira` über die App-Server-Config-RPC | ja, `~/.codex/config.toml` |
| Cursor | `~/.cursor/mcp.json` | ja |

Die drei ohne In-Process-Kanal starten l8gits eigene Binary erneut als
Stdio-MCP-Server: `l8git mcp-jira --repo <pfad>` (`jira_mcp.rs`, Dispatch in
`main.rs`). Der Kindprozess liest die Zugangsdaten selbst aus dem
Schlüsselbund — der Token wird nie über Argumente oder Umgebung übergeben.

**Registrierung und Gate sind getrennt.** Registriert wird, sobald Jira
aktiv ist und Zugangsdaten existieren („kann das je helfen?"); welche Tools
erscheinen, entscheidet die Policy-Datei pro Aufruf („hilft es gerade?").
Das ist nötig, weil ACP `mcpServers` beim Sitzungsstart festnagelt: der
Server muss schon da sein, bevor das erste Ticket verknüpft wird. Tokens
kostet das nicht — eine leere `tools/list` ist gratis.

Codex und Cursor schreiben in Konfiguration, die dem Nutzer gehört, und die
Einträge sind dadurch auch in dessen eigenen Sitzungen sichtbar. Deshalb
hängen sie an einem eigenen Schalter (`registerExternal`) und werden wieder
entfernt, sobald er ausgeht.

## Policy-Datei (`jira_policy.rs`)

`<config>/l8git/jira-policy.json` spiegelt Schalter und verknüpfte
Ticket-Schlüssel — keine Geheimnisse. Der Kindprozess liest sie bei jedem
Aufruf neu, damit ein neu verknüpftes Ticket sofort in einer laufenden
Sitzung wirkt. Fehlt oder bricht die Datei, gilt alles als geschlossen:
Der Gate fällt zu, nicht auf.

## Sicherheit

- Der API-Token liegt im OS-Schlüsselbund und wird nie an das Frontend
  zurückgegeben; die UI kennt nur `tokenHint` (`••••1a2b`).
- Base-URLs müssen HTTPS sein (Ausnahme: Loopback), dürfen keine Zugangsdaten,
  Query, Fragment oder `..` enthalten.
- Agent-gelieferte Ticket-Schlüssel werden gegen `PROJECT-123` validiert; ohne
  freigeschaltete Suche zusätzlich gegen die Liste der verknüpften Tickets
  (`resolveIssueKeyArg`) — das `enum` im Schema ist nur ein Hinweis, die
  Prüfung ist die Grenze.
- Redirects sind abgeschaltet, damit der `Authorization`-Header die
  konfigurierte Domain nicht verlässt; die fertige URL wird vor dem Senden
  erneut gegen den Origin der Base-URL geprüft.
- Fehlermeldungen werden von Token und Basic-Auth-Base64 befreit.

## Tests

`bun run test` für `__tests__/` (Gate-Logik, Argumentprüfung, Store, Parser,
Registrierung), `cargo test --test jira` für URL-Normalisierung,
Schlüsselprüfung, ADF-Flattening, Projektion und Redaktion sowie
`cargo test --test jira_mcp` für Gate, JSON-RPC-Oberfläche, Policy-Datei und
das Zusammenführen von `~/.cursor/mcp.json`.

Beide Gate-Implementierungen — `jiraToolsFor` in TypeScript und `tools_for`
in Rust — haben denselben Testkatalog, damit sie nicht auseinanderlaufen.
