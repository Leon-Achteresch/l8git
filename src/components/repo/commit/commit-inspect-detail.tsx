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
import { GitBlameSheet } from "@/components/repo/blame/git-blame-sheet";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommitInspectHeader } from "./commit-inspect-header";
import { CommitInspectMessage } from "./commit-inspect-message";
import { CommitInspectFileTabs } from "./commit-inspect-file-tabs";
import { CommitInspectDiff, FileDiffPayload } from "./commit-inspect-diff";
import { CommitChangedFile } from "./commit-inspect-file-item";

type InspectPayload = { header: string; files: CommitChangedFile[] };

export function CommitInspectDetail({
  path,
  commitHash,
  onClose,
}: {
  path: string;
  commitHash: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<InspectPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);
  const [blameActive, setBlameActive] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState<{ files: string[] } | null>(null);

  const loadInspect = useCallback(async () => {
    if (!commitHash) {
      setPayload(null);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const out = await invoke<InspectPayload>("repo_commit_inspect", {
        path,
        commit: commitHash,
      });
      setPayload(out);
    } catch (e) {
      setFailed(true);
      setPayload(null);
      toastError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, commitHash]);

  const loadFileDiff = useCallback(async () => {
    if (!commitHash || !selectedFile) {
      setFileDiff(null);
      setDiffFailed(false);
      return;
    }
    setDiffLoading(true);
    setDiffFailed(false);
    try {
      const out = await invoke<FileDiffPayload>("repo_commit_file_diff", {
        path,
        commit: commitHash,
        file: selectedFile,
      });
      setFileDiff(out);
    } catch (e) {
      setDiffFailed(true);
      setFileDiff(null);
      toastError(String(e));
    } finally {
      setDiffLoading(false);
    }
  }, [path, commitHash, selectedFile]);

  useEffect(() => {
    void loadInspect();
  }, [loadInspect]);

  useEffect(() => {
    setSelectedFile(null);
    setFileDiff(null);
    setDiffFailed(false);
    setBlameActive(false);
  }, [commitHash]);

  useEffect(() => {
    void loadFileDiff();
  }, [loadFileDiff]);

  useEffect(() => {
    if (!commitHash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commitHash, onClose]);

  const restoreFilesAtCommit = useRepoStore((s) => s.restoreFilesAtCommit);

  const discardFile = useCallback(
    (filePath: string) => {
      if (!commitHash) return;
      setRestoreDialog({ files: [filePath] });
    },
    [commitHash],
  );

  const confirmRestore = useCallback(async () => {
    if (!commitHash || !restoreDialog) return;
    const { files } = restoreDialog;
    setRestoreDialog(null);
    try {
      await restoreFilesAtCommit(path, commitHash, files);
    } catch (e) {
      toastError(String(e));
    }
  }, [commitHash, restoreDialog, restoreFilesAtCommit, path]);

  const refreshAll = useCallback(() => {
    void loadInspect();
    void loadFileDiff();
  }, [loadInspect, loadFileDiff]);

  if (!commitHash) {
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background/95 backdrop-blur-sm">
      <CommitInspectHeader
        title={t("commitInspect.panelTitle")}
        onRefresh={refreshAll}
        onClose={onClose}
        loading={loading}
      />
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-medium tracking-wide text-muted-foreground animate-pulse">
              {t("commitInspect.loadingDetails")}
            </span>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive">
              <Loader2 className="h-6 w-6" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {t("commitInspect.detailLoadFailed")}
            </span>
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
                onDiscardFile={discardFile}
              />
              <div className="flex min-h-0 flex-1 flex-col">
                {blameActive && selectedFile ? (
                  <GitBlameSheet
                    path={path}
                    file={selectedFile}
                    commit={commitHash ?? undefined}
                    onClose={() => setBlameActive(false)}
                  />
                ) : (
                  <CommitInspectDiff
                    selectedFile={selectedFile}
                    fileDiff={fileDiff}
                    loading={diffLoading}
                    failed={diffFailed}
                  />
                )}
              </div>
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
    </div>
  );
}
