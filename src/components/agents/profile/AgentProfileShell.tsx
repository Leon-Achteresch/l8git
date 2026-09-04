import { Blocks, LayoutGrid, MessagesSquare, Puzzle, UserRound } from "lucide-react";
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
  { id: "chat", label: "Chat", Icon: MessagesSquare },
  { id: "threads", label: "Threads", Icon: LayoutGrid },
  { id: "capabilities", label: "Capabilities", Icon: Blocks },
  { id: "addons", label: "Addons", Icon: Puzzle },
  { id: "profile", label: "Profile", Icon: UserRound },
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

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background" data-testid="agent-profile-shell">
      <header className="flex h-11 shrink-0 items-center justify-between border-b bg-card/90 px-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open navigation" className="md:hidden">
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
              <nav aria-label="Agent sections" className="flex flex-col gap-1 p-3">
                {NAV.map(({ id, label, Icon }) => {
                  const active = section === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onSectionChange(id);
                        setDrawerOpen(false);
                      }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1 text-left">{label}</span>
                      {id === "chat" && runningCount > 0 ? (
                        <Badge variant="success" className="relative">
                          {runningCount}
                        </Badge>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="mr-2 hidden items-center gap-2 md:flex">
            <Avatar size="sm">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Logo className="size-3.5" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold leading-tight">{name}</p>
              <p className="truncate text-[10px] leading-tight text-muted-foreground">{meta.label}</p>
            </div>
          </div>
        </div>

        <nav aria-label="Agent sections" className="flex items-center gap-1 overflow-x-auto">
          {NAV.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSectionChange(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-150 outline-none",
                  active
                    ? "bg-muted text-foreground shadow-xs ring-1 ring-border/50"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {active ? (
                  <m.span
                    layoutId="agent-profile-nav-pill"
                    transition={springFast}
                    className="absolute inset-0 rounded-lg bg-muted"
                  />
                ) : null}
                <Icon className="relative size-3.5 shrink-0" />
                <span className="relative">{label}</span>
                {id === "chat" && runningCount > 0 ? (
                  <Badge variant="success" className="relative ml-1 h-4 px-1.5 py-0 text-[10px]">
                    {runningCount}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="flex w-8 shrink-0 justify-end md:w-24" />
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
