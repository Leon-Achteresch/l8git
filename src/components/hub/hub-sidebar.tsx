import { Book, Check, ChevronsUpDown, GitPullRequest, Home, Inbox, LogOut, Plus, RefreshCw, Search, Star, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { accountKey, useHubStore } from "@/lib/hub/store";
import type { HubAccount, HubSidebar as SidebarData } from "@/lib/hub/types";
import type { HubQuery } from "@/lib/hub/use-hub-query";
import { cn } from "@/lib/utils";

import { compact, ProviderMark, UserAvatar, useHubNav, type HubView } from "./hub-bits";

export function HubSidebar({
  account,
  view,
  repo,
  sidebar,
  onConnect,
}: {
  account: HubAccount;
  view: HubView;
  repo: string | undefined;
  sidebar: HubQuery<SidebarData>;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  const nav = useHubNav();
  const pinned = useHubStore((s) => s.pinned[accountKey(account)]);
  const [filter, setFilter] = useState("");
  const data = sidebar.data;
  const repos = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = data?.repos ?? [];
    return (q ? list.filter((r) => r.fullName.toLowerCase().includes(q)) : list).slice(0, q ? 40 : 12);
  }, [data, filter]);
  const byName = useMemo(() => new Map((data?.repos ?? []).map((r) => [r.fullName, r])), [data]);

  const items: { view: HubView; icon: ComponentType<{ className?: string }>; label: string; count?: number | null }[] = [
    { view: "home", icon: Home, label: t("hub.nav.home") },
    { view: "inbox", icon: Inbox, label: t("hub.nav.inbox") },
    { view: "prs", icon: GitPullRequest, label: t("hub.nav.pulls"), count: data?.prCount },
    { view: "reviews", icon: UserCheck, label: t("hub.nav.reviews"), count: data?.reviewCount },
    { view: "starred", icon: Star, label: t("hub.nav.starred") },
    { view: "repos", icon: Book, label: t("hub.nav.repos"), count: data?.repoCount },
  ];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar">
      <div className="p-2">
        <AccountSwitcher account={account} onConnect={onConnect} />
      </div>

      <nav className="grid gap-px px-2" aria-label={t("hub.nav.aria")}>
        {items.map((it) => (
          <NavItem key={it.view} active={view === it.view} icon={it.icon} label={it.label} count={it.count} onClick={() => nav(it.view)} />
        ))}
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!!pinned?.length && (
          <>
            <SectionLabel>{t("hub.nav.pinned")}</SectionLabel>
            {pinned.map((name) => (
              <RepoItem key={name} name={name} avatar={byName.get(name)?.ownerAvatar ?? null} stars={byName.get(name)?.stars} prs={byName.get(name)?.openPrs} active={view === "repo" && repo === name} onClick={() => nav("repo", name)} />
            ))}
          </>
        )}

        <SectionLabel>{t("hub.nav.yourRepos")}</SectionLabel>
        <label className="mb-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-muted-foreground focus-within:bg-muted/50">
          <Search className="size-3.5 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("hub.nav.filter")}
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {sidebar.loading && !data && <p className="px-2 py-1 text-xs text-muted-foreground">{t("common.loading")}</p>}
        {sidebar.error && <p className="px-2 py-1 text-xs text-destructive">{t("hub.loadFailed")}</p>}
        {repos.map((r) => (
          <RepoItem key={r.fullName} name={r.fullName} avatar={r.ownerAvatar} stars={r.stars} prs={r.openPrs} active={view === "repo" && repo === r.fullName} onClick={() => nav("repo", r.fullName)} />
        ))}
      </div>

      <SyncFooter loading={sidebar.loading} />
    </aside>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="mt-2 mb-1 px-2 text-[11px] font-medium text-muted-foreground">{children}</p>;
}

function NavItem({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: ComponentType<{ className?: string }>; label: string; count?: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate text-left">{label}</span>
      {count != null && count > 0 && <span className="font-mono text-xs text-muted-foreground">{count}</span>}
    </button>
  );
}

function RepoItem({ name, avatar, stars, prs, active, onClick }: { name: string; avatar: string | null; stars?: number | null; prs?: number | null; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
        active ? "bg-muted text-foreground" : "text-foreground/85 hover:bg-muted/50",
      )}
    >
      <UserAvatar src={avatar} login={name} size={16} className="rounded" />
      <span className="min-w-0 flex-1 truncate text-left">{name.split("/").pop()}</span>
      {!!prs && (
        <span className="flex items-center gap-0.5 font-mono text-[11px] text-muted-foreground">
          <GitPullRequest className="size-3" />
          {prs}
        </span>
      )}
      {stars != null && stars > 0 && (
        <span className="flex items-center gap-0.5 font-mono text-[11px] text-muted-foreground">
          <Star className="size-3 fill-[var(--hub-accent)] text-[var(--hub-accent)]" />
          {compact(stars)}
        </span>
      )}
    </button>
  );
}

function AccountSwitcher({ account, onConnect }: { account: HubAccount; onConnect: () => void }) {
  const { t } = useTranslation();
  const accounts = useHubStore((s) => s.accounts);
  const activate = useHubStore((s) => s.activate);
  const remove = useHubStore((s) => s.remove);
  const active = accountKey(account);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
        <UserAvatar src={account.avatar_url} login={account.login} size={22} />
        <span className="min-w-0 flex-1 truncate font-medium">{account.login}</span>
        <ProviderMark provider={account.provider} className="size-3 text-muted-foreground" />
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("hub.accounts.title")}</DropdownMenuLabel>
        {accounts.map((a) => {
          const key = accountKey(a);
          return (
            <DropdownMenuItem
              key={key}
              onSelect={() => {
                if (key === active) return;
                void activate(key, true).catch((e) => toastError(t("hub.accounts.gitSwitchFailed", { error: String(e) })));
              }}
              className="gap-2"
            >
              <UserAvatar src={a.avatar_url} login={a.login} size={20} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{a.name ?? a.login}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ProviderMark provider={a.provider} className="size-2.5" />
                  {a.login}@{a.host}
                </span>
              </span>
              {key === active && <Check className="size-3.5" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onConnect} className="gap-2">
          <Plus className="size-4" />
          {t("hub.accounts.add")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void remove(account).catch((e) => toastError(String(e)))}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {t("hub.accounts.signOut", { login: account.login })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SyncFooter({ loading }: { loading: boolean }) {
  const { t } = useTranslation();
  const syncedAt = useHubStore((s) => s.syncedAt);
  const refresh = useHubStore((s) => s.refresh);
  // Re-render the relative time twice a minute; cheap and frame-free.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <button
      type="button"
      onClick={refresh}
      className="flex h-9 items-center gap-2 border-t border-border/60 px-4 text-left text-xs text-muted-foreground hover:text-foreground"
      title={t("common.refresh")}
    >
      <span className={cn("size-1.5 rounded-full", loading ? "bg-git-modified" : "bg-git-added")} />
      <span className="flex-1">{syncedAt ? t("hub.synced", { when: formatRelative(new Date(syncedAt).toISOString()) }) : t("hub.notSynced")}</span>
      <RefreshCw className={cn("size-3", loading && "animate-spin")} />
    </button>
  );
}
