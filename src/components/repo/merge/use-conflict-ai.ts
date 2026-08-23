import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AiError, generateAiText, resolveAiLanguage } from "@/lib/ai/core";
import { getPromptTemplate } from "@/lib/ai/prompt-prefs";
import {
  buildConflictSuggestionPrompt,
  classifySuggestion,
  conflictBlockKey,
  parseConflictSuggestion,
  type SuggestionRelation,
} from "@/lib/ai/conflict-suggest";
import type { ConflictBlock } from "@/lib/conflict-parser";

export interface ConflictSuggestionEntry {
  status: "loading" | "ready" | "error";
  content?: string;
  lines?: string[];
  relation?: SuggestionRelation;
  error?: string;
}

export interface ConflictAiBatch {
  done: number;
  total: number;
}

export interface ConflictAiController {
  entries: Record<string, ConflictSuggestionEntry>;
  busyKey: string | null;
  batch: ConflictAiBatch | null;
  busy: boolean;
  entryFor: (block?: ConflictBlock) => ConflictSuggestionEntry | undefined;
  suggest: (block: ConflictBlock, hint?: string) => void;
  suggestAll: (blocks: ConflictBlock[]) => void;
  cancel: () => void;
  dismiss: (block: ConflictBlock) => void;
}

export interface ConflictAiOptions {
  filePath: string;
  repoPath?: string;
  text: string;
  baseFile?: string;
}

export function useConflictAi({
  filePath,
  repoPath,
  text,
  baseFile,
}: ConflictAiOptions): ConflictAiController {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Record<string, ConflictSuggestionEntry>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [batch, setBatch] = useState<ConflictAiBatch | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef(text);
  const mountedRef = useRef(true);

  textRef.current = text;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const runOne = useCallback(
    async (block: ConflictBlock, hint: string | undefined, signal: AbortSignal) => {
      const key = conflictBlockKey(block);
      setBusyKey(key);
      setEntries((prev) => ({ ...prev, [key]: { status: "loading" } }));

      try {
        const { system, prompt } = buildConflictSuggestionPrompt(
          getPromptTemplate("conflictResolution"),
          {
            file: filePath,
            language: resolveAiLanguage(repoPath),
            text: textRef.current,
            block,
            baseFile,
          },
        );

        const raw = await generateAiText({
          feature: "conflictResolution",
          system,
          prompt,
          hint,
          signal,
        });

        const parsed = parseConflictSuggestion(raw);
        if (!mountedRef.current || signal.aborted) return;

        if (!parsed.ok) {
          setEntries((prev) => ({
            ...prev,
            [key]: { status: "error", error: t(parsed.messageKey) },
          }));
          return;
        }

        setEntries((prev) => ({
          ...prev,
          [key]: {
            status: "ready",
            content: parsed.content,
            lines: parsed.lines,
            relation: classifySuggestion(parsed.lines, block),
          },
        }));
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof AiError && err.kind === "aborted") {
          setEntries((prev) => {
            const next = { ...prev };
            if (next[key]?.status === "loading") delete next[key];
            return next;
          });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setEntries((prev) => ({ ...prev, [key]: { status: "error", error: message } }));
      } finally {
        if (mountedRef.current) setBusyKey(null);
      }
    },
    [baseFile, filePath, repoPath, t],
  );

  const suggest = useCallback(
    (block: ConflictBlock, hint?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBatch(null);
      void runOne(block, hint, controller.signal);
    },
    [runOne],
  );

  const suggestAll = useCallback(
    (blocks: ConflictBlock[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        setBatch({ done: 0, total: blocks.length });
        for (let i = 0; i < blocks.length; i++) {
          if (controller.signal.aborted || !mountedRef.current) break;
          await runOne(blocks[i], undefined, controller.signal);
          if (mountedRef.current) setBatch({ done: i + 1, total: blocks.length });
        }
        if (mountedRef.current) setBatch(null);
      })();
    },
    [runOne],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyKey(null);
    setBatch(null);
  }, []);

  const dismiss = useCallback((block: ConflictBlock) => {
    const key = conflictBlockKey(block);
    setEntries((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const entryFor = useCallback(
    (block?: ConflictBlock) => (block ? entries[conflictBlockKey(block)] : undefined),
    [entries],
  );

  return {
    entries,
    busyKey,
    batch,
    busy: busyKey !== null || batch !== null,
    entryFor,
    suggest,
    suggestAll,
    cancel,
    dismiss,
  };
}
