import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

type Size = "xs" | "sm" | "md";

const SIZE_CLASSES: Record<Size, string> = {
  xs: "h-5 w-5",
  sm: "h-6 w-6",
  md: "h-8 w-8",
};

const FALLBACK_CLASSES: Record<Size, string> = {
  xs: "text-[0.5625rem]",
  sm: "text-[0.625rem]",
  md: "text-xs",
};

type Phase = "primary" | "fallback" | "off";

// Rows remount avatars while scrolling. An image that just failed (e.g. a Gravatar
// 404) is not requested again for every row; it is retried after a minute, or
// right away once the network comes back.
const FAILED_RETRY_MS = 60_000;
const failedAt = new Map<string, number>();
window.addEventListener("online", () => failedAt.clear());
const usable = (src: string | undefined) => {
  if (!src) return undefined;
  const failed = failedAt.get(src);
  if (failed === undefined) return src;
  if (Date.now() - failed < FAILED_RETRY_MS) return undefined;
  failedAt.delete(src);
  return src;
};

export function CommitAvatar({
  url,
  fallbackUrl,
  name,
  size = "md",
}: {
  url: string | null | undefined;
  fallbackUrl?: string | null | undefined;
  name: string;
  size?: Size;
}) {
  const first = url?.trim() || undefined;
  const fallbackSlot =
    fallbackUrl === undefined
      ? { mode: "none" as const }
      : {
          mode: "chain" as const,
          src:
            typeof fallbackUrl === "string" && fallbackUrl.trim()
              ? fallbackUrl.trim()
              : undefined,
        };
  const second = fallbackSlot.mode === "chain" ? fallbackSlot.src : undefined;
  const [phase, setPhase] = useState<Phase>("primary");
  const pendingSecondRef = useRef(false);

  useEffect(() => {
    setPhase("primary");
    pendingSecondRef.current = false;
  }, [first]);

  useEffect(() => {
    if (!pendingSecondRef.current || !second) return;
    pendingSecondRef.current = false;
    setPhase("fallback");
  }, [second]);

  // A URL known to fail is skipped as if its error had just fired. Checked once per
  // URL, so a re-render after the retry window doesn't swap a showing fallback back.
  const firstUsable = useMemo(() => usable(first), [first]);
  const secondUsable = useMemo(() => usable(second), [second]);
  const activeSrc: string | undefined =
    phase === "primary"
      ? (firstUsable ?? (first ? secondUsable : undefined))
      : phase === "fallback"
        ? secondUsable
        : undefined;

  return (
    <Avatar className={cn(SIZE_CLASSES[size], "shrink-0")}>
      {activeSrc ? (
        <AvatarImage
          key={activeSrc}
          src={activeSrc}
          alt={name}
          onLoadingStatusChange={(s) => {
            if (s !== "error") return;
            failedAt.set(activeSrc, Date.now());
            setPhase((p) => {
              if (p === "primary") {
                if (second) return "fallback";
                if (fallbackSlot.mode === "chain") {
                  pendingSecondRef.current = true;
                }
                return "off";
              }
              if (p === "fallback") return "off";
              return p;
            });
          }}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-muted text-muted-foreground font-medium",
          FALLBACK_CLASSES[size],
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
