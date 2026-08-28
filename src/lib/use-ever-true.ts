import { useRef } from "react";

/**
 * Latches on the first `true` and stays there.
 *
 * Used to keep a dialog out of the tree — and its chunk off the network —
 * until it is opened for the first time, while leaving it mounted afterwards
 * so closing still plays its exit animation.
 */
export function useEverTrue(value: boolean): boolean {
  const seen = useRef(false);
  if (value) seen.current = true;
  return seen.current;
}
