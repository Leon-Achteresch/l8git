import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { formatDate, formatRelative } from "@/lib/format";
import type { PrReviewer, PullRequest } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, CheckCircle2, Download, ExternalLink, GitMerge, Loader2, PanelRightClose, PanelRightOpen, RefreshCw, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PullRequestCommitsTab } from "./pull-request-commits-tab";
import { PullRequestFilesTab } from "./pull-request-files-tab";
import { PullRequestConversationTab } from "./pull-request-conversation-tab";
import { PullRequestChecksTab } from "./pull-request-checks-tab";

export type PullRequestDetail = PullRequest & {
  body_markdown: string;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
  head_sha: string;
};

type MergeStrategy = "merge" | "squash" | "rebase";
type Tab = "conversation" | "commits" | "files" | "checks";

/* ─── Status pill ─────────────────────────────────────────────────────────── */

const STATUS_PILL: Record<string, { label: string; bg: string; dot: string }> = {
  open:   { label: "Offen",       bg: "bg-[oklch(0.93_0.06_145/0.15)] text-[oklch(0.36_0.13_145)] border-[oklch(0.85_0.08_145)]",   dot: "bg-[oklch(0.55_0.15_145)]" },
  draft:  { label: "Entwurf",     bg: "bg-muted/50 text-muted-foreground border-border",                                              dot: "bg-muted-foreground" },
  merged: { label: "Gemergt",     bg: "bg-[oklch(0.93_0.06_290/0.15)] text-[oklch(0.4_0.14_290)] border-[oklch(0.85_0.08_290)]",    dot: "bg-[oklch(0.55_0.14_290)]" },
  closed: { label: "Geschlossen", bg: "bg-[oklch(0.93_0.05_25/0.15)] text-[oklch(0.4_0.14_25)] border-[oklch(0.85_0.08_25)]",       dot: "bg-[oklch(0.6_0.16_25)]" },
};

