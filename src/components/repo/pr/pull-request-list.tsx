import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelative } from "@/lib/format";
import type { Branch, PrReviewer, PullRequest } from "@/lib/repo-store";
import { Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, type Variants } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  PullRequestCreatePanel,
  PullRequestCreateTrigger,
} from "./pull-request-create-panel";
import { useMemo, useState } from "react";

type Filter = "open" | "merged" | "closed" | "all";

function displayState(pr: PullRequest): "open" | "draft" | "merged" | "closed" {
  if (pr.state === "merged") return "merged";
  if (pr.state === "closed") return "closed";
  if (pr.state === "draft" || pr.is_draft) return "draft";
  return "open";
}

function PRGlyph({ state }: { state: ReturnType<typeof displayState> }) {
  if (state === "merged") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="4" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4 5.5v5M5.5 12c2 0 4-1.5 4-4V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "closed") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "draft") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 5.5v5M5.5 8H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const GLYPH_COLORS: Record<ReturnType<typeof displayState>, string> = {
  open:   "bg-[oklch(0.94_0.05_145)] text-[oklch(0.38_0.14_145)]",
  draft:  "bg-muted text-muted-foreground",
  merged: "bg-[oklch(0.93_0.05_290)] text-[oklch(0.4_0.14_290)]",
  closed: "bg-[oklch(0.93_0.05_25)] text-[oklch(0.45_0.14_25)]",
};

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
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0 text-[10px] font-medium"
      style={colors ? { background: colors.bg, color: colors.fg } : undefined}
    >
      {!colors ? (
        <span className="rounded bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">
          {label}
        </span>
      ) : label}
    </span>
  );
}

function ReviewerAvatarStack({ reviewers }: { reviewers: PrReviewer[] }) {
  if (reviewers.length === 0) return null;
  const shown = reviewers.slice(0, 3);
  return (
    <span className="flex items-center">
      {shown.map((r, i) => (
        <span
          key={r.login}
          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-background text-[9px] font-bold"
          style={{
            marginLeft: i === 0 ? 0 : "-5px",
            background: "oklch(0.7 0.04 80)",
            color: "white",
            zIndex: shown.length - i,
          }}
          title={r.login}
        >
          {r.login[0]?.toUpperCase()}
        </span>
      ))}
      {reviewers.length > 3 && (
        <span className="ml-1 text-[10px] text-muted-foreground">
          +{reviewers.length - 3}
        </span>
      )}
    </span>
  );
}

/* ─── Row variants ─────────────────────────────────────────────────────────── */

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(3px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -8, filter: "blur(2px)" },
};

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

