import { runRemoteOp, useRemoteOps, type GitProgressEvent } from "@/lib/remote-ops";
import { channel, invoke } from "@/lib/platform/ipc";

let available: Promise<boolean> | undefined;
let enabled = false;

export function desktopWorkspaceFetchAvailable(): Promise<boolean> {
  available ??= invoke<boolean>("workspace_fetch_desktop_available").then(
    result => (enabled = result),
    () => false,
  );
  return available;
}

export function revokeDesktopWorkspaceFetch() {
  if (enabled) void invoke("workspace_fetch_desktop_revoke").catch(() => {});
}

export function runDesktopWorkspaceFetch(path: string, workspaceId: string, revision: number) {
  return runRemoteOp("fetch", path, opId =>
    invoke<string>("workspace_fetch_desktop_start", {
      path, workspaceId, revision, opId,
      progress: channel<GitProgressEvent>(event => useRemoteOps.getState().applyProgress(event)),
    }), {
      cancel: opId => invoke<boolean>("workspace_fetch_desktop_cancel", { opId }),
      retryCanceled: true,
    });
}
