import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

type Size = "xs" | "sm" | "md";

const SIZE_CLASSES: Record<Size, string> = {
  xs: "h-5 w-5",
  sm: "h-6 w-6",
  md: "h-8 w-8",
};

const FALLBACK_CLASSES: Record<Size, string> = {
  xs: "text-[9px]",
  sm: "text-[10px]",
  md: "text-xs",
};

type Phase = "primary" | "fallback" | "off";

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

  const activeSrc: string | undefined =
    phase === "primary"
      ? first
      : phase === "fallback"
        ? second
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
