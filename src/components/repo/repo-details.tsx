import { Card, CardContent } from "@/components/ui/card";
import { useRepoStore } from "@/lib/repo-store";
import { Loader2 } from "lucide-react";
import { CommitList } from "./commit-list";

export function RepoDetails() {
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const error = useRepoStore((s) => (activePath ? s.errors[activePath] : null));
  const loading = useRepoStore((s) =>
    activePath ? !!s.loading[activePath] : false,
  );

  if (error) {
    return (
      <Card className="mt-4 border-destructive/50">
        <CardContent className="pt-6 text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (repo) {
    return (
      <>
        <CommitList commits={repo.commits} />
      </>
    );
  }

  if (loading) {
    return (
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Lade …
      </p>
    );
  }

  return null;
}
