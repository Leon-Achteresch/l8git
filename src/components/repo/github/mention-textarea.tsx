import { Textarea } from "@/components/ui/textarea";
import { searchIssues, searchMentionables } from "@/lib/github-expansion/api";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Hit = { insert: string; label: string; hint?: string };

/** Token being typed right before the caret: `#12`, `#fix`, `@ali`. */
export function activeToken(text: string, caret: number): { kind: "#" | "@"; query: string; start: number } | null {
  const m = /(^|[\s(])([#@])([\w./-]*)$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { kind: m[2] as "#" | "@", query: m[3], start: caret - m[3].length - 1 };
}

/**
 * Textarea with `#` issue/PR and `@` collaborator completion against the repo's GitHub account.
 * Without a connected GitHub account it is a plain textarea.
 */
export function MentionTextarea({
  path,
  value,
  onChange,
  ...rest
}: Omit<ComponentProps<"textarea">, "value" | "onChange"> & { path: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [token, setToken] = useState<ReturnType<typeof activeToken>>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [idx, setIdx] = useState(0);

  // Scalar scope: the target object may be re-created per render; only a real account/repo change re-queries.
  const a = isTarget(target) ? target.account : null;
  const fullName = isTarget(target) ? target.fullName : null;
  useEffect(() => {
    if (!token || !a || !fullName) {
      setHits((h) => (h.length ? [] : h)); // no new array when already empty: avoids a render loop
      return;
    }
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        if (token.kind === "#") {
          const res = await searchIssues(a, `repo:${fullName} ${token.query || "is:open"}`);
          const list = res.items
            .filter((i) => !token.query || String(i.number).startsWith(token.query) || i.title.toLowerCase().includes(token.query.toLowerCase()))
            .slice(0, 8)
            .map((i) => ({ insert: `#${i.number}`, label: `#${i.number} ${i.title}`, hint: i.pull_request ? "PR" : i.state }));
          if (live) setHits(list);
        } else {
          const res = await searchMentionables(a, fullName, token.query);
          if (live) setHits(res.items.slice(0, 8).map((m) => ({ insert: m.insert, label: m.label, hint: m.kind === "team" ? "team" : undefined })));
        }
        if (live) setIdx(0);
      } catch {
        if (live) setHits([]);
      }
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [token, a, fullName]);

  function pick(h: Hit) {
    if (!token || !ref.current) return;
    const caret = ref.current.selectionStart;
    const next = `${value.slice(0, token.start)}${h.insert} ${value.slice(caret)}`;
    onChange(next);
    setToken(null);
    const pos = token.start + h.insert.length + 1;
    requestAnimationFrame(() => ref.current?.setSelectionRange(pos, pos));
  }

  const open = token && hits.length > 0;
  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={ref}
        value={value}
        aria-autocomplete="list"
        aria-expanded={!!open}
        onChange={(e) => {
          onChange(e.target.value);
          setToken(activeToken(e.target.value, e.target.selectionStart));
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => (i + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(hits[idx]);
              return;
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setToken(null);
              return;
            }
          }
          rest.onKeyDown?.(e);
        }}
        onBlur={(e) => {
          window.setTimeout(() => setToken(null), 120);
          rest.onBlur?.(e);
        }}
      />
      {open && (
        <div role="listbox" aria-label={t("ghx.suggestions")} className="absolute left-2 right-2 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {hits.map((h, i) => (
            <button
              key={h.insert}
              type="button"
              role="option"
              aria-selected={i === idx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(h)}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs ${i === idx ? "bg-muted" : ""}`}
            >
              <span className="truncate">{h.label}</span>
              {h.hint && <span className="ml-auto text-[0.625rem] text-muted-foreground">{h.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
