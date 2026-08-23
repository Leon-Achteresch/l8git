import { platform } from "@/lib/platform";

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return platform().invoke<T>(cmd, args);
}

export function channel<T>(onMessage: (message: T) => void): unknown {
  return platform().channel<T>(onMessage);
}

export function listen(event: string, callback: (payload: unknown) => void): () => void {
  return platform().listen(event, callback);
}
