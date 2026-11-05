import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import {
  draftKey,
  toReviewPayload,
  useReviewDraftStore,
  useReviewDrafts,
} from "@/lib/pr-review-drafts";
import type { ProviderCapabilities } from "@/lib/pr-provider";
import { invoke } from "@tauri-apps/api/core";
import { CheckCheck, Loader2, MessageSquare, ThumbsDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SpinIcon } from "@/components/motion/kit";
import { submitRangeReview } from "@/lib/github-expansion/api";
import { planReviewSubmission } from "@/lib/github-ui/review-submit";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";

type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export function PullRequestReviewDraftsBar({
  path,
  number,
  caps,
  headSha,
  onSubmitted,
}: {
  path: string;
  number: number;
  caps: ProviderCapabilities | null;
  /** Current PR head; only used to warn when pinned drafts were anchored at an older head. */
  headSha?: string;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation();
  const drafts = useReviewDrafts(path, number);
  const clearDrafts = useReviewDraftStore((s) => s.clearDrafts);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState<ReviewEvent | null>(null);
  const target = useGithubTarget(path);

  if (drafts.length === 0) return null;

  const comments = toReviewPayload(drafts);
  const batched = caps?.can_draft_reviews ?? false;
  const plan = planReviewSubmission(drafts, caps?.provider, headSha);

  async function submit(event: ReviewEvent) {
    if (event === "REQUEST_CHANGES" && !summary.trim()) {
      toastError(t("prReview.summaryRequired"));
      return;
    }
    if (plan.kind === "mixed") {
      toastError(t("prRanges.mixedHeads"));
      return;
    }
    setBusy(event);
    try {
      if (plan.kind === "pinned") {
        // Pinned to the commit the anchors were taken from; never the legacy unpinned path.
        if (!isTarget(target)) throw new Error(t("prRanges.pinnedNoAccount"));
        await submitRangeReview(target.account, target.fullName, number, plan.commitId, event, summary.trim(), plan.comments);
      } else {
        await invoke("pr_submit_review", {
          path,
          number,
          event,
          body: summary.trim(),
          comments,
        });
      }
      clearDrafts(draftKey(path, number));
      setSummary("");
      toast.success(t("prReview.submitted", { count: comments.length }));
      onSubmitted();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-muted/40 px-3 py-2 ring-1 ring-border/50">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-[0.75rem] font-semibold">
          {t("prReview.pendingComments", { count: drafts.length })}
        </span>
        <span className="text-[0.625rem] text-muted-foreground">
          {batched ? t("prReview.batchedHint") : t("prReview.oneByOneHint")}
        </span>
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 text-[0.625rem]"
          disabled={busy !== null}
          onClick={() => clearDrafts(draftKey(path, number))}
          title={t("prReview.discardAll")}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          {t("prReview.discardAll")}
        </Button>
      </div>
      {plan.kind === "pinned" && plan.headMoved && (
        <p className="text-[0.625rem] text-amber-600" role="status" data-testid="review-head-moved">
          {t("prRanges.headMoved", { commit: plan.commitId.slice(0, 7) })}
        </p>
      )}
      {plan.kind === "mixed" && (
        <p className="text-[0.625rem] text-rose-500" role="status">{t("prRanges.mixedHeads")}</p>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t("prReview.summaryPlaceholder")}
          className="h-7 min-w-0 flex-1 text-[0.6875rem]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-[0.6875rem]"
          disabled={busy !== null}
          onClick={() => void submit("COMMENT")}
        >
          {busy === "COMMENT" ? (
            <SpinIcon icon={Loader2} className="mr-1 h-3 w-3" />
          ) : (
            <MessageSquare className="mr-1 h-3 w-3" />
          )}
          {t("prReview.submitComment")}
        </Button>
        {(caps?.can_approve ?? true) && (
          <Button
            type="button"
            variant="default"
            size="pill"
            className="h-7 shrink-0 text-[0.6875rem]"
            disabled={busy !== null}
            onClick={() => void submit("APPROVE")}
          >
            {busy === "APPROVE" ? (
              <SpinIcon icon={Loader2} className="mr-1 h-3 w-3" />
            ) : (
              <CheckCheck className="mr-1 h-3 w-3" />
            )}
            {t("prReview.submitApprove")}
          </Button>
        )}
        {(caps?.can_request_changes ?? false) && (
          <Button
            type="button"
            variant="ghost"
            size="pill"
            className="h-7 shrink-0 text-[0.6875rem]"
            disabled={busy !== null}
            onClick={() => void submit("REQUEST_CHANGES")}
          >
            {busy === "REQUEST_CHANGES" ? (
              <SpinIcon icon={Loader2} className="mr-1 h-3 w-3" />
            ) : (
              <ThumbsDown className="mr-1 h-3 w-3" />
            )}
            {t("prReview.submitRequestChanges")}
          </Button>
        )}
      </div>
    </div>
  );
}
