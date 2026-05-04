import { createFileRoute } from "@tanstack/react-router";

import { PanelSwap } from "@/components/motion/panel-swap";
import { RepoCiPanel } from "@/components/repo/ci/repo-ci-panel";
import { CommitPanel } from "@/components/repo/commit/commit-panel";
import { RepoDetails } from "@/components/repo/layout/repo-details";
import { EmptyState } from "@/components/repo/layout/empty-state";
import { RepoSidebar } from "@/components/repo/layout/repo-sidebar";
import { PullRequestPanel } from "@/components/repo/pr/pull-request-panel";
import { StashPanel } from "@/components/repo/stash/stash-panel";
import { SubmodulesPanel } from "@/components/repo/submodules/submodules-panel";
import { RepoTabBar } from "@/components/repo/tabs/repo-tab-bar";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useRepoRehydrate } from "@/lib/use-repo-rehydrate";
import { useRepoStatusPoll } from "@/lib/use-repo-status-poll";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  useRepoRehydrate();
  useRepoStatusPoll();
  const hasRepos = useRepoStore((s) => s.paths.length > 0);
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) =>
    s.activePath ? s.repos[s.activePath] : null,
  );
  const sidebarTab = useUiStore((s) => s.sidebarTab);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      <RepoTabBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activePath && <RepoSidebar />}
        <div
          className={`min-w-0 flex-1 px-4 pb-3 ${activePath ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          {activePath ? (
            <PanelSwap
              panelKey={`${activePath}::${sidebarTab}`}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {sidebarTab === "commit" ? (
                <CommitPanel />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {repo &&
                  (sidebarTab === "stash" ||
                    sidebarTab === "pr" ||
                    sidebarTab === "ci" ||
                    sidebarTab === "submodules") ? (
                    <div className="min-h-0 flex-1 overflow-hidden">
                      {sidebarTab === "stash" ? (
                        <StashPanel path={repo.path} />
                      ) : sidebarTab === "pr" ? (
                        <PullRequestPanel path={repo.path} />
                      ) : sidebarTab === "submodules" ? (
                        <SubmodulesPanel path={repo.path} />
                      ) : (
                        <RepoCiPanel path={repo.path} />
                      )}
                    </div>
                  ) : (
                    <RepoDetails />
                  )}
                </div>
              )}
            </PanelSwap>
          ) : (
            <RepoDetails />
          )}
          {!hasRepos && <EmptyState />}
        </div>
      </div>
    </main>
  );
}
