import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { RepoLanguageStats } from "./repo-language-stats";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChartPie, GitBranch, Loader2, RefreshCw, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

type RepoTabProps = {
  path: string;
  label: string;
  active: boolean;
};

export const RepoTab = memo(function RepoTab({
  path,
  label,
  active,
}: RepoTabProps) {
  const { loading, favicon } = useRepoStore(
    useShallow((s) => ({
      loading: !!s.loading[path],
      favicon: s.favicons[path] ?? null,
    })),
  );
  const [iconBroken, setIconBroken] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    setIconBroken(false);
  }, [favicon]);
  const showFavicon = !!favicon && !iconBroken;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: path,
    animateLayoutChanges: () => false,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={setNodeRef}
            style={style}
            type="button"
            onClick={() => useRepoStore.getState().setActive(path)}
            onAuxClick={(e) => {
              if (e.button === 1) useRepoStore.getState().removeRepo(path);
            }}
            title={path}
            {...attributes}
            {...listeners}
            className={cn(
              // Base
              "group relative inline-flex h-9 max-w-[200px] min-w-0 shrink-0 items-center gap-1.5 touch-none select-none",
              "px-3 text-[12.5px] font-medium transition-all duration-150",
              // Shape: pill-ish bottom border style
              "rounded-md",
              active
                ? [
                    "bg-background text-foreground",
                    "shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]",
                    "dark:shadow-[0_1px_4px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]",
                  ]
                : [
                    "text-muted-foreground",
                    "hover:bg-muted/50 hover:text-foreground",
                  ],
              isDragging && "z-10 cursor-grabbing opacity-40 scale-95",
            )}
          >
            {/* Active accent line at bottom */}
            {active && (
              <span
                className="pointer-events-none absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-primary"
                aria-hidden
              />
            )}

            {/* Icon */}
            <span className="shrink-0">
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : showFavicon ? (
                <img
                  src={favicon ?? undefined}
                  alt=""
                  onError={() => setIconBroken(true)}
                  className="h-4 w-4 rounded-sm object-contain"
                />
              ) : (
                <GitBranch
                  className={cn(
                    "h-3.5 w-3.5 transition-opacity",
                    active ? "opacity-60 text-primary" : "opacity-30",
                  )}
                />
              )}
            </span>

            {/* Label */}
            <span className="truncate leading-none">{label}</span>

            {/* Close button */}
            <span
              role="button"
              tabIndex={-1}
              aria-label="Tab schließen"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useRepoStore.getState().removeRepo(path);
              }}
              className={cn(
                "ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded transition-all duration-100",
                "opacity-0 group-hover:opacity-60 hover:!opacity-100",
                "hover:bg-foreground/12",
                active && "group-hover:opacity-50",
              )}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => void useRepoStore.getState().reload(path)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Neu laden
            <ContextMenuShortcut>
              {formatForDisplay("F5")} · {formatForDisplay("Mod+R")}
            </ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setLangOpen(true)}>
            <ChartPie className="h-3.5 w-3.5" />
            Sprachen anzeigen
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => useRepoStore.getState().removeRepo(path)}
          >
            <X className="h-3.5 w-3.5" />
            Schließen
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <RepoLanguageStats
        open={langOpen}
        path={path}
        onClose={() => setLangOpen(false)}
      />
    </>
  );
});
