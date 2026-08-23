import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Info,
  Loader2,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import { animate, m, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast as sonnerToast, useSonner, type ToastT } from "sonner";
import { useShallow } from "zustand/react/shallow";

import {
  DynamicIsland,
  DynamicIslandView,
} from "@/components/motion/dynamic-island";
import { RepoLogo } from "@/components/repo/repo-logo";
import {
  AGENT_INTEGRATIONS,
  agentTabs,
  integrationOf,
  launchAgent,
  type AgentIntegration,
} from "@/lib/agent-integrations";
import {
  defaultIslandPosition,
  dockRectFor,
  ISLAND_HEIGHT,
  ISLAND_WIDTH,
  magnetFor,
  useIslandDocks,
  useIslandStore,
  type IslandDock as IslandDockTarget,
  type IslandPosition,
} from "@/lib/island-store";
import { repoLabel, useRepoStore } from "@/lib/repo-store";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { terminalLeafId } from "@/lib/terminal/leaf-id";
import { useTerminalStore } from "@/lib/terminal-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";
import { cn } from "@/lib/utils";
import { SpinIcon } from "@/components/motion/kit";

const PROJECTS_VIEW = "projects";
const MENU_VIEW = "menu";
const TOAST_VIEW = "toast";
const AGENT_VIEW = "agent";
const EDGE_MARGIN = 8;
const DEFAULT_TOAST_MS = 4000;
const SNAP = { type: "spring", stiffness: 620, damping: 30, mass: 0.6 } as const;
const MAGNET = { stiffness: 700, damping: 26, mass: 0.4 } as const;
const SETTLE_MS = 320;

const ISLAND_ROW = "text-current hover:bg-background/10 hover:text-current data-[active=true]:bg-background/15 data-[active=true]:text-current";
const ISLAND_ICON = "text-current opacity-60 hover:bg-background/10 hover:text-current hover:opacity-100";

type BusyAgent = { integration: AgentIntegration; title: string };

