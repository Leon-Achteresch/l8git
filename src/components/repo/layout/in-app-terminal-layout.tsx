import { lazy, Suspense, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { m } from "motion/react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useTranslation } from "react-i18next";

import { SPRING_LAYOUT, SPRING_PANEL } from "@/lib/motion/ease";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useHotkeyBindings } from "@/lib/hotkey-prefs";
import { useTerminalStore } from "@/lib/terminal-store";
import { cn } from "@/lib/utils";
import { SpinIcon } from "@/components/motion/kit";

const RepoTerminalPanel = lazy(() =>
  import("@/components/repo/remote/repo-terminal-panel").then((module) => ({
    default: module.RepoTerminalPanel,
  })),
);

export function InAppTerminalLayout({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const terminalVisible = useTerminalStore((state) => !!state.visibleByPath[path]);
  const panelHeight = useTerminalStore((state) => state.panelHeight);
  const panelWidth = useTerminalStore((state) => state.panelWidth);
  const position = useTerminalStore((state) => state.position);
  const setPanelHeight = useTerminalStore((state) => state.setPanelHeight);
  const setPanelWidth = useTerminalStore((state) => state.setPanelWidth);
  const toggleVisible = useTerminalStore((state) => state.toggleVisible);
  const bindings = useHotkeyBindings();

  useHotkeys([
    {
      hotkey: bindings.terminalToggle,
      callback: () => toggleVisible(path),
      options: {
        enabled: !!path,
        ignoreInputs: false,
        meta: { name: t("hotkeys.terminalToggle") },
      },
    },
  ], { preventDefault: true });

  const atRight = position === "right";
  const totalHint = typeof window === "undefined"
    ? atRight ? 1200 : 800
    : (atRight ? window.innerWidth : window.innerHeight) || (atRight ? 1200 : 800);
  const terminalSize = atRight ? panelWidth : panelHeight;
  const terminalPct = Math.max(
    10,
    Math.min(70, Math.round((terminalSize / totalHint) * 100)),
  );

  return (
    <ResizablePanelGroup
      orientation={atRight ? "horizontal" : "vertical"}
      className="h-full w-full"
      defaultLayout={terminalVisible
        ? {
            "in-app-content-area": 100 - terminalPct,
            "in-app-terminal-area": terminalPct,
          }
        : { "in-app-content-area": 100 }}
      onLayoutChanged={(layout) => {
        if (!terminalVisible) return;
        const pct = layout["in-app-terminal-area"];
        if (typeof pct !== "number") return;
        const next = Math.round((pct / 100) * totalHint);
        if (Math.abs(next - terminalSize) <= 4) return;
        if (atRight) setPanelWidth(next);
        else setPanelHeight(next);
      }}
    >
      <ResizablePanel
        id="in-app-content-area"
        defaultSize={terminalVisible ? `${100 - terminalPct}%` : "100%"}
        minSize="20%"
        className="relative flex min-h-0 flex-col overflow-hidden"
      >
        {children}
      </ResizablePanel>
      {terminalVisible ? (
        <>
          <ResizableHandle
            withHandle
            className="z-20 bg-transparent transition-colors duration-200 hover:bg-primary/15"
          />
          <ResizablePanel
            id="in-app-terminal-area"
            defaultSize={`${terminalPct}%`}
            minSize="10%"
            maxSize="70%"
            className={cn("min-h-0", atRight ? "py-2 pl-1 pr-2" : "px-2 pb-2 pt-1")}
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
                <Suspense fallback={(
                  <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
                    <SpinIcon icon={LoaderCircle} className="mr-2 size-3.5" />
                    {t("embeddedTerminal.starting")}
                  </div>
                )}>
                  <RepoTerminalPanel path={path} />
                </Suspense>
              </m.div>
            </m.div>
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}
