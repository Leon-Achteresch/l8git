import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { GitBranch } from "lucide-react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center gap-6 border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <GitBranch className="h-5 w-5" />
          gitit
        </div>
        <div className="flex gap-4 text-sm">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            Repository
          </Link>
          <Link
            to="/about"
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            About
          </Link>
          <Link
            to="/settings"
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            Einstellungen
          </Link>
        </div>
      </nav>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  );
}
