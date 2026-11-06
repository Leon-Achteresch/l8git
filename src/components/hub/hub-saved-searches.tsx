import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import { parseGithubSubjectUrl, searchIssues, type GithubIssue } from "@/lib/github-expansion/api";
import { accountScope, useGithubWorkspace, type SearchPreset } from "@/lib/github-expansion/store";
import { searchChips, toggleChip, SEARCH_CHIPS } from "@/lib/github-ui/search-chips";
import type { HubAccount } from "@/lib/hub/types";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmptyRow, ErrorRow } from "./hub-bits";

/** 4: account-scoped saved GitHub searches with editable query, filter chips and paginated results. */
export function HubSavedSearches({ account }: { account: HubAccount }) {
  const { t } = useTranslation();
  const scope = accountScope(account, "*");
  const saved = useGithubWorkspace((s) => s.searches[scope]) ?? [];
  const save = useGithubWorkspace((s) => s.saveSearches);
  const [active, setActive] = useState<SearchPreset | null>(saved[0] ?? null);
  const [query, setQuery] = useState(active?.query ?? "is:open is:pr review-requested:@me");
  const [name, setName] = useState(active?.name ?? "");
  const [run, setRun] = useState(query);
  const [items, setItems] = useState<GithubIssue[] | null>(null);
  const [page, setPage] = useState({ page: 0, hasMore: false, total: 0, incomplete: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function load(p: number) {
    setLoading(true);
    try {
      const r = await searchIssues(account, run, p);
      setItems((prev) => (p === 1 ? r.items : [...(prev ?? []), ...r.items]));
      setPage({ page: p, hasMore: r.hasMore, total: r.total ?? 0, incomplete: !!r.incomplete });
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (run.trim()) void load(1);
  }, [run, account]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (p: SearchPreset) => {
    setActive(p);
    setName(p.name);
    setQuery(p.query);
    setRun(p.query);
  };
  const persist = () => {
    const n = name.trim() || query.trim().slice(0, 40);
    if (active) save(scope, saved.map((x) => (x.id === active.id ? { ...x, name: n, query } : x)));
    else {
      const p = { id: crypto.randomUUID(), name: n, query };
      save(scope, [...saved, p]);
      setActive(p);
    }
  };
  const chips = searchChips(query);
  const open = (i: GithubIssue) => {
    const s = parseGithubSubjectUrl(i.html_url, [account]);
    if (!s) return window.open(i.html_url, "_blank", "noopener,noreferrer");
    void navigate({ to: "/hub", search: s.kind === "pull" ? { view: "pr", repo: s.repo, pr: s.number } : { view: "repo", repo: s.repo, issue: s.number } });
  };

  return (
    <div className="space-y-2 px-5 py-3">
      <div className="flex flex-wrap items-center gap-1">
        {saved.map((p) => (
          <button key={p.id} type="button" onClick={() => pick(p)} aria-pressed={active?.id === p.id}
            className={cn("rounded-md border px-2 py-0.5 text-xs", active?.id === p.id ? "border-foreground" : "border-border/60 text-muted-foreground hover:text-foreground")}>
            {p.name}
          </button>
        ))}
        <button type="button" onClick={() => { setActive(null); setName(""); }} className="rounded-md border border-dashed border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
          {t("search.new")}
        </button>
      </div>
      <form className="flex flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); setRun(query); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("search.name")} aria-label={t("search.name")} className="h-7 w-40 text-xs" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("search.query")} className="h-7 min-w-64 flex-1 font-mono text-xs" />
        <Button type="submit" size="xs">{t("common.search")}</Button>
        <Button type="button" size="xs" variant="outline" disabled={!query.trim()} onClick={persist}><Save />{t("common.save")}</Button>
        {active && <Button type="button" size="xs" variant="ghost" aria-label={t("common.delete")} onClick={() => { save(scope, saved.filter((x) => x.id !== active.id)); setActive(null); }}><Trash2 /></Button>}
      </form>
      <div className="flex flex-wrap gap-1">
        {SEARCH_CHIPS.map((c) => (
          <button key={c.token} type="button" aria-pressed={chips.has(c.token)} onClick={() => { const q = toggleChip(query, c.token); setQuery(q); setRun(q); }}
            className={cn("rounded-full border px-2 py-0.5 text-[11px]", chips.has(c.token) ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground")}>
            {t(`search.chip.${c.id}`)}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorRow error={error} onRetry={() => void load(1)} />
      ) : items === null ? (
        loading && <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
      ) : items.length === 0 ? (
        <EmptyRow>{t("search.none")}</EmptyRow>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{t("search.total", { count: page.total })}{page.incomplete && ` · ${t("search.incomplete")}`}{page.total > 1000 && ` · ${t("search.capped")}`}</p>
          <div className="divide-y divide-border/40 rounded-md border border-border/60">
            {items.map((i) => (
              <button key={i.id} type="button" onClick={() => open(i)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted/40">
                <span className={cn("size-2 shrink-0 rounded-full", i.state === "open" ? "bg-git-added" : "bg-[var(--chart-2)]")} />
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{i.html_url.split("/").slice(3, 5).join("/")}#{i.number} · {formatRelative(i.updated_at)}</span>
              </button>
            ))}
          </div>
          {page.hasMore && <Button size="xs" variant="ghost" disabled={loading} onClick={() => void load(page.page + 1)}>{t("ghx.loadMore")}</Button>}
        </>
      )}
    </div>
  );
}
