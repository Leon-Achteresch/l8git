import type { PrReviewer } from "@/lib/repo-store";

export function PrReviewerAvatarStack({ reviewers }: { reviewers: PrReviewer[] }) {
  if (reviewers.length === 0) return null;
  const shown = reviewers.slice(0, 3);

  return (
    <span className="flex items-center">
      {shown.map((r, i) => (
        <span
          key={r.login}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-bold text-muted-foreground shadow-2xs"
          style={{
            marginLeft: i === 0 ? 0 : "-6px",
            zIndex: shown.length - i,
          }}
          title={r.login}
        >
          {r.login[0]?.toUpperCase()}
        </span>
      ))}
      {reviewers.length > 3 && (
        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
          +{reviewers.length - 3}
        </span>
      )}
    </span>
  );
}
