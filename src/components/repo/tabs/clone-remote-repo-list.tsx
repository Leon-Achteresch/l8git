import { Input } from "@/components/ui/input";
import type { RemoteRepo } from "@/lib/remote-repo";
import { GitBranch, Globe, Lock } from "lucide-react";
import { useMemo, useState } from "react";

export function CloneRemoteRepoList({
  repos,
  onPick,
}: {
  repos: RemoteRepo[];
  onPick: (r: RemoteRepo) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s),
    );
  }, [repos, q]);

  return (
    <div className="grid gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtern…"
        spellCheck={false}
        autoComplete="off"
      />
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <GitBranch className="h-8 w-8 opacity-20" />
          <span className="text-sm">
            {q ? "Keine Treffer" : "Keine Repositories gefunden"}
          </span>
        </div>
      ) : (
        <ul className="max-h-[min(50vh,320px)] space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
          {filtered.map((r) => (
            <li key={r.clone_url}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted"
              >
                {r.private ? (
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                ) : (
                  <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.full_name}</span>
                  {r.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.description}
                    </span>
                  )}
                  {r.default_branch && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/60">
                      <GitBranch className="h-2.5 w-2.5" />
                      {r.default_branch}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
