import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  ArrowDown,
  Command,
  GitPullRequestArrow,
  Hammer,
  LoaderCircle,
  ScanSearch,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { AgentRequestCard } from "@/components/agents/chat/agent-request-card";
import { AgentProviderMark } from "@/components/agents/ui/agent-provider-mark";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import {
  SpinIcon,
  StaggerItem,
} from "@/components/motion/kit";
import {
  ScrollProgressCircle,
  useContainerScrollProgress,
} from "@/components/motion/scroll-progress";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { useScrollMargin } from "@/hooks/use-scroll-margin";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentCliCommand } from "@/lib/agents/slash-commands";
import { SPRING_PANEL } from "@/lib/motion/ease";

const AgentTurnView = lazy(() =>
  import("@/components/agents/chat/agent-turn-view").then((module) => ({
    default: module.AgentTurnView,
  })),
);

const INITIAL_VISIBLE_TURNS = 32;
const TURN_PAGE_SIZE = 32;
const TURN_ESTIMATE_PX = 320;
const STARTER_ICONS = [
  { Icon: ScanSearch, color: "var(--git-branch)" },
  { Icon: Hammer, color: "var(--git-modified)" },
  { Icon: GitPullRequestArrow, color: "var(--git-added)" },
] as const;

export const AgentConversationViewport = memo(
  function AgentConversationViewport({
    path,
    threadId,
    centered,
    composer,
    onStarter,
    cliCommands,
    onCliCommand,
    scrollToBottomSignal,
  }: {
    path: string;
    threadId: string | null;
    centered: boolean;
    composer: ReactNode;
    onStarter: (text: string) => void;
    cliCommands: AgentCliCommand[];
    onCliCommand: (command: AgentCliCommand) => void;
    scrollToBottomSignal: number;
  }) {
    const { t } = useTranslation();
    const provider = useAgentProviderStore((state) => state.provider);
    const ProviderLogo = agentProviderMeta(provider).Logo;
    const agent = agentProviderMeta(provider).label;
    const conversation = useAgentChatStore((state) =>
      threadId ? state.conversations[threadId] : undefined,
    );
    const requests = useAgentChatStore(
      useShallow((state) => [
        ...(threadId ? (state.requestsByThread[threadId] ?? []) : []),
        ...(state.requestsByThread.__global ?? []),
      ]),
    );
    const connectionStatus = useAgentChatStore(
      (state) => state.connectionStatus,
    );
    const connectionError = useAgentChatStore((state) => state.connectionError);
    const requiresAuth = useAgentChatStore((state) => state.requiresAuth);
    const loginStatus = useAgentChatStore((state) => state.loginStatus);
    const loginError = useAgentChatStore((state) => state.loginError);
    const connect = useAgentChatStore((state) => state.connect);
    const openThread = useAgentChatStore((state) => state.openThread);
    const startLogin = useAgentChatStore((state) => state.startLogin);
    const clearError = useAgentChatStore((state) => state.clearError);
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);
    const restoreBottomOffset = useRef<number | null>(null);
    const restoreDeadline = useRef(0);
    const [visibleTurnCount, setVisibleTurnCount] = useState(
      INITIAL_VISIBLE_TURNS,
    );
    const [atBottom, setAtBottom] = useState(true);
    const reduceMotion = useReducedMotion() ?? false;
    const scrollProgress = useContainerScrollProgress(scrollRef);
    const turns = conversation?.turns ?? [];
    const hiddenTurnCount = Math.max(0, turns.length - visibleTurnCount);
    const visibleTurns =
      hiddenTurnCount > 0 ? turns.slice(-visibleTurnCount) : turns;
    const busy = Boolean(conversation?.activeTurnId);
    const { scrollMargin: turnScrollMargin, listRef } =
      useScrollMargin(scrollRef);
    const turnVirtualizer = useVirtualizer({
      count: visibleTurns.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => TURN_ESTIMATE_PX,
      overscan: 4,
      useAnimationFrameWithResizeObserver: true,
      getItemKey: (index) => visibleTurns[index]?.id ?? index,
      scrollMargin: turnScrollMargin,
    });
    const measureTurn = useCallback(
      (node: HTMLElement | null) => turnVirtualizer.measureElement(node),
      [turnVirtualizer],
    );
    const totalTurnSize = turnVirtualizer.getTotalSize();
    const starters = useMemo(
      () => [
        t("agentChat.starterAnalyze"),
        t("agentChat.starterImplement"),
        t("agentChat.starterReview"),
      ],
      [t],
    );

    useEffect(() => {
      stickToBottom.current = true;
      restoreBottomOffset.current = null;
      setAtBottom(true);
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
      if (Date.now() > restoreDeadline.current)
        restoreBottomOffset.current = null;
    }, [visibleTurnCount, totalTurnSize]);

    useLayoutEffect(() => {
      const viewport = scrollRef.current;
      if (!viewport || !stickToBottom.current) return;
      const frame = requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
      return () => cancelAnimationFrame(frame);
    }, [requests.length, busy, threadId, totalTurnSize]);

    const handleScroll = useCallback(() => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      const distance =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const nearBottom = distance < 96;
      stickToBottom.current = nearBottom;
      setAtBottom((current) => (current === nearBottom ? current : nearBottom));
    }, []);

    const jumpToBottom = useCallback(() => {
      const viewport = scrollRef.current;
      stickToBottom.current = true;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }, []);

    if (connectionStatus === "connecting") {
      return (
        <AgentsEnter className="flex h-full min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="ag-card flex w-full max-w-sm flex-col items-center p-6 shadow-[var(--ag-shadow-panel)]">
            <AgentProviderMark
              working
              label={agent}
              className="size-11 rounded-[14px]"
            >
              <ProviderLogo className="size-5" />
            </AgentProviderMark>
            <p className="mt-4 text-[13px] font-medium tracking-[-0.01em]">
              {t("agentChat.connecting", { agent })}
            </p>
            <p className="ag-faint mt-1 text-[11px] leading-relaxed">
              {t("agentChat.connectingHint", { agent })}
            </p>
          </div>
        </AgentsEnter>
      );
    }

    if (connectionStatus === "error") {
      return (
        <AgentsEnter className="flex h-full min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="ag-card flex w-full max-w-md flex-col items-center p-6 text-center shadow-[var(--ag-shadow-panel)]">
            <AgentProviderMark
              label={agent}
              className="size-11 rounded-[14px] border-destructive/25 bg-destructive/[0.06] text-destructive"
            >
              <ProviderLogo className="size-5" />
            </AgentProviderMark>
            <p className="mt-4 text-[13px] font-medium text-destructive">
              {t("agentChat.connectionFailed", { agent })}
            </p>
            {connectionError ? (
              <p className="ag-faint mt-1.5 max-h-32 overflow-y-auto text-[11px] leading-relaxed">
                {connectionError}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void connect()}
                className="ag-pill h-8 px-3"
                data-active="true"
              >
                {t("agentChat.retry")}
              </button>
            </div>
          </div>
        </AgentsEnter>
      );
    }

    if (requiresAuth) {
      return (
        <AgentsEnter className="flex h-full min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="ag-card flex w-full max-w-sm flex-col items-center p-6 text-center shadow-[var(--ag-shadow-panel)]">
            <AgentProviderMark
              label={agent}
              className="size-11 rounded-[14px]"
            >
              <ProviderLogo className="size-5" />
            </AgentProviderMark>
            <p className="mt-4 text-[13px] font-medium tracking-[-0.01em]">
              {t("agentChat.signInRequired", { agent })}
            </p>
            <p className="ag-faint mt-1 text-[11px] leading-relaxed">
              {t("agentChat.signInHint", { agent })}
            </p>
            {loginError ? (
              <p className="mt-2 text-[11px] text-destructive">{loginError}</p>
            ) : null}
            <button
              type="button"
              disabled={loginStatus === "starting" || loginStatus === "waiting"}
              onClick={() => void startLogin()}
              className="ag-pill mt-5 h-8 px-4"
              data-active="true"
            >
              {loginStatus === "starting" || loginStatus === "waiting" ? (
                <>
                  <SpinIcon icon={LoaderCircle} className="size-3.5" />
                  {t("agentChat.signingIn")}
                </>
              ) : (
                t("agentChat.signIn")
              )}
            </button>
          </div>
        </AgentsEnter>
      );
    }

    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="ag-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          <div
            ref={contentRef}
            className={`mx-auto flex min-h-full flex-col px-4 pb-4 pt-4 md:px-8 ${centered ? "max-w-2xl justify-center" : "max-w-3xl justify-start"}`}
          >
            {centered ? (
              <div className="w-full pb-4">
                <AgentsEnter className="mb-6 text-center">
                  <div className="relative mx-auto mb-3.5 inline-block">
                    <AgentProviderMark
                      label={agent}
                      className="size-12 rounded-[16px] shadow-[var(--ag-shadow-raise)]"
                    >
                      <ProviderLogo className="size-6" />
                    </AgentProviderMark>
                    <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-[var(--ag-surface)] text-[var(--git-branch)] shadow-[var(--ag-shadow-raise)] ring-1 ring-[var(--ag-line)]">
                      <Sparkles className="size-3" />
                    </span>
                  </div>
                  <h2 className="text-base font-semibold tracking-[-0.015em] text-[var(--ag-text)]">
                    {t("agentChat.emptyTitle", { agent })}
                  </h2>
                  <p className="ag-faint mt-1 text-[12px] leading-relaxed">
                    {t("agentChat.emptySubtitle", { agent })}
                  </p>
                </AgentsEnter>

                <div className="w-full">{composer}</div>

                <div className="mt-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {starters.map((starter, index) => {
                      const StarterIcon =
                        STARTER_ICONS[index % STARTER_ICONS.length].Icon;
                      const iconColor =
                        STARTER_ICONS[index % STARTER_ICONS.length].color;
                      return (
                        <StaggerItem key={starter} index={index}>
                          <m.button
                            type="button"
                            onClick={() => onStarter(starter)}
                            whileTap={
                              reduceMotion ? undefined : { scale: 0.98 }
                            }
                            className="ag-card ag-row h-7 gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] shadow-[var(--ag-shadow-raise)] hover:text-[var(--ag-text)]"
                          >
                            <StarterIcon
                              className="size-3 shrink-0"
                              style={{ color: iconColor }}
                            />
                            <span>{starter}</span>
                          </m.button>
                        </StaggerItem>
                      );
                    })}
                  </div>

                  {cliCommands.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
                      {cliCommands.slice(0, 4).map((cmd) => (
                        <button
                          key={cmd.name}
                          type="button"
                          onClick={() => onCliCommand(cmd)}
                          title={cmd.description}
                          className="ag-chip h-5 gap-1 rounded-full px-2 text-[10px] font-medium text-[var(--ag-text-3)] hover:text-[var(--ag-text)]"
                        >
                          <Command className="size-2.5 shrink-0" />
                          <span>/{cmd.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hiddenTurnCount > 0 ? (
              <div className="mb-3 flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const viewport = scrollRef.current;
                    if (viewport) {
                      restoreBottomOffset.current =
                        viewport.scrollHeight - viewport.scrollTop;
                      restoreDeadline.current = Date.now() + 600;
                    }
                    setVisibleTurnCount(
                      (count) => count + TURN_PAGE_SIZE,
                    );
                  }}
                  className="ag-pill h-7 gap-1.5 px-3 text-[11px] font-medium"
                >
                  {t("agentChat.showOlderTurns", {
                    count: Math.min(hiddenTurnCount, TURN_PAGE_SIZE),
                  })}
                </button>
              </div>
            ) : null}

            {!centered ? (
              <div
                ref={listRef}
                style={{
                  height: totalTurnSize,
                  position: "relative",
                  width: "100%",
                }}
              >
                {turnVirtualizer.getVirtualItems().map((virtualItem) => {
                  const turn = visibleTurns[virtualItem.index];
                  if (!turn) return null;
                  return (
                    <div
                      key={virtualItem.key}
                      ref={measureTurn}
                      data-index={virtualItem.index}
                      className="absolute inset-x-0 top-0 pb-4"
                      style={{
                        transform: `translateY(${virtualItem.start - turnVirtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      <Suspense
                        fallback={
                          <div className="ag-card flex h-24 items-center justify-center text-xs text-muted-foreground">
                            …
                          </div>
                        }
                      >
                        <AgentTurnView turn={turn} />
                      </Suspense>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {busy ? (
              <m.div
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING_PANEL}
                className="mt-2 flex items-center gap-2 px-1 text-[11px] text-[var(--ag-text-2)]"
              >
                <span className="size-2 rounded-full bg-[var(--git-branch)] animate-pulse" />
                <TextShimmer className="font-medium">
                  {t("agentChat.working")}
                </TextShimmer>
              </m.div>
            ) : null}

            {requests.length > 0 ? (
              <div className="mt-4 space-y-2">
                {requests.map((request) => (
                  <AgentRequestCard
                    key={`${request.sessionId}:${String(request.requestId)}`}
                    request={request}
                  />
                ))}
              </div>
            ) : null}

            {conversation?.error ? (
              <div className="ag-card mt-4 flex items-start gap-2 border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{conversation.error}</span>
                <button
                  type="button"
                  onClick={() => void openThread(path, conversation.threadId)}
                  className="rounded-md px-1.5 py-0.5 font-medium hover:bg-destructive/10"
                >
                  {t("agentChat.retry")}
                </button>
                <button
                  type="button"
                  onClick={() => clearError(conversation.threadId)}
                  aria-label={t("agentChat.dismissError")}
                  className="rounded-md p-0.5 hover:bg-destructive/10"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <AnimatePresence>
          {!atBottom && visibleTurns.length > 0 ? (
            <m.button
              type="button"
              onClick={jumpToBottom}
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.94 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.94 }
              }
              transition={SPRING_PANEL}
              className="ag-pill absolute bottom-4 left-1/2 z-20 -translate-x-1/2 gap-1.5 shadow-[var(--ag-shadow-pop)]"
              aria-label={t("agentChat.jumpToLatest")}
            >
              <span className="relative grid size-4 place-items-center">
                <ScrollProgressCircle
                  progress={scrollProgress}
                  size={16}
                  thickness={2}
                />
                <ArrowDown className="absolute size-2.5" />
              </span>
              {t("agentChat.jumpToLatest")}
            </m.button>
          ) : null}
        </AnimatePresence>
      </div>
    );
  },
);
