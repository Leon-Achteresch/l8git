import { Blocks, LayoutGrid, MessagesSquare, Puzzle, Search, UserRound } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { springFast } from "@/components/motion/kit";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { cn } from "@/lib/utils";

export type ProfileSection = "profile" | "chat" | "threads" | "capabilities" | "addons";

const NAV: Array<{ id: ProfileSection; label: string; Icon: typeof LayoutGrid }> = [
  { id: "profile", label: "Profile", Icon: UserRound },
  { id: "chat", label: "Chat", Icon: MessagesSquare },
  { id: "threads", label: "Threads", Icon: LayoutGrid },
  { id: "capabilities", label: "Capabilities", Icon: Blocks },
  { id: "addons", label: "Addons", Icon: Puzzle },
];

function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function AgentProfileShell({
  path,
  provider,
  section,
  onSectionChange,
  runningCount,
  children,
}: {
  path: string;
  provider: NativeAgentProvider;
  section: ProfileSection;
  onSectionChange: (next: ProfileSection) => void;
  runningCount: number;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const meta = agentProviderMeta(provider);
  const Logo = meta.Logo;
  const name = repoName(path);

  const navList = (onNavigate?: () => void) => (
    <nav aria-label="Agent sections" className="flex flex-col gap-1 p-3">
      {NAV.map(({ id, label, Icon }) => {
        const active = section === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              onSectionChange(id);
              onNavigate?.();
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {active ? (
              <m.span
                layoutId="agent-profile-nav-pill"
                transition={springFast}
                className="absolute inset-0 rounded-xl bg-muted"
              />
            ) : null}
            <Icon className="relative size-4 shrink-0" />
            <span className="relative flex-1 text-left">{label}</span>
            {id === "chat" && runningCount > 0 ? (
              <Badge variant="success" className="relative">
                {runningCount}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background" data-testid="agent-profile-shell">
      {/* Desktop sidebar — BoardUI app-shell style */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
          <Avatar size="sm">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <Logo className="size-3.5" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{meta.label}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{navList()}</div>
        <div className="border-t p-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
            <Search className="size-3.5 shrink-0" />
            <span className="truncate">⌘K to search threads</span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Mobile top bar + slide-in drawer */}
        <header className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2 md:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
                <Avatar size="sm">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Logo className="size-3.5" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="border-b px-4 py-3.5">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{meta.label}</p>
              </div>
              {navList(() => setDrawerOpen(false))}
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSectionChange(id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  section === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
