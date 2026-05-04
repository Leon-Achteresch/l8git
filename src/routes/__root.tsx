import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "sonner";

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
        <TanStackRouterDevtools position="bottom-right" />
      </div>
    </MotionProvider>
  );
}
