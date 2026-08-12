import { Badge } from "@/components/ui/badge";
import { ListRow } from "@/components/ui/list-row";
import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { formatRelative } from "@/lib/format";
import type { Branch, PrReviewer, PullRequest } from "@/lib/repo-store";
import { Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  PullRequestCreatePanel,
  PullRequestCreateTrigger,
} from "./pull-request-create-panel";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
  open:   "bg-git-added/15 text-git-added",
  draft:  "bg-muted text-muted-foreground",
  merged: "bg-git-merge/15 text-git-merge",
  closed: "bg-git-removed/15 text-git-removed",
};

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

function ReviewerAvatarStack({ reviewers }: { reviewers: PrReviewer[] }) {
  if (reviewers.length === 0) return null;
  const shown = reviewers.slice(0, 3);
  return (
    <span className="flex items-center">
      {shown.map((r, i) => (
        <span
          key={r.login}
          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-bold text-muted-foreground"
          style={{
            marginLeft: i === 0 ? 0 : "-5px",
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

const PRRow = memo(function PRRow({
  pr,
  selected,
  onSelect,
}: {
  pr: PullRequest;
  selected: boolean;
  onSelect: (n: number) => void;
}) {
  const state = displayState(pr);
  return (
    <div className="pb-0.5">
      <ListRow
        variant="accent"
        active={selected}
        onClick={() => onSelect(pr.number)}
        className={[
          "group items-start border px-3 py-2.5",
          selected
            ? "border-primary/40 shadow-sm"
            : "border-transparent hover:border-border/60",
        ].join(" ")}
      >
        <AnimatePresence>
          {selected && (
            <m.span
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
      </ListRow>
    </div>
  );
});

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1 pt-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

/* ─── Empty state ──────────────────────────────────────────────────────────── */

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"
    >
      {children}
    </m.div>
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
  const { t, i18n } = useTranslation();
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
      drafts.length > 0 ? { key: "draft", label: t("pr.draftsSection"), items: drafts } : null,
      open.length   > 0 ? { key: "open",  label: t("pr.groupSectionOpen"),    items: open   } : null,
    ].filter(Boolean) as { key: string; label: string | null; items: PullRequest[] }[];
  }, [filtered, filter, t, i18n.language]);

  const flatItems = useMemo(() => {
    const out: (
      | { kind: "header"; key: string; label: string; count: number }
      | { kind: "pr"; pr: PullRequest }
    )[] = [];
    for (const g of groups) {
      if (g.label) {
        out.push({
          kind: "header",
          key: `h-${g.key}`,
          label: g.label,
          count: g.items.length,
        });
      }
      for (const pr of g.items) out.push({ kind: "pr", pr });
    }
    return out;
  }, [groups]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (i) => (flatItems[i]?.kind === "header" ? 34 : 64),
    overscan: 8,
    getItemKey: (i) => {
      const it = flatItems[i];
      if (!it) return i;
      return it.kind === "header" ? it.key : it.pr.number;
    },
  });

  const TABS: { id: Filter; label: string }[] = useMemo(
    () => [
      { id: "open",   label: t("pr.filterTabOpen") },
      { id: "merged", label: t("pr.filterTabMerged") },
      { id: "closed", label: t("pr.filterTabClosed") },
      { id: "all",    label: t("pr.filterTabAll") },
    ],
    [t, i18n.language],
  );

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
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterAndStore(id)}
                  className="relative hover:bg-transparent"
                  style={{ color: active ? "var(--color-primary)" : undefined }}
                >
                  {active && (
                    <m.span
                      layoutId="pr-filter-pill"
                      className="absolute inset-0 rounded bg-primary/10"
                      transition={{ type: "spring", stiffness: 480, damping: 36, mass: 0.6 }}
                    />
                  )}
                  <span className={`relative z-10 ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  <m.span
                    layout
                    className={[
                      "relative z-10 inline-flex h-[16px] min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10px]",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    ].join(" ")}
                    transition={{ type: "spring", stiffness: 480, damping: 36 }}
                  >
                    {count}
                  </m.span>
                </Button>
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
          title={t("pr.reloadTitle")}
        >
          <m.span
            animate={loading ? { rotate: 360 } : { rotate: 0 }}
            transition={loading ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.3 }}
            className="inline-flex"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </m.span>
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

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-2">
          {loading && !prs ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("pr.loading")}
              </div>
            ) : !prs || prs.length === 0 ? (
              <EmptyState key="empty-all">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="opacity-30">
                  <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="18" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{t("pr.noneFound")}</span>
                <span className="text-xs">
                  {t("pr.signInHint")}
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
                <span>{t("pr.noneInCategory")}</span>
              </EmptyState>
            ) : (
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((vi) => {
                  const item = flatItems[vi.index];
                  if (!item) return null;
                  return (
                    <div
                      key={vi.key}
                      data-index={vi.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      {item.kind === "header" ? (
                        <GroupHeader label={item.label} count={item.count} />
                      ) : (
                        <PRRow
                          pr={item.pr}
                          selected={item.pr.number === selectedNumber}
                          onSelect={onSelect}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
