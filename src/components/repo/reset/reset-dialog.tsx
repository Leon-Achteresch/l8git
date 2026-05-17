import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type ResetMode = "soft" | "mixed" | "hard";

export function ResetDialog({
  open,
  onClose,
  path,
  commitHash,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  commitHash: string;
}) {
  const { t } = useTranslation();
  const gitReset = useRepoStore((s) => s.gitReset);
  const [mode, setMode] = useState<ResetMode>("mixed");
  const [target, setTarget] = useState(commitHash);
  const [busy, setBusy] = useState(false);

  const modes = useMemo(
    () =>
      ([
        { value: "soft" as const, label: "Soft", description: t("reset.modeSoftDesc"), danger: false },
        { value: "mixed" as const, label: "Mixed", description: t("reset.modeMixedDesc"), danger: false },
        { value: "hard" as const, label: "Hard", description: t("reset.modeHardDesc"), danger: true },
      ]) satisfies Array<{
        value: ResetMode;
        label: string;
        description: string;
        danger: boolean;
      }>,
    [t],
  );

  useEffect(() => {
    if (open) {
      setTarget(commitHash);
      setMode("mixed");
      setBusy(false);
    }
  }, [open, commitHash]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const hash = target.trim();
    if (!hash) {
      toastError(t("reset.toastEmptyTarget"));
      return;
    }
    setBusy(true);
    try {
      await gitReset(path, hash, mode);
      toast.success(t("reset.toastSuccess", { mode, hash }));
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
      aria-label={t("reset.dialogAriaLabel")}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("reset.title")}</h2>
          <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} disabled={busy} aria-label={t("dialogs.closeAria")}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="reset-target">
              {t("reset.targetLabel")}
            </label>
            <input
              id="reset-target"
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder={t("reset.targetPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">{t("reset.targetHint")}</p>
          </div>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("reset.modeLabel")}</span>
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  mode === m.value
                    ? m.danger
                      ? "border-destructive/60 bg-destructive/5"
                      : "border-primary/60 bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                    mode === m.value
                      ? m.danger
                        ? "border-destructive"
                        : "border-primary"
                      : "border-muted-foreground/40",
                  )}
                >
                  {mode === m.value && (
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        m.danger ? "bg-destructive" : "bg-primary",
                      )}
                    />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-semibold",
                      m.danger && mode === m.value && "text-destructive",
                    )}
                  >
                    {m.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{m.description}</span>
                </span>
                {m.danger && (
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      mode === m.value ? "text-destructive" : "text-muted-foreground/40",
                    )}
                  />
                )}
              </button>
            ))}
          </div>

          {mode === "hard" && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <strong>{t("reset.hardWarnStrong")}</strong> {t("reset.hardWarnRest")}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={mode === "hard" ? "destructive" : "default"}
              disabled={busy || !target.trim()}
            >
              {busy ? t("reset.submitBusy") : t("reset.submitIdle", { mode })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
