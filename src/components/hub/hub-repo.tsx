import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  GitFork,
  Link2,
  Loader2,
  Pin,
  PinOff,
  Plus,
  Scale,
  Star,
  Tag,
  ThumbsUp,
  GitMerge,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RepoCiPanel } from "@/components/repo/ci/repo-ci-panel";
import { CloneRepoDialog } from "@/components/repo/tabs/clone-repo-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { accountKey, adapterFor, hubRepoPath, useHubStore } from "@/lib/hub/store";
import type { HubAccount, HubPr, HubRepoDetail } from "@/lib/hub/types";
import { useHubQuery } from "@/lib/hub/use-hub-query";
import { cn } from "@/lib/utils";

import {
  CheckIcon,
  compact,
  EmptyRow,
  ErrorRow,
  openExternal,
  Panel,
  PrRow,
  SkeletonRows,
  UserAvatar,
  useHubNav,
} from "./hub-bits";
import { HubContributorsTab } from "./hub-contributors";
import { CHECK_COLOR, CiStrip, langColor, LanguageBar, StarArea } from "./hub-viz";

type Tab = "overview" | "pulls" | "issues" | "releases" | "actions" | "contributors";

export function HubRepoPage({ account, fullName }: { account: HubAccount; fullName: string }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  const q = useHubQuery(account, `repo:${fullName}`, (ad, a) => ad.repo(a, fullName));
  const refresh = useHubStore((s) => s.refresh);
  const r = q.data;

  const tabs: { id: Tab; label: string; count?: number | null }[] = [
    { id: "overview", label: t("hub.repo.overview") },
    { id: "pulls", label: t("hub.repo.pulls"), count: r?.openPrs },
    { id: "issues", label: t("hub.repo.issues"), count: r?.openIssues },
    { id: "releases", label: t("hub.repo.releases"), count: r?.releaseCount },
    { id: "actions", label: t("hub.repo.actions") },
    { id: "contributors", label: t("hub.repo.contributors") },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/60 px-4 text-[13px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <UserAvatar src={r?.ownerAvatar} login={fullName} size={16} className="rounded" />
          <span className="truncate text-muted-foreground">{fullName.split("/").slice(0, -1).join("/")}</span>
          <span className="text-muted-foreground/60">›</span>
          <span className="truncate font-medium">{fullName.split("/").pop()}</span>
        </span>
        <nav className="ml-2 flex items-center gap-0.5" aria-label={t("hub.repo.tabsAria")}>
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              aria-current={tab === x.id ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                tab === x.id ? "bg-muted text-foreground ring-1 ring-border/60" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {x.label}
              {x.count != null && x.count > 0 && <span className="font-mono text-[11px] text-muted-foreground">{x.count}</span>}
            </button>
          ))}
        </nav>
        <Button variant="outline" size="xs" className="ml-auto" onClick={() => openExternal(r?.url ?? `https://${account.host}/${fullName}`)}>
          {t("hub.repo.openOn", { host: account.host })}
          <ExternalLink />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.error && !r ? (
          <ErrorRow error={q.error} onRetry={refresh} />
        ) : !r ? (
          <RepoSkeleton />
        ) : (
          <>
            <RepoHeader account={account} repo={r} />
            {tab === "overview" && <Overview repo={r} onTab={setTab} />}
            {tab === "pulls" && <PullsTab account={account} repo={r} />}
            {tab === "issues" && <IssuesTab account={account} fullName={r.fullName} />}
            {tab === "releases" && <ReleasesTab account={account} fullName={r.fullName} />}
            {tab === "actions" && <ActionsTab account={account} fullName={r.fullName} />}
            {tab === "contributors" && <HubContributorsTab account={account} repo={r} />}
          </>
        )}
      </div>
    </div>
  );
}

