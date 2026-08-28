"use client";

import {
  type CSSProperties,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import { tokenizeAgentCode } from "@/lib/agents/agent-code-highlighter";
import type {
  AgentCodeLanguage,
  AgentCodeToken,
  AgentCodeTokenLines,
} from "@/lib/agents/agent-code-types";
import { cn } from "@/lib/utils";

export type { AgentCodeLanguage, AgentCodeToken, AgentCodeTokenLines };

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

const MAX_HIGHLIGHT_CHARS = 80_000;
const MAX_TOKEN_CACHE_ENTRIES = 16;
const HIGHLIGHT_DEBOUNCE_MS = 140;
const tokenCache = new Map<string, AgentCodeTokenLines>();

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
    // Debounce: while a block streams in, its text changes on every token
    // batch. Tokenizing each intermediate value would keep the worker busy
    // producing output nobody sees.
    const timer = window.setTimeout(() => {
      void tokenizeAgentCode(code, language)
        .then((lines) => {
          if (cancelled) return;
          if (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
            const oldest = tokenCache.keys().next().value;
            if (oldest) tokenCache.delete(oldest);
          }
          tokenCache.set(key, lines);
          setResult({ key, code, language, lines });
        })
        .catch(() => {
          // Highlighting is decoration; plain text is a fine result.
        });
    }, HIGHLIGHT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, enabled, key, language]);

  if (!enabled) return null;
  if (result?.key === key) return result.lines;
  // While a block grows, keep painting the tokens of the prefix already
  // highlighted instead of dropping back to unstyled text.
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
