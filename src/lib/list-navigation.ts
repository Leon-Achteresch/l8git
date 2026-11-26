/** Index targeted by standard list navigation keys. Page size is the number of visible rows. */
export function listNavigationIndex(key: string, index: number, count: number, pageSize: number): number | undefined {
  if (count === 0) return undefined;
  let next: number;
  switch (key) {
    case 'ArrowUp': next = index - 1; break;
    case 'ArrowDown': next = index + 1; break;
    case 'PageUp': next = index - Math.max(1, pageSize); break;
    case 'PageDown': next = index + Math.max(1, pageSize); break;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return undefined;
  }
  return Math.max(0, Math.min(count - 1, next));
}
