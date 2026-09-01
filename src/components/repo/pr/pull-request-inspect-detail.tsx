import { SpinIcon } from "@/components/motion/kit";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { formatDate, formatRelative } from "@/lib/format";
import { pickMergeStrategy } from "@/lib/pr-provider";
import { usePrCapabilities } from "@/lib/pr-provider-store";
import type { PullRequest } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import {
  ExternalLink,
  FileCode2,
  GitCommit,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PrAuthorPopover } from "./pr-author-popover";
import { PrBranchRoute } from "./pr-branch-route";
import { PrConversationWithDescription } from "./pr-conversation-with-description";
import { PrLabelChip } from "./pr-label-chip";
import { PrMergeBanner, type MergeStrategy } from "./pr-merge-banner";
import { PrReviewActions } from "./pr-review-actions";
import { PrReviewersPopover } from "./pr-reviewers-popover";
import { PrStatsBar } from "./pr-stats-bar";
import { PrStatusPill } from "./pr-status-pill";
import { PullRequestChecksTab } from "./pull-request-checks-tab";
import { PullRequestCommitsTab } from "./pull-request-commits-tab";
import { PullRequestFilesTab } from "./pull-request-files-tab";
import { PullRequestReviewDraftsBar } from "./pull-request-review-drafts-bar";

export type PullRequestDetail = PullRequest & {
  body_markdown: string;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
  head_sha: string;
  auto_merge_method?: string | null;
};

type Tab = "conversation" | "commits" | "files" | "checks";

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

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = useMemo(
    () => [
      { id: "conversation", label: t("prInspect.tabConversation"), icon: MessageSquare },
      { id: "commits", label: t("prInspect.tabCommits"), icon: GitCommit },
      { id: "files", label: t("prInspect.tabFiles"), icon: FileCode2 },
      { id: "checks", label: t("prInspect.tabChecks"), icon: ShieldCheck },
    ],
    [t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/95 backdrop-blur-md">
      <div className="flex-shrink-0 border-b border-border/70 bg-muted/15 px-4 py-3">
        <div className="flex items-center gap-2">
          {detail ? (
            <PrStatusPill state={detail.state} isDraft={detail.is_draft} />
          ) : (
            <m.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="h-5 w-16 rounded-full bg-muted"
            />
          )}

          <span className="font-mono text-[12px] font-semibold text-muted-foreground/80">
            #{number}
          </span>

          {detail && (
            <PrBranchRoute
              head={detail.source_branch}
              base={detail.target_branch}
            />
          )}

          <span className="flex-1" />

          {detail?.html_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => window.open(detail.html_url, "_blank", "noopener,noreferrer")}
              title={t("prInspect.openBrowser")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={load}
            disabled={loading}
            title={t("pr.reloadTitle")}
          >
            <SpinIcon icon={RefreshCw} active={loading} className={`h-3.5 w-3.5 ${loading ? "text-primary" : ""}`} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title={t("pr.closeAria")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <m.h1
            key={detail?.title ?? "skeleton"}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="mt-2.5 text-[16px] font-bold leading-tight tracking-tight text-foreground select-text"
          >
            {detail?.title ?? (
              <m.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="inline-block h-5 w-64 rounded bg-muted"
              />
            )}
          </m.h1>
        </AnimatePresence>

        {detail && (
          <m.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
          >
            <PrAuthorPopover
              author={detail.author}
              authorAvatar={detail.author_avatar}
              createdAt={detail.created_at}
            />

            <span>{t("prInspect.openedPR")}</span>
            <time title={formatDate(detail.created_at)} className="font-mono">
              {formatRelative(detail.created_at)}
            </time>

            <span className="opacity-40">·</span>
            <PrReviewersPopover reviewers={detail.reviewers} />

            {detail.labels.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="flex flex-wrap gap-1">
                  {detail.labels.map((l) => (
                    <PrLabelChip key={l} label={l} />
                  ))}
                </span>
              </>
            )}

            <span className="ml-auto">
              <PrStatsBar detail={detail} />
            </span>
          </m.div>
        )}

        <LayoutGroup id="pr-detail-tabs">
          <nav className="mt-3.5 flex items-center gap-1 border-t border-border/40 pt-2">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTab(id)}
                  className={[
                    "relative h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors",
                    active
                      ? "text-primary hover:text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {active && (
                    <m.span
                      layoutId="pr-detail-tab-pill"
                      className="absolute inset-0 rounded-lg bg-primary/10"
                      transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.6 }}
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5" />
                  <span className="relative z-10">{label}</span>
                  {active && (
                    <m.span
                      layoutId="pr-detail-tab-underline"
                      className="absolute -bottom-2 left-2 right-2 h-0.5 rounded-full bg-primary shadow-xs"
                      transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.6 }}
                    />
                  )}
                </Button>
              );
            })}
          </nav>
        </LayoutGroup>
      </div>

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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 pt-3">
            <AnimatePresence mode="wait" initial={false}>
              <PrMergeBanner
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

            <PrReviewActions
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
                <PrConversationWithDescription
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
      )}
    </div>
  );
}
