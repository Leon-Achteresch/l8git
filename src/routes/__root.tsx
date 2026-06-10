import { createRootRoute, Outlet } from "@tanstack/react-router";
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

// Loads off the critical path together with the updater plugin code.
const AppUpdateToast = lazy(() =>
  import("@/components/app/app-update-toast").then((m) => ({
    default: m.AppUpdateToast,
  })),
);

import { AppHeader } from "@/components/app/app-header";
import { HotkeysOverlay } from "@/components/app/hotkeys-overlay";
import { MotionProvider } from "@/components/motion/motion-provider";
import { useRepoStore } from "@/lib/repo-store";
import { resolveTheme } from "@/lib/theme";
import { useAppHotkeys } from "@/lib/use-app-hotkeys";
import { useTheme } from "@/lib/use-theme";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { useState } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  useAppHotkeys({ onShowShortcuts: () => setHotkeysOpen(true) });
  const { theme } = useTheme();
  const addRepo = useRepoStore((s) => s.addRepo);
  const uiScale = useWorkspacePrefs((s) => s.uiScale);

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
      <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
        <AppHeader />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
        <Toaster
          richColors
          closeButton
          position="top-right"
          theme={resolveTheme(theme)}
        />
        <HotkeysOverlay open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
        <Suspense fallback={null}>
          <AppUpdateToast />
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
