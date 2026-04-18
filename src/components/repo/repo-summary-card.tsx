import { FolderOpen, GitBranch } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { repoLabel, type RepoInfo } from "@/lib/repo-store";

export function RepoSummaryCard({ repo }: { repo: RepoInfo }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          {repoLabel(repo.path)}
        </CardTitle>
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <div className="truncate" title={repo.path}>
            {repo.path}
          </div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-git-branch" />
            <Badge variant="secondary" className="font-mono text-git-branch">
              {repo.branch}
            </Badge>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
