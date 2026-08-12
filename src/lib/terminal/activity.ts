import { create } from "zustand";

const WINDOW_MS = 1000;
const BUSY_BYTES = 400;
const IDLE_MS = 1200;
const QUIET_INPUT_MS = 350;
const QUIET_RESIZE_MS = 1000;

type ActivityState = {
  busy: Record<string, boolean>;
  setBusy: (leafId: string, value: boolean) => void;
  clear: (leafId: string) => void;
};

export const useTerminalActivity = create<ActivityState>()((set) => ({
  busy: {},
  setBusy: (leafId, value) =>
    set((s) =>
      s.busy[leafId] === value ? s : { busy: { ...s.busy, [leafId]: value } },
    ),
  clear: (leafId) =>
    set((s) => {
      if (!(leafId in s.busy)) return s;
      const { [leafId]: _gone, ...busy } = s.busy;
      return { busy };
    }),
}));

type Track = {
  bytes: number;
  windowStart: number;
  timer: number | null;
  quietUntil: number;
};

const tracks = new Map<string, Track>();

function trackFor(leafId: string, now: number): Track {
  let track = tracks.get(leafId);
  if (!track) {
    track = { bytes: 0, windowStart: now, timer: null, quietUntil: 0 };
    tracks.set(leafId, track);
  }
  return track;
}

export function noteTerminalInput(
  leafId: string,
  quietMs: number = QUIET_INPUT_MS,
): void {
  const now = Date.now();
  const track = trackFor(leafId, now);
  track.quietUntil = Math.max(track.quietUntil, now + quietMs);
  track.bytes = 0;
}

export function noteTerminalResize(leafId: string): void {
  noteTerminalInput(leafId, QUIET_RESIZE_MS);
}

export function noteTerminalOutput(leafId: string, byteLength: number): void {
  const now = Date.now();
  const track = trackFor(leafId, now);
  // Echo/Redraw direkt nach User-Input oder Resize ist keine Agent-Arbeit.
  if (now < track.quietUntil) return;
  if (now - track.windowStart > WINDOW_MS) {
    track.bytes = 0;
    track.windowStart = now;
  }
  track.bytes += byteLength;

  const state = useTerminalActivity.getState();
  const alreadyBusy = !!state.busy[leafId];
  if (!alreadyBusy && track.bytes < BUSY_BYTES) return;
  if (!alreadyBusy) state.setBusy(leafId, true);

  if (track.timer !== null) window.clearTimeout(track.timer);
  track.timer = window.setTimeout(() => {
    track.timer = null;
    track.bytes = 0;
    useTerminalActivity.getState().setBusy(leafId, false);
  }, IDLE_MS);
}

export function clearTerminalActivity(leafId: string): void {
  const track = tracks.get(leafId);
  if (track?.timer !== null && track?.timer !== undefined) {
    window.clearTimeout(track.timer);
  }
  tracks.delete(leafId);
  useTerminalActivity.getState().clear(leafId);
}
