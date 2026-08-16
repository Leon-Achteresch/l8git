import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { loadSigningInfo, signingFormatLabel, type SigningInfo } from "@/lib/git-signing";
import { useRepoStore, type TagKind } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const TAG_KINDS: TagKind[] = ["lightweight", "annotated", "signed"];

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
  const [kind, setKind] = useState<TagKind>("lightweight");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState<SigningInfo | null>(null);

  useEffect(() => {
    if (!open) {
      setTagName("");
      setKind("lightweight");
      setMessage("");
      setBusy(false);
      return;
    }
    let alive = true;
    void loadSigningInfo(path)
      .then((info) => {
        if (!alive) return;
        setSigning(info);
        if (info.tagSign) setKind("signed");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, path]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  const needsMessage = kind !== "lightweight";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = tagName.trim();
    if (!n) {
      toastError(t("commitTagDialog.toastEmptyName"));
      return;
    }
    const msg = message.trim();
    if (needsMessage && !msg) {
      toastError(t("commitTagDialog.toastEmptyMessage"));
      return;
    }
    setBusy(true);
    try {
      await tagCommit(path, n, commitHash, {
        annotated: needsMessage,
        message: needsMessage ? msg : null,
        sign: kind === "signed",
      });
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

          <div className="grid gap-1.5">
            <Label>{t("commitTagDialog.kindLabel")}</Label>
            <div
              role="radiogroup"
              aria-label={t("commitTagDialog.kindLabel")}
              className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1"
            >
              {TAG_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={kind === option}
                  disabled={busy}
                  onClick={() => setKind(option)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
                    kind === option
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`tagKind.${option}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t(`commitTagDialog.kindHint.${kind}`)}
            </p>
            {kind === "signed" && signing && !signing.toolAvailable && (
              <p className="text-[11px] leading-snug text-destructive">
                {t("commitTagDialog.signToolMissing", {
                  format: signingFormatLabel(signing.format),
                  program: signing.program,
                })}
              </p>
            )}
          </div>

          {needsMessage && (
            <div className="grid gap-1">
              <Label htmlFor="commit-tag-message">
                {t("commitTagDialog.messageLabel")}
              </Label>
              <Textarea
                id="commit-tag-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                spellCheck={false}
                placeholder={t("commitTagDialog.messagePlaceholder")}
                className="resize-none text-[12.5px]"
              />
            </div>
          )}

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
