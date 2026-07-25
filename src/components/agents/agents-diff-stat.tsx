export function AgentsDiffStat({ add, del }: { add: number; del: number }) {
  if (add === 0 && del === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
      {add > 0 && (
        <span className="rounded-full bg-git-added/10 px-1.5 py-0.5 text-git-added">
          +{add}
        </span>
      )}
      {del > 0 && (
        <span className="rounded-full bg-git-removed/10 px-1.5 py-0.5 text-git-removed">
          −{del}
        </span>
      )}
    </span>
  );
}
