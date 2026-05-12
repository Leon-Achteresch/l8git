import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type WorktreeEntry } from "@/lib/repo-store";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function WorktreeMoveDialog({
  open,
  onClose,
  path,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  entry: WorktreeEntry | null;
}) {
  const worktreeMove = useRepoStore((s) => s.worktreeMove);
  const [newPath, setNewPath] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewPath("");
      setBusy(false);
    }
  }, [open]);

  if (!open || !entry) return null;

  const dismiss = () => {
    if (busy) return;
    onClose();
  };

  const pickFolder = async () => {
    const selected = await pickDirectory({ directory: true, multiple: false });
    if (typeof selected === "string") setNewPath(selected);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const np = newPath.trim();
    if (!np) return;
    setBusy(true);
    try {
      await worktreeMove(path, entry.path, np);
      toast.success("Worktree verschoben.");
      onClose();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const segments = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
  const entryName = segments.pop() ?? entry.path;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Worktree verschieben"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Worktree verschieben</h2>
            <p className="text-[11px] text-muted-foreground">{entryName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="wt-new-path">Neuer Pfad *</Label>
            <div className="flex gap-1.5">
              <Input
                id="wt-new-path"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/neuer/pfad"
                spellCheck={false}
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void pickFolder()}
                aria-label="Ordner wählen"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Absoluter Ziel-Pfad für den Worktree
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismiss}
              disabled={busy}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !newPath.trim()}
            >
              {busy ? "Verschiebe …" : "Verschieben"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
