import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { m } from "motion/react";
import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "sonner";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : null;

const AppUpdateDialog = lazy(() =>
  import("@/components/app/app-update-dialog").then((m) => ({
    default: m.AppUpdateDialog,
  })),
);

import { AppHeader } from "@/components/app/app-header";
import { RouteErrorBoundary } from "@/components/app/route-error-boundary";

// Lazy: the island drags the full motion animation engine (animate/useSpring/
// DynamicIsland) with it — as an overlay it can appear a tick after first paint.
const AppIsland = lazy(() =>
  import("@/components/app/app-island").then((m) => ({
    default: m.AppIsland,
  })),
);
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
import { useIslandHost } from "@/lib/island/host";
import { useIslandWindow } from "@/lib/island/window-store";
import { useRepoStore } from "@/lib/repo-store";
import { resolveTheme } from "@/lib/theme";
import { useAppHotkeys } from "@/lib/use-app-hotkeys";
import { useTheme } from "@/lib/use-theme";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";
import { useUiStore } from "@/lib/ui-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { useState } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useAppHotkeys({ onShowShortcuts: () => setHotkeysOpen(true) });
  const { theme } = useTheme();
  const addRepo = useRepoStore((s) => s.addRepo);
  const uiScale = useWorkspacePrefs((s) => s.uiScale);
  const islandEnabled = useUiVisibilityPrefs((s) => s.showHeaderIsland);
  const hasActiveRepo = useRepoStore((s) => !!s.activePath);
  const islandDetached = useIslandWindow((s) => s.open);
  // While the island floats in its own window the app keeps its normal toaster.
  const islandHandlesToasts = islandEnabled && hasActiveRepo && !islandDetached;

  // Feeds the detached island and executes whatever it asks for.
  useIslandHost();
  const reflogViewPath = useUiStore((s) => s.reflogViewPath);
  const closeReflogView = useUiStore((s) => s.closeReflogView);
  const commandLogOpen = useUiStore((s) => s.commandLogOpen);
  const closeCommandLog = useUiStore((s) => s.closeCommandLog);

  useEffect(() => {
    document.documentElement.style.fontSize = uiScale === 1 ? "" : `${uiScale * 100}%`;
  }, [uiScale]);

  // Accept folder drops anywhere in the window to open a repository.
  useEffect(() => {
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
      <div className="flex h-dvh min-h-0 flex-col bg-sidebar text-foreground">
        <AppHeader />
        <div className="min-h-0 flex-1 overflow-y-auto bg-background">
          <m.div
            key={pathname}
            className="h-full"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={easeOutSoft}
          >
            <RouteErrorBoundary resetKey={pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </m.div>
        </div>
        <Suspense fallback={null}>
          <AppIsland />
        </Suspense>
        {!islandHandlesToasts && (
          <Toaster
            richColors
            closeButton
            position="top-right"
            theme={resolveTheme(theme)}
          />
        )}
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
        {RouterDevtools ? (
          <Suspense fallback={null}>
            <RouterDevtools position="bottom-right" />
          </Suspense>
        ) : null}
      </div>
    </MotionProvider>
  );
}
