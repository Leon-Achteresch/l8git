import { Button } from "@/components/ui/button";
import { SpinIcon, pulseKeyframes, pulseTransition } from "@/components/motion/kit";
import {
  checkForAppUpdate,
  dismissAppUpdateDialog,
  installAppUpdate,
  restartToApplyAppUpdate,
  useAppUpdateStore,
} from "@/lib/app-updater";
import { Check, RefreshCw, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type Phase = ReturnType<typeof useAppUpdateStore.getState>["phase"];

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatPublishedAt(value: string | null, localeTag: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: "medium",
  }).format(date);
}

function progressPercent(downloadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0) return null;
  return Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
}

function extractHighlights(notes: string, t: TFunction): string[] {
  const raw = notes.trim();
  if (!raw) {
    return [
      t("updates.highlight1"),
      t("updates.highlight2"),
      t("updates.highlight3"),
    ];
  }

  const lines = raw.split("\n");
  const extracted: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const bulletMatch = trimmed.match(/^[-*•+]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch && bulletMatch[1]) {
      const clean = bulletMatch[1]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`]/g, "")
        .trim();
      if (clean && !extracted.includes(clean)) {
        extracted.push(clean);
      }
    }
    if (extracted.length >= 3) break;
  }

  if (extracted.length === 0) {
    const paragraphs = raw
      .split(/\n\s*\n/)
      .map((p) => p.replace(/^[#\-*•+\s]+/, "").trim())
      .filter((p) => p.length > 0 && !p.toLowerCase().includes("changelog"));

    for (const p of paragraphs) {
      const firstSentence = p.split(/[.!?]\s/)[0]?.trim();
      if (firstSentence && !extracted.includes(firstSentence)) {
        extracted.push(firstSentence);
      }
      if (extracted.length >= 3) break;
    }
  }

  if (extracted.length === 0) {
    return [
      t("updates.highlight1"),
      t("updates.highlight2"),
      t("updates.highlight3"),
    ];
  }

  return extracted;
}

function titleForPhase(phase: Phase, version: string | null, t: TFunction) {
  switch (phase) {
    case "idle":
      return "";
    case "available":
      return version ? `l8git v${version}` : t("updates.titleAvailableShort");
    case "downloading":
      return version ? t("updates.titleDownloading", { version }) : t("updates.titleDownloadingShort");
    case "installing":
      return version ? t("updates.titleInstalling", { version }) : t("updates.titleInstallingShort");
    case "installed":
      return version ? t("updates.titleInstalled", { version }) : t("updates.titleInstalledShort");
    case "up-to-date":
      return t("updates.titleUpToDate");
    case "unsupported":
      return t("updates.titleUnsupported");
    case "error":
      return t("updates.titleError");
    default: {
      const exhaustiveCheck: never = phase;
      return exhaustiveCheck;
    }
  }
}

function descriptionForPhase(phase: Phase, currentVersion: string | null, t: TFunction) {
  switch (phase) {
    case "idle":
      return "";
    case "available":
      return t("updates.descAvailable");
    case "downloading":
      return t("updates.descDownloading");
    case "installing":
      return t("updates.descInstalling");
    case "installed":
      return t("updates.descInstalled");
    case "up-to-date":
      return currentVersion
        ? t("updates.descUpToDateVersion", { version: currentVersion })
        : t("updates.descUpToDateGeneric");
    case "unsupported":
      return t("updates.descUnsupported");
    case "error":
      return t("updates.descError");
    default: {
      const exhaustiveCheck: never = phase;
      return exhaustiveCheck;
    }
  }
}

export function AppUpdateDialog() {
  const { t, i18n } = useTranslation();
  const open = useAppUpdateStore((s) => s.open);
  const phase = useAppUpdateStore((s) => s.phase);
  const version = useAppUpdateStore((s) => s.version);
  const currentVersion = useAppUpdateStore((s) => s.currentVersion);
  const notes = useAppUpdateStore((s) => s.notes);
  const publishedAt = useAppUpdateStore((s) => s.publishedAt);
  const errorMessage = useAppUpdateStore((s) => s.errorMessage);
  const downloadedBytes = useAppUpdateStore((s) => s.downloadedBytes);
  const totalBytes = useAppUpdateStore((s) => s.totalBytes);

  const busy = phase === "downloading" || phase === "installing";
  const percent = progressPercent(downloadedBytes, totalBytes);
  const localeTag = useMemo(() => (i18n.language.startsWith("de") ? "de-DE" : "en-US"), [i18n.language]);
  const publishedLabel = formatPublishedAt(publishedAt, localeTag);
  const highlights = useMemo(() => extractHighlights(notes, t), [notes, t]);
  const dialogTitle = useMemo(() => titleForPhase(phase, version, t), [phase, version, t]);
  const dialogDescription = useMemo(
    () => descriptionForPhase(phase, currentVersion, t),
    [phase, currentVersion, t],
  );

  useEffect(() => {
    if (!open || busy) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissAppUpdateDialog();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, open]);

  const visible = open && phase !== "idle";

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          role="region"
          aria-label={dialogTitle}
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
          className="fixed bottom-4 left-4 z-[200] w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[26px] border border-border/80 bg-card text-card-foreground shadow-2xl backdrop-blur-xl"
        >
          <div className="relative flex h-36 w-full select-none items-center justify-center overflow-hidden bg-gradient-to-br from-[#120e2e] via-[#2a2468] to-[#4338ca]">
            <div className="absolute -left-10 -top-12 h-44 w-52 rounded-full bg-indigo-500/40 blur-3xl" />
            <div className="absolute -right-8 -top-8 h-40 w-48 rounded-full bg-violet-500/35 blur-3xl" />
            <div className="absolute bottom-1 left-1/3 h-28 w-40 rounded-full bg-blue-500/25 blur-2xl" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15" />

            <div className="relative z-10 flex size-14 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-indigo-400/30 blur-xl" />
              <img
                src="/icons/web/icon-512.png"
                alt="l8git"
                className="relative size-12 rounded-full object-cover shadow-lg ring-2 ring-white/20 drop-shadow-[0_0_16px_rgba(99,102,241,0.7)]"
              />
            </div>

            <button
              type="button"
              onClick={() => dismissAppUpdateDialog()}
              disabled={busy}
              aria-label={t("updates.close")}
              className="absolute right-3 top-3 z-20 flex size-7 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-0"
            >
              <X className="size-4 stroke-[2.5]" />
            </button>
          </div>

          <div className="space-y-3.5 p-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  {dialogTitle}
                </h2>
                {phase === "available" && (
                  <span className="rounded-full border border-indigo-500/25 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                    NEW
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {dialogDescription}
              </p>
            </div>

            {highlights.length > 0 && (
              <div className="space-y-2 pt-0.5">
                {highlights.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2.5 text-xs leading-snug text-foreground/90"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 stroke-[2.5] text-indigo-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {phase === "available" && (
              <div className="flex items-baseline gap-2 pt-0.5">
                <span className="text-xl font-bold tracking-tight text-foreground">
                  {version ? `v${version}` : "Update"}
                </span>
                {currentVersion && (
                  <span className="text-xs text-muted-foreground line-through">
                    v{currentVersion}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {publishedLabel ? `• ${publishedLabel}` : `• ${t("updates.readyToInstall")}`}
                </span>
              </div>
            )}

            {(phase === "downloading" || phase === "installing") && (
              <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/40 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {phase === "downloading" ? t("updates.downloadRunning") : t("updates.installRunning")}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {percent !== null ? `${percent}%` : "…"}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  {percent !== null ? (
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  ) : (
                    <m.div
                      animate={pulseKeyframes}
                      transition={pulseTransition}
                      className="h-full w-2/5 rounded-full bg-indigo-500/70"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{phase === "downloading" ? t("updates.releaseDownloading") : t("updates.filesApplying")}</span>
                  {totalBytes > 0 && (
                    <span>{formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</span>
                  )}
                </div>
              </div>
            )}

            {phase === "installed" && (
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-600 dark:text-indigo-400">
                {t("updates.installedHint")}
              </div>
            )}

            {phase === "error" && errorMessage && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {errorMessage}
              </div>
            )}

            <div className="pt-1">
              {phase === "available" && (
                <Button
                  type="button"
                  size="lg"
                  className="h-11 w-full rounded-2xl bg-foreground text-sm font-semibold text-background shadow-sm transition-all hover:bg-foreground/90"
                  onClick={() => void installAppUpdate()}
                >
                  {t("updates.toastInstallNow")}
                </Button>
              )}

              {(phase === "downloading" || phase === "installing") && (
                <Button
                  type="button"
                  size="lg"
                  disabled
                  className="h-11 w-full rounded-2xl bg-foreground/80 text-sm font-semibold text-background shadow-sm"
                >
                  <SpinIcon icon={RefreshCw} active className="mr-2 size-4" />
                  {phase === "downloading"
                    ? `${t("updates.downloadRunning")} ${percent !== null ? `${percent}%` : ""}`
                    : t("updates.installRunning")}
                </Button>
              )}

              {phase === "installed" && (
                <Button
                  type="button"
                  size="lg"
                  className="h-11 w-full rounded-2xl bg-foreground text-sm font-semibold text-background shadow-sm transition-all hover:bg-foreground/90"
                  onClick={() => void restartToApplyAppUpdate()}
                >
                  {t("updates.restartNow")}
                </Button>
              )}

              {(phase === "up-to-date" || phase === "unsupported") && (
                <Button
                  type="button"
                  size="lg"
                  className="h-11 w-full rounded-2xl bg-foreground text-sm font-semibold text-background shadow-sm"
                  onClick={() => dismissAppUpdateDialog()}
                >
                  {t("updates.close")}
                </Button>
              )}

              {phase === "error" && (
                <Button
                  type="button"
                  size="lg"
                  className="h-11 w-full rounded-2xl bg-foreground text-sm font-semibold text-background shadow-sm"
                  onClick={() => void checkForAppUpdate({ manual: true })}
                >
                  {t("common.retryCheck")}
                </Button>
              )}
            </div>

            {!busy && (
              <button
                type="button"
                onClick={() => dismissAppUpdateDialog()}
                className="w-full py-0.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.later")}
              </button>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
