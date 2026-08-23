import { CircleCheck, CircleDashed, CircleX, LoaderCircle } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { InboxRow } from "@/components/inbox/inbox-row";
import { formatRelative } from "@/lib/format";
import type { InboxCheckState, InboxPrItem } from "@/lib/inbox";
import { cn } from "@/lib/utils";

const CHECK_ICON = {
  success: CircleCheck,
  failure: CircleX,
  running: LoaderCircle,
  unknown: CircleDashed,
} as const;

const CHECK_COLOR: Record<InboxCheckState, string> = {
  success: "text-git-added",
  failure: "text-git-removed",
  running: "text-primary",
  unknown: "text-muted-foreground",
};

export const InboxPrRow = memo(function InboxPrRow({
  item,
  onOpen,
}: {
  item: InboxPrItem;
  onOpen: (item: InboxPrItem) => void;
}) {
  const { t } = useTranslation();
  const CheckIcon = CHECK_ICON[item.checks];

  return (
    <InboxRow
      repoName={item.repoName}
      title={item.title}
      relativeTime={formatRelative(item.updatedAt)}
      tooltip={`${item.path} · #${item.number}`}
      externalUrl={item.htmlUrl || undefined}
      externalLabel={t("inbox.openExternal")}
      onOpen={() => onOpen(item)}
      meta={
        <>
          <span className="shrink-0 tabular-nums">#{item.number}</span>
          <span aria-hidden>·</span>
          <span className="max-w-40 truncate">{item.author}</span>
          <span aria-hidden>·</span>
          <span className="max-w-56 truncate">
            {item.sourceBranch} → {item.targetBranch}
          </span>
        </>
      }
      badges={
        <>
          {item.isDraft ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t("inbox.badges.draft")}
            </span>
          ) : null}
          {item.checks !== "unknown" ? (
            <span
              className={cn("inline-flex shrink-0 items-center gap-1", CHECK_COLOR[item.checks])}
              title={t(`inbox.checks.${item.checks}`)}
            >
              <CheckIcon className={cn("size-3", item.checks === "running" && "animate-spin")} />
              {t(`inbox.checks.${item.checks}`)}
            </span>
          ) : null}
          {item.reviewers.length > 0 ? (
            <span className="shrink-0 truncate" title={item.reviewers.join(", ")}>
              {t("inbox.badges.reviewers", { count: item.reviewers.length })}
            </span>
          ) : null}
        </>
      }
    />
  );
});
