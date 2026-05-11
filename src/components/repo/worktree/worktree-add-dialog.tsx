import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function WorktreeAddDialog({
  open,
  onClose,
  path,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  branches: Branch[];
}) {
  const worktreeAdd = useRepoStore((s) => s.worktreeAdd);
  const [worktreePath, setWorktreePath] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existingBranch, setExistingBranch] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [busy, setBusy] = useState(false);

  const localBranches = branches.filter((b) => !b.is_remote && !b.is_current);

  useEffect(() => {
    if (!open) {
      setWorktreePath("");
      setMode("existing");
      setExistingBranch("");
      setNewBranch("");
      setBaseBranch("");
      setBusy(false);
    }
  }, [open]);

  const dismiss = () => {
    if (busy) return;
    onClose();
  };

  const pickFolder = async () => {
    const selected = await pickDirectory({ directory: true, multiple: false });
    if (typeof selected === "string") setWorktreePath(selected);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimPath = worktreePath.trim();
    if (!trimPath) return;

    setBusy(true);
    try {
      if (mode === "existing") {
        const b = existingBranch.trim();
        if (!b) {
          toastError("Bitte einen Branch auswählen.");
          return;
        }
        const out = await worktreeAdd(path, trimPath, { branch: b });
        toast.success(out || "Worktree erstellt.");
      } else {
        const nb = newBranch.trim();
        if (!nb) {
          toastError("Branch-Name darf nicht leer sein.");
          return;
        }
        const out = await worktreeAdd(path, trimPath, {
          newBranch: nb,
          branch: baseBranch.trim() || undefined,
        });
        toast.success(out || "Worktree erstellt.");
      }
      onClose();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Worktree hinzufügen"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Worktree hinzufügen</h2>
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
          {/* Worktree path */}
          <div className="grid gap-1">
            <Label htmlFor="wt-path">Worktree-Pfad *</Label>
            <div className="flex gap-1.5">
              <Input
                id="wt-path"
                value={worktreePath}
                onChange={(e) => setWorktreePath(e.target.value)}
                placeholder="/pfad/zum/worktree"
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
              Absoluter Pfad für das neue Arbeitsverzeichnis
            </p>
          </div>

          {/* Mode toggle */}
          <div className="grid gap-1">
            <Label>Modus</Label>
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`flex-1 px-3 py-1.5 text-center transition-colors ${
                  mode === "existing"
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                Bestehender Branch
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`flex-1 px-3 py-1.5 text-center transition-colors ${
                  mode === "new"
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                Neuer Branch
              </button>
            </div>
          </div>

          {mode === "existing" ? (
            <div className="grid gap-1">
              <Label htmlFor="wt-existing-branch">Branch *</Label>
              <select
                id="wt-existing-branch"
                value={existingBranch}
                onChange={(e) => setExistingBranch(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                required
              >
                <option value="">— Branch auswählen —</option>
                {localBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Branch wird in den neuen Worktree ausgecheckt
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-1">
                <Label htmlFor="wt-new-branch">Neuer Branch-Name *</Label>
                <Input
                  id="wt-new-branch"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="feature/my-feature"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="wt-base-branch">Basis-Branch (optional)</Label>
                <select
                  id="wt-base-branch"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="">— Von HEAD (Standard) —</option>
                  {branches
                    .filter((b) => !b.is_remote)
                    .map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                        {b.is_current ? " (current)" : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Ausgangspunkt für den neuen Branch
                </p>
              </div>
            </>
          )}

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
              disabled={
                busy ||
                !worktreePath.trim() ||
                (mode === "existing" && !existingBranch) ||
                (mode === "new" && !newBranch.trim())
              }
            >
              {busy ? "Erstelle …" : "Erstellen"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
