// Kept dependency-free: eager modules (stores, app island) need the id helper
// without pulling the xterm renderer stack into the entry chunk.
export function terminalLeafId(path: string, tabId: string): string {
  return `${path}::${tabId}`;
}
