/**
 * Tiny indirection so stores can request session teardown without statically
 * importing the xterm-based session cache (keeps xterm out of the entry chunk).
 * The cache registers itself on load; until then there are no sessions to destroy.
 */

type TerminalSessionDestroyers = {
  destroySession: (path: string, tabId: string) => void;
  destroySessionsForPath: (path: string) => void;
};

let impl: TerminalSessionDestroyers | null = null;

export function registerTerminalSessionDestroyers(
  destroyers: TerminalSessionDestroyers,
) {
  impl = destroyers;
}

export function destroySession(path: string, tabId: string) {
  impl?.destroySession(path, tabId);
}

export function destroySessionsForPath(path: string) {
  impl?.destroySessionsForPath(path);
}
