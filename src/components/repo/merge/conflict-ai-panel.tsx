import { Check, Loader2, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AiResultActions } from "@/components/ai/ai-result-actions";
import { AiSetupDialog } from "@/components/onboarding/ai-setup-dialog";
import { Button } from "@/components/ui/button";
import { isAiConfigured } from "@/lib/ai-setup";
import {
  diffSuggestionLines,
  type SuggestionDiffLine,
  type SuggestionRelation,
} from "@/lib/ai/conflict-suggest";
import { useCommitPrefs } from "@/lib/commit-prefs";
import type { ConflictBlock } from "@/lib/conflict-parser";
import { cn } from "@/lib/utils";
import type { ConflictAiController } from "./use-conflict-ai";

const RELATION_KEYS: Record<SuggestionRelation, string> = {
  ours: "mergeAi.relationOurs",
  theirs: "mergeAi.relationTheirs",
  both: "mergeAi.relationBoth",
  custom: "mergeAi.relationCustom",
};

export function ConflictAiToolbar({
  ai,
  block,
  blocks,
}: {
  ai: ConflictAiController;
  block: ConflictBlock | undefined;
  blocks: ConflictBlock[];
}) {
  const { t } = useTranslation();
  const [setupOpen, setSetupOpen] = useState(false);
  const aiReady = useCommitPrefs(() => isAiConfigured());

  const pending = blocks.filter((b) => ai.entryFor(b)?.status !== "ready");

  if (!aiReady) {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1 text-muted-foreground"
          onClick={() => setSetupOpen(true)}
          title={t("mergeAi.setupHint")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t("mergeAi.setup")}
        </Button>
        <AiSetupDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          onReady={() => {
            if (block) ai.suggest(block);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex items-center gap-1 border-l border-border pl-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1 text-git-merge hover:bg-git-merge/10 hover:text-git-merge"
        disabled={!block || ai.busy}
        onClick={() => block && ai.suggest(block)}
        title={t("mergeAi.suggestTitle")}
      >
        <WandSparkles className="h-3.5 w-3.5" />
        {t("mergeAi.suggest")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1"
        disabled={ai.busy || pending.length === 0}
        onClick={() => ai.suggestAll(pending)}
        title={t("mergeAi.suggestAllTitle")}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t("mergeAi.suggestAll")}
      </Button>
      {ai.busy ? (
        <>
          {ai.batch ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {t("mergeAi.progress", { done: ai.batch.done, total: ai.batch.total })}
            </span>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={ai.cancel}
            title={t("common.cancel")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : null}
    </div>
  );
}

function DiffColumn({
  heading,
  lines,
}: {
  heading: string;
  lines: SuggestionDiffLine[];
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      <div className="max-h-40 overflow-auto rounded border border-border bg-background/60 font-mono text-[11px] leading-[1.35]">
        {lines.map((line, idx) => (
          <div
            key={`${idx}-${line.text}`}
            className={cn(
              "whitespace-pre px-1.5",
              line.kind === "added" && "bg-git-added-subtle text-git-added",
              line.kind === "removed" && "bg-git-removed-subtle text-git-removed",
              line.kind === "same" && "text-muted-foreground",
            )}
          >
            {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConflictAiPreview({
  ai,
  block,
  onApply,
}: {
  ai: ConflictAiController;
  block: ConflictBlock | undefined;
  onApply: (block: ConflictBlock, content: string) => void;
}) {
  const { t } = useTranslation();
  const entry = ai.entryFor(block);

  const diffs = useMemo(() => {
    if (!block || !entry?.lines) return null;
    return {
      ours: diffSuggestionLines(block.oursLines, entry.lines),
      theirs: diffSuggestionLines(block.theirsLines, entry.lines),
    };
  }, [block, entry?.lines]);

  if (!block || !entry) return null;

  return (
    <div className="border-b border-border bg-git-merge/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-git-merge">
          <WandSparkles className="h-3.5 w-3.5" />
          {t("mergeAi.title")}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {t("mergeEditor.lineLabel", { line: block.startLine + 1 })}
        </span>
        {entry.status === "ready" && entry.relation ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {t(RELATION_KEYS[entry.relation])}
          </span>
        ) : null}

        {entry.status === "loading" ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("mergeAi.generating")}
            <Button type="button" size="sm" variant="ghost" onClick={ai.cancel}>
              <X className="h-3.5 w-3.5" />
              {t("common.cancel")}
            </Button>
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {entry.status === "ready" && entry.content !== undefined ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onApply(block, entry.content ?? "")}
              title={t("mergeAi.applyTitle")}
            >
              <Check className="h-3.5 w-3.5" />
              {t("mergeAi.apply")}
            </Button>
          ) : null}
          {entry.status !== "loading" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => ai.dismiss(block)}
              title={t("mergeAi.discardTitle")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("mergeAi.discard")}
            </Button>
          ) : null}
        </div>
      </div>

      {entry.status === "error" ? (
        <p className="mt-1.5 rounded border border-git-removed/40 bg-git-removed/10 px-2 py-1 text-xs text-git-removed">
          {entry.error ?? t("mergeAi.errorGeneric")}
        </p>
      ) : null}

      {entry.status === "ready" && diffs ? (
        <div className="mt-2 flex gap-3">
          <DiffColumn heading={t("mergeAi.vsOurs")} lines={diffs.ours} />
          <DiffColumn heading={t("mergeAi.vsTheirs")} lines={diffs.theirs} />
        </div>
      ) : null}

      {entry.status !== "loading" ? (
        <AiResultActions
          className="mt-2"
          busy={ai.busy}
          onRegenerate={() => ai.suggest(block)}
          onRefine={(hint) => ai.suggest(block, hint)}
          onCancel={ai.cancel}
          hintPlaceholder={t("mergeAi.hintPlaceholder")}
        />
      ) : null}
    </div>
  );
}
