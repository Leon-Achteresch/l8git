import { SpinIcon } from "@/components/motion/kit";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { Loader2 } from "lucide-react";
import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { DiffLayoutToggle } from "./diff-layout-toggle";
import { UnifiedDiffBody } from "./unified-diff-body";

const MonacoDiffViewer = lazy(() =>
  import("./monaco-diff-viewer").then((m) => ({ default: m.MonacoDiffViewer })),
);

/** Read-only diff of one file: virtualized rows inline, Monaco only side by side. */
export function CommitDiffViewer({
  unifiedText,
  filename,
}: {
  unifiedText: string;
  filename?: string | null;
}) {
  const { t } = useTranslation();
  const layoutMode = useCommitPrefs((s) => s.diffLayoutMode);
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-muted/15 px-4 py-2">
        <span
          title={filename ?? undefined}
          className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
        >
          {filename}
        </span>
        <DiffLayoutToggle className="shrink-0" />
      </div>
      <div className="min-h-0 flex-1">
        {layoutMode === "sideBySide" ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <SpinIcon icon={Loader2} className="h-6 w-6 text-primary/50" />
              </div>
            }
          >
            <MonacoDiffViewer unifiedText={unifiedText} filename={filename} />
          </Suspense>
        ) : (
          // Monaco's inline mode renders every deleted line eagerly, which stutters on big diffs.
          <UnifiedDiffBody
            loading={false}
            failed={false}
            isBinary={false}
            unifiedText={unifiedText}
            untrackedPlain={null}
            emptyHint={t("commitInspect.noTextChanges")}
            failedHint={t("diff.diffLoadFailedFallback")}
            filePath={filename}
            lineNumbers
          />
        )}
      </div>
    </div>
  );
}
