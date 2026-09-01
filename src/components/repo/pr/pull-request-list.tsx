import { SpinIcon } from "@/components/motion/kit";
import { PanelEmptyHint } from "@/components/onboarding/panel-empty-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Branch, PullRequest } from "@/lib/repo-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PrEmptyState } from "./pr-empty-state";
import { PrListGroupHeader } from "./pr-list-group-header";
import { PrRow } from "./pr-row";
import {
  PullRequestCreatePanel,
  PullRequestCreateTrigger,
} from "./pull-request-create-panel";

type Filter = "open" | "merged" | "closed" | "all";

const FILTER_STORAGE_KEY = "l8git.pr-filter2.v1";

function displayState(pr: PullRequest): "open" | "draft" | "merged" | "closed" {
  if (pr.state === "merged") return "merged";
  if (pr.state === "closed") return "closed";
  if (pr.state === "draft" || pr.is_draft) return "draft";
  return "open";
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [filter, setFilter] = useState<Filter>(() => {
    try {
      return (localStorage.getItem(FILTER_STORAGE_KEY) as Filter) ?? "open";
    } catch {
      return "open";
    }
  });

  function setFilterAndStore(f: Filter) {
    setFilter(f);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, f);
    } catch {}
  }

  const counts = useMemo(() => {
    if (!prs) return { open: 0, merged: 0, closed: 0, all: 0 };
    return {
      open: prs.filter((p) => {
        const s = displayState(p);
        return s === "open" || s === "draft";
      }).length,
      merged: prs.filter((p) => displayState(p) === "merged").length,
      closed: prs.filter((p) => displayState(p) === "closed").length,
      all: prs.length,
    };
  }, [prs]);

  const filtered = useMemo(() => {
    if (!prs) return undefined;
    let list = prs;
    if (filter === "open") {
      list = prs.filter((p) => {
        const s = displayState(p);
        return s === "open" || s === "draft";
      });
    } else if (filter === "merged") {
      list = prs.filter((p) => displayState(p) === "merged");
    } else if (filter === "closed") {
      list = prs.filter((p) => displayState(p) === "closed");
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          p.source_branch.toLowerCase().includes(q) ||
          p.target_branch.toLowerCase().includes(q) ||
          p.number.toString().includes(q) ||
          p.labels.some((l) => l.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [prs, filter, searchQuery]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    if (filter !== "open") return [{ key: "all", label: null, items: filtered }];
    const drafts = filtered.filter((p) => displayState(p) === "draft");
    const open = filtered.filter((p) => displayState(p) === "open");
    return [
      drafts.length > 0 ? { key: "draft", label: t("pr.draftsSection"), items: drafts } : null,
      open.length > 0 ? { key: "open", label: t("pr.groupSectionOpen"), items: open } : null,
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
      { id: "open", label: t("pr.filterTabOpen") },
      { id: "merged", label: t("pr.filterTabMerged") },
      { id: "closed", label: t("pr.filterTabClosed") },
      { id: "all", label: t("pr.filterTabAll") },
    ],
    [t, i18n.language],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background/50">
      <div className="flex flex-col gap-2 border-b border-border/70 bg-muted/20 px-3 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <LayoutGroup id="pr-filter">
            <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-0.5 border border-border/50">
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
                    className="relative h-7 rounded-lg px-2.5 text-[11px] font-semibold hover:bg-transparent"
                  >
                    {active && (
                      <m.span
                        layoutId="pr-filter-pill"
                        className="absolute inset-0 rounded-lg bg-background shadow-xs border border-border/60"
                        transition={{ type: "spring", stiffness: 480, damping: 36, mass: 0.6 }}
                      />
                    )}
                    <span
                      className={`relative z-10 transition-colors ${
                        active ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </span>
                    <m.span
                      layout
                      className={[
                        "relative z-10 ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
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

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSearch(!showSearch)}
            className={`h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground ${
              showSearch || searchQuery ? "bg-muted text-foreground" : ""
            }`}
            title="Search pull requests"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>

          {!createOpen && <PullRequestCreateTrigger onOpen={onOpenCreate} />}

          <Button
            variant="ghost"
            size="icon"
            onClick={onReload}
            disabled={loading}
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
            title={t("pr.reloadTitle")}
          >
            <SpinIcon
              icon={RefreshCw}
              active={loading}
              className={`h-3.5 w-3.5 ${loading ? "text-primary" : ""}`}
            />
          </Button>
        </div>

        <AnimatePresence>
          {showSearch && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, author, branch, #..."
                  className="h-7.5 pl-8 pr-7 text-[11px] rounded-lg bg-background/80"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
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
        <div className="py-2">
          {loading && !prs ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <SpinIcon icon={Loader2} className="mr-2 h-4 w-4 text-primary" />
              {t("pr.loading")}
            </div>
          ) : !prs || prs.length === 0 ? (
            <PrEmptyState key="empty-all">
              <span className="font-medium text-foreground">{t("pr.noneFound")}</span>
              <PanelEmptyHint
                hint={t("pr.emptyAccountHint")}
                settingsHash="accounts"
                actionLabel={t("pr.emptyAccountAction")}
              />
            </PrEmptyState>
          ) : !filtered || filtered.length === 0 ? (
            <PrEmptyState key="empty-filter">
              <span>{t("pr.noneInCategory")}</span>
            </PrEmptyState>
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
                      <PrListGroupHeader label={item.label} count={item.count} />
                    ) : (
                      <PrRow
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
