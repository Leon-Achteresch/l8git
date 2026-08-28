// Client for the agents highlighting worker.
//
// One worker for the whole surface, created on the first request and kept
// warm. Where workers are unavailable — a test runner, a stripped-down
// webview — the same tokenization runs inline so highlighting degrades in
// speed rather than disappearing.

import type { Highlighter } from "shiki";

import type {
  AgentCodeLanguage,
  AgentCodeTokenLines,
} from "@/lib/agents/agent-code-types";
import {
  AGENT_CODE_DARK_THEME,
  AGENT_CODE_LANGS,
  AGENT_CODE_LIGHT_THEME,
} from "@/lib/agents/agent-code-types";
import type {
  AgentCodeWorkerRequest,
  AgentCodeWorkerResponse,
} from "@/lib/agents/agent-code.worker";

type Pending = {
  resolve: (lines: AgentCodeTokenLines) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./agent-code.worker.ts", import.meta.url), {
      type: "module",
      name: "agent-code-highlighter",
    });
  } catch {
    workerUnavailable = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<AgentCodeWorkerResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if ("error" in event.data) entry.reject(new Error(event.data.error));
    else entry.resolve(event.data.lines);
  };
  worker.onerror = () => {
    // A worker that failed to boot will not recover; fall back for good rather
    // than leaving every later request hanging.
    workerUnavailable = true;
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) entry.reject(new Error("highlighter worker failed"));
    pending.clear();
  };
  return worker;
}

let inlineHighlighter: Promise<Highlighter> | null = null;

function getInlineHighlighter(): Promise<Highlighter> {
  if (!inlineHighlighter) {
    inlineHighlighter = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: [AGENT_CODE_LIGHT_THEME, AGENT_CODE_DARK_THEME],
        langs: [...AGENT_CODE_LANGS],
      }),
    );
  }
  return inlineHighlighter;
}

async function tokenizeInline(
  code: string,
  language: AgentCodeLanguage,
): Promise<AgentCodeTokenLines> {
  const highlighter = await getInlineHighlighter();
  return highlighter
    .codeToTokensWithThemes(code, {
      lang: language,
      themes: { light: AGENT_CODE_LIGHT_THEME, dark: AGENT_CODE_DARK_THEME },
    })
    .map((line) =>
      line.map((token) => ({
        content: token.content,
        offset: token.offset,
        light: token.variants.light?.color,
        dark: token.variants.dark?.color,
      })),
    );
}

export function tokenizeAgentCode(
  code: string,
  language: AgentCodeLanguage,
): Promise<AgentCodeTokenLines> {
  const instance = getWorker();
  if (!instance) return tokenizeInline(code, language);

  const id = nextRequestId++;
  const request: AgentCodeWorkerRequest = { id, code, language };
  return new Promise<AgentCodeTokenLines>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    instance.postMessage(request);
  }).catch(() => tokenizeInline(code, language));
}
