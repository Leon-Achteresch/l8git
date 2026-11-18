import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatBackendError } from "@/lib/backend-error";
import { createIgnoreLookup, type IgnoreExplanation, type IgnoreLookupState } from "@/lib/ignore-explanation";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export function IgnoreExplanationResult({ result }: { result: IgnoreExplanation }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-w-0 gap-3 text-sm" role="status">
      <p>{t(result.ignored ? "ignoreExplanation.ignored" : result.rule ? "ignoreExplanation.negated" : "ignoreExplanation.noMatch")}</p>
      <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{result.file}</pre>
      {result.rule && (
        <dl className="grid min-w-0 gap-2 rounded-md border p-3 text-xs">
          {([
            ["source", result.rule.source],
            ["line", result.rule.line],
            ["pattern", result.rule.pattern],
          ] as const).map(([key, value]) => (
            <div key={key} className="grid min-w-0 gap-1">
              <dt className="text-muted-foreground">{t(`ignoreExplanation.${key}`)}</dt>
              <dd className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!result.rule && <p className="text-xs text-muted-foreground">{t("ignoreExplanation.noMatchHint")}</p>}
    </div>
  );
}

// Reset the entire input/request lifetime on a repository switch, including A → B → A.
export function IgnoreExplanationDialog({ path, onClose }: { path: string; onClose: () => void }) {
  return <IgnoreExplanationForm key={path} path={path} onClose={onClose} />;
}

function IgnoreExplanationForm({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [file, setFile] = useState("");
  const [state, setState] = useState<IgnoreLookupState>({ status: "idle" });
  const lookup = useMemo(() => createIgnoreLookup(setState), []);
  useEffect(() => () => lookup.cancel(), [lookup]);
  function close() { lookup.cancel(); onClose(); }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("ignoreExplanation.title")}</DialogTitle>
          <DialogDescription>{t("ignoreExplanation.description")}</DialogDescription>
        </DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={(event) => {
          event.preventDefault();
          if (file.length > 0 && state.status !== "loading") void lookup.check(path, file);
        }}>
          <div className="grid gap-2">
            <Label htmlFor={id}>{t("ignoreExplanation.path")}</Label>
            <Textarea id={id} autoFocus value={file} rows={2} maxLength={16384} autoComplete="off" spellCheck={false}
              aria-describedby={`${id}-hint`} className="font-mono text-xs"
              onChange={(event) => { lookup.cancel(); setState({ status: "idle" }); setFile(event.target.value); }} />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t("ignoreExplanation.pathHint")}</p>
          </div>
          {state.status === "loading" && <p role="status" className="text-xs text-muted-foreground">{t("ignoreExplanation.checking")}</p>}
          {state.status === "error" && <p role="alert" className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-destructive">{String(state.error).includes("__INVALID_WORKTREE_PATH__") ? t("ignoreExplanation.invalidPath") : formatBackendError(state.error)}</p>}
          {state.status === "ready" && <IgnoreExplanationResult result={state.result} />}
          <DialogFooter>
            <Button type="button" size="sm" variant="ghost" onClick={close}>{t("common.close")}</Button>
            <Button type="submit" size="sm" disabled={file.length === 0 || state.status === "loading"}>{t("ignoreExplanation.check")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
