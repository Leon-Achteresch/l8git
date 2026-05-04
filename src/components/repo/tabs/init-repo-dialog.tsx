import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { join } from "@tauri-apps/api/path";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function InitRepoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const initRepo = useRepoStore((s) => s.initRepo);
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState("neues-repo");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setParentDir("");
      setFolderName("neues-repo");
      setBusy(false);
    }
  }, [open]);

  async function pickParent() {
    const selected = await pickDirectory({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    setParentDir(selected);
  }

  async function runInit() {
    const name = folderName.trim();
    if (!parentDir.trim()) {
      toastError("Bitte übergeordneten Ordner wählen.");
      return;
    }
    if (!name) {
      toastError("Bitte Ordnernamen angeben.");
      return;
    }
    let dest: string;
    try {
      dest = await join(parentDir.trim(), name);
    } catch (e) {
      toastError(String(e));
      return;
    }
    setBusy(true);
    try {
      const opened = await initRepo(dest);
      if (opened) {
        toast.success("Repository angelegt und geöffnet.");
        onClose();
      }
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (busy) return;
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leeres Repository anlegen"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={dismiss}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Leeres Repository anlegen</h2>
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
        <div className="grid gap-4 p-4">
          <p className="text-xs text-muted-foreground">
            Es wird ein neuer Ordner mit <code className="rounded bg-muted px-1 py-0.5">git init</code>{" "}
            unter dem gewählten Pfad erstellt.
          </p>
          <div className="grid gap-1.5">
            <Label>Übergeordneter Ordner</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => void pickParent()}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Ordner wählen
            </Button>
            {parentDir && (
              <p className="truncate text-xs text-muted-foreground" title={parentDir}>
                {parentDir}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="init-folder-name">Ordnername</Label>
            <Input
              id="init-folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="button" onClick={() => void runInit()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anlegen"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
