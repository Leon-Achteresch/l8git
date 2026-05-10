import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { Check, ChevronDown, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { WorkspaceCreateDialog, WorkspaceEditDialog } from "./workspace-dialogs";

export function RepoWorkspaceSwitch() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
      setActiveWorkspace: s.setActiveWorkspace,
    })),
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card py-1 pl-1.5 pr-2 transition-colors hover:border-border/80 focus:outline-none"
          >
            <span className="grid size-[22px] shrink-0 grid-cols-2 grid-rows-2 gap-0.5 place-content-center p-0.5">
              <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
              <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
              <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
              <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
                WORKSPACE
              </span>
              <span className="max-w-[100px] truncate text-xs font-semibold text-foreground">
                {activeWorkspace?.name ?? "—"}
              </span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" sideOffset={6} className="min-w-[180px]">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>

          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setActiveWorkspace(ws.id)}
              className="gap-2"
            >
              <Check
                className="size-3.5 shrink-0"
                style={{ opacity: ws.id === activeWorkspaceId ? 1 : 0 }}
              />
              <span className="flex-1 truncate">{ws.name}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-3.5 shrink-0 text-muted-foreground" />
            <span>Workspace hinzufügen…</span>
          </DropdownMenuItem>

          {activeWorkspace && (
            <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2">
              <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">„{activeWorkspace.name}" bearbeiten…</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkspaceCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {activeWorkspace && (
        <WorkspaceEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          workspace={activeWorkspace}
        />
      )}
    </>
  );
}
