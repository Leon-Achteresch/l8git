import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type GitRemoteRow = { name: string; url: string };

export function RemoteTagDeleteDialog({
  open,
  onClose,
  path,
  tagName,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  tagName: string;
}) {
  const { t } = useTranslation();
  const deleteRemoteTag = useRepoStore((s) => s.deleteRemoteTag);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remotes, setRemotes] = useState<GitRemoteRow[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setLoading(false);
      setRemotes([]);
      setSelected("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const list = await invoke<GitRemoteRow[]>("list_git_remotes", {
          path,
        });
        if (cancelled) return;
        setRemotes(list);
        if (list.length > 0) {
          const preferred = list.find((r) => r.name === "origin") ?? list[0];
          setSelected(preferred.name);
        } else {
          setSelected("");
        }
      } catch (e) {
        if (!cancelled) {
          toastError(String(e));
          setRemotes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, path]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function confirmDelete() {
    if (!selected) {
      toastError(t("remoteTagDelete.toastSelectRemote"));
      return;
    }
    setBusy(true);
    try {
      const out = await deleteRemoteTag(path, tagName, selected);
      toast.success(
        out || t("remoteTagDelete.toastSuccess", { tag: tagName, remote: selected }),
      );
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
      aria-label={t("remoteTagDelete.title")}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("remoteTagDelete.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("remoteTagDelete.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("remoteTagDelete.bodyLead")}{" "}
          <span className="font-mono font-medium text-foreground">{tagName}</span>{" "}
          {t("remoteTagDelete.bodyTail")}
        </p>
        {loading ? (
          <p className="mb-4 text-xs text-muted-foreground">{t("remoteTagDelete.loadingRemotes")}</p>
        ) : remotes.length === 0 ? (
          <p className="mb-4 text-xs text-destructive">{t("remoteTagDelete.noRemotes")}</p>
        ) : (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("editRemote.nameLabelExisting")}
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-ring"
            >
              {remotes.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
            {t("remoteTagDelete.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || loading || remotes.length === 0}
            onClick={() => void confirmDelete()}
          >
            {busy ? t("remoteTagDelete.deleteBusy") : t("remoteTagDelete.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
