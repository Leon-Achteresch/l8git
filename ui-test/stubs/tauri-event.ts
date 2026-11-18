export type UnlistenFn = () => void;

export async function listen<T>(
  event: string,
  cb: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const type = `l8git-test:${event}`;
  const listener = (event: Event) => cb({ payload: (event as CustomEvent<T>).detail });
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}

export async function once(
  _event: string,
  _cb: (event: { payload: unknown }) => void,
): Promise<UnlistenFn> {
  return () => undefined;
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {
  return undefined;
}

export async function emitTo(
  _target: unknown,
  _event: string,
  _payload?: unknown,
): Promise<void> {
  return undefined;
}

export const TauriEvent = {
  WINDOW_RESIZED: "tauri://resize",
  WINDOW_MOVED: "tauri://move",
  WINDOW_CLOSE_REQUESTED: "tauri://close-requested",
  WINDOW_DESTROYED: "tauri://destroyed",
  WINDOW_FOCUS: "tauri://focus",
  WINDOW_BLUR: "tauri://blur",
} as const;
