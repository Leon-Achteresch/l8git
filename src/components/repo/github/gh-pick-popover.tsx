import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toastError } from "@/lib/error-toast";
import type { Page } from "@/lib/github-expansion/api";
import { Check, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export type PickItem = { id: string; label: string; hint?: string; color?: string };

/**
 * Searchable checklist backed by a paginated provider list. `single` turns it into a radio list
 * (with an explicit "none" entry). Nothing is written until Apply.
 */
export function GhPickPopover({
  trigger,
  title,
  load,
  toItem,
  selected,
  single,
  extra,
  onApply,
}: {
  trigger: ReactNode;
  title: string;
  load: (page: number) => Promise<Page<unknown>>;
  toItem: (raw: unknown) => PickItem;
  selected: string[];
  single?: boolean;
  /** Free-form entries (e.g. `org/team`) the list cannot enumerate. */
  extra?: { placeholder: string; accept: (v: string) => string | null };
  onApply: (ids: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string[]>(selected);

  async function more(next: number) {
    setLoading(true);
    try {
      const res = await load(next);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...(next === 1 ? [] : prev), ...res.items.map(toItem).filter((i) => next === 1 || !seen.has(i.id))];
      });
      setPage(next);
      setHasMore(res.hasMore);
    } catch (e) {
      toastError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setPick(selected);
    setQ("");
    void more(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = useMemo(() => {
    const known = new Set(items.map((i) => i.id));
    const all: PickItem[] = [...items, ...pick.filter((id) => id && !known.has(id)).map((id) => ({ id, label: id }))];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((i) => i.label.toLowerCase().includes(needle)) : all;
  }, [items, pick, q]);

  const toggle = (id: string) =>
    setPick((p) => (single ? (p[0] === id ? [] : [id]) : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function apply() {
    setBusy(true);
    try {
      await onApply(pick);
      setOpen(false);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const freeform = extra ? extra.accept(q.trim()) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <p className="px-1 pb-1.5 text-[0.6875rem] font-semibold text-muted-foreground">{title}</p>
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && freeform) {
              e.preventDefault();
              toggle(freeform);
              setQ("");
            }
          }}
          placeholder={extra?.placeholder ?? t("ghx.filter")}
          className="h-7 text-xs"
        />
        <div role="listbox" aria-multiselectable={!single} className="mt-1.5 max-h-60 overflow-y-auto">
          {shown.map((i) => {
            const on = pick.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(i.id)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Check className={`h-3 w-3 shrink-0 ${on ? "text-primary" : "opacity-0"}`} />
                {i.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `#${i.color}` }} />}
                <span className="truncate">{i.label}</span>
                {i.hint && <span className="ml-auto truncate text-[0.625rem] text-muted-foreground">{i.hint}</span>}
              </button>
            );
          })}
          {freeform && !shown.some((i) => i.id === freeform) && (
            <button type="button" onClick={() => { toggle(freeform); setQ(""); }} className="w-full rounded-md px-1.5 py-1 text-left text-xs text-primary hover:bg-muted">
              {t("ghx.addEntry", { value: freeform })}
            </button>
          )}
          {loading && <Loader2 className="mx-auto my-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!loading && shown.length === 0 && <p className="px-1.5 py-2 text-xs text-muted-foreground">{t("ghx.nothingFound")}</p>}
          {!loading && hasMore && (
            <Button variant="ghost" size="sm" className="h-6 w-full text-[0.6875rem]" onClick={() => void more(page + 1)}>
              {t("ghx.loadMore")}
            </Button>
          )}
        </div>
        <div className="mt-2 flex justify-end gap-1.5 border-t border-border/50 pt-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void apply()}>
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("ghx.apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
