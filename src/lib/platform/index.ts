import type { StateStorage } from "zustand/middleware";

export interface PlatformSecrets {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PlatformIpc {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  channel<T>(onMessage: (msg: T) => void): unknown;
  listen(event: string, cb: (payload: unknown) => void): () => void;
  storage: StateStorage;
  secrets: PlatformSecrets;
}

let current: PlatformIpc | null = null;

export function setPlatform(next: PlatformIpc): void {
  current = next;
}

export function hasPlatform(): boolean {
  return current !== null;
}

export function platform(): PlatformIpc {
  if (!current) {
    throw new Error("platform ipc is not registered: call setPlatform() during startup");
  }
  return current;
}
