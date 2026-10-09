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
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SpinIcon } from "@/components/motion/kit";
import { WorkflowHelpLink } from '@/components/help/workflow-help-link';

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
  return <LfsSectionContent key={path} path={path} />;
}

function LfsSectionContent({ path }: { path: string }) {
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
  const [statusLoading, setStatusLoading] = useState(true);
  const [patternsLoading, setPatternsLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [patternsError, setPatternsError] = useState('');
  const [filesError, setFilesError] = useState('');
  const alive = useRef(true);
  const requests = useRef({ status: 0, patterns: 0, files: 0 });
  const mutation = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requests.current.status++; requests.current.patterns++; requests.current.files++;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    const request = ++requests.current.status;
    setStatusLoading(true); setStatusError('');
    try {
      const result = await invoke<LfsStatus>("lfs_available", { path });
      if (alive.current && request === requests.current.status) setStatus(result);
    } catch (error) {
      if (alive.current && request === requests.current.status) setStatusError(String(error));
    } finally {
      if (alive.current && request === requests.current.status) setStatusLoading(false);
    }
  }, [path]);

  const loadPatterns = useCallback(async () => {
    const request = ++requests.current.patterns;
    setPatternsLoading(true); setPatternsError('');
    try {
      const result = await invoke<LfsPattern[]>("lfs_tracked_patterns", { path });
      if (alive.current && request === requests.current.patterns) setPatterns(result);
    } catch (error) {
      if (alive.current && request === requests.current.patterns) setPatternsError(String(error));
    } finally {
      if (alive.current && request === requests.current.patterns) setPatternsLoading(false);
    }
  }, [path]);

  const loadFiles = useCallback(
    async (nextLimit: number) => {
      const request = ++requests.current.files;
      setFilesLoading(true);
      setFilesError('');
      try {
        const result = await invoke<LfsFileList>("lfs_ls_files", { path, limit: nextLimit });
        if (alive.current && request === requests.current.files) setFileList(result);
      } catch (error) {
        if (alive.current && request === requests.current.files) setFilesError(String(error));
      } finally {
        if (alive.current && request === requests.current.files) setFilesLoading(false);
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
      requests.current.files++;
      setFileList(null);
      setFilesLoading(false); setFilesError('');
      return;
    }
    void loadFiles(limit);
  }, [status?.installed, limit, loadFiles]);

  const refresh = useCallback(() => {
    void loadStatus();
    void loadPatterns();
    if (status?.installed) void loadFiles(limit);
  }, [loadStatus, loadPatterns, loadFiles, limit, status?.installed]);

  const handleError = useCallback(
    (e: unknown) => {
      if (!alive.current) return;
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
    if (!pattern || !status?.installed || statusError || patternsError || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    try {
      await invoke<string>("lfs_track", { path, pattern });
      if (!alive.current) return;
      toast.success(t("lfs.trackDone", { pattern }));
      setNewPattern("");
      await loadPatterns();
      await loadStatus();
    } catch (e) {
      handleError(e);
    } finally {
      mutation.current = false;
      if (alive.current) setBusy(false);
    }
  }, [newPattern, status?.installed, statusError, patternsError, path, t, loadPatterns, loadStatus, handleError]);

  const removePattern = useCallback(
    async (pattern: string) => {
      if (mutation.current || !status?.installed || statusError || patternsError) return;
      mutation.current = true;
      setBusy(true);
      try {
        await invoke<string>("lfs_untrack", { path, pattern });
        if (!alive.current) return;
        toast.success(t("lfs.untrackDone", { pattern }));
        await loadPatterns();
      } catch (e) {
        handleError(e);
      } finally {
        mutation.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [path, status?.installed, statusError, patternsError, t, loadPatterns, handleError],
  );

  const pull = useCallback(async () => {
    if (mutation.current || !status?.installed || statusError) return;
    mutation.current = true;
    setPulling(true);
    try {
      await invoke<string>("lfs_pull", { path });
      if (!alive.current) return;
      toast.success(t("lfs.pullDone"));
      await loadFiles(limit);
    } catch (e) {
      handleError(e);
    } finally {
      mutation.current = false;
      if (alive.current) setPulling(false);
    }
  }, [path, status?.installed, statusError, t, limit, loadFiles, handleError]);

  const shownFiles = fileList?.files ?? [];

  return (
    <div className="shrink-0 border-b border-border/50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Database className="size-3.5" />
          {t("lfs.title")}
        </h3>
        <div className="ml-auto"><WorkflowHelpLink guideId="large-files" /></div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={refresh}
          title={t("lfs.reload")}
          aria-label={t("lfs.reloadStatus")}
          disabled={busy || pulling || statusLoading || patternsLoading || filesLoading}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {statusError && <LoadError error={statusError} retry={() => void loadStatus()} />}
      {patternsError && <LoadError error={patternsError} retry={() => void loadPatterns()} />}

      {!status && statusLoading ? <p className="mt-2 text-xs text-muted-foreground" role="status">{t('common.loading')}</p> : null}
      {status && <div className="mt-2 flex flex-col gap-1">
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
      </div>}

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            {t("lfs.patternsTitle")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            disabled={!status?.installed || !!statusError || statusLoading || busy || pulling}
            onClick={() => void pull()}
          >
            {pulling ? (
              <SpinIcon icon={Loader2} className="size-3.5" />
            ) : (
              <CloudDownload className="size-3.5" />
            )}
            {pulling ? t("lfs.pulling") : t("lfs.pull")}
          </Button>
        </div>

        {patternsLoading && patterns.length === 0 ? <p className="mt-1.5 text-xs text-muted-foreground" role="status">{t('common.loading')}</p> : !patternsError && patterns.length === 0 ? (
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
                  <span className="truncate text-[0.625rem] text-muted-foreground">
                    {p.source || ".gitattributes"}
                    {p.excluded ? ` · ${t("lfs.patternExcluded")}` : ""}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  disabled={busy || pulling || patternsLoading || !!patternsError || !!statusError}
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
            aria-label={t("lfs.addPatternPlaceholder")}
            className="h-7 font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5"
            disabled={busy || pulling || !status?.installed || statusLoading || patternsLoading || !!statusError || !!patternsError || !newPattern.trim()}
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
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
              {t("lfs.filesTitle")}
            </span>
            {fileList ? (
              <span className="text-[0.625rem] tabular-nums text-muted-foreground">
                {t("lfs.filesCount", {
                  shown: shownFiles.length,
                  total: fileList.total,
                })}
              </span>
            ) : null}
          </div>
          {filesError && <LoadError error={filesError} retry={() => void loadFiles(limit)} />}
          {filesLoading && !fileList ? (
            <div className="mt-2 flex justify-center">
              <SpinIcon icon={Loader2} className="size-4 text-primary/50" />
            </div>
          ) : !filesError && shownFiles.length === 0 ? (
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
                    className="min-w-0 flex-1 truncate font-mono text-[0.6875rem]"
                    title={f.path}
                  >
                    {f.path}
                  </span>
                  {f.size ? (
                    <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
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
                <SpinIcon icon={Loader2} className="size-3.5" />
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

function LoadError({ error, retry }: { error: string; retry: () => void }) {
  const { t } = useTranslation();
  return <div role="alert" className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 p-2 text-xs">
    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-destructive">{error}</span>
    <Button size="xs" variant="outline" onClick={retry}>{t('common.retry')}</Button>
  </div>;
}
