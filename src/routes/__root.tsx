import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "sonner";

import { MotionProvider } from "@/components/motion/motion-provider";
import { useAppHotkeys } from "@/lib/use-app-hotkeys";
import { resolveTheme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useAppHotkeys();
  const { theme } = useTheme();
  return (
    <MotionProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Outlet />
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
