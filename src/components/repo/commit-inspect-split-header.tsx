import { FileCode2, Files } from "lucide-react";

export function CommitInspectSplitHeader({
  selectedFile,
  filesFlex,
  diffFlex,
}: {
  selectedFile: string | null;
  filesFlex: number;
  diffFlex: number;
}) {
  return (
    <div className="flex w-full shrink-0 bg-muted/10 backdrop-blur-md">
      <div
        className="flex min-w-0 items-center gap-2.5 px-3 py-3"
        style={{ flex: `${filesFlex} 1 0%` }}
      >
        <Files className="size-4 shrink-0 text-primary/80" aria-hidden />
        <span className="truncate text-xs font-bold uppercase tracking-widest text-muted-foreground/90">
          Geänderte Dateien
        </span>
      </div>
      <div className="w-1.5 shrink-0" aria-hidden />
      <div
        className="flex min-w-0 items-center gap-2.5 px-2 py-3"
        style={{ flex: `${diffFlex} 1 0%` }}
      >
        <FileCode2 className="size-4 shrink-0 text-primary/70" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left font-mono text-sm font-semibold tracking-tight text-foreground/90">
          {selectedFile ?? "Keine Datei gewählt"}
        </span>
      </div>
    </div>
  );
}
