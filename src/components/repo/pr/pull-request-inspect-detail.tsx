import { SpinIcon } from "@/components/motion/kit";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { formatDate, formatRelative } from "@/lib/format";
import { pickMergeStrategy } from "@/lib/pr-provider";
import { usePrCapabilities } from "@/lib/pr-provider-store";
import type { PullRequest } from "@/lib/repo-store";
import { isHubPath } from "@/lib/hub/store";
import type { T3PrInfo } from "@/lib/t3-code";
import { invoke } from "@tauri-apps/api/core";
import {
  ExternalLink,
  FileCode2,
  NotebookPen,
  BookOpen,
  GitCommit,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

const ReviewNarrativePanel = lazy(() =>
  import("../change-workflow/review-narrative-panel").then((m) => ({ default: m.ReviewNarrativePanel })),
);
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
import { PrT3Menu, PrT3Provider } from "./pr-t3-menu";
import { PullRequestChecksTab } from "./pull-request-checks-tab";
import { PullRequestCommitsTab } from "./pull-request-commits-tab";
import { PullRequestFilesTab } from "./pull-request-files-tab";
import { PullRequestReviewDraftsBar } from "./pull-request-review-drafts-bar";
import { PrGithubManage } from "../github/pr-github-manage";
import { PrMergeReadiness } from "../github/pr-merge-readiness";
import { usePrGithub } from "@/lib/github-ui/use-pr-github";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { useSubjectKey } from "@/lib/github-ui/review-memory";
import { useGithubWorkspace } from "@/lib/github-expansion/store";
import { PrPersonalTab } from "../github/pr-personal-tab";
import { PrLinkedIssues } from "../github/pr-linked-issues";
import { PrReviewWorktree } from "../github/pr-review-worktree";

export type PullRequestDetail = PullRequest & {
  body_markdown: string;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
  head_sha: string;
  auto_merge_method?: string | null;
};

type Tab = "conversation" | "commits" | "files" | "checks" | "story" | "mine";

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
  const [tab, setTab] = useState<Tab>("conversation");
  const [strategy, setStrategy] = useState<MergeStrategy>("squash");
  const [mergeMessage, setMergeMessage] = useState("");
  const [deleteSourceBranch, setDeleteSourceBranch] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { t } = useTranslation();
  const caps = usePrCapabilities(path);
  // `pr_detail` is routed by the repo's current origin, so the detail is tagged with the resolved
  // remote identity too: origin A→B renders/acts on nothing of A's, even before effects run.
  // Unresolved remotes (re-read after an edit) load nothing; non-GitHub misses keep a stable key.
  const [loaded, setLoaded] = useState<{ key: string; detail: PullRequestDetail } | null>(null);
  // Same shared remote snapshot `usePrGithub` resolves in this render, so detail and `gh` never mix scopes.
  const res = useGithubTarget(path);
  const remote = isTarget(res) ? `${res.account.login}@${res.account.host}/${res.fullName}` : res.reason === "loading" ? null : res.reason;
  const detailKey = remote ? `${path}#${number}@${remote}` : null;
  const detail = loaded && loaded.key === detailKey ? loaded.detail : null;
  const gh = usePrGithub(path, number, detail?.updated_at);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const loading = !detailKey || loadingKey === detailKey;
  const subjectKey = useSubjectKey(path, "pull", number);
  const updateSubject = useGithubWorkspace((s) => s.updateSubject);
  const effectiveStrategy = caps
    ? pickMergeStrategy(strategy, caps.merge_strategies)
    : strategy;

  const liveKey = useRef(detailKey);
  const gen = useRef(0);
  const load = useCallback(async () => {
    const key = detailKey;
    // A load captured by an older render (stale callback) must not touch the live scope.
    if (!key || liveKey.current !== key) return;
    // Only the newest read writes: also covers A→B→A, where a late first-A read shares the key.
    const my = ++gen.current;
    const live = () => gen.current === my && liveKey.current === key;
    setLoadingKey(key);
    try {
      const d = await invoke<PullRequestDetail>("pr_detail", { path, number });
      if (live()) setLoaded({ key, detail: d });
    } catch (e) {
      if (!live()) return;
      toastError(String(e));
      setLoaded(null);
    } finally {
      if (live()) setLoadingKey(null);
    }
  }, [detailKey, path, number]);

  useEffect(() => {
    liveKey.current = detailKey;
    gen.current++; // drop any in-flight read for the previous scope
    setLoaded(null);
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
      { id: "story", label: t("mine.storyTab"), icon: BookOpen },
      { id: "mine", label: t("mine.tab"), icon: NotebookPen },
    ],
    [t],
  );

  const t3Pr = useMemo<T3PrInfo | null>(
    () =>
      detail?.html_url
        ? { prUrl: detail.html_url, number, title: detail.title, branch: detail.source_branch, base: detail.target_branch }
        : null,
    [detail, number],
  );

  return (
    <PrT3Provider key={`${path}#${number}`} pr={t3Pr}>
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

          <span className="font-mono text-[0.75rem] font-semibold text-muted-foreground/80">
            #{number}
          </span>

          {detail && (
            <PrBranchRoute
              head={detail.source_branch}
              base={detail.target_branch}
            />
          )}

          <span className="flex-1" />

          <PrT3Menu className="h-7 gap-1 rounded-lg px-2 text-[0.6875rem] text-muted-foreground hover:text-foreground" />

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
          <m.h1 layout
            key={detail?.title ?? "skeleton"}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="mt-2.5 text-[1rem] font-bold leading-tight tracking-tight text-foreground select-text"
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
            className="mt-2 flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted-foreground"
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

        {detail && !isHubPath(path) && detail.state.toLowerCase() === "open" && (
          <PrReviewWorktree path={path} number={number} headBranch={detail.source_branch} headSha={detail.head_sha} />
        )}
        {detail && gh.target && <PrLinkedIssues target={gh.target} number={number} refreshKey={detail.updated_at} />}

        {detail && (
          <PrGithubManage
            path={path}
            number={number}
            detail={detail}
            gh={gh}
            onChanged={() => {
              onMutated();
              void load();
            }}
          />
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
                    "relative h-8 items-center gap-1.5 rounded-lg px-3 text-[0.75rem] font-semibold transition-colors",
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
            <PrMergeReadiness
              gh={gh}
              open={detail.state.toLowerCase() === "open"}
              onChanged={() => {
                onMutated();
                void load();
              }}
            />
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
                onCheckout={isHubPath(path) ? undefined : doCheckout}
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
              headSha={detail.head_sha}
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
                  headSha={detail.head_sha}
                  baseSha={gh.meta?.headRefOid === detail.head_sha ? gh.meta.baseRefOid : undefined}
                />
              )}
              {tab === "checks" && (
                <PullRequestChecksTab path={path} number={number} />
              )}
              {tab === "story" && (
                <Suspense fallback={null}>
                  {gh.meta?.headRefOid === detail.head_sha ? (
                    <ReviewNarrativePanel path={path} number={number} baseSha={gh.meta.baseRefOid} headSha={detail.head_sha} />
                  ) : (
                    <div className="p-4 text-xs text-muted-foreground">{t("mine.storyNeedsPins")}</div>
                  )}
                </Suspense>
              )}
              {tab === "mine" && (
                <PrPersonalTab
                  path={path}
                  number={number}
                  onOpenFile={(file) => {
                    updateSubject(subjectKey, { position: { file } });
                    setTab("files");
                  }}
                />
              )}
            </m.div>
          </AnimatePresence>
        </div>
      )}
    </div>
    </PrT3Provider>
  );
}
