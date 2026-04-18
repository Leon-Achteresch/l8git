import { useRepoStore } from "@/lib/repo-store";
import { Loader2 } from "lucide-react";
import { CommitList } from "./commit-list";
import { RepoRemoteToolbar } from "./repo-remote-toolbar";

export function RepoDetails() {
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const loading = useRepoStore((s) =>
    activePath ? !!s.loading[activePath] : false,
  );

  if (repo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <RepoRemoteToolbar path={repo.path} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <CommitList commits={repo.commits} />
        </div>
      </div>
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
