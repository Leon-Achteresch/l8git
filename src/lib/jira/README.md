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
      └─ jira-tools.ts (welche Tools sieht der Agent gerade?)
           → In-Process-MCP-Server "l8git" in providers/claude/chat-store.ts
             → jira-runtime.ts (Tool-Ausführung + kompakte Textausgabe)
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

Nur der Provider **Claude Code** lädt l8gits In-Process-MCP-Server
(`agent_transport.rs`), also sieht auch nur er die Tools — deklariert in
`provider-meta.ts` (`providerSupportsAppTools`).

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

`bun run test` für `__tests__/` (Gate-Logik, Argumentprüfung, Store, Parser),
`cargo test --test jira` für URL-Normalisierung, Schlüsselprüfung,
ADF-Flattening, Projektion und Redaktion.
