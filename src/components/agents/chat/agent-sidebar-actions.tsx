import { Archive as ArchiveData, ArchiveRestore as ArchiveRestoreData } from "lucide";
import { LayoutGrid, LoaderCircle, Plus, Search, X } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { MorphIcon } from "@/components/ui/morph-icon";
import type { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { SPRING_PRESS } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentSidebarActions({
  query,
  onQueryChange,
  onNewThread,
  onOpenOverview,
  showArchived,
  archivedCount,
  onToggleArchived,
  providers,
  providerFilter,
  onProviderFilterChange,
  compact = false,
  creating = false,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onNewThread: () => void;
  onOpenOverview?: () => void;
  showArchived: boolean;
  archivedCount: number;
  onToggleArchived: () => void;
  providers: ReadonlyArray<(typeof AGENT_PROVIDERS)[number]>;
  providerFilter: NativeAgentProvider | null;
  onProviderFilterChange: (provider: NativeAgentProvider | null) => void;
  compact?: boolean;
  creating?: boolean;
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const searchField = (
    <div
      className="bg-[color-mix(in_oklab,var(--ag-surface-2)_78%,transparent)] transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-[color-mix(in_oklab,var(--git-branch)_34%,var(--ag-line-strong))] focus-within:bg-[var(--ag-surface)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--git-branch)_16%,transparent)] flex h-8 min-w-0 cursor-text items-center gap-2 rounded-md border border-[var(--ag-line)] px-2.5 text-[12px]"
      onClick={() => searchRef.current?.focus()}
    >
      <Search className="size-3.5 shrink-0 text-[var(--ag-text-3)]" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && query) {
            event.stopPropagation();
            onQueryChange("");
          }
        }}
        placeholder={t("agentChat.searchChats")}
        aria-label={t("agentChat.searchChats")}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ag-text)] outline-none placeholder:text-[var(--ag-text-3)]"
      />
      {query ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onQueryChange("");
            searchRef.current?.focus();
          }}
          aria-label={t("agentChat.clearSearch")}
          className="grid size-5 place-items-center rounded-md text-[var(--ag-text-3)] outline-none transition-colors hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );

  const newThreadButton = (
    <m.button
      type="button"
      disabled={creating}
      aria-busy={creating}
      onClick={onNewThread}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={SPRING_PRESS}
      aria-label={t("agentChat.newConversation")}
      title={t("agentChat.newConversation")}
      className={cn(
        "outline-none transition-[transform,filter,box-shadow] duration-200 hover:brightness-110 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--git-branch)_18%,transparent)]",
        compact
          ? "grid size-8 shrink-0 place-items-center rounded-md border border-[var(--ag-line)] bg-[var(--ag-surface)] text-[var(--ag-text-2)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)]"
          : "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--ag-r-md)] bg-[var(--ag-solid)] px-3 text-[12px] font-semibold text-[var(--ag-solid-fg)] shadow-[0_8px_18px_-12px_color-mix(in_oklab,var(--ag-solid)_70%,transparent)]",
      )}
    >
      {compact ? (
        <>
          {creating ? <LoaderCircle className="size-4 motion-safe:animate-spin" /> : <Plus className="size-4" />}
          <span className="sr-only">{t("agentChat.newConversation")}</span>
        </>
      ) : (
        <>
          <span className="grid size-4.5 place-items-center rounded-full bg-white/12 text-current">
            {creating ? <LoaderCircle className="size-3 motion-safe:animate-spin" /> : <Plus className="size-3 stroke-[2.5]" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {t("agentChat.newConversation")}
          </span>
        </>
      )}
    </m.button>
  );

  const overviewButton = onOpenOverview ? (
    <button
      type="button"
      onClick={onOpenOverview}
      className={cn(
        "grid shrink-0 place-items-center border border-[var(--ag-line)] bg-[var(--ag-surface)] text-[var(--ag-text-2)] outline-none transition-colors hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "size-8 rounded-md" : "size-9 rounded-[var(--ag-r-md)]",
      )}
      aria-label={t("agentOverview.title")}
      title={t("agentOverview.title")}
    >
      <LayoutGrid className="size-3.5" />
    </button>
  ) : null;

  const archiveButton = showArchived || archivedCount > 0 ? (
    <button
      type="button"
      onClick={onToggleArchived}
      data-active={showArchived}
      className={cn(
        "grid shrink-0 place-items-center border border-[var(--ag-line)] bg-[var(--ag-surface)] text-[var(--ag-text-2)] outline-none transition-colors hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "size-8 rounded-md" : "size-9 rounded-[var(--ag-r-md)]",
      )}
      aria-pressed={showArchived}
      aria-label={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
      title={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
    >
      <MorphIcon icon={showArchived ? ArchiveRestoreData : ArchiveData} className="size-3.5" />
    </button>
  ) : null;

  return (
    <nav className={cn("min-w-0 space-y-2", compact ? "px-0" : "px-2")} aria-label={t("header.agents")}>
      {compact ? (
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">{searchField}</div>
          {newThreadButton}
          {overviewButton}
          {archiveButton}
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-1.5">
            {newThreadButton}
            {overviewButton}
            {archiveButton}
          </div>
          {searchField}
        </>
      )}

      {providers.length > 1 ? (
        <div
          role="group"
          aria-label={t("agentChat.allProviders")}
          className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            data-active={providerFilter === null}
            aria-pressed={providerFilter === null}
            onClick={() => onProviderFilterChange(null)}
            className="inline-flex items-center justify-center gap-1 rounded-full font-medium text-[var(--ag-text-3)] outline-none transition-colors duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-[var(--ag-selected)] data-[active=true]:text-[var(--ag-text)] h-6 px-2.5 text-[11px]"
          >
            {t("agentChat.allProviders")}
          </button>
          {providers.map(({ value, label, Logo }) => (
            <button
              key={value}
              type="button"
              data-active={providerFilter === value}
              aria-pressed={providerFilter === value}
              aria-label={t("agentChat.filterProvider", { agent: label })}
              title={t("agentChat.filterProvider", { agent: label })}
              onClick={() =>
                onProviderFilterChange(providerFilter === value ? null : value)
              }
              className="inline-flex items-center justify-center gap-1 rounded-full font-medium text-[var(--ag-text-3)] outline-none transition-colors duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-[var(--ag-selected)] data-[active=true]:text-[var(--ag-text)] size-6"
            >
              <Logo className="size-3.5" />
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
