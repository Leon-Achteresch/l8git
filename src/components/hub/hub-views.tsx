import { Check, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { adapterFor, useHubStore } from "@/lib/hub/store";
import type { HubAccount, HubPr, HubSidebar, PullKind } from "@/lib/hub/types";
import { useHubQuery, type HubQuery } from "@/lib/hub/use-hub-query";
import { cn } from "@/lib/utils";

import { EmptyRow, ErrorRow, openExternal, Panel, PrRow, RepoRow, SkeletonRows, useHubNav } from "./hub-bits";
import { ContributionSkyline } from "./hub-viz";

function PageHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 px-6 pt-6 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function PrList({ q }: { q: HubQuery<HubPr[]> }) {
  const { t } = useTranslation();
  const refresh = useHubStore((s) => s.refresh);
  if (q.error) return <ErrorRow error={q.error} onRetry={refresh} />;
  if (!q.data) return <SkeletonRows n={5} />;
  if (q.data.length === 0) return <EmptyRow>{t("hub.pulls.empty")}</EmptyRow>;
  return <div className="divide-y divide-border/40">{q.data.map((p) => <PrRow key={p.id} pr={p} showRepo />)}</div>;
}

export function HomeView({ account, sidebar }: { account: HubAccount; sidebar: HubQuery<HubSidebar> }) {
  const { t, i18n } = useTranslation();
  const nav = useHubNav();
  const contributions = useHubQuery(account, "contributions", (ad, a) => ad.contributions(a));
  const reviews = useHubQuery(account, "pulls:review", (ad, a) => ad.pulls(a, "review"));
  const mine = useHubQuery(account, "pulls:authored", (ad, a) => ad.pulls(a, "authored"));
  const days = contributions.data;
  const stats = useMemo(() => {
    if (!days) return null;
    const total = days.reduce((s, d) => s + d.count, 0);
    let streak = 0;
    // Today often has no contribution yet; don't let that break the streak.
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) streak++;
      else if (i !== days.length - 1) break;
    }
    const best = days.reduce((b, d) => (d.count > b.count ? d : b), days[0]);
    return { total, streak, best };
  }, [days]);
  const hour = new Date().getHours();
  const greet = hour < 11 ? t("hub.home.morning") : hour < 18 ? t("hub.home.day") : t("hub.home.evening");
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }), [i18n.language]);

  return (
    <div>
      <PageHead title={`${greet}, ${account.name?.split(" ")[0] ?? account.login}`} sub={t("hub.home.sub", { host: account.host })} />

      <div className="grid grid-cols-2 border-y border-border/60 lg:grid-cols-4">
        <HomeStat label={t("hub.nav.reviews")} value={sidebar.data?.reviewCount} onClick={() => nav("reviews")} accent={!!sidebar.data?.reviewCount} />
        <HomeStat label={t("hub.nav.pulls")} value={sidebar.data?.prCount} onClick={() => nav("prs")} />
        <HomeStat label={t("hub.home.repos")} value={sidebar.data?.repoCount} onClick={() => nav("repos")} />
        <HomeStat label={t("hub.home.contributions")} value={stats?.total} sub={stats ? t("hub.home.streak", { n: stats.streak }) : undefined} />
      </div>

      {days && days.length > 0 && (
        <section className="border-b border-border/60 px-6 py-5" style={{ contain: "content" }}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-medium">{t("hub.home.skyline")}</h3>
            {stats?.best && stats.best.count > 0 && (
              <span className="text-xs text-muted-foreground">{t("hub.home.bestDay", { n: stats.best.count, date: dateFmt.format(new Date(`${stats.best.date}T00:00:00`)) })}</span>
            )}
          </div>
          <ContributionSkyline days={days} label={(d) => t("hub.home.dayLabel", { count: d.count, date: dateFmt.format(new Date(`${d.date}T00:00:00`)) })} />
        </section>
      )}

      <div className="grid xl:grid-cols-2">
        <Panel title={t("hub.home.waitingForYou")} count={reviews.data?.length} className="xl:border-r xl:border-border/60">
          <PrList q={reviews} />
        </Panel>
        <Panel title={t("hub.home.yourPrs")} count={mine.data?.length} className="border-t border-border/60 xl:border-t-0">
          <PrList q={mine} />
        </Panel>
      </div>

      <Panel title={t("hub.home.recentRepos")} className="border-t border-border/60">
        {sidebar.data ? (
          <div className="grid divide-border/40 md:grid-cols-2 [&>*]:border-b [&>*]:border-border/40">
            {sidebar.data.repos.slice(0, 8).map((r) => (
              <RepoRow key={r.fullName} repo={r} onOpen={() => nav("repo", r.fullName)} />
            ))}
          </div>
        ) : sidebar.error ? (
          <ErrorRow error={sidebar.error} />
        ) : (
          <SkeletonRows />
        )}
      </Panel>
    </div>
  );
}

