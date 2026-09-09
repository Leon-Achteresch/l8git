import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  FileCode2,
  Files,
  GitCommitHorizontal,
  Undo2,
} from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommitChangedFile } from "./commit-inspect-file-item";

export function CommitInspectFileTabs({
  files,
  selectedFile,
  onSelectFile,
  onBlame,
  onDiscardFile,
}: {
  files: CommitChangedFile[];
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
  onBlame?: (path: string) => void;
  onDiscardFile?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const listId = useId();
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <div className="min-w-0 shrink-0 border-b border-border/60 bg-muted/15">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="flex w-full items-center gap-2 px-5 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Files className="size-3.5" />
        <span className="font-medium text-foreground">
          {t("commitInspect.changedFiles")}
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
          {files.length}
        </span>
        <span className="ml-auto flex gap-2.5 font-mono text-[11px] tabular-nums">
          <span className="text-git-added">+{additions}</span>
          <span className="text-git-removed">−{deletions}</span>
        </span>
        <ChevronDown
          className={cn(
            "ml-1 size-3.5 transition-transform",
            !expanded && "-rotate-90",
          )}
        />
      </button>
      <div
        id={listId}
        hidden={!expanded}
        className="max-h-48 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]"
      >
        {files.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t("commitInspect.noFilesInCommit")}
          </p>
        )}
        {files.map((file) => {
          const active = selectedFile === file.path;
          const name = file.path.split("/").pop();
          const directory = file.path.slice(0, file.path.lastIndexOf("/") + 1);
          return (
            <ContextMenu key={file.path}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectFile(file.path)}
                  aria-pressed={active}
                  title={file.path}
                  className={cn(
                    "group my-0.5 flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-border/70 bg-background text-foreground shadow-xs"
                      : "border-transparent text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <FileCode2
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-foreground" : "text-muted-foreground/60",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-xs font-medium">
                      {name}
                    </span>
                    {directory && (
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/75">
                        {directory}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-2 font-mono text-[11px] tabular-nums">
                    {file.binary ? (
                      <span className="text-muted-foreground">
                        {t("commitInspect.binaryBadge")}
                      </span>
                    ) : (
                      <>
                        <span className="text-git-added">
                          +{file.additions}
                        </span>
                        <span className="text-git-removed">
                          −{file.deletions}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() => onBlame?.(file.path)}
                  disabled={!onBlame}
                >
                  <GitCommitHorizontal className="size-3.5" />
                  {t("commitPanel.fileRowBlame")}
                </ContextMenuItem>
                <ContextMenuItem
                  variant="destructive"
                  onSelect={() => onDiscardFile?.(file.path)}
                  disabled={!onDiscardFile}
                >
                  <Undo2 className="size-3.5" />
                  {t("commitInspect.fileResetMenu")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