function StatusPill({ state, isDraft }: { state: string; isDraft: boolean }) {
  const key = state === "open" && isDraft ? "draft" : state;
  const pill = STATUS_PILL[key] ?? STATUS_PILL["open"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${pill.bg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
      {pill.label}
      {isDraft && state === "open" ? " · Entwurf" : ""}
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

const LABEL_COLORS: Record<string, { bg: string; fg: string }> = {
  merge:    { bg: "oklch(0.93 0.06 25)",  fg: "oklch(0.4 0.14 25)" },
  editor:   { bg: "oklch(0.94 0.06 290)", fg: "oklch(0.4 0.14 290)" },
  breaking: { bg: "oklch(0.92 0.07 25)",  fg: "oklch(0.38 0.16 25)" },
  bug:      { bg: "oklch(0.94 0.06 30)",  fg: "oklch(0.42 0.14 30)" },
  refactor: { bg: "oklch(0.93 0.05 200)", fg: "oklch(0.4 0.14 200)" },
  dx:       { bg: "oklch(0.93 0.05 145)", fg: "oklch(0.4 0.14 145)" },
  ui:       { bg: "oklch(0.94 0.05 280)", fg: "oklch(0.4 0.14 280)" },
  feature:  { bg: "oklch(0.93 0.06 145)", fg: "oklch(0.4 0.14 145)" },
  fix:      { bg: "oklch(0.94 0.06 25)",  fg: "oklch(0.42 0.14 25)" },
};

function LabelChip({ label }: { label: string }) {
  const colors = LABEL_COLORS[label.toLowerCase()];
  if (colors) {
    return (
      <span
        className="inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium"
        style={{ background: colors.bg, color: colors.fg }}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}

/* ─── Sidebar card ────────────────────────────────────────────────────────── */

function SideCard({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border bg-background">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {action && (
          <button type="button" className="text-[11px] text-primary hover:underline">
            {action}
          </button>
        )}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function ReviewerCard({ reviewers }: { reviewers: PrReviewer[] }) {
  if (reviewers.length === 0) {
    return (
      <SideCard title="Reviewer" action="anfragen">
        <span className="text-[11px] italic text-muted-foreground">Noch keine Reviewer</span>
      </SideCard>
    );
  }
  return (
    <SideCard title="Reviewer" action="anfragen">
      <ul className="flex flex-col gap-1.5">
        {reviewers.map((r) => (
          <li key={r.login} className="flex items-center gap-2">
            <span
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: "oklch(0.7 0.04 80)" }}
            >
              {r.login[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px]">{r.login}</span>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

/* ─── Merge state banner ──────────────────────────────────────────────────── */

function MergeStateBanner({
  detail,
  busy,
  strategy,
  mergeMessage,
  onStrategyChange,
  onMergeMessageChange,
  onMerge,
  onCheckout,
}: {
  detail: PullRequestDetail;
  busy: string | null;
  strategy: MergeStrategy;
  mergeMessage: string;
  onStrategyChange: (s: MergeStrategy) => void;
  onMergeMessageChange: (m: string) => void;
  onMerge: () => void;
  onCheckout: () => void;
}) {
  const isActive = detail.state === "open" || detail.state === "draft";
  const isResolved = detail.state === "merged" || detail.state === "closed";

  const bannerMotion = {
    initial: { opacity: 0, y: -6, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit:    { opacity: 0, y: -4, scale: 0.98 },
    transition: { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.6 },
  };

  if (isResolved) {
    const isMerged = detail.state === "merged";
    return (
      <motion.div
        {...bannerMotion}
        className={`rounded-md border p-3 ${
          isMerged
            ? "border-[oklch(0.85_0.08_290)] bg-[oklch(0.96_0.04_290/0.12)] text-[oklch(0.4_0.14_290)]"
            : "border-border bg-muted/30 text-muted-foreground"
        }`}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-lg leading-none">{isMerged ? "⮣" : "✕"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              {isMerged ? "Erfolgreich gemergt" : "Geschlossen ohne Merge"}
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">
              Branch <code className="rounded bg-black/10 px-1 py-0 font-mono">{detail.source_branch}</code> kann gelöscht werden.
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onCheckout} disabled={busy !== null}>
            <Download className="mr-1 h-3 w-3" />
            Auschecken
          </Button>
        </div>
      </motion.div>
    );
  }

  if (!isActive) return null;

  if (detail.state === "draft" || detail.is_draft) {
    return (
      <motion.div {...bannerMotion} className="rounded-md border border-[oklch(0.86_0.08_70)] bg-[oklch(0.97_0.03_70/0.15)] p-3 text-[oklch(0.4_0.13_70)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">Entwurf — noch nicht reviewfertig</div>
            <div className="mt-0.5 text-[11px] opacity-80">
              Aus dem Entwurf nehmen, um Review & Merge zu aktivieren.
            </div>
          </div>
          <Button size="sm" className="h-7 shrink-0 text-[11px]">
            Bereit für Review
          </Button>
        </div>
      </motion.div>
    );
  }

  if (detail.mergeable === false) {
    return (
      <motion.div {...bannerMotion} className="rounded-md border border-[oklch(0.85_0.08_25)] bg-[oklch(0.97_0.03_25/0.12)] p-3 text-[oklch(0.35_0.14_25)]">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              Merge-Konflikt mit <code className="rounded bg-black/10 px-1 font-mono">{detail.target_branch}</code>
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">
              Konflikt lokal lösen oder Rebase auf {detail.target_branch} versuchen.
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onCheckout} disabled={busy !== null}>
              <Download className="mr-1 h-3 w-3" />
              Auschecken

            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (detail.mergeable === true) {
    return (
      <motion.div {...bannerMotion} className="rounded-md border border-[oklch(0.85_0.08_145)] bg-[oklch(0.97_0.04_145/0.12)] p-3 text-[oklch(0.32_0.13_145)]">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">Bereit zum Mergen</div>
            <div className="mt-0.5 text-[11px] opacity-80">
              Keine Konflikte mit <code className="rounded bg-black/10 px-1 font-mono">{detail.target_branch}</code>.
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <select
            value={strategy}
            onChange={(e) => onStrategyChange(e.target.value as MergeStrategy)}
            className="h-7 rounded border bg-background px-2 py-0 text-[11px] text-foreground"
          >
            <option value="squash">Squash &amp; Merge</option>
            <option value="rebase">Rebase &amp; Merge</option>
            <option value="merge">Merge Commit</option>
          </select>
          <input
            value={mergeMessage}
            onChange={(e) => onMergeMessageChange(e.target.value)}
            placeholder="Optionale Commit-Nachricht …"
            className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <Button size="sm" className="h-7 shrink-0 text-[11px]" onClick={onMerge} disabled={busy !== null}>
            <GitMerge className="mr-1 h-3 w-3" />
            {busy === "merge" ? "Läuft …" : "Merge"}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onCheckout} disabled={busy !== null}>
            <Download className="mr-1 h-3 w-3" />
            {busy === "checkout" ? "…" : "Auschecken"}
          </Button>
        </div>
      </motion.div>
    );
  }

  // mergeable === null (unknown)
  return (
    <motion.div {...bannerMotion} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Merge-Fähigkeit wird geprüft …
      <Button variant="outline" size="sm" className="ml-auto h-6 text-[10px]" onClick={onCheckout} disabled={busy !== null}>
        <Download className="mr-1 h-3 w-3" />
        Auschecken
      </Button>
    </motion.div>
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
  const [busy, setBusy] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    if (!window.confirm(`PR #${number} jetzt mergen (${strategy})?`)) return;
    setBusy("merge");
    try {
      await invoke("pr_merge", {
        path,
        number,
        strategy,
        message: mergeMessage.trim() ? mergeMessage.trim() : null,
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
      window.alert(`Auf lokalen Branch '${res.branch}' ausgecheckt.`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "conversation", label: "Konversation" },
    { id: "commits", label: "Commits" },
    { id: "files", label: "Dateien" },
    { id: "checks", label: "Checks" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b px-4 py-3">
        {/* Top row */}
        <div className="flex items-center gap-2">
          {detail ? (
            <StatusPill state={detail.state} isDraft={detail.is_draft} />
          ) : (
            <span className="h-5 w-14 animate-pulse rounded bg-muted" />
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
          <span className="flex-1" />
          {detail?.html_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => window.open(detail.html_url, "_blank", "noopener,noreferrer")}
              title="Im Browser öffnen"
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
            title="Aktualisieren"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Sidebar ausblenden" : "Sidebar einblenden"}
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Schließen"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Title */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={detail?.title ?? "skeleton"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.04 }}
            className="mt-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground"
          >
            {detail?.title ?? (
              <span className="inline-block h-5 w-64 animate-pulse rounded bg-muted" />
            )}
          </motion.h1>
        </AnimatePresence>

        {/* Byline */}
        {detail && (
          <motion.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.08 }}
            className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{detail.author}</span>
            <span>öffnete diesen PR</span>
            <time title={formatDate(detail.created_at)}>
              {formatRelative(detail.created_at)}
            </time>
            {detail.labels.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="flex flex-wrap gap-1">
                  {detail.labels.map((l) => <LabelChip key={l} label={l} />)}
                </span>
              </>
            )}
          </motion.div>
        )}

        {/* Tab nav — animated underline indicator */}
        <LayoutGroup id="pr-detail-tabs">
          <nav className="mt-3 flex items-center gap-0">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={[
                  "relative flex items-center gap-1.5 px-3 pb-2 pt-0.5 text-[12px] font-medium transition-colors",
                  tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
                {tab === id && (
                  <motion.span
                    layoutId="pr-detail-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 480, damping: 36, mass: 0.6 }}
                  />
                )}
              </button>
            ))}
          </nav>
        </LayoutGroup>
      </div>

      {/* ── Body ── */}
      {loading && !detail ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-1 items-center justify-center"
        >
          <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
        </motion.div>
      ) : !detail ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Keine Daten.
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
                  detail={detail}
                  busy={busy}
                  strategy={strategy}
                  mergeMessage={mergeMessage}
                  onStrategyChange={setStrategy}
                  onMergeMessageChange={setMergeMessage}
                  onMerge={doMerge}
                  onCheckout={doCheckout}
                />
              </AnimatePresence>
            </div>

            {/* Tab content — crossfade on switch */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
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
                  <PullRequestFilesTab path={path} number={number} />
                )}
                {tab === "checks" && (
                  <PullRequestChecksTab path={path} number={number} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Sidebar — slides in/out from the right */}
          <AnimatePresence initial={false}>
            {sidebarOpen && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 220, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.65 }}
                style={{ overflow: "hidden", flexShrink: 0 }}
                className="border-l"
              >
                <div className="flex w-[220px] flex-col gap-3 overflow-y-auto p-3 h-full">
            <ReviewerCard reviewers={detail.reviewers} />

            {detail.labels.length > 0 && (
              <SideCard title="Labels">
                <div className="flex flex-wrap gap-1">
                  {detail.labels.map((l) => <LabelChip key={l} label={l} />)}
                </div>
              </SideCard>
            )}

            <SideCard title="Branch">
              <div className="flex flex-col gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-8 font-mono text-[10px] text-muted-foreground">head</span>
                  <span className="rounded bg-muted px-1.5 py-0 font-mono text-[10px]">
                    {detail.source_branch}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 font-mono text-[10px] text-muted-foreground">base</span>
                  <span className="rounded bg-primary/10 px-1.5 py-0 font-mono text-[10px] text-primary">
                    {detail.target_branch}
                  </span>
                </div>
                {detail.head_sha && (
                  <div className="flex items-center gap-2">
                    <span className="w-8 font-mono text-[10px] text-muted-foreground">sha</span>
                    <code className="font-mono text-[10px] text-muted-foreground">
                      {detail.head_sha.slice(0, 7)}
                    </code>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 h-6 w-full text-[10px]"
                  onClick={doCheckout}
                  disabled={busy !== null}
                >
                  <Download className="mr-1 h-3 w-3" />
                  Lokal auschecken
                </Button>
              </div>
            </SideCard>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
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
