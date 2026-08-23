import { Check, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UnifiedDiffBody } from "@/components/repo/commit/unified-diff-body";
import { Button } from "@/components/ui/button";
import {
  hunkCounts,
  hunkDiffText,
  type AgentReviewFile,
} from "@/lib/agents/agent-review";
import type { ParsedDiff } from "@/lib/unified-diff";
import { cn } from "@/lib/utils";

const LINE_HEIGHT_PX = 18;
const BODY_PADDING_PX = 16;
const MAX_BLOCK_HEIGHT_PX = 520;

function blockHeight(lineCount: number): number {
  return Math.min(MAX_BLOCK_HEIGHT_PX, lineCount * LINE_HEIGHT_PX + BODY_PADDING_PX);
}

function HunkActions({
  accepted,
  locked,
  onAccept,
  onDiscard,
  acceptLabel,
  discardLabel,
}: {
  accepted: boolean;
  locked: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  acceptLabel: string;
  discardLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant={accepted ? "success" : "outline"}
        size="xs"
        disabled={locked}
        onClick={onAccept}
      >
        <Check />
        {acceptLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={locked}
        onClick={onDiscard}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 />
        {discardLabel}
      </Button>
    </div>
  );
}

export function AgentReviewDiffPane({
  file,
  parsed,
  untrackedPlain,
  isBinary,
  loading,
  failed,
  locked,
  fileAccepted,
  acceptedHunks,
  onAcceptFile,
  onDiscardFile,
  onAcceptHunk,
  onDiscardHunk,
}: {
  file: AgentReviewFile | null;
  parsed: ParsedDiff | null;
  untrackedPlain: string | null;
  isBinary: boolean;
  loading: boolean;
  failed: boolean;
  locked: boolean;
  fileAccepted: boolean;
  acceptedHunks: ReadonlySet<number>;
  onAcceptFile: () => void;
  onDiscardFile: () => void;
  onAcceptHunk: (hunkIdx: number) => void;
  onDiscardHunk: (hunkIdx: number) => void;
}) {
  const { t } = useTranslation();

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
        {t("agentReview.selectFile")}
      </div>
    );
  }

  const hunks = parsed?.hunks ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ag-line flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.path}>
          {file.path}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums">
          <span className="text-git-added">+{file.additions}</span>{" "}
          <span className="text-git-removed">-{file.deletions}</span>
        </span>
        <HunkActions
          accepted={fileAccepted}
          locked={locked}
          onAccept={onAcceptFile}
          onDiscard={onDiscardFile}
          acceptLabel={t("agentReview.acceptFile")}
          discardLabel={t("agentReview.discardFile")}
        />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-primary/50" />
        </div>
      ) : failed ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
          {t("agentReview.diffFailed")}
        </div>
      ) : isBinary ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          {t("agentReview.binaryFile")}
        </div>
      ) : untrackedPlain !== null ? (
        <div className="ag-scroll min-h-0 flex-1 overflow-y-auto p-2">
          <div className="ag-card overflow-hidden rounded-lg">
            <div className="ag-line border-b px-3 py-1.5 text-[11px] text-muted-foreground">
              {t("agentReview.untrackedFile")}
            </div>
            <div style={{ height: blockHeight(untrackedPlain.split("\n").length) }}>
              <UnifiedDiffBody
                loading={false}
                failed={false}
                isBinary={false}
                unifiedText={null}
                untrackedPlain={untrackedPlain}
                emptyHint={t("agentReview.emptyDiff")}
                failedHint={t("agentReview.diffFailed")}
              />
            </div>
          </div>
        </div>
      ) : hunks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
          {t("agentReview.emptyDiff")}
        </div>
      ) : (
        <div className="ag-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {hunks.map((hunk, hunkIdx) => {
            const counts = hunkCounts(hunk);
            const accepted = acceptedHunks.has(hunkIdx);
            return (
              <div
                key={`${hunk.header}:${hunkIdx}`}
                className={cn(
                  "ag-card overflow-hidden rounded-lg",
                  accepted && "ring-1 ring-git-added/40",
                )}
              >
                <div className="ag-line flex items-center gap-2 border-b px-3 py-1.5">
                  <span className="shrink-0 text-[11px] font-medium">
                    {t("agentReview.hunkLabel", { index: hunkIdx + 1 })}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">
                    {hunk.header}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums">
                    <span className="text-git-added">+{counts.additions}</span>{" "}
                    <span className="text-git-removed">-{counts.deletions}</span>
                  </span>
                  <HunkActions
                    accepted={accepted}
                    locked={locked}
                    onAccept={() => onAcceptHunk(hunkIdx)}
                    onDiscard={() => onDiscardHunk(hunkIdx)}
                    acceptLabel={t("agentReview.accept")}
                    discardLabel={t("agentReview.discard")}
                  />
                </div>
                <div style={{ height: blockHeight(hunk.lines.length + 1) }}>
                  <UnifiedDiffBody
                    loading={false}
                    failed={false}
                    isBinary={false}
                    unifiedText={hunkDiffText(hunk)}
                    untrackedPlain={null}
                    emptyHint={t("agentReview.emptyDiff")}
                    failedHint={t("agentReview.diffFailed")}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
