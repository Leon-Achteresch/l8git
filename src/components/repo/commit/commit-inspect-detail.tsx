import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CommitInspectHeader } from "./commit-inspect-header";
import { CommitInspectMessage } from "./commit-inspect-message";
import { CommitInspectFileList } from "./commit-inspect-file-list";
import { CommitInspectSplitHeader } from "./commit-inspect-split-header";
import { CommitInspectDiff, FileDiffPayload } from "./commit-inspect-diff";
import { CommitChangedFile } from "./commit-inspect-file-item";
import { writeLocalStorageDebounced } from "@/lib/utils";

type InspectPayload = { header: string; files: CommitChangedFile[] };

const innerLayoutKey = "l8git.commit-inspect-inner.v3";

function readSplitFlexFromStorage(): { files: number; diff: number } {
  const raw = localStorage.getItem(innerLayoutKey);
  if (!raw) return { files: 34, diff: 66 };
  try {
    const p = JSON.parse(raw) as Record<string, number>;
    const f = p.cifiles;
    const d = p.cidiff;
    if (typeof f === "number" && typeof d === "number" && f > 0 && d > 0) {
      return { files: f, diff: d };
    }
  } catch {
    return { files: 34, diff: 66 };
  }
  return { files: 34, diff: 66 };
}

export function CommitInspectDetail({
  path,
  commitHash,
  onClose,
}: {
  path: string;
  commitHash: string | null;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<InspectPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);
  const [splitFlex, setSplitFlex] = useState(readSplitFlexFromStorage);
  const [defaultInnerLayout] = useState<Record<string, number> | undefined>(
    () => {
      const raw = localStorage.getItem(innerLayoutKey);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as Record<string, number>;
      } catch {
        return undefined;
      }
    },
  );

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
        onRefresh={refreshAll}
        onClose={onClose}
        loading={loading}
      />
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-medium tracking-wide text-muted-foreground animate-pulse">
              Lade Details...
            </span>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive">
              <Loader2 className="h-6 w-6" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              Details konnten nicht geladen werden.
            </span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {payload?.header ? (
              <CommitInspectMessage message={payload.header} />
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col bg-muted/5">
              <CommitInspectSplitHeader
                selectedFile={selectedFile}
                filesFlex={splitFlex.files}
                diffFlex={splitFlex.diff}
              />
              <ResizablePanelGroup
                orientation="horizontal"
                id="commit-inspect-inner-v3"
                className="min-h-0 flex-1"
                defaultLayout={defaultInnerLayout}
                onLayoutChanged={(layout) => {
                  writeLocalStorageDebounced(
                    innerLayoutKey,
                    JSON.stringify(layout),
                  );
                  const f = layout.cifiles;
                  const d = layout.cidiff;
                  if (typeof f === "number" && typeof d === "number") {
                    setSplitFlex({ files: f, diff: d });
                  }
                }}
              >
                <ResizablePanel
                  id="cifiles"
                  defaultSize="34%"
                  minSize="14%"
                  maxSize="78%"
                  className="flex min-h-0 flex-col"
                >
                  <CommitInspectFileList
                    files={payload?.files ?? []}
                    selectedFile={selectedFile}
                    onSelectFile={setSelectedFile}
                  />
                </ResizablePanel>
                <ResizableHandle
                  withHandle
                  className="w-1.5 bg-transparent transition-colors hover:bg-primary/20 active:bg-primary/40"
                />
                <ResizablePanel
                  id="cidiff"
                  defaultSize="66%"
                  minSize="22%"
                  className="flex min-h-0 flex-col"
                >
                  <CommitInspectDiff
                    selectedFile={selectedFile}
                    fileDiff={fileDiff}
                    loading={diffLoading}
                    failed={diffFailed}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
