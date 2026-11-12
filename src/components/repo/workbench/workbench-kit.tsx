import { formatBackendError } from '@/lib/backend-error';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import { gitExpansion, type CommandSpec, type GitExpansionRequest, type GitExpansionResponseMap, type RunResult } from "@/lib/git-expansion";
import { commandLine, toCommand } from "@/lib/workbench-ui/args";
import { ChevronRight, Loader2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

export function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border/60" aria-labelledby={`wb-${id}`}>
      <button
        id={`wb-${id}`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left"
      >
        <ChevronRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <span>
          <span className="block text-xs font-semibold">{title}</span>
          <span className="block text-[0.6875rem] text-muted-foreground">{hint}</span>
        </span>
      </button>
      {open && <div className="space-y-2 border-t border-border/50 px-3 py-2.5">{children}</div>}
    </section>
  );
}

/** One typed git_expansion call with busy/error state; errors go to a toast and stay visible. */
export function useGx(path: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const call = useCallback(
    async <R extends GitExpansionRequest>(req: R): Promise<GitExpansionResponseMap[R["op"]] | null> => {
      setBusy(true);
      setError(null);
      try {
        return await gitExpansion(path, req);
      } catch (e) {
        setError(formatBackendError(e));
        toastError(String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [path],
  );
  return { busy, error, call };
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[0.6875rem] font-medium text-muted-foreground">
      {label}
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, mono = true }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`h-7 text-xs ${mono ? "font-mono" : ""}`} />
    </Field>
  );
}

export function RunButton({ busy, disabled, onClick, children }: { busy: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="sm" className="h-7 text-xs" disabled={busy || disabled} onClick={onClick}>
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </Button>
  );
}

/** Program + argv + timeout. The exact argv is shown before anything runs. */
export function CommandFields({ value, onChange }: { value: { line: string; timeout: number }; onChange: (v: { line: string; timeout: number }) => void }) {
  const { t } = useTranslation();
  const cmd = toCommand(value.line, value.timeout);
  return (
    <div className="grid grid-cols-[1fr_5rem] gap-2">
      <TextField label={t("wb.command")} value={value.line} onChange={(line) => onChange({ ...value, line })} placeholder="npm test -- --run" />
      <Field label={t("wb.timeout")}>
        <Input type="number" min={1} max={3600} value={value.timeout} onChange={(e) => onChange({ ...value, timeout: Number(e.target.value) })} className="h-7 text-xs" />
      </Field>
      <p className="col-span-2 text-[0.625rem] text-muted-foreground">
        {cmd ? t("wb.willRun", { argv: commandLine(cmd) }) : t("wb.noCommand")}
      </p>
    </div>
  );
}

export const useCommand = () => useState<{ line: string; timeout: number }>({ line: "", timeout: 600 });
export const commandOf = (v: { line: string; timeout: number }): CommandSpec | null => toCommand(v.line, v.timeout);

export function confirmRun(t: (k: string, o?: Record<string, unknown>) => string, cmd: CommandSpec, where: string): boolean {
  return window.confirm(t("wb.confirmRun", { argv: commandLine(cmd), where }));
}

export function RunOutput({ run }: { run: RunResult }) {
  const { t } = useTranslation();
  const ok = run.exitCode === 0 && !run.timedOut;
  return (
    <div className="space-y-1">
      <p className={`text-[0.6875rem] font-semibold ${ok ? "text-emerald-500" : "text-rose-500"}`}>
        {run.timedOut ? t("wb.timedOut") : t("wb.exit", { code: run.exitCode ?? "?" })} · {(run.durationMs / 1000).toFixed(1)}s
        {run.truncated && ` · ${t("wb.truncated")}`}
      </p>
      {(run.stdout || run.stderr) && <Pre text={[run.stdout, run.stderr].filter(Boolean).join("\n")} />}
    </div>
  );
}

export function Pre({ text, max = 64 }: { text: string; max?: number }) {
  return (
    <pre tabIndex={0} className="overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[0.625rem] leading-relaxed select-text" style={{ maxHeight: `${max / 4}rem` }}>
      {text}
    </pre>
  );
}

export const short = (sha: string) => sha.slice(0, 10);
