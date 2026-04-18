import { Calendar, User } from "lucide-react";
import { formatDate } from "@/lib/format";

export function CommitAuthorDate({
  author,
  date,
}: {
  author: string;
  date: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground/80 font-medium">
      <div className="flex items-center gap-1.5 hover:text-foreground transition-colors">
        <User className="h-3.5 w-3.5" />
        <span className="truncate max-w-[120px]">{author}</span>
      </div>
      <div className="h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5 hover:text-foreground transition-colors">
        <Calendar className="h-3.5 w-3.5" />
        <span>{formatDate(date)}</span>
      </div>
    </div>
  );
}
