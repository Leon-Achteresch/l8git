import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useStackStore } from "@/lib/stack-store";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function StackCreateBranchDialog({
  open,
  onClose,
  path,
  parent,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  parent: string;
}) {
  const { t } = useTranslation();
  const createBranch = useStackStore((s) => s.createBranch);
  const suggestName = useStackStore((s) => s.suggestName);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !parent) {
      setName("");
      setBusy(false);
      return;
    }
    let cancelled = false;
    void suggestName(path, parent)
      .then((suggestion) => {
        if (!cancelled) setName((cur) => cur || suggestion);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, parent, path, suggestName]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) {
      toastError(t("stack.createNameRequired"));
      return;
    }
    setBusy(true);
    try {
      await createBranch(path, value, parent);
      toast.success(t("stack.createdToast", { name: value, parent }));
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
      aria-label={t("stack.createDialogAria")}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("stack.createTitle")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("stack.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            {t("stack.createDesc", { parent })}
          </p>
          <div className="grid gap-1">
            <Label htmlFor="stack-branch-name">{t("stack.createNameLabel")}</Label>
            <Input
              id="stack-branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              {t("stack.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "…" : t("stack.createAction")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
