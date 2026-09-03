import { Archive as ArchiveData, ArchiveRestore as ArchiveRestoreData } from "lucide";
import { LayoutGrid, Plus, Search, X } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { MorphIcon } from "@/components/ui/morph-icon";
import type { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { SPRING_PRESS } from "@/lib/motion/ease";

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
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  return (
    <nav className="min-w-0 space-y-1.5 px-2" aria-label={t("header.agents")}>
      <div className="flex min-w-0 items-center gap-1.5">
        <m.button
          type="button"
          onClick={onNewThread}
          whileTap={reduce ? undefined : { scale: 0.985 }}
          transition={SPRING_PRESS}
          className="ag-card flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-[var(--ag-r-md)] border-[var(--ag-line)] bg-[var(--ag-surface)] px-3 text-[12px] font-medium text-[var(--ag-text)] shadow-[var(--ag-shadow-raise)] hover:border-[var(--ag-line-strong)]"
        >
          <span className="grid size-4.5 place-items-center rounded-full bg-[var(--ag-hover)] text-[var(--git-branch)]">
            <Plus className="size-3 stroke-[2.5]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {t("agentChat.newConversation")}
          </span>
        </m.button>
        {onOpenOverview ? (
          <button
            type="button"
            onClick={onOpenOverview}
            className="ag-icon-btn size-8.5 shrink-0 rounded-[var(--ag-r-sm)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)] hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-surface)]"
            aria-label={t("agentOverview.title")}
            title={t("agentOverview.title")}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        ) : null}
        {showArchived || archivedCount > 0 ? (
          <button
            type="button"
            onClick={onToggleArchived}
            data-active={showArchived}
            className="ag-icon-btn size-8.5 shrink-0 rounded-[var(--ag-r-sm)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)]"
            aria-pressed={showArchived}
            aria-label={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
            title={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
          >
            <MorphIcon icon={showArchived ? ArchiveRestoreData : ArchiveData} className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div
        className="ag-inset flex h-8 min-w-0 cursor-text items-center gap-2 rounded-[var(--ag-r-md)] border border-transparent px-2.5 text-[12px] transition-all focus-within:border-[var(--ag-line-strong)] focus-within:bg-[var(--ag-surface)] focus-within:shadow-[var(--ag-shadow-raise)]"
        onClick={() => searchRef.current?.focus()}
      >
        <Search className="size-3.5 shrink-0 text-[var(--ag-text-3)]" />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
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
            className="ag-icon-btn size-5 text-[var(--ag-text-3)] hover:text-[var(--ag-text)]"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      {providers.length > 1 ? (
        <div
          role="group"
          aria-label={t("agentChat.allProviders")}
          className="flex min-w-0 items-center gap-1"
        >
          <button
            type="button"
            data-active={providerFilter === null}
            aria-pressed={providerFilter === null}
            onClick={() => onProviderFilterChange(null)}
            className="ag-filter h-6 px-2.5 text-[11px]"
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
              className="ag-filter size-6"
            >
              <Logo className="size-3.5" />
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
