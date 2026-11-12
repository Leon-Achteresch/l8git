import { formatBackendError } from '@/lib/backend-error';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { applyPatches, checkPatches, pickPatchFiles, usePatchStore, type PatchCheck } from "@/lib/patches";
import { CheckCircle2, FileDiff, LoaderCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Dry-runs plain diffs; mailbox series are checked by git am as each commit is applied. */
export function ApplyPatchDialog({ path, open, onClose }: { path: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const [threeWay, setThreeWay] = useState(false);
  const [check, setCheck] = useState<PatchCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setThreeWay(false);
      setCheck(null);
      setCheckError(null);
    }
  }, [open]);

  useEffect(() => {
    if (files.length === 0) return;
    let live = true;
    setChecking(true);
    setCheck(null);
    setCheckError(null);
    checkPatches(path, files, threeWay)
      .then((result) => live && setCheck(result))
      .catch((err) => live && setCheckError(formatBackendError(err)))
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [path, files, threeWay, t]);

  async function choose() {
    try {
      const picked = await pickPatchFiles();
      if (picked.length > 0) setFiles(picked);
    } catch (err) {
      toastError(String(err));
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const out = await applyPatches(path, files, threeWay);
      toast.success(out.trim() || t("patches.appliedToast"));
      onClose();
    } catch (err) {
      // A stopped `git am` is shown by the history banner with continue, skip and abort.
      if (usePatchStore.getState().amState[path]?.in_progress) {
        toast.warning(t("patches.amStoppedToast"));
        onClose();
      } else {
        toastError(String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const name = (file: string) => file.split(/[\\/]/).pop() ?? file;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileDiff className="size-4 text-primary" />{t("patches.applyTitle")}</DialogTitle>
          <DialogDescription>{t("patches.applyDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void choose()} disabled={busy}>{t("patches.chooseFiles")}</Button>
            <span className="text-xs text-muted-foreground">{t("patches.fileCount", { count: files.length })}</span>
          </div>
          {files.length > 0 && (
            <ul className="grid max-h-32 gap-0.5 overflow-auto rounded-md border p-2 font-mono text-xs">
              {files.map((file) => <li key={file} className="truncate" title={file}>{name(file)}</li>)}
            </ul>
          )}
          <div className="flex items-start gap-2">
            <Checkbox id="patch-3way" checked={threeWay} onCheckedChange={(v) => setThreeWay(v === true)} disabled={busy} />
            <div className="grid gap-0.5">
              <Label htmlFor="patch-3way">{t("patches.threeWay")}</Label>
              <span className="text-xs text-muted-foreground">{t("patches.threeWayHint")}</span>
            </div>
          </div>
          {checking && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />{t("patches.checking")}</p>}
          {checkError && <p className="text-xs text-destructive">{checkError}</p>}
          {check && (
            <div className="grid gap-1" role="status">
              <p className={`flex items-center gap-2 ${check.applies === null ? "text-muted-foreground" : check.applies ? "text-git-added" : "text-destructive"}`}>
                {check.applies === null ? <FileDiff className="size-4" /> : check.applies ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                {t(check.applies === null ? "patches.checkOnImport" : check.applies ? "patches.checkOk" : "patches.checkFailed")}
              </p>
              <p className="text-xs text-muted-foreground">{check.mailbox ? t("patches.modeAm") : t("patches.modeApply")}</p>
              {check.message.trim() && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-[0.6875rem]">{check.message.trim()}</pre>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void apply()}
            // Mailbox validation is deferred to import; --3way may resolve a failed plain-diff check.
            disabled={busy || checking || !check || (check.applies === false && !threeWay)}
          >
            {busy ? t("editRemote.saveBusy") : t("patches.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
