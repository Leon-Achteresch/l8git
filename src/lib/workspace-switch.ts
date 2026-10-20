import { useRepoStore } from "@/lib/repo-store";
import { useWorkspaceStore, workspaceRepo } from "@/lib/workspace-store";

/** Opens the repo the active workspace should show, or none if it has no open repo. */
function showActiveWorkspaceRepo() {
  const { activeWorkspaceId } = useWorkspaceStore.getState();
  const { paths, activePath, setActive } = useRepoStore.getState();
  const target = workspaceRepo(activeWorkspaceId, paths);
  if (target !== activePath) setActive(target);
}

/** Switches workspaces and brings back the repo that was last open in the target. */
export function switchWorkspace(id: string) {
  const workspaces = useWorkspaceStore.getState();
  if (workspaces.activeWorkspaceId === id) return;
  const { activePath } = useRepoStore.getState();
  if (activePath) workspaces.rememberRepo(activePath);
  workspaces.setActiveWorkspace(id);
  showActiveWorkspaceRepo();
}

/** Deletes a workspace; its repos move to the active workspace, so only an empty view needs a repo. */
export function deleteWorkspace(id: string) {
  useWorkspaceStore.getState().removeWorkspace(id);
  if (!useRepoStore.getState().activePath) showActiveWorkspaceRepo();
}
