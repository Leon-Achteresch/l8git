import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { isRemoteCanceled, runRemoteOp } from "@/lib/remote-ops";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type GitRemoteRow = { name: string; url: string };

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
  const [remotes, setRemotes] = useState<GitRemoteRow[]>([]);
  const [remote, setRemote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const [list, preferred] = await Promise.all([
          invoke<GitRemoteRow[]>("list_git_remotes", { path }),
          invoke<string>("branch_push_remote", { path }).catch(() => "origin"),
        ]);
        if (!alive) return;
        setRemotes(list);
        const fallback = list[0]?.name ?? "origin";
        setRemote(list.some((r) => r.name === preferred) ? preferred : fallback);
      } catch {
        if (alive) {
          setRemotes([]);
          setRemote(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, path]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function confirmPublish() {
    setBusy(true);
    try {
      const out = await runRemoteOp("push", path, (opId) =>
        invoke<string>("git_push", {
          path,
          setUpstream: true,
          remote: remote ?? null,
          opId,
        }),
      );
      await Promise.all([reload(path), reloadStatus(path)]);
      toast.success(out.trim() || t("pushUpstream.successFallback"));
      onClose();
    } catch (e) {
      if (isRemoteCanceled(e)) toast.info(t("remoteProgress.canceledToast"));
      else toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const multiRemote = remotes.length > 1;

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
        <p className={cn("text-sm text-muted-foreground", multiRemote ? "mb-3" : "mb-4")}>
          {multiRemote
            ? t("pushUpstream.bodyWithRemote", { branch, remote: remote ?? "origin" })
            : t("pushUpstream.body", { branch })}
        </p>

        {multiRemote && (
          <div className="mb-4 grid gap-1.5">
            <Label>{t("pushRemote.label")}</Label>
            <div
              role="radiogroup"
              aria-label={t("pushRemote.label")}
              className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
            >
              {remotes.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  role="radio"
                  aria-checked={remote === r.name}
                  disabled={busy}
                  title={r.url}
                  onClick={() => setRemote(r.name)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                    remote === r.name
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

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
