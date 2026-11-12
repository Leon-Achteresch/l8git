import { BARCODE_TOOL } from "@/lib/agents/barcode-spec";
import { CHART_TOOL } from "@/lib/agents/chart-spec";
import { callJiraTool } from "@/lib/jira/jira-runtime";
import { ensureJiraStatus, jiraThreadKey, jiraToolContextFor, useJiraStore } from "@/lib/jira/jira-store";
import { isJiraToolName, jiraToolsFor } from "@/lib/jira/jira-tools";
import { accumulateUsage } from "@/lib/agents/token-cost";
import { recordSubagentUsage, type UsageTotals } from "@/lib/agents/usage-ledger";
import { parseRateLimitSignal, shouldAutoResume, upsertRateLimitSignal } from "@/lib/agents/rate-limits";
import { type ClaudeControlRequest, type ClaudeInitializeResult } from "@/lib/agents/providers/claude/client";
import type { AgentItem, AgentMcpServer, AgentPendingRequest, AgentTurn } from "@/lib/agents/types";

import { isRecord, stringValue, arrayValue } from "@/lib/agents/chat/values";
import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import {
  type UnknownRecord,
  autoResumeAttemptedTurns,
  bookedSubagentUsage,
  clients,
  hooksByPath,
  mcpByPath,
  persistResumeCursor,
  rateLimitBucketsByThread,
  runtimeState,
  skillsByPath,
} from "@/lib/agents/providers/claude/chat/state";
import {
  TASK_TERMINAL_STATUSES,
  applyToolResult,
  assistantItems,
  classifyResultErrorCategory,
  claudeEventKind,
  id,
  mapTaskStatus,
} from "@/lib/agents/providers/claude/chat/transcript";
import {
  closeIdleClients,
  flushStreamEvents,
  scheduleStreamEvent,
  updateCapabilities,
  updateConversation,
} from "@/lib/agents/providers/claude/chat/runtime";

