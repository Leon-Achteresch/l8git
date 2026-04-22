import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CommitInspectDiff, type FileDiffPayload } from "@/components/repo/commit/commit-inspect-diff";
import { CommitInspectFileList } from "@/components/repo/commit/commit-inspect-file-list";
import type { CommitChangedFile } from "@/components/repo/commit/commit-inspect-file-item";
import { CommitInspectHeader } from "@/components/repo/commit/commit-inspect-header";
import { CommitInspectMessage } from "@/components/repo/commit/commit-inspect-message";
import { CommitInspectSplitHeader } from "@/components/repo/commit/commit-inspect-split-header";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { writeLocalStorageDebounced } from "@/lib/utils";

type InspectPayload = { header: string; files: CommitChangedFile[] };

const innerLayoutKey = "l8git.stash-inspect-inner.v1";

function readSplitFlexFromStorage(): { files: number; diff: number } {
  const raw = localStorage.getItem(innerLayoutKey);
  if (!raw) return { files: 34, diff: 66 };
  try {
    const p = JSON.parse(raw) as Record<string, number>;
    const f = p.sifiles;
    const d = p.sidiff;
    if (typeof f === "number" && typeof d === "number" && f > 0 && d > 0) {
      return { files: f, diff: d };
    }
  } catch {
    return { files: 34, diff: 66 };
  }
  return { files: 34, diff: 66 };
}

export function StashInspectDetail({
  path,
  stashIndex,
  onClose,
}: {
  path: string;
  stashIndex: number | null;
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
    if (stashIndex == null) {
      setPayload(null);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const out = await invoke<InspectPayload>("git_stash_show", {
        path,
        index: stashIndex,
      });
      setPayload(out);
    } catch (e) {
      setFailed(true);
      setPayload(null);
      toastError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, stashIndex]);

  const loadFileDiff = useCallback(async () => {
    if (stashIndex == null || !selectedFile) {
      setFileDiff(null);
      setDiffFailed(false);
      return;
    }
    setDiffLoading(true);
    setDiffFailed(false);
    try {
      const out = await invoke<FileDiffPayload>("git_stash_file_diff", {
        path,
        index: stashIndex,
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
  }, [path, stashIndex, selectedFile]);

  useEffect(() => {
    void loadInspect();
  }, [loadInspect]);

  useEffect(() => {
    setSelectedFile(null);
    setFileDiff(null);
    setDiffFailed(false);
  }, [stashIndex]);

  useEffect(() => {
    void loadFileDiff();
  }, [loadFileDiff]);

  useEffect(() => {
    if (stashIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stashIndex, onClose]);

  const refreshAll = useCallback(() => {
    void loadInspect();
    void loadFileDiff();
  }, [loadInspect, loadFileDiff]);

  if (stashIndex == null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background/40 text-center text-sm text-muted-foreground">
        <span>Wähle einen Stash in der Liste.</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background/95 backdrop-blur-sm">
      <CommitInspectHeader
        title="Stash-Details"
        onRefresh={refreshAll}
        onClose={onClose}
        loading={loading}
      />
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="animate-pulse text-sm font-medium tracking-wide text-muted-foreground">
              Lade Details…
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
                id="stash-inspect-inner"
                className="min-h-0 flex-1"
                defaultLayout={defaultInnerLayout}
                onLayoutChanged={(layout) => {
                  writeLocalStorageDebounced(
                    innerLayoutKey,
                    JSON.stringify(layout),
                  );
                  const f = layout.sifiles;
                  const d = layout.sidiff;
                  if (typeof f === "number" && typeof d === "number") {
                    setSplitFlex({ files: f, diff: d });
                  }
                }}
              >
                <ResizablePanel
                  id="sifiles"
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
                  id="sidiff"
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
