import { Download, LogOut, RefreshCw, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import type { AgentRateLimitWindow } from "@/lib/agents/types";

function resetLabel(timestamp: number | null, locale: string): string | null {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp * 1000);
}

function LimitRow({
  label,
  window,
  locale,
}: {
  label: string;
  window: AgentRateLimitWindow;
  locale: string;
}) {
  const { t } = useTranslation();
  const used = Math.min(100, Math.max(0, window.usedPercent));
  const reset = resetLabel(window.resetsAt, locale);
  return (
    <div className="space-y-1.5 px-1.5 py-1">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {t("agentChat.account.used", { value: Math.round(used) })}
        </span>
      </div>
      <Progress value={used} className="h-1" />
      {reset ? (
        <p className="text-[9px] text-muted-foreground">
          {t("agentChat.account.resets", { value: reset })}
        </p>
      ) : null}
    </div>
  );
}

export function AgentAccountMenu({ onImport }: { onImport?: () => void }) {
  const { t, i18n } = useTranslation();
  const account = useAgentChatStore((state) => state.account);
  const rateLimits = useAgentChatStore((state) => state.rateLimits);
  const accountUsage = useAgentChatStore((state) => state.accountUsage);
  const refreshAccount = useAgentChatStore((state) => state.refreshAccount);
  const logout = useAgentChatStore((state) => state.logout);

  if (!account) return null;

  const refresh = async () => {
    try {
      await refreshAccount();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const signOut = async () => {
    try {
      await logout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-full text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          aria-label={t("agentChat.account.menu")}
          title={account.email ?? t("agentChat.account.menu")}
        >
          <UserRound className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="overflow-hidden rounded-[var(--ag-r-lg)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[var(--ag-shadow-pop)] w-64 p-1.5">
        <DropdownMenuLabel className="min-w-0 py-1.5">
          <span className="block truncate text-xs text-foreground">
            {account.email ?? t("agentChat.account.signedIn")}
          </span>
          {account.planType ? (
            <span className="mt-0.5 block text-[10px] font-normal capitalize text-muted-foreground">
              {account.planType}
            </span>
          ) : null}
        </DropdownMenuLabel>
        {accountUsage?.lifetimeTokens !== null && accountUsage?.lifetimeTokens !== undefined ? (
          <p className="px-1.5 pb-1 text-[10px] tabular-nums text-muted-foreground">
            {accountUsage.lifetimeTokens.toLocaleString()} lifetime tokens
            {accountUsage.currentStreakDays ? ` · ${accountUsage.currentStreakDays}-day streak` : ""}
          </p>
        ) : null}
        {rateLimits?.primary || rateLimits?.secondary ? <DropdownMenuSeparator /> : null}
        {rateLimits?.primary ? (
          <LimitRow
            label={t("agentChat.account.primaryLimit")}
            window={rateLimits.primary}
            locale={i18n.language}
          />
        ) : null}
        {rateLimits?.secondary ? (
          <LimitRow
            label={t("agentChat.account.secondaryLimit")}
            window={rateLimits.secondary}
            locale={i18n.language}
          />
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]" onClick={() => void refresh()}>
          <RefreshCw className="size-3.5" />
          {t("agentChat.account.refresh")}
        </DropdownMenuItem>
        {onImport ? (
          <DropdownMenuItem className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]" onClick={onImport}>
            <Download className="size-3.5" />
            Import from Claude Code
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]" onClick={() => void signOut()}>
          <LogOut className="size-3.5" />
          {t("agentChat.account.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
