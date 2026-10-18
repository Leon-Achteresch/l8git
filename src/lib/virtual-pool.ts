// Fits any viewport window (visible rows plus overscan) the app renders, so the pool
// size, and with it every key, stays fixed while the window grows and shrinks.
const MIN_POOL_SIZE = 256;

/**
 * Pool key for a recycled virtual row. A contiguous window of rows maps to distinct
 * slots, and a slot only changes item when its own row scrolls out, so a one-row
 * scroll re-renders one row instead of shifting every slot to its neighbour's item.
 */
export function virtualPoolSlot(index: number, windowLength: number): number {
  const poolSize =
    windowLength <= MIN_POOL_SIZE
      ? MIN_POOL_SIZE
      : 2 ** Math.ceil(Math.log2(windowLength));
  return index % poolSize;
}
