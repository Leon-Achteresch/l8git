import { Tag as TagIcon } from "lucide-react";

export function CommitTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-git-tag/30 bg-git-tag/10 px-2 py-0.5 font-mono text-[11px] font-medium text-git-tag"
          title={t}
        >
          <TagIcon className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">{t}</span>
        </span>
      ))}
    </>
  );
}
