import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type LanguageStat = {
  language: string;
  color: string;
  bytes: number;
  percent: number;
};

export function RepoLanguageStats({
  open,
  path,
  onClose,
}: {
  open: boolean;
  path: string;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<LanguageStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStats([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    invoke<LanguageStat[]>("repo_language_stats", { path })
      .then(setStats)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, path]);

  if (!open) return null;

  const top = stats.slice(0, 10);
  const totalBytes = top.reduce((s, x) => s + x.bytes, 0);

  function formatBytes(b: number): string {
    if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} MB`;
    if (b >= 1_000) return `${(b / 1_000).toFixed(1)} KB`;
    return `${b} B`;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sprachverteilung"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Sprachen</h2>
            {totalBytes > 0 && !loading && (
              <p className="text-xs text-muted-foreground">{formatBytes(totalBytes)} gesamt</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Wird analysiert…
          </p>
        )}

        {error && (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && top.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine erkennbaren Sprachen gefunden.
          </p>
        )}

        {!loading && top.length > 0 && (
          <div className="space-y-3">
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-md">
              {top.map((s) => (
                <div
                  key={s.language}
                  style={{ width: `${s.percent}%`, backgroundColor: s.color }}
                  title={`${s.language}: ${s.percent.toFixed(1)}%`}
                  className="first:rounded-l-md last:rounded-r-md"
                />
              ))}
            </div>

            <ul className="space-y-2">
              {top.map((s) => (
                <li key={s.language} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{s.language}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {s.percent.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
