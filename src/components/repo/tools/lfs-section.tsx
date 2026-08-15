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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import { isLfsUnavailable } from "@/lib/media";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  CircleAlert,
  CloudDownload,
  Database,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const INSTALL_URL = "https://git-lfs.com";
const PAGE_SIZE = 50;

type LfsStatus = {
  installed: boolean;
  version: string | null;
  initialized: boolean;
  hasAttributes: boolean;
};

type LfsPattern = {
  pattern: string;
  source: string;
  excluded: boolean;
};

type LfsFile = {
  oid: string;
  path: string;
  size: string;
  downloaded: boolean;
};

type LfsFileList = {
  files: LfsFile[];
  total: number;
  truncated: boolean;
};

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <CheckCircle2 className="size-3.5 text-git-added" />
      ) : (
        <CircleAlert className="size-3.5 text-git-modified" />
      )}
      <span className={ok ? "text-foreground/80" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

export function LfsSection({ path }: { path: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LfsStatus | null>(null);
  const [patterns, setPatterns] = useState<LfsPattern[]>([]);
  const [fileList, setFileList] = useState<LfsFileList | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [newPattern, setNewPattern] = useState("");
  const [busy, setBusy] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<LfsPattern | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await invoke<LfsStatus>("lfs_available", { path }));
    } catch {
      setStatus({
        installed: false,
        version: null,
        initialized: false,
        hasAttributes: false,
      });
    }
  }, [path]);

  const loadPatterns = useCallback(async () => {
    try {
      setPatterns(await invoke<LfsPattern[]>("lfs_tracked_patterns", { path }));
    } catch {
      setPatterns([]);
    }
  }, [path]);

  const loadFiles = useCallback(
    async (nextLimit: number) => {
      setFilesLoading(true);
      try {
        setFileList(
          await invoke<LfsFileList>("lfs_ls_files", { path, limit: nextLimit }),
        );
      } catch {
        setFileList(null);
      } finally {
        setFilesLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    setLimit(PAGE_SIZE);
    setNewPattern("");
    void loadStatus();
    void loadPatterns();
  }, [loadStatus, loadPatterns]);

  useEffect(() => {
    if (!status?.installed) {
      setFileList(null);
      return;
    }
    void loadFiles(limit);
  }, [status?.installed, limit, loadFiles]);

  const refresh = useCallback(() => {
    void loadStatus();
    void loadPatterns();
    void loadFiles(limit);
  }, [loadStatus, loadPatterns, loadFiles, limit]);

  const handleError = useCallback(
    (e: unknown) => {
      if (isLfsUnavailable(e)) {
        toastError(t("lfs.unavailable"));
        void loadStatus();
        return;
      }
      toastError(String(e));
    },
    [t, loadStatus],
  );

  const addPattern = useCallback(async () => {
    const pattern = newPattern.trim();
    if (!pattern || busy) return;
    setBusy(true);
    try {
      await invoke<string>("lfs_track", { path, pattern });
      toast.success(t("lfs.trackDone", { pattern }));
      setNewPattern("");
      await loadPatterns();
      await loadStatus();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }, [newPattern, busy, path, t, loadPatterns, loadStatus, handleError]);

  const removePattern = useCallback(
    async (pattern: string) => {
      setBusy(true);
      try {
        await invoke<string>("lfs_untrack", { path, pattern });
        toast.success(t("lfs.untrackDone", { pattern }));
        await loadPatterns();
      } catch (e) {
        handleError(e);
      } finally {
        setBusy(false);
      }
    },
    [path, t, loadPatterns, handleError],
  );

  const pull = useCallback(async () => {
    setPulling(true);
    try {
      await invoke<string>("lfs_pull", { path });
      toast.success(t("lfs.pullDone"));
      await loadFiles(limit);
    } catch (e) {
      handleError(e);
    } finally {
      setPulling(false);
    }
  }, [path, t, limit, loadFiles, handleError]);

  const shownFiles = fileList?.files ?? [];

  return (
    <div className="shrink-0 border-b border-border/50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Database className="size-3.5" />
          {t("lfs.title")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={refresh}
          title={t("lfs.reload")}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <StatusLine
          ok={!!status?.installed}
          label={
            status?.installed
              ? status.version
                ? t("lfs.statusInstalledVersion", {
                    version: status.version.trim().split(/\s+/)[0],
                  })
                : t("lfs.statusInstalled")
              : t("lfs.statusNotInstalled")
          }
        />
        <StatusLine
          ok={!!status?.initialized}
          label={
            status?.initialized
              ? t("lfs.statusInitialized")
              : t("lfs.statusNotInitialized")
          }
        />
        {status && !status.installed ? (
          <div className="mt-1 flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{t("lfs.unavailable")}</p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => void openUrl(INSTALL_URL)}
            >
              <ExternalLink className="size-3" />
              {t("lfs.installLink")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("lfs.patternsTitle")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            disabled={!status?.installed || pulling}
            onClick={() => void pull()}
          >
            {pulling ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CloudDownload className="size-3.5" />
            )}
            {pulling ? t("lfs.pulling") : t("lfs.pull")}
          </Button>
        </div>

        {patterns.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground/80">
            {t("lfs.patternsEmpty")}
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col divide-y divide-border/30 rounded-md border border-border/60 bg-card/40">
            {patterns.map((p) => (
              <li
                key={`${p.source}-${p.pattern}`}
                className="flex items-center justify-between gap-2 px-2 py-1.5"
              >
                <div className="flex min-w-0 flex-col">
                  <code
                    className={cn(
                      "truncate font-mono text-xs",
                      p.excluded && "line-through opacity-70",
                    )}
                  >
                    {p.pattern}
                  </code>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {p.source || ".gitattributes"}
                    {p.excluded ? ` · ${t("lfs.patternExcluded")}` : ""}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  disabled={busy}
                  title={t("lfs.removePattern")}
                  onClick={() => setPendingRemove(p)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-1.5 flex items-center gap-1.5">
          <Input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addPattern();
              }
            }}
            placeholder={t("lfs.addPatternPlaceholder")}
            className="h-7 font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5"
            disabled={busy || !newPattern.trim()}
            onClick={() => void addPattern()}
          >
            <Plus className="size-3.5" />
            {t("lfs.addPattern")}
          </Button>
        </div>
      </div>

      {status?.installed ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("lfs.filesTitle")}
            </span>
            {fileList ? (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {t("lfs.filesCount", {
                  shown: shownFiles.length,
                  total: fileList.total,
                })}
              </span>
            ) : null}
          </div>
          {filesLoading && !fileList ? (
            <div className="mt-2 flex justify-center">
              <Loader2 className="size-4 animate-spin text-primary/50" />
            </div>
          ) : shownFiles.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground/80">
              {t("lfs.filesEmpty")}
            </p>
          ) : (
            <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-card/40 divide-y divide-border/30">
              {shownFiles.map((f) => (
                <li
                  key={`${f.oid}-${f.path}`}
                  className="flex items-center gap-2 px-2 py-1.5"
                >
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[11px]"
                    title={f.path}
                  >
                    {f.path}
                  </span>
                  {f.size ? (
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {f.size}
                    </span>
                  ) : null}
                  <Badge
                    variant={f.downloaded ? "success" : "warning"}
                    className="shrink-0"
                  >
                    {f.downloaded ? t("lfs.downloaded") : t("lfs.pointerOnly")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {fileList?.truncated ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1.5 h-7 w-full gap-1.5"
              disabled={filesLoading}
              onClick={() => setLimit((v) => v + PAGE_SIZE)}
            >
              {filesLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {t("lfs.loadMore")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <AlertDialog
        open={!!pendingRemove}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("lfs.removeConfirmTitle", {
                pattern: pendingRemove?.pattern ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("lfs.removeConfirmDesc", {
                pattern: pendingRemove?.pattern ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              variant="destructive"
              onClick={() => {
                const pattern = pendingRemove?.pattern;
                setPendingRemove(null);
                if (pattern) void removePattern(pattern);
              }}
            >
              {t("lfs.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
