import { Tag as TagIcon } from "lucide-react";

export function CommitTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((t) => (
        <div
          key={t}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-git-tag/10 text-git-tag text-[10px] font-mono font-medium tracking-wide"
          title={t}
        >
          <TagIcon className="h-2.5 w-2.5" />
          <span className="truncate max-w-[100px]">{t}</span>
        </div>
      ))}
    </>
  );
}
