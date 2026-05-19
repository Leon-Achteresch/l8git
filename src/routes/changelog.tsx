import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDownToLine,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Package,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  installAppUpdate,
  restartToApplyAppUpdate,
  useAppUpdateStore,
} from "@/lib/app-updater";
import { useMemo } from "react";

export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
});

function stripLeadingChangelogHeading(markdown: string): string {
  return markdown
    .replace(
      /^\s*#{1,2}\s+(changelog|\u00e4nderungsprotokoll|\u00c4nderungsprotokoll)\s*(\n+|$)/im,
      "",
    )
    .trim();
}

function formatPublishedAt(value: string | null, localeTag: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: "long",
  }).format(date);
}

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.6 } },
};

function ChangelogPage() {
  const { t, i18n } = useTranslation();

  const phase = useAppUpdateStore((s) => s.phase);
  const version = useAppUpdateStore((s) => s.version);
  const currentVersion = useAppUpdateStore((s) => s.currentVersion);
  const notes = useAppUpdateStore((s) => s.notes);
  const publishedAt = useAppUpdateStore((s) => s.publishedAt);

  const localeTag = useMemo(
    () => (i18n.language.startsWith("de") ? "de-DE" : "en-US"),
    [i18n.language],
  );

  const publishedLabel = formatPublishedAt(publishedAt, localeTag);

  const releaseNotesMarkdown = useMemo(() => {
    const raw = notes?.trim() ?? "";
    if (!raw) return null;
    const body = stripLeadingChangelogHeading(raw);
    return body.length > 0 ? body : null;
  }, [notes]);

  const hasUpdate = phase === "available" || phase === "downloading" || phase === "installing" || phase === "installed";
  const busy = phase === "downloading" || phase === "installing";

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {/* Back + title row */}
        <motion.div variants={item} className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/" aria-label={t("common.back")}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15">
              <Package className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {t("changelog.title")}
              </h1>
              <p className="text-sm text-muted-foreground">l8git</p>
            </div>
          </div>
        </motion.div>

        {/* Version badges + action */}
        {(version || currentVersion) && (
          <motion.div
            variants={item}
            className="flex flex-wrap items-center gap-2"
          >
            {version && (
              <Badge variant="outline" className="gap-1.5 text-xs font-medium">
                <ArrowDownToLine className="size-3 text-primary" />
                {t("updates.badgeNew", { version })}
              </Badge>
            )}
            {currentVersion && (
              <Badge variant="secondary" className="gap-1.5 text-xs">
                <CheckCircle2 className="size-3" />
                {t("updates.badgeInstalled", { version: currentVersion })}
              </Badge>
            )}
            {publishedLabel && (
              <Badge variant="secondary" className="gap-1.5 text-xs">
                <Calendar className="size-3" />
                {publishedLabel}
              </Badge>
            )}

            {/* Install / Restart actions */}
            {hasUpdate && (
              <div className="ml-auto flex items-center gap-2">
                {phase === "available" && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => void installAppUpdate()}
                  >
                    <ArrowDownToLine className="size-3.5" />
                    {t("common.install")}
                  </Button>
                )}
                {phase === "installed" && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => void restartToApplyAppUpdate()}
                  >
                    <RefreshCw className="size-3.5" />
                    {t("updates.restartNow")}
                  </Button>
                )}
                {busy && (
                  <Button size="sm" disabled>
                    {phase === "downloading"
                      ? t("updates.titleDownloadingShort")
                      : t("updates.titleInstallingShort")}
                    …
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Divider */}
        <motion.div variants={item} className="border-t border-border/60" />

        {/* Release notes */}
        <motion.div variants={item}>
          {releaseNotesMarkdown ? (
            <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm">
              <div className="border-b border-border/50 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("updates.changelogTitle")}
                </h2>
              </div>
              <ScrollArea className="max-h-[calc(100dvh-20rem)]">
                <div className="px-5 py-5">
                  <div className="prose-update space-y-4 text-sm leading-7 text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:mb-1 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mb-1 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:border-border [&_li]:ml-5 [&_li]:pl-1 [&_ol]:list-decimal [&_p_code]:text-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-muted/70 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {releaseNotesMarkdown}
                    </ReactMarkdown>
                  </div>
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-card/60 px-5 py-8 text-center">
              <Package className="mx-auto mb-3 size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("updates.noReleaseNotes")}</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t("changelog.noNotesHint")}
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </main>
  );
}
