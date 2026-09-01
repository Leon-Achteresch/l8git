import { SpinIcon } from "@/components/motion/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError } from "@/lib/error-toast";
import type { ProviderCapabilities } from "@/lib/pr-provider";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  GitMerge,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PullRequestDetail } from "./pull-request-inspect-detail";

export type MergeStrategy = "merge" | "squash" | "rebase";

type BranchProtection = {
  required_status_checks: string[];
  required_approving_review_count: number | null;
  dismiss_stale_reviews: boolean;
  require_code_owner_reviews: boolean;
  enforce_admins: boolean;
  allow_force_pushes: boolean;
  allow_deletions: boolean;
};

const MERGE_STRATEGY_LABEL_KEYS: Record<MergeStrategy, string> = {
  squash: "prInspect.strategySquashOpt",
  rebase: "prInspect.strategyRebaseOpt",
  merge: "prInspect.strategyMergeOpt",
};

export function PrMergeBanner({
  path,
  detail,
  caps,
  busy,
  strategy,
  mergeMessage,
  deleteSourceBranch,
  onStrategyChange,
  onMergeMessageChange,
  onDeleteSourceBranchChange,
  onMerge,
  onCheckout,
  onReload,
}: {
  path: string;
  detail: PullRequestDetail;
  caps: ProviderCapabilities | null;
  busy: string | null;
  strategy: MergeStrategy;
  mergeMessage: string;
  deleteSourceBranch: boolean;
  onStrategyChange: (s: MergeStrategy) => void;
  onMergeMessageChange: (m: string) => void;
  onDeleteSourceBranchChange: (v: boolean) => void;
  onMerge: () => void;
  onCheckout: () => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [protection, setProtection] = useState<BranchProtection | null>(null);
  const [protectionLoading, setProtectionLoading] = useState(false);
  const [autoMergeBusy, setAutoMergeBusy] = useState(false);

  const isActive = detail.state === "open" || detail.state === "draft";
  const isResolved = detail.state === "merged" || detail.state === "closed";
  const isGitHub = detail.provider === "github";
  const strategies = caps?.merge_strategies ?? ["merge", "squash", "rebase"];
  const canAutoMerge = caps ? caps.can_auto_merge : isGitHub;
  const canDeleteSource = caps?.can_delete_source_branch ?? false;

  useEffect(() => {
    if (!isActive || !isGitHub || !detail.target_branch) return;
    setProtectionLoading(true);
    invoke<BranchProtection>("pr_branch_protection", {
      path,
      branch: detail.target_branch,
    })
      .then((p) => setProtection(p))
      .catch(() => setProtection(null))
      .finally(() => setProtectionLoading(false));
  }, [path, detail.target_branch, isActive, isGitHub]);

  async function toggleAutoMerge() {
    if (!detail.node_id) return;
    const enable = !detail.auto_merge_method;
    setAutoMergeBusy(true);
    try {
      await invoke("pr_set_auto_merge", {
        path,
        prNodeId: detail.node_id,
        enable,
        mergeMethod: enable ? strategy : null,
      });
      onReload();
    } catch (e) {
      toastError(String(e));
    } finally {
      setAutoMergeBusy(false);
    }
  }

  const bannerMotion = {
    initial: { opacity: 0, y: -8, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -6, scale: 0.99 },
    transition: { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.6 },
  };

  if (isResolved) {
    const isMerged = detail.state === "merged";
    return (
      <m.div
        {...bannerMotion}
        className={`rounded-xl border p-3.5 shadow-xs backdrop-blur-sm ${
          isMerged
            ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
            : "border-border/80 bg-muted/40 text-muted-foreground"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/50 border border-border/40 shadow-xs">
            {isMerged ? <GitMerge className="h-4 w-4 text-purple-400" /> : <AlertCircle className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-foreground">
              {isMerged ? t("prInspect.mergedBannerTitle") : t("prInspect.closedBannerTitle")}
            </div>
            <div className="mt-0.5 text-[11px] opacity-80 text-muted-foreground">
              {t("prInspect.branchMaybeDeleteHint", { branch: detail.source_branch })}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] rounded-lg shadow-xs"
            onClick={onCheckout}
            disabled={busy !== null}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("prInspect.checkoutVerb")}
          </Button>
        </div>
      </m.div>
    );
  }

  if (!isActive) return null;

  if (detail.state === "draft" || detail.is_draft) {
    return (
      <m.div
        {...bannerMotion}
        className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-amber-300 shadow-xs backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/30">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-amber-200">
                {t("prInspect.draftBlockedTitle")}
              </div>
              <div className="mt-0.5 text-[11px] text-amber-300/80">
                {t("prInspect.draftBlockedSubtitle")}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-lg border-amber-500/40 bg-amber-500/15 text-[11px] font-medium text-amber-200 hover:bg-amber-500/25"
            onClick={onCheckout}
            disabled={busy !== null}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("prInspect.checkoutVerb")}
          </Button>
        </div>
      </m.div>
    );
  }

  if (detail.mergeable === false) {
    return (
      <m.div
        {...bannerMotion}
        className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-rose-300 shadow-xs backdrop-blur-sm"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/20 border border-rose-500/30">
            <AlertCircle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-rose-200">
              {t("prInspect.mergeConflictLead")}{" "}
              <code className="rounded bg-background/50 px-1.5 py-0.5 font-mono text-rose-300">
                {detail.target_branch}
              </code>
            </div>
            <div className="mt-0.5 text-[11px] text-rose-300/80">
              {t("prInspect.mergeConflictResolveHint", { branch: detail.target_branch })}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-lg border-rose-500/40 bg-rose-500/15 text-[11px] font-medium text-rose-200 hover:bg-rose-500/25"
            onClick={onCheckout}
            disabled={busy !== null}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("prInspect.checkoutVerb")}
          </Button>
        </div>
      </m.div>
    );
  }

  if (detail.mergeable === true) {
    return (
      <m.div
        {...bannerMotion}
        className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 p-4 shadow-xs backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30 shadow-2xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-emerald-200">
                {t("prInspect.mergeReadyTitle")}
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-300/80">
                {t("pr.noConflicts", { branch: detail.target_branch })}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-[11px]"
            onClick={onCheckout}
            disabled={busy !== null}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {busy === "checkout" ? t("prInspect.checkoutBusy") : t("prInspect.checkoutVerb")}
          </Button>
        </div>

        {!protectionLoading && protection && protection.required_status_checks.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("prInspect.requiredChecks")}
            </div>
            <div className="flex flex-wrap gap-1">
              {protection.required_status_checks.map((ctx) => (
                <span
                  key={ctx}
                  className="rounded-md border border-emerald-500/20 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
                >
                  {ctx}
                </span>
              ))}
            </div>
            {protection.required_approving_review_count != null &&
              protection.required_approving_review_count > 0 && (
                <div className="text-[10px] text-emerald-300/90 font-medium">
                  {t("prInspect.requiredApprovals", {
                    count: protection.required_approving_review_count,
                  })}
                </div>
              )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-500/20">
          <Select
            value={strategy}
            onValueChange={(value) => onStrategyChange(value as MergeStrategy)}
          >
            <SelectTrigger size="sm" className="w-36 h-8 text-[11px] rounded-lg border-border/80 bg-background/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {strategies.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(MERGE_STRATEGY_LABEL_KEYS[s])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={mergeMessage}
            onChange={(e) => onMergeMessageChange(e.target.value)}
            placeholder={t("prInspect.mergePlaceholder")}
            className="h-8 min-w-[180px] flex-1 text-[11px] rounded-lg border-border/80 bg-background/80"
          />

          <Button
            size="sm"
            className="h-8 shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium shadow-xs"
            onClick={onMerge}
            disabled={busy !== null}
          >
            <GitMerge className="mr-1.5 h-3.5 w-3.5" />
            {busy === "merge" ? t("prInspect.mergeBusy") : t("prInspect.mergeVerb")}
          </Button>
        </div>

        {canDeleteSource && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <Checkbox
              checked={deleteSourceBranch}
              onCheckedChange={(v) => onDeleteSourceBranchChange(v === true)}
            />
            <span>{t("prInspect.deleteSourceBranch", { branch: detail.source_branch })}</span>
          </label>
        )}

        {canAutoMerge && detail.node_id && (
          <div className="flex items-center justify-between gap-2 border-t border-emerald-500/20 pt-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              {detail.auto_merge_method ? (
                <span className="text-emerald-300 font-medium">
                  {t("prInspect.autoMergeEnabled", {
                    method: detail.auto_merge_method,
                  })}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("prInspect.autoMergeHint")}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[10px] rounded-md"
              disabled={autoMergeBusy || busy !== null}
              onClick={() => void toggleAutoMerge()}
            >
              {autoMergeBusy ? (
                <SpinIcon icon={RotateCcw} className="mr-1 h-3 w-3" />
              ) : (
                <Zap className="mr-1 h-3 w-3" />
              )}
              {detail.auto_merge_method
                ? t("prInspect.autoMergeDisable")
                : t("prInspect.autoMergeEnable")}
            </Button>
          </div>
        )}
      </m.div>
    );
  }

  return (
    <m.div
      {...bannerMotion}
      className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-3.5 py-2.5 text-[11px] text-muted-foreground shadow-xs"
    >
      <SpinIcon icon={Loader2} className="h-4 w-4 text-primary" />
      <span>{t("prInspect.checksMergeability")}</span>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-7 text-[10px] rounded-md"
        onClick={onCheckout}
        disabled={busy !== null}
      >
        <Download className="mr-1 h-3 w-3" />
        {t("prInspect.checkoutVerb")}
      </Button>
    </m.div>
  );
}
