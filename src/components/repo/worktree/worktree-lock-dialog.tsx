import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type WorktreeEntry } from "@/lib/repo-store";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function WorktreeLockDialog({
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
  const worktreeLock = useRepoStore((s) => s.worktreeLock);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setBusy(false);
    }
  }, [open]);

  if (!open || !entry) return null;

  const dismiss = () => {
    if (busy) return;
    onClose();
  };

  const segments = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
  const entryName = segments.pop() ?? entry.path;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await worktreeLock(path, entry.path, reason.trim() || undefined);
      toast.success("Worktree gesperrt.");
      onClose();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Worktree sperren"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Worktree sperren</h2>
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
          <p className="text-[12px] text-muted-foreground">
            Ein gesperrter Worktree wird nicht durch <code className="rounded bg-muted px-0.5 text-[11px]">git worktree prune</code> entfernt.
          </p>

          <div className="grid gap-1">
            <Label htmlFor="wt-lock-reason">Grund (optional)</Label>
            <textarea
              id="wt-lock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z.B. Wird für CI-Pipeline benötigt"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none resize-none focus:ring-2 focus:ring-ring/50"
            />
            <p className="text-[11px] text-muted-foreground">
              Wird als Metadaten gespeichert und bei <code className="rounded bg-muted px-0.5">git worktree list</code> angezeigt.
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
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Sperrt …" : "Sperren"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
