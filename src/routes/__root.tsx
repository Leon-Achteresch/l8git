import { ContextReviewDialog } from "@/components/ai/context-review-dialog";
import { useInboxRefresh } from "@/lib/use-inbox-refresh";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { m } from "motion/react";
import { lazy, Suspense, useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const AppUpdateDialog = lazy(() =>
  import("@/components/app/app-update-dialog").then((m) => ({
    default: m.AppUpdateDialog,
  })),
);

import { AppHeader } from "@/components/app/app-header";
import { RouteErrorBoundary } from "@/components/app/route-error-boundary";
import { Toaster } from "@/components/ui/sonner";

import { HotkeysOverlay } from "@/components/app/hotkeys-overlay";
import { RemoteProgressDock } from "@/components/app/remote-progress-dock";

const ReflogPage = lazy(() =>
  import("@/components/repo/reflog/reflog-page").then((m) => ({
    default: m.ReflogPage,
  })),
);

const GitCommandLogPage = lazy(() =>
  import("@/components/repo/cmdlog/git-command-log-page").then((m) => ({
    default: m.GitCommandLogPage,
  })),
);
import { MotionProvider } from "@/components/motion/motion-provider";
import { easeOutSoft } from "@/components/motion/kit";
import { useRepoStore } from "@/lib/repo-store";
import { useAppHotkeys } from "@/lib/use-app-hotkeys";
import { useUiStore } from "@/lib/ui-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { seedPreviewRepo } from "@/lib/preview-repo";
import { useState } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useInboxRefresh();
  useEffect(() => {
    if (!import.meta.env.DEV || isTauri()) return;
    const seed = () => seedPreviewRepo();
    if (useRepoStore.persist.hasHydrated()) {
      seed();
      return;
    }
    return useRepoStore.persist.onFinishHydration(seed);
  }, []);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useAppHotkeys({ onShowShortcuts: () => setHotkeysOpen(true) });
  const addRepo = useRepoStore((s) => s.addRepo);
  const uiDensity = useWorkspacePrefs((s) => s.uiDensity);
  const uiScale = useWorkspacePrefs((s) => s.uiScale);
  const reflogViewPath = useUiStore((s) => s.reflogViewPath);
  const closeReflogView = useUiStore((s) => s.closeReflogView);
  const commandLogOpen = useUiStore((s) => s.commandLogOpen);
  const closeCommandLog = useUiStore((s) => s.closeCommandLog);

  useEffect(() => {
    document.documentElement.dataset.density = uiDensity;
    document.documentElement.style.fontSize = uiScale === 1 ? "" : `${uiScale * 100}%`;
  }, [uiScale, uiDensity]);

  // Accept folder drops anywhere in the window to open a repository.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const paths: string[] = (event.payload as { paths?: string[] }).paths ?? [];
        for (const p of paths) {
          void addRepo(p);
        }
      })
      .then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, [addRepo]);
  return (
    <MotionProvider>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-sidebar text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:left-1 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <AppHeader />
        <ContextReviewDialog />
        <main
          id="main-content"
          className={`min-h-0 flex-1 bg-background ${pathname === "/settings" ? "overflow-hidden" : "overflow-y-auto"}`}
          tabIndex={-1}
        >
          <m.div
            key={pathname}
            className={pathname === "/settings" ? "h-full min-h-0 overflow-hidden" : "h-full"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={easeOutSoft}
          >
            <RouteErrorBoundary resetKey={pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </m.div>
        </main>
        <Toaster />
        {reflogViewPath && (
          <Suspense fallback={null}>
            <ReflogPage path={reflogViewPath} onClose={closeReflogView} />
          </Suspense>
        )}
        {commandLogOpen && (
          <Suspense fallback={null}>
            <GitCommandLogPage onClose={closeCommandLog} />
          </Suspense>
        )}
        <RemoteProgressDock />
        <HotkeysOverlay open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
        <Suspense fallback={null}>
          <AppUpdateDialog />
        </Suspense>
      </div>
    </MotionProvider>
  );
}
