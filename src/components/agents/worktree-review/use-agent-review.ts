import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useProviderChatStore } from "@/lib/agents/active-chat-store";
import {
  loadAgentReviewFileDiff,
  loadAgentReviewSummary,
  parseReviewDiff,
  type AgentReviewFileDiff,
  type AgentReviewSummary,
} from "@/lib/agents/agent-review";
import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import type { AgentChatState } from "@/lib/agents/chat-store";
import { useRepoStore } from "@/lib/repo-store";

export interface AgentReviewSession {
  worktreePath: string;
  basePath: string;
  branch: string | null;
}

export function useAgentReviewSession(path: string): AgentReviewSession | null {
  const stored = useAgentWorktreeStore((state) => state.worktrees[path] ?? null);
  const derived = useRepoStore(
    useShallow((state) => {
      const entries = state.worktrees[path];
      if (!entries) return null;
      const self = entries.find((entry) => entry.path === path);
      if (!self || self.is_main) return null;
      const main = entries.find((entry) => entry.is_main);
      if (!main) return null;
      return { basePath: main.path, branch: self.branch ?? null };
    }),
  );

  return useMemo(() => {
    if (stored) {
      return { worktreePath: path, basePath: stored.basePath, branch: stored.branch };
    }
    if (derived) {
      return { worktreePath: path, basePath: derived.basePath, branch: derived.branch };
    }
    return null;
  }, [path, stored, derived]);
}

function busyIn(state: AgentChatState, worktreePath: string): boolean {
  return Object.values(state.conversations).some(
    (conversation) => conversation.path === worktreePath && Boolean(conversation.activeTurnId),
  );
}

export function useAgentSessionBusy(worktreePath: string): boolean {
  const codex = useProviderChatStore("codex", (state) => busyIn(state, worktreePath));
  const claude = useProviderChatStore("claude", (state) => busyIn(state, worktreePath));
  const opencode = useProviderChatStore("opencode", (state) => busyIn(state, worktreePath));
  const cursor = useProviderChatStore("cursor", (state) => busyIn(state, worktreePath));
  return codex || claude || opencode || cursor;
}

export function useAgentReviewSummary(session: AgentReviewSession | null, enabled: boolean) {
  const [summary, setSummary] = useState<AgentReviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAgentReviewSummary(session.worktreePath, session.basePath)
      .then((next) => {
        if (cancelled) return;
        setSummary(next);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSummary(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, session, nonce]);

  return { summary, loading, error, reload };
}

const EMPTY_DIFF: AgentReviewFileDiff = { diff: null, untrackedPlain: null, isBinary: false };

export function useAgentReviewFileDiff(
  session: AgentReviewSession | null,
  mergeBase: string | null,
  file: string | null,
  nonce: number,
) {
  const [state, setState] = useState<AgentReviewFileDiff>(EMPTY_DIFF);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!session || !mergeBase || !file) {
      setState(EMPTY_DIFF);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadAgentReviewFileDiff(session.worktreePath, mergeBase, file)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) {
          setState(EMPTY_DIFF);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, mergeBase, file, nonce]);

  const parsed = useMemo(() => parseReviewDiff(state.diff), [state.diff]);

  return { ...state, parsed, loading, failed };
}
