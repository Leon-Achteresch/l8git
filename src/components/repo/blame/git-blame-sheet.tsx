import { toastError } from "@/lib/error-toast";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { GitCommitHorizontal, Loader2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type BlameEntry = {
  commit_hash: string;
  short_hash: string;
  author: string;
  date: string;
  timestamp: number;
  summary: string;
  line_no: number;
  content: string;
};

type BlameItem = {
  entry: BlameEntry;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  groupIndex: number;
};

type ActiveInfo = {
  entry: BlameEntry;
  top: number;
  left: number;
};

type GitBlameSheetProps = {
  path: string;
  file: string;
  commit?: string;
  onClose: () => void;
  onNavigateToCommit?: (hash: string) => void;
};

function nameToHsl(name: string): string {
  let n = 0;
  for (let i = 0; i < name.length; i++) {
    n = ((n * 31 + name.charCodeAt(i)) | 0) >>> 0;
  }
  const hue = n % 360;
  return `hsl(${hue}, 55%, 42%)`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

function formatFullDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildItems(entries: BlameEntry[]): BlameItem[] {
  const items: BlameItem[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const prev = entries[i - 1];
    const next = entries[i + 1];
    const isFirstInGroup = !prev || prev.commit_hash !== entry.commit_hash;
    const isLastInGroup = !next || next.commit_hash !== entry.commit_hash;
    let groupIndex = 0;
    if (i > 0 && items[i - 1]) {
      groupIndex = isFirstInGroup
        ? items[i - 1]!.groupIndex + 1
        : items[i - 1]!.groupIndex;
    }
    items.push({ entry, isFirstInGroup, isLastInGroup, groupIndex });
  }
  return items;
}

const LINE_HEIGHT = 24;
const META_WIDTH = 220;

function CommitInfoCard({
  info,
  onClose,
  onNavigate,
}: {
  info: ActiveInfo;
  onClose: () => void;
  onNavigate?: (hash: string) => void;
}) {
  const color = nameToHsl(info.entry.author);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        top: info.top,
        left: info.left,
        zIndex: 100,
        maxWidth: 320,
        minWidth: 260,
      }}
      className="overflow-hidden rounded-xl border border-border/80 bg-popover shadow-2xl"
    >
      <div className="border-b border-border/40 px-4 py-3">
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {info.entry.summary || "Kein Commit-Titel"}
        </p>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: color }}
          >
            {initials(info.entry.author)}
          </div>
          <span className="text-[12px] font-medium text-foreground">
            {info.entry.author}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{info.entry.short_hash}</span>
          <span className="opacity-40">·</span>
          <span>{formatFullDate(info.entry.timestamp)}</span>
        </div>
      </div>
      {onNavigate && (
        <div className="border-t border-border/40 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onNavigate(info.entry.commit_hash);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/8 transition-colors"
          >
            <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0" />
            Zum Commit navigieren
          </button>
        </div>
      )}
    </div>
  );
}

function BlameLines({
  items,
  onAuthorClick,
}: {
  items: BlameItem[];
  onAuthorClick: (entry: BlameEntry, rect: DOMRect) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 30,
  });

  const maxLineNo = items.length > 0 ? items[items.length - 1]!.entry.line_no : 1;
  const lineNoWidth = Math.max(String(maxLineNo).length, 3);

  return (
    <div ref={scrollerRef} className="h-full overflow-auto">
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          if (!item) return null;
          const { entry, isFirstInGroup, isLastInGroup, groupIndex } = item;
          const color = nameToHsl(entry.author);
          const isEvenGroup = groupIndex % 2 === 0;

          return (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
                height: LINE_HEIGHT,
              }}
              className={`flex items-stretch hover:bg-primary/5 ${
                isEvenGroup ? "bg-muted/10" : ""
              }`}
            >
              <div
                className={`w-[3px] shrink-0 transition-colors ${
                  isFirstInGroup ? "rounded-t-full" : ""
                } ${isLastInGroup ? "rounded-b-full" : ""}`}
                style={{ background: color, opacity: 0.7 }}
              />

              <span
                className="flex shrink-0 select-none items-center justify-end pr-3 pl-2 font-mono text-[11px] text-muted-foreground/40"
                style={{ width: `${lineNoWidth + 2}ch` }}
              >
                {entry.line_no}
              </span>

              <div
                className="flex shrink-0 items-center"
                style={{ width: META_WIDTH }}
              >
                {isFirstInGroup ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onAuthorClick(entry, rect);
                    }}
                    className="group flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted/50"
                  >
                    <div
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm"
                      style={{ background: color }}
                    >
                      {initials(entry.author)}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-foreground/80">
                      {entry.author}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/60">
                      {entry.date}
                    </span>
                  </button>
                ) : (
                  <div className="flex w-full items-center pl-1.5">
                    <div
                      className="ml-0.5 mr-2 h-full w-[1px] self-stretch opacity-20"
                      style={{ background: color }}
                    />
                  </div>
                )}
              </div>

              <div className="w-px shrink-0 self-stretch bg-border/30" />

              <span className="min-w-0 flex-1 self-center truncate whitespace-pre px-3 font-mono text-[12px] text-foreground/85">
                {entry.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GitBlameSheet({
  path,
  file,
  commit,
  onClose,
  onNavigateToCommit,
}: GitBlameSheetProps) {
  const [entries, setEntries] = useState<BlameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeInfo, setActiveInfo] = useState<ActiveInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    setActiveInfo(null);
    try {
      const data = await invoke<BlameEntry[]>("repo_blame", {
        path,
        file,
        commit: commit ?? null,
      });
      setEntries(data);
    } catch (e) {
      setFailed(true);
      toastError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, file, commit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeInfo) {
          setActiveInfo(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, activeInfo]);

  const items = useMemo(() => buildItems(entries), [entries]);

  const fileName = file.split("/").pop() ?? file;
  const dir = file.split("/").slice(0, -1).join("/");

  const handleAuthorClick = useCallback(
    (entry: BlameEntry, rect: DOMRect) => {
      setActiveInfo((prev) =>
        prev?.entry.commit_hash === entry.commit_hash
          ? null
          : {
              entry,
              top: rect.bottom + 4,
              left: rect.left,
            },
      );
    },
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border/60 px-3 py-2.5">
        <GitCommitHorizontal className="h-4 w-4 shrink-0 text-primary/70" />
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {fileName}
          </span>
          {dir && (
            <span className="truncate text-[11px] text-muted-foreground/50">
              {dir}
            </span>
          )}
          {commit && (
            <span className="ml-1 shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              @ {commit.slice(0, 8)}
            </span>
          )}
        </div>
        {!loading && !failed && (
          <span className="shrink-0 text-[11px] text-muted-foreground/50">
            {entries.length} Zeilen
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Blame schließen"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
            <span className="text-sm">Lade Blame…</span>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <span>Blame konnte nicht geladen werden.</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Keine Blame-Daten vorhanden.
          </div>
        ) : (
          <BlameLines items={items} onAuthorClick={handleAuthorClick} />
        )}
      </div>

      {activeInfo && (
        <CommitInfoCard
          info={activeInfo}
          onClose={() => setActiveInfo(null)}
          onNavigate={onNavigateToCommit}
        />
      )}
    </div>
  );
}
