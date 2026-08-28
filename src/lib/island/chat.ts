import { jsonSchema, stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from "ai";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  aiCallableActions,
  islandActionForTool,
  islandToolName,
  type IslandActionDef,
} from "@/lib/island/actions";
import { dispatchIslandAction } from "@/lib/island/client";
import type { IslandActionArgs, IslandSnapshot } from "@/lib/island/types";
import {
  AiError,
  resolveAiLanguage,
  resolveLanguageModel,
  toAiError,
} from "@/lib/ai/core";
import i18n from "@/lib/i18n";

export type IslandToolState = "pending" | "running" | "done" | "error" | "denied";

export type IslandToolRun = {
  id: string;
  actionId: string;
  toolName: string;
  args: IslandActionArgs;
  state: IslandToolState;
  /** Short outcome line rendered under the message. */
  detail?: string;
};

export type IslandChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: IslandToolRun[];
  createdAt: number;
  error?: string;
};

/** Keep the transcript small — it lives in localStorage and in every prompt. */
const MAX_MESSAGES = 60;
const HISTORY_TURNS = 12;
const MAX_STEPS = 8;

type ChatState = {
  messages: IslandChatMessage[];
  streaming: boolean;
  /** Write actions wait for an explicit approval unless this is on. */
  autoRun: boolean;
  setAutoRun: (value: boolean) => void;
  clear: () => void;
  resolveApproval: (toolId: string, approved: boolean) => void;
};

/** Approval gates, keyed by tool run id. Never persisted. */
const approvals = new Map<string, (approved: boolean) => void>();

export const useIslandChat = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      streaming: false,
      autoRun: false,
      setAutoRun: (autoRun) => set({ autoRun }),
      clear: () => {
        // Resolve instead of dropping: a pending gate would hang the stream.
        for (const resolve of approvals.values()) resolve(false);
        approvals.clear();
        set({ messages: [], streaming: false });
      },
      resolveApproval: (toolId, approved) => {
        const resolve = approvals.get(toolId);
        approvals.delete(toolId);
        resolve?.(approved);
      },
    }),
    {
      name: "l8git-island-chat",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ messages, autoRun }) => ({
        messages: messages.slice(-MAX_MESSAGES),
        autoRun,
      }),
      merge: (persisted, current) => {
        const raw = persisted as Partial<ChatState> | undefined;
        return {
          ...current,
          autoRun: typeof raw?.autoRun === "boolean" ? raw.autoRun : current.autoRun,
          messages: Array.isArray(raw?.messages)
            ? raw.messages.filter(isChatMessage).slice(-MAX_MESSAGES)
            : [],
        };
      },
    },
  ),
);

function isChatMessage(value: unknown): value is IslandChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<IslandChatMessage>;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.text === "string" &&
    Array.isArray(m.tools)
  );
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function appendMessage(message: IslandChatMessage) {
  useIslandChat.setState((s) => ({
    messages: [...s.messages, message].slice(-MAX_MESSAGES),
  }));
}

function patchMessage(id: string, patch: Partial<IslandChatMessage>) {
  useIslandChat.setState((s) => ({
    messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }));
}

function patchTool(
  messageId: string,
  toolId: string,
  patch: Partial<IslandToolRun>,
) {
  useIslandChat.setState((s) => ({
    messages: s.messages.map((m) =>
      m.id !== messageId
        ? m
        : {
            ...m,
            tools: m.tools.map((t) => (t.id === toolId ? { ...t, ...patch } : t)),
          },
    ),
  }));
}

function argSchema(action: IslandActionDef) {
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];
  for (const arg of action.args ?? []) {
    properties[arg.name] = { type: arg.type, description: arg.description };
    if (arg.required) required.push(arg.name);
  }
  return jsonSchema<IslandActionArgs>({
    type: "object",
    properties,
    required,
    additionalProperties: false,
  });
}

