import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { repoLabel } from "@/lib/repo-store";
import {
  countRepos,
  groupContainsPath,
  nodeKey,
  useRepoGroupsStore,
  type ForestNode,
  type GroupNode,
} from "@/lib/repo-groups-store";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, FolderClosed, FolderOpen, FolderPlus, Pencil, Ungroup } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { RepoGroupDialog } from "./repo-group-dialog";
import { RepoTab } from "./repo-tab";

export function ForestNodes({
  nodes,
  activePath,
}: {
  nodes: ForestNode[];
  activePath: string | null;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.type === "repo" ? (
          <RepoTab
            key={node.path}
            path={node.path}
            label={repoLabel(node.path)}
            active={node.path === activePath}
          />
        ) : (
          <RepoGroup key={node.id} group={node} activePath={activePath} />
        ),
      )}
    </>
  );
}

const expandSpring = { type: "spring", stiffness: 460, damping: 40, mass: 0.7 } as const;

function RepoGroup({
  group,
  activePath,
}: {
  group: GroupNode;
  activePath: string | null;
}) {
  const { t } = useTranslation();
  const { toggleCollapse, renameGroup, deleteGroup, createSubgroup } =
    useRepoGroupsStore(
      useShallow((s) => ({
        toggleCollapse: s.toggleCollapse,
        renameGroup: s.renameGroup,
        deleteGroup: s.deleteGroup,
        createSubgroup: s.createSubgroup,
      })),
    );

  const [renameOpen, setRenameOpen] = useState(false);
  const [subgroupOpen, setSubgroupOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: nodeKey(group), animateLayoutChanges: () => false });

  const count = countRepos(group);
  const hasActive = activePath ? groupContainsPath(group, activePath) : false;
  const collapsed = group.collapsed;

  const tint = `hsl(${group.hue} 60% 50%)`;
  const containerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    borderColor: `hsl(${group.hue} 45% 50% / ${hasActive ? 0.55 : 0.28})`,
    backgroundColor: `hsl(${group.hue} 50% 50% / ${collapsed ? 0.08 : 0.05})`,
    boxShadow: hasActive
      ? `inset 0 0 0 1px hsl(${group.hue} 55% 50% / 0.45)`
      : undefined,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={containerStyle}
        className={cn(
          "inline-flex shrink-0 touch-none select-none items-center rounded-[12px] border p-1 transition-shadow duration-150",
          isDragging && "z-10 opacity-40",
        )}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              onClick={() => toggleCollapse(group.id)}
              title={group.name}
              {...attributes}
              {...listeners}
              className={cn(
                "group/header relative inline-flex h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-[9px] px-2 text-left text-[12.5px] font-medium transition-colors duration-150 hover:bg-foreground/[0.06]",
              )}
            >
              <motion.span
                className="flex shrink-0 items-center justify-center"
                animate={{ rotate: collapsed ? 0 : 90 }}
                transition={{ type: "spring", stiffness: 600, damping: 32 }}
              >
                <ChevronRight
                  className="size-3.5"
                  style={{ color: tint }}
                  aria-hidden
                />
              </motion.span>

              <span className="flex size-[22px] shrink-0 items-center justify-center">
                <AnimatePresence mode="wait" initial={false}>
                  {collapsed ? (
                    <motion.span
                      key="closed"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.12 }}
                    >
                      <FolderClosed
                        className="size-[18px]"
                        style={{ color: tint }}
                        aria-hidden
                      />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="open"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.12 }}
                    >
                      <FolderOpen
                        className="size-[18px]"
                        style={{ color: tint }}
                        aria-hidden
                      />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>

              <span className="max-w-[120px] truncate text-xs font-semibold text-foreground/90">
                {group.name}
              </span>

              <span
                className="ml-0.5 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold tabular-nums"
                style={{
                  color: `hsl(${group.hue} 55% 38%)`,
                  backgroundColor: `hsl(${group.hue} 55% 50% / 0.16)`,
                }}
              >
                {count}
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => toggleCollapse(group.id)}>
              {collapsed ? (
                <FolderOpen className="h-3.5 w-3.5" />
              ) : (
                <FolderClosed className="h-3.5 w-3.5" />
              )}
              {collapsed ? t("repoGroup.expand") : t("repoGroup.collapse")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setRenameOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("repoGroup.rename")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setSubgroupOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5" />
              {t("repoGroup.newSubgroup")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => deleteGroup(group.id)}
            >
              <Ungroup className="h-3.5 w-3.5" />
              {t("repoGroup.dissolve")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="children"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={expandSpring}
              className="flex items-center overflow-hidden"
            >
              <span
                className="mx-1 h-5 w-px shrink-0"
                style={{ backgroundColor: `hsl(${group.hue} 45% 50% / 0.3)` }}
                aria-hidden
              />
              <div className="flex items-center gap-1 pr-0.5">
                <ForestNodes nodes={group.children} activePath={activePath} />
                {group.children.length === 0 && (
                  <span className="px-2 text-[11px] italic text-muted-foreground">
                    {t("repoGroup.empty")}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <RepoGroupDialog
        open={renameOpen}
        mode="rename"
        initialName={group.name}
        onSubmit={(name) => renameGroup(group.id, name)}
        onClose={() => setRenameOpen(false)}
      />
      <RepoGroupDialog
        open={subgroupOpen}
        mode="subgroup"
        onSubmit={(name) => createSubgroup(group.id, name)}
        onClose={() => setSubgroupOpen(false)}
      />
    </>
  );
}
