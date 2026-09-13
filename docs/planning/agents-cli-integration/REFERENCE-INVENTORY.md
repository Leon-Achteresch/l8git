# Referenzinventar

[Übersicht](README.md) · Konsolidiert [FEATURE-MATRIX.md](FEATURE-MATRIX.md), [REFERENZTESTS.md](REFERENZTESTS.md) und [reference-coverage.json](reference-coverage.json) zu einer einzeiligen Zuordnung pro Fläche. Kein neuer Rechercheschritt; nur Zusammenführung. Referenzcommit fixiert auf `6c583620ff7ad3235b135af7107c0543467eecfa`. **Status ist Planungsabdeckung, keine bestandene Prüfung.**

Referenz-Basis für alle Zeilen: [ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts) bzw. [ClaudeAdapter.test.ts](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.test.ts), Zeilen laut REFERENZTESTS.md wo vorhanden.

## Adapter-Operationen (aus FEATURE-MATRIX.md)

| Feature | Referenz (t3code) | l8git-Anker | Ticket | Status |
| --- | --- | --- | --- | --- |
| Driver-Factory, Schema, Defaultkonfiguration, Registry | ClaudeAdapter.ts | `src-tauri/src/claude.rs` | PROV-03, PROV-04, PROV-05 | Geplant |
| startSession, Sessionbindung, Has/ListSessions | ClaudeAdapter.test.ts#L312 | `src-tauri/src/agent_transport.rs` | RUN-04, CHAT-01, PROV-08 | Geplant |
| sendTurn, Steer, Queue | ClaudeAdapter.test.ts#L1403 | `src-tauri/src/agent_transport.rs` | CHAT-02 | Geplant |
| interruptTurn, stopSession, stopAll | ClaudeAdapter.test.ts#L2933, #L3021, #L3047, #L3763, #L3882, #L3953 | `src-tauri/src/agent_transport.rs` | CHAT-03, RUN-07 | Geplant |
| readThread und native History | ClaudeAdapter.ts | `src/lib/agents/__tests__` | HIST-01, HIST-06 | Geplant |
| resumeCursor, ContinuationIdentity | ClaudeAdapter.test.ts#L506 | `src-tauri/src/claude.rs` | HIST-02, HIST-03, SET-03 | Geplant |
| forkSession und rollbackThread | ClaudeAdapter.ts | `src-tauri/src/agent_transport.rs` | HIST-04, HIST-05 | Geplant |
| respondToRequest und Session-Grants | ClaudeAdapter.ts | `src-tauri/src/claude.rs` | ASK-03, ASK-04, ASK-08 | Geplant |
| respondToUserInput und onUserDialog/resume_return | ClaudeAdapter.ts | `src-tauri/src/claude.rs` | ASK-05, USE-04, DETAIL-04 | Geplant |
| compaction (native oder Slash) | ClaudeAdapter.test.ts#L464 | `src-tauri/src/claude.rs` | USE-03 | Geplant |
| streamEvents / kanonische Runtime-Events | ClaudeAdapter.test.ts#L1079 | `src-tauri/src/agent_transport.rs` | PROV-07, EVT-01, RUN-08 | Geplant |
| optional uploadFeedback / nativer submit_feedback | ClaudeAdapter.ts | `package.json` | CLI-10 | Geplant |
| snapshot, Katalog, Refresh, Maintenance | ClaudeAdapter.ts | `src-tauri/src/claude.rs` | MOD-01, SET-01, SET-07 | Geplant |
| Auth und TextGeneration | ClaudeAdapter.ts | `src-tauri/src/claude.rs` | SET-02, GIT-06 | Geplant |
| MCP-/Skill-/Hook-/Plugin-Erweiterungsports | ClaudeAdapter.test.ts#L856, #L947, #L1041 | `src/lib/agents/__tests__` | EXT-01, EXT-05, EXT-07, EXT-08, EXT-09 | Geplant |

## Claude-Top-Level-Frames (aus FEATURE-MATRIX.md)

| Feature | Referenz (t3code) | l8git-Anker | Ticket | Status |
| --- | --- | --- | --- | --- |
| `stream_event` | ClaudeAdapter.ts | `src-tauri/src/agent_transport.rs` | EVT-02, EVT-03, EVT-04 | Geplant |
| `user / Replay / tool_result` | ClaudeAdapter.test.ts#L1403 | `src-tauri/src/agent_transport.rs` | CHAT-02, EVT-05, RUN-08 | Geplant |
| `assistant` | ClaudeAdapter.test.ts#L5152, #L5245, #L5411, #L5480 | `src-tauri/src/agent_transport.rs` | EVT-02, TASK-02 | Geplant |
| `result` | ClaudeAdapter.test.ts#L2137, #L2781, #L2883 | `src-tauri/src/agent_transport.rs` | EVT-11, USE-01 | Geplant |
| `system` | ClaudeAdapter.test.ts#L1079 | `src-tauri/src/agent_transport.rs` | EVT-01 | Geplant |
| `tool_progress / tool_use_summary` | ClaudeAdapter.ts | `src-tauri/src/agent_transport.rs` | EVT-05 | Geplant |
| `auth_status` | ClaudeAdapter.ts | `src-tauri/src/claude.rs` | SET-02 | Geplant |
| `rate_limit_event` | ClaudeAdapter.test.ts#L2319, #L4328, #L4423, #L4470, #L4584, #L4636, #L4699, #L4753 | `src-tauri/src/agent_transport.rs` | USE-06 | Geplant |
| `prompt_suggestion (in t3code ohne UI)` | ClaudeAdapter.ts | `src/lib/agents/__tests__` | CHAT-09 | Geplant (Erweiterung ohne t3code-Vorbild) |
| `conversation_reset (in t3code bewusst konsumiert)` | ClaudeAdapter.ts | `src-tauri/src/claude.rs` | HIST-02, CHAT-08 | Geplant |
| `command_lifecycle (interne Buchhaltung)` | ClaudeAdapter.test.ts#L4816 | `src-tauri/src/agent_transport.rs` | EVT-10 | Geplant |
| `control_request / control_response / control_cancel_request` | ClaudeAdapter.ts | `src-tauri/src/agent_transport.rs` | RUN-05, ASK-08 | Geplant |

## system.subtype-Zuordnung

Vollständige, bereits gepflegte Tabelle: siehe [FEATURE-MATRIX.md, Abschnitt „system.subtype im referenzierten ClaudeAdapter“](FEATURE-MATRIX.md#systemsubtype-im-referenzierten-claudeadapter). Enthält 29 Subtypes mit Ziel und Quellzeile; hier nicht dupliziert, um Drift zwischen zwei Kopien zu vermeiden.

## Direkt benannte Testfälle

Vollständige Liste (92 Fälle) mit Ticketzuordnung: siehe [REFERENZTESTS.md](REFERENZTESTS.md) und maschinenlesbar [reference-coverage.json](reference-coverage.json). Nicht dupliziert.

## Pflegehinweis

Bei jeder Änderung an einer der drei Quellen (FEATURE-MATRIX.md, REFERENZTESTS.md, reference-coverage.json) muss diese Datei im selben Schritt nachgezogen werden. Neue Umsetzungstickets tragen hier `Status: Umgesetzt` erst nach tatsächlicher Implementierung und Test, nicht bei Ticketerstellung.
