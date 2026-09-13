# Feature- und Protokollmatrix

[Übersicht](README.md) · Die Zuordnungen sind Planungsabdeckung, keine bestandenen Tests.

## Adapter-Operationen

| Vertrag / Fläche | Umsetzungstickets |
| --- | --- |
| Driver-Factory, Schema, Defaultkonfiguration, Registry | [PROV-03](01-prov.md#PROV-03), [PROV-04](01-prov.md#PROV-04), [PROV-05](01-prov.md#PROV-05) |
| startSession, Sessionbindung, Has/ListSessions | [RUN-04](02-run.md#RUN-04), [CHAT-01](04-chat.md#CHAT-01), [PROV-08](01-prov.md#PROV-08) |
| sendTurn, Steer, Queue | [CHAT-02](04-chat.md#CHAT-02) |
| interruptTurn, stopSession, stopAll | [CHAT-03](04-chat.md#CHAT-03), [RUN-07](02-run.md#RUN-07) |
| readThread und native History | [HIST-01](07-hist.md#HIST-01), [HIST-06](07-hist.md#HIST-06) |
| resumeCursor, ContinuationIdentity | [HIST-02](07-hist.md#HIST-02), [HIST-03](07-hist.md#HIST-03), [SET-03](03-set.md#SET-03) |
| forkSession und rollbackThread | [HIST-04](07-hist.md#HIST-04), [HIST-05](07-hist.md#HIST-05) |
| respondToRequest und Session-Grants | [ASK-03](06-ask.md#ASK-03), [ASK-04](06-ask.md#ASK-04), [ASK-08](06-ask.md#ASK-08) |
| respondToUserInput und onUserDialog/resume_return | [ASK-05](06-ask.md#ASK-05), [USE-04](09-use.md#USE-04), [DETAIL-04](16-detail.md#DETAIL-04) |
| compaction (native oder Slash) | [USE-03](09-use.md#USE-03) |
| streamEvents / kanonische Runtime-Events | [PROV-07](01-prov.md#PROV-07), [EVT-01](05-evt.md#EVT-01), [RUN-08](02-run.md#RUN-08) |
| optional uploadFeedback / nativer submit_feedback | [CLI-10](17-cli.md#CLI-10) |
| snapshot, Katalog, Refresh, Maintenance | [MOD-01](08-mod.md#MOD-01), [SET-01](03-set.md#SET-01), [SET-07](03-set.md#SET-07) |
| Auth und TextGeneration | [SET-02](03-set.md#SET-02), [GIT-06](12-git.md#GIT-06) |
| MCP-/Skill-/Hook-/Plugin-Erweiterungsports | [EXT-01](10-ext.md#EXT-01), [EXT-05](10-ext.md#EXT-05), [EXT-07](10-ext.md#EXT-07), [EXT-08](10-ext.md#EXT-08), [EXT-09](10-ext.md#EXT-09) |

## Claude-Top-Level-Frames

| Frame | Ziel |
| --- | --- |
| `stream_event` | [EVT-02](05-evt.md#EVT-02), [EVT-03](05-evt.md#EVT-03), [EVT-04](05-evt.md#EVT-04) |
| `user / Replay / tool_result` | [CHAT-02](04-chat.md#CHAT-02), [EVT-05](05-evt.md#EVT-05), [RUN-08](02-run.md#RUN-08) |
| `assistant` | [EVT-02](05-evt.md#EVT-02), [TASK-02](11-task.md#TASK-02) |
| `result` | [EVT-11](05-evt.md#EVT-11), [USE-01](09-use.md#USE-01) |
| `system` | [EVT-01](05-evt.md#EVT-01) |
| `tool_progress / tool_use_summary` | [EVT-05](05-evt.md#EVT-05) |
| `auth_status` | [SET-02](03-set.md#SET-02) |
| `rate_limit_event` | [USE-06](09-use.md#USE-06) |
| `prompt_suggestion (in t3code ohne UI)` | [CHAT-09](04-chat.md#CHAT-09) |
| `conversation_reset (in t3code bewusst konsumiert)` | [HIST-02](07-hist.md#HIST-02), [CHAT-08](04-chat.md#CHAT-08) |
| `command_lifecycle (interne Buchhaltung)` | [EVT-10](05-evt.md#EVT-10) |
| `control_request / control_response / control_cancel_request` | [RUN-05](02-run.md#RUN-05), [ASK-08](06-ask.md#ASK-08) |

## system.subtype im referenzierten ClaudeAdapter

Die folgende Liste wurde aus dem System-Message-Switch des gepinnten Adapters abgeglichen. „Konsumiert“ bedeutet: t3code erzeugt hier absichtlich keine eigene sichtbare Aktivität; l8git soll dafür keine Warnungsflut produzieren. Ein Ziel kann dennoch eine eigene l8git-Funktion vorsehen.

| Subtype | t3code-Behandlung | Ziel | Quellstelle |
| --- | --- | --- | --- |
| `vcs_state_changed` | Bewusst konsumiert | [GIT-02](12-git.md#GIT-02) | [Adapter:3391](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3391) |
| `code_change_published` | Bewusst konsumiert | [GIT-02](12-git.md#GIT-02) | [Adapter:3392](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3392) |
| `init` | Fachlich verarbeitet | [RUN-04](02-run.md#RUN-04) | [Adapter:3397](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3397) |
| `status` | Fachlich verarbeitet | [USE-03](09-use.md#USE-03) | [Adapter:3406](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3406) |
| `compact_boundary` | Fachlich verarbeitet | [USE-03](09-use.md#USE-03) | [Adapter:3417](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3417) |
| `hook_started` | Fachlich verarbeitet | [EVT-10](05-evt.md#EVT-10) | [Adapter:3447](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3447) |
| `hook_progress` | Fachlich verarbeitet | [EVT-10](05-evt.md#EVT-10) | [Adapter:3458](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3458) |
| `hook_response` | Fachlich verarbeitet | [EVT-10](05-evt.md#EVT-10) | [Adapter:3470](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3470) |
| `task_started` | Fachlich verarbeitet | [TASK-01](11-task.md#TASK-01) | [Adapter:3484](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3484) |
| `task_progress` | Fachlich verarbeitet | [TASK-03](11-task.md#TASK-03) | [Adapter:3559](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3559) |
| `task_updated` | Fachlich verarbeitet | [TASK-04](11-task.md#TASK-04) | [Adapter:3595](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3595) |
| `task_notification` | Fachlich verarbeitet | [TASK-04](11-task.md#TASK-04) | [Adapter:3625](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3625) |
| `files_persisted` | Fachlich verarbeitet | [GIT-03](12-git.md#GIT-03) | [Adapter:3651](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3651) |
| `thinking_tokens` | Bewusst konsumiert | [EVT-03](05-evt.md#EVT-03) | [Adapter:3673](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3673) |
| `api_retry` | Fachlich verarbeitet | [USE-08](09-use.md#USE-08) | [Adapter:3675](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3675) |
| `session_state_changed` | Fachlich verarbeitet | [UX-02](13-ux.md#UX-02) | [Adapter:3689](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3689) |
| `notification` | Fachlich verarbeitet | [EVT-10](05-evt.md#EVT-10) | [Adapter:3705](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3705) |
| `model_refusal_fallback` | Fachlich verarbeitet | [MOD-05](08-mod.md#MOD-05) | [Adapter:3712](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3712) |
| `local_command_output` | Bewusst konsumiert | [CHAT-08](04-chat.md#CHAT-08) | [Adapter:3728](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3728) |
| `plugin_install` | Bewusst konsumiert | [EXT-09](10-ext.md#EXT-09) | [Adapter:3729](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3729) |
| `commands_changed` | Bewusst konsumiert | [CHAT-08](04-chat.md#CHAT-08) | [Adapter:3730](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3730) |
| `memory_recall` | Bewusst konsumiert | [EXT-10](10-ext.md#EXT-10) | [Adapter:3731](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3731) |
| `elicitation_complete` | Bewusst konsumiert | [ASK-06](06-ask.md#ASK-06) | [Adapter:3732](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3732) |
| `background_tasks_changed` | Bewusst konsumiert | [TASK-07](11-task.md#TASK-07) | [Adapter:3733](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3733) |
| `control_request_progress` | Bewusst konsumiert | [RUN-05](02-run.md#RUN-05) | [Adapter:3734](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3734) |
| `worker_shutting_down` | Bewusst konsumiert | [RUN-07](02-run.md#RUN-07) | [Adapter:3735](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3735) |
| `informational` | Fachlich verarbeitet | [EVT-10](05-evt.md#EVT-10) | [Adapter:3737](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3737) |
| `model_refusal_no_fallback` | Fachlich verarbeitet | [EVT-11](05-evt.md#EVT-11) | [Adapter:3745](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3745) |
| `permission_denied` | Fachlich verarbeitet | [ASK-03](06-ask.md#ASK-03) | [Adapter:3755](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3755) |
| `mirror_error` | Fachlich verarbeitet | [EVT-11](05-evt.md#EVT-11) | [Adapter:3767](https://github.com/pingdotgg/t3code/blob/6c583620ff7ad3235b135af7107c0543467eecfa/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3767) |

## Bestehende Claude-Control-Flächen in l8git

Alle Einträge sind gegen die gewählte CLI-Version zu prüfen. Eine implementierte `request(subtype)`-Zeile belegt noch nicht, dass jede CLI-Version diesen internen Control-Subtype unterstützt.

| Control / Fläche | Tickets |
| --- | --- |
| `initialize` | [RUN-04](02-run.md#RUN-04), [RUN-05](02-run.md#RUN-05) |
| `interrupt` | [CHAT-03](04-chat.md#CHAT-03), [RUN-07](02-run.md#RUN-07) |
| `set_model` | [MOD-02](08-mod.md#MOD-02) |
| `set_permission_mode` | [ASK-01](06-ask.md#ASK-01), [ASK-02](06-ask.md#ASK-02) |
| `set_max_thinking_tokens` | [MOD-03](08-mod.md#MOD-03) |
| `rename_session` | [CHAT-10](04-chat.md#CHAT-10) |
| `submit_feedback` | [CLI-10](17-cli.md#CLI-10) |
| `can_use_tool / canUseTool` | [ASK-03](06-ask.md#ASK-03), [ASK-07](06-ask.md#ASK-07) |
| `elicitation` | [ASK-06](06-ask.md#ASK-06) |
| `mcp_message` | [EXT-07](10-ext.md#EXT-07), [EXT-13](10-ext.md#EXT-13) |
| `mcp_status / mcp_authenticate` | [EXT-05](10-ext.md#EXT-05), [EXT-06](10-ext.md#EXT-06) |
| `background_tasks / stop_task` | [TASK-07](11-task.md#TASK-07) |
| `oauth_token_refresh` | [SET-02](03-set.md#SET-02), [SET-03](03-set.md#SET-03), [SEC-04](14-sec.md#SEC-04) |
| `pending_permission_requests / control_cancel_request` | [ASK-08](06-ask.md#ASK-08), [RUN-05](02-run.md#RUN-05) |

## CLI-Inventar: zusätzliche Zuordnung

Diese Namen dienen als Prüfindex zur [offiziellen CLI-Referenz](https://code.claude.com/docs/en/cli-reference), abgerufen am 9. September 2026. Sie sind **keine Freigabeliste für beliebige Startargumente**. Verfügbarkeit und Konflikte werden in CLI-01 anhand einer konkreten CLI-Version geprüft. Nicht alle Flächen gehören in den Chat; Handoff und Administration sind eigene Tickets.

| Command-/Optionsname | Ticket |
| --- | --- |
| `--add-dir` | [ASK-04](06-ask.md#ASK-04) |
| `--advisor` | [CLI-09](17-cli.md#CLI-09) |
| `--betas` | [CLI-09](17-cli.md#CLI-09) |
| `--exclude-dynamic-system-prompt-sections` | [CLI-09](17-cli.md#CLI-09) |
| `--agent` | [EXT-04](10-ext.md#EXT-04) |
| `--agents` | [EXT-04](10-ext.md#EXT-04) |
| `--allow-dangerously-skip-permissions` | [ASK-01](06-ask.md#ASK-01) |
| `--dangerously-skip-permissions` | [ASK-01](06-ask.md#ASK-01) |
| `--permission-mode` | [ASK-01](06-ask.md#ASK-01) |
| `--enable-auto-mode` | [ASK-01](06-ask.md#ASK-01) |
| `--allowedTools` | [CLI-08](17-cli.md#CLI-08) |
| `--allowed-tools` | [CLI-08](17-cli.md#CLI-08) |
| `--disallowedTools` | [CLI-08](17-cli.md#CLI-08) |
| `--disallowed-tools` | [CLI-08](17-cli.md#CLI-08) |
| `--tools` | [CLI-08](17-cli.md#CLI-08) |
| `--disable-slash-commands` | [CLI-08](17-cli.md#CLI-08) |
| `--strict-mcp-config` | [CLI-08](17-cli.md#CLI-08) |
| `--plugin-dir` | [CLI-08](17-cli.md#CLI-08) |
| `--plugin-url` | [CLI-08](17-cli.md#CLI-08) |
| `--append-subagent-system-prompt` | [MOD-06](08-mod.md#MOD-06) |
| `--append-subagent-system-prompt-file` | [MOD-06](08-mod.md#MOD-06) |
| `--append-system-prompt` | [MOD-06](08-mod.md#MOD-06) |
| `--append-system-prompt-file` | [MOD-06](08-mod.md#MOD-06) |
| `--system-prompt` | [MOD-06](08-mod.md#MOD-06) |
| `--system-prompt-file` | [MOD-06](08-mod.md#MOD-06) |
| `--autocompact` | [USE-04](09-use.md#USE-04) |
| `--ax-screen-reader` | [CLI-02](17-cli.md#CLI-02) |
| `--bare` | [CLI-02](17-cli.md#CLI-02) |
| `--restricted` | [CLI-02](17-cli.md#CLI-02) |
| `--safe-mode` | [CLI-02](17-cli.md#CLI-02) |
| `doctor` | [CLI-02](17-cli.md#CLI-02) |
| `--bg` | [TASK-08](11-task.md#TASK-08) |
| `--background` | [TASK-08](11-task.md#TASK-08) |
| `--exec` | [TASK-08](11-task.md#TASK-08) |
| `--teammate-mode` | [TASK-08](11-task.md#TASK-08) |
| `agents` | [TASK-08](11-task.md#TASK-08) |
| `attach` | [TASK-08](11-task.md#TASK-08) |
| `logs` | [TASK-08](11-task.md#TASK-08) |
| `stop` | [TASK-08](11-task.md#TASK-08) |
| `kill` | [TASK-08](11-task.md#TASK-08) |
| `respawn` | [TASK-08](11-task.md#TASK-08) |
| `rm` | [TASK-08](11-task.md#TASK-08) |
| `daemon status` | [TASK-08](11-task.md#TASK-08) |
| `daemon stop` | [TASK-08](11-task.md#TASK-08) |
| `--channels` | [CLI-04](17-cli.md#CLI-04) |
| `--dangerously-load-development-channels` | [CLI-04](17-cli.md#CLI-04) |
| `--chrome` | [CLI-03](17-cli.md#CLI-03) |
| `--no-chrome` | [CLI-03](17-cli.md#CLI-03) |
| `--ide` | [CLI-03](17-cli.md#CLI-03) |
| `--cloud` | [CLI-06](17-cli.md#CLI-06) |
| `--remote` | [CLI-06](17-cli.md#CLI-06) |
| `--remote-control` | [CLI-06](17-cli.md#CLI-06) |
| `--rc` | [CLI-06](17-cli.md#CLI-06) |
| `--remote-control-session-name-prefix` | [CLI-06](17-cli.md#CLI-06) |
| `--environment` | [CLI-06](17-cli.md#CLI-06) |
| `--ref` | [CLI-06](17-cli.md#CLI-06) |
| `--teleport` | [CLI-06](17-cli.md#CLI-06) |
| `remote-control` | [CLI-06](17-cli.md#CLI-06) |
| `--continue` | [HIST-02](07-hist.md#HIST-02) |
| `-c` | [HIST-02](07-hist.md#HIST-02) |
| `--resume` | [HIST-02](07-hist.md#HIST-02) |
| `-r` | [HIST-02](07-hist.md#HIST-02) |
| `--debug` | [SET-08](03-set.md#SET-08) |
| `--debug-file` | [SET-08](03-set.md#SET-08) |
| `--effort` | [MOD-03](08-mod.md#MOD-03) |
| `--fallback-model` | [MOD-05](08-mod.md#MOD-05) |
| `--fork-session` | [HIST-04](07-hist.md#HIST-04) |
| `--forward-subagent-text` | [TASK-03](11-task.md#TASK-03) |
| `--from-pr` | [DETAIL-10](16-detail.md#DETAIL-10) |
| `--init` | [EXT-08](10-ext.md#EXT-08) |
| `--init-only` | [EXT-08](10-ext.md#EXT-08) |
| `--maintenance` | [EXT-08](10-ext.md#EXT-08) |
| `--include-hook-events` | [EVT-10](05-evt.md#EVT-10) |
| `--include-partial-messages` | [RUN-04](02-run.md#RUN-04) |
| `--input-format` | [RUN-04](02-run.md#RUN-04) |
| `--output-format` | [RUN-04](02-run.md#RUN-04) |
| `--print` | [RUN-04](02-run.md#RUN-04) |
| `-p` | [RUN-04](02-run.md#RUN-04) |
| `--verbose` | [RUN-04](02-run.md#RUN-04) |
| `--json-schema` | [MOD-07](08-mod.md#MOD-07) |
| `--max-budget-usd` | [MOD-07](08-mod.md#MOD-07) |
| `--max-turns` | [MOD-07](08-mod.md#MOD-07) |
| `--mcp-config` | [EXT-06](10-ext.md#EXT-06) |
| `mcp login` | [EXT-06](10-ext.md#EXT-06) |
| `mcp logout` | [EXT-06](10-ext.md#EXT-06) |
| `mcp` | [EXT-06](10-ext.md#EXT-06) |
| `--model` | [MOD-01](08-mod.md#MOD-01) |
| `--name` | [CHAT-10](04-chat.md#CHAT-10) |
| `-n` | [CHAT-10](04-chat.md#CHAT-10) |
| `--no-session-persistence` | [HIST-07](07-hist.md#HIST-07) |
| `project purge` | [HIST-07](07-hist.md#HIST-07) |
| `--permission-prompt-tool` | [ASK-03](06-ask.md#ASK-03) |
| `--permission-prompts` | [ASK-03](06-ask.md#ASK-03) |
| `--prompt-suggestions` | [CHAT-09](04-chat.md#CHAT-09) |
| `--replay-user-messages` | [RUN-08](02-run.md#RUN-08) |
| `--session-id` | [CHAT-01](04-chat.md#CHAT-01) |
| `--setting-sources` | [SET-05](03-set.md#SET-05) |
| `--settings` | [SET-05](03-set.md#SET-05) |
| `--worktree` | [GIT-01](12-git.md#GIT-01) |
| `-w` | [GIT-01](12-git.md#GIT-01) |
| `--tmux` | [GIT-01](12-git.md#GIT-01) |
| `--version` | [RUN-03](02-run.md#RUN-03) |
| `-v` | [RUN-03](02-run.md#RUN-03) |
| `auth login` | [SET-02](03-set.md#SET-02) |
| `auth logout` | [SET-02](03-set.md#SET-02) |
| `auth status` | [SET-02](03-set.md#SET-02) |
| `update` | [SET-07](03-set.md#SET-07) |
| `install` | [SET-07](03-set.md#SET-07) |
| `gateway` | [CLI-07](17-cli.md#CLI-07) |
| `self-hosted-runner` | [CLI-07](17-cli.md#CLI-07) |
| `setup-token` | [CLI-07](17-cli.md#CLI-07) |
| `auto-mode defaults` | [CLI-01](17-cli.md#CLI-01) |
| `auto-mode config` | [CLI-01](17-cli.md#CLI-01) |
| `auto-mode reset` | [CLI-01](17-cli.md#CLI-01) |
| `import` | [EXT-11](10-ext.md#EXT-11) |
| `plugin` | [EXT-09](10-ext.md#EXT-09) |
| `plugins` | [EXT-09](10-ext.md#EXT-09) |
| `ultrareview` | [GIT-04](12-git.md#GIT-04) |

## Grenzen dieses Inventars

Die Detailtickets erfassen den hier untersuchten Adapter, angrenzende t3code-Bedienfunktionen und den aktuellen CLI-Prüfindex. Experimentelle Befehle, interne Controls, Flag-Aliase und neu hinzukommende SDK-Events können sich ändern. QA-01 und CLI-01 liefern bei Umsetzung den versionsgenauen Vertrag; QA-08 darf unbestätigte Flächen nicht als fertige Integration markieren. Separate neue CLI-Treiber wie Gemini oder Copilot sind durch das Pattern anschließbar; ihre komplette native Protokollimplementierung ist kein Teil der Claude-Paritätsbehauptung.
