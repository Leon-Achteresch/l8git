import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError } from "@/lib/error-toast";
import { formatDate, formatRelative } from "@/lib/format";
import { pickMergeStrategy, type ProviderCapabilities } from "@/lib/pr-provider";
import { usePrCapabilities } from "@/lib/pr-provider-store";
import type { PrReviewer, PullRequest } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, CheckCheck, CheckCircle2, Download, ExternalLink, GitMerge, Loader2, RefreshCw, RotateCcw, ShieldCheck, ThumbsDown, X, Zap } from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PullRequestCommitsTab } from "./pull-request-commits-tab";
import { PullRequestFilesTab } from "./pull-request-files-tab";
import { PullRequestConversationTab } from "./pull-request-conversation-tab";
import { PullRequestChecksTab } from "./pull-request-checks-tab";
import { PullRequestReviewDraftsBar } from "./pull-request-review-drafts-bar";
import { SpinIcon, pulseKeyframes, pulseTransition } from "@/components/motion/kit";

export type PullRequestDetail = PullRequest & {
  body_markdown: string;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
  head_sha: string;
  auto_merge_method?: string | null;
};

type MergeStrategy = "merge" | "squash" | "rebase";
type Tab = "conversation" | "commits" | "files" | "checks";

const MERGE_STRATEGY_LABEL_KEYS: Record<MergeStrategy, string> = {
  squash: "prInspect.strategySquashOpt",
  rebase: "prInspect.strategyRebaseOpt",
  merge: "prInspect.strategyMergeOpt",
};

type BranchProtection = {
  required_status_checks: string[];
  required_approving_review_count: number | null;
  dismiss_stale_reviews: boolean;
  require_code_owner_reviews: boolean;
  enforce_admins: boolean;
  allow_force_pushes: boolean;
  allow_deletions: boolean;
};

/* ─── Status pill ─────────────────────────────────────────────────────────── */

const STATUS_PILL_STYLES: Record<string, { bg: string; dot: string }> = {
  open:   { bg: "bg-git-added/15 text-git-added border-git-added/30",   dot: "bg-git-added" },
  draft:  { bg: "bg-muted/50 text-muted-foreground border-border",                                              dot: "bg-muted-foreground" },
  merged: { bg: "bg-git-merge/15 text-git-merge border-git-merge/30",    dot: "bg-git-merge" },
  closed: { bg: "bg-git-removed/15 text-git-removed border-git-removed/30",       dot: "bg-git-removed" },
};

function StatusPill({ state, isDraft }: { state: string; isDraft: boolean }) {
  const { t } = useTranslation();
  const key = state === "open" && isDraft ? "draft" : state;
  const pill = STATUS_PILL_STYLES[key] ?? STATUS_PILL_STYLES["open"];
  const labelKeys: Record<string, string> = {
    open: "prInspect.pillOpen",
    draft: "prInspect.pillDraft",
    merged: "prInspect.pillMerged",
    closed: "prInspect.pillClosed",
  };
  const lk = labelKeys[key] ?? "prInspect.pillOpen";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${pill.bg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
      {t(lk)}
      {isDraft && state === "open" ? t("prInspect.pillDraftSuffix") : ""}
    </span>
  );
}

/* ─── Branch route ────────────────────────────────────────────────────────── */

function BranchRoute({ head, base }: { head: string; base: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">{head}</span>
      <svg width="16" height="11" viewBox="0 0 18 12" fill="none" className="text-muted-foreground/40">
        <path d="M0 2 Q 9 2 9 6 Q 9 10 18 10" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
      <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">{base}</span>
    </span>
  );
}

/* ─── Label chip ──────────────────────────────────────────────────────────── */

type LabelTone = React.ComponentProps<typeof Badge>["variant"];

const LABEL_TONES: Record<string, LabelTone> = {
  merge:    "destructive",
  editor:   "info",
  breaking: "destructive",
  bug:      "destructive",
  refactor: "info",
  dx:       "success",
  ui:       "info",
  feature:  "success",
  fix:      "warning",
};

