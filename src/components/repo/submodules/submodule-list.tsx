import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type SubmoduleEntry } from "@/lib/repo-store";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FolderGit2,
  Info,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SubmoduleRow } from "./submodule-row";

const EMPTY: SubmoduleEntry[] = [];

export function SubmoduleList({
  path,
  onOpenAdd,
}: {
  path: string;
  onOpenAdd: () => void;
}) {
  const submodules = useRepoStore((s) => s.submodules[path] ?? EMPTY);
  const loading = useRepoStore((s) => !!s.submodulesLoading[path]);
  const reloadSubmodules = useRepoStore((s) => s.reloadSubmodules);
  const submoduleUpdate = useRepoStore((s) => s.submoduleUpdate);
  const submoduleSync = useRepoStore((s) => s.submoduleSync);
  const [selected, setSelected] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  const bulkRun = async (fn: () => Promise<string>, msg: string) => {
    setBulkBusy(true);
    try {
      const out = await fn();
      toast.success(out || msg);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderGit2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              Submodule
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {submodules.length}{" "}
              {submodules.length === 1 ? "Eintrag" : "Einträge"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                disabled={bulkBusy || submodules.length === 0}
                onClick={() =>
                  void bulkRun(
                    () => submoduleUpdate(path, undefined, true, false),
                    "Alle Submodule aktualisiert.",
                  )
                }
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              Alle updaten (--init)
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                disabled={bulkBusy || submodules.length === 0}
                onClick={() =>
                  void bulkRun(
                    () => submoduleSync(path),
                    "URLs synchronisiert.",
                  )
                }
              >
                <RefreshCw className={`h-4 w-4 ${bulkBusy ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Alle URLs syncen</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                onClick={() => onOpenAdd()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              Submodule hinzufügen
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                disabled={loading}
                onClick={() => void reloadSubmodules(path)}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Aktualisieren</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setHintOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 border-b border-border/40 bg-muted/30 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
      >
        <Info className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        <span className="font-medium">Was sind Submodule?</span>
        {hintOpen ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5" />
        )}
      </button>
      {hintOpen && (
        <div className="shrink-0 border-b border-border/40 bg-muted/20 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <p className="mb-1.5">
            <strong className="font-semibold text-foreground/80">
              Git Submodule
            </strong>{" "}
            sind eingebettete Repositories in einem anderen Repository. Sie
            ermöglichen es, externe Abhängigkeiten als fixen Commit
            einzubinden.
          </p>
          <ul className="ml-3 space-y-1 list-disc">
            <li>
              <strong>Init</strong> – registriert das Submodule in{" "}
              <code className="rounded bg-muted px-0.5">.git/config</code>
            </li>
            <li>
              <strong>Update</strong> – checkt den registrierten Commit aus
            </li>
            <li>
              <strong>Sync</strong> – überträgt URL-Änderungen aus{" "}
              <code className="rounded bg-muted px-0.5">.gitmodules</code> in{" "}
              <code className="rounded bg-muted px-0.5">.git/config</code>
            </li>
            <li>
              <strong>Deinit</strong> – entfernt den Checkout (Konfiguration
              bleibt)
            </li>
          </ul>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {loading && submodules.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin opacity-40" />
              <span className="text-sm font-medium">Lade Submodule …</span>
            </div>
          ) : submodules.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <FolderGit2 className="h-10 w-10 opacity-20" />
              <span className="text-sm font-medium">Keine Submodule</span>
              <span className="max-w-[220px] text-xs opacity-80">
                Dieses Repository enthält keine Submodule. Füge über das +
                Icon oben ein neues hinzu.
              </span>
            </div>
          ) : (
            submodules.map((m) => (
              <SubmoduleRow
                key={m.path}
                path={path}
                entry={m}
                selected={selected === m.path}
                onSelect={() =>
                  setSelected((p) => (p === m.path ? null : m.path))
                }
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
