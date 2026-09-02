export const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";

export async function invoke(_cmd: string, _args?: Record<string, unknown>): Promise<never> {
  return Promise.reject(new Error("tauri invoke is stubbed in ui tests"));
}

export function isTauri(): boolean {
  return false;
}

export function convertFileSrc(path: string): string {
  return path;
}

export function transformCallback(callback?: (...args: unknown[]) => void, _once = false): number {
  callback?.();
  return 0;
}

export class Channel<T = unknown> {
  onmessage: ((message: T) => void) | null = null;
  id = 0;
}

export class PluginListener {
  plugin = "";
  event = "";
  channelId = 0;
  async unregister(): Promise<void> {
    return undefined;
  }
}

export async function addPluginListener(
  _plugin: string,
  _event: string,
  _cb: (payload: unknown) => void,
): Promise<PluginListener> {
  return new PluginListener();
}

export type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

export async function checkPermissions(_plugin: string): Promise<Record<string, PermissionState>> {
  return {};
}

export async function requestPermissions(_plugin: string): Promise<Record<string, PermissionState>> {
  return {};
}

export class Resource {
  rid = 0;
  async close(): Promise<void> {
    return undefined;
  }
}
