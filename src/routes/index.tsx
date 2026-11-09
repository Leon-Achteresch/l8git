import { PanelLoading } from "@/components/ui/panel-loading";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useDeferredValue, useEffect } from "react";
import { scheduleStartupServices } from "@/lib/startup-services";

import { loadablePanel } from "@/components/ui/loadable-panel";
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

const commitPanel = loadablePanel(() => import("@/components/repo/commit/commit-panel").then(m => m.CommitPanel), <PanelLoading />, scheduleStartupServices);
const historyPanel = loadablePanel(() => import("@/components/repo/layout/repo-details").then(m => m.RepoDetails), <PanelLoading />, scheduleStartupServices);
const CommitPanel = commitPanel.Component;
const RepoDetails = historyPanel.Component;

// Hydration is synchronous on desktop. Fetch the saved panel in parallel with
// the first render and open_repo, not after the repository read completes.
if (useRepoStore.getState().activePath) {
  const tab = useUiStore.getState().sidebarTab;
  if (tab === "commit") void commitPanel.preload().catch(() => {});
  else if (tab === "history") void historyPanel.preload().catch(() => {});
}

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
  useEffect(() => {
    // These services belong to the app lifetime, including a quick jump to
    // another route before the first idle callback. Do not cancel on navigation.
    if (!activePath) scheduleStartupServices();
  }, [activePath]);
  const tabNow = useUiStore((s) => s.sidebarTab);
  // Repo and tab are deferred together: switching both at once mounts one panel, not two.
  // "\0" can't occur in a path.
  const shown = useDeferredValue(`${repoPath ?? ""}\0${tabNow}`);
  const [deferredPath, shownTab] = shown.split("\0");
  // Opening the first repo: the deferred path is still empty, so the panel takes the live one.
  const shownPath = deferredPath || repoPath || "";
  const sidebarTab = shownTab as typeof tabNow;
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
        {activePath && <RepoSidebar />}
        <div
          className={`min-w-0 flex-1  pb-3 ${activePath ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          {activePath && repoPath ? (
            <RepoTabLayout path={repoPath}>
              <div
                // The commit and history panels read the live repo themselves, so they remount with it right away.
                // Keyed on the deferred path, they'd show the new repo with the old repo's selection and dialogs;
                // a repo and tab switch together costs one throwaway mount instead.
                key={sidebarTab === "commit" || sidebarTab === "history" ? `${repoPath}\0${sidebarTab}` : `${shownPath}\0${sidebarTab}`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {sidebarTab === "commit" ? (
                  <CommitPanel />
                ) : (
                  <Suspense fallback={<PanelLoading />}>
                  {/* Until the deferred switch commits, the old repo's panel stays visible but takes no input.
                      RepoDetails (the fallback) reads the live repo itself, so it stays usable. */}
                  <div
                    inert={shownPath !== repoPath && sidebarTab !== "history"}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {sidebarTab === "stash" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <StashPanel path={shownPath} />
                      </div>
                    ) : sidebarTab === "pr" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <PullRequestPanel path={shownPath} />
                      </div>
                    ) : sidebarTab === "submodules" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <SubmodulesPanel path={shownPath} />
                      </div>
                    ) : sidebarTab === "worktrees" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <WorktreePanel path={shownPath} />
                      </div>
                    ) : sidebarTab === "hooks" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <GitHooksPanel path={shownPath} />
                      </div>
                    ) : sidebarTab === "ci" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <RepoCiPanel path={shownPath} />
                      </div>
                    ) : sidebarTab === "tools" ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <ToolsPanel path={shownPath} />
                      </div>
                    ) : (
                      <RepoDetails />
                    )}
                  </div>
                  {sidebarTab !== "history" && <StartupServicesReady />}
                  </Suspense>
                )}
              </div>
            </RepoTabLayout>
          ) : (
            activePath ? <PanelLoading /> : null
          )}
          {!activePath && <EmptyState />}
        </div>
      </div>
      <OnboardingTour />
    </main>
  );
}

/** The surrounding Suspense boundary reveals this only with its selected panel. */
function StartupServicesReady() {
  useEffect(() => { scheduleStartupServices(); }, []);
  return null;
}
