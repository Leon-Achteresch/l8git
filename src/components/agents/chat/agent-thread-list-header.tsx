import { Archive as ArchiveData, ArchiveRestore as ArchiveRestoreData } from "lucide";
import { useTranslation } from "react-i18next";

import { MorphIcon } from "@/components/ui/morph-icon";

export function AgentThreadListHeader({
  showArchived,
  archivedCount,
  onToggleArchived,
}: {
  showArchived: boolean;
  archivedCount: number;
  onToggleArchived: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-7 items-center justify-between px-2">
      <div className="flex items-center gap-1.5">
        <h2 className="ag-label">{showArchived ? t("agentChat.archived") : t("agentChat.recents")}</h2>
        {showArchived && archivedCount > 0 ? (
          <span className="rounded-full bg-[var(--ag-hover)] px-1.5 py-0.2 text-[9px] font-medium text-[var(--ag-text-3)]">
            {archivedCount}
          </span>
        ) : null}
      </div>
      {showArchived || archivedCount > 0 ? (
        <button
          type="button"
          onClick={onToggleArchived}
          data-active={showArchived}
          className="ag-icon-btn size-6 rounded-full"
          aria-pressed={showArchived}
          aria-label={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
          title={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
        >
          <MorphIcon icon={showArchived ? ArchiveRestoreData : ArchiveData} className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
