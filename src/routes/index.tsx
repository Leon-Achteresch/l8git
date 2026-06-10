import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { PanelSwap } from "@/components/motion/panel-swap";
import { CommitPanel } from "@/components/repo/commit/commit-panel";
import { RepoDetails } from "@/components/repo/layout/repo-details";
import { RepoTabLayout } from "@/components/repo/layout/repo-tab-layout";
import { EmptyState } from "@/components/repo/layout/empty-state";
import { RepoSidebar } from "@/components/repo/layout/repo-sidebar";
import { RepoTabBar } from "@/components/repo/tabs/repo-tab-bar";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useRepoRehydrate } from "@/lib/use-repo-rehydrate";
import { useRepoStatusPoll } from "@/lib/use-repo-status-poll";

// Heavy, conditionally shown panels (Monaco, xyflow, …) load on demand so the
// initial route chunk stays small and the app paints fast on slow machines.
const RepoCiPanel = lazy(() =>
  import("@/components/repo/ci/repo-ci-panel").then((m) => ({
    default: m.RepoCiPanel,
  })),
);
const MergeConflictPage = lazy(() =>
  import("@/components/repo/merge/merge-conflict-page").then((m) => ({
    default: m.MergeConflictPage,
  })),
);
const GitBlamePage = lazy(() =>
  import("@/components/repo/blame/git-blame-page").then((m) => ({
    default: m.GitBlamePage,
  })),
);
const PullRequestPanel = lazy(() =>
  import("@/components/repo/pr/pull-request-panel").then((m) => ({
    default: m.PullRequestPanel,
  })),
);
const StashPanel = lazy(() =>
  import("@/components/repo/stash/stash-panel").then((m) => ({
    default: m.StashPanel,
  })),
);
const SubmodulesPanel = lazy(() =>
  import("@/components/repo/submodules/submodules-panel").then((m) => ({
    default: m.SubmodulesPanel,
  })),
);
const GitHooksPanel = lazy(() =>
  import("@/components/repo/hooks/git-hooks-panel").then((m) => ({
    default: m.GitHooksPanel,
  })),
);
const WorktreePanel = lazy(() =>
  import("@/components/repo/worktree/worktree-panel").then((m) => ({
    default: m.WorktreePanel,
  })),
);

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
  const mergeEditorPath = useUiStore((s) => s.mergeEditorPath);
  const closeMergeEditor = useUiStore((s) => s.closeMergeEditor);
  const blameEditorPath = useUiStore((s) => s.blameEditorPath);
  const blameEditorFile = useUiStore((s) => s.blameEditorFile);
  const closeBlameEditor = useUiStore((s) => s.closeBlameEditor);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      {mergeEditorPath && (
        <Suspense fallback={null}>
          <MergeConflictPage
            path={mergeEditorPath}
            onClose={closeMergeEditor}
          />
        </Suspense>
      )}
      {blameEditorPath && (
        <Suspense fallback={null}>
          <GitBlamePage
            path={blameEditorPath}
            initialFile={blameEditorFile}
            onClose={closeBlameEditor}
          />
        </Suspense>
      )}
      <RepoTabBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activePath && <RepoSidebar />}
        <div
          className={`min-w-0 flex-1  pb-3 ${activePath ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          {activePath && repo ? (
            <RepoTabLayout path={repo.path}>
              <PanelSwap
                panelKey={`${activePath}::${sidebarTab}`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {sidebarTab === "commit" ? (
                  <CommitPanel />
                ) : (
                  <Suspense fallback={null}>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {sidebarTab === "stash" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <StashPanel path={repo.path} />
                      </div>
                    ) : sidebarTab === "pr" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <PullRequestPanel path={repo.path} />
                      </div>
                    ) : sidebarTab === "submodules" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <SubmodulesPanel path={repo.path} />
                      </div>
                    ) : sidebarTab === "worktrees" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <WorktreePanel path={repo.path} />
                      </div>
                    ) : sidebarTab === "hooks" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <GitHooksPanel path={repo.path} />
                      </div>
                    ) : sidebarTab === "ci" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <RepoCiPanel path={repo.path} />
                      </div>
                    ) : (
                      <RepoDetails />
                    )}
                  </div>
                  </Suspense>
                )}
              </PanelSwap>
            </RepoTabLayout>
          ) : (
            <RepoDetails />
          )}
          {!hasRepos && <EmptyState />}
        </div>
      </div>
    </main>
  );
}
