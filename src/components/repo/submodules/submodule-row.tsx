import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type SubmoduleEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { Download, ExternalLink, FolderGit2, RefreshCw, Trash2 } from "lucide-react";
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

  const shortName = entry.path.split("/").pop() ?? entry.path;
  const parentPath = entry.path.includes("/")
    ? entry.path.slice(0, entry.path.lastIndexOf("/"))
    : null;

  const shortPinned = entry.commit ? entry.commit.slice(0, 7) : "—";
  const shortRemote = entry.remote_commit ?? "—";

  const row = (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full cursor-pointer items-center gap-0 text-left text-sm transition-colors",
        "grid-cols-[2fr_1fr_1fr_1fr_auto]",
        selected
          ? "bg-primary/10 text-primary"
          : "hover:bg-muted/60",
      )}
      style={{ minHeight: 48 }}
    >
      {/* SUBMODUL */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
        <FolderGit2
          className={cn(
            "h-4 w-4 shrink-0",
            selected ? "text-primary" : "text-muted-foreground/60",
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-tight">
            {shortName}
          </p>
          {parentPath && (
            <p className="truncate text-[10px] text-muted-foreground/60 leading-tight">
              {parentPath}
            </p>
          )}
        </div>
      </div>

      {/* BRANCH */}
      <div className="px-2 py-2.5">
        {entry.branch ? (
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {entry.branch}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/40">—</span>
        )}
      </div>

      {/* PINNED */}
      <div className="px-2 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          {shortPinned}
        </span>
      </div>

      {/* REMOTE */}
      <div className="flex items-center gap-1 px-2 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          {shortRemote}
        </span>
        {entry.behind_count != null && entry.behind_count > 0 && (
          <span className="text-[10px] font-medium text-red-500">
            ↓{entry.behind_count}
          </span>
        )}
      </div>

      {/* STATUS */}
      <div className="px-3 py-2.5">
        <SubmoduleStatusBadge entry={entry} />
      </div>
    </button>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={busy}
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
          disabled={busy}
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
          disabled={busy}
          onSelect={() =>
            void run(
              () => submoduleUpdate(path, entry.path, true, true),
              "Submodule rekursiv aktualisiert.",
            )
          }
        >
          <Download className="h-3.5 w-3.5" />
          Update (rekursiv)
        </ContextMenuItem>
        <ContextMenuItem
          disabled={busy}
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
          disabled={busy}
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
