import { m } from "motion/react";
import { useTranslation } from "react-i18next";

const STATUS_PILL_STYLES: Record<string, { bg: string; dot: string; ping: string; border: string }> = {
  open: {
    bg: "bg-emerald-500/10 text-emerald-400",
    dot: "bg-emerald-400",
    ping: "bg-emerald-400",
    border: "border-emerald-500/30",
  },
  draft: {
    bg: "bg-muted/60 text-muted-foreground",
    dot: "bg-muted-foreground",
    ping: "bg-muted-foreground",
    border: "border-border/80",
  },
  merged: {
    bg: "bg-purple-500/10 text-purple-400",
    dot: "bg-purple-400",
    ping: "bg-purple-400",
    border: "border-purple-500/30",
  },
  closed: {
    bg: "bg-rose-500/10 text-rose-400",
    dot: "bg-rose-400",
    ping: "bg-rose-400",
    border: "border-rose-500/30",
  },
};

const LABEL_KEYS: Record<string, string> = {
  open: "prInspect.pillOpen",
  draft: "prInspect.pillDraft",
  merged: "prInspect.pillMerged",
  closed: "prInspect.pillClosed",
};

export function PrStatusPill({ state, isDraft }: { state: string; isDraft: boolean }) {
  const { t } = useTranslation();
  const key = state === "open" && isDraft ? "draft" : state;
  const pill = STATUS_PILL_STYLES[key] ?? STATUS_PILL_STYLES.open;
  const lk = LABEL_KEYS[key] ?? "prInspect.pillOpen";

  return (
    <m.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 450, damping: 28 }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide shadow-xs backdrop-blur-xs ${pill.bg} ${pill.border}`}
    >
      <span className="relative flex h-2 w-2 items-center justify-center">
        {key === "open" && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pill.ping}`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${pill.dot}`} />
      </span>
      <span>{t(lk)}</span>
      {isDraft && state === "open" && (
        <span className="opacity-75">{t("prInspect.pillDraftSuffix")}</span>
      )}
    </m.span>
  );
}
