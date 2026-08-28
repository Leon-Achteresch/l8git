import {
  ArrowUp,
  Check,
  ChevronLeft,
  CircleSlash,
  Loader2,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { ISLAND_ICON, ISLAND_ROW } from "@/components/island/island-ui";
import { SpinIcon } from "@/components/motion/kit";
import { isAiConfigured } from "@/lib/ai-setup";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { islandAction } from "@/lib/island/actions";
import {
  sendIslandChatMessage,
  stopIslandChat,
  useIslandChat,
  type IslandChatMessage,
  type IslandToolRun,
} from "@/lib/island/chat";
import { runIslandActionWithFlash } from "@/lib/island/flash";
import type { IslandSnapshot } from "@/lib/island/types";
import { cn } from "@/lib/utils";

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
  const messages = useIslandChat((s) => s.messages);
  const streaming = useIslandChat((s) => s.streaming);
  const autoRun = useIslandChat((s) => s.autoRun);
  const setAutoRun = useIslandChat((s) => s.setAutoRun);
  const clear = useIslandChat((s) => s.clear);
  // Subscribed so the view flips as soon as a provider is set up elsewhere.
  useCommitPrefs(
    useShallow((s) => [s.aiProviderType, s.aiProviderApiKey, s.aiProviderBaseUrl]),
  );
  const configured = isAiConfigured();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = () => {
    const text = draft.trim();
    if (!text || streaming || !configured) return;
    setDraft("");
    void sendIslandChatMessage(text, snapshot);
  };

  return (
    <div className="flex w-[340px] flex-col">
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
          <Sparkles className="size-3 shrink-0 opacity-60" />
          <span className="truncate text-xs font-medium">{t("islandChat.title")}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setAutoRun(!autoRun)}
          aria-label={t("islandChat.autoRun")}
          title={t("islandChat.autoRunHint")}
          className={cn(ISLAND_ICON, autoRun && "opacity-100")}
        >
          <Wrench className={cn(autoRun && "text-git-modified")} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={clear}
          aria-label={t("islandChat.clear")}
          className={ISLAND_ICON}
        >
          <Trash2 />
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

      {!configured ? (
        <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
          <p className="text-[11px] opacity-60">{t("islandChat.notConfigured")}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void runIslandActionWithFlash(
                { actionId: "view.settings" },
                t("islandActions.viewSettings"),
              );
              onClose();
            }}
            className={cn(ISLAND_ROW, "gap-1.5 font-medium")}
          >
            <Settings className="size-3.5" />
            {t("islandChat.openSettings")}
          </Button>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex max-h-72 min-h-[64px] flex-col gap-2 overflow-y-auto px-2 py-1 [scrollbar-width:thin]"
          >
            {messages.length === 0 && (
              <p className="px-1 py-4 text-center text-[11px] leading-relaxed opacity-50">
                {t("islandChat.empty")}
              </p>
            )}
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {streaming && (
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
              className="max-h-24 min-h-[28px] flex-1 resize-none bg-transparent px-1.5 py-1 text-xs outline-none placeholder:opacity-40"
            />
            {streaming ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={stopIslandChat}
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
                disabled={!draft.trim()}
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

function ChatBubble({ message }: { message: IslandChatMessage }) {
  const { t } = useTranslation();
  const user = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", user ? "items-end" : "items-start")}>
      {message.text.trim() && (
        <span
          className={cn(
            "max-w-[92%] whitespace-pre-wrap break-words rounded-xl px-2.5 py-1.5 text-xs leading-relaxed",
            user ? "bg-background/15" : "bg-background/8",
          )}
        >
          {message.text}
        </span>
      )}
      {message.tools.map((run) => (
        <ToolRow key={run.id} run={run} />
      ))}
      {message.error && (
        <span className="max-w-[92%] rounded-xl bg-git-removed/15 px-2.5 py-1.5 text-[11px] text-git-removed">
          {message.error}
        </span>
      )}
      {!user && !message.text.trim() && message.tools.length === 0 && !message.error && (
        <span className="px-1 text-[10px] opacity-40">{t("islandChat.thinking")}</span>
      )}
    </div>
  );
}

function ToolRow({ run }: { run: IslandToolRun }) {
  const { t } = useTranslation();
  const resolveApproval = useIslandChat((s) => s.resolveApproval);
  const def = islandAction(run.actionId);
  const label = def ? t(`islandActions.${def.labelKey}`) : run.toolName;
  const args = Object.entries(run.args)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");

  return (
    <div className="flex w-full max-w-[92%] flex-col gap-1 rounded-xl bg-background/8 px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px]">
        {run.state === "running" ? (
          <SpinIcon icon={Loader2} className="size-3 shrink-0 opacity-70" />
        ) : run.state === "done" ? (
          <Check className="size-3 shrink-0 text-git-added" />
        ) : run.state === "error" ? (
          <X className="size-3 shrink-0 text-git-removed" />
        ) : run.state === "denied" ? (
          <CircleSlash className="size-3 shrink-0 opacity-50" />
        ) : (
          <Wrench className="size-3 shrink-0 text-git-modified" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      </span>
      {args && <span className="truncate text-[10px] opacity-50">{args}</span>}
      {run.detail && run.state !== "pending" && (
        <span className="truncate text-[10px] opacity-50">{run.detail}</span>
      )}
      {run.state === "pending" && (
        <span className="flex items-center gap-1 pt-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => resolveApproval(run.id, true)}
            className={cn(ISLAND_ROW, "h-6 flex-1 justify-center text-[11px] font-medium")}
          >
            {t("islandChat.approve")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => resolveApproval(run.id, false)}
            className={cn(ISLAND_ROW, "h-6 flex-1 justify-center text-[11px]")}
          >
            {t("islandChat.deny")}
          </Button>
        </span>
      )}
    </div>
  );
}