function HomeStat({ label, value, sub, onClick, accent }: { label: string; value: number | null | undefined; sub?: string; onClick?: () => void; accent?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn("min-w-0 border-border/60 px-6 py-4 text-left [&:not(:first-child)]:border-l", onClick && "transition-colors hover:bg-muted/30")}
    >
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className={cn("mt-1.5 block font-mono text-2xl", accent && "text-[var(--hub-accent)]")}>{value ?? "–"}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Tag>
  );
}

export function PullsView({ account, initial }: { account: HubAccount; initial: PullKind }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<PullKind>(initial);
  const q = useHubQuery(account, `pulls:${kind}`, (ad, a) => ad.pulls(a, kind));
  const kinds: PullKind[] = ["authored", "review", "assigned", "mentioned"];
  return (
    <div>
      <PageHead title={initial === "review" ? t("hub.nav.reviews") : t("hub.nav.pulls")} sub={t("hub.pulls.sub")} />
      <div className="flex gap-1 border-b border-border/60 px-5">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "-mb-px border-b-2 px-2.5 py-2 text-xs transition-colors",
              kind === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`hub.pulls.kind.${k}`)}
          </button>
        ))}
      </div>
      <PrList q={q} />
    </div>
  );
}

export function ReposView({ account, starred }: { account: HubAccount; starred?: boolean }) {
  const { t } = useTranslation();
  const nav = useHubNav();
  const refresh = useHubStore((s) => s.refresh);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const q = useHubQuery(account, starred ? "starred" : "repos", (ad, a) => (starred ? ad.starred(a) : ad.repos(a)));
  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (q.data ?? []).filter((r) => !f || r.fullName.toLowerCase().includes(f) || r.description?.toLowerCase().includes(f));
  }, [q.data, filter]);
  return (
    <div>
      <PageHead
        title={starred ? t("hub.nav.starred") : t("hub.nav.repos")}
        sub={q.data ? t("hub.repos.count", { count: q.data.length }) : undefined}
        action={
          <div className="flex items-center gap-2">
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2 text-muted-foreground focus-within:border-foreground/30">
              <Search className="size-3.5" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("hub.nav.filter")} className="w-40 bg-transparent text-xs text-foreground outline-none" />
            </label>
            {!starred && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus />
                {t("hub.repos.new")}
              </Button>
            )}
          </div>
        }
      />
      <div className="border-t border-border/60">
        {q.error ? (
          <ErrorRow error={q.error} onRetry={refresh} />
        ) : !q.data ? (
          <SkeletonRows n={8} />
        ) : list.length === 0 ? (
          <EmptyRow>{t("hub.repos.empty")}</EmptyRow>
        ) : (
          <div className="grid md:grid-cols-2 [&>*]:border-b [&>*]:border-border/40 md:[&>*:nth-child(odd)]:border-r">
            {list.map((r) => (
              <RepoRow key={r.fullName} repo={r} onOpen={() => nav("repo", r.fullName)} />
            ))}
          </div>
        )}
      </div>
      {!starred && <NewRepoDialog account={account} open={creating} onOpenChange={setCreating} />}
    </div>
  );
}

