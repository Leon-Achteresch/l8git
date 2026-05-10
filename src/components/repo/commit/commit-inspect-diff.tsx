import { FileCode2 } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Suspense, lazy } from "react";

const MonacoDiffViewer = lazy(() =>
  import("./monaco-diff-viewer").then((m) => ({ default: m.MonacoDiffViewer })),
);

export type FileDiffPayload = { diff: string | null; is_binary: boolean };

export function CommitInspectDiff({
  selectedFile,
  fileDiff,
  loading,
  failed,
}: {
  selectedFile: string | null;
  fileDiff: FileDiffPayload | null;
  loading: boolean;
  failed: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-hidden p-2 min-w-0">
        {!selectedFile ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="rounded-full bg-muted/30 p-4 ring-1 ring-border/50">
              <FileCode2 className="h-8 w-8 opacity-40" />
            </div>
            <span className="text-sm font-medium tracking-wide">
              Klicke links auf eine Datei, um den Diff zu sehen.
            </span>
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
          </div>
        ) : failed ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Diff konnte nicht geladen werden.
          </div>
        ) : fileDiff?.is_binary ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Binärdatei
          </div>
        ) : fileDiff?.diff ? (
          <div className="h-full min-h-0 min-w-0 overflow-hidden rounded-lg shadow-sm ring-1 ring-border/30">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                </div>
              }
            >
              <MonacoDiffViewer
                unifiedText={fileDiff.diff}
                filename={selectedFile}
              />
            </Suspense>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Keine Textänderungen
          </div>
        )}
      </div>
    </div>
  );
}
