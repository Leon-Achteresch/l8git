import { FileFilterInput } from "@/components/repo/file-filter-input";
import { filterChangedFiles } from "@/lib/file-path-filter";
import { Button } from "@/components/ui/button";
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
import { writeLocalStorageDebounced } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SpinIcon, pulseKeyframes, pulseTransition } from "@/components/motion/kit";
import { m } from "motion/react";

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
  expectedHash,
  onClose,
}: {
  path: string;
  stashIndex: number | null;
  expectedHash?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inspectEpoch = useRef(0);
  const diffEpoch = useRef(0);
  useEffect(() => () => { inspectEpoch.current++; diffEpoch.current++; }, []);
  const [payload, setPayload] = useState<InspectPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const visibleFiles = useMemo(() => filterChangedFiles(payload?.files ?? [], query), [payload, query]);
  const selectedEntry = useMemo(() => payload?.files.find(file => file.path === selectedFile), [payload, selectedFile]);
  const previousFile = selectedEntry?.previous_path ?? undefined;
  const diffKey = JSON.stringify([path, expectedHash ?? stashIndex, selectedFile, previousFile]);
  const [diffState, setDiffState] = useState({
    key: "", data: null as FileDiffPayload | null, loading: false, failed: false,
  });
  const fileDiff = diffState.key === diffKey ? diffState.data : null;
  const diffLoading = !!selectedFile && (diffState.key !== diffKey || diffState.loading);
  const diffFailed = diffState.key === diffKey && diffState.failed;
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
      inspectEpoch.current++;
      setPayload(null);
      setFailed(false);
      return;
    }
    const epoch = ++inspectEpoch.current;
    setLoading(true);
    setFailed(false);
    try {
      const out = await invoke<InspectPayload>("git_stash_show", {
        path,
        index: stashIndex,
        expectedHash,
      });
      if (inspectEpoch.current === epoch) setPayload(out);
    } catch (e) {
      if (inspectEpoch.current !== epoch) return;
      setFailed(true);
      setPayload(null);
      toastError(String(e));
    } finally {
      if (inspectEpoch.current === epoch) setLoading(false);
    }
  }, [path, stashIndex, expectedHash]);

  const loadFileDiff = useCallback(async () => {
    const epoch = ++diffEpoch.current;
    if (stashIndex == null || !selectedFile) return;
    setDiffState({ key: diffKey, data: null, loading: true, failed: false });
    try {
      const out = await invoke<FileDiffPayload>("git_stash_file_diff", {
        path,
        index: stashIndex,
        expectedHash,
        file: selectedFile,
        ...(previousFile ? { previousFile } : {}),
      });
      if (diffEpoch.current === epoch) setDiffState({ key: diffKey, data: out, loading: false, failed: false });
    } catch (e) {
      if (diffEpoch.current !== epoch) return;
      setDiffState({ key: diffKey, data: null, loading: false, failed: true });
      toastError(String(e));
    }
  }, [path, stashIndex, selectedFile, expectedHash, previousFile, diffKey]);

  useEffect(() => {
    void loadInspect();
  }, [loadInspect]);

  useEffect(() => {
    void loadFileDiff();
  }, [loadFileDiff]);

  useEffect(() => {
    if (stashIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
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
        <span>{t("stash.pickHint")}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background/95 backdrop-blur-sm">
      <CommitInspectHeader
        title={t("stash.inspectHeaderTitle")}
        onRefresh={refreshAll}
        onClose={onClose}
        loading={loading}
      />
      <div className="min-h-0 flex-1">
        {loading && !payload ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <SpinIcon icon={Loader2} className="h-8 w-8 text-primary" />
            <m.span animate={pulseKeyframes} transition={pulseTransition} className="text-sm font-medium tracking-wide text-muted-foreground">
              {t("stash.inspectLoading")}
            </m.span>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive">
              <Loader2 className="h-6 w-6" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {t("stash.detailLoadFailed")}
            </span>
            <Button variant="outline" onClick={() => void loadInspect()}>{t("audit.retry")}</Button>
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
                  {payload && payload.files.length >= 6 && (
                    <div className="flex shrink-0 items-center gap-1.5 px-2 pt-1.5">
                      <FileFilterInput
                        className="min-w-0 flex-1"
                        value={query}
                        onChange={setQuery}
                        onPickFirstMatch={() => { if (visibleFiles[0]) setSelectedFile(visibleFiles[0].path); }}
                      />
                      {query.trim() && <span role="status" className="text-xs tabular-nums text-muted-foreground">{visibleFiles.length}/{payload.files.length}</span>}
                    </div>
                  )}
                  <CommitInspectFileList
                    files={visibleFiles}
                    filterQuery={query}
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
                    repoPath={path}
                    commitHash={expectedHash ?? `stash@{${stashIndex}}`}
                    previousFile={previousFile}
                    stashSource={selectedEntry?.untracked ? "untracked" : "tracked"}
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
