import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { BlameEntry } from "./git-blame-sheet";
import { Button } from "@/components/ui/button";
import { formatFullDate, initials, nameToHsl } from "./git-blame-utils";

export type ActiveCard = {
  entry: BlameEntry;
  top: number;
  left: number;
};

export function CommitCard({
  card,
  onClose,
  onPrevious,
  previousStatus,
}: {
  card: ActiveCard;
  onClose: () => void;
  onPrevious?: () => void;
  previousStatus: "idle" | "loading" | "error";
}) {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const color = nameToHsl(card.entry.author);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: card.top, left: card.left, zIndex: 200, maxWidth: 320, minWidth: 260 }}
      className="overflow-hidden rounded-xl border border-border/80 bg-popover shadow-2xl"
    >
      <div className="border-b border-border/40 px-4 py-3">
        <p className="text-[0.8125rem] font-semibold leading-snug text-foreground">
          {card.entry.summary || "(no commit subject)"}
        </p>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold text-white"
            style={{ background: color }}
          >
            {initials(card.entry.author)}
          </div>
          <span className="text-[0.75rem] font-medium text-foreground">{card.entry.author}</span>
        </div>
        {onPrevious && (card.entry.previous ? (
          <>
            <Button size="sm" variant="outline" onClick={onPrevious} disabled={previousStatus === "loading"}>
              {t(previousStatus === "loading" ? "blamePage.loading" : "blamePage.openPrevious")}
            </Button>
            {previousStatus === "error" && <p role="status" className="text-xs text-destructive">
              {t("blamePage.previousUnavailable")}
            </p>}
          </>
        ) : <p className="text-xs text-muted-foreground">{t("blamePage.noPrevious")}</p>)}
        <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          <span className="font-mono">{card.entry.short_hash}</span>
          <span className="opacity-40">·</span>
          <span>{formatFullDate(card.entry.timestamp, i18n.language)}</span>
        </div>
      </div>
    </div>
  );
}
