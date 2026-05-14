import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import type { MergeStrategy } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { GitMerge, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function defaultMergeMessageFor(
  t: (key: string, opts?: Record<string, string>) => string,
  strategy: MergeStrategy,
  source: string,
  target: string,
) {
  if (strategy === "squash") {
    return target
      ? t("merge.squashMessageWithTarget", { source, target })
      : t("merge.squashMessageNoTarget", { source });
  }
  return target ? t("merge.mergeMessageWithTarget", { source, target }) : t("merge.mergeMessageNoTarget", { source });
}

export function MergeDialog({
  open,
  onClose,
  path,
  sourceBranch,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  sourceBranch: string;
}) {
  const { t } = useTranslation();
  const mergeBranch = useRepoStore((s) => s.mergeBranch);
  const currentBranch = useRepoStore((s) => s.repos[path]?.branch ?? "");

  const [strategy, setStrategy] = useState<MergeStrategy>("ff");
  const [useCustomMessage, setUseCustomMessage] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const strategies = useMemo(
    () =>
      [
        {
          id: "ff" as const,
          label: t("merge.strategyFfLabel"),
          description: t("merge.strategyFfDesc"),
          createsCommit: true,
        },
        {
          id: "ff-only" as const,
          label: t("merge.strategyFfOnlyLabel"),
          description: t("merge.strategyFfOnlyDesc"),
          createsCommit: false,
        },
        {
          id: "no-ff" as const,
          label: t("merge.strategyNoFfLabel"),
          description: t("merge.strategyNoFfDesc"),
          createsCommit: true,
        },
        {
          id: "squash" as const,
          label: t("merge.strategySquashLabel"),
          description: t("merge.strategySquashDesc"),
          createsCommit: true,
        },
      ] as const,
    [t],
  );

  const active = useMemo(
    () => strategies.find((s) => s.id === strategy) ?? strategies[0],
    [strategy, strategies],
  );

  const messageRelevant = strategy === "no-ff" || strategy === "squash";
  const autoMessage = useMemo(
    () => defaultMergeMessageFor(t, strategy, sourceBranch, currentBranch),
    [strategy, sourceBranch, currentBranch, t],
  );

  useEffect(() => {
    if (!open) {
      setStrategy("ff");
      setUseCustomMessage(false);
      setMessage("");
      setBusy(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!useCustomMessage) {
      setMessage(autoMessage);
    }
  }, [autoMessage, useCustomMessage]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: { strategy: MergeStrategy; message?: string } = {
        strategy,
      };
      if (messageRelevant) {
        const msg = useCustomMessage ? message.trim() : autoMessage;
        if (!msg) {
          toastError(t("merge.messageEmptyToast"));
          setBusy(false);
          return;
        }
        payload.message = msg;
      }
      const out = await mergeBranch(path, sourceBranch, payload);
      if (out.toLowerCase().includes("conflict")) {
        toast.warning(t("merge.toastConflict"), {
          duration: 6000,
        });
        onClose();
      } else {
        toast.success(out.trim() || t("merge.toastSuccess"));
        onClose();
      }
    } catch (err) {
      const msg = String(err);
      if (msg.toLowerCase().includes("conflict")) {
        toast.warning(t("merge.toastConflict"), {
          duration: 6000,
        });
        onClose();
      } else {
        toastError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("merge.dialogAria")}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-base font-medium">
            <GitMerge className="h-4 w-4" />
            {t("merge.title")}
          </h2>
          <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} disabled={busy} aria-label={t("dialogs.closeAria")}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <p className="mb-3 truncate text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{sourceBranch}</span>
          {currentBranch ? (
            <>
              {" "}
              →{" "}
              <span className="font-mono text-foreground">{currentBranch}</span>
            </>
          ) : null}
        </p>

        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <fieldset className="grid gap-2" disabled={busy}>
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("merge.strategyLegend")}</legend>
            {strategies.map((s) => {
              const checked = s.id === strategy;
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm transition-colors",
                    checked ? "border-primary bg-accent/40" : "hover:bg-accent/30",
                  )}
                >
                  <input
                    type="radio"
                    name="merge-strategy"
                    value={s.id}
                    checked={checked}
                    onChange={() => setStrategy(s.id)}
                    className="mt-1 h-3.5 w-3.5 accent-primary"
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {messageRelevant ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="merge-msg">{t("merge.messageLabel")}</Label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={useCustomMessage}
                    onChange={(e) => setUseCustomMessage(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                    disabled={busy}
                  />
                  {t("merge.customMessage")}
                </label>
              </div>
              <Textarea
                id="merge-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                readOnly={!useCustomMessage}
                rows={3}
                spellCheck={false}
                className={cn("font-mono text-xs", !useCustomMessage && "bg-muted/40 text-muted-foreground")}
              />
              {!useCustomMessage ? <p className="text-xs text-muted-foreground">{t("merge.autoMessageHint")}</p> : null}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              {active.id === "ff-only" ? t("merge.hintFfOnly") : t("merge.hintFfFlexible")}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("merge.submitBusy") : t("merge.submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
