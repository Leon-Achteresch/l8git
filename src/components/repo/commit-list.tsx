import { GitCommit } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommitRow } from "./commit-row";
import type { Commit } from "@/lib/repo-store";

export function CommitList({ commits }: { commits: Commit[] }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCommit className="h-5 w-5" />
          Commits
          <Badge variant="outline">{commits.length}</Badge>
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <ScrollArea className="h-[60vh]">
          <ul>
            {commits.map((c, i) => (
              <li key={c.hash}>
                {i > 0 && <Separator />}
                <CommitRow commit={c} />
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