export function AppIsland() {
  const { t } = useTranslation();
  const [view, setView] = useState<string | null>(null);
  const [menuPage, setMenuPage] = useState<"root" | "integrations">("root");
  const boundsRef = useRef<HTMLDivElement | null>(null);
  const islandRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const justDraggedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const idle = () => !draggingRef.current && !justDraggedRef.current;

  const enabled = useUiVisibilityPrefs((s) => s.showHeaderIsland);

  const { paths, activePath, repos, status } = useRepoStore(
    useShallow((s) => ({
      paths: s.paths,
      activePath: s.activePath,
      repos: s.repos,
      status: s.status,
    })),
  );
  const setActive = useRepoStore((s) => s.setActive);
  const tabsByPath = useTerminalStore((s) => s.tabsByPath);
  const busyLeaves = useTerminalActivity((s) => s.busy);

  const { position, dock, hovered, showBranch, showDirty, showAgents } =
    useIslandStore(
      useShallow((s) => ({
        position: s.position,
        dock: s.dock,
        hovered: s.hovered,
        showBranch: s.showBranch,
        showDirty: s.showDirty,
        showAgents: s.showAgents,
      })),
    );
  const setPosition = useIslandStore((s) => s.setPosition);
  const setDock = useIslandStore((s) => s.setDock);
  const setDragging = useIslandStore((s) => s.setDragging);
  const setHovered = useIslandStore((s) => s.setHovered);
  const resetPosition = useIslandStore((s) => s.resetPosition);
  const dockVersion = useIslandDocks((s) => s.version);
  const toggleBranch = useIslandStore((s) => s.toggleBranch);
  const toggleDirty = useIslandStore((s) => s.toggleDirty);
  const toggleAgents = useIslandStore((s) => s.toggleAgents);

  const [start] = useState(() => position ?? defaultIslandPosition());
  const x = useMotionValue(start.x);
  const y = useMotionValue(start.y);
  const magnetX = useSpring(0, MAGNET);
  const magnetY = useSpring(0, MAGNET);

  const toast = useIslandToast(enabled);

  const compactRef = useRef(true);
  const setSize = useIslandDocks((s) => s.setSize);
  useEffect(() => {
    const el = islandRef.current;
    if (!el) return;
    let settle = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (!compactRef.current) return;
        setSize({ width: el.offsetWidth, height: el.offsetHeight });
      }, SETTLE_MS);
    });
    observer.observe(el);
    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, [setSize, enabled, activePath]);

  useEffect(() => {
    if (draggingRef.current) return;
    const target = islandTarget(dock, position);
    if (x.get() !== target.x) void animate(x, target.x, SNAP);
    if (y.get() !== target.y) void animate(y, target.y, SNAP);
  }, [dock, position, dockVersion, x, y]);

  useEffect(() => {
    if (dock !== "free") return;
    const clamp = () => {
      const { width, height } = islandSize(islandRef.current);
      const minX = EDGE_MARGIN + width / 2;
      const minY = height / 2;
      const maxX = Math.max(minX, window.innerWidth - EDGE_MARGIN - width / 2);
      const maxY = Math.max(minY, window.innerHeight - EDGE_MARGIN - height / 2);
      const nextX = Math.min(Math.max(minX, x.get()), maxX);
      const nextY = Math.min(Math.max(minY, y.get()), maxY);
      if (nextX !== x.get() || nextY !== y.get()) {
        x.set(nextX);
        y.set(nextY);
        setPosition({ x: nextX, y: nextY });
      }
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [dock, x, y, setPosition]);

  useEffect(() => {
    if (view === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  if (!enabled || !activePath) return null;

  const busyFor = (path: string): BusyAgent[] =>
    agentTabs(tabsByPath[path] ?? [])
      .filter((tab) => busyLeaves[terminalLeafId(path, tab.id)])
      .map((tab) => ({ integration: integrationOf(tab)!, title: tab.title }));

  const runningIds = (path: string) =>
    new Set(
      agentTabs(tabsByPath[path] ?? []).map((tab) => integrationOf(tab)!.id),
    );

  const activeRunning = runningIds(activePath);
  const activeBusy = busyFor(activePath);
  const activeDirty = status[activePath]?.length ?? 0;
  const activeLabel = repoLabel(activePath);

  const primaryBusy = activeBusy[0];
  const PrimaryBusyIcon = primaryBusy?.integration.icon;

  const resolved =
    view ??
    (toast ? TOAST_VIEW : showAgents && activeBusy.length > 0 ? AGENT_VIEW : null);

  compactRef.current = resolved === null;

  return (
    <>
      {view !== null && (
        <div
          className="fixed inset-0 z-[60]"
          aria-hidden
          onClick={() => setView(null)}
        />
      )}
      <div ref={boundsRef} className="pointer-events-none fixed inset-0 z-[70]">
        <m.div
          ref={islandRef}
          drag
          dragConstraints={boundsRef}
          dragElastic={0.04}
          dragMomentum={false}
          onDragStart={() => {
            draggingRef.current = true;
            setIsDragging(true);
            setDragging(true);
            setView(null);
          }}
          onDrag={() => {
            const hit = magnetFor(x.get(), y.get());
            setHovered(hit?.id ?? null);
            const grip = hit ? hit.pull * hit.pull : 0;
            magnetX.set(hit ? (hit.x - x.get()) * grip : 0);
            magnetY.set(hit ? (hit.y - y.get()) * grip : 0);
          }}
          onDragEnd={() => {
            const hit = magnetFor(x.get(), y.get());
            x.jump(x.get() + magnetX.get());
            y.jump(y.get() + magnetY.get());
            magnetX.jump(0);
            magnetY.jump(0);
            setHovered(null);
            setIsDragging(false);
            setDragging(false);
            draggingRef.current = false;
            justDraggedRef.current = true;
            if (hit) {
              setDock(hit.id);
              void animate(x, hit.x, SNAP);
              void animate(y, hit.y, SNAP);
            } else {
              setDock("free");
              setPosition({ x: Math.round(x.get()), y: Math.round(y.get()) });
            }
            window.setTimeout(() => {
              justDraggedRef.current = false;
            }, 0);
          }}
          animate={{ scale: hovered ? 0.94 : isDragging ? 1.08 : 1 }}
          transition={SNAP}
          style={{ x, y }}
          className="pointer-events-auto absolute left-0 top-0 cursor-grab [-webkit-app-region:no-drag] [translate:-50%_-18.5px] active:cursor-grabbing"
        >
          <m.div
            style={{ x: magnetX, y: magnetY }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!idle()) return;
              setMenuPage("root");
              setView(MENU_VIEW);
            }}
          >
              <DynamicIsland
                view={resolved}
                compact={
                  <ListRow
                    onClick={() => {
                      if (!idle()) return;
                      setView(PROJECTS_VIEW);
                    }}
                    aria-label={t("island.open")}
                    className={cn(ISLAND_ROW, "min-w-[110px] max-w-[220px] px-0")}
                  >
                    <RepoLogo
                      path={activePath}
                      label={activeLabel}
                      className="size-4 text-[8px]"
                    />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {activeLabel}
                    </span>
                    {showDirty && activeDirty > 0 && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-git-modified"
                        title={t("island.dirty", { count: activeDirty })}
                      />
                    )}
                    {showAgents && activeRunning.size > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        {AGENT_INTEGRATIONS.filter((i) =>
                          activeRunning.has(i.id),
                        ).map((i) => (
                          <i.icon key={i.id} className="size-3" />
                        ))}
                      </span>
                    )}
                  </ListRow>
                }
              >
                <DynamicIslandView id={AGENT_VIEW} className="!px-3 !py-2">
                  <ListRow
                    onClick={() => {
                      if (!idle()) return;
                      setView(PROJECTS_VIEW);
                    }}
                    className={cn(ISLAND_ROW, "w-[240px] gap-2.5 px-0")}
                  >
                    {PrimaryBusyIcon && (
                      <PrimaryBusyIcon className="size-4 shrink-0" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="truncate text-xs font-medium">
                        {primaryBusy?.integration.label}
                      </span>
                      <span className="truncate text-[10px] opacity-55">
                        {t("island.working", { repo: activeLabel })}
                      </span>
                    </span>
                    <ActivityBars />
                  </ListRow>
                </DynamicIslandView>

                <DynamicIslandView id={TOAST_VIEW} className="!px-3 !py-2">
                  <div className="flex w-[280px] items-center gap-2.5">
                    <ToastIcon type={toast?.type} />
                    <span className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="truncate text-xs font-medium">
                        {renderToastNode(toast?.title) ?? ""}
                      </span>
                      {toast?.description ? (
                        <span className="truncate text-[10px] opacity-55">
                          {renderToastNode(toast.description)}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        toast && sonnerToast.dismiss(toast.id)
                      }
                      aria-label={t("island.close")}
                      className={ISLAND_ICON}
                    >
                      <X />
                    </Button>
                  </div>
                </DynamicIslandView>

                <DynamicIslandView id={PROJECTS_VIEW} className="!px-2 !py-2">
                  <div className="flex w-[300px] flex-col">
                    <div className="flex items-center justify-between px-2 pb-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider opacity-50">
                        {t("island.projects", { count: paths.length })}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setView(null)}
                        aria-label={t("island.close")}
                        className={ISLAND_ICON}
                      >
                        <X />
                      </Button>
                    </div>

                    <div className="max-h-64 min-h-0 overflow-y-auto [scrollbar-width:thin]">
                      {paths.map((path) => {
                        const active = path === activePath;
                        const dirty = status[path]?.length ?? 0;
                        const running = runningIds(path);
                        const busy = busyFor(path);
                        const label = repoLabel(path);
                        return (
                          <ListRow
                            key={path}
                            active={active}
                            onClick={() => {
                              setActive(path);
                              setView(null);
                            }}
                            title={path}
                            className={ISLAND_ROW}
                          >
                            <span
                              className={cn(
                                "h-6 w-0.5 shrink-0 rounded-full",
                                active ? "bg-git-added" : "bg-transparent",
                              )}
                            />
                            <RepoLogo path={path} label={label} />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs font-medium">
                                {label}
                              </span>
                              {showBranch && (
                                <span className="flex items-center gap-1 text-[10px] opacity-55">
                                  <GitBranch className="size-2.5 shrink-0" />
                                  <span className="truncate">
                                    {repos[path]?.branch || "—"}
                                  </span>
                                </span>
                              )}
                            </span>
                            {showDirty && dirty > 0 && (
                              <span className="shrink-0 rounded-full bg-git-modified/20 px-1.5 py-0.5 text-[10px] font-medium text-git-modified">
                                {dirty}
                              </span>
                            )}
                            {showAgents &&
                              AGENT_INTEGRATIONS.filter((i) =>
                                running.has(i.id),
                              ).map((i) => (
                                <span
                                  key={i.id}
                                  className="flex shrink-0 items-center"
                                >
                                  <i.icon className="size-3" />
                                </span>
                              ))}
                            {showAgents && busy.length > 0 && (
                              <ActivityBars className="h-2.5" />
                            )}
                          </ListRow>
                        );
                      })}
                    </div>

                    <div className="mt-1.5 flex items-center gap-1 border-t border-background/10 px-1 pt-1.5">
                      {AGENT_INTEGRATIONS.map((i) => {
                        const running = activeRunning.has(i.id);
                        const busy = activeBusy.some(
                          (b) => b.integration.id === i.id,
                        );
                        return (
                          <ListRow
                            key={i.id}
                            size="sm"
                            active={running}
                            onClick={() => {
                              launchAgent(activePath, i);
                              setView(null);
                            }}
                            className={cn(
                              ISLAND_ROW,
                              "flex-1 justify-center gap-1.5 font-medium",
                              running
                                ? "bg-git-added/20 data-[active=true]:bg-git-added/20"
                                : "opacity-70 hover:opacity-100",
                            )}
                          >
                            <i.icon />
                            <span className="truncate">{i.label}</span>
                            {busy && <ActivityBars className="h-2" />}
                          </ListRow>
                        );
                      })}
                    </div>
                  </div>
                </DynamicIslandView>

                <DynamicIslandView id={MENU_VIEW} className="!px-2 !py-2">
                  <div className="flex w-[260px] flex-col">
                    {menuPage === "root" ? (
                      <>
                        <div className="flex items-center justify-between px-2 pb-1.5">
                          <span className="truncate text-xs font-medium">
                            {activeLabel}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setView(null)}
                            aria-label={t("island.close")}
                            className={ISLAND_ICON}
                          >
                            <X />
                          </Button>
                        </div>

                        <ListRow
                          size="sm"
                          onClick={() => setView(PROJECTS_VIEW)}
                          className={ISLAND_ROW}
                        >
                          <FolderGit2 className="opacity-70" />
                          <span className="flex-1 truncate">
                            {t("island.projects", { count: paths.length })}
                          </span>
                        </ListRow>

                        <ListRow
                          size="sm"
                          onClick={() => setMenuPage("integrations")}
                          className={ISLAND_ROW}
                        >
                          <span className="flex-1 truncate">
                            {t("island.integrations")}
                          </span>
                          <ChevronRight className="opacity-50" />
                        </ListRow>

                        <div className="my-1 border-t border-background/10" />

                        <span className="px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider opacity-50">
                          {t("island.display")}
                        </span>

                        <ListRow
                          size="sm"
                          onClick={toggleBranch}
                          className={ISLAND_ROW}
                        >
                          <span className="flex size-3.5 shrink-0 items-center justify-center">
                            {showBranch && <Check className="size-3" />}
                          </span>
                          <span className="flex-1 truncate">
                            {t("island.showBranch")}
                          </span>
                        </ListRow>
                        <ListRow
                          size="sm"
                          onClick={toggleDirty}
                          className={ISLAND_ROW}
                        >
                          <span className="flex size-3.5 shrink-0 items-center justify-center">
                            {showDirty && <Check className="size-3" />}
                          </span>
                          <span className="flex-1 truncate">
                            {t("island.showDirty")}
                          </span>
                        </ListRow>
                        <ListRow
                          size="sm"
                          onClick={toggleAgents}
                          className={ISLAND_ROW}
                        >
                          <span className="flex size-3.5 shrink-0 items-center justify-center">
                            {showAgents && <Check className="size-3" />}
                          </span>
                          <span className="flex-1 truncate">
                            {t("island.showAgents")}
                          </span>
                        </ListRow>

                        <div className="my-1 border-t border-background/10" />

                        <ListRow
                          size="sm"
                          onClick={() => {
                            resetPosition();
                            setView(null);
                          }}
                          className={ISLAND_ROW}
                        >
                          <RotateCcw className="opacity-70" />
                          <span className="flex-1 truncate">
                            {t("island.resetPosition")}
                          </span>
                        </ListRow>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 px-1 pb-1.5">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setMenuPage("root")}
                            className={ISLAND_ICON}
                          >
                            <ChevronLeft />
                          </Button>
                          <span className="flex-1 truncate text-xs font-medium">
                            {t("island.integrations")}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setView(null)}
                            aria-label={t("island.close")}
                            className={ISLAND_ICON}
                          >
                            <X />
                          </Button>
                        </div>

                        {AGENT_INTEGRATIONS.map((i) => (
                          <ListRow
                            key={i.id}
                            size="sm"
                            onClick={() => {
                              launchAgent(activePath, i);
                              setView(null);
                            }}
                            className={ISLAND_ROW}
                          >
                            <i.icon />
                            <span className="flex-1 truncate">{i.label}</span>
                            {activeRunning.has(i.id) && (
                              <span className="size-1.5 shrink-0 rounded-full bg-git-added" />
                            )}
                          </ListRow>
                        ))}
                      </>
                    )}
                  </div>
                </DynamicIslandView>
              </DynamicIsland>
          </m.div>
        </m.div>
      </div>
    </>
  );
}

