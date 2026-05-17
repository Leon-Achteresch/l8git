import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type GitRemoteRow = { name: string; url: string };

export function EditRemoteDialog({
  open,
  onClose,
  path,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
}) {
  const { t } = useTranslation();
  const reload = useRepoStore((s) => s.reload);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remotes, setRemotes] = useState<GitRemoteRow[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [newRemoteName, setNewRemoteName] = useState("origin");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<GitRemoteRow[]>("list_git_remotes", { path });
      setRemotes(list);
      if (list.length > 0) {
        const preferred = list.find((r) => r.name === "origin") ?? list[0];
        setSelectedName(preferred.name);
        setUrlDraft(preferred.url);
      } else {
        setSelectedName("");
        setUrlDraft("");
        setNewRemoteName("origin");
      }
    } catch (e) {
      toastError(String(e));
      setRemotes([]);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    void load();
  }, [open, load]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    const url = urlDraft.trim();
    if (!url) {
      toastError(t("editRemote.emptyUrlToast"));
      return;
    }
    setBusy(true);
    try {
      if (remotes.length === 0) {
        const n = newRemoteName.trim();
        if (!n) {
          toastError(t("editRemote.emptyNameToast"));
          setBusy(false);
          return;
        }
        const out = await invoke<string>("add_git_remote", {
          path,
          name: n,
          url,
        });
        await Promise.all([reload(path), reloadStatus(path)]);
        toast.success(out.trim() || t("editRemote.toastAddedFallback"));
        onClose();
        return;
      }
      const out = await invoke<string>("set_git_remote_url", {
        path,
        name: selectedName,
        url,
      });
      await Promise.all([reload(path), reloadStatus(path)]);
      toast.success(out.trim() || t("editRemote.toastSavedFallback"));
      onClose();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const empty = remotes.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("editRemote.dialogAria")}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("editRemote.titleEdit")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("editRemote.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("editRemote.loadingRemotes")}
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {empty ? (
              <div className="grid gap-1">
                <Label htmlFor="er-new-name">{t("editRemote.nameLabelNew")}</Label>
                <Input
                  id="er-new-name"
                  value={newRemoteName}
                  onChange={(e) => setNewRemoteName(e.target.value)}
                  placeholder={t("editRemote.originPlaceholder")}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={busy}
                />
              </div>
            ) : (
              <div className="grid gap-1">
                <Label htmlFor="er-remote">{t("editRemote.nameLabelExisting")}</Label>
                <select
                  id="er-remote"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedName}
                  onChange={(e) => {
                    const n = e.target.value;
                    setSelectedName(n);
                    const row = remotes.find((r) => r.name === n);
                    if (row) setUrlDraft(row.url);
                  }}
                  disabled={busy}
                >
                  {remotes.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-1">
              <Label htmlFor="er-url">{t("editRemote.urlLabel")}</Label>
              <Input
                id="er-url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder={t("editRemote.urlPlaceholderShort")}
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
                {t("editRemote.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? t("editRemote.saveBusy") : empty ? t("editRemote.submitAdd") : t("editRemote.submitSave")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
