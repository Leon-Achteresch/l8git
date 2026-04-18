import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
};

const FALLBACK_CLASSES: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-xs",
};

export function CommitAvatar({
  url,
  name,
  size = "md",
}: {
  url: string | null | undefined;
  name: string;
  size?: Size;
}) {
  return (
    <Avatar className={cn(SIZE_CLASSES[size], "shrink-0")}>
      {url && <AvatarImage src={url} alt={name} />}
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
