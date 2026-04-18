import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

export function RemoteCheckoutDialog({
  open,
  onClose,
  path,
  remoteRef,
  defaultLocalName,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  remoteRef: string;
  defaultLocalName: string;
}) {
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const [localName, setLocalName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setLocalName("");
      setBusy(false);
      return;
    }
    setLocalName(defaultLocalName.trim() || "branch");
  }, [open, defaultLocalName]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = localName.trim();
    if (!n) {
      toastError("Branch-Name darf nicht leer sein.");
      return;
    }
    setBusy(true);
    try {
      await checkoutBranch(path, n, { fromRemote: remoteRef });
      onClose();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lokalen Branch auschecken"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">
            Lokaler Branch von Remote
          </h2>
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
        <p className="mb-3 truncate text-xs text-muted-foreground" title={remoteRef}>
          Remote: <span className="font-mono text-foreground">{remoteRef}</span>
        </p>
        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="rc-local">Lokaler Branch-Name</Label>
            <Input
              id="rc-local"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "…" : "Auschecken"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
