export function AgentsDiffStat({ add, del }: { add: number; del: number }) {
  if (add === 0 && del === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
      <span className="text-git-added">+{add}</span>
      <span className="text-git-removed">−{del}</span>
    </span>
  );
}
