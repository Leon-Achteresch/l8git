import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { formatDate, formatRelative } from "@/lib/format";
import type { PullRequest } from "@/lib/repo-store";
import {
  Check,
  ChevronDown,
  GitPullRequest,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PullRequestStateBadge } from "./pull-request-state-badge";
import { useEffect, useMemo, useRef, useState } from "react";

const STATE_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "Offen" },
  { value: "draft", label: "Draft" },
  { value: "merged", label: "Merged" },
  { value: "closed", label: "Closed" },
];

const FILTER_STORAGE_KEY = "l8git.pr-filter.v1";

type StoredFilter = {
  states: string[];
  authors: string[];
};

function loadFilter(): StoredFilter {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { states: [], authors: [] };
    const parsed = JSON.parse(raw) as Partial<StoredFilter>;
    return {
      states: Array.isArray(parsed.states) ? parsed.states : [],
      authors: Array.isArray(parsed.authors) ? parsed.authors : [],
    };
  } catch {
    return { states: [], authors: [] };
  }
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function PullRequestList({
  prs,
  loading,
  selectedNumber,
  onSelect,
  onReload,
}: {
  prs: PullRequest[] | undefined;
  loading: boolean;
  selectedNumber: number | null;
  onSelect: (n: number) => void;
  onReload: () => void;
}) {
  const [stateFilter, setStateFilter] = useState<string[]>(
    () => loadFilter().states,
  );
  const [authorFilter, setAuthorFilter] = useState<string[]>(
    () => loadFilter().authors,
  );
  const [authorMenuOpen, setAuthorMenuOpen] = useState(false);
  const authorMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ states: stateFilter, authors: authorFilter }),
    );
  }, [stateFilter, authorFilter]);

  useEffect(() => {
    if (!authorMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!authorMenuRef.current) return;
      if (!authorMenuRef.current.contains(e.target as Node)) {
        setAuthorMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [authorMenuOpen]);

  const authors = useMemo(() => {
    if (!prs) return [] as string[];
    const set = new Set<string>();
    for (const pr of prs) {
      if (pr.author) set.add(pr.author);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [prs]);

  const filtered = useMemo(() => {
    if (!prs) return undefined;
    return prs.filter((pr) => {
      if (stateFilter.length > 0 && !stateFilter.includes(pr.state))
        return false;
      if (authorFilter.length > 0 && !authorFilter.includes(pr.author))
        return false;
      return true;
    });
  }, [prs, stateFilter, authorFilter]);

  const filtersActive = stateFilter.length > 0 || authorFilter.length > 0;

  const authorLabel =
    authorFilter.length === 0
      ? "Alle"
      : authorFilter.length === 1
        ? authorFilter[0]
        : `${authorFilter.length} ausgewählt`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitPullRequest className="h-4 w-4" />
          <span>Pull Requests</span>
          {prs ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered?.length ?? 0}
              {filtersActive ? ` / ${prs.length}` : ""}
            </span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReload}
          disabled={loading}
          className="h-7"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 text-xs">Aktualisieren</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b bg-background/60 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Status</span>
        <div className="flex flex-wrap gap-1">
          {STATE_OPTIONS.map((o) => {
            const active = stateFilter.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() =>
                  setStateFilter((cur) => toggle(cur, o.value))
                }
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
                aria-pressed={active}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        <span className="ml-2 text-muted-foreground">Autor</span>
        <div className="relative" ref={authorMenuRef}>
          <button
            type="button"
            onClick={() => setAuthorMenuOpen((o) => !o)}
            disabled={authors.length === 0}
            className="flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
            aria-haspopup="listbox"
            aria-expanded={authorMenuOpen}
          >
            <span className="max-w-[140px] truncate">{authorLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {authorMenuOpen ? (
            <div
              role="listbox"
              className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-auto rounded-md border bg-popover p-1 shadow-md"
            >
              {authors.length === 0 ? (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  Keine Autoren
                </div>
              ) : (
                authors.map((a) => {
                  const active = authorFilter.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() =>
                        setAuthorFilter((cur) => toggle(cur, a))
                      }
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors hover:bg-muted ${
                        active ? "bg-muted/60" : ""
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background"
                        }`}
                      >
                        {active ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{a}</span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setStateFilter([]);
              setAuthorFilter([]);
            }}
          >
            Zurücksetzen
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading && !prs ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Lade Pull Requests …
          </div>
        ) : !prs || prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <GitPullRequest className="h-8 w-8 opacity-40" />
            <span>Keine Pull Requests gefunden.</span>
            <span className="text-xs">
              Nicht angemeldet? Unter Einstellungen → Git-Konten anmelden.
            </span>
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <GitPullRequest className="h-8 w-8 opacity-40" />
            <span>Keine PRs passen zu den Filtern.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {filtered.map((pr) => {
              const selected = pr.number === selectedNumber;
              return (
                <li key={pr.number}>
                  <button
                    type="button"
                    onClick={() => onSelect(pr.number)}
                    className={`flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${
                      selected ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">
                        #{pr.number}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {pr.title}
                      </span>
                      <PullRequestStateBadge state={pr.state} />
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <CommitAvatar
                        url={pr.author_avatar}
                        name={pr.author}
                        size="sm"
                      />
                      <span className="min-w-0 truncate">{pr.author}</span>
                      <span aria-hidden="true" className="opacity-40">
                        ·
                      </span>
                      <time
                        dateTime={pr.updated_at}
                        title={formatDate(pr.updated_at)}
                        className="shrink-0 tabular-nums"
                      >
                        {formatRelative(pr.updated_at)}
                      </time>
                    </div>
                    <div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono">
                        {pr.source_branch}
                      </span>
                      <span className="opacity-60">→</span>
                      <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono">
                        {pr.target_branch}
                      </span>
                      {pr.labels.slice(0, 3).map((l) => (
                        <Badge
                          key={l}
                          variant="secondary"
                          className="ml-1 h-4 px-1.5 text-[10px]"
                        >
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
