import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertCircle, LoaderCircle, Sparkles, X } from "lucide-react";
import { m } from "motion/react";
import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { AgentRequestCard } from "@/components/agents/chat/agent-request-card";
import { ClaudeCodeLogo, CodexLogo } from "@/components/brand/agent-logos";
import { Button } from "@/components/ui/button";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { SPRING_PANEL } from "@/lib/motion/ease";

const AgentTurnView = lazy(() => import("@/components/agents/chat/agent-item").then(
  (module) => ({ default: module.AgentTurnView }),
));

const INITIAL_VISIBLE_TURNS = 32;
const TURN_PAGE_SIZE = 32;

function repoName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

export const AgentConversationViewport = memo(function AgentConversationViewport({
  path,
  threadId,
  onStarter,
  scrollToBottomSignal,
}: {
  path: string;
  threadId: string | null;
  onStarter: (text: string) => void;
  scrollToBottomSignal: number;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const isClaude = provider === "claude";
  const ProviderLogo = isClaude ? ClaudeCodeLogo : CodexLogo;
  const providerLabel = isClaude ? "Claude Code" : "Codex";
  const conversation = useAgentChatStore((state) =>
    threadId ? state.conversations[threadId] : undefined,
  );
  const requests = useAgentChatStore(
    useShallow((state) => [
      ...(threadId ? (state.requestsByThread[threadId] ?? []) : []),
      ...(state.requestsByThread.__global ?? []),
    ]),
  );
  const connectionStatus = useAgentChatStore((state) => state.connectionStatus);
  const connectionError = useAgentChatStore((state) => state.connectionError);
  const requiresAuth = useAgentChatStore((state) => state.requiresAuth);
  const loginStatus = useAgentChatStore((state) => state.loginStatus);
  const loginError = useAgentChatStore((state) => state.loginError);
  const connect = useAgentChatStore((state) => state.connect);
  const loadThreads = useAgentChatStore((state) => state.loadThreads);
  const openThread = useAgentChatStore((state) => state.openThread);
  const startLogin = useAgentChatStore((state) => state.startLogin);
  const clearError = useAgentChatStore((state) => state.clearError);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreBottomOffset = useRef<number | null>(null);
  const [visibleTurnCount, setVisibleTurnCount] = useState(INITIAL_VISIBLE_TURNS);
  const turns = conversation?.turns ?? [];
  const hiddenTurnCount = Math.max(0, turns.length - visibleTurnCount);
  const visibleTurns = hiddenTurnCount > 0 ? turns.slice(-visibleTurnCount) : turns;
  const busy = Boolean(conversation?.activeTurnId);
  const starters = useMemo(() => [
    t("agentChat.starterAnalyze"),
    t("agentChat.starterImplement"),
    t("agentChat.starterReview"),
  ], [t]);

  useEffect(() => {
    stickToBottom.current = true;
    restoreBottomOffset.current = null;
    setVisibleTurnCount(INITIAL_VISIBLE_TURNS);
  }, [threadId]);

  useLayoutEffect(() => {
    if (scrollToBottomSignal === 0) return;
    const viewport = scrollRef.current;
    stickToBottom.current = true;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [scrollToBottomSignal]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    const bottomOffset = restoreBottomOffset.current;
    if (!viewport || bottomOffset === null) return;
    viewport.scrollTop = viewport.scrollHeight - bottomOffset;
    restoreBottomOffset.current = null;
  }, [visibleTurnCount]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || !stickToBottom.current) return;
    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [requests.length, busy, threadId]);

  useEffect(() => {
    const content = contentRef.current;
    const viewport = scrollRef.current;
    if (!content || !viewport || typeof ResizeObserver === "undefined") return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!stickToBottom.current || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        viewport.scrollTop = viewport.scrollHeight;
      });
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [threadId]);

  const login = async () => {
    try {
      const url = await startLogin();
      if (url) await openUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const node = event.currentTarget;
        stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
      }}
      className="agents-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-[52rem] flex-col px-5 py-8 sm:px-8 lg:py-10">
        {conversation?.loading || (!threadId && connectionStatus === "connecting") ? (
          <div className="m-auto w-full max-w-xl space-y-3" aria-label={t("agentChat.connecting")}>
            <div className="h-3 w-32 animate-pulse rounded-full bg-foreground/[0.07]" />
            <div className="h-3 w-full animate-pulse rounded-full bg-foreground/[0.05]" />
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-foreground/[0.05]" />
          </div>
        ) : !threadId && connectionError && connectionStatus === "error" ? (
          <div className="m-auto max-w-md border-l-2 border-destructive/70 py-1 pl-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium">{t("agentChat.startErrorTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{connectionError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-lg"
                  onClick={() => void connect().then(() => loadThreads([path])).catch(() => {})}
                >
                  {t("agentChat.retry")}
                </Button>
              </div>
            </div>
          </div>
        ) : requiresAuth ? (
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_PANEL}
            className="m-auto max-w-sm text-center"
          >
            <span className="agents-accent-surface mx-auto grid size-11 place-items-center rounded-[14px]">
              <ProviderLogo className="size-5" />
            </span>
            <p className="mt-4 text-base font-semibold tracking-tight">
              {isClaude ? "Claude Code is not signed in" : t("agentChat.loginTitle")}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {isClaude
                ? "Sign in with your Anthropic account. l8git keeps using the installed Claude Code CLI."
                : t("agentChat.loginDescription")}
            </p>
            {loginError ? <p className="mt-2 text-xs text-destructive">{loginError}</p> : null}
            <Button
              type="button"
              className="mt-5 rounded-[10px]"
              onClick={() => void login()}
              disabled={loginStatus === "starting" || loginStatus === "waiting"}
            >
              {loginStatus === "starting" || loginStatus === "waiting" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {loginStatus === "waiting" ? t("agentChat.loginWaiting") : `Sign in to ${providerLabel}`}
            </Button>
          </m.div>
        ) : !conversation || turns.length === 0 ? (
          <div className="my-auto flex flex-col items-center py-12 text-center">
            <m.span
              initial={{ opacity: 0, scale: 0.7, rotate: -14 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={SPRING_PANEL}
              className="agents-accent-text grid size-10 place-items-center"
            >
              <Sparkles className="size-7" strokeWidth={1.6} />
            </m.span>
            <m.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_PANEL, delay: 0.04 }}
              className="mt-4 text-balance text-[clamp(1.5rem,3vw,2.15rem)] font-semibold leading-none tracking-[-0.045em]"
            >
              What should we work on?
            </m.h2>
            <m.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_PANEL, delay: 0.08 }}
              className="mt-3 max-w-md text-pretty text-xs leading-5 text-muted-foreground"
            >
              Ask {providerLabel} to plan, build, refactor, or debug in {repoName(path)}.
            </m.p>
            <div className="mt-6 flex w-full max-w-2xl flex-wrap justify-center gap-2">
              {starters.map((starter, index) => (
                <m.button
                  key={starter}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_PANEL, delay: 0.1 + index * 0.045 }}
                  onClick={() => onStarter(starter)}
                  className="rounded-[10px] border border-[var(--agents-line)] bg-background/45 px-3 py-2 text-left text-[11px] leading-4 text-foreground/80 outline-none transition-[background-color,color,transform,box-shadow] hover:bg-background hover:text-foreground hover:shadow-xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {starter}
                </m.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-7 pb-6">
            {hiddenTurnCount > 0 ? (
              <div className="flex justify-center pb-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-lg text-xs text-muted-foreground"
                  onClick={() => {
                    const viewport = scrollRef.current;
                    if (viewport) {
                      restoreBottomOffset.current = viewport.scrollHeight - viewport.scrollTop;
                      stickToBottom.current = false;
                    }
                    setVisibleTurnCount((count) => count + TURN_PAGE_SIZE);
                  }}
                >
                  {t("agentChat.showOlder", { count: Math.min(TURN_PAGE_SIZE, hiddenTurnCount) })}
                </Button>
              </div>
            ) : null}
            <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-foreground/[0.025]" />}>
              {visibleTurns.map((turn, index) => (
                <m.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_PANEL, delay: Math.min(index, 6) * 0.025 }}
                  className="[contain-intrinsic-size:auto_320px] [content-visibility:auto]"
                >
                  <AgentTurnView turn={turn} />
                </m.div>
              ))}
            </Suspense>
          </div>
        )}

        {requests.length > 0 ? (
          <div className="mt-6 space-y-3">
            {requests.map((request) => (
              <AgentRequestCard key={`${request.sessionId}:${String(request.requestId)}`} request={request} />
            ))}
          </div>
        ) : null}

        {conversation?.error ? (
          <div className="mt-4 flex items-start gap-2 border-l-2 border-destructive/70 py-1 pl-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{conversation.error}</span>
            <button type="button" onClick={() => void openThread(path, conversation.threadId)} className="rounded px-1.5 py-0.5 font-medium hover:bg-destructive/10">
              {t("agentChat.retry")}
            </button>
            <button type="button" onClick={() => clearError(conversation.threadId)} aria-label={t("agentChat.dismissError")} className="rounded p-0.5 hover:bg-destructive/10">
              <X className="size-3" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
