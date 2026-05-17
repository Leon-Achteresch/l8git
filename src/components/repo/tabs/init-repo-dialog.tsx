import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { join } from "@tauri-apps/api/path";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function InitRepoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const initRepo = useRepoStore((s) => s.initRepo);
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState(() => t("initRepo.defaultFolderName"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setParentDir("");
      setFolderName(t("initRepo.defaultFolderName"));
      setBusy(false);
    }
  }, [open, t]);

  async function pickParent() {
    const selected = await pickDirectory({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    setParentDir(selected);
  }

  async function runInit() {
    const name = folderName.trim();
    if (!parentDir.trim()) {
      toastError(t("initRepo.toastPickParent"));
      return;
    }
    if (!name) {
      toastError(t("initRepo.toastNeedFolderName"));
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
        toast.success(t("initRepo.toastCreated"));
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
      aria-label={t("initRepo.dialogAriaLabel")}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={dismiss}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("initRepo.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("initRepo.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="grid gap-4 p-4">
          <p className="text-xs text-muted-foreground">{t("initRepo.intro")}</p>
          <div className="grid gap-1.5">
            <Label>{t("initRepo.parentFolderLabel")}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => void pickParent()}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t("initRepo.pickFolder")}
            </Button>
            {parentDir && (
              <p className="truncate text-xs text-muted-foreground" title={parentDir}>
                {parentDir}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="init-folder-name">{t("initRepo.folderNameLabel")}</Label>
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
              {t("initRepo.cancel")}
            </Button>
            <Button type="button" onClick={() => void runInit()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("initRepo.create")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
