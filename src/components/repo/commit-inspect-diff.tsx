import { UnifiedDiffBody } from "@/components/repo/unified-diff-body";
import { FileCode2 } from "lucide-react";

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
      <div className="flex items-center gap-3 bg-muted/10 px-5 py-3 shadow-sm backdrop-blur-md">
        <FileCode2 className="h-4 w-4 text-primary/70" />
        <span className="min-w-0 truncate font-mono text-sm font-semibold tracking-tight text-foreground/90">
          {selectedFile ?? "Keine Datei gewählt"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        {!selectedFile ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="rounded-full bg-muted/30 p-4 ring-1 ring-border/50">
              <FileCode2 className="h-8 w-8 opacity-40" />
            </div>
            <span className="text-sm font-medium tracking-wide">
              Klicke links auf eine Datei, um den Diff zu sehen.
            </span>
          </div>
        ) : (
          <div className="h-full rounded-lg bg-card shadow-sm ring-1 ring-border/30">
            <UnifiedDiffBody
              loading={loading}
              failed={failed}
              isBinary={!!fileDiff?.is_binary}
              unifiedText={fileDiff?.diff ?? null}
              untrackedPlain={null}
              emptyHint="Keine Textänderungen"
              failedHint="Diff konnte nicht geladen werden."
            />
          </div>
        )}
      </div>
    </div>
  );
}
