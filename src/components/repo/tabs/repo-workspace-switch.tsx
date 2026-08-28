import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import {
  OverlayPortal,
  useAnchorBox,
} from "@/components/ui/overlay-portal";
import { useWorkspaceStore, type Workspace } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";
import { Check, Pencil, Plus } from "lucide-react";
import { AnimatePresence, LayoutGroup, m, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { WorkspaceCreateDialog, WorkspaceEditDialog } from "./workspace-dialogs";

function wsHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function wsInitial(name: string): string {
  return (name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
}

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -8 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: "spring", stiffness: 480, damping: 32, mass: 0.38 },
  },
  exit: {
    opacity: 0, scale: 0.96, y: -5,
    transition: { duration: 0.13, ease: [0.4, 0, 1, 1] },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { type: "spring", stiffness: 520, damping: 34, delay: i * 0.038 },
  }),
};

export function RepoWorkspaceSwitch() {
  const { t } = useTranslation();
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
      setActiveWorkspace: s.setActiveWorkspace,
    })),
  );

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingWs, setEditingWs] = useState<Workspace | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const box = useAnchorBox(open, wrapRef);
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hue = activeWs ? wsHue(activeWs.name) : 0;

  return (
    <>
      <div className="relative shrink-0" ref={wrapRef}>
        <LayoutGroup id="ws-switcher">
          <m.button
            type="button"
            whileTap={{ scale: 0.86 }}
            transition={{ type: "spring", stiffness: 600, damping: 28, mass: 0.3 }}
            onClick={() => setOpen((o) => !o)}
            title={activeWs?.name}
            aria-label={activeWs?.name}
            aria-expanded={open}
            className={cn(
              "relative flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[11px] font-bold text-white transition-[box-shadow,opacity]",
              open ? "opacity-80" : "hover:opacity-90",
            )}
            style={{
              backgroundColor: `hsl(${hue} 52% 40%)`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.18)`,
            }}
          >
            {activeWs ? wsInitial(activeWs.name) : "?"}
          </m.button>

          <OverlayPortal>
          <AnimatePresence>
            {open && (
              <m.div
                key="ws-panel"
                ref={panelRef}
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{
                  transformOrigin: "top left",
                  top: (box?.bottom ?? 0) + 6,
                  left: box?.left ?? 0,
                }}
                className="fixed z-[80] w-[210px] overflow-hidden rounded-xl border border-border/70 bg-popover shadow-[0_10px_28px_rgba(0,0,0,0.13),0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.3)]"
              >
                <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {t("repoWorkspaceSwitch.menuTitle")}
                </p>

                <div className="px-1.5 pb-1">
                  {workspaces.map((ws, i) => {
                    const wsH = wsHue(ws.name);
                    const isActive = ws.id === activeWorkspaceId;
                    return (
                      <m.div
                        key={ws.id}
                        custom={i}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        className="group relative flex items-center rounded-lg"
                      >
                        {isActive && (
                          <m.span
                            layoutId="ws-active-bg"
                            className="absolute inset-0 rounded-lg bg-foreground/[0.07]"
                            transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.5 }}
                          />
                        )}
                        <ListRow
                          variant="ghost"
                          onClick={() => {
                            setActiveWorkspace(ws.id);
                            setOpen(false);
                          }}
                          className="relative flex-1"
                        >
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.16)]"
                            style={{ backgroundColor: `hsl(${wsH} 52% 40%)` }}
                          >
                            {wsInitial(ws.name)}
                          </span>
                          <span
                            className={cn(
                              "flex-1 truncate text-[13px] font-medium",
                              isActive ? "text-foreground" : "text-foreground/70",
                            )}
                          >
                            {ws.name}
                          </span>
                          {isActive && (
                            <Check className="size-3.5 shrink-0 text-foreground/40" />
                          )}
                        </ListRow>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingWs(ws);
                            setOpen(false);
                          }}
                          aria-label={t("repoWorkspaceSwitch.edit", { name: ws.name })}
                          className="relative mr-1.5 opacity-0 group-hover:opacity-100"
                        >
                          <Pencil />
                        </Button>
                      </m.div>
                    );
                  })}
                </div>

                <div className="border-t border-border/50 px-1.5 py-1.5">
                  <ListRow
                    onClick={() => {
                      setCreateOpen(true);
                      setOpen(false);
                    }}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/40">
                      <Plus className="size-3" />
                    </span>
                    {t("repoWorkspaceSwitch.add")}
                  </ListRow>
                </div>
              </m.div>
            )}
          </AnimatePresence>
          </OverlayPortal>
        </LayoutGroup>
      </div>

      <WorkspaceCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editingWs && (
        <WorkspaceEditDialog
          open={!!editingWs}
          onClose={() => setEditingWs(null)}
          workspace={editingWs}
        />
      )}
    </>
  );
}
