import { lazy, Suspense, useEffect } from "react";
import { m } from "motion/react";

import { SPRING_LAYOUT, SPRING_PANEL } from "@/@lib/ease";
import { AgentDock } from "@/components/repo/agent-dock";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTerminalStore } from "@/lib/terminal-store";
import { cn } from "@/lib/utils";

const RepoTerminalPanel = lazy(() =>
  import("@/components/repo/remote/repo-terminal-panel").then((m) => ({
    default: m.RepoTerminalPanel,
  })),
);

interface Props {
  path: string;
  children: React.ReactNode;
}

export function RepoTabLayout({ path, children }: Props) {
  const terminalVisible = useTerminalStore((s) => !!s.visibleByPath[path]);
  const panelHeight = useTerminalStore((s) => s.panelHeight);
  const panelWidth = useTerminalStore((s) => s.panelWidth);
  const position = useTerminalStore((s) => s.position);
  const setPanelHeight = useTerminalStore((s) => s.setPanelHeight);
  const setPanelWidth = useTerminalStore((s) => s.setPanelWidth);
  const toggleVisible = useTerminalStore((s) => s.toggleVisible);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === "`") {
        e.preventDefault();
        toggleVisible(path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, toggleVisible]);

  const atRight = position === "right";
  const totalHint =
    typeof window === "undefined"
      ? atRight
        ? 1200
        : 800
      : (atRight ? window.innerWidth : window.innerHeight) ||
        (atRight ? 1200 : 800);
  const terminalSize = atRight ? panelWidth : panelHeight;
  const terminalPct = Math.max(
    10,
    Math.min(70, Math.round((terminalSize / totalHint) * 100)),
  );

  if (!terminalVisible) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
        <AgentDock path={path} />
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation={atRight ? "horizontal" : "vertical"}
      id={atRight ? "repo-tab-horizontal" : "repo-tab-vertical"}
      className="h-full w-full"
      defaultLayout={{
        "tab-content-area": 100 - terminalPct,
        "tab-terminal-area": terminalPct,
      }}
      onLayoutChanged={(layout) => {
        const pct = layout["tab-terminal-area"];
        if (typeof pct !== "number") return;
        const next = Math.round((pct / 100) * totalHint);
        if (Math.abs(next - terminalSize) > 4) {
          if (atRight) setPanelWidth(next);
          else setPanelHeight(next);
        }
      }}
    >
      <ResizablePanel
        id="tab-content-area"
        defaultSize={`${100 - terminalPct}%`}
        minSize="20%"
        className="relative flex min-h-0 flex-col overflow-hidden"
      >
        {children}
        <AgentDock path={path} />
      </ResizablePanel>
      <ResizableHandle
        withHandle
        className="z-20 bg-transparent transition-colors duration-200 hover:bg-primary/15"
      />
      <ResizablePanel
        id="tab-terminal-area"
        defaultSize={`${terminalPct}%`}
        minSize="10%"
        maxSize="70%"
        className={cn(
          "min-h-0",
          atRight ? "py-2 pr-2 pl-1" : "px-2 pb-2 pt-1",
        )}
      >
        <m.div
          layout
          initial={{ opacity: 0.82, y: atRight ? 0 : 8, x: atRight ? 8 : 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={SPRING_PANEL}
          className={cn(
            "terminal-well flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 shadow-md",
            "bg-card/80 backdrop-blur-sm dark:bg-card/60",
          )}
        >
          <m.div layout transition={SPRING_LAYOUT} className="min-h-0 flex-1">
            <Suspense fallback={null}>
              <RepoTerminalPanel path={path} />
            </Suspense>
          </m.div>
        </m.div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
