import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initials, formatDate } from "@/lib/format";
import { useGravatarUrl } from "@/lib/gravatar";
import type { Commit } from "@/lib/repo-store";

export function CommitRow({ commit }: { commit: Commit }) {
  const avatarUrl = useGravatarUrl(commit.email);
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50">
      <Avatar className="h-8 w-8">
        {avatarUrl && (
          <AvatarImage src={avatarUrl} alt={commit.author} />
        )}
        <AvatarFallback className="text-xs">
          {initials(commit.author)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{commit.subject}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{commit.author}</span>
          <span>·</span>
          <span>{formatDate(commit.date)}</span>
        </div>
      </div>
      <Badge variant="outline" className="font-mono text-xs text-git-hash">
        {commit.short_hash}
      </Badge>
    </div>
  );
}
