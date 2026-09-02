/// <reference lib="webworker" />
//
// Syntax highlighting for the agents transcript, off the main thread.
//
// Shiki tokenizes with real TextMate grammars, which for a long tool output or
// a large diff is tens of milliseconds of straight-line work. On the main
// thread that lands as dropped frames while a turn streams in. Here it costs
// the transcript nothing.

import type { Highlighter } from "shiki";

import {
  AGENT_CODE_DARK_THEME,
  AGENT_CODE_LANGS,
  AGENT_CODE_LIGHT_THEME,
  type AgentCodeLanguage,
  type AgentCodeTokenLines,
} from "@/lib/agents/agent-code-types";

export type AgentCodeWorkerRequest = {
  id: number;
  code: string;
  language: AgentCodeLanguage;
};

export type AgentCodeWorkerResponse =
  | { id: number; lines: AgentCodeTokenLines }
  | { id: number; error: string };

let highlighter: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: [AGENT_CODE_LIGHT_THEME, AGENT_CODE_DARK_THEME],
        langs: [...AGENT_CODE_LANGS],
      }),
    );
  }
  return highlighter;
}

async function loadedHighlighter(language: AgentCodeLanguage): Promise<Highlighter> {
  const instance = await getHighlighter();
  if (!instance.getLoadedLanguages().includes(language)) {
    // A grammar outside the preloaded set is fetched on first use; an unknown
    // id just means the file gets rendered unstyled.
    try {
      await instance.loadLanguage(language as never);
    } catch {
      return instance;
    }
  }
  return instance;
}

self.onmessage = (event: MessageEvent<AgentCodeWorkerRequest>) => {
  const { id, code, language } = event.data;
  void loadedHighlighter(language)
    .then((instance) => {
      const lang = (instance.getLoadedLanguages().includes(language) ? language : "text") as never;
      const lines: AgentCodeTokenLines = instance
        .codeToTokensWithThemes(code, {
          lang,
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
      const response: AgentCodeWorkerResponse = { id, lines };
      self.postMessage(response);
    })
    .catch((error: unknown) => {
      const response: AgentCodeWorkerResponse = {
        id,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    });
};
