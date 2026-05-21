import { createFileRoute } from "@tanstack/react-router";

import { PanelSwap } from "@/components/motion/panel-swap";
import { RepoCiPanel } from "@/components/repo/ci/repo-ci-panel";
import { CommitPanel } from "@/components/repo/commit/commit-panel";
import { RepoDetails } from "@/components/repo/layout/repo-details";
import { RepoTabLayout } from "@/components/repo/layout/repo-tab-layout";
import { EmptyState } from "@/components/repo/layout/empty-state";
import { RepoSidebar } from "@/components/repo/layout/repo-sidebar";
import { MergeConflictPage } from "@/components/repo/merge/merge-conflict-page";
import { GitBlamePage } from "@/components/repo/blame/git-blame-page";
import { PullRequestPanel } from "@/components/repo/pr/pull-request-panel";
import { StashPanel } from "@/components/repo/stash/stash-panel";
import { SubmodulesPanel } from "@/components/repo/submodules/submodules-panel";
import { GitHooksPanel } from "@/components/repo/hooks/git-hooks-panel";
import { WorktreePanel } from "@/components/repo/worktree/worktree-panel";
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
  const mergeEditorPath = useUiStore((s) => s.mergeEditorPath);
  const closeMergeEditor = useUiStore((s) => s.closeMergeEditor);
  const blameEditorPath = useUiStore((s) => s.blameEditorPath);
  const blameEditorFile = useUiStore((s) => s.blameEditorFile);
  const closeBlameEditor = useUiStore((s) => s.closeBlameEditor);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      {mergeEditorPath && (
        <MergeConflictPage path={mergeEditorPath} onClose={closeMergeEditor} />
      )}
      {blameEditorPath && (
        <GitBlamePage
          path={blameEditorPath}
          initialFile={blameEditorFile}
          onClose={closeBlameEditor}
        />
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
