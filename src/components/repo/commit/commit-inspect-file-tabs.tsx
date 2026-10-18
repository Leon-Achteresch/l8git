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
import {
  ChevronDown,
  FileCode2,
  Files,
  GitCommitHorizontal,
  Undo2,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import type { CommitChangedFile } from "./commit-inspect-file-item";

// Below this a filter field is just noise.
const FILTER_MIN_FILES = 6;
const LAYOUT_ID = "l8git.commit-inspect-split.v1";
const COLLAPSED_KEY = "l8git.commit-inspect-files-collapsed.v1";
// Header is h-10; rows are one name line plus one directory line (~55px), so 3.5rem fits.
const HEADER_REM = 2.5;
const ROW_REM = 3.5;

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
  /** The diff pane, rendered below the draggable split. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  // The panel reports its collapsed state only after paint, so start from the stored flag.
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) !== "1",
  );
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = usePanelRef();
  const layout = useDefaultLayout({ id: LAYOUT_ID, storage: localStorage });
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const filterable = files.length >= FILTER_MIN_FILES;
  const visibleFiles =
    filterable && expanded
      ? files.filter((file) => pathMatchesQuery(file.path, query))
      : files;
  // Small commits get a list sized to their rows instead of the saved split height.
  const maxSize = filterable
    ? "85%"
    : `${HEADER_REM + Math.max(files.length, 1) * ROW_REM + 0.5}rem`;

  const syncExpanded = () => {
    const next = !panelRef.current?.isCollapsed();
    if (next === expanded) return;
    setExpanded(next);
    // Only remember it when the layout is saved too, or the two disagree on the next mount.
    if (filterable) localStorage.setItem(COLLAPSED_KEY, next ? "0" : "1");
  };

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
      orientation="vertical"
      id={LAYOUT_ID}
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      // Saving the clamped small-commit height would shrink the list for big commits too.
      onLayoutChanged={filterable ? layout.onLayoutChanged : undefined}
    >
      <ResizablePanel
        id="cifiles"
        panelRef={panelRef}
        defaultSize="32%"
        minSize="6rem"
        maxSize={maxSize}
        collapsible
        collapsedSize={`${HEADER_REM}rem`}
        onResize={syncExpanded}
        className="flex min-h-0 min-w-0 flex-col bg-muted/15"
      >
        <button
          type="button"
          onClick={() =>
            expanded ? panelRef.current?.collapse() : panelRef.current?.expand()
          }
          aria-expanded={expanded}
          aria-controls={listId}
          className="flex h-10 w-full shrink-0 items-center gap-2 px-5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Files className="size-3.5" />
          <span className="font-medium text-foreground">
            {t("commitInspect.changedFiles")}
          </span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] leading-none tabular-nums">
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
        {expanded && filterable && (
          <div className="shrink-0 px-3 pb-2">
            <FileFilterInput
              value={query}
              onChange={onQueryChange}
              onKeyDown={(event) => moveSelection(event, true)}
            />
          </div>
        )}
        <div
          id={listId}
          ref={listRef}
          hidden={!expanded}
          onKeyDown={(event) => moveSelection(event, false)}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]"
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
                      <span className="block truncate text-xs font-medium">
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
        className="aria-[orientation=horizontal]:h-1.5 bg-border/60 transition-colors hover:bg-primary/20 active:bg-primary/40"
      />
      <ResizablePanel
        id="cidiff"
        minSize="15%"
        className="flex min-h-0 flex-col"
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
