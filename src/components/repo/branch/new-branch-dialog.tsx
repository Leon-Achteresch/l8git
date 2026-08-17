import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError } from "@/lib/error-toast";
import type { Branch } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { useStackStore } from "@/lib/stack-store";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const COMMIT_BASE = "__commit__";

export function NewBranchDialog({
  open,
  onClose,
  path,
  branches,
  commitRef: initialCommitRef,
  commitLabel,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  branches: Branch[];
  commitRef?: string;
  commitLabel?: string;
}) {
  const { t } = useTranslation();
  const createBranch = useRepoStore((s) => s.createBranch);
  const createStackBranch = useStackStore((s) => s.createBranch);
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [commitRef, setCommitRef] = useState("");
  const [checkoutAfter, setCheckoutAfter] = useState(true);
  const [asStackBranch, setAsStackBranch] = useState(false);
  const [busy, setBusy] = useState(false);

  const locals = useMemo(
    () => branches.filter((b) => !b.is_remote).map((b) => b.name),
    [branches],
  );

  const currentName = useMemo(
    () => branches.find((b) => b.is_current && !b.is_remote)?.name ?? "",
    [branches],
  );

  const baseOptions = useMemo(
    () => (locals.length > 0 ? locals : [currentName || "HEAD"]),
    [locals, currentName],
  );

  const fromCommit = base === COMMIT_BASE;

  useEffect(() => {
    if (!open) {
      setName("");
      setBase("");
      setCommitRef("");
      setCheckoutAfter(true);
      setAsStackBranch(false);
      setBusy(false);
      return;
    }
    if (initialCommitRef) {
      setBase(COMMIT_BASE);
      setCommitRef((c) => c || initialCommitRef);
      return;
    }
    setBase((b) => b || currentName);
  }, [open, currentName, initialCommitRef]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      toastError(t("newBranchDialog.toastEmptyName"));
      return;
    }
    if (fromCommit && !commitRef.trim()) {
      toastError(t("newBranchDialog.toastCommitMissing"));
      return;
    }
    const parent = base.trim() || currentName;
    if (asStackBranch && !parent) {
      toastError(t("newBranchDialog.toastStackParentMissing"));
      return;
    }
    setBusy(true);
    try {
      if (fromCommit) {
        await createBranch(path, n, commitRef.trim(), checkoutAfter);
      } else if (asStackBranch) {
        await createStackBranch(path, n, parent);
      } else {
        await createBranch(path, n, base.trim() || undefined, checkoutAfter);
      }
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
      aria-label={t("newBranchDialog.dialogAria")}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("newBranchDialog.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("newBranchDialog.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="nb-name">{t("newBranchDialog.nameLabel")}</Label>
            <Input
              id="nb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="feature/…"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="nb-base">{t("newBranchDialog.baseLabel")}</Label>
            <Select
              value={base || currentName || baseOptions[0] || ""}
              onValueChange={setBase}
            >
              <SelectTrigger id="nb-base" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {baseOptions.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
                <SelectItem value={COMMIT_BASE}>
                  {t("newBranchDialog.baseCommitOption")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {fromCommit ? (
            <div className="grid gap-1">
              <Label htmlFor="nb-commit">{t("newBranchDialog.commitLabel")}</Label>
              <Input
                id="nb-commit"
                value={commitRef}
                onChange={(e) => setCommitRef(e.target.value)}
                placeholder={t("newBranchDialog.commitPlaceholder")}
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
              />
              {commitLabel ? (
                <p className="truncate text-xs text-muted-foreground" title={commitLabel}>
                  {commitLabel}
                </p>
              ) : null}
            </div>
          ) : null}
          <label
            className={cn(
              "flex items-center gap-2 text-sm",
              fromCommit ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            <Checkbox
              checked={!fromCommit && asStackBranch}
              disabled={fromCommit}
              onCheckedChange={(checked) => setAsStackBranch(checked === true)}
            />
            {t("newBranchDialog.asStackBranch", {
              parent: (fromCommit ? "" : base.trim()) || currentName || "HEAD",
            })}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={!fromCommit && asStackBranch ? true : checkoutAfter}
              disabled={!fromCommit && asStackBranch}
              onCheckedChange={(checked) => setCheckoutAfter(checked === true)}
            />
            {t("newBranchDialog.checkoutAfter")}
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              {t("newBranchDialog.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "…" : t("newBranchDialog.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
