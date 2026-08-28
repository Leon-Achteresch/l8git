import { PenSquare, Search, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

export function AgentSidebarActions({
  query,
  onQueryChange,
  onNewThread,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onNewThread: () => void;
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <nav className="min-w-0 space-y-0.5 px-2" aria-label={t("header.agents")}>
      <button type="button" onClick={onNewThread} className="ag-row h-8 min-w-0 text-[12px]">
        <PenSquare className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">{t("agentChat.newConversation")}</span>
        <kbd className="ag-faint shrink-0 rounded-[5px] bg-[var(--ag-hover)] px-1 py-px text-[9px] font-medium">
          ⌘N
        </kbd>
      </button>

      <div
        className="ag-row h-8 min-w-0 cursor-text text-[12px] focus-within:bg-[var(--ag-hover)]"
        onClick={() => searchRef.current?.focus()}
      >
        <Search className="size-3.5 shrink-0" />
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
            className="ag-icon-btn size-5"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
    </nav>
  );
}
