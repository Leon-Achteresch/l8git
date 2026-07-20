import { create } from "zustand";

const WINDOW_MS = 1000;
const BUSY_BYTES = 400;
const IDLE_MS = 1200;

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

type Track = { bytes: number; windowStart: number; timer: number | null };

const tracks = new Map<string, Track>();

export function noteTerminalOutput(leafId: string, byteLength: number): void {
  const now = Date.now();
  const track = tracks.get(leafId) ?? { bytes: 0, windowStart: now, timer: null };
  tracks.set(leafId, track);
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
