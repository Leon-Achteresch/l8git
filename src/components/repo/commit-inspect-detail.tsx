import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UnifiedDiffBody } from "@/components/repo/unified-diff-body";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import { FileCode2, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type CommitChangedFile = {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
};

type InspectPayload = { header: string; files: CommitChangedFile[] };

type FileDiffPayload = { diff: string | null; is_binary: boolean };

const innerLayoutKey = "gitit.commit-inspect-inner.v1";

export function CommitInspectDetail({
  path,
  commitHash,
}: {
  path: string;
  commitHash: string | null;
}) {
  const [payload, setPayload] = useState<InspectPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);
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

  const refreshAll = useCallback(() => {
    void loadInspect();
    void loadFileDiff();
  }, [loadInspect, loadFileDiff]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background/50">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-2.5 backdrop-blur-sm">
        <span className="truncate text-sm font-medium text-muted-foreground">
          {commitHash ? "Commit-Details" : "Kein Commit gewählt"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full hover:bg-muted/50"
          onClick={() => refreshAll()}
          disabled={!commitHash || loading}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {!commitHash ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Wähle einen Commit in der Liste, um Metadaten, Dateien und Diffs zu
            sehen.
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
          </div>
        ) : failed ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Details konnten nicht geladen werden.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="max-h-[38%] shrink-0 border-b border-border/40">
              <ScrollArea className="max-h-[min(38vh,280px)]">
                <pre className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                  {payload?.header ?? ""}
                </pre>
              </ScrollArea>
            </div>
            <div className="min-h-0 flex-1">
              <ResizablePanelGroup
                orientation="horizontal"
                id="commit-inspect-inner"
                defaultLayout={defaultInnerLayout}
                onLayoutChanged={(layout) =>
                  localStorage.setItem(innerLayoutKey, JSON.stringify(layout))
                }
              >
                <ResizablePanel
                  id="cifiles"
                  defaultSize="34%"
                  minSize="18%"
                  maxSize="55%"
                  className="flex min-h-0 flex-col border-r border-border/40 bg-muted/5"
                >
                  <div className="border-b border-border/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dateien
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-0.5 p-2">
                      {(payload?.files ?? []).map((f) => {
                        const sel = selectedFile === f.path;
                        const base = f.path.split("/").pop() ?? f.path;
                        const dir = f.path.split("/").slice(0, -1).join("/");
                        return (
                          <div
                            key={f.path}
                            onClick={() =>
                              setSelectedFile((p) =>
                                p === f.path ? null : f.path,
                              )
                            }
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                              sel
                                ? "bg-primary/10 text-primary shadow-sm"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            }`}
                          >
                            <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span className="min-w-0 flex-1 truncate font-medium text-[13px]">
                              {base}
                              {dir ? (
                                <span className="ml-1.5 text-[10px] font-normal opacity-50">
                                  {dir}
                                </span>
                              ) : null}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                              {f.binary ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <>
                                  {f.additions > 0 ? (
                                    <span className="text-git-added">
                                      +{f.additions}
                                    </span>
                                  ) : null}
                                  {f.deletions > 0 ? (
                                    <span className="text-git-removed">
                                      -{f.deletions}
                                    </span>
                                  ) : null}
                                  {f.additions === 0 && f.deletions === 0 ? (
                                    <span className="text-muted-foreground">
                                      0
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })}
                      {payload?.files.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                          Keine Dateien in diesem Commit.
                        </p>
                      ) : null}
                    </div>
                  </ScrollArea>
                </ResizablePanel>
                <ResizableHandle
                  withHandle
                  className="bg-border/50 transition-colors hover:bg-primary/20"
                />
                <ResizablePanel
                  id="cidiff"
                  defaultSize="66%"
                  minSize="30%"
                  className="flex min-h-0 flex-col"
                >
                  <div className="flex items-center justify-between border-b border-border/40 bg-muted/10 px-3 py-2">
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      {selectedFile ?? "Keine Datei gewählt"}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {!selectedFile ? (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                        Klicke links auf eine Datei, um den Diff zu sehen.
                      </div>
                    ) : (
                      <UnifiedDiffBody
                        loading={diffLoading}
                        failed={diffFailed}
                        isBinary={!!fileDiff?.is_binary}
                        unifiedText={fileDiff?.diff ?? null}
                        untrackedPlain={null}
                        emptyHint="Keine Textänderungen"
                        failedHint="Diff konnte nicht geladen werden."
                      />
                    )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
