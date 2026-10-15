import { useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  LayoutGrid,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { SpinIcon } from "@/components/motion/kit";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { RepoTabPicker } from "@/components/repo/tabs/repo-tab-picker";
import { useRepoForest } from "@/components/repo/tabs/use-repo-forest";
import { repoAvatarHue, repoInitialChar } from "@/lib/repo-avatar";
import { groupRepoPaths } from "@/lib/repo-groups-store";
import { repoLabel, useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/workspace-store";

const useRecentRepoStore = create<{ recent: string[]; touch: (path: string) => void }>()(
  persist(
    (set) => ({
      recent: [],
      touch: (path) =>
        set((s) => ({ recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, 12) })),
    }),
    { name: "l8git-recent-repos", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Records the active repo in the most-recently-used list. Mount once. */
export function useTrackRecentRepos() {
  const activePath = useRepoStore((s) => s.activePath);
  useEffect(() => {
    if (activePath) useRecentRepoStore.getState().touch(activePath);
  }, [activePath]);
}

function useOpenRepo() {
  const router = useRouter();
  return (path: string) => {
    useRepoStore.getState().setActive(path);
    void router.navigate({ to: "/" });
  };
}

function useRepoSummary(path: string) {
  return useRepoStore(
    useShallow((s) => {
      const sync = s.upstreamSync[path];
      const upstream = !!s.hasUpstream[path];
      const conflicts = Math.max(
        s.mergeState[path]?.conflicted_paths?.length ?? 0,
        s.cherryPickState[path]?.conflicted_paths?.length ?? 0,
      );
      return {
        favicon: s.customFavicons?.[path] ?? s.favicons[path] ?? null,
        loading: !!s.loading[path],
        branch: s.repos[path]?.branch ?? null,
        lastSubject: s.repos[path]?.commits?.[0]?.subject ?? null,
        ahead: upstream && !conflicts ? (sync?.ahead ?? 0) : 0,
        behind: upstream && !conflicts ? (sync?.behind ?? 0) : 0,
        conflicts,
      };
    }),
  );
}

export function RepoAvatar({ path, className }: { path: string; className?: string }) {
  const label = repoLabel(path);
  const { favicon, loading } = useRepoSummary(path);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [favicon]);
  const showFavicon = !!favicon && !broken;
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-[18px] shrink-0 items-center justify-center overflow-hidden rounded font-mono text-[0.5625rem] font-bold text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]",
        className,
      )}
      style={showFavicon ? undefined : { backgroundColor: `hsl(${repoAvatarHue(label)} 42% 36%)` }}
    >
      {loading ? (
        <SpinIcon icon={Loader2} className="size-3 text-white/90" />
      ) : showFavicon ? (
        <img src={favicon ?? undefined} alt="" onError={() => setBroken(true)} className="size-full object-contain" />
      ) : (
        repoInitialChar(label)
      )}
    </span>
  );
}

export function RepoSyncBadges({ path, className }: { path: string; className?: string }) {
  const { ahead, behind, conflicts } = useRepoSummary(path);
  if (!ahead && !behind && !conflicts) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 font-mono text-[0.625rem] font-semibold", className)}>
      {conflicts > 0 && (
        <span className="inline-flex items-center gap-0.5 text-git-modified">
          <AlertTriangle className="size-3" aria-hidden />
          {conflicts}
        </span>
      )}
      {ahead > 0 && (
        <span className="inline-flex items-center gap-px text-git-branch">
          <ArrowUp className="size-3" aria-hidden />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="inline-flex items-center gap-px text-git-removed">
          <ArrowDown className="size-3" aria-hidden />
          {behind}
        </span>
      )}
    </span>
  );
}

/** Name of the active repo, used as page title in layouts without repo tabs. */
export function ActiveRepoTitle() {
  const activePath = useRepoStore((s) => s.activePath);
  if (!activePath) return null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <RepoAvatar path={activePath} />
      <span className="truncate text-sm font-semibold tracking-tight">{repoLabel(activePath)}</span>
      <RepoSyncBadges path={activePath} />
    </span>
  );
}

export function ActiveWorkspaceName() {
  const { t } = useTranslation();
  const name = useWorkspaceStore(
    (s) => (s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? s.workspaces[0])?.name ?? "",
  );
  const { pickerPaths } = useRepoForest();
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-[0.8125rem] font-semibold">{name}</span>
      <span className="truncate text-[0.6875rem] text-muted-foreground">
        {t("shellLayout.repoCount", { count: pickerPaths.length })}
      </span>
    </span>
  );
}

