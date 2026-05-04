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
    opacity: isDragging ? 0.35 : undefined,
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
              "group relative inline-flex h-8 max-w-[180px] items-center gap-1.5 rounded-t-md px-2.5 text-[13px] font-medium touch-none select-none",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              isDragging && "z-10 cursor-grabbing",
            )}
          >
            {active ? (
              <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-b-sm bg-primary" />
            ) : null}
            {loading ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            ) : showFavicon ? (
              <img
                src={favicon ?? undefined}
                alt=""
                onError={() => setIconBroken(true)}
                className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
              />
            ) : (
              <GitBranch className="h-3 w-3 shrink-0 opacity-40" />
            )}
            <span className="truncate">{label}</span>
            <span
              role="button"
              tabIndex={-1}
              aria-label="Tab schließen"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                useRepoStore.getState().removeRepo(path);
              }}
              className="ml-auto flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full opacity-0 duration-100 hover:bg-foreground/15 group-hover:opacity-50 hover:!opacity-100"
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
