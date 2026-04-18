import { createFileRoute } from "@tanstack/react-router";

import { CommitPanel } from "@/components/repo/commit/commit-panel";
import { RepoCiPanel } from "@/components/repo/ci/repo-ci-panel";
import { RepoDetails } from "@/components/repo/layout/repo-details";
import { RepoSidebar } from "@/components/repo/layout/repo-sidebar";
import { PullRequestPanel } from "@/components/repo/pr/pull-request-panel";
import { RepoRemoteToolbar } from "@/components/repo/remote/repo-remote-toolbar";
import { StashPanel } from "@/components/repo/stash/stash-panel";
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
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <RepoTabBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activePath && <RepoSidebar />}
        <div
          className={`min-w-0 flex-1 px-4 pb-3 ${activePath ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          {!activePath ? (
            <RepoDetails />
          ) : sidebarTab === "commit" ? (
            <CommitPanel />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {repo &&
              (sidebarTab === "stash" ||
                sidebarTab === "pr" ||
                sidebarTab === "ci") ? (
                <>
                  <RepoRemoteToolbar path={repo.path} />
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {sidebarTab === "stash" ? (
                      <StashPanel path={repo.path} />
                    ) : sidebarTab === "pr" ? (
                      <PullRequestPanel path={repo.path} />
                    ) : (
                      <RepoCiPanel path={repo.path} />
                    )}
                  </div>
                </>
              ) : (
                <RepoDetails />
              )}
            </div>
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
