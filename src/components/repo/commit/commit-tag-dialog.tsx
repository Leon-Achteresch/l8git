import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function CommitTagDialog({
  open,
  onClose,
  path,
  commitHash,
  shortHash,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  commitHash: string;
  shortHash: string;
}) {
  const { t } = useTranslation();
  const tagCommit = useRepoStore((s) => s.tagCommit);
  const [tagName, setTagName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTagName("");
      setBusy(false);
    }
  }, [open]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = tagName.trim();
    if (!n) {
      toastError(t("commitTagDialog.toastEmptyName"));
      return;
    }
    setBusy(true);
    try {
      await tagCommit(path, n, commitHash);
      toast.success(t("commitTagDialog.toastSuccess", { name: n }));
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
      aria-label={t("commitTagDialog.dialogAria")}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("commitTagDialog.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("commitTagDialog.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <p className="mb-3 truncate text-xs text-muted-foreground" title={commitHash}>
          {t("commitTagDialog.commitPrefix")}{" "}
          <span className="font-mono text-foreground">{shortHash}</span>
        </p>
        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="commit-tag-name">{t("commitTagDialog.tagNameLabel")}</Label>
            <Input
              id="commit-tag-name"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              {t("commitTagDialog.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("editRemote.saveBusy") : t("commitTagDialog.submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