function LabelChip({ label }: { label: string }) {
  return (
    <Badge variant={LABEL_TONES[label.toLowerCase()] ?? "secondary"}>
      {label}
    </Badge>
  );
}

/* ─── Header people ──────────────────────────────────────────────────────── */

function AuthorChip({ detail }: { detail: PullRequestDetail }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CommitAvatar url={detail.author_avatar} name={detail.author} size="xs" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3">
        <div className="flex items-center gap-2">
          <CommitAvatar url={detail.author_avatar} name={detail.author} size="md" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{detail.author}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("prInspect.openedPR")} {formatRelative(detail.created_at)}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReviewersChip({ reviewers }: { reviewers: PrReviewer[] }) {
  const { t } = useTranslation();
  const shown = reviewers.slice(0, 3);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={t("prInspect.reviewerTitle")}
        >
          {shown.length === 0 ? (
            <span className="inline-flex h-5 items-center rounded-full border border-dashed px-2 text-[10px] text-muted-foreground">
              {t("prInspect.reviewerTitle")}
            </span>
          ) : (
            shown.map((r, i) => (
              <span
                key={r.login}
                className="rounded-full ring-1 ring-background"
                style={{ marginLeft: i === 0 ? 0 : "-7px", zIndex: shown.length - i }}
              >
                <CommitAvatar url={r.avatar} name={r.login} size="xs" />
              </span>
            ))
          )}
          {reviewers.length > shown.length && (
            <span className="ml-1 text-[10px] text-muted-foreground">
              +{reviewers.length - shown.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("prInspect.reviewerTitle")}
          </span>
          <span className="text-[11px] text-muted-foreground">{t("prInspect.requestReview")}</span>
        </div>
        {reviewers.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">{t("prInspect.reviewerEmpty")}</span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {reviewers.map((r) => (
              <li key={r.login} className="flex items-center gap-2">
                <CommitAvatar url={r.avatar} name={r.login} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[12px]">{r.login}</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Merge state banner ──────────────────────────────────────────────────── */

function MergeStateBanner({
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

  // Load branch protection once when the banner first shows for an open PR.
  useEffect(() => {
    if (!isActive || !isGitHub || !detail.target_branch) return;
    setProtectionLoading(true);
    invoke<BranchProtection>("pr_branch_protection", {
      path,
      branch: detail.target_branch,
    })
      .then((p) => setProtection(p))
      .catch(() => setProtection(null)) // 404 = no rules; silently hide
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
    initial: { opacity: 0, y: -6, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit:    { opacity: 0, y: -4, scale: 0.98 },
    transition: { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.6 },
  };

  if (isResolved) {
    const isMerged = detail.state === "merged";
    return (
      <m.div
        {...bannerMotion}
        className={`rounded-md border p-3 ${
          isMerged
            ? "border-git-merge/30 bg-git-merge/12 text-git-merge"
            : "border-border bg-muted/30 text-muted-foreground"
        }`}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-lg leading-none">{isMerged ? "⮣" : "✕"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              {isMerged ? t("prInspect.mergedBannerTitle") : t("prInspect.closedBannerTitle")}
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">
              {t("prInspect.branchMaybeDeleteHint", { branch: detail.source_branch })}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onCheckout} disabled={busy !== null}>
            <Download className="mr-1 h-3 w-3" />
            {t("prInspect.checkoutVerb")}
          </Button>
        </div>
      </m.div>
    );
  }

  if (!isActive) return null;

  if (detail.state === "draft" || detail.is_draft) {
    return (
      <m.div {...bannerMotion} className="rounded-md border border-git-modified/15 bg-git-modified/15 p-3 text-git-modified">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">{t("prInspect.draftBlockedTitle")}</div>
            <div className="mt-0.5 text-[11px] opacity-80">
              {t("prInspect.draftBlockedSubtitle")}
            </div>
          </div>
          <Button size="sm" className="h-7 shrink-0 text-[11px]">
            {t("prInspect.readyForReview")}
          </Button>
        </div>
      </m.div>
    );
  }

  if (detail.mergeable === false) {
    return (
      <m.div {...bannerMotion} className="rounded-md border border-git-removed/30 bg-git-removed/12 p-3 text-git-removed">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              {t("prInspect.mergeConflictLead")}{" "}
              <code className="rounded bg-black/10 px-1 font-mono">{detail.target_branch}</code>
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">
              {t("prInspect.mergeConflictResolveHint", { branch: detail.target_branch })}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onCheckout} disabled={busy !== null}>
              <Download className="mr-1 h-3 w-3" />
              {t("prInspect.checkoutVerb")}
            </Button>
          </div>
        </div>
      </m.div>
    );
  }

  if (detail.mergeable === true) {
    return (
      <m.div {...bannerMotion} className="flex flex-col gap-2.5 rounded-md border border-git-added/30 bg-git-added/12 p-3 text-git-added">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{t("prInspect.mergeReadyTitle")}</div>
            <div className="mt-0.5 text-[11px] opacity-80">
              {t("pr.noConflicts", { branch: detail.target_branch })}
            </div>
          </div>
        </div>

        {/* Required status checks */}
        {!protectionLoading && protection && protection.required_status_checks.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-git-added/50 bg-git-added/8 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-git-added">
              <ShieldCheck className="h-3 w-3" />
              {t("prInspect.requiredChecks")}
            </div>
            <div className="flex flex-wrap gap-1">
              {protection.required_status_checks.map((ctx) => (
                <span
                  key={ctx}
                  className="rounded bg-git-added/15 px-1.5 py-0 font-mono text-[10px] text-git-added"
                >
                  {ctx}
                </span>
              ))}
            </div>
            {protection.required_approving_review_count != null &&
              protection.required_approving_review_count > 0 && (
                <div className="text-[10px] text-git-added">
                  {t("prInspect.requiredApprovals", {
                    count: protection.required_approving_review_count,
                  })}
                </div>
              )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Select
            value={strategy}
            onValueChange={(value) => onStrategyChange(value as MergeStrategy)}
          >
            <SelectTrigger size="sm" className="w-32 text-[11px]">
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
            className="h-7 min-w-0 flex-1 text-[11px]"
          />
          <Button size="sm" className="h-7 shrink-0 text-[11px]" onClick={onMerge} disabled={busy !== null}>
            <GitMerge className="mr-1 h-3 w-3" />
            {busy === "merge" ? t("prInspect.mergeBusy") : t("prInspect.mergeVerb")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onCheckout} disabled={busy !== null}>
            <Download className="mr-1 h-3 w-3" />
            {busy === "checkout" ? t("prInspect.checkoutBusy") : t("prInspect.checkoutVerb")}
          </Button>
        </div>

        {canDeleteSource && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox
              checked={deleteSourceBranch}
              onCheckedChange={(v) => onDeleteSourceBranchChange(v === true)}
            />
            {t("prInspect.deleteSourceBranch", { branch: detail.source_branch })}
          </label>
        )}

        {canAutoMerge && detail.node_id && (
          <div className="flex items-center gap-2 border-t border-git-added/30 pt-2">
            {detail.auto_merge_method ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t("prInspect.autoMergeEnabled", {
                    method: detail.auto_merge_method,
                  })}
                </span>
              </div>
            ) : (
              <span className="min-w-0 flex-1 text-[11px] text-git-added">
                {t("prInspect.autoMergeHint")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-6 shrink-0 text-[10px]"
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

  // mergeable === null (unknown)
  return (
    <m.div {...bannerMotion} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
      <SpinIcon icon={Loader2} className="h-3.5 w-3.5" />
      {t("prInspect.checksMergeability")}
      <Button variant="outline" size="sm" className="ml-auto h-6 text-[10px]" onClick={onCheckout} disabled={busy !== null}>
        <Download className="mr-1 h-3 w-3" />
        {t("prInspect.checkoutVerb")}
      </Button>
    </m.div>
  );
}

function ReviewActions({
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
    <div className="mt-2 flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px]"
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
          className="h-7 text-[11px]"
          disabled={busy !== null}
          onClick={() => void submit("REQUEST_CHANGES")}
        >
          <ThumbsDown className="mr-1 h-3 w-3" />
          {t("prInspect.requestChangesVerb")}
        </Button>
      )}
      <span className="text-[10px] text-muted-foreground">
        {t("prInspect.providerHint", { label: caps.label, host: caps.host })}
      </span>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export function PullRequestInspectDetail({
  path,
  number,
  onClose,
  onMutated,
}: {
  path: string;
  number: number;
  onClose: () => void;
  onMutated: () => void;
}) {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("conversation");
  const [strategy, setStrategy] = useState<MergeStrategy>("squash");
  const [mergeMessage, setMergeMessage] = useState("");
  const [deleteSourceBranch, setDeleteSourceBranch] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { t } = useTranslation();
  const caps = usePrCapabilities(path);
  const effectiveStrategy = caps
    ? pickMergeStrategy(strategy, caps.merge_strategies)
    : strategy;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await invoke<PullRequestDetail>("pr_detail", { path, number });
      setDetail(d);
    } catch (e) {
      toastError(String(e));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [path, number]);

  useEffect(() => {
    setDetail(null);
    setTab("conversation");
    void load();
  }, [load]);

  async function doMerge() {
    if (
      !window.confirm(
        t("prInspect.mergeConfirm", {
          number: String(number),
          strategy: effectiveStrategy,
        }),
      )
    )
      return;
    setBusy("merge");
    try {
      await invoke("pr_merge", {
        path,
        number,
        strategy: effectiveStrategy,
        message: mergeMessage.trim() ? mergeMessage.trim() : null,
        deleteSourceBranch,
      });
      onMutated();
      void load();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doCheckout() {
    setBusy("checkout");
    try {
      const res = await invoke<{ branch: string }>("pr_checkout", { path, number });
      onMutated();
      window.alert(t("prInspect.checkoutAlert", { branch: res.branch }));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const TABS: { id: Tab; label: string }[] = useMemo(
    () => [
      { id: "conversation", label: t("prInspect.tabConversation") },
      { id: "commits", label: t("prInspect.tabCommits") },
      { id: "files", label: t("prInspect.tabFiles") },
      { id: "checks", label: t("prInspect.tabChecks") },
    ],
    [t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b px-4 py-3">
        {/* Top row */}
        <div className="flex items-center gap-2">
          {detail ? (
            <StatusPill state={detail.state} isDraft={detail.is_draft} />
          ) : (
            <m.span animate={pulseKeyframes} transition={pulseTransition} className="h-5 w-14 rounded bg-muted" />
          )}
          <span className="font-mono text-[12px] text-muted-foreground">
            #{number}
          </span>
          {detail && (
            <BranchRoute
              head={detail.source_branch}
              base={detail.target_branch}
            />
          )}
          {detail?.head_sha && (
            <code className="font-mono text-[11px] text-muted-foreground">
              {detail.head_sha.slice(0, 7)}
            </code>
          )}
          <span className="flex-1" />
          {detail?.html_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => window.open(detail.html_url, "_blank", "noopener,noreferrer")}
              title={t("prInspect.openBrowser")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={load}
            disabled={loading}
            title={t("pr.reloadTitle")}
          >
            <SpinIcon icon={RefreshCw} active={loading} className={`h-3.5 w-3.5 ${loading ? "text-primary" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title={t("pr.closeAria")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Title */}
        <AnimatePresence mode="wait" initial={false}>
          <m.h1
            key={detail?.title ?? "skeleton"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.04 }}
            className="mt-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground"
          >
            {detail?.title ?? (
              <m.span animate={pulseKeyframes} transition={pulseTransition} className="inline-block h-5 w-64 rounded bg-muted" />
            )}
          </m.h1>
        </AnimatePresence>

        {/* Byline */}
        {detail && (
          <m.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.08 }}
            className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <AuthorChip detail={detail} />
            <span className="font-medium text-foreground">{detail.author}</span>
            <span>{t("prInspect.openedPR")}</span>
            <time title={formatDate(detail.created_at)}>
              {formatRelative(detail.created_at)}
            </time>
            <span className="opacity-40">·</span>
            <ReviewersChip reviewers={detail.reviewers} />
            {detail.labels.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="flex flex-wrap gap-1">
                  {detail.labels.map((l) => <LabelChip key={l} label={l} />)}
                </span>
              </>
            )}
          </m.div>
        )}

        {/* Tab nav — animated underline indicator */}
        <LayoutGroup id="pr-detail-tabs">
          <nav className="mt-3 flex items-center gap-0">
            {TABS.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTab(id)}
                className={[
                  "relative h-auto items-center gap-1.5 rounded-none px-3 pb-2 pt-0.5 text-[12px] font-medium transition-colors",
                  tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
                {tab === id && (
                  <m.span
                    layoutId="pr-detail-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 480, damping: 36, mass: 0.6 }}
                  />
                )}
              </Button>
            ))}
          </nav>
        </LayoutGroup>
      </div>

      {/* ── Body ── */}
      {loading && !detail ? (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-1 items-center justify-center"
        >
          <SpinIcon icon={Loader2} className="h-6 w-6 text-primary/50" />
        </m.div>
      ) : !detail ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("pr.noData")}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Main */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {/* Merge state banner — keyed so it animates when state changes */}
            <div className="flex-shrink-0 px-4 pt-3">
              <AnimatePresence mode="wait" initial={false}>
                <MergeStateBanner
                  key={`${detail.state}-${String(detail.mergeable)}-${String(detail.is_draft)}`}
                  path={path}
                  detail={detail}
                  caps={caps}
                  busy={busy}
                  strategy={effectiveStrategy}
                  mergeMessage={mergeMessage}
                  deleteSourceBranch={deleteSourceBranch}
                  onStrategyChange={setStrategy}
                  onMergeMessageChange={setMergeMessage}
                  onDeleteSourceBranchChange={setDeleteSourceBranch}
                  onMerge={doMerge}
                  onCheckout={doCheckout}
                  onReload={load}
                />
              </AnimatePresence>
              <ReviewActions
                path={path}
                detail={detail}
                caps={caps}
                onReviewed={() => void load()}
              />
              <PullRequestReviewDraftsBar
                path={path}
                number={number}
                caps={caps}
                onSubmitted={() => void load()}
              />
            </div>

            {/* Tab content — crossfade on switch */}
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="min-h-0 flex-1 overflow-hidden"
              >
                {tab === "conversation" && (
                  <PullRequestConversationWithDescription
                    path={path}
                    number={number}
                    detail={detail}
                    onCommented={() => void load()}
                  />
                )}
                {tab === "commits" && (
                  <PullRequestCommitsTab path={path} number={number} />
                )}
                {tab === "files" && (
                  <PullRequestFilesTab
                    path={path}
                    number={number}
                    baseRef={detail.target_branch}
                    headRef={detail.source_branch}
                  />
                )}
                {tab === "checks" && (
                  <PullRequestChecksTab path={path} number={number} />
                )}
              </m.div>
            </AnimatePresence>
          </div>

        </div>
      )}
    </div>
  );
}

/* ─── Conversation tab with description at top ────────────────────────────── */

function PullRequestConversationWithDescription({
  path,
  number,
  detail,
  onCommented,
}: {
  path: string;
  number: number;
  detail: PullRequestDetail;
  onCommented: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {detail.body_markdown.trim() && (
        <div className="flex-shrink-0 border-b px-4 py-3">
          <div className="rounded border bg-muted/10 px-3 py-2.5 text-[13px] leading-relaxed [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0 [&_code]:text-[0.85em] [&_p+p]:mt-2 [&_p]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:bg-muted/70 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {detail.body_markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
      <PullRequestConversationTab
        path={path}
        number={number}
        onCommented={onCommented}
      />
    </div>
  );
}
