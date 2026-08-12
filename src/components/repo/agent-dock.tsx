import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, SquareTerminal } from "lucide-react";
import { m } from "motion/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { MagicPill } from "@/components/motion/magic-pill";
import {
  AGENT_INTEGRATIONS,
  detectInstalledAgents,
  integrationOf,
  launchAgent,
  useInstalledAgents,
} from "@/lib/agent-integrations";
import { useRepoStore } from "@/lib/repo-store";
import { repoDefaultTabTitle } from "@/lib/terminal-tab-title";
import { useTerminalStore, type TerminalTab } from "@/lib/terminal-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";
import { cn } from "@/lib/utils";

const EMPTY_TABS: TerminalTab[] = [];

export function AgentDock({ path }: { path: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const enabled = useUiVisibilityPrefs((s) => s.showAgentDock);
  const tabs = useTerminalStore((s) => s.tabsByPath[path] ?? EMPTY_TABS);
  const activeId = useTerminalStore((s) => s.activeByPath[path] ?? null);
  const visible = useTerminalStore((s) => !!s.visibleByPath[path]);
  const setVisible = useTerminalStore((s) => s.setVisible);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const openTab = useTerminalStore((s) => s.openTab);
  const branch = useRepoStore((s) => s.repos[path]?.branch ?? "");
  const installed = useInstalledAgents((s) => s.installed);

  useEffect(() => {
    detectInstalledAgents();
  }, []);

  const focused = visible
    ? (tabs.find((tab) => tab.id === activeId) ?? tabs[0])
    : undefined;
  const focusedId = focused ? (integrationOf(focused)?.id ?? "shell") : null;
  const shellTab = tabs.find((tab) => !integrationOf(tab));

  if (!enabled) return null;

  const openShell = () => {
    if (shellTab) {
      setActiveTab(path, shellTab.id);
      setVisible(path, true);
      return;
    }
    openTab(path, repoDefaultTabTitle(path, branch));
  };

  return (
    <m.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.6 }}
      className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/60 bg-background/80 p-1 shadow-lg backdrop-blur-md"
    >
      <DockButton
        label={t("dock.shell")}
        active={focusedId === "shell"}
        running={!!shellTab}
        onClick={openShell}
      >
        <SquareTerminal className="size-4" />
      </DockButton>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-border/60" aria-hidden />

      {AGENT_INTEGRATIONS.map((integration) => {
        const running = integration.surface === "terminal" && tabs.some(
          (tab) => integrationOf(tab)?.id === integration.id,
        );
        // Only offer CLIs that exist on this machine (null = detection
        // pending → show all); a running tab keeps its button regardless.
        if (installed && !installed.has(integration.id) && !running) {
          return null;
        }
        return (
          <DockButton
            key={integration.id}
            label={
              integration.surface === "chat"
                ? `${integration.label} Chat`
                : `${integration.label} - ${t("dock.newInstanceHint")}`
            }
            active={focusedId === integration.id}
            running={running}
            onClick={(e) => {
              if (integration.surface === "chat") {
                void navigate({ to: "/agents", search: { path } });
                return;
              }
              launchAgent(path, integration, {
                newInstance: e.shiftKey || e.ctrlKey,
              });
            }}
          >
            <integration.icon className="size-4" />
          </DockButton>
        );
      })}

      {visible && (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-border/60" aria-hidden />
          <DockButton
            label={t("dock.hide")}
            active={false}
            running={false}
            onClick={() => setVisible(path, false)}
          >
            <ChevronDown className="size-4" />
          </DockButton>
        </>
      )}
    </m.div>
  );
}

function DockButton({
  label,
  active,
  running,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  running: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="subtle"
      size="icon"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn("relative rounded-full", active && "text-foreground")}
    >
      {active && (
        <MagicPill
          layoutId="agent-dock-active"
          className="absolute inset-0 rounded-full bg-foreground/10"
        />
      )}
      <span className="relative">{children}</span>
      {running && (
        <span
          className={cn(
            "absolute bottom-0.5 size-1 rounded-full",
            active ? "bg-git-added" : "bg-git-added/60",
          )}
          aria-hidden
        />
      )}
    </Button>
  );
}
