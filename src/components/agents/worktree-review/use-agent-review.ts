import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { chatStoreFor, useProviderChatStore } from "@/lib/agents/active-chat-store";
import {
  collectFinishedTurnIds,
  existingAgentReviewFinishController,
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
  createdAt?: number;
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
      return { worktreePath: path, basePath: stored.basePath, branch: stored.branch, createdAt: stored.createdAt };
    }
    if (derived) {
      return { worktreePath: path, basePath: derived.basePath, branch: derived.branch };
    }
    return null;
  }, [path, stored, derived]);
}

/** Preserve the opened generation when its metadata disappears during cleanup. */
export function useAgentReviewIdentity(session: AgentReviewSession): number | undefined {
  const metadataCreatedAt = useAgentWorktreeStore((state) => state.worktrees[session.worktreePath]?.createdAt);
  const supplied = metadataCreatedAt ?? session.createdAt;
  const current = Number.isSafeInteger(supplied) && (supplied ?? 0) > 0 ? supplied : undefined;
  const key = `${session.basePath}\0${session.worktreePath}`;
  const captured = useRef<{ key: string; createdAt?: number } | null>(null);
  if (captured.current?.key !== key) {
    captured.current = { key, createdAt: current ?? existingAgentReviewFinishController(session.worktreePath, session.basePath)?.context.worktreeCreatedAt };
  } else if (current !== undefined) {
    captured.current.createdAt = current;
  }
  return captured.current.createdAt;
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

export function isAgentSessionBusyNow(worktreePath: string): boolean {
  return (["codex", "claude", "opencode", "cursor"] as const).some((provider) => busyIn(chatStoreFor(provider).getState(), worktreePath));
}

export function finishedTurnsIn(state: AgentChatState, worktreePath: string): string {
  const ids: string[] = [];
  for (const conversation of Object.values(state.conversations)) {
    if (conversation.path !== worktreePath) continue;
    ids.push(...collectFinishedTurnIds(conversation.turns));
  }
  return ids.join(",");
}

export function useAgentReviewLiveRefresh(worktreePath: string, reload: () => void): void {
  const codex = useProviderChatStore("codex", (state) => finishedTurnsIn(state, worktreePath));
  const claude = useProviderChatStore("claude", (state) => finishedTurnsIn(state, worktreePath));
  const opencode = useProviderChatStore("opencode", (state) => finishedTurnsIn(state, worktreePath));
  const cursor = useProviderChatStore("cursor", (state) => finishedTurnsIn(state, worktreePath));
  const combined = `${codex}|${claude}|${opencode}|${cursor}`;
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = combined;
      return;
    }
    if (seen.current !== combined) {
      seen.current = combined;
      reload();
    }
  }, [combined, reload]);
}

export function useAgentReviewSummary(session: AgentReviewSession | null, enabled: boolean) {
  const sessionKey = session ? `${session.worktreePath}\0${session.basePath}\0${session.createdAt ?? ""}` : "";
  const [result, setResult] = useState<{ key: string; summary: AgentReviewSummary } | null>(null);
  const summary = result?.key === sessionKey ? result.summary : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !session) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAgentReviewSummary(session.worktreePath, session.basePath)
      .then((next) => {
        if (cancelled) return;
        setResult({ key: sessionKey, summary: next });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setResult(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, session, sessionKey, nonce]);

  return { summary, loading, error, reload };
}

const EMPTY_DIFF: AgentReviewFileDiff = { diff: null, untrackedPlain: null, isBinary: false };

export function useAgentReviewFileDiff(
  session: AgentReviewSession | null,
  mergeBase: string | null,
  file: string | null,
  nonce: number,
) {
  const requestKey = `${session?.worktreePath ?? ""}\0${session?.createdAt ?? ""}\0${mergeBase ?? ""}\0${file ?? ""}\0${nonce}`;
  const [result, setResult] = useState<{ key: string; diff: AgentReviewFileDiff }>({ key: "", diff: EMPTY_DIFF });
  const state = result.key === requestKey ? result.diff : EMPTY_DIFF;
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!session || !mergeBase || !file) {
      setResult({ key: requestKey, diff: EMPTY_DIFF });
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadAgentReviewFileDiff(session.worktreePath, mergeBase, file)
      .then((next) => {
        if (!cancelled) setResult({ key: requestKey, diff: next });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ key: requestKey, diff: EMPTY_DIFF });
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, mergeBase, file, nonce, requestKey]);

  const parsed = useMemo(() => parseReviewDiff(state.diff), [state.diff]);

  return { ...state, parsed, loading, failed };
}
