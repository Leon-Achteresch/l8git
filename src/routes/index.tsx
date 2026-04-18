import { createFileRoute } from "@tanstack/react-router";

import { useRepoStore } from "@/lib/repo-store";
import { useRepoRehydrate } from "@/lib/use-repo-rehydrate";
import { RepoTabBar } from "@/components/repo/repo-tab-bar";
import { RepoDetails } from "@/components/repo/repo-details";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  useRepoRehydrate();
  const hasRepos = useRepoStore((s) => s.paths.length > 0);

  return (
    <main>
      <RepoTabBar />
      <RepoDetails />
      {!hasRepos && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Klicke auf + um ein Git-Repository hinzuzufügen.
        </p>
      )}
    </main>
  );
}
