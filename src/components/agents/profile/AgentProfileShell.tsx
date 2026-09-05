import {
  Blocks,
  ChartNoAxesCombined,
  ChevronRight,
  LayoutGrid,
  MessagesSquare,
  PanelLeft,
  PanelLeftClose,
  Puzzle,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AgentChatSidebar } from "@/components/agents/chat/agent-chat-sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { springFast } from "@/components/motion/kit";
import { agentProviderMeta, providerSupportsCapabilityCenter } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { cn } from "@/lib/utils";

export type ProfileSection = "profile" | "chat" | "threads" | "capabilities" | "addons";

const NAV: Array<{ id: ProfileSection; labelKey: string; Icon: LucideIcon }> = [
  { id: "threads", labelKey: "agentWorkspace.fleet", Icon: LayoutGrid },
  { id: "chat", labelKey: "agentWorkspace.session", Icon: MessagesSquare },
  { id: "profile", labelKey: "agentWorkspace.activity", Icon: ChartNoAxesCombined },
  { id: "capabilities", labelKey: "agentWorkspace.tools", Icon: Blocks },
  { id: "addons", labelKey: "agentWorkspace.addons", Icon: Puzzle },
];

const DEFAULT_SIDEBAR_WIDTH = 264;
const MIN_SIDEBAR_WIDTH = 232;
const MAX_SIDEBAR_WIDTH = 380;
const COLLAPSED_SIDEBAR_WIDTH = 56;
const SIDEBAR_WIDTH_STORAGE_KEY = "l8git.agent.sidebar-width";