function NewRepoDialog({ account, open, onOpenChange }: { account: HubAccount; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const nav = useHubNav();
  const refresh = useHubStore((s) => s.refresh);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priv, setPriv] = useState(true);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const r = await adapterFor(account)!.createRepo(account, name.trim(), description.trim(), priv);
      toast.success(t("hub.repos.created", { name: r.fullName }));
      onOpenChange(false);
      setName("");
      setDescription("");
      refresh();
      nav("repo", r.fullName);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("hub.repos.newTitle", { host: account.host })}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="hub-repo-name">{t("hub.repos.name")}</Label>
            <Input id="hub-repo-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hub-repo-desc">{t("hub.repos.description")}</Label>
            <Input id="hub-repo-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center justify-between gap-2 text-[13px]">
            {t("hub.repos.private")}
            <Switch checked={priv} onCheckedChange={setPriv} />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              {t("hub.repos.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InboxView({ account }: { account: HubAccount }) {
  const { t } = useTranslation();
  const refresh = useHubStore((s) => s.refresh);
  const q = useHubQuery(account, "notifications", (ad, a) => ad.notifications(a));
  const [done, setDone] = useState<Set<string>>(new Set());
  const list = (q.data ?? []).filter((n) => !done.has(n.id));

  async function markRead(id: string) {
    setDone((s) => new Set(s).add(id));
    try {
      await adapterFor(account)!.markRead(account, id);
    } catch (e) {
      setDone((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      toastError(String(e));
    }
  }

  return (
    <div>
      <PageHead title={t("hub.nav.inbox")} sub={t("hub.inbox.sub")} />
      <div className="border-t border-border/60">
        {q.error ? (
          <ErrorRow error={q.error} onRetry={refresh} />
        ) : q.data === undefined ? (
          <SkeletonRows n={6} />
        ) : q.data === null ? (
          <EmptyRow>{t("hub.inbox.unsupported")}</EmptyRow>
        ) : list.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-git-added/15 text-git-added">
              <Check className="size-5" />
            </span>
            <p className="text-[13px] text-muted-foreground">{t("hub.inbox.zero")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {list.map((n) => (
              <div key={n.id} className="group flex min-h-12 items-center gap-3 px-5 py-2 text-[13px] hover:bg-muted/40">
                <span className={cn("size-2 shrink-0 rounded-full", n.unread ? "bg-[var(--chart-1)]" : "bg-transparent")} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => n.url && openExternal(n.url)}>
                  <span className="block truncate">{n.title}</span>
                  <span className="mt-0.5 flex gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{n.repo}</span>· {n.type} · {n.reason.replace(/_/g, " ")} · {formatRelative(n.updatedAt)}
                  </span>
                </button>
                <Button variant="ghost" size="xs" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" onClick={() => void markRead(n.id)}>
                  <Check />
                  {t("hub.inbox.done")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function HubWelcome({ onConnect }: { onConnect: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md text-center">
        {/* Three linked nodes: one per provider, drawn once, no animation cost. */}
        <svg viewBox="0 0 120 64" className="mx-auto mb-6 h-16 w-32" aria-hidden>
          <path d="M20 44 L60 20 L100 44" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx="20" cy="44" r="9" fill="var(--muted)" stroke="var(--chart-3)" strokeWidth="1.5" />
          <circle cx="60" cy="20" r="11" fill="var(--muted)" stroke="var(--hub-accent)" strokeWidth="1.5" />
          <circle cx="100" cy="44" r="9" fill="var(--muted)" stroke="var(--chart-1)" strokeWidth="1.5" />
        </svg>
        <h1 className="text-xl font-semibold tracking-tight">{t("hub.welcome.title")}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{t("hub.welcome.body")}</p>
        <Button className="mt-6" onClick={onConnect}>
          <Plus />
          {t("hub.accounts.add")}
        </Button>
      </div>
    </div>
  );
}

