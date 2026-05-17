import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function PushUpstreamDialog({
  open,
  onClose,
  path,
  branch,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  branch: string;
}) {
  const { t } = useTranslation();
  const reload = useRepoStore((s) => s.reload);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function confirmPublish() {
    setBusy(true);
    try {
      const out = await invoke<string>("git_push", {
        path,
        setUpstream: true,
      });
      await Promise.all([reload(path), reloadStatus(path)]);
      toast.success(out.trim() || t("pushUpstream.successFallback"));
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
      aria-label={t("pushUpstream.aria")}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("pushUpstream.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("pushUpstream.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("pushUpstream.body", { branch })}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
            {t("pushUpstream.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void confirmPublish()}
          >
            {busy ? t("editRemote.saveBusy") : t("pushUpstream.publish")}
          </Button>
        </div>
      </div>
    </div>
  );
}
