import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { GitCommitHorizontal } from "lucide-react";

import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import type { CrossRepoCommitResults } from "@/lib/cross-repo-commit-search";
import { formatRelative } from "@/lib/format";
import { repoLabel } from "@/lib/repo-store";

/** Header-search result groups: one per other open repo with commit hits. */
export function CrossRepoCommitGroups({
  groups,
  onSelect,
}: {
  groups: CrossRepoCommitResults["groups"];
  onSelect: (path: string, hash: string) => void;
}) {
  const { t } = useTranslation();
  return groups.map((g) => (
    <Fragment key={g.path}>
      <CommandSeparator />
      <CommandGroup heading={t("appSearch.groupRepoCommits", { repo: repoLabel(g.path) })}>
        {g.hits.map((c) => (
          <CommandItem
            key={c.hash}
            value={`xcommit:${g.path}:${c.hash}`}
            onSelect={() => onSelect(g.path, c.hash)}
          >
            <GitCommitHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
              {c.short_hash}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">{c.subject}</span>
            <span className="max-w-[30%] shrink-0 truncate text-[0.625rem] text-muted-foreground">
              {c.author} · {formatRelative(c.date)}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
    </Fragment>
  ));
}
