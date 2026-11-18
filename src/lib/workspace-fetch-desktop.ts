import { invoke } from "@/lib/platform/ipc";

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
