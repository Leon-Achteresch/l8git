import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CommitChangedFile,
  CommitInspectFileItem,
} from "./commit-inspect-file-item";

export function CommitInspectFileList({
  files,
  selectedFile,
  onSelectFile,
}: {
  files: CommitChangedFile[];
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col bg-muted/5">
      <div className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground/80 shadow-sm">
        Geänderte Dateien
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-3">
          {files.map((file) => (
            <CommitInspectFileItem
              key={file.path}
              file={file}
              isSelected={selectedFile === file.path}
              onSelect={() =>
                onSelectFile(selectedFile === file.path ? null : file.path)
              }
            />
          ))}
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <span className="text-sm font-medium">
                Keine Dateien in diesem Commit.
              </span>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
