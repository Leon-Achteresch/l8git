import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type SubmoduleEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import {
  Download,
  Filter,
  FolderGit2,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SubmoduleDetail } from "./submodule-detail";
import { SubmoduleRow } from "./submodule-row";
import { getDisplayStatus } from "./submodule-status-badge";

const EMPTY: SubmoduleEntry[] = [];

function StatCard({
  value,
  label,
  highlight,
}: {
  value: number;
  label: string;
  highlight?: "red" | "amber";
}) {
  return (
    <div className="flex min-w-0 flex-col px-3 py-2.5">
      <span
        className={cn(
          "text-xl font-bold leading-none tabular-nums",
          highlight === "red" && "text-red-500",
          highlight === "amber" && "text-amber-500",
          !highlight && "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function SubmoduleList({
  path,
  onOpenAdd,
}: {
  path: string;
  onOpenAdd: () => void;
}) {
  const { t } = useTranslation();
  const submodules = useRepoStore((s) => s.submodules[path] ?? EMPTY);
  const loading = useRepoStore((s) => !!s.submodulesLoading[path]);
  const reloadSubmodules = useRepoStore((s) => s.reloadSubmodules);
  const submoduleUpdate = useRepoStore((s) => s.submoduleUpdate);
  const submoduleSync = useRepoStore((s) => s.submoduleSync);
  const [selected, setSelected] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);

  const selectedEntry = submodules.find((m) => m.path === selected) ?? null;

  const syncCount = submodules.filter(
    (m) => getDisplayStatus(m) === "synchronized",
  ).length;
  const behindTotal = submodules.reduce(
    (s, m) => s + (m.behind_count ?? 0),
    0,
  );
  const localModifiedCount = submodules.filter(
    (m) => getDisplayStatus(m) === "local_modified",
  ).length;
  const detachedCount = submodules.filter(
    (m) => getDisplayStatus(m) === "detached",
  ).length;
  const problemCount = submodules.filter((m) => {
    const ds = getDisplayStatus(m);
    return (
      ds === "behind" ||
      ds === "local_modified" ||
      ds === "detached" ||
      ds === "conflict"
    );
  }).length;

  const displayList = showProblems
    ? submodules.filter((m) => {
        const ds = getDisplayStatus(m);
        return (
          ds === "behind" ||
          ds === "local_modified" ||
          ds === "detached" ||
          ds === "conflict"
        );
      })
    : submodules;

  const bulkRun = async (fn: () => Promise<string>, msg: string) => {
    setBulkBusy(true);
    try {
      const out = await fn();
      toast.success(out || msg);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const handlePull = (entry: SubmoduleEntry) => {
    void bulkRun(
      () =>
        submoduleUpdate(
          path,
          entry.path,
          entry.status === "uninitialized",
          false,
        ),
      t("submodule.toastUpdatedOne", { name: entry.name }),
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5 text-[11px]"
            disabled={bulkBusy || submodules.length === 0}
            onClick={() =>
              void bulkRun(
                () => submoduleUpdate(path, undefined, true, false),
                t("submodule.toastAllUpdated"),
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
            {t("submodule.listInitUpdate")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5 text-[11px]"
            disabled={bulkBusy || submodules.length === 0}
            onClick={() =>
              void bulkRun(
                () => submoduleSync(path),
                t("submodule.toastUrlsSynced"),
              )
            }
          >
            <RefreshCw className={cn("h-3.5 w-3.5", bulkBusy && "animate-spin")} />
            {t("submodule.listSyncUrls")}
          </Button>
          {behindTotal > 0 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="gap-1.5 text-[11px] text-red-500 hover:text-red-500"
              disabled={bulkBusy}
              onClick={() =>
                void bulkRun(
                  () => submoduleUpdate(path, undefined, true, false),
                  t("submodule.toastAllPulled"),
                )
              }
            >
              <Download className="h-3.5 w-3.5" />
              {t("submodule.listPullAll")}
              <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-500">
                {behindTotal}
              </span>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {problemCount > 0 && (
            <Button
              type="button"
              variant={showProblems ? "secondary" : "ghost"}
              size="xs"
              className="gap-1 text-[11px]"
              onClick={() => setShowProblems((v) => !v)}
            >
              <Filter className="h-3 w-3" />
              {t("submodule.listProblemsWith", { count: problemCount })}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={() => onOpenAdd()}
            aria-label={t("submodule.addAria")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            disabled={loading}
            onClick={() => void reloadSubmodules(path)}
            aria-label={t("submodule.reloadAria")}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 divide-x divide-border/50 border-b border-border/50 bg-muted/20">
        <StatCard value={submodules.length} label={t("submodule.statSubmodulesLabel")} />
        <StatCard value={syncCount} label={t("submodule.statSyncedLabel")} />
        {behindTotal > 0 && (
          <StatCard value={behindTotal} label={t("submodule.statBehindLabel")} highlight="red" />
        )}
        {localModifiedCount > 0 && (
          <StatCard value={localModifiedCount} label={t("submodule.statLocalModifiedLabel")} highlight="amber" />
        )}
        {detachedCount > 0 && (
          <StatCard value={detachedCount} label={t("submodule.statDetachedLabel")} />
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "flex min-h-0 flex-col border-border/50",
            selectedEntry ? "w-[45%] min-w-[220px] border-r" : "flex-1",
          )}
        >
          {submodules.length > 0 && (
            <div className="grid shrink-0 grid-cols-[2fr_1fr_1fr_1fr_auto] border-b border-border/40 bg-muted/30 px-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="px-3 py-1.5">{t("submodule.colSubmodule")}</div>
              <div className="px-2 py-1.5">{t("submodule.colBranch")}</div>
              <div className="px-2 py-1.5">{t("submodule.colPinned")}</div>
              <div className="px-2 py-1.5">{t("submodule.colRemote")}</div>
              <div className="px-3 py-1.5">{t("submodule.colStatus")}</div>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            {loading && submodules.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin opacity-40" />
                <span className="text-sm font-medium">{t("submodule.loading")}</span>
              </div>
            ) : submodules.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <FolderGit2 className="h-10 w-10 opacity-20" />
                <span className="text-sm font-medium">{t("submodule.none")}</span>
                <span className="max-w-[220px] text-xs opacity-80">
                  {t("submodule.emptyHint")}
                </span>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {displayList.map((m) => (
                  <SubmoduleRow
                    key={m.path}
                    path={path}
                    entry={m}
                    selected={selected === m.path}
                    onSelect={() =>
                      setSelected((p) => (p === m.path ? null : m.path))
                    }
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {selectedEntry && (
          <div className="min-h-0 flex-1">
            <SubmoduleDetail
              repoPath={path}
              entry={selectedEntry}
              onPull={() => handlePull(selectedEntry)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
