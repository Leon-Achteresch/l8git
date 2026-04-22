import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Writes to localStorage at most once every `delay` ms per key.
 * Intended for high-frequency events like panel-resize drags.
 */
const layoutWriteTimers = new Map<string, number>();
export function writeLocalStorageDebounced(
  key: string,
  value: string,
  delay = 200,
) {
  const existing = layoutWriteTimers.get(key);
  if (existing !== undefined) {
    window.clearTimeout(existing);
  }
  const handle = window.setTimeout(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore quota / access errors
    }
    layoutWriteTimers.delete(key);
  }, delay);
  layoutWriteTimers.set(key, handle);
}