export function handleClaudeMessage(threadId: string, path: string, event: UnknownRecord) {
  if (event.type === "stream_event") {
    scheduleStreamEvent(threadId, event);
    return;
  }
  // Canonical assistant/result frames must observe all queued partial deltas;
  // otherwise a delayed batch could resurrect a stale streaming item.
  flushStreamEvents(threadId);
  if (event.type === "system" && event.subtype === "init") {
    updateCapabilities(event as ClaudeInitializeResult, path);
    const skills = arrayValue(event.skills).flatMap((skill) => typeof skill === "string" ? [{
      name: skill,
      description: "Claude Code skill",
      path: "",
      enabled: true,
    }] : []);
    if (skills.length) skillsByPath.set(path, skills);
    const mcpServers = arrayValue(event.mcp_servers).filter(isRecord).map((server): AgentMcpServer => ({
      name: stringValue(server.name),
      tools: arrayValue(server.tools).map((tool) => isRecord(tool) ? stringValue(tool.name) : String(tool)).filter(Boolean),
      authStatus: stringValue(server.status, "unknown"),
    }));
    if (mcpServers.length) mcpByPath.set(path, mcpServers);
    return;
  }
  if (event.type === "system" && event.subtype === "rate_limit") {
    const signal = parseRateLimitSignal(event);
    const current = rateLimitBucketsByThread.get(threadId) ?? {};
    const next = upsertRateLimitSignal(current, signal);
    if (next === current) return;
    rateLimitBucketsByThread.set(threadId, next);
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId;
      if (!activeId) return conversation;
      if (shouldAutoResume(autoResumeAttemptedTurns, activeId)) autoResumeAttemptedTurns.add(activeId);
      return {
        ...conversation,
        turns: conversation.turns.map((turn) => turn.id === activeId ? ({
          ...turn,
          status: "inProgress",
          rateLimit: { buckets: next, updatedAt: Date.now() },
        } as AgentTurn) : turn),
      };
    });
    claudeChatStore.setState((state) => ({
      sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "ready" },
    }));
    return;
  }
  if (event.type === "system" && (event.subtype === "api_retry" || event.subtype === "retry")) {
    const attempt = Number(event.attempt ?? event.attempt_number ?? 1);
    const delayMs = Number(event.delay_ms ?? event.delayMs ?? 0);
    const category = classifyResultErrorCategory(stringValue(event.reason, stringValue(event.subtype)), stringValue(event.message));
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId;
      if (!activeId) return conversation;
      return {
        ...conversation,
        turns: conversation.turns.map((turn) => turn.id === activeId ? ({
          ...turn,
          status: "inProgress",
          retry: {
            attempt: Number.isFinite(attempt) ? attempt : 1,
            delayMs: Number.isFinite(delayMs) ? delayMs : 0,
            category,
            observedAt: Date.now(),
          },
        } as AgentTurn) : turn),
      };
    });
    return;
  }
  if (event.type === "assistant" && isRecord(event.message)) {
    const message = event.message;
    const prefix = stringValue(event.uuid, stringValue(message.id, id("assistant")));
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId ?? id("turn");
      const turns = [...conversation.turns];
      let index = turns.findIndex((turn) => turn.id === activeId);
      if (index < 0) {
        turns.push({ id: activeId, items: [], status: "inProgress", startedAt: Date.now() });
        index = turns.length - 1;
      }
      const existing = turns[index];
      const parentToolUseId = stringValue(event.parent_tool_use_id);
      const owningAgentId = stringValue(event.agent_id, stringValue(event.session_id));
      const consumedIds = new Set<string>();
      const incoming = assistantItems(message, prefix, conversation.model).map((raw) => {
        const item = parentToolUseId || owningAgentId ? {
          ...raw,
          parentToolUseId: parentToolUseId || undefined,
          owningAgentId: owningAgentId || undefined,
        } : raw;
        if (item.type !== "collabAgentToolCall" || !item.toolUseId) return item;
        // An early task_started/task_progress snapshot may have created a
        // placeholder item for this Task call before the tool_use block
        // itself arrived; fold that buffered state in instead of losing it.
        const prior = existing.items.find((candidate) => candidate.toolUseId === item.toolUseId && candidate.id !== item.id);
        if (!prior) return item;
        consumedIds.add(prior.id);
        return {
          ...item,
          taskId: prior.taskId ?? item.taskId,
          phase: prior.phase ?? item.phase,
          progressLog: prior.progressLog ?? item.progressLog,
          status: prior.status ?? item.status,
          lastToolName: prior.lastToolName ?? item.lastToolName,
          result: prior.result ?? item.result,
          endTime: prior.endTime ?? item.endTime,
          outputFile: prior.outputFile ?? item.outputFile,
          error: prior.error ?? item.error,
        };
      });
      const incomingIds = new Set(incoming.map((item) => item.id));
      turns[index] = {
        ...existing,
        items: [
          ...existing.items.filter((item) => item.__claudeStream !== true && !incomingIds.has(item.id) && !consumedIds.has(item.id)),
          ...incoming,
        ],
      };
      return { ...conversation, model: stringValue(message.model, conversation.model), turns, activeTurnId: activeId };
    });
    return;
  }
  if (event.type === "user" && isRecord(event.message)) {
    const results = arrayValue(event.message.content).filter(isRecord).filter((block) => block.type === "tool_result");
    if (!results.length) {
      updateConversation(threadId, (conversation) => {
        let delivered = false;
        return {
          ...conversation,
          turns: conversation.turns.map((turn) => ({
            ...turn,
            items: turn.items.map((item) => {
              if (delivered || item.__queued !== true) return item;
              delivered = true;
              const { __queued, ...rest } = item;
              return rest;
            }),
          })),
        };
      });
      return;
    }
    const resultToolUseIds = new Set(results.map((block) => stringValue(block.tool_use_id)));
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      turns: conversation.turns.map((turn) => {
        let next = turn;
        for (const result of results) next = applyToolResult(next, result, event.toolUseResult);
        for (const item of next.items) {
          const itemToolUseId = stringValue(item.toolUseId);
          if (item.type !== "collabAgentToolCall" || !itemToolUseId || !resultToolUseIds.has(itemToolUseId)) continue;
          if (!item.taskUsage) continue;
          const bookKey = `${threadId}:${itemToolUseId}`;
          if (bookedSubagentUsage.has(bookKey)) continue;
          bookedSubagentUsage.add(bookKey);
          // Subagent usage is booked on its own ledger key so it never flows
          // into the main turn's `conversation.tokenUsage` sum (no double counting).
          recordSubagentUsage(threadId, itemToolUseId, stringValue(item.model) || conversation.model || null, item.taskUsage as UsageTotals);
        }
        return next;
      }),
    }));
    return;
  }
  if (event.type === "result") {
    const subtype = stringValue(event.subtype);
    const terminalReason = stringValue(event.terminal_reason, subtype);
    const isError = event.is_error === true || subtype.startsWith("error");
    const isAborted = !isError && (subtype === "aborted" || subtype === "interrupted" || terminalReason === "aborted" || terminalReason === "interrupted");
    const errorText = isError
      ? stringValue(event.result, arrayValue(event.errors).map(String).join("; ")) || "Claude Code turn failed."
      : null;
    const errorCategory = isError ? classifyResultErrorCategory(terminalReason, errorText) : null;
    const turnUsage = isRecord(event.usage) ? {
      inputTokens: Number(event.usage.input_tokens ?? 0),
      outputTokens: Number(event.usage.output_tokens ?? 0),
      cacheReadTokens: Number(event.usage.cache_read_input_tokens ?? 0),
      cacheWriteTokens: Number(event.usage.cache_creation_input_tokens ?? 0),
    } : null;
    rateLimitBucketsByThread.delete(threadId);
    persistResumeCursor(threadId, stringValue(event.session_id, threadId));
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId;
      const hadActiveTurn = activeId !== null && conversation.turns.some((turn) => turn.id === activeId);
      if (!hadActiveTurn) return conversation;
      if (activeId) autoResumeAttemptedTurns.delete(activeId);
      const turns = conversation.turns.map((turn) => {
        if (turn.id !== activeId) return turn;
        // Explicit terminal errors are the highest priority and must never be
        // overwritten by a later, benign result frame for the same turn.
        if (turn.error) return turn;
        if (turn.status === "interrupted" && !isError) return turn;
        // A killed or errored turn must not leave subagent task cards spinning
        // forever; finalize whatever child tasks are still open.
        const items = (isError || isAborted)
          ? turn.items.map((item) => item.type === "collabAgentToolCall" && !TASK_TERMINAL_STATUSES.has(stringValue(item.status))
            ? { ...item, status: "aborted", error: item.error ?? errorText ?? undefined }
            : item)
          : turn.items;
        return {
          ...turn,
          items,
          status: isError ? "failed" : isAborted ? "interrupted" : "completed",
          completedAt: Date.now(),
          error: errorText,
          errorCategory: errorCategory ?? undefined,
          usage: turnUsage ?? undefined,
        } as AgentTurn;
      });
      return {
        ...conversation,
        activeTurnId: null,
        error: isError ? errorText : null,
        tokenUsage: turnUsage ? accumulateUsage(conversation.tokenUsage, turnUsage) : conversation.tokenUsage,
        turns,
      };
    });
    claudeChatStore.setState((state) => ({
      sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "ready" },
    }));
    if (runtimeState.surfaceReferences === 0) {
      if (runtimeState.surfaceReleaseTimer) clearTimeout(runtimeState.surfaceReleaseTimer);
      runtimeState.surfaceReleaseTimer = setTimeout(() => {
        runtimeState.surfaceReleaseTimer = null;
        if (runtimeState.surfaceReferences === 0) closeIdleClients();
      }, 1_000);
    }
    return;
  }
  if (event.type === "tool_progress") {
    const toolUseId = stringValue(event.tool_use_id);
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      turns: conversation.turns.map((turn) => ({
        ...turn,
        items: turn.items.map((item) => {
          if (item.toolUseId !== toolUseId) return item;
          if (item.status === "completed" || item.status === "failed") return item;
          return {
            ...item,
            status: "inProgress",
            progress: [...arrayValue(item.progress), stringValue(event.message, stringValue(event.tool_name, "Tool running"))],
          };
        }),
      })),
    }));
  }
  const eventKind = claudeEventKind(event);
  if (eventKind === "task_started" || eventKind === "task_progress" || eventKind === "task_updated" || eventKind === "task_notification") {
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId;
      const taskId = stringValue(event.task_id, id("task"));
      const parentToolUseId = stringValue(event.parent_tool_use_id, stringValue(event.tool_use_id));
      const status = mapTaskStatus(stringValue(event.status));
      const skipTranscript = event.skip_transcript === true;
      const summary = stringValue(event.summary);
      const lastToolName = stringValue(event.last_tool_name);
      const output = skipTranscript ? "" : stringValue(event.output, stringValue(event.message));
      const hasProgress = summary !== "" || lastToolName !== "" || output !== "";
      const endTime = stringValue(event.end_time) || undefined;
      const outputFile = stringValue(event.output_file) || undefined;
      const phase = stringValue(event.phase) || undefined;
      const taskError = event.error !== undefined ? (stringValue(event.error) || undefined) : undefined;
      const turns = conversation.turns.map((turn) => {
        if (turn.id !== activeId) return turn;
        const existingIndex = turn.items.findIndex((item) =>
          item.id === taskId || (parentToolUseId !== "" && item.toolUseId === parentToolUseId));
        if (existingIndex >= 0) {
          const items = [...turn.items];
          const existing = items[existingIndex];
          const finalized = TASK_TERMINAL_STATUSES.has(stringValue(existing.status));
          const progressLog = eventKind === "task_progress" && !finalized && hasProgress
            ? [...arrayValue(existing.progressLog), { summary, lastToolName, output: output || undefined }]
            : arrayValue(existing.progressLog);
          items[existingIndex] = {
            ...existing,
            taskId,
            parentToolUseId: parentToolUseId || existing.parentToolUseId,
            phase: phase ?? existing.phase,
            status: finalized ? existing.status : status,
            prompt: stringValue(existing.prompt) || stringValue(event.description, summary),
            lastToolName: lastToolName || existing.lastToolName,
            progressLog,
            endTime: endTime ?? existing.endTime,
            outputFile: outputFile ?? existing.outputFile,
            error: taskError ?? existing.error,
            result: eventKind === "task_notification" && !skipTranscript ? (output || existing.result) : existing.result,
          };
          return { ...turn, items };
        }
        const taskItem: AgentItem = {
          id: taskId,
          type: "collabAgentToolCall",
          tool: eventKind,
          prompt: stringValue(event.description, summary),
          status,
          taskId,
          phase,
          parentToolUseId: parentToolUseId || undefined,
          lastToolName: lastToolName || undefined,
          endTime,
          outputFile,
          error: taskError,
          progressLog: eventKind === "task_progress" && hasProgress
            ? [{ summary, lastToolName, output: output || undefined }]
            : [],
        };
        return { ...turn, items: [...turn.items, taskItem] };
      });
      return { ...conversation, turns };
    });
  }
  if (eventKind === "status" && event.status === "compacting") {
    updateConversation(threadId, (conversation) => {
      const turns = [...conversation.turns];
      const index = turns.findIndex((turn) => turn.id === conversation.activeTurnId);
      if (index >= 0) turns[index] = { ...turns[index], items: [...turns[index].items, { id: id("compact"), type: "contextCompaction" }] };
      return { ...conversation, turns };
    });
  }
  if (eventKind === "hook_started" || eventKind === "hook_response") {
    const hookName = stringValue(event.hook_name, stringValue(event.hook_event, "Hook"));
    const current = hooksByPath.get(path) ?? [];
    if (!current.some((hook) => hook.key === hookName)) {
      hooksByPath.set(path, [...current, { key: hookName, eventName: hookName, enabled: true, trustStatus: "runtime" }]);
    }
    const activityId = stringValue(event.hook_id, `hook-${hookName}`);
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId;
      const turns = conversation.turns.map((turn) => {
        if (turn.id !== activeId) return turn;
        const status = eventKind === "hook_response"
          ? (event.is_error === true ? "failed" : "completed")
          : "inProgress";
        const activityItem: AgentItem = {
          id: activityId,
          type: "hookActivity",
          hookName,
          status,
        };
        const existingIndex = turn.items.findIndex((item) => item.id === activityId);
        if (existingIndex >= 0) {
          const items = [...turn.items];
          items[existingIndex] = { ...items[existingIndex], ...activityItem };
          return { ...turn, items };
        }
        return { ...turn, items: [...turn.items, activityItem] };
      });
      return { ...conversation, turns };
    });
  }
  if (event.type === "system" && stringValue(event.subtype) === "permission_denied") {
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId;
      const turns = conversation.turns.map((turn) => turn.id === activeId ? {
        ...turn,
        items: [...turn.items, {
          id: id("permission-denied"),
          type: "permissionWarning",
          message: stringValue(event.message, stringValue(event.reason, "Permission denied")),
        } satisfies AgentItem],
      } : turn);
      return { ...conversation, turns };
    });
  }
}

