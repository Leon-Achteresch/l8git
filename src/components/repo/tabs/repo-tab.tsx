import { MagicPill } from "@/components/motion/magic-pill";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { GitBranch, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

type RepoTabProps = {
  path: string;
  label: string;
  active: boolean;
  loading: boolean;
  favicon?: string | null;
  onSelect: () => void;
  onClose: () => void;
  onReload: () => void;
};

export function RepoTab({
  path,
  label,
  active,
  loading,
  favicon,
  onSelect,
  onClose,
  onReload,
}: RepoTabProps) {
  const [iconBroken, setIconBroken] = useState(false);
  useEffect(() => {
    setIconBroken(false);
  }, [favicon]);
  const showFavicon = !!favicon && !iconBroken;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          onAuxClick={(e) => {
            if (e.button === 1) onClose();
          }}
          title={path}
          className={cn(
            "group relative inline-flex h-9 max-w-[200px] items-center gap-2 rounded-t-md px-3 text-sm transition-colors",
            active
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {active && (
            <MagicPill
              layoutId="repo-tab-underline"
              className="pointer-events-none absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-primary"
            />
          )}
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : showFavicon ? (
            <img
              src={favicon ?? undefined}
              alt=""
              onError={() => setIconBroken(true)}
              className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
            />
          ) : (
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Tab schließen"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="ml-1 flex h-4 w-4 items-center justify-center rounded opacity-0 hover:bg-foreground/10 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onReload}>
          <RefreshCw className="h-3.5 w-3.5" />
          Neu laden
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={onClose}>
          <X className="h-3.5 w-3.5" />
          Schließen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