function PRRow({
  pr,
  selected,
  onClick,
}: {
  pr: PullRequest;
  selected: boolean;
  onClick: () => void;
}) {
  const state = displayState(pr);
  return (
    <motion.div variants={rowVariants} transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.7 }}>
      <button
        type="button"
        onClick={onClick}
        className={[
          "group relative flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-all",
          selected
            ? "border-primary/40 bg-primary/5 shadow-sm"
            : "border-transparent hover:border-border/60 hover:bg-muted/30",
        ].join(" ")}
      >
        <AnimatePresence>
          {selected && (
            <motion.span
              layoutId="pr-row-accent"
              className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-primary"
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              exit={{ scaleY: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
            />
          )}
        </AnimatePresence>

        <span className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md ${GLYPH_COLORS[state]}`}>
          <PRGlyph state={state} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-foreground">
              {pr.title}
            </span>
            {pr.labels.slice(0, 2).map((l) => (
              <LabelChip key={l} label={l} />
            ))}
            {pr.labels.length > 2 && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                +{pr.labels.length - 2}
              </span>
            )}
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono text-[10px] text-muted-foreground/60">#{pr.number}</span>
            <span className="opacity-40">·</span>
            <CommitAvatar url={pr.author_avatar} name={pr.author} size="sm" />
            <span className="truncate">{pr.author}</span>
            <span className="opacity-40">·</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <span className="rounded bg-muted px-1.5 py-0 font-mono text-[10px]">{pr.source_branch}</span>
              <svg width="10" height="7" viewBox="0 0 14 10" fill="none" className="shrink-0 text-muted-foreground/40">
                <path d="M0 1 Q 7 1 7 5 Q 7 9 14 9" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
              </svg>
              <span className="rounded bg-primary/10 px-1.5 py-0 font-mono text-[10px] text-primary">{pr.target_branch}</span>
            </span>
            <span className="opacity-40">·</span>
            <time className="shrink-0 tabular-nums">{formatRelative(pr.updated_at)}</time>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <ReviewerAvatarStack reviewers={pr.reviewers} />
        </div>
      </button>
    </motion.div>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="flex items-center gap-2 px-2 pb-1 pt-3"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
        {count}
      </span>
    </motion.div>
  );
}

/* ─── Empty state ──────────────────────────────────────────────────────────── */

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"
    >
      {children}
    </motion.div>
  );
}

/* ─── Main component ───────────────────────────────────────────────────────── */

const FILTER_STORAGE_KEY = "l8git.pr-filter2.v1";

export function PullRequestList({
  path,
  prs,
  loading,
  selectedNumber,
  branches,
  currentBranch,
  createOpen,
  createInitialHead,
  onOpenCreate,
  onCloseCreate,
  onCreated,
  onSelect,
  onReload,
}: {
  path: string;
  prs: PullRequest[] | undefined;
  loading: boolean;
  selectedNumber: number | null;
  branches: Branch[];
  currentBranch: string;
  createOpen: boolean;
  createInitialHead?: string;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onCreated: (pr: PullRequest) => void;
  onSelect: (n: number) => void;
  onReload: () => void;
}) {
  const [filter, setFilter] = useState<Filter>(() => {
    try { return (localStorage.getItem(FILTER_STORAGE_KEY) as Filter) ?? "open"; }
    catch { return "open"; }
  });

  function setFilterAndStore(f: Filter) {
    setFilter(f);
    try { localStorage.setItem(FILTER_STORAGE_KEY, f); } catch {}
  }

  const counts = useMemo(() => {
    if (!prs) return { open: 0, merged: 0, closed: 0, all: 0 };
    return {
      open:   prs.filter((p) => { const s = displayState(p); return s === "open" || s === "draft"; }).length,
      merged: prs.filter((p) => displayState(p) === "merged").length,
      closed: prs.filter((p) => displayState(p) === "closed").length,
      all:    prs.length,
    };
  }, [prs]);

  const filtered = useMemo(() => {
    if (!prs) return undefined;
    if (filter === "all") return prs;
    if (filter === "open") return prs.filter((p) => { const s = displayState(p); return s === "open" || s === "draft"; });
    if (filter === "merged") return prs.filter((p) => displayState(p) === "merged");
    return prs.filter((p) => displayState(p) === "closed");
  }, [prs, filter]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    if (filter !== "open") return [{ key: "all", label: null, items: filtered }];
    const drafts = filtered.filter((p) => displayState(p) === "draft");
    const open   = filtered.filter((p) => displayState(p) === "open");
    return [
      drafts.length > 0 ? { key: "draft", label: "Entwürfe", items: drafts } : null,
      open.length   > 0 ? { key: "open",  label: "Offen",    items: open   } : null,
    ].filter(Boolean) as { key: string; label: string | null; items: PullRequest[] }[];
  }, [filtered, filter]);

  const TABS: { id: Filter; label: string }[] = [
    { id: "open",   label: "Offen" },
    { id: "merged", label: "Gemergt" },
    { id: "closed", label: "Geschlossen" },
    { id: "all",    label: "Alle" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <LayoutGroup id="pr-filter">
          <div className="flex items-center gap-0.5">
            {TABS.map(({ id, label }) => {
              const count = counts[id];
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterAndStore(id)}
                  className="relative flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors"
                  style={{ color: active ? "var(--color-primary)" : undefined }}
                >
                  {active && (
                    <motion.span
                      layoutId="pr-filter-pill"
                      className="absolute inset-0 rounded bg-primary/10"
                      transition={{ type: "spring", stiffness: 480, damping: 36, mass: 0.6 }}
                    />
                  )}
                  <span className={`relative z-10 ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  <motion.span
                    layout
                    className={[
                      "relative z-10 inline-flex h-[16px] min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10px]",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    ].join(" ")}
                    transition={{ type: "spring", stiffness: 480, damping: 36 }}
                  >
                    {count}
                  </motion.span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
        <span className="flex-1" />
        {!createOpen && <PullRequestCreateTrigger onOpen={onOpenCreate} />}
        <Button
          variant="ghost"
          size="sm"
          onClick={onReload}
          disabled={loading}
          className="h-7 w-7 p-0"
          title="Aktualisieren"
        >
          <motion.span
            animate={loading ? { rotate: 360 } : { rotate: 0 }}
            transition={loading ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.3 }}
            className="inline-flex"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </motion.span>
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {createOpen && (
          <PullRequestCreatePanel
            key={`pr-create-panel-${createInitialHead ?? currentBranch}`}
            path={path}
            branches={branches}
            currentBranch={currentBranch}
            initialHead={createInitialHead}
            onClose={onCloseCreate}
            onCreated={onCreated}
          />
        )}
      </AnimatePresence>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          <AnimatePresence mode="wait" initial={false}>
            {loading && !prs ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center p-8 text-sm text-muted-foreground"
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Lade Pull Requests …
              </motion.div>
            ) : !prs || prs.length === 0 ? (
              <EmptyState key="empty-all">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="opacity-30">
                  <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="18" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>Keine Pull Requests gefunden.</span>
                <span className="text-xs">
                  Nicht angemeldet? Unter Einstellungen → Git-Konten anmelden.
                </span>
              </EmptyState>
            ) : !filtered || filtered.length === 0 ? (
              <EmptyState key="empty-filter">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="opacity-30">
                  <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="18" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>Keine PRs in dieser Kategorie.</span>
              </EmptyState>
            ) : (
              <motion.div
                key={`list-${filter}`}
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0 } } }}
              >
                {groups.map((group) => (
                  <div key={group.key}>
                    {group.label && <GroupHeader label={group.label} count={group.items.length} />}
                    <motion.div
                      className="flex flex-col gap-0.5"
                      initial="hidden"
                      animate="visible"
                      variants={listVariants}
                    >
                      <AnimatePresence initial={false}>
                        {group.items.map((pr) => (
                          <PRRow
                            key={pr.number}
                            pr={pr}
                            selected={pr.number === selectedNumber}
                            onClick={() => onSelect(pr.number)}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
