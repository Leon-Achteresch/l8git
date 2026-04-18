import { createFileRoute } from "@tanstack/react-router";

import { CommitPanel } from "@/components/repo/commit-panel";
import { RepoDetails } from "@/components/repo/repo-details";
import { RepoSidebar } from "@/components/repo/repo-sidebar";
import { RepoTabBar } from "@/components/repo/repo-tab-bar";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useRepoRehydrate } from "@/lib/use-repo-rehydrate";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  useRepoRehydrate();
  const hasRepos = useRepoStore((s) => s.paths.length > 0);
  const activePath = useRepoStore((s) => s.activePath);
  const sidebarTab = useUiStore((s) => s.sidebarTab);

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <RepoTabBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activePath && <RepoSidebar />}
        <div
          className={`min-w-0 flex-1 px-4 pb-3 ${activePath ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          {activePath && sidebarTab === "commit" ? (
            <CommitPanel />
          ) : activePath ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RepoDetails />
            </div>
          ) : (
            <RepoDetails />
          )}
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
