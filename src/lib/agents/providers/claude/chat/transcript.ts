import { classifyTranscriptUserText } from "@/lib/agents/transcript-text";
import { AGENT_EVENT_SCHEMA_VERSION } from "@/lib/agents/types";
import type {
  AgentConversation,
  AgentItem,
  AgentRuntimeEvent,
  AgentThreadSummary,
  AgentTurn,
  DriverKind,
  InstanceId,
  NativeSessionId,
  ThreadId,
} from "@/lib/agents/types";

import { isRecord, stringValue, arrayValue } from "@/lib/agents/chat/values";
import type {
  ClaudeSessionSummary,
  ClaudeSessionTranscript,
  UnknownRecord,
} from "@/lib/agents/providers/claude/chat/state";
import { emptyConversation } from "@/lib/agents/providers/claude/chat/runtime";

let sequence = 1;

export function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${sequence++}`;
}

export function summary(value: ClaudeSessionSummary): AgentThreadSummary {
  return {
    ...value,
    status: "idle",
    modelProvider: "anthropic",
    additions: value.additions,
    deletions: value.deletions,
  };
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  return arrayValue(content)
    .filter(isRecord)
    .filter((block) => block.type === "text")
    .map((block) => stringValue(block.text))
    .filter(Boolean)
    .join("\n");
}

const FILE_EDIT_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

function replaceDiff(oldText: string, newText: string): string {
  const removed = oldText ? oldText.split("\n").map((line) => `-${line}`) : [];
  const added = newText ? newText.split("\n").map((line) => `+${line}`) : [];
  return [...removed, ...added].join("\n");
}

function editDiff(tool: string, input: UnknownRecord): string {
  if (tool === "Write") {
    const content = stringValue(input.content);
    const lines = content ? content.split("\n") : [];
    return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join("\n");
  }
  if (tool === "MultiEdit") {
    return arrayValue(input.edits)
      .filter(isRecord)
      .map((edit) => replaceDiff(stringValue(edit.old_string), stringValue(edit.new_string)))
      .filter(Boolean)
      .join("\n");
  }
  if (tool === "NotebookEdit") {
    return replaceDiff(stringValue(input.old_source), stringValue(input.new_source));
  }
  return replaceDiff(stringValue(input.old_string), stringValue(input.new_string));
}

function fileChangeOperation(tool: string, input: UnknownRecord): string {
  if (tool === "Write") return "create";
  if (tool === "NotebookEdit") {
    const mode = stringValue(input.edit_mode);
    if (mode === "insert" || mode === "delete") return mode;
    return "edit";
  }
  return "edit";
}

export function editChanges(tool: string, input: UnknownRecord) {
  const path = stringValue(input.file_path, stringValue(input.notebook_path));
  const operation = fileChangeOperation(tool, input);
  if (tool === "MultiEdit") {
    const edits = arrayValue(input.edits).filter(isRecord);
    if (edits.length > 0) {
      return edits.map((edit) => ({
        path,
        operation,
        diff: replaceDiff(stringValue(edit.old_string), stringValue(edit.new_string)),
      }));
    }
  }
  return [{ path, operation, diff: editDiff(tool, input) }];
}

function patchDiff(patch: unknown): string {
  return arrayValue(patch)
    .filter(isRecord)
    .map((hunk) => [
      `@@ -${hunk.oldStart ?? 1},${hunk.oldLines ?? 0} +${hunk.newStart ?? 1},${hunk.newLines ?? 0} @@`,
      ...arrayValue(hunk.lines).map((line) => stringValue(line)),
    ].join("\n"))
    .join("\n");
}

/** Questions of an AskUserQuestion call, reduced to what the timeline shows. */
export function questionSummaries(input: UnknownRecord) {
  return arrayValue(input.questions).filter(isRecord).map((question) => ({
    header: stringValue(question.header),
    question: stringValue(question.question),
    multiSelect: question.multiSelect === true,
    options: arrayValue(question.options).filter(isRecord).map((option) => ({
      label: stringValue(option.label),
      description: stringValue(option.description),
    })),
  }));
}

export function toolItem(block: UnknownRecord, itemId: string, fallbackModel?: string): AgentItem {
  const name = stringValue(block.name, "Tool");
  const input = isRecord(block.input) ? block.input : {};
  if (FILE_EDIT_TOOLS.includes(name)) {
    return {
      id: itemId,
      type: "fileChange",
      tool: name,
      changes: editChanges(name, input),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "Bash") {
    return {
      id: itemId,
      type: "commandExecution",
      command: stringValue(input.command, name),
      cwd: stringValue(input.cwd),
      background: input.run_in_background === true,
      stdout: "",
      stderr: "",
      exitCode: null,
      aggregatedOutput: "",
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "Read") {
    return {
      id: itemId,
      type: "readTool",
      tool: name,
      path: stringValue(input.file_path),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "Glob" || name === "Grep") {
    return {
      id: itemId,
      type: "searchTool",
      tool: name,
      pattern: stringValue(input.pattern),
      path: stringValue(input.path),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "WebFetch") {
    return {
      id: itemId,
      type: "webFetch",
      url: stringValue(input.url),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "WebSearch") {
    return {
      id: itemId,
      type: "webSearch",
      query: stringValue(input.query),
      results: [],
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "TodoWrite") {
    return {
      id: itemId,
      type: "plan",
      plan: arrayValue(input.todos).map((todo, todoIndex) => isRecord(todo) ? {
        step: stringValue(todo.content) || stringValue(todo.activeForm) || `Schritt ${todoIndex + 1}`,
        status: todo.status === "completed" ? "completed" : todo.status === "in_progress" ? "inProgress" : "pending",
      } : todo),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "ExitPlanMode") {
    return {
      id: itemId,
      type: "planProposal",
      plan: stringValue(input.plan),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "AskUserQuestion") {
    return {
      id: itemId,
      type: "userQuestion",
      questions: questionSummaries(input),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (["Agent", "Task", "SendMessage", "TeamCreate"].includes(name)) {
    const explicitModel = stringValue(input.model);
    const effort = stringValue(input.effort, stringValue(input.reasoning_effort));
    const title = stringValue(input.description);
    return {
      id: itemId,
      type: "collabAgentToolCall",
      tool: name,
      prompt: stringValue(input.prompt, stringValue(input.description)),
      title: title || undefined,
      role: stringValue(input.subagent_type) || undefined,
      model: explicitModel || fallbackModel || undefined,
      modelSource: explicitModel ? "explicit" : fallbackModel ? "inherited" : undefined,
      effort: effort || undefined,
      arguments: input,
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  return {
    id: itemId,
    type: "dynamicToolCall",
    server: name.startsWith("mcp__") ? name.split("__")[1] : "Claude Code",
    tool: name,
    arguments: input,
    status: "inProgress",
    toolUseId: block.id,
  };
}

export function assistantItems(message: UnknownRecord, prefix: string, fallbackModel?: string): AgentItem[] {
  return arrayValue(message.content).flatMap((raw, index): AgentItem[] => {
    if (!isRecord(raw)) return [];
    const itemId = `${prefix}-${index}`;
    if (raw.type === "text") return [{ id: itemId, type: "agentMessage", text: stringValue(raw.text), __completed: true }];
    if (raw.type === "thinking" || raw.type === "redacted_thinking") {
      const redacted = raw.type === "redacted_thinking";
      return [{
        id: itemId,
        type: "reasoning",
        summary: [redacted ? "Geschützter Gedankengang" : stringValue(raw.thinking)],
        content: [],
        redacted,
        __completed: true,
      }];
    }
    if (raw.type === "tool_use") return [toolItem(raw, itemId, fallbackModel)];
    return [];
  });
}

export function applyToolResult(turn: AgentTurn, block: UnknownRecord, toolUseResult?: unknown): AgentTurn {
  const toolUseId = stringValue(block.tool_use_id);
  if (!toolUseId) return turn;
  const result = block.content;
  const structured = isRecord(toolUseResult) ? toolUseResult : null;
  const patch = structured ? patchDiff(structured.structuredPatch) : "";
  const structuredUsage = structured && isRecord(structured.usage) ? structured.usage : null;
  const finiteNumber = (value: unknown): number => {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  };
  const taskUsage = structuredUsage ? {
    inputTokens: finiteNumber(structuredUsage.input_tokens),
    outputTokens: finiteNumber(structuredUsage.output_tokens),
    cacheReadTokens: finiteNumber(structuredUsage.cache_read_input_tokens),
    cacheWriteTokens: finiteNumber(structuredUsage.cache_creation_input_tokens),
  } : undefined;
  return {
    ...turn,
    items: turn.items.map((item) => {
      if (item.toolUseId !== toolUseId) return item;
      if (TASK_TERMINAL_STATUSES.has(stringValue(item.status))) return item;
      const isCommand = item.type === "commandExecution";
      const isTask = item.type === "collabAgentToolCall";
      const interrupted = structured?.interrupted === true;
      const commandStatus = interrupted
        ? "aborted"
        : block.is_error === true
          ? "failed"
          : item.background === true
            ? "detached"
            : "completed";
      const taskStatus = interrupted ? "aborted" : block.is_error === true ? "failed" : "completed";
      const taskErrorCategory = isTask && block.is_error === true
        ? classifyResultErrorCategory(interrupted ? "interrupted" : "error", contentText(result))
        : undefined;
      return {
        ...item,
        status: isCommand ? commandStatus : isTask ? taskStatus : (block.is_error === true ? "failed" : "completed"),
        result,
        changes: item.type === "fileChange" && patch
          ? arrayValue(item.changes).filter(isRecord).map((change) => ({ ...change, diff: patch }))
          : item.changes,
        stdout: isCommand ? stringValue(structured?.stdout, contentText(result)) : item.stdout,
        stderr: isCommand ? stringValue(structured?.stderr) : item.stderr,
        exitCode: isCommand
          ? (typeof structured?.returnCode === "number" ? structured.returnCode : (block.is_error === true ? 1 : 0))
          : item.exitCode,
        aggregatedOutput: isCommand ? contentText(result) : item.aggregatedOutput,
        taskUsage: isTask ? (taskUsage ?? item.taskUsage) : item.taskUsage,
        errorCategory: isTask ? (taskErrorCategory ?? item.errorCategory) : item.errorCategory,
        error: block.is_error === true ? contentText(result) : undefined,
        __completed: true,
      };
    }),
  };
}

export function transcriptConversation(transcript: ClaudeSessionTranscript): AgentConversation {
  const turns: AgentTurn[] = [];
  let current: AgentTurn | null = null;
  for (const [entryIndex, entry] of transcript.entries.entries()) {
    const message = isRecord(entry.message) ? entry.message : null;
    if (entry.type === "user" && message) {
      const blocks = arrayValue(message.content).filter(isRecord);
      const toolResults = blocks.filter((block) => block.type === "tool_result");
      if (toolResults.length && current) {
        for (const block of toolResults) current = applyToolResult(current, block, entry.toolUseResult);
        turns[turns.length - 1] = current;
        continue;
      }
      const classified = classifyTranscriptUserText(contentText(message.content));
      if (classified.kind === "skip") continue;
      // `/model` and friends log the invocation and its output as two entries
      // in a row; fold the second into the command item it belongs to.
      if (classified.kind === "commandOutput") {
        const previous: AgentItem | undefined = current?.items[current.items.length - 1];
        if (!current || previous?.type !== "localCommand" || previous.output) continue;
        current = {
          ...current,
          items: [...current.items.slice(0, -1), { ...previous, output: classified.output }],
        };
        turns[turns.length - 1] = current;
        continue;
      }
      const item: AgentItem = classified.kind === "command"
        // Slash commands are CLI scaffolding rather than a prompt, so they
        // render as a compact chip instead of a chat bubble.
        ? {
            id: stringValue(entry.uuid, `command-${entryIndex}`),
            type: "localCommand",
            command: classified.command,
            args: classified.args,
            output: classified.output,
          }
        : {
            id: stringValue(entry.uuid, `user-${entryIndex}`),
            type: "userMessage",
            content: [{ type: "text", text: classified.text }],
          };
      current = {
        id: stringValue(entry.promptId, stringValue(entry.uuid, `turn-${entryIndex}`)),
        items: [item],
        status: "completed",
        startedAt: Date.parse(stringValue(entry.timestamp)) || null,
      };
      turns.push(current);
      continue;
    }
    if (entry.type === "assistant" && message) {
      if (!current) {
        current = { id: `turn-${entryIndex}`, items: [], status: "completed" };
        turns.push(current);
      }
      const prefix = stringValue(entry.uuid, stringValue(message.id, `assistant-${entryIndex}`));
      current = { ...current, items: [...current.items, ...assistantItems(message, prefix)] };
      turns[turns.length - 1] = current;
    }
  }
  return {
    ...emptyConversation(summary(transcript.summary)),
    model: transcript.summary.model ?? "",
    turns,
  };
}

const CLAUDE_SYSTEM_SUBTYPE_KINDS = new Set([
  "task_started",
  "task_progress",
  "task_updated",
  "task_notification",
  "status",
  "hook_started",
  "hook_response",
  "permission_denied",
]);

export function claudeEventKind(event: UnknownRecord): string {
  if (event.type === "system") {
    const subtype = stringValue(event.subtype);
    if (CLAUDE_SYSTEM_SUBTYPE_KINDS.has(subtype)) return subtype;
  }
  return stringValue(event.type);
}

export function normalizeClaudeEvent(
  raw: UnknownRecord,
  context: { driver: DriverKind; instance: InstanceId; threadId: ThreadId; nativeSessionId: NativeSessionId; sequence: number },
): AgentRuntimeEvent[] {
  const base = {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    eventId: stringValue(raw.uuid, `${context.threadId}-${context.sequence}`),
    sequence: context.sequence,
    driver: context.driver,
    instance: context.instance,
    threadId: context.threadId,
    nativeSessionId: context.nativeSessionId,
  } as const;
  const kind = claudeEventKind(raw);

  if (kind === "task_started" || kind === "task_progress" || kind === "task_updated" || kind === "task_notification") {
    return [{
      ...base,
      type: "task",
      itemId: stringValue(raw.task_id, kind),
      status: stringValue(raw.status, kind),
    }];
  }
  if (kind === "status") {
    return [{ ...base, type: "task", itemId: "compaction", status: stringValue(raw.status, "status") }];
  }
  if (kind === "hook_started" || kind === "hook_response") {
    return [{ ...base, type: "task", itemId: stringValue(raw.hook_name, stringValue(raw.hook_event, "hook")), status: kind }];
  }
  if (kind === "permission_denied") {
    return [{ ...base, type: "error", message: stringValue(raw.message, stringValue(raw.reason, "Permission denied")) }];
  }
  if (raw.type === "system" && raw.subtype === "init") {
    return [{ ...base, type: "session", status: "ready" }];
  }
  if (raw.type === "assistant" && isRecord(raw.message)) {
    const message = raw.message;
    const events: AgentRuntimeEvent[] = [];
    for (const [index, block] of arrayValue(message.content).entries()) {
      if (!isRecord(block)) continue;
      if (block.type === "text" && stringValue(block.text).length > 0) {
        events.push({ ...base, type: "text", text: stringValue(block.text) });
      } else if (block.type === "tool_use") {
        events.push({ ...base, type: "tool", toolName: stringValue(block.name, "Tool"), itemId: stringValue(block.id, `${base.eventId}-${index}`) });
      }
    }
    return events;
  }
  if (raw.type === "stream_event" && isRecord(raw.event)) {
    const streamEvent = raw.event;
    if (streamEvent.type === "content_block_delta" && isRecord(streamEvent.delta) && streamEvent.delta.type === "text_delta") {
      return [{ ...base, type: "text", text: stringValue(streamEvent.delta.text) }];
    }
    return [];
  }
  if (raw.type === "result") {
    const events: AgentRuntimeEvent[] = [{
      ...base,
      type: "turn",
      status: raw.is_error === true ? "failed" : "completed",
    }];
    if (isRecord(raw.usage)) {
      events.push({
        ...base,
        type: "usage",
        usage: {
          inputTokens: Number(raw.usage.input_tokens ?? 0),
          outputTokens: Number(raw.usage.output_tokens ?? 0),
          cacheReadTokens: Number(raw.usage.cache_read_input_tokens ?? 0),
          cacheWriteTokens: Number(raw.usage.cache_creation_input_tokens ?? 0),
          totalTokens: Number(raw.usage.input_tokens ?? 0) + Number(raw.usage.output_tokens ?? 0),
          modelContextWindow: null,
        },
      });
    }
    return events;
  }
  return [];
}

export const TASK_TERMINAL_STATUSES = new Set(["completed", "failed", "aborted", "detached"]);

export function mapTaskStatus(raw: string): string {
  switch (raw) {
    case "completed": case "done": case "success": return "completed";
    case "failed": case "error": return "failed";
    case "cancelled": case "canceled": case "aborted": case "interrupted": return "aborted";
    case "paused": return "paused";
    case "backgrounded": case "background": return "detached";
    case "pending": case "queued": return "pending";
    case "running": case "in_progress": return "inProgress";
    default: return "inProgress";
  }
}

/** Groups an active turn's subagent task items by the parent Task tool call so
 * a coordinated workflow can be rendered as members/phases instead of a flat list. */
export function groupWorkflowTasks(turn: AgentTurn): Array<{ parentToolUseId: string; phase: string; tasks: AgentItem[] }> {
  const groups = new Map<string, { parentToolUseId: string; phase: string; tasks: AgentItem[] }>();
  for (const item of turn.items) {
    if (item.type !== "collabAgentToolCall") continue;
    const key = stringValue(item.parentToolUseId) || stringValue(item.toolUseId) || stringValue(item.id);
    const existing = groups.get(key);
    const phase = stringValue(item.phase) || existing?.phase || "Allgemein";
    if (existing) {
      existing.tasks.push(item);
      existing.phase = phase;
    } else {
      groups.set(key, { parentToolUseId: key, phase, tasks: [item] });
    }
  }
  return Array.from(groups.values());
}

export function classifyResultErrorCategory(terminalReason: string, errorText: string | null): string {
  const haystack = `${terminalReason} ${errorText ?? ""}`.toLowerCase();
  if (haystack.includes("budget") || haystack.includes("credit") || haystack.includes("billing")) return "budget";
  if (haystack.includes("structured") || haystack.includes("schema")) return "structured-output";
  if (haystack.includes("prompt") && (haystack.includes("too long") || haystack.includes("too_long") || haystack.includes("length"))) return "prompt-too-long";
  if (/\bauth(?!or\b|orized\b)/.test(haystack) || haystack.includes("401") || haystack.includes("credential")) return "auth";
  if (haystack.includes("529") || haystack.includes("overload")) return "overload";
  if (haystack.includes("model")) return "model";
  if (haystack.includes("image")) return "image";
  return "unknown";
}
