import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type SubmoduleEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import {
  Download,
  ExternalLink,
  FolderGit2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SubmoduleStatusBadge } from "./submodule-status-badge";

export function SubmoduleRow({
  path,
  entry,
  selected,
  onSelect,
}: {
  path: string;
  entry: SubmoduleEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const submoduleInit = useRepoStore((s) => s.submoduleInit);
  const submoduleUpdate = useRepoStore((s) => s.submoduleUpdate);
  const submoduleSync = useRepoStore((s) => s.submoduleSync);
  const submoduleDeinit = useRepoStore((s) => s.submoduleDeinit);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string>, successMsg?: string) => {
    setBusy(true);
    try {
      const out = await fn();
      toast.success(successMsg ?? (out || "Fertig."));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const shortCommit = entry.commit ? entry.commit.slice(0, 8) : "—";
  const displayName = entry.name !== entry.path ? entry.name : null;

  const inner = (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors",
        selected
          ? "bg-primary/12 text-primary ring-1 ring-primary/25"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <FolderGit2
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          selected ? "text-primary" : "opacity-60",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground/90">
            {entry.path}
          </span>
          <SubmoduleStatusBadge status={entry.status} />
        </div>
        {displayName && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
            Name: {displayName}
          </p>
        )}
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
          {entry.url || "—"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] opacity-60">{shortCommit}</span>
          {entry.description && (
            <span className="text-[10px] text-muted-foreground/60">
              ({entry.description})
            </span>
          )}
          {entry.branch && (
            <span className="text-[10px] text-muted-foreground/60">
              branch: {entry.branch}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {entry.status === "uninitialized" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(
                      () => submoduleInit(path, entry.path),
                      "Submodule initialisiert.",
                    );
                  }}
                >
                  Init
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                Registriert das Submodule in .git/config (kein Checkout).
              </TooltipContent>
            </Tooltip>
          )}
          {(entry.status === "uninitialized" || entry.status === "modified") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(
                      () =>
                        submoduleUpdate(
                          path,
                          entry.path,
                          entry.status === "uninitialized",
                          false,
                        ),
                      "Submodule aktualisiert.",
                    );
                  }}
                >
                  <Download className="mr-1 h-3 w-3" />
                  Update
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                Checkt den registrierten Commit aus.
                {entry.status === "uninitialized" && " Inkl. Init."}
              </TooltipContent>
            </Tooltip>
          )}
          {entry.status === "initialized" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(
                      () => submoduleUpdate(path, entry.path, false, false),
                      "Submodule aktualisiert.",
                    );
                  }}
                >
                  <RefreshCw className={cn("mr-1 h-3 w-3", busy && "animate-spin")} />
                  Update
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                Checkt erneut den registrierten Commit aus.
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void run(
                    () => submoduleSync(path, entry.path),
                    "URL synchronisiert.",
                  );
                }}
              >
                Sync
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-xs">
              Überträgt die URL aus .gitmodules in .git/config.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </button>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() =>
            void run(
              () => submoduleInit(path, entry.path),
              "Submodule initialisiert.",
            )
          }
        >
          Init
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            void run(
              () =>
                submoduleUpdate(
                  path,
                  entry.path,
                  entry.status === "uninitialized",
                  false,
                ),
              "Submodule aktualisiert.",
            )
          }
        >
          <Download className="h-3.5 w-3.5" />
          Update
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            void run(
              () =>
                submoduleUpdate(path, entry.path, true, true),
              "Submodule rekursiv aktualisiert.",
            )
          }
        >
          <Download className="h-3.5 w-3.5" />
          Update (rekursiv)
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            void run(
              () => submoduleSync(path, entry.path),
              "URL synchronisiert.",
            )
          }
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Sync URL
        </ContextMenuItem>
        {entry.url && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => {
                navigator.clipboard.writeText(entry.url).catch(() => {});
                toast.success("URL kopiert.");
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              URL kopieren
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => {
            const ok = window.confirm(
              `Submodule "${entry.path}" deinitialisieren? Der Checkout wird entfernt, .gitmodules bleibt erhalten.`,
            );
            if (!ok) return;
            void run(
              () => submoduleDeinit(path, entry.path, false),
              "Submodule deinitialisiert.",
            );
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Deinit
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
