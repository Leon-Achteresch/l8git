import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import {
  FileCode2,
  GitCommitHorizontal,
  Minus,
  Plus,
  Undo2,
  X,
} from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import type { CommitChangedFile } from "./commit-inspect-file-item";

const INDICATOR_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.55,
} as const;

function TabCornerLeft() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute -left-[15px] bottom-0 [filter:drop-shadow(-1.2px_-0.5px_1px_rgba(0,0,0,0.10))]"
      aria-hidden
    >
      <path d="M15 15H0C8.28427 15 15 8.28427 15 0V15Z" fill="var(--background)" />
    </svg>
  );
}

function TabCornerRight() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute -right-[15px] bottom-0 [filter:drop-shadow(1.2px_-0.5px_1px_rgba(0,0,0,0.10))]"
      aria-hidden
    >
      <path
        d="M0 15L6.5568e-07 0C2.93563e-07 8.28427 6.71573 15 15 15L0 15Z"
        fill="var(--background)"
      />
    </svg>
  );
}

function FileTab({
  file,
  active,
  onSelect,
  onBlame,
  onDiscard,
}: {
  file: CommitChangedFile;
  active: boolean;
  onSelect: () => void;
  onBlame?: () => void;
  onDiscard?: () => void;
}) {
  const { t } = useTranslation();
  const baseName = file.path.split("/").pop() ?? file.path;
  const hasStats = file.binary || file.additions > 0 || file.deletions > 0;

  const stats = file.binary ? (
    <span className="rounded-full bg-muted px-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
      {t("commitInspect.binaryBadge")}
    </span>
  ) : (
    <span className="flex items-center gap-1 font-mono text-[10px] font-semibold">
      {file.additions > 0 && (
        <span className="flex items-center gap-px text-git-added">
          <Plus className="size-2.5" aria-hidden />
          {file.additions}
        </span>
      )}
      {file.deletions > 0 && (
        <span className="flex items-center gap-px text-git-removed">
          <Minus className="size-2.5" aria-hidden />
          {file.deletions}
        </span>
      )}
    </span>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          onAuxClick={(e) => {
            if (e.button === 1 && onDiscard) onDiscard();
          }}
          title={file.path}
          data-active={active || undefined}
          className={cn(
            "group relative isolate flex h-9 w-[12rem] shrink-0 select-none items-center self-stretch rounded-t-xl text-left text-xs font-medium transition-colors duration-150",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {active && (
            <m.span
              layoutId="commit-inspect-file-tab-indicator"
              className="absolute inset-0 -z-10"
              transition={INDICATOR_SPRING}
              aria-hidden
            >
              <span className="absolute inset-0 rounded-t-xl bg-background [box-shadow:-1px_-1px_1px_0.1px_rgba(0,0,0,0.08),1px_-1px_1px_0.1px_rgba(0,0,0,0.08)]" />
              <TabCornerLeft />
              <TabCornerRight />
            </m.span>
          )}
          <span
            className={cn(
              "flex h-full w-full min-w-0 items-center gap-2 rounded-[10px] px-2.5",
              !active && "group-hover:bg-foreground/[0.06]",
            )}
          >
            <FileCode2
              className={cn(
                "size-4 shrink-0",
                active ? "text-primary" : "opacity-60",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-semibold tracking-tight">
              {baseName}
            </span>
            {/* Right slot: stats by default, the close button takes over on hover
                so the file name keeps the full remaining width. */}
            <span className="relative flex shrink-0 items-center justify-end">
              {hasStats && (
                <span
                  className={cn(
                    "transition-opacity duration-100",
                    onDiscard && "group-hover:opacity-0",
                  )}
                >
                  {stats}
                </span>
              )}
              {onDiscard && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t("commitInspect.fileResetMenu")}
                  title={t("commitInspect.fileResetMenu")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard();
                  }}
                  className="absolute right-0 flex size-5 items-center justify-center rounded-full text-muted-foreground/70 opacity-0 transition-all duration-100 hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
                >
                  <X className="size-3" />
                </span>
              )}
            </span>
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onBlame} disabled={!onBlame}>
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          {t("commitPanel.fileRowBlame")}
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={onDiscard}
          disabled={!onDiscard}
        >
          <Undo2 className="h-3.5 w-3.5" />
          {t("commitInspect.fileResetMenu")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

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

  if (files.length === 0) {
    return (
      <div className="flex w-full shrink-0 items-center bg-muted/10 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        {t("commitInspect.noFilesInCommit")}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 shrink-0 items-stretch gap-1 overflow-x-auto overflow-y-hidden bg-muted/10 px-2 pb-1 pt-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20 [&::-webkit-scrollbar]:h-1.5">
      {files.map((file) => (
        <FileTab
          key={file.path}
          file={file}
          active={selectedFile === file.path}
          onSelect={() =>
            onSelectFile(selectedFile === file.path ? null : file.path)
          }
          onBlame={onBlame ? () => onBlame(file.path) : undefined}
          onDiscard={onDiscardFile ? () => onDiscardFile(file.path) : undefined}
        />
      ))}
    </div>
  );
}
