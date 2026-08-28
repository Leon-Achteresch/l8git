import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUp,
  ChevronLeft,
  ExternalLink,
  Loader2,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { ISLAND_ICON, ISLAND_ROW } from "@/components/island/island-ui";
import { SpinIcon } from "@/components/motion/kit";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { AGENT_PROVIDERS, agentProviderMeta } from "@/lib/agents/provider-meta";
import {
  useAgentProviderStore,
} from "@/lib/agents/provider-store";
import { parseTranscriptText } from "@/lib/agents/transcript-text";
import type {
  AgentConversation,
  AgentItem,
  AgentPendingRequest,
} from "@/lib/agents/types";
import { runIslandActionWithFlash } from "@/lib/island/flash";
import type { IslandSnapshot } from "@/lib/island/types";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 24;

type Preview = {
  key: string;
  kind: "user" | "agent" | "tool" | "error";
  text: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function userText(item: AgentItem): string {
  const parts: string[] = [];
  if (Array.isArray(item.content)) {
    for (const block of item.content) {
      const rec = asRecord(block);
      if (rec?.type === "text") parts.push(asString(rec.text));
    }
  }
  return parseTranscriptText(parts.join("\n") || asString(item.text)).text.trim();
}

function itemPreview(item: AgentItem): Omit<Preview, "key"> | null {
  if (item.type === "userMessage") {
    const text = userText(item);
    return text ? { kind: "user", text } : null;
  }
  if (item.type === "agentMessage") {
    const text = asString(item.text).trim();
    return text ? { kind: "agent", text } : null;
  }
  if (item.type === "localCommand" || item.type === "commandExecution") {
    return { kind: "tool", text: asString(item.command) || "command" };
  }
  if (item.type === "fileChange") {
    return {
      kind: "tool",
      text: asString(item.path) || asString(item.file) || "file",
    };
  }
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    return {
      kind: "tool",
      text: asString(item.tool) || asString(item.name) || "tool",
    };
  }
  if (item.type === "webSearch") {
    return { kind: "tool", text: asString(item.query) || "search" };
  }
  return null;
}

function conversationPreviews(
  conversation: AgentConversation | undefined,
): Preview[] {
  if (!conversation) return [];
  const rows: Preview[] = [];
  for (const turn of conversation.turns) {
    for (const item of turn.items) {
      const preview = itemPreview(item);
      if (preview) rows.push({ key: `${turn.id}:${item.id}`, ...preview });
    }
    if (turn.status === "failed" && turn.error) {
      rows.push({ key: `${turn.id}:error`, kind: "error", text: turn.error });
    }
  }
  return rows.length > PREVIEW_LIMIT ? rows.slice(-PREVIEW_LIMIT) : rows;
}

