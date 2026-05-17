import { useTranslation } from "react-i18next";

import { laneColor } from "@/lib/graph";
import type { TagRef } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { TagRow } from "./tag-row";

export function TagSection({
  path,
  title,
  tags,
  emptyLabel,
  hideHeader,
}: {
  path: string;
  title: string;
  tags: TagRef[];
  emptyLabel?: string;
  hideHeader?: boolean;
}) {
  const { t } = useTranslation();
  const isEmpty = tags.length === 0;

  return (
    <section className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      {!hideHeader && (
        <header
          className={cn(
            "mb-1 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2",
          )}
        >
          <h3 className="min-w-0 justify-self-stretch truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </h3>
          <span className="flex shrink-0 items-center justify-end gap-0.5">
            <span
              className="flex h-[18px] min-w-[20px] items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              aria-label={`${tags.length} ${t("sidebar.tags")}`}
            >
              {tags.length}
            </span>
          </span>
        </header>
      )}

      {isEmpty ? (
        <p className={cn("px-2 pb-1 text-[11px] text-muted-foreground/70", hideHeader && "pt-1")}>
          {emptyLabel ?? t("tag.defaultEmpty")}
        </p>
      ) : (
        <ul className="mb-0.5 min-w-0 space-y-px">
          {tags.map((tag) => (
            <TagRow key={tag.name} path={path} tag={tag} laneColor={laneColor(tag.name)} />
          ))}
        </ul>
      )}
    </section>
  );
}
