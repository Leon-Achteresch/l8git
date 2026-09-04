import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import {
  clampUsedPercent,
  fetchClaudeRateLimits,
  formatResetDuration,
  formatWindowLabel,
  idleClaudeRateLimits,
  RATE_LIMIT_POLL_MS,
  SESSION_WINDOW_MINUTES,
  WEEKLY_WINDOW_MINUTES,
  type ClaudeRateLimits,
} from "@/lib/agents/rate-limits";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentRateLimitWindow } from "@/lib/agents/types";

function toneClass(used: number): string {
  if (used >= 90) return "text-red-400";
  if (used >= 75) return "text-amber-400";
  return "";
}

function LimitChip({ window }: { window: AgentRateLimitWindow }) {
  const { t, i18n } = useTranslation();
  const used = clampUsedPercent(window.usedPercent);
  const label = formatWindowLabel(window.windowDurationMins ?? SESSION_WINDOW_MINUTES);
  const resetsIn =
    window.resetsAt !== null
      ? formatResetDuration(window.resetsAt * 1000 - Date.now())
      : null;
  const resetAt =
    window.resetsAt !== null
      ? new Intl.DateTimeFormat(i18n.language, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(window.resetsAt * 1000)
      : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 tabular-nums">
          <span className="text-[var(--ag-text-3)]">{label}</span>
          <span className={toneClass(used)}>{Math.round(used)}%</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div>{t("agentChat.account.used", { value: Math.round(used) })}</div>
        {resetAt ? (
          <div className="text-[var(--ag-text-3)]">
            {t("agentChat.account.resets", { value: resetAt })}
            {resetsIn ? ` · ${resetsIn}` : ""}
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function useClaudeRateLimits(enabled: boolean): ClaudeRateLimits {
  const [limits, setLimits] = useState<ClaudeRateLimits>(idleClaudeRateLimits);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      void fetchClaudeRateLimits().then((next) => {
        if (!cancelled) setLimits(next);
      });
    };
    load();
    const timer = window.setInterval(load, RATE_LIMIT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return limits;
}

export function AgentRateLimitChips() {
  const provider = useAgentProviderStore((state) => state.provider);
  const storeLimits = useAgentChatStore((state) => state.rateLimits);
  const claude = useClaudeRateLimits(provider === "claude");

  const windows: AgentRateLimitWindow[] =
    provider === "claude"
      ? [claude.session, claude.weekly].filter(
          (window): window is AgentRateLimitWindow => Boolean(window),
        )
      : [storeLimits?.primary ?? null, storeLimits?.secondary ?? null]
          .filter((window): window is AgentRateLimitWindow => Boolean(window))
          .map((window, index) => ({
            ...window,
            windowDurationMins:
              window.windowDurationMins ??
              (index === 0 ? SESSION_WINDOW_MINUTES : WEEKLY_WINDOW_MINUTES),
          }));

  if (windows.length === 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {windows.map((window, index) => (
        <LimitChip key={index} window={window} />
      ))}
    </span>
  );
}
