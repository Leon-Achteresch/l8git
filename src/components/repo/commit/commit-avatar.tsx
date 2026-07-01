import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

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
  const sources = useMemo(() => {
    const primary = url?.trim();
    const fallback = fallbackUrl?.trim();
    const list: string[] = [];
    if (primary) list.push(primary);
    if (fallback && fallback !== primary) list.push(fallback);
    return list;
  }, [url, fallbackUrl]);

  const [failed, setFailed] = useState<Record<string, true>>({});
  const activeSrc = sources.find((s) => !failed[s]);

  return (
    <span
      className={cn(
        SIZE_CLASSES[size],
        "relative flex shrink-0 overflow-hidden rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
      )}
    >
      {activeSrc ? (
        <img
          key={activeSrc}
          src={activeSrc}
          alt={name}
          decoding="async"
          className="aspect-square size-full rounded-full object-cover"
          onError={() => setFailed((f) => ({ ...f, [activeSrc]: true }))}
        />
      ) : (
        <span
          className={cn(
            "flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground font-medium",
            FALLBACK_CLASSES[size],
          )}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
