import { memo } from "react";
import { useTranslation } from "react-i18next";

import { InboxRow } from "@/components/inbox/inbox-row";
import { formatRelative } from "@/lib/format";
import type { InboxCiItem } from "@/lib/inbox";

export const InboxCiRow = memo(function InboxCiRow({
  item,
  onOpen,
}: {
  item: InboxCiItem;
  onOpen: (item: InboxCiItem) => void;
}) {
  const { t } = useTranslation();

  return (
    <InboxRow
      repoName={item.repoName}
      title={item.name}
      relativeTime={formatRelative(item.updatedAt)}
      tooltip={`${item.path} · #${item.runNumber}`}
      externalUrl={item.htmlUrl || undefined}
      externalLabel={t("inbox.openExternal")}
      onOpen={() => onOpen(item)}
      meta={
        <>
          <span className="max-w-48 truncate">{item.branch}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">#{item.runNumber}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{item.event}</span>
        </>
      }
      badges={
        <span className="shrink-0 rounded-md bg-git-removed/15 px-1.5 py-0.5 text-[10px] font-medium text-git-removed">
          {t(`inbox.conclusion.${item.conclusion}`, { defaultValue: item.conclusion })}
        </span>
      }
    />
  );
});