function RepoSkeleton() {
  return (
    <div aria-busy className="animate-pulse">
      <div className="flex items-center gap-4 px-6 py-6">
        <span className="size-12 rounded-xl bg-muted" />
        <span className="grid gap-2">
          <span className="h-5 w-56 rounded bg-muted" />
          <span className="h-3 w-40 rounded bg-muted" />
        </span>
      </div>
      <div className="grid h-24 grid-cols-4 border-y border-border/60" />
      <SkeletonRows n={6} />
    </div>
  );
}

function RepoHeader({ account, repo }: { account: HubAccount; repo: HubRepoDetail }) {
  const { t } = useTranslation();
  const nav = useHubNav();
  const refresh = useHubStore((s) => s.refresh);
  const togglePin = useHubStore((s) => s.togglePin);
  const pinned = useHubStore((s) => s.pinned[accountKey(account)]?.includes(repo.fullName) ?? false);
  const [starred, setStarred] = useState(repo.starred);
  const [stars, setStars] = useState(repo.stars);
  const [busy, setBusy] = useState<"star" | "fork" | null>(null);
  const [cloneUrl, setCloneUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const adapter = adapterFor(account)!;

  async function toggleStar() {
    const next = !starred;
    setBusy("star");
    // Optimistic: flip first, roll back on failure.
    setStarred(next);
    setStars((s) => (s == null ? s : s + (next ? 1 : -1)));
    try {
      await adapter.star(account, repo.fullName, next);
    } catch (e) {
      setStarred(!next);
      setStars((s) => (s == null ? s : s + (next ? -1 : 1)));
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function fork() {
    setBusy("fork");
    try {
      const f = await adapter.fork(account, repo.fullName);
      refresh();
      toast.success(t("hub.repo.forked", { name: f.fullName }), {
        action: { label: t("hub.repo.openFork"), onClick: () => nav("repo", f.fullName) },
      });
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(text);
    window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
  }

  return (
    <div className="flex flex-wrap items-start gap-4 px-6 pt-6 pb-5">
      <UserAvatar src={repo.ownerAvatar} login={repo.owner} size={48} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{repo.name}</h1>
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            {repo.private ? t("hub.repo.private") : t("hub.repo.public")}
          </span>
          {repo.fork && <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">{t("hub.repo.fork")}</span>}
        </div>
        {repo.description && <p className="mt-1 text-[13px] text-muted-foreground">{repo.description}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {repo.language && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: langColor(repo.language, 0) }} />
              {repo.language.name}
            </span>
          )}
          {repo.defaultBranch && (
            <span className="flex items-center gap-1 font-mono">
              <GitBranch className="size-3" />
              {repo.defaultBranch}
            </span>
          )}
          {repo.license && (
            <span className="flex items-center gap-1">
              <Scale className="size-3" />
              {repo.license}
            </span>
          )}
          <span>{t("hub.repo.updated", { when: formatRelative(repo.updatedAt) })}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => togglePin(repo.fullName)} title={pinned ? t("hub.repo.unpin") : t("hub.repo.pin")} aria-label={pinned ? t("hub.repo.unpin") : t("hub.repo.pin")}>
          {pinned ? <PinOff /> : <Pin />}
        </Button>
        {stars != null && (
          <Counter
            label={starred ? t("hub.repo.starred") : t("hub.repo.star")}
            icon={busy === "star" ? <Loader2 className="animate-spin" /> : <Star className={cn(starred && "fill-[var(--hub-accent)] text-[var(--hub-accent)]")} />}
            count={stars}
            onClick={toggleStar}
            disabled={busy !== null}
          />
        )}
        <Counter label={t("hub.repo.forkAction")} icon={busy === "fork" ? <Loader2 className="animate-spin" /> : <GitFork />} count={repo.forks} onClick={fork} disabled={busy !== null} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1">
              <Code2 />
              {t("hub.repo.clone")}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuItem onSelect={() => setCloneUrl(repo.cloneUrl)} className="gap-2">
              <Download className="size-4" />
              {t("hub.repo.cloneLocal")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {[
              { label: "HTTPS", url: repo.cloneUrl },
              ...(repo.sshUrl ? [{ label: "SSH", url: repo.sshUrl }] : []),
            ].map((c) => (
              <DropdownMenuItem key={c.label} onSelect={(e) => { e.preventDefault(); copy(c.url); }} className="gap-2">
                {copied === c.url ? <Check className="size-4 text-git-added" /> : <Copy className="size-4" />}
                <span className="w-10 text-xs text-muted-foreground">{c.label}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{c.url}</span>
              </DropdownMenuItem>
            ))}
            {account.provider === "github" && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); copy(`gh repo clone ${repo.fullName}`); }} className="gap-2">
                {copied === `gh repo clone ${repo.fullName}` ? <Check className="size-4 text-git-added" /> : <Copy className="size-4" />}
                <span className="w-10 text-xs text-muted-foreground">CLI</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">gh repo clone {repo.fullName}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CloneRepoDialog open={cloneUrl !== null} onClose={() => setCloneUrl(null)} initialUrl={cloneUrl ?? undefined} />
    </div>
  );
}

function Counter({ label, icon, count, onClick, disabled }: { label: string; icon: ReactNode; count: number | null; onClick: () => void; disabled: boolean }) {
  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-[min(var(--radius-md),14px)] border border-border text-[0.8rem] shadow-xs dark:border-input">
      <button type="button" onClick={onClick} disabled={disabled} className="flex items-center gap-1.5 px-2.5 hover:bg-muted disabled:opacity-60 [&_svg]:size-3.5">
        {icon}
        {label}
      </button>
      {count != null && <span className="grid place-items-center border-l border-border px-2 font-mono text-xs text-muted-foreground dark:border-input">{compact(count)}</span>}
    </div>
  );
}