function systemPrompt(snapshot: IslandSnapshot, language: string): string {
  const active = snapshot.repos.find((r) => r.path === snapshot.activePath);
  const repoLines = snapshot.repos
    .map(
      (r) =>
        `- ${r.label} (${r.path}) — branch ${r.branch || "?"}, ${r.dirty} uncommitted change(s)${
          r.path === snapshot.activePath ? " [active]" : ""
        }`,
    )
    .join("\n");

  return [
    "You are the assistant inside l8git, a desktop Git client. You are embedded in the Dynamic Island, a small always-on-top surface, so answers must be short and concrete: a few sentences, bullet points only when they earn their place, no preamble.",
    "You can operate the app through your tools: read repository state and run l8git actions. Prefer reading before acting, and never claim you did something a tool did not confirm.",
    "Destructive or remote-facing actions may need the user's approval; if an approval is denied, accept it and suggest an alternative instead of retrying.",
    active
      ? `Active repository: ${active.label} at ${active.path}, branch ${active.branch || "?"}, ${active.dirty} uncommitted change(s), ${active.ahead} ahead / ${active.behind} behind.`
      : "No repository is active right now.",
    repoLines ? `Opened repositories:\n${repoLines}` : "",
    `Write your answers in ${language}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function history(messages: IslandChatMessage[]): ModelMessage[] {
  return messages
    .slice(-HISTORY_TURNS)
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.text }) as ModelMessage);
}

function buildTools(assistantId: string, signal: AbortSignal): ToolSet {
  const entries = aiCallableActions().map((action) => [
    islandToolName(action),
    tool({
      description: action.ai!,
      inputSchema: argSchema(action),
      execute: async (args: IslandActionArgs) =>
        runTool(assistantId, action, args ?? {}, signal),
    }),
  ]);
  return Object.fromEntries(entries) as ToolSet;
}

async function runTool(
  assistantId: string,
  action: IslandActionDef,
  args: IslandActionArgs,
  signal: AbortSignal,
): Promise<unknown> {
  const toolId = newId("tool");
  const needsApproval = !!action.writes && !useIslandChat.getState().autoRun;

  useIslandChat.setState((s) => ({
    messages: s.messages.map((m) =>
      m.id !== assistantId
        ? m
        : {
            ...m,
            tools: [
              ...m.tools,
              {
                id: toolId,
                actionId: action.id,
                toolName: islandToolName(action),
                args,
                state: needsApproval ? "pending" : "running",
              },
            ],
          },
    ),
  }));

  if (needsApproval) {
    const approved = await waitForApproval(toolId, signal);
    if (!approved) {
      patchTool(assistantId, toolId, {
        state: "denied",
        detail: i18n.t("islandChat.denied"),
      });
      return { denied: true, reason: "The user declined this action." };
    }
    patchTool(assistantId, toolId, { state: "running" });
  }

  const result = await dispatchIslandAction({
    actionId: action.id,
    args,
    ...(typeof args.path === "string" ? { path: args.path } : {}),
  });

  patchTool(assistantId, toolId, {
    state: result.ok ? "done" : "error",
    detail: result.message,
  });

  return result.ok
    ? { ok: true, result: result.data ?? result.message }
    : { ok: false, error: result.message };
}

function waitForApproval(toolId: string, signal: AbortSignal): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const settle = (approved: boolean) => {
      signal.removeEventListener("abort", onAbort);
      approvals.delete(toolId);
      resolve(approved);
    };
    const onAbort = () => settle(false);
    approvals.set(toolId, settle);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

let active: AbortController | null = null;

export function stopIslandChat(): void {
  active?.abort();
  active = null;
  useIslandChat.setState({ streaming: false });
}

/** Sends one user turn and streams the answer into the store. */
export async function sendIslandChatMessage(
  text: string,
  snapshot: IslandSnapshot,
): Promise<void> {
  const prompt = text.trim();
  if (!prompt || useIslandChat.getState().streaming) return;

  appendMessage({
    id: newId("user"),
    role: "user",
    text: prompt,
    tools: [],
    createdAt: Date.now(),
  });

  const assistantId = newId("assistant");
  appendMessage({
    id: assistantId,
    role: "assistant",
    text: "",
    tools: [],
    createdAt: Date.now(),
  });

  const controller = new AbortController();
  active = controller;
  useIslandChat.setState({ streaming: true });

  try {
    const model = resolveLanguageModel();
    const language = resolveAiLanguage(snapshot.activePath ?? undefined);
    const messages = history(
      useIslandChat.getState().messages.filter((m) => m.id !== assistantId),
    );

    const result = streamText({
      model,
      system: systemPrompt(snapshot, language),
      messages,
      tools: buildTools(assistantId, controller.signal),
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: controller.signal,
    });

    let answer = "";
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        answer += part.text;
        patchMessage(assistantId, { text: answer });
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    if (!answer.trim()) {
      const ran = useIslandChat
        .getState()
        .messages.find((m) => m.id === assistantId)?.tools.length;
      patchMessage(assistantId, {
        text: ran ? i18n.t("islandChat.toolsOnly") : i18n.t("errors.aiNoResponse"),
      });
    }
  } catch (cause) {
    const error =
      cause instanceof AiError ? cause : toAiError(cause, undefined, controller.signal);
    patchMessage(assistantId, {
      error: error.kind === "aborted" ? i18n.t("islandChat.stopped") : error.message,
    });
  } finally {
    if (active === controller) active = null;
    useIslandChat.setState({ streaming: false });
  }
}

export { islandActionForTool };
