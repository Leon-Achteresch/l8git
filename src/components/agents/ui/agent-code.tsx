"use client";

import {
  type CSSProperties,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Highlighter } from "shiki";
import { cn } from "@/lib/utils";

export type AgentCodeLanguage =
  | "bash"
  | "diff"
  | "json"
  | "text"
  | "tsx"
  | "typescript";

export interface AgentCodeToken {
  content: string;
  offset: number;
  light?: string;
  dark?: string;
}

export type AgentCodeTokenLines = AgentCodeToken[][];

export interface AgentCodeProps {
  code: string;
  language?: AgentCodeLanguage;
  highlight?: boolean;
  className?: string;
}

export interface AgentCodeLineProps {
  code: string;
  tokens?: AgentCodeToken[];
  className?: string;
}

const LIGHT_THEME = "github-light-high-contrast";
const DARK_THEME = "github-dark-high-contrast";
const MAX_HIGHLIGHT_CHARS = 80_000;
const MAX_TOKEN_CACHE_ENTRIES = 16;
const HIGHLIGHT_DEBOUNCE_MS = 140;
let agentCodeHighlighter: Promise<Highlighter> | null = null;
const tokenCache = new Map<string, AgentCodeTokenLines>();

function getAgentCodeHighlighter() {
  if (!agentCodeHighlighter) {
    // Shiki is one of the largest dependencies on the agents route. Load it
    // only after visible code has settled instead of parsing it on page entry.
    agentCodeHighlighter = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: [LIGHT_THEME, DARK_THEME],
        langs: ["bash", "diff", "json", "tsx", "typescript"],
      }),
    );
  }
  return agentCodeHighlighter;
}

function tokenCacheKey(code: string, language: AgentCodeLanguage) {
  return `${language}\u0000${code}`;
}

export function useAgentCodeTokens(
  code: string,
  language: AgentCodeLanguage,
  enabled = true,
) {
  const key = tokenCacheKey(code, language);
  const cached = enabled ? tokenCache.get(key) : undefined;
  const [result, setResult] = useState<{
    key: string;
    code: string;
    language: AgentCodeLanguage;
    lines: AgentCodeTokenLines;
  } | null>(cached ? { key, code, language, lines: cached } : null);

  useEffect(() => {
    if (!enabled || !code || code.length > MAX_HIGHLIGHT_CHARS) {
      setResult(null);
      return;
    }
    const current = tokenCache.get(key);
    if (current) {
      setResult({ key, code, language, lines: current });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getAgentCodeHighlighter().then((highlighter) => {
        if (cancelled) return;
        const lines = highlighter
          .codeToTokensWithThemes(code, {
            lang: language,
            themes: {
              light: LIGHT_THEME,
              dark: DARK_THEME,
            },
          })
          .map((line) =>
            line.map((token) => ({
              content: token.content,
              offset: token.offset,
              light: token.variants.light?.color,
              dark: token.variants.dark?.color,
            })),
        );
        if (cancelled) return;
        if (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
          const oldest = tokenCache.keys().next().value;
          if (oldest) tokenCache.delete(oldest);
        }
        tokenCache.set(key, lines);
        setResult({ key, code, language, lines });
      });
    }, HIGHLIGHT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, enabled, key, language]);

  if (!enabled) return null;
  if (result?.key === key) return result.lines;
  if (result?.language === language && code.startsWith(result.code)) {
    return result.lines;
  }
  return null;
}

export function AgentCodeLine({
  code,
  tokens,
  className,
}: AgentCodeLineProps) {
  return (
    <span className={className}>
      {tokens
        ? tokens.map((token) => (
            <span
              key={`${token.offset}-${token.content}`}
              style={
                {
                  "--agent-code-light": token.light ?? "currentColor",
                  "--agent-code-dark": token.dark ?? token.light ?? "currentColor",
                } as CSSProperties
              }
              className="text-[var(--agent-code-light)] dark:text-[var(--agent-code-dark)]"
            >
              {token.content}
            </span>
          ))
        : code}
    </span>
  );
}

export function AgentCode({
  code,
  language = "bash",
  highlight = true,
  className,
}: AgentCodeProps) {
  const tokens = useAgentCodeTokens(code, language, highlight);
  const lines = useMemo(() => {
    let offset = 0;
    return code.split("\n").map((content) => {
      const line = { content, offset };
      offset += content.length + 1;
      return line;
    });
  }, [code]);

  return (
    <pre
      className={cn(
        "m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-foreground/85",
        className,
      )}
    >
      <code>
        {lines.map((line, index) => (
          <Fragment key={line.offset}>
            <AgentCodeLine code={line.content} tokens={tokens?.[index]} />
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}
