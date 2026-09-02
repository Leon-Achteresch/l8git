import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import type { ProviderCapabilities } from "@/lib/pr-provider";
import { invoke } from "@tauri-apps/api/core";
import { CheckCheck, ThumbsDown } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PullRequestDetail } from "./pull-request-inspect-detail";

export function PrReviewActions({
  path,
  detail,
  caps,
  onReviewed,
}: {
  path: string;
  detail: PullRequestDetail;
  caps: ProviderCapabilities | null;
  onReviewed: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);

  if (!caps || !caps.can_approve) return null;
  if (detail.state !== "open" && detail.state !== "draft") return null;

  async function submit(event: "APPROVE" | "REQUEST_CHANGES") {
    let body = "";
    if (event === "REQUEST_CHANGES") {
      const input = window.prompt(t("prInspect.requestChangesPrompt"));
      if (input === null || !input.trim()) return;
      body = input.trim();
    }
    setBusy(event);
    try {
      await invoke("pr_submit_review", {
        path,
        number: detail.number,
        event,
        body,
        comments: null,
      });
      onReviewed();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-2.5 flex flex-wrap items-center gap-2"
    >
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] rounded-lg border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-300"
        disabled={busy !== null}
        onClick={() => void submit("APPROVE")}
      >
        <CheckCheck className="mr-1 h-3 w-3" />
        {busy === "APPROVE" ? t("prInspect.approveBusy") : t("prInspect.approveVerb")}
      </Button>

      {caps.can_request_changes && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] rounded-lg border-rose-500/30 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300"
          disabled={busy !== null}
          onClick={() => void submit("REQUEST_CHANGES")}
        >
          <ThumbsDown className="mr-1 h-3 w-3" />
          {t("prInspect.requestChangesVerb")}
        </Button>
      )}

      <span className="text-[10px] text-muted-foreground/70 ml-auto font-mono">
        {t("prInspect.providerHint", { label: caps.label, host: caps.host })}
      </span>
    </m.div>
  );
}