function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function SectionNavigation({
  provider,
  section,
  runningCount,
  onSectionChange,
  onClose,
  className,
}: {
  provider: NativeAgentProvider;
  section: ProfileSection;
  runningCount: number;
  onSectionChange: (next: ProfileSection, path?: string) => void;
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const layoutId = useId();
  const reduce = useReducedMotion();

  return (
    <nav aria-label={t("agentWorkspace.sections")} className={cn("flex items-center gap-0.5", className)}>
      {NAV.filter(({ id }) => id !== "capabilities" || providerSupportsCapabilityCenter(provider)).map(({ id, labelKey, Icon }) => {
        const active = section === id;
        const label = t(labelKey);
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              onSectionChange(id);
              onClose?.();
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-[var(--ag-text)]"
                : "text-[var(--ag-text-3)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)]",
            )}
          >
            {active ? (
              <m.span
                layoutId={layoutId}
                transition={reduce ? { duration: 0 } : springFast}
                className="absolute inset-0 rounded-md bg-[var(--ag-selected)]"
              />
            ) : null}
            <Icon className="relative size-3.5 shrink-0" />
            <span className="relative">{label}</span>
            {id === "threads" && runningCount > 0 ? (
              <Badge variant="success" className="relative ml-0.5 h-4 px-1.5 py-0 text-[10px]">
                {runningCount}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function AgentProfileShell({
  path,
  provider,
  section,
  onSectionChange,
  runningCount,
  onOpenOverview,
  onOpenSettings,
  children,
}: {
  path: string;
  provider: NativeAgentProvider;
  section: ProfileSection;
  onSectionChange: (next: ProfileSection, path?: string) => void;
  runningCount: number;
  onOpenOverview?: () => void;
  onOpenSettings?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
    try {
      const saved = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (!saved?.trim()) return DEFAULT_SIDEBAR_WIDTH;
      const stored = Number(saved);
      return Number.isFinite(stored)
        ? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, stored))
        : DEFAULT_SIDEBAR_WIDTH;
    } catch {
      return DEFAULT_SIDEBAR_WIDTH;
    }
  });
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const meta = agentProviderMeta(provider);
  const Logo = meta.Logo;
  const name = repoName(path);
  const hideRail = section === "threads";
  const currentLabel = t(
    NAV.find((entry) => entry.id === section)?.labelKey ?? "agentWorkspace.fleet",
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, drag.startWidth + event.clientX - drag.startX),
      );
      setSidebarWidth(next);
    };
    const handlePointerUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (resizing) return;
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(sidebarWidth)));
    } catch {
      return;
    }
  }, [resizing, sidebarWidth]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") return;
      if (hideRail) return;
      if (event.altKey || event.shiftKey || event.repeat || !window.matchMedia("(min-width: 768px)").matches) return;
      if (event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]")) return;
      event.preventDefault();
      setSidebarOpen((value) => !value);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [hideRail]);

  const renderSidebar = (onClose?: () => void) => (
    <AgentChatSidebar
      selectedPath={path}
      onOpenChat={(nextPath) => {
        onSectionChange("chat", nextPath);
        onClose?.();
      }}
      onOpenOverview={() => {
        (onOpenOverview ?? (() => onSectionChange("threads")))();
        onClose?.();
      }}
      footer={
        onOpenSettings ? (
          <button
            type="button"
            onClick={() => {
              onClose?.();
              onOpenSettings();
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] font-medium text-[var(--ag-text-3)] outline-none transition-colors hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="size-3.5 shrink-0" />
            <span className="truncate">{t("agentWorkspace.settings")}</span>
          </button>
        ) : null
      }
      compactActions
      className="rounded-none shadow-none"
    />
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 overflow-hidden bg-[var(--ag-canvas)] text-[var(--ag-text)]",
        resizing && "select-none",
      )}
      data-testid="agent-profile-shell"
      data-agent-workspace="t3"
      style={{
        ["--agent-sidebar-width" as string]:
          hideRail || !sidebarOpen ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${sidebarWidth}px`,
      }}
    >
      {hideRail ? null : (
        <aside
          className="relative hidden h-full min-h-0 shrink-0 bg-[var(--ag-rail-bg)] md:flex"
          style={{ width: "var(--agent-sidebar-width)" }}
          aria-label={t("agentWorkspace.threadSidebar")}
          data-agent-sidebar=""
        >
          {sidebarOpen ? <div className="min-h-0 min-w-0 flex-1">{renderSidebar()}</div> : null}
          {sidebarOpen ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t("agentWorkspace.resizeSidebar")}
              aria-valuemin={MIN_SIDEBAR_WIDTH}
              aria-valuemax={MAX_SIDEBAR_WIDTH}
              aria-valuenow={Math.round(sidebarWidth)}
              tabIndex={0}
              onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
                setResizing(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  setSidebarWidth(event.key === "Home" ? MIN_SIDEBAR_WIDTH : MAX_SIDEBAR_WIDTH);
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setSidebarWidth((value) => Math.max(MIN_SIDEBAR_WIDTH, value - 16));
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setSidebarWidth((value) => Math.min(MAX_SIDEBAR_WIDTH, value + 16));
                }
              }}
              className="group absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize outline-none md:block"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[var(--git-branch)]/45 group-focus-visible:bg-[var(--git-branch)]" />
            </div>
          ) : null}
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2 border-b border-[var(--ag-line)] bg-[var(--ag-rail-bg)] px-3 sm:px-4">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("agentWorkspace.openNav")}
                className="lg:hidden"
              >
                <PanelLeft className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(88vw,21rem)] p-0" aria-describedby={undefined}>
              <div className="flex h-full min-h-0 flex-col">
                <SheetTitle className="shrink-0 px-4 pt-4 pr-12 text-sm">{t("agentWorkspace.sections")}</SheetTitle>
                <div className="shrink-0 p-2">
                  <SectionNavigation
                    provider={provider}
                    section={section}
                    runningCount={runningCount}
                    onSectionChange={onSectionChange}
                    onClose={() => setDrawerOpen(false)}
                    className="grid grid-cols-2 gap-0.5 [&>button]:w-full [&>button]:justify-start"
                  />
                </div>
                {hideRail ? null : (
                  <div className="min-h-0 flex-1">{renderSidebar(() => setDrawerOpen(false))}</div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {hideRail ? null : (
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label={sidebarOpen ? t("agentWorkspace.collapseSidebar") : t("agentWorkspace.expandSidebar")}
              title={t("agentWorkspace.sidebarShortcut")}
              className="hidden size-8 shrink-0 place-items-center rounded-md text-[var(--ag-text-2)] outline-none transition-colors hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring md:grid"
            >
              {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
            </button>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar size="sm" className="size-5 after:rounded-md">
              <AvatarFallback className="rounded-md bg-[var(--ag-solid)] text-[var(--ag-solid-fg)]">
                <Logo className="size-3" />
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="truncate font-semibold tracking-[-0.02em]">{name}</span>
              <ChevronRight className="size-3 shrink-0 text-[var(--ag-text-3)]" />
              <span className="truncate text-[var(--ag-text-3)]">{currentLabel}</span>
            </div>
          </div>

          <SectionNavigation
            provider={provider}
            section={section}
            runningCount={runningCount}
            onSectionChange={onSectionChange}
            className="hidden shrink-0 lg:flex"
          />

          <div className="flex shrink-0 items-center gap-1">
            <div className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-[var(--ag-text-2)] xl:flex">
              <span>{meta.label}</span>
            </div>
            {runningCount > 0 ? (
              <Badge variant="success" className="hidden h-6 rounded-md px-1.5 text-[10px] sm:inline-flex">
                {runningCount} {t("agentWorkspace.working").toLocaleLowerCase()}
              </Badge>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}
