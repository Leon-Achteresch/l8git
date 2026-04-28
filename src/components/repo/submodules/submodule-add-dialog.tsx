import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function SubmoduleAddDialog({
  open,
  onClose,
  path,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
}) {
  const submoduleAdd = useRepoStore((s) => s.submoduleAdd);
  const [url, setUrl] = useState("");
  const [subpath, setSubpath] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setSubpath("");
      setName("");
      setBranch("");
      setBusy(false);
    }
  }, [open]);

  const dismiss = () => {
    if (busy) return;
    onClose();
  };

  const autoFillPath = (rawUrl: string) => {
    if (subpath) return;
    try {
      const lastSegment = rawUrl
        .replace(/\.git$/, "")
        .split(/[/\\]/)
        .filter(Boolean)
        .pop();
      if (lastSegment) setSubpath(lastSegment);
    } catch {
      // ignore
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimUrl = url.trim();
    const trimPath = subpath.trim();
    if (!trimUrl || !trimPath) return;
    setBusy(true);
    try {
      const out = await submoduleAdd(
        path,
        trimUrl,
        trimPath,
        name.trim() || undefined,
        branch.trim() || undefined,
      );
      toast.success(out || "Submodule hinzugefügt.");
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
      aria-label="Submodule hinzufügen"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">
            Submodule hinzufügen
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
        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="sub-url">Repository-URL *</Label>
            <Input
              id="sub-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={(e) => autoFillPath(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              spellCheck={false}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sub-path">Lokaler Pfad *</Label>
            <Input
              id="sub-path"
              value={subpath}
              onChange={(e) => setSubpath(e.target.value)}
              placeholder="vendor/lib"
              spellCheck={false}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Relativer Pfad innerhalb des Repositories
            </p>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sub-name">Name (optional)</Label>
            <Input
              id="sub-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wird aus URL abgeleitet"
              spellCheck={false}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sub-branch">Branch verfolgen (optional)</Label>
            <Input
              id="sub-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Setzt -b in .gitmodules. Leer = Standard-Branch.
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
            <Button type="submit" size="sm" disabled={busy || !url.trim() || !subpath.trim()}>
              {busy ? "Lädt …" : "Hinzufügen"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
