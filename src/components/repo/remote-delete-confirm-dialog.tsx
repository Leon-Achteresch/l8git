import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function RemoteDeleteConfirmDialog({
  open,
  onClose,
  path,
  remoteRef,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  remoteRef: string;
}) {
  const deleteRemoteBranch = useRepoStore((s) => s.deleteRemoteBranch);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      const out = await deleteRemoteBranch(path, remoteRef);
      toast.success(out || "Remote-Branch gelöscht.");
      onClose();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Remote-Branch löschen"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">Remote-Branch löschen</h2>
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
        <p className="mb-4 text-sm text-muted-foreground">
          Remote-Branch{" "}
          <span className="font-mono font-medium text-foreground">{remoteRef}</span>{" "}
          auf dem Server unwiderruflich löschen?
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void confirmDelete()}
          >
            {busy ? "…" : "Löschen"}
          </Button>
        </div>
      </div>
    </div>
  );
}