function clip(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function approvalPayload(
  request: AgentPendingRequest,
  allow: boolean,
): unknown {
  if (
    request.method === "execCommandApproval" ||
    request.method === "applyPatchApproval"
  ) {
    return allow
      ? { decision: "approved" }
      : { decision: { denied: { rejection: "Rejected by user" } } };
  }
  return { decision: allow ? "accept" : "decline" };
}

function canQuickApprove(request: AgentPendingRequest): boolean {
  return (
    request.kind === "command" ||
    request.kind === "file-change" ||
    request.kind === "permissions"
  );
}

export function IslandChatView({
  snapshot,
  onClose,
  onBack,
}: {
  snapshot: IslandSnapshot;
  onClose: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const path = snapshot.activePath;
  const provider = useAgentProviderStore((s) => s.provider);
  const setProvider = useAgentProviderStore((s) => s.setProvider);
  const meta = agentProviderMeta(provider);
  const ProviderLogo = meta.Logo;

  const {
    connectionStatus,
    connectionError,
    requiresAuth,
    loginStatus,
    loginError,
    threadId,
    conversation,
    requests,
  } = useAgentChatStore(
    useShallow((s) => {
      const id = path ? (s.activeThreadByPath[path] ?? null) : null;
      return {
        connectionStatus: s.connectionStatus,
        connectionError: s.connectionError,
        requiresAuth: s.requiresAuth,
        loginStatus: s.loginStatus,
        loginError: s.loginError,
        threadId: id,
        conversation: id ? s.conversations[id] : undefined,
        requests: id ? (s.requestsByThread[id] ?? []) : [],
      };
    }),
  );

  const connect = useAgentChatStore((s) => s.connect);
  const loadThreads = useAgentChatStore((s) => s.loadThreads);
  const openThread = useAgentChatStore((s) => s.openThread);
  const sendMessage = useAgentChatStore((s) => s.sendMessage);
  const interrupt = useAgentChatStore((s) => s.interrupt);
  const startLogin = useAgentChatStore((s) => s.startLogin);
  const respondToRequest = useAgentChatStore((s) => s.respondToRequest);
  const retainSurface = useAgentChatStore((s) => s.retainSurface);
  const setVisibleThread = useAgentChatStore((s) => s.setVisibleThread);

  const busy = Boolean(conversation?.activeTurnId);
  const ready = connectionStatus === "ready" && !requiresAuth;
  const previews = conversationPreviews(conversation);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => retainSurface(), [retainSurface]);

  useEffect(() => {
    void connect().catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    });
  }, [connect, provider]);

  useEffect(() => {
    if (!path) return;
    void loadThreads([path]).catch(() => {});
  }, [loadThreads, path]);

  useEffect(() => {
    if (!path || !threadId) return;
    void openThread(path, threadId).catch(() => {});
  }, [openThread, path, threadId]);

  useEffect(() => {
    setVisibleThread(threadId);
    return () => setVisibleThread(null);
  }, [setVisibleThread, threadId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [previews, busy, requests]);

  const openAgents = () => {
    void runIslandActionWithFlash(
      { actionId: "view.agents" },
      t("islandActions.viewAgents"),
    );
    onClose();
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !path || !ready) return;
    setDraft("");
    void sendMessage(path, text).catch((error: unknown) => {
      setDraft(text);
      toast.error(error instanceof Error ? error.message : String(error));
    });
  };

  const login = () => {
    void startLogin()
      .then((url) => (url ? openUrl(url) : undefined))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-1 px-1 pb-1.5">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onBack}
          aria-label={t("common.back")}
          className={ISLAND_ICON}
        >
          <ChevronLeft />
        </Button>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <ProviderLogo className="size-3.5 shrink-0" />
          <span className="truncate text-xs font-medium">{meta.label}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={openAgents}
          aria-label={t("islandChat.openAgents")}
          title={t("islandChat.openAgents")}
          className={ISLAND_ICON}
        >
          <ExternalLink />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={t("island.close")}
          className={ISLAND_ICON}
        >
          <X />
        </Button>
      </div>

      <div className="flex items-center gap-0.5 px-1 pb-1.5">
        {AGENT_PROVIDERS.map((entry) => (
          <Button
            key={entry.value}
            variant="ghost"
            size="icon-xs"
            onClick={() => setProvider(entry.value)}
            aria-label={entry.label}
            title={entry.label}
            className={cn(
              ISLAND_ICON,
              provider === entry.value && "opacity-100",
            )}
          >
            <entry.Logo className="size-3.5" />
          </Button>
        ))}
      </div>

      {!path ? (
        <p className="px-3 py-4 text-center text-[11px] opacity-60">
          {t("islandChat.noRepo")}
        </p>
      ) : requiresAuth ? (
        <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
          <p className="text-[11px] opacity-60">
            {provider === "claude"
              ? t("agentChat.loginTitleClaude")
              : t("agentChat.loginTitle")}
          </p>
          {loginError ? (
            <p className="text-[11px] text-git-removed">{loginError}</p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={loginStatus === "starting" || loginStatus === "waiting"}
            onClick={login}
            className={cn(ISLAND_ROW, "gap-1.5 font-medium")}
          >
            {loginStatus === "waiting"
              ? t("agentChat.loginWaiting")
              : provider === "claude"
                ? t("agentChat.loginActionClaude")
                : t("agentChat.loginAction")}
          </Button>
        </div>
      ) : connectionStatus === "error" ? (
        <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
          <p className="text-[11px] text-git-removed">
            {connectionError || t("agentChat.startErrorTitle", { agent: meta.label })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void connect()}
            className={cn(ISLAND_ROW, "font-medium")}
          >
            {t("agentChat.retry")}
          </Button>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-1 [scrollbar-width:thin]"
          >
            {connectionStatus === "connecting" && previews.length === 0 && (
              <span className="flex items-center gap-1.5 px-1 py-3 text-[10px] opacity-55">
                <SpinIcon icon={Loader2} className="size-3" />
                {t("agentChat.connecting", { agent: meta.label })}
              </span>
            )}
            {ready && previews.length === 0 && !busy && (
              <p className="px-1 py-4 text-center text-[11px] leading-relaxed opacity-50">
                {t("islandChat.empty", { agent: meta.label })}
              </p>
            )}
            {previews.map((row) => (
              <span
                key={row.key}
                className={cn(
                  "max-w-[92%] whitespace-pre-wrap break-words rounded-xl px-2.5 py-1.5 text-xs leading-relaxed",
                  row.kind === "user" && "self-end bg-background/15",
                  row.kind === "agent" && "self-start bg-background/8",
                  row.kind === "tool" &&
                    "self-start bg-background/8 font-mono text-[10px] opacity-70",
                  row.kind === "error" &&
                    "self-start bg-git-removed/15 text-[11px] text-git-removed",
                )}
              >
                {clip(row.text)}
              </span>
            ))}
            {requests.map((request) => (
              <span
                key={`${request.threadId}:${String(request.requestId)}`}
                className="flex w-full max-w-[92%] flex-col gap-1 self-start rounded-xl bg-background/8 px-2.5 py-1.5"
              >
                <span className="truncate text-[11px] font-medium">
                  {request.command ||
                    request.reason ||
                    t("agentChat.request.approveCommand")}
                </span>
                {canQuickApprove(request) ? (
                  <span className="flex items-center gap-1 pt-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void respondToRequest(
                          request,
                          approvalPayload(request, true),
                        )
                      }
                      className={cn(
                        ISLAND_ROW,
                        "h-6 flex-1 justify-center text-[11px] font-medium",
                      )}
                    >
                      {t("islandChat.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void respondToRequest(
                          request,
                          approvalPayload(request, false),
                        )
                      }
                      className={cn(
                        ISLAND_ROW,
                        "h-6 flex-1 justify-center text-[11px]",
                      )}
                    >
                      {t("islandChat.deny")}
                    </Button>
                  </span>
                ) : (
                  <ListRow
                    size="sm"
                    onClick={openAgents}
                    className={cn(
                      ISLAND_ROW,
                      "h-6 justify-center text-[11px] font-medium",
                    )}
                  >
                    {t("islandChat.openAgents")}
                  </ListRow>
                )}
              </span>
            ))}
            {busy && (
              <span className="flex items-center gap-1.5 px-1 text-[10px] opacity-55">
                <SpinIcon icon={Loader2} className="size-3" />
                {t("islandChat.thinking")}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-end gap-1 border-t border-background/10 px-1 pt-1.5">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("islandChat.placeholder")}
              disabled={!ready}
              className="max-h-24 min-h-[28px] flex-1 resize-none bg-transparent px-1.5 py-1 text-xs outline-none placeholder:opacity-40 disabled:opacity-40"
            />
            {busy ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => threadId && void interrupt(threadId)}
                aria-label={t("islandChat.stop")}
                className={ISLAND_ICON}
              >
                <Square />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={send}
                disabled={!draft.trim() || !ready}
                aria-label={t("islandChat.send")}
                className={ISLAND_ICON}
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