/** Bestätigung für den In-App-MCP-Server; gerendert wird in der UI. */
function renderedToolAck(toolName: string): string {
  if (toolName === BARCODE_TOOL.name) return "Barcode wurde in der l8git-UI gerendert.";
  if (toolName === CHART_TOOL.name) return "Diagramm wurde in der l8git-UI gerendert.";
  return "Ausgabe wurde in der l8git-UI gerendert.";
}

/**
 * In-process MCP server ("l8git", declared in `agent_transport.rs`). The tool
 * list is rebuilt per request so gated tools — currently Jira — only cost
 * context tokens while they are actually usable.
 */
async function handleMcpMessage(
  threadId: string,
  requestId: string,
  message: Record<string, unknown>,
) {
  const method = stringValue(message.method);
  const respond = (result: unknown) =>
    clients.get(threadId)?.respond(requestId, {
      mcp_response: { jsonrpc: "2.0", id: message.id, result },
    });
  try {
    if (method === "initialize") {
      await respond({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "l8git", version: "1.0.0" },
      });
      return;
    }
    if (method === "tools/list") {
      await respond({ tools: [CHART_TOOL, BARCODE_TOOL, ...(await gatedJiraTools(threadId))] });
      return;
    }
    if (method === "tools/call") {
      const params = isRecord(message.params) ? message.params : {};
      // MCP sends the bare name, but Claude Code also knows these tools as
      // `mcp__l8git__<name>`; accept both rather than fall through to the
      // chart reply and leave the agent thinking Jira is broken.
      const toolName = stringValue(params.name).replace(/^mcp__l8git__/, "");
      if (isJiraToolName(toolName)) {
        if (useJiraStore.getState().enabled) await ensureJiraStatus();
        const args = isRecord(params.arguments) ? params.arguments : {};
        const context = jiraToolContextFor(jiraThreadKey("claude", threadId));
        await respond(await callJiraTool(toolName, args, context));
        return;
      }
      await respond({ content: [{ type: "text", text: renderedToolAck(toolName) }] });
      return;
    }
    await clients.get(threadId)?.respond(requestId, {
      mcp_response: {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Unbekannte Methode: ${method}` },
      },
    });
  } catch (error) {
    try {
      await clients.get(threadId)?.respond(requestId, {
        mcp_response: {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        },
      });
    } catch {
      // The transport is already gone; nothing left to answer.
    }
  }
}

async function gatedJiraTools(threadId: string) {
  // Skipping the keychain probe while the feature is off keeps `tools/list`
  // free of both latency and tokens.
  if (!useJiraStore.getState().enabled) return [];
  await ensureJiraStatus();
  return jiraToolsFor(jiraToolContextFor(jiraThreadKey("claude", threadId)));
}

export function handleControlRequest(threadId: string, request: ClaudeControlRequest) {
  const subtype = stringValue(request.request.subtype);
  if (subtype === "oauth_token_refresh") {
    void clients.get(threadId)?.respond(request.request_id, { accessToken: null });
    return;
  }
  if (subtype === "elicitation") {
    const pending: AgentPendingRequest = {
      sessionId: threadId,
      requestId: request.request_id,
      method: "claude/elicitation",
      kind: "elicitation",
      threadId,
      reason: stringValue(request.request.description, stringValue(request.request.message)),
      raw: {
        ...request.request,
        serverName: request.request.mcp_server_name,
        requestedSchema: request.request.requested_schema,
      },
    };
    claudeChatStore.setState((state) => ({
      requestsByThread: {
        ...state.requestsByThread,
        [threadId]: [
          ...(state.requestsByThread[threadId] ?? []).filter((item) => item.requestId !== pending.requestId),
          pending,
        ],
      },
    }));
    return;
  }
  if (subtype === "mcp_message") {
    const message = isRecord(request.request.message) ? request.request.message : {};
    if (message.id === undefined || message.id === null) {
      void clients.get(threadId)?.respond(request.request_id, {});
      return;
    }
    void handleMcpMessage(threadId, request.request_id, message);
    return;
  }
  if (subtype !== "can_use_tool") {
    void clients.get(threadId)?.respondError(request.request_id, `Unsupported Claude control request: ${subtype}`);
    return;
  }
  const input = isRecord(request.request.input) ? request.request.input : {};
  const tool = stringValue(request.request.tool_name, "Tool");
  const isQuestion = tool === "AskUserQuestion";
  // Leaving plan mode is a decision about the plan itself, not a command
  // approval, so it gets its own request kind and card.
  const isPlan = tool === "ExitPlanMode";
  const questions = isQuestion ? arrayValue(input.questions).filter(isRecord).map((question, index) => ({
    id: `q-${index}`,
    header: stringValue(question.header, "Question"),
    question: stringValue(question.question),
    isOther: true,
    multiSelect: question.multiSelect === true,
    options: arrayValue(question.options).filter(isRecord).map((option) => ({
      label: stringValue(option.label),
      description: stringValue(option.description),
    })),
  })) : undefined;
  const pending: AgentPendingRequest = {
    sessionId: threadId,
    requestId: request.request_id,
    method: "claude/canUseTool",
    kind: isQuestion
      ? "user-input"
      : isPlan
        ? "plan"
        : ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)
          ? "file-change"
          : "command",
    threadId,
    itemId: stringValue(request.request.tool_use_id) || undefined,
    reason: stringValue(request.request.decision_reason, stringValue(request.request.description)),
    command: tool === "Bash" ? stringValue(input.command) : tool,
    cwd: stringValue(input.cwd) || undefined,
    questions,
    plan: isPlan ? stringValue(input.plan) : undefined,
    raw: request.request,
  };
  claudeChatStore.setState((state) => ({
    requestsByThread: {
      ...state.requestsByThread,
      [threadId]: [
        ...(state.requestsByThread[threadId] ?? []).filter((item) => item.requestId !== pending.requestId),
        pending,
      ],
    },
  }));
}
