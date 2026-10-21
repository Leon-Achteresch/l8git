import { PanelLoading } from "@/components/ui/panel-loading";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useDeferredValue } from "react";

import { PanelSwap } from "@/components/motion/panel-swap";
import { CommitPanel } from "@/components/repo/commit/commit-panel";
import { RepoDetails } from "@/components/repo/layout/repo-details";
import { RepoTabLayout } from "@/components/repo/layout/repo-tab-layout";
import { EmptyState } from "@/components/repo/layout/empty-state";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import { RepoSidebar } from "@/components/repo/layout/repo-sidebar";
import { useRepoStore } from "@/lib/repo-store";
import { useStackRestackWatcher } from "@/lib/stack-store";
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
const ToolsPanel = lazy(() =>
  import("@/components/repo/tools/tools-panel").then((m) => ({
    default: m.ToolsPanel,
  })),
);

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  useRepoRehydrate();
  useRepoStatusPoll();
  const activePath = useRepoStore((s) => s.activePath);
  const repoPath = useRepoStore((s) =>
    s.activePath ? s.repos[s.activePath]?.path : null,
  );
  // The repo view mounts thousands of nodes. It renders in an interruptible pass after the first
  // frame, and a tab switch keeps the old panel up until the new one is ready (the tab rail itself
  // updates at once), so neither blocks frames.
  const ready = useDeferredValue(true, false);
  const sidebarTab = useDeferredValue(useUiStore((s) => s.sidebarTab));
  const mergeEditorPath = useUiStore((s) => s.mergeEditorPath);
  const closeMergeEditor = useUiStore((s) => s.closeMergeEditor);
  const blameEditorPath = useUiStore((s) => s.blameEditorPath);
  const blameEditorFile = useUiStore((s) => s.blameEditorFile);
  const closeBlameEditor = useUiStore((s) => s.closeBlameEditor);

  useStackRestackWatcher(activePath ?? "");

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      {mergeEditorPath && (
        <Suspense fallback={<PanelLoading />}>
          <MergeConflictPage
            path={mergeEditorPath}
            onClose={closeMergeEditor}
          />
        </Suspense>
      )}
      {blameEditorPath && (
        <Suspense fallback={<PanelLoading />}>
          <GitBlamePage
            path={blameEditorPath}
            initialFile={blameEditorFile}
            onClose={closeBlameEditor}
          />
        </Suspense>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activePath && ready && <RepoSidebar />}
        <div
          className={`min-w-0 flex-1  pb-3 ${activePath ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          {!ready ? null : activePath && repoPath ? (
            <RepoTabLayout path={repoPath}>
              <PanelSwap
                panelKey={`${activePath}::${sidebarTab}`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {sidebarTab === "commit" ? (
                  <CommitPanel />
                ) : (
                  <Suspense fallback={<PanelLoading />}>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {sidebarTab === "stash" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <StashPanel path={repoPath} />
                      </div>
                    ) : sidebarTab === "pr" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <PullRequestPanel path={repoPath} />
                      </div>
                    ) : sidebarTab === "submodules" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <SubmodulesPanel path={repoPath} />
                      </div>
                    ) : sidebarTab === "worktrees" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <WorktreePanel path={repoPath} />
                      </div>
                    ) : sidebarTab === "hooks" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <GitHooksPanel path={repoPath} />
                      </div>
                    ) : sidebarTab === "ci" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <RepoCiPanel path={repoPath} />
                      </div>
                    ) : sidebarTab === "tools" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <ToolsPanel path={repoPath} />
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
          {!activePath && <EmptyState />}
        </div>
      </div>
      <OnboardingTour />
    </main>
  );
}
