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
import { useExplainSheet } from "@/components/ai/explain-sheet";
import { GitBlameSheet } from "@/components/repo/blame/git-blame-sheet";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommitInspectHeader } from "./commit-inspect-header";
import { CommitSignatureBadge } from "./commit-signature-badge";
import { CommitInspectMessage } from "./commit-inspect-message";
import { CommitInspectFileTabs } from "./commit-inspect-file-tabs";
import { CommitInspectDiff, FileDiffPayload } from "./commit-inspect-diff";
import { CommitChangedFile } from "./commit-inspect-file-item";
import { SpinIcon, pulseKeyframes, pulseTransition } from "@/components/motion/kit";
import { m } from "motion/react";

type InspectPayload = { header: string; files: CommitChangedFile[] };

export function CommitInspectDetail({
  path,
  commitHash,
  onClose,
  readOnly = false,
}: {
  path: string;
  commitHash: string | null;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const inspectKey = JSON.stringify([path, commitHash]);
  const inspectEpoch = useRef(0);
  const diffEpoch = useRef(0);
  const [inspectState, setInspectState] = useState({ key: '', payload: null as InspectPayload | null, loading: false, failed: false });
  const payload = inspectState.key === inspectKey ? inspectState.payload : null;
  const loading = !!commitHash && (inspectState.key !== inspectKey || inspectState.loading);
  const failed = inspectState.key === inspectKey && inspectState.failed;
  const [fileSelection, setFileSelection] = useState({ key: '', file: null as string | null });
  const selectedFile = fileSelection.key === inspectKey ? fileSelection.file : null;
  const setSelectedFile = useCallback((next: string | null | ((current: string | null) => string | null)) => {
    setFileSelection(previous => ({ key: inspectKey, file: typeof next === 'function' ? next(previous.key === inspectKey ? previous.file : null) : next }));
  }, [inspectKey]);
  const diffKey = JSON.stringify([path, commitHash, selectedFile]);
  const [diffState, setDiffState] = useState({ key: '', data: null as FileDiffPayload | null, loading: false, failed: false });
  const fileDiff = diffState.key === diffKey ? diffState.data : null;
  const diffLoading = !!commitHash && !!selectedFile && (diffState.key !== diffKey || diffState.loading);
  const diffFailed = diffState.key === diffKey && diffState.failed;
  const [blameActive, setBlameActive] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const [restoreDialog, setRestoreDialog] = useState<{ path: string; commitHash: string; files: string[] } | null>(null);
  const explain = useExplainSheet();

  const loadInspect = useCallback(async () => {
    const epoch = ++inspectEpoch.current;
    if (!commitHash) {
      setInspectState({ key: inspectKey, payload: null, loading: false, failed: false });
      return;
    }
    setInspectState(previous => ({ key: inspectKey, payload: previous.key === inspectKey ? previous.payload : null, loading: true, failed: false }));
    try {
      const out = await invoke<InspectPayload>("repo_commit_inspect", { path, commit: commitHash });
      if (inspectEpoch.current !== epoch) return;
      setInspectState({ key: inspectKey, payload: out, loading: false, failed: false });
      setSelectedFile(current => out.files.some(file => file.path === current) ? current : out.files[0]?.path ?? null);
    } catch (error) {
      if (inspectEpoch.current !== epoch) return;
      setInspectState({ key: inspectKey, payload: null, loading: false, failed: true });
      toastError(String(error));
    }
  }, [path, commitHash, inspectKey, setSelectedFile]);

  const loadFileDiff = useCallback(async () => {
    const epoch = ++diffEpoch.current;
    if (!commitHash || !selectedFile) {
      setDiffState({ key: diffKey, data: null, loading: false, failed: false });
      return;
    }
    setDiffState({ key: diffKey, data: null, loading: true, failed: false });
    try {
      const out = await invoke<FileDiffPayload>("repo_commit_file_diff", { path, commit: commitHash, file: selectedFile });
      if (diffEpoch.current !== epoch) return;
      setDiffState({ key: diffKey, data: out, loading: false, failed: false });
    } catch (error) {
      if (diffEpoch.current !== epoch) return;
      setDiffState({ key: diffKey, data: null, loading: false, failed: true });
      toastError(String(error));
    }
  }, [path, commitHash, selectedFile, diffKey]);

  useEffect(() => {
    setSelectedFile(null);
    setBlameActive(false);
    setFileQuery("");
    setRestoreDialog(null);
  }, [path, commitHash, setSelectedFile]);

  useEffect(() => {
    void loadInspect();
    return () => { inspectEpoch.current++; };
  }, [loadInspect]);

  useEffect(() => {
    // Holding an arrow key in the file list should not run one git diff per repeat.
    const timer = window.setTimeout(() => void loadFileDiff(), 100);
    return () => { window.clearTimeout(timer); diffEpoch.current++; };
  }, [loadFileDiff]);

  useEffect(() => {
    if (!commitHash) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || restoreDialog) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="combobox"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commitHash, onClose, restoreDialog]);

  const restoreFilesAtCommit = useRepoStore((s) => s.restoreFilesAtCommit);

  const discardFile = useCallback(
    (filePath: string) => {
      if (!commitHash || readOnly) return;
      setRestoreDialog({ path, commitHash, files: [filePath] });
    },
    [path, commitHash, readOnly],
  );

  const confirmRestore = useCallback(async () => {
    if (!restoreDialog || readOnly) return;
    const { path: restorePath, commitHash: restoreCommitHash, files } = restoreDialog;
    setRestoreDialog(null);
    try {
      await restoreFilesAtCommit(restorePath, restoreCommitHash, files);
    } catch (e) {
      toastError(String(e));
    }
  }, [restoreDialog, restoreFilesAtCommit, readOnly]);

  const refreshAll = useCallback(() => {
    void loadInspect();
    void loadFileDiff();
  }, [loadInspect, loadFileDiff]);

  if (!commitHash) {
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <CommitInspectHeader
        title={t("commitInspect.panelTitle")}
        badge={<CommitSignatureBadge path={path} commitHash={commitHash} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-lg border border-border/70 bg-background text-foreground shadow-xs hover:bg-muted"
            onClick={() =>
              explain.open({ kind: "commit", repoPath: path, commitHash })
            }
          >
            <Sparkles className="h-4 w-4" />
            {t("commitInspect.explainCommit")}
          </Button>
        }
        onRefresh={refreshAll}
        onClose={onClose}
        loading={loading}
      />
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <SpinIcon icon={Loader2} className="h-8 w-8 text-primary" />
            <m.span animate={pulseKeyframes} transition={pulseTransition} className="text-sm font-medium tracking-wide text-muted-foreground">
              {t("commitInspect.loadingDetails")}
            </m.span>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive">
              <Loader2 className="h-6 w-6" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {t("commitInspect.detailLoadFailed")}
            </span>
            <Button variant="outline" size="sm" onClick={() => void loadInspect()}>{t("common.retry")}</Button>
          </div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            {payload?.header ? (
              <CommitInspectMessage message={payload.header} />
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/5">
              <CommitInspectFileTabs
                files={payload?.files ?? []}
                selectedFile={selectedFile}
                onSelectFile={(f) => {
                  setSelectedFile(f);
                  setBlameActive(false);
                }}
                onBlame={(f) => {
                  setSelectedFile(f);
                  setBlameActive(true);
                }}
                onDiscardFile={readOnly ? undefined : discardFile}
                query={fileQuery}
                onQueryChange={setFileQuery}
              >
                {blameActive && selectedFile ? (
                  <GitBlameSheet
                    path={path}
                    file={selectedFile}
                    commit={commitHash ?? undefined}
                    onClose={() => setBlameActive(false)}
                  />
                ) : (
                  <CommitInspectDiff
                    repoPath={path}
                    commitHash={commitHash}
                    selectedFile={selectedFile}
                    fileDiff={fileDiff}
                    loading={diffLoading}
                    failed={diffFailed}
                  />
                )}
              </CommitInspectFileTabs>
            </div>
          </div>
        )}
      </div>
      <AlertDialog open={!!restoreDialog} onOpenChange={(open) => { if (!open) setRestoreDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("commitInspect.resetDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreDialog && restoreDialog.files.length === 1
                ? t("commitInspect.resetConfirmOne", { path: restoreDialog.files[0] })
                : t("commitInspect.resetConfirmMany", { count: restoreDialog?.files.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction size="sm" variant="destructive" onClick={() => void confirmRestore()}>
              {t("commitInspect.resetConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {explain.element}
    </div>
  );
}
