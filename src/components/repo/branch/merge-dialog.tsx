import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import type { MergeStrategy } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { GitMerge, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StrategyInfo = {
  id: MergeStrategy;
  label: string;
  description: string;
  createsCommit: boolean;
};

const STRATEGIES: StrategyInfo[] = [
  {
    id: "ff",
    label: "Fast-Forward (auto)",
    description:
      "Falls möglich wird einfach der Branch-Pointer weitergesetzt. Ist ein echter Merge nötig, entsteht ein Merge-Commit.",
    createsCommit: true,
  },
  {
    id: "ff-only",
    label: "Nur Fast-Forward",
    description:
      "Merge nur, wenn er als reiner Fast-Forward möglich ist. Bricht sonst ab. Es wird kein Commit erzeugt.",
    createsCommit: false,
  },
  {
    id: "no-ff",
    label: "Merge-Commit erzwingen (--no-ff)",
    description:
      "Erstellt immer einen expliziten Merge-Commit – auch wenn ein Fast-Forward möglich wäre.",
    createsCommit: true,
  },
  {
    id: "squash",
    label: "Squash-Merge",
    description:
      "Fasst alle Änderungen in einen einzigen neuen Commit zusammen. Es entsteht kein Merge-Commit, sondern ein normaler Commit.",
    createsCommit: true,
  },
];

function defaultMessageFor(
  strategy: MergeStrategy,
  source: string,
  target: string,
) {
  if (strategy === "squash") {
    return target
      ? `Squashed commit from '${source}' into ${target}`
      : `Squashed commit from '${source}'`;
  }
  return target ? `Merge branch '${source}' into ${target}` : `Merge branch '${source}'`;
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
  const mergeBranch = useRepoStore((s) => s.mergeBranch);
  const currentBranch = useRepoStore(
    (s) => s.repos[path]?.branch ?? "",
  );

  const [strategy, setStrategy] = useState<MergeStrategy>("ff");
  const [useCustomMessage, setUseCustomMessage] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const active = useMemo(
    () => STRATEGIES.find((s) => s.id === strategy) ?? STRATEGIES[0],
    [strategy],
  );

  const messageRelevant = strategy === "no-ff" || strategy === "squash";
  const autoMessage = useMemo(
    () => defaultMessageFor(strategy, sourceBranch, currentBranch),
    [strategy, sourceBranch, currentBranch],
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
          toastError("Merge-Nachricht darf nicht leer sein.");
          setBusy(false);
          return;
        }
        payload.message = msg;
      }
      const out = await mergeBranch(path, sourceBranch, payload);
      toast.success(out.trim() || "Merge abgeschlossen.");
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
      aria-label="Branch mergen"
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
            Branch mergen
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <p className="mb-3 truncate text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{sourceBranch}</span>
          {currentBranch ? (
            <>
              {" "}→{" "}
              <span className="font-mono text-foreground">{currentBranch}</span>
            </>
          ) : null}
        </p>

        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <fieldset className="grid gap-2" disabled={busy}>
            <legend className="mb-1 text-xs font-medium text-muted-foreground">
              Merge-Strategie
            </legend>
            {STRATEGIES.map((s) => {
              const checked = s.id === strategy;
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm transition-colors",
                    checked
                      ? "border-primary bg-accent/40"
                      : "hover:bg-accent/30",
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
                    <span className="text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {messageRelevant ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="merge-msg">Commit-Nachricht</Label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={useCustomMessage}
                    onChange={(e) => setUseCustomMessage(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                    disabled={busy}
                  />
                  Eigene Nachricht
                </label>
              </div>
              <Textarea
                id="merge-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                readOnly={!useCustomMessage}
                rows={3}
                spellCheck={false}
                className={cn(
                  "font-mono text-xs",
                  !useCustomMessage && "bg-muted/40 text-muted-foreground",
                )}
              />
              {!useCustomMessage ? (
                <p className="text-xs text-muted-foreground">
                  Automatisch generiert. Aktiviere „Eigene Nachricht" für einen individuellen Text.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              {active.id === "ff-only"
                ? "Bei einem reinen Fast-Forward wird kein Commit erstellt – daher ist keine Merge-Nachricht nötig."
                : "Falls ein Fast-Forward möglich ist, wird kein Commit erzeugt. Andernfalls verwendet Git die Standard-Merge-Nachricht."}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismiss}
              disabled={busy}
            >
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "…" : "Mergen"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
