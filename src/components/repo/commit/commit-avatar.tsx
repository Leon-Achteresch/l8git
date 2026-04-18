import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

export function CommitAvatar({
  url,
  name,
}: {
  url: string | null | undefined;
  name: string;
}) {
  return (
    <Avatar className="h-9 w-9 ring-2 ring-background shadow-sm transition-transform hover:scale-105">
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
