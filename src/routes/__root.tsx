import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "sonner";

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
import { MotionProvider } from "@/components/motion/motion-provider";
import { resolveTheme } from "@/lib/theme";
import { useAppHotkeys } from "@/lib/use-app-hotkeys";
import { useTheme } from "@/lib/use-theme";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useAppHotkeys();
  const { theme } = useTheme();
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
