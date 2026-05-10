import { memo } from "react";
import { Tag as TagIcon } from "lucide-react";

function CommitTagsInner({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200/90 bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
          title={t}
        >
          <TagIcon className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">{t}</span>
        </span>
      ))}
    </>
  );
}

// Custom comparator: tag arrays from backend are fresh on every reload but
// rarely change value — compare by content to avoid spurious re-renders.
export const CommitTags = memo(CommitTagsInner, (a, b) => {
  if (a.tags === b.tags) return true;
  if (a.tags.length !== b.tags.length) return false;
  for (let i = 0; i < a.tags.length; i++) {
    if (a.tags[i] !== b.tags[i]) return false;
  }
  return true;
});
