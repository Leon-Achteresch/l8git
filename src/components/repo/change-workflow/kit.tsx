import { formatBackendError } from '@/lib/backend-error';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type LoadState<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/** Runs `load` whenever `key` changes; stale results from an older key are dropped. */
export function useLoad<T>(key: string | null, load: () => Promise<T>): LoadState<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null; loading: boolean }>({ key: null, data: null, error: null, loading: false });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (key === null) {
      setState({ key, data: null, error: null, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ key, data: s.key === key ? s.data : null, error: null, loading: true }));
    loadRef.current().then(
      (data) => live && setState({ key, data, error: null, loading: false }),
      (e) => live && setState({ key, data: null, error: formatBackendError(e), loading: false }),
    );
    return () => {
      live = false;
    };
  }, [key, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export function LoadStatus({ state, label }: { state: Pick<LoadState<unknown>, "error" | "loading" | "reload">; label: string }) {
  const { t } = useTranslation();
  if (state.loading) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> {label}
      </p>
    );
  }
  if (!state.error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[0.6875rem] text-destructive">
      <span className="min-w-0 flex-1 break-words">{state.error}</span>
      <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[0.6875rem]" onClick={state.reload}>
        <RotateCw className="size-3" /> {t("common.retry")}
      </Button>
    </div>
  );
}

export function Pick({ label, value, onChange, options, placeholder, disabled }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-[0.6875rem] font-medium text-muted-foreground">
      {label}
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled || options.length === 0}>
        <SelectTrigger size="sm" className="mt-0.5 h-7 w-full text-xs" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

const TONE = { current: "success", done: "success", passed: "success", changed: "warning", stale: "warning", running: "info", missing: "destructive", failed: "destructive", unknown: "outline", pending: "outline", cancelled: "outline" } as const;

export function StateBadge({ state, label }: { state: keyof typeof TONE; label: string }) {
  return <Badge variant={TONE[state]} className="h-5 px-1.5 text-[0.625rem]">{label}</Badge>;
}

export const short = (sha: string) => sha.slice(0, 10);
export const errText = (e: unknown) => formatBackendError(e);
