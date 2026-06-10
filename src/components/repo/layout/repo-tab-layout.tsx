import { lazy, Suspense, useEffect } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTerminalStore } from "@/lib/terminal-store";

// xterm + WebGL addon only load once the terminal panel is actually opened.
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
  const setPanelHeight = useTerminalStore((s) => s.setPanelHeight);
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

  const totalHeightHint =
    typeof window !== "undefined" ? window.innerHeight || 800 : 800;
  const terminalPct = Math.max(
    10,
    Math.min(70, Math.round((panelHeight / totalHeightHint) * 100)),
  );

  if (!terminalVisible) {
    return <>{children}</>;
  }

  return (
    <ResizablePanelGroup
      orientation="vertical"
      id="repo-tab-vertical"
      className="h-full w-full"
      defaultLayout={{
        "tab-content-area": 100 - terminalPct,
        "tab-terminal-area": terminalPct,
      }}
      onLayoutChanged={(layout) => {
        const pct = layout["tab-terminal-area"];
        if (typeof pct !== "number") return;
        const next = Math.round((pct / 100) * totalHeightHint);
        if (Math.abs(next - panelHeight) > 4) {
          setPanelHeight(next);
        }
      }}
    >
      <ResizablePanel
        id="tab-content-area"
        defaultSize={`${100 - terminalPct}%`}
        minSize="20%"
        className="min-h-0"
      >
        {children}
      </ResizablePanel>
      <ResizableHandle
        withHandle
        className="bg-border/50 transition-colors hover:bg-primary/20"
      />
      <ResizablePanel
        id="tab-terminal-area"
        defaultSize={`${terminalPct}%`}
        minSize="10%"
        maxSize="70%"
        className="min-h-0"
      >
        <Suspense fallback={null}>
          <RepoTerminalPanel path={path} />
        </Suspense>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
