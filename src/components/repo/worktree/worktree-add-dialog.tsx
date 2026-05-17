import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function WorktreeAddDialog({
  open,
  onClose,
  path,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  branches: Branch[];
}) {
  const { t } = useTranslation();
  const worktreeAdd = useRepoStore((s) => s.worktreeAdd);
  const [worktreePath, setWorktreePath] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existingBranch, setExistingBranch] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [busy, setBusy] = useState(false);

  const localBranches = branches.filter((b) => !b.is_remote && !b.is_current);

  useEffect(() => {
    if (!open) {
      setWorktreePath("");
      setMode("existing");
      setExistingBranch("");
      setNewBranch("");
      setBaseBranch("");
      setBusy(false);
    }
  }, [open]);

  const dismiss = () => {
    if (busy) return;
    onClose();
  };

  const pickFolder = async () => {
    const selected = await pickDirectory({ directory: true, multiple: false });
    if (typeof selected === "string") setWorktreePath(selected);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimPath = worktreePath.trim();
    if (!trimPath) return;

    setBusy(true);
    try {
      if (mode === "existing") {
        const b = existingBranch.trim();
        if (!b) {
          toastError(t("worktreeAdd.toastSelectBranch"));
          setBusy(false);
          return;
        }
        const out = await worktreeAdd(path, trimPath, { branch: b });
        toast.success(out || t("worktreeAdd.toastCreatedFallback"));
      } else {
        const nb = newBranch.trim();
        if (!nb) {
          toastError(t("worktreeAdd.toastNewBranchRequired"));
          setBusy(false);
          return;
        }
        const out = await worktreeAdd(path, trimPath, {
          newBranch: nb,
          branch: baseBranch.trim() || undefined,
        });
        toast.success(out || t("worktreeAdd.toastCreatedFallback"));
      }
      onClose();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("worktreeAdd.aria")} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={dismiss}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("worktreeAdd.title")}</h2>
          <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} disabled={busy} aria-label={t("worktreeAdd.closeAria")}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="wt-path">{t("worktreeAdd.pathLabel")}</Label>
            <div className="flex gap-1.5">
              <Input
                id="wt-path"
                value={worktreePath}
                onChange={(e) => setWorktreePath(e.target.value)}
                placeholder={t("worktreeAdd.pathPlaceholder")}
                spellCheck={false}
                required
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => void pickFolder()} aria-label={t("worktreeAdd.pickFolderAria")}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("worktreeAdd.pathHint")}</p>
          </div>

          <div className="grid gap-1">
            <Label>{t("worktreeAdd.modeLabel")}</Label>
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`flex-1 px-3 py-1.5 text-center transition-colors ${
                  mode === "existing" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                {t("worktreeAdd.modeExistingBranch")}
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`flex-1 px-3 py-1.5 text-center transition-colors ${
                  mode === "new" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                {t("worktreeAdd.modeNewBranch")}
              </button>
            </div>
          </div>

          {mode === "existing" ? (
            <div className="grid gap-1">
              <Label htmlFor="wt-existing-branch">{t("worktreeAdd.branchLabel")}</Label>
              <select
                id="wt-existing-branch"
                value={existingBranch}
                onChange={(e) => setExistingBranch(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                required
              >
                <option value="">{t("worktreeAdd.branchUnset")}</option>
                {localBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{t("worktreeAdd.existingBranchHint")}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-1">
                <Label htmlFor="wt-new-branch">{t("worktreeAdd.newBranchLabel")}</Label>
                <Input id="wt-new-branch" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder={t("worktreeAdd.newBranchPlaceholder")} spellCheck={false} required />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="wt-base-branch">{t("worktreeAdd.baseBranchLabel")}</Label>
                <select
                  id="wt-base-branch"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="">{t("worktreeAdd.baseFromHead")}</option>
                  {branches
                    .filter((b) => !b.is_remote)
                    .map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                        {b.is_current ? ` (${t("pr.branchCurrentBadge")})` : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-muted-foreground">{t("worktreeAdd.basisHint")}</p>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              {t("worktreeAdd.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy || !worktreePath.trim() || (mode === "existing" && !existingBranch) || (mode === "new" && !newBranch.trim())}>
              {busy ? t("worktreeAdd.submitBusy") : t("worktreeAdd.submitCreate")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