/** Breadcrumb segment that opens the searchable repo picker. */
export function RepoSwitcher() {
  const { t } = useTranslation();
  const activePath = useRepoStore((s) => s.activePath);
  const { pickerPaths } = useRepoForest();
  return (
    <RepoTabPicker
      paths={pickerPaths}
      activePath={activePath}
      align="start"
      trigger={
        <button
          type="button"
          aria-label={t("repoTabPicker.openAria")}
          className="inline-flex h-8 min-w-0 shrink items-center gap-2 rounded-lg px-2 text-[0.8125rem] font-semibold transition-colors hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.08]"
        >
          {activePath ? (
            <>
              <RepoAvatar path={activePath} className="size-5 rounded-md" />
              <span className="truncate">{repoLabel(activePath)}</span>
              <RepoSyncBadges path={activePath} />
            </>
          ) : (
            <span className="text-muted-foreground">{t("shellLayout.noRepo")}</span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      }
    />
  );
}

export function BreadcrumbSlash() {
  return (
    <span aria-hidden className="shrink-0 select-none text-lg font-light text-foreground/20">
      /
    </span>
  );
}

/** Active repo pill plus the most recently used repos of the workspace. */
export function RecentRepoPills({ limit = 3 }: { limit?: number }) {
  const activePath = useRepoStore((s) => s.activePath);
  const recent = useRecentRepoStore((s) => s.recent);
  const { pickerPaths } = useRepoForest();
  const open = useOpenRepo();
  const others = useMemo(() => {
    const ranked = recent.filter((p) => p !== activePath && pickerPaths.includes(p));
    const rest = pickerPaths.filter((p) => p !== activePath && !ranked.includes(p));
    return [...ranked, ...rest].slice(0, limit);
  }, [recent, pickerPaths, activePath, limit]);
  return (
    <div className="flex min-w-0 items-center gap-1">
      {activePath && (
        <span className="flex h-8 min-w-0 shrink-0 items-center gap-2 rounded-xl bg-card px-2 shadow-xs ring-1 ring-border">
          <RepoAvatar path={activePath} className="size-5 rounded-md" />
          <span className="max-w-[160px] truncate text-[0.8125rem] font-semibold">{repoLabel(activePath)}</span>
          <RepoSyncBadges path={activePath} />
        </span>
      )}
      {others.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => open(path)}
          title={path}
          className="flex h-7 min-w-0 shrink items-center gap-1.5 rounded-lg px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <RepoAvatar path={path} />
          <span className="max-w-[120px] truncate">{repoLabel(path)}</span>
          <RepoSyncBadges path={path} />
        </button>
      ))}
    </div>
  );
}

function ExposeCard({ path, active, onPick }: { path: string; active: boolean; onPick: () => void }) {
  const { branch, lastSubject } = useRepoSummary(path);
  return (
    <button
      type="button"
      onClick={onPick}
      title={path}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-3.5 text-left shadow-[var(--ag-shadow-raise)] ring-1 transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "ring-2 ring-foreground" : "ring-border hover:ring-foreground/25",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <RepoAvatar path={path} className="size-8 rounded-[10px] text-xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[0.8125rem] font-semibold">{repoLabel(path)}</span>
          {branch && <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">{branch}</span>}
        </span>
        <RepoSyncBadges path={path} />
      </span>
      <span className="truncate text-xs text-muted-foreground">{lastSubject ?? " "}</span>
    </button>
  );
}

/** Full-window overview of all repos of the workspace, grouped like the tab strip. */
export function RepoExposeButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activePath = useRepoStore((s) => s.activePath);
  const { filteredForest, pickerPaths } = useRepoForest();
  const openRepo = useOpenRepo();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const sections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const match = (p: string) =>
      !needle || repoLabel(p).toLocaleLowerCase().includes(needle) || p.toLocaleLowerCase().includes(needle);
    const loose = filteredForest.flatMap((n) => (n.type === "repo" ? [n.path] : []));
    const out = [{ id: "_repos", name: t("shellLayout.exposeRepos"), paths: loose.filter(match) }];
    for (const node of filteredForest) {
      if (node.type === "group") out.push({ id: node.id, name: node.name, paths: groupRepoPaths(node).filter(match) });
    }
    return out.filter((s) => s.paths.length > 0);
  }, [filteredForest, query, t]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("shellLayout.exposeOpen")}
        title={t("shellLayout.exposeOpen")}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        <span className="tabular-nums">{t("shellLayout.exposeAll", { count: pickerPaths.length })}</span>
      </button>
      <OverlayPortal>
        <AnimatePresence>
          {open && (
            <m.div
              key="expose"
              role="dialog"
              aria-modal="true"
              aria-label={t("shellLayout.exposeOpen")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) close();
              }}
              className="fixed inset-x-0 bottom-0 top-12 z-[70] overflow-y-auto bg-background/85 px-10 py-6 backdrop-blur-md"
            >
              <m.div
                initial={{ y: 8, scale: 0.99 }}
                animate={{ y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="mx-auto flex max-w-6xl flex-col gap-5"
              >
                <div className="flex items-center gap-2">
                  <label className="flex h-9 w-full max-w-sm items-center gap-2 rounded-xl bg-card px-3 shadow-xs ring-1 ring-border">
                    <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("repoTabPicker.searchPlaceholder")}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                    />
                  </label>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t("common.close")}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {sections.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">{t("repoTabPicker.empty")}</p>
                )}
                {sections.map((section) => (
                  <section key={section.id} className="flex flex-col gap-2.5">
                    <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.name}
                    </h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                      {section.paths.map((path) => (
                        <ExposeCard
                          key={path}
                          path={path}
                          active={path === activePath}
                          onPick={() => {
                            openRepo(path);
                            close();
                          }}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </OverlayPortal>
    </>
  );
}
