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
  memo,
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

import { AgentItemView } from "@/components/agents/chat/agent-item";
import { AgentRequestCard } from "@/components/agents/chat/agent-request-card";
import { AgentProviderMark } from "@/components/agents/ui/agent-provider-mark";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import {
  MessageBubble,
  MessageBubbleContent,
} from "@/components/agents/ui/message-bubble";
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
import { flattenTurnRows, type TranscriptRow } from "@/lib/agents/transcript-rows";
import type { AgentTurn } from "@/lib/agents/types";
import { SPRING_PANEL } from "@/lib/motion/ease";

const EMPTY_TURNS: AgentTurn[] = [];
const NEAR_BOTTOM_PX = 96;
const STARTER_ICONS = [
  { Icon: ScanSearch, color: "var(--git-branch)" },
  { Icon: Hammer, color: "var(--git-modified)" },
  { Icon: GitPullRequestArrow, color: "var(--git-added)" },
] as const;

function estimateRow(row: TranscriptRow | undefined): number {
  if (!row || row.kind === "error") return 48;
  if (row.item.type === "agentMessage") return 140;
  if (row.item.type === "userMessage") return 64;
  return 44;
}

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
    const lastScrollTop = useRef(0);
    const stickToBottom = useRef(true);
    const [atBottom, setAtBottom] = useState(true);
    const reduceMotion = useReducedMotion() ?? false;
    const scrollProgress = useContainerScrollProgress(scrollRef);
    const turns = conversation?.turns ?? EMPTY_TURNS;
    const rows = useMemo(() => flattenTurnRows(turns), [turns]);
    const busy = Boolean(conversation?.activeTurnId);
    const starters = useMemo(
      () => [
        t("agentChat.starterAnalyze"),
        t("agentChat.starterImplement"),
        t("agentChat.starterReview"),
      ],
      [t],
    );

    const { scrollMargin, listRef } = useScrollMargin(scrollRef);
    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: (index) => estimateRow(rows[index]),
      overscan: 6,
      useAnimationFrameWithResizeObserver: true,
      getItemKey: (index) => rows[index]?.key ?? index,
      scrollMargin,
    });
    const virtualRows = virtualizer.getVirtualItems();
    const measureRow = useCallback(
      (node: HTMLElement | null) => virtualizer.measureElement(node),
      [virtualizer],
    );

    const scrollToEnd = useCallback((behavior?: ScrollBehavior) => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      if (behavior === "smooth") viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      else viewport.scrollTop = viewport.scrollHeight;
    }, []);

    useEffect(() => {
      stickToBottom.current = true;
      setAtBottom(true);
    }, [threadId]);

    useLayoutEffect(() => {
      if (scrollToBottomSignal === 0) return;
      stickToBottom.current = true;
      scrollToEnd();
    }, [scrollToBottomSignal, scrollToEnd]);

    useLayoutEffect(() => {
      if (stickToBottom.current) scrollToEnd();
    }, [busy, requests.length, rows.length, scrollToEnd, threadId]);

    useLayoutEffect(() => {
      const content = contentRef.current;
      if (!content || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => {
        if (stickToBottom.current) scrollToEnd();
      });
      observer.observe(content);
      return () => observer.disconnect();
    }, [scrollToEnd, connectionStatus, requiresAuth]);

    const handleScroll = useCallback(() => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      const top = viewport.scrollTop;
      const distance = viewport.scrollHeight - top - viewport.clientHeight;
      const nearBottom = distance < NEAR_BOTTOM_PX;
      if (nearBottom) stickToBottom.current = true;
      else if (top < lastScrollTop.current - 1) stickToBottom.current = false;
      lastScrollTop.current = top;
      setAtBottom((current) => (current === nearBottom ? current : nearBottom));
    }, []);

    const handleWheel = useCallback((event: React.WheelEvent) => {
      if (event.deltaY < 0) stickToBottom.current = false;
    }, []);

    const jumpToBottom = useCallback(() => {
      stickToBottom.current = true;
      scrollToEnd("smooth");
    }, [scrollToEnd]);

    if (connectionStatus === "connecting") {
      return (
        <AgentsEnter className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
          <div
            data-agent-status-card=""
            className="ag-card flex w-full max-w-sm flex-col items-center p-6 shadow-[var(--ag-shadow-panel)]"
          >
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
        <AgentsEnter className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
          <div
            data-agent-status-card=""
            className="ag-card flex w-full max-w-md flex-col items-center p-6 text-center shadow-[var(--ag-shadow-panel)]"
          >
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
        <AgentsEnter className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
          <div
            data-agent-status-card=""
            className="ag-card flex w-full max-w-sm flex-col items-center p-6 text-center shadow-[var(--ag-shadow-panel)]"
          >
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
      <div
        data-agent-conversation=""
        className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <div
          ref={scrollRef}
          data-agent-transcript-scroll=""
          onScroll={handleScroll}
          onWheel={handleWheel}
          className="ag-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          <div
            ref={contentRef}
            className={`ag-column mx-auto flex min-h-full min-w-0 w-full flex-col px-4 pb-4 pt-4 md:px-6 ${centered ? "justify-center" : "justify-start"}`}
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

                <div className="mx-auto min-w-0 w-full">{composer}</div>

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

            {!centered && rows.length > 0 ? (
              <div
                ref={listRef}
                data-agent-turn-list=""
                style={{ height: virtualizer.getTotalSize(), position: "relative" }}
              >
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  return (
                    <div
                      key={virtualRow.key}
                      ref={measureRow}
                      data-index={virtualRow.index}
                      data-agent-turn={row.turn.id}
                      className="absolute inset-x-0 top-0 min-w-0 pb-3"
                      style={{
                        transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      {row.kind === "item" ? (
                        <AgentItemView item={row.item} turn={row.turn} />
                      ) : (
                        <MessageBubble align="start" variant="danger">
                          <MessageBubbleContent>{row.error}</MessageBubbleContent>
                        </MessageBubble>
                      )}
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
                className="mt-1 flex items-center gap-2 px-1 text-[11px] text-[var(--ag-text-2)]"
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
          {!atBottom && rows.length > 0 ? (
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