function Stat({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 border-border/60 px-6 py-4 [&:not(:first-child)]:border-l", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Overview({ repo, onTab }: { repo: HubRepoDetail; onTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const ci = repo.commits.map((c) => c.checks).reverse();
  const known = ci.filter((c) => c !== null);
  const ciState = known.length === 0 ? null : known[known.length - 1];
  const starsGained = repo.starHistory ? repo.starHistory[repo.starHistory.length - 1] - repo.starHistory[0] : null;

  return (
    <>
      <div className="grid grid-cols-1 border-y border-border/60 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1fr_2fr]">
        <Stat label={t("hub.repo.openPrs")}>
          <button type="button" onClick={() => onTab("pulls")} className="font-mono text-2xl hover:underline">
            {repo.openPrs ?? "–"}
          </button>
        </Stat>
        <Stat label={t("hub.repo.ciLast", { n: repo.commits.length, branch: repo.defaultBranch ?? "HEAD" })}>
          {known.length ? (
            <div className="flex h-8 items-center gap-2.5">
              <CiStrip states={ci} />
              <span className="text-[13px]" style={{ color: ciState ? CHECK_COLOR[ciState] : undefined }}>
                {ciState ? t(`hub.checks.${ciState}`) : ""}
              </span>
            </div>
          ) : (
            <span className="font-mono text-2xl text-muted-foreground">–</span>
          )}
        </Stat>
        <Stat label={t("hub.repo.latestRelease")}>
          {repo.latestRelease ? (
            <button type="button" onClick={() => onTab("releases")} className="flex items-baseline gap-2 text-left">
              <span className="font-mono text-2xl">{repo.latestRelease.tag}</span>
              {repo.latestRelease.publishedAt && <span className="text-xs text-muted-foreground">{formatRelative(repo.latestRelease.publishedAt)}</span>}
            </button>
          ) : (
            <span className="font-mono text-2xl text-muted-foreground">–</span>
          )}
        </Stat>
        <Stat
          label={
            <>
              <span>{t("hub.repo.stars30")}</span>
              {starsGained != null && starsGained > 0 && (
                <span className="text-[var(--hub-accent)]">
                  {t("hub.repo.starsGained", { n: `${starsGained}${repo.starHistoryCapped ? "+" : ""}` })}
                </span>
              )}
            </>
          }
        >
          {repo.starHistory ? <StarArea values={repo.starHistory} /> : <span className="font-mono text-2xl text-muted-foreground">{repo.stars ?? "–"}</span>}
        </Stat>
      </div>

      <div className="grid xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 xl:border-r xl:border-border/60">
          <Panel
            title={t("hub.repo.openPrs")}
            count={repo.openPrs}
            action={
              <button type="button" onClick={() => onTab("pulls")} className="text-xs text-muted-foreground hover:text-foreground">
                {t("hub.repo.viewAll")}
              </button>
            }
          >
            {repo.pulls.length ? (
              <div className="divide-y divide-border/40">{repo.pulls.map((p) => <PrRow key={p.id} pr={p} />)}</div>
            ) : (
              <EmptyRow>{t("hub.repo.noOpenPrs")}</EmptyRow>
            )}
          </Panel>

          <Panel
            title={
              <>
                {t("hub.repo.recentCommits")}
                {repo.defaultBranch && <span className="font-mono text-xs font-normal text-muted-foreground">{repo.defaultBranch}</span>}
              </>
            }
            action={
              <button type="button" onClick={() => openExternal(`${repo.url}/commits`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {t("hub.repo.history")}
                <ExternalLink className="size-3" />
              </button>
            }
            className="border-t border-border/60"
          >
            <div className="divide-y divide-border/40">
              {repo.commits.map((c) => (
                <button key={c.sha} type="button" onClick={() => openExternal(c.url)} className="flex h-11 w-full items-center gap-3 px-5 text-left text-[13px] transition-colors hover:bg-muted/40">
                  <CheckIcon state={c.checks} />
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{c.sha.slice(0, 7)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.message}</span>
                  <span className="hidden w-36 shrink-0 items-center gap-2 truncate text-xs text-muted-foreground md:flex">
                    <UserAvatar src={c.author?.avatarUrl} login={c.authorName} size={18} />
                    <span className="truncate">{c.authorName}</span>
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{shortAge(c.date)}</span>
                </button>
              ))}
              {repo.commits.length === 0 && <EmptyRow>{t("hub.repo.noCommits")}</EmptyRow>}
            </div>
          </Panel>
        </div>

        <aside className="grid content-start gap-6 border-t border-border/60 px-5 py-5 xl:border-t-0">
          <section>
            <h3 className="text-[13px] font-medium">{t("hub.repo.about")}</h3>
            <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
              {repo.homepage && (
                <button type="button" onClick={() => openExternal(repo.homepage!)} className="flex items-center gap-2 truncate text-left text-[var(--chart-1)] hover:underline">
                  <Link2 className="size-3.5 shrink-0" />
                  {repo.homepage.replace(/^https?:\/\//, "")}
                </button>
              )}
              <button type="button" onClick={() => openExternal(`${repo.url}#readme`)} className="flex items-center gap-2 text-left hover:text-foreground">
                <Code2 className="size-3.5" />
                README
              </button>
              {repo.license && (
                <span className="flex items-center gap-2">
                  <Scale className="size-3.5" />
                  {repo.license}
                </span>
              )}
            </div>
            {repo.topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {repo.topics.map((x) => (
                  <span key={x} className="rounded-full bg-[var(--chart-1)]/12 px-2 py-0.5 text-[11px] text-[var(--chart-1)]">
                    {x}
                  </span>
                ))}
              </div>
            )}
          </section>

          {repo.languages.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-[13px] font-medium">{t("hub.repo.languages")}</h3>
              <LanguageBar languages={repo.languages} />
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {repo.languages.slice(0, 6).map((l, i) => (
                  <span key={l.name} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: langColor(l, i) }} />
                    {l.name}
                    <span className="font-mono text-muted-foreground">{l.share < 0.01 ? "<1%" : `${Math.round(l.share * 100)}%`}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {repo.contributors.length > 0 && <Contributors repo={repo} onOpen={() => onTab("contributors")} />}
        </aside>
      </div>
    </>
  );
}

function Contributors({ repo, onOpen }: { repo: HubRepoDetail; onOpen: () => void }) {
  const { t } = useTranslation();
  const list = repo.contributors;
  const max = list[0]?.contributions || 1;
  return (
    <section>
      <h3 className="mb-2.5 text-[13px] font-medium">
        <button type="button" onClick={onOpen} className="group flex w-full items-center gap-2 text-left hover:text-foreground">
          {t("hub.repo.contributors")}
          <span className="font-mono text-xs text-muted-foreground">{list.length >= 30 ? "30+" : list.length}</span>
          <span className="ml-auto flex items-center gap-0.5 text-xs font-normal text-muted-foreground group-hover:text-foreground">
            {t("hub.repo.details")}
            <ChevronRight className="size-3" />
          </span>
        </button>
      </h3>
      <div className="flex -space-x-1.5">
        {list.slice(0, 8).map((c) => (
          <button key={c.login} type="button" onClick={() => c.url && openExternal(c.url)} className="rounded-full ring-2 ring-background">
            <UserAvatar src={c.avatarUrl} login={c.login} size={24} />
          </button>
        ))}
        {list.length > 8 && <span className="z-10 grid size-6 place-items-center rounded-full bg-muted text-[10px] ring-2 ring-background">+{list.length - 8}</span>}
      </div>
      {/* Commit share as hairline bars: readable at a glance, zero chart overhead. */}
      <div className="mt-3 grid gap-1.5">
        {list.slice(0, 5).map((c) => (
          <div key={c.login} className="grid grid-cols-[88px_1fr_36px] items-center gap-2 text-xs">
            <span className="truncate text-muted-foreground">{c.login}</span>
            <span className="h-1 rounded-full bg-muted">
              <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(c.contributions / max) * 100}%` }} />
            </span>
            <span className="text-right font-mono text-muted-foreground">{compact(c.contributions)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function shortAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

function StateToggle<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn("h-6 rounded px-2 text-xs", value === o.id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PullsTab({ account, repo }: { account: HubAccount; repo: HubRepoDetail }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"open" | "closed">("open");
  const refresh = useHubStore((s) => s.refresh);
  const q = useHubQuery(account, `repoPulls:${repo.fullName}:${state}`, (ad, a) => ad.repoPulls(a, repo.fullName, state));
  const [merge, setMerge] = useState<HubPr | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const adapter = adapterFor(account)!;

  async function act(pr: HubPr, kind: "approve" | "merge") {
    setBusy(`${kind}:${pr.id}`);
    try {
      if (kind === "approve") await adapter.approvePr(account, repo.fullName, pr.number);
      else await adapter.mergePr(account, repo.fullName, pr.number);
      toast.success(kind === "approve" ? t("hub.pr.approved", { n: pr.number }) : t("hub.pr.merged", { n: pr.number }));
      refresh();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      title={t("hub.repo.pulls")}
      action={
        <StateToggle
          value={state}
          onChange={setState}
          options={[
            { id: "open", label: t("hub.state.open") },
            { id: "closed", label: t("hub.state.closed") },
          ]}
        />
      }
      className="border-t border-border/60"
    >
      {q.error ? (
        <ErrorRow error={q.error} onRetry={refresh} />
      ) : !q.data ? (
        <SkeletonRows />
      ) : q.data.length === 0 ? (
        <EmptyRow>{t("hub.repo.noPrs")}</EmptyRow>
      ) : (
        <div className="divide-y divide-border/40">
          {q.data.map((p) => (
            <PrRow
              key={p.id}
              pr={p}
              actions={
                p.state === "open" && (
                  <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {p.author?.login !== account.login && (
                      <Button variant="ghost" size="icon-xs" title={t("hub.pr.approve")} aria-label={t("hub.pr.approve")} disabled={!!busy} onClick={() => void act(p, "approve")}>
                        {busy === `approve:${p.id}` ? <Loader2 className="animate-spin" /> : <ThumbsUp />}
                      </Button>
                    )}
                    {!p.draft && (
                      <Button variant="ghost" size="icon-xs" title={t("hub.pr.merge")} aria-label={t("hub.pr.merge")} disabled={!!busy} onClick={() => setMerge(p)}>
                        {busy === `merge:${p.id}` ? <Loader2 className="animate-spin" /> : <GitMerge />}
                      </Button>
                    )}
                  </span>
                )
              }
            />
          ))}
        </div>
      )}
      <AlertDialog open={merge !== null} onOpenChange={(o) => !o && setMerge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hub.pr.mergeTitle", { n: merge?.number })}</AlertDialogTitle>
            <AlertDialogDescription>{t("hub.pr.mergeBody", { title: merge?.title, repo: repo.fullName, branch: merge?.baseBranch ?? repo.defaultBranch ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (merge) void act(merge, "merge");
                setMerge(null);
              }}
            >
              {t("hub.pr.merge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function IssuesTab({ account, fullName }: { account: HubAccount; fullName: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"open" | "closed">("open");
  const [creating, setCreating] = useState(false);
  const refresh = useHubStore((s) => s.refresh);
  const q = useHubQuery(account, `issues:${fullName}:${state}`, (ad, a) => ad.issues(a, fullName, state));
  return (
    <Panel
      title={t("hub.repo.issues")}
      action={
        <span className="flex items-center gap-2">
          <StateToggle
            value={state}
            onChange={setState}
            options={[
              { id: "open", label: t("hub.state.open") },
              { id: "closed", label: t("hub.state.closed") },
            ]}
          />
          <Button size="xs" onClick={() => setCreating(true)}>
            <Plus />
            {t("hub.issue.new")}
          </Button>
        </span>
      }
      className="border-t border-border/60"
    >
      {q.error ? (
        <ErrorRow error={q.error} onRetry={refresh} />
      ) : !q.data ? (
        <SkeletonRows />
      ) : q.data.length === 0 ? (
        <EmptyRow>{t("hub.repo.noIssues")}</EmptyRow>
      ) : (
        <div className="divide-y divide-border/40">
          {q.data.map((i) => (
            <button key={i.id} type="button" onClick={() => openExternal(i.url)} className="flex min-h-11 w-full items-center gap-3 px-5 py-2 text-left text-[13px] transition-colors hover:bg-muted/40">
              <span className={cn("size-3.5 shrink-0 rounded-full border-2", i.state === "open" ? "border-git-added" : "border-[var(--chart-2)]")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate">{i.title}</span>
                  {i.labels.map((l) => (
                    <span
                      key={l.name}
                      className="shrink-0 rounded-full px-1.5 py-px text-[10px]"
                      style={l.color ? { background: `color-mix(in oklab, ${l.color} 22%, transparent)`, color: `color-mix(in oklab, ${l.color} 70%, var(--foreground))` } : undefined}
                    >
                      {l.name}
                    </span>
                  ))}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  #{i.number} · {i.author?.login} · {formatRelative(i.createdAt)}
                </span>
              </span>
              {i.comments > 0 && <span className="font-mono text-xs text-muted-foreground">{i.comments}</span>}
            </button>
          ))}
        </div>
      )}
      <NewIssueDialog account={account} fullName={fullName} open={creating} onOpenChange={setCreating} />
    </Panel>
  );
}

function NewIssueDialog({ account, fullName, open, onOpenChange }: { account: HubAccount; fullName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const refresh = useHubStore((s) => s.refresh);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const url = await adapterFor(account)!.createIssue(account, fullName, title.trim(), body);
      toast.success(t("hub.issue.created"), { action: { label: t("hub.open"), onClick: () => openExternal(url) } });
      setTitle("");
      setBody("");
      onOpenChange(false);
      refresh();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hub.issue.newIn", { repo: fullName })}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) void submit();
          }}
        >
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("hub.issue.title")} />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("hub.issue.body")} rows={8} />
          <DialogFooter>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              {t("hub.issue.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleasesTab({ account, fullName }: { account: HubAccount; fullName: string }) {
  const { t } = useTranslation();
  const refresh = useHubStore((s) => s.refresh);
  const q = useHubQuery(account, `releases:${fullName}`, (ad, a) => ad.releases(a, fullName));
  return (
    <Panel title={t("hub.repo.releases")} className="border-t border-border/60">
      {q.error ? (
        <ErrorRow error={q.error} onRetry={refresh} />
      ) : !q.data ? (
        <SkeletonRows />
      ) : q.data.length === 0 ? (
        <EmptyRow>{t("hub.repo.noReleases")}</EmptyRow>
      ) : (
        // A vertical timeline: the rail and dots are plain borders, no SVG needed.
        <ol className="relative ml-8 border-l border-border/70 py-3">
          {q.data.map((r, i) => (
            <li key={r.tag} className="relative py-2.5 pr-5 pl-6">
              <span className={cn("absolute top-4 -left-[5px] size-2.5 rounded-full ring-4 ring-background", i === 0 ? "bg-[var(--hub-accent)]" : "bg-muted-foreground/50")} />
              <button type="button" onClick={() => openExternal(r.url)} className="flex flex-wrap items-baseline gap-2 text-left">
                <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium">
                  <Tag className="size-3.5" />
                  {r.tag}
                </span>
                {r.name && r.name !== r.tag && <span className="text-[13px]">{r.name}</span>}
                {i === 0 && <span className="rounded-full bg-git-added/15 px-1.5 text-[10px] text-git-added">{t("hub.release.latest")}</span>}
                {r.prerelease && <span className="rounded-full bg-git-modified/15 px-1.5 text-[10px] text-git-modified">{t("hub.release.pre")}</span>}
                {r.publishedAt && <span className="text-xs text-muted-foreground">{formatRelative(r.publishedAt)}</span>}
              </button>
              {r.body && <p className="mt-1 line-clamp-2 max-w-3xl text-xs whitespace-pre-line text-muted-foreground">{r.body}</p>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function ActionsTab({ account, fullName }: { account: HubAccount; fullName: string }) {
  // GitHub gets the full CI workspace (jobs, graph, logs, re-run, cancel); other providers keep the run list.
  if (account.provider === "github") {
    return (
      <div className="h-[calc(100vh-14rem)] min-h-[520px] border-t border-border/60">
        <RepoCiPanel path={hubRepoPath(account, fullName)} />
      </div>
    );
  }
  return <RunList account={account} fullName={fullName} />;
}

function RunList({ account, fullName }: { account: HubAccount; fullName: string }) {
  const { t } = useTranslation();
  const refresh = useHubStore((s) => s.refresh);
  const q = useHubQuery(account, `runs:${fullName}`, (ad, a) => ad.runs(a, fullName));
  return (
    <Panel title={t("hub.repo.actions")} className="border-t border-border/60">
      {q.error ? (
        <ErrorRow error={q.error} onRetry={refresh} />
      ) : q.data === undefined ? (
        <SkeletonRows />
      ) : !q.data?.length ? (
        <EmptyRow>{t("hub.repo.noRuns")}</EmptyRow>
      ) : (
        <>
          <div className="px-5 pt-4">
            <CiStrip states={q.data.map((r) => r.status).reverse()} className="gap-1 [&>span]:h-6 [&>span]:w-2.5" />
          </div>
          <div className="mt-3 divide-y divide-border/40">
            {q.data.map((r) => (
              <button key={r.id} type="button" onClick={() => openExternal(r.url)} className="flex h-11 w-full items-center gap-3 px-5 text-left text-[13px] transition-colors hover:bg-muted/40">
                <CheckIcon state={r.status} />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.branch && <span className="max-w-40 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{r.branch}</span>}
                {r.event && <span className="hidden w-24 truncate text-xs text-muted-foreground md:block">{r.event}</span>}
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{formatRelative(r.createdAt)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
