import { FileFilterInput } from "@/components/repo/file-filter-input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { pathMatchesQuery } from "@/lib/commit-compare";
import { cn } from "@/lib/utils";
import { FileCode2, Files, GitCommitHorizontal, Undo2 } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import type { CommitChangedFile } from "./commit-inspect-file-item";

// Below this a filter field is just noise.
const FILTER_MIN_FILES = 6;
// v2: the list moved from above the diff to its left.
const LAYOUT_ID = "l8git.commit-inspect-split.v2";

export function CommitInspectFileTabs({
  files,
  selectedFile,
  onSelectFile,
  onBlame,
  onDiscardFile,
  query,
  onQueryChange,
  children,
}: {
  files: CommitChangedFile[];
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
  onBlame?: (path: string) => void;
  onDiscardFile?: (path: string) => void;
  /** Owned by the parent so the filter survives the reload spinner. */
  query: string;
  onQueryChange: (query: string) => void;
  /** The diff pane, rendered right of the draggable split. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const layout = useDefaultLayout({ id: LAYOUT_ID, storage: localStorage });
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const filterable = files.length >= FILTER_MIN_FILES;
  const visibleFiles = filterable
    ? files.filter((file) => pathMatchesQuery(file.path, query))
    : files;

  const moveSelection = (event: KeyboardEvent, fromFilter: boolean) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    // In the filter, modifier+arrow edits text; on rows it must not reach the history list.
    const modified =
      event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
    if (fromFilter && modified) return;
    const target = event.target as HTMLElement;
    // Context menu events bubble here through the portal; leave them to the menu.
    if (!fromFilter && !listRef.current?.contains(target)) return;
    if (visibleFiles.length === 0) return;
    event.preventDefault();
    const from = fromFilter
      ? selectedFile
      : (target.closest<HTMLElement>("[data-file-path]")?.dataset.filePath ??
        selectedFile);
    const index = visibleFiles.findIndex((file) => file.path === from);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next =
      visibleFiles[
        Math.min(Math.max(index + step, 0), visibleFiles.length - 1)
      ];
    onSelectFile(next.path);
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-file-path="${CSS.escape(next.path)}"]`,
    );
    // From the filter, keep the caret there and only scroll the row into view.
    if (fromFilter) row?.scrollIntoView({ block: "nearest" });
    else row?.focus();
  };

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id={LAYOUT_ID}
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <ResizablePanel
        id="cifiles"
        defaultSize="22%"
        minSize="15%"
        maxSize="50%"
        className="@container flex min-h-0 min-w-0 flex-col bg-muted/15"
      >
        <div
          className="flex h-8 shrink-0 items-center gap-1.5 px-3 text-[11px] text-muted-foreground"
          title={t("commitInspect.changedFiles")}
        >
          <Files className="size-3.5 shrink-0" />
          <span className="tabular-nums">{files.length}</span>
          <span className="ml-auto flex gap-2 font-mono tabular-nums">
            <span className="text-git-added">+{additions}</span>
            <span className="text-git-removed">−{deletions}</span>
          </span>
        </div>
        {filterable && (
          <div className="shrink-0 px-2 pb-1.5">
            <FileFilterInput
              value={query}
              onChange={onQueryChange}
              onKeyDown={(event) => moveSelection(event, true)}
            />
          </div>
        )}
        <div
          ref={listRef}
          role="group"
          aria-label={t("commitInspect.changedFiles")}
          onKeyDown={(event) => moveSelection(event, false)}
          className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 [scrollbar-width:thin]"
        >
          {files.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("commitInspect.noFilesInCommit")}
            </p>
          )}
          {files.length > 0 && visibleFiles.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("common.noResults")}
            </p>
          )}
          {visibleFiles.map((file) => {
            const active = selectedFile === file.path;
            const name = file.path.split("/").pop();
            const directory = file.path.slice(
              0,
              file.path.lastIndexOf("/") + 1,
            );
            return (
              <ContextMenu key={file.path}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectFile(file.path)}
                    data-file-path={file.path}
                    aria-pressed={active}
                    title={file.path}
                    className={cn(
                      "group flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <FileCode2
                      className={cn(
                        "size-3.5 shrink-0",
                        active ? "text-foreground" : "text-muted-foreground/60",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      <span className="font-medium">{name}</span>
                      {directory && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                          {directory}
                        </span>
                      )}
                    </span>
                    <span className="hidden shrink-0 gap-1.5 @[12rem]:flex font-mono text-[10px] tabular-nums">
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
                  {onDiscardFile && (
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() => onDiscardFile?.(file.path)}
                    >
                      <Undo2 className="size-3.5" />
                      {t("commitInspect.fileResetMenu")}
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        className="w-px bg-border/60 transition-colors hover:bg-primary/20 active:bg-primary/40"
      />
      <ResizablePanel
        id="cidiff"
        minSize="40%"
        className="flex min-h-0 min-w-0 flex-col"
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