function islandSize(el: HTMLElement | null) {
  return {
    width: el?.offsetWidth || ISLAND_WIDTH,
    height: el?.offsetHeight || ISLAND_HEIGHT,
  };
}

function islandTarget(
  dock: IslandDockTarget,
  position: IslandPosition | null,
): IslandPosition {
  if (dock !== "free") {
    const rect = dockRectFor(dock);
    if (rect)
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return position ?? defaultIslandPosition();
}

function useIslandToast(enabled: boolean): ToastT | null {
  const { toasts } = useSonner();
  const latest = enabled ? (toasts[toasts.length - 1] ?? null) : null;

  useEffect(() => {
    if (!latest || latest.type === "loading") return;
    const timer = window.setTimeout(
      () => sonnerToast.dismiss(latest.id),
      latest.duration ?? DEFAULT_TOAST_MS,
    );
    return () => window.clearTimeout(timer);
  }, [latest]);

  return latest;
}

function renderToastNode(
  node: ToastT["title"] | ToastT["description"],
): ReactNode {
  return typeof node === "function" ? node() : node;
}

function ToastIcon({ type }: { type?: ToastT["type"] }) {
  const className = "size-4 shrink-0";
  if (type === "success")
    return <CheckCircle2 className={cn(className, "text-git-added")} />;
  if (type === "error")
    return <XCircle className={cn(className, "text-git-removed")} />;
  if (type === "warning")
    return <AlertTriangle className={cn(className, "text-git-modified")} />;
  if (type === "loading")
    return <SpinIcon icon={Loader2} className={cn(className, "opacity-70")} />;
  return <Info className={cn(className, "opacity-70")} />;
}

function ActivityBars({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex h-3 shrink-0 items-end gap-[2px]", className)}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="w-[2px] rounded-full bg-current"
          animate={{ height: ["30%", "100%", "30%"], opacity: [0.55, 1, 0.55] }}
          transition={{
            repeat: Infinity,
            duration: 0.9,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}
