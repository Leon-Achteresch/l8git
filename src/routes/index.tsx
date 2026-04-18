import { createFileRoute } from "@tanstack/react-router";

import { useRepoStore } from "@/lib/repo-store";
import { useRepoRehydrate } from "@/lib/use-repo-rehydrate";
import { RepoTabBar } from "@/components/repo/repo-tab-bar";
import { RepoDetails } from "@/components/repo/repo-details";
import { RepoSidebar } from "@/components/repo/repo-sidebar";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  useRepoRehydrate();
  const hasRepos = useRepoStore((s) => s.paths.length > 0);
  const activePath = useRepoStore((s) => s.activePath);

  return (
    <main>
      <RepoTabBar />
      <div className="flex">
        {activePath && <RepoSidebar />}
        <div className="min-w-0 flex-1 px-4">
          <RepoDetails />
          {!hasRepos && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Klicke auf + um ein Git-Repository hinzuzufügen.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
