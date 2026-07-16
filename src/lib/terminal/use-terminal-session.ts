import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { clearTerminalActivity, noteTerminalOutput } from "./activity";
import { recordCommand } from "./command-history";
import { DormantRing } from "./dormant-ring";
import {
  createShellIntegrationState,
  registerColorQueryHandlers,
  registerCwdHandler,
  registerPromptTracker,
} from "./osc-handlers";
import { openPty, type PtySession } from "./pty-bridge";
import { isDarkMode } from "./terminal-theme";
import {
  acquireSlot,
  applyTheme as applyPoolTheme,
  configureRendererPool,
  disposeLeafSlot,
  focusSlot,
  getSlotForLeaf,
  isLeafAltScreen,
  parkLeafSlot,
  refreshLeafSlot,
  releaseSlot,
  setSlotFocused,
} from "./renderer-pool";

type Callbacks = {
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onError?: (message: string) => void;
};

type Session = {
  pty: PtySession | null;
  ptyOpening: boolean;
  initialCwd: string | undefined;
  shell: string | null;
  lastCwd: string | null;
  pendingExit: number | null;
  pendingError: string | null;
  shellExited: boolean;
  callbacks: Callbacks;
  visibleNow: boolean;
  focusedNow: boolean;
  disposed: boolean;
  ready: Promise<void>;
  cols: number;
  rows: number;
  container: HTMLDivElement | null;
  snapshot: string | null;
  searchQuery: string | null;
  dormantRing: DormantRing;
  hasSlot: boolean;
  altScreenAtRelease: boolean;
};

const sessions = new Map<string, Session>();

export function terminalLeafId(path: string, tabId: string): string {
  return `${path}::${tabId}`;
}

function leafPath(leafId: string): string {
  const i = leafId.lastIndexOf("::");
  return i === -1 ? leafId : leafId.slice(0, i);
}

configureRendererPool({
  resolveLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return null;
    return {
      writeToPty: (data) => {
        s.pty?.write(data);
      },
      resizePty: (cols, rows) => {
        s.cols = cols;
        s.rows = rows;
        s.pty?.resize(cols, rows);
      },
      kickPty: (cols, rows) => {
        const pty = s.pty;
        if (!pty || cols <= 0 || rows <= 0) return;
        pty
          .resize(cols, rows + 1)
          .then(() => pty.resize(cols, rows))
          .catch((e) => console.warn("[l8git] kickPty failed:", e));
      },
    };
  },
  evictLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return;
    unbindLeafFromSlot(leafId, s);
  },
  isLeafFocused(leafId) {
    const s = sessions.get(leafId);
    return !!s && s.visibleNow && s.focusedNow;
  },
});

function ensureSession(
  leafId: string,
  initialCwd?: string,
  shell: string | null = null,
): Session {
  const existing = sessions.get(leafId);
  if (existing) return existing;

  const session: Session = {
    pty: null,
    ptyOpening: false,
    initialCwd,
    shell,
    lastCwd: null,
    pendingExit: null,
    pendingError: null,
    shellExited: false,
    callbacks: {},
    visibleNow: false,
    focusedNow: false,
    disposed: false,
    ready: Promise.resolve(),
    cols: 0,
    rows: 0,
    container: null,
    snapshot: null,
    searchQuery: null,
    dormantRing: new DormantRing(),
    hasSlot: false,
    altScreenAtRelease: false,
  };
  sessions.set(leafId, session);

  session.ready = document.fonts.ready.then(() => undefined);

  return session;
}

function deliverPtyBytes(leafId: string, bytes: Uint8Array): void {
  const s = sessions.get(leafId);
  if (!s) return;
  noteTerminalOutput(leafId, bytes.length);
  const slot = getSlotForLeaf(leafId);
  if (slot) slot.term.write(bytes);
  else s.dormantRing.push(bytes);
}

async function openPtyForSession(
  leafId: string,
  s: Session,
  cwd: string | undefined,
): Promise<PtySession> {
  const startCols = s.cols > 0 ? s.cols : 80;
  const startRows = s.rows > 0 ? s.rows : 24;
  return openPty(
    startCols,
    startRows,
    {
      onData: (bytes) => deliverPtyBytes(leafId, bytes),
      onExit: (code) => {
        s.shellExited = true;
        s.pty = null;
        const slot = getSlotForLeaf(leafId);
        if (slot) slot.term.options.disableStdin = true;
        if (s.callbacks.onExit) s.callbacks.onExit(code);
        else s.pendingExit = code;
      },
    },
    cwd,
    s.shell,
    isDarkMode(),
  );
}

function reportOpenError(s: Session, e: unknown): void {
  const message = String(e);
  console.error("[l8git] openPty failed:", e);
  if (s.callbacks.onError) s.callbacks.onError(message);
  else s.pendingError = message;
}

function bindLeafToSlot(leafId: string, s: Session): void {
  if (!s.container) return;
  const altScreen = s.altScreenAtRelease;
  s.altScreenAtRelease = false;
  acquireSlot({
    leafId,
    container: s.container,
    snapshot: s.snapshot,
    altScreen,
    drainRing: (write) => s.dormantRing.drain(write),
    shellExited: s.shellExited,
    searchQuery: s.searchQuery,
    cols: s.cols,
    rows: s.rows,
    registerOsc: (term) => {
      const shellState = createShellIntegrationState();
      const prompt = registerPromptTracker(term, shellState, (cmd) =>
        recordCommand(leafPath(leafId), cmd),
      );
      const cwd = registerCwdHandler(
        term,
        (next) => {
          if (s.lastCwd === next) return;
          s.lastCwd = next;
          s.callbacks.onCwd?.(next);
        },
        shellState,
      );
      const colors = registerColorQueryHandlers(term, (data) => {
        s.pty?.write(data);
      });
      return [prompt.dispose, cwd, colors];
    },
    onSearchReady: (addon) => s.callbacks.onSearchReady?.(addon),
  });
  s.snapshot = null;
  s.hasSlot = true;
  if (s.lastCwd !== null) s.callbacks.onCwd?.(s.lastCwd);
  if (s.pendingExit !== null) {
    const code = s.pendingExit;
    s.pendingExit = null;
    s.callbacks.onExit?.(code);
  }
  if (s.pendingError !== null) {
    const message = s.pendingError;
    s.pendingError = null;
    s.callbacks.onError?.(message);
  }
}

function unbindLeafFromSlot(leafId: string, s: Session): void {
  if (!s.hasSlot) return;
  const out = releaseSlot(leafId);
  if (out) {
    s.snapshot = out.snapshot;
    if (out.cols > 0) s.cols = out.cols;
    if (out.rows > 0) s.rows = out.rows;
    s.altScreenAtRelease = out.altScreen;
  }
  s.hasSlot = false;
}

function attachSession(
  leafId: string,
  container: HTMLDivElement,
  callbacks: Callbacks,
): void {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.callbacks = callbacks;
  s.container = container;

  if (s.visibleNow) bindLeafToSlot(leafId, s);

  if (!s.pty && !s.ptyOpening && !s.shellExited) {
    s.ptyOpening = true;
    openPtyForSession(leafId, s, s.initialCwd)
      .then((pty) => {
        s.ptyOpening = false;
        if (s.disposed) {
          pty.close();
          return;
        }
        s.pty = pty;
        if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
      })
      .catch((e) => {
        s.ptyOpening = false;
        reportOpenError(s, e);
      });
  }
}

function detachSession(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  unbindLeafFromSlot(leafId, s);
  s.callbacks = {};
  s.container = null;
}

export async function respawnSession(
  leafId: string,
  cwd?: string,
  shell?: string | null,
): Promise<void> {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.pty?.close();
  s.pty = null;
  s.snapshot = null;
  s.dormantRing = new DormantRing();
  s.shellExited = false;
  s.pendingExit = null;
  s.pendingError = null;
  s.altScreenAtRelease = false;
  if (shell !== undefined) s.shell = shell;

  const slot = getSlotForLeaf(leafId);
  if (slot) {
    slot.term.options.disableStdin = false;
    slot.term.clear();
    slot.term.reset();
  }

  s.ptyOpening = true;
  let pty: PtySession;
  try {
    pty = await openPtyForSession(leafId, s, cwd ?? s.initialCwd);
  } catch (e) {
    s.ptyOpening = false;
    reportOpenError(s, e);
    return;
  }
  s.ptyOpening = false;
  if (s.disposed) {
    pty.close();
    return;
  }
  s.pty = pty;
  if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
}

export function updateSessionShell(leafId: string, shell: string | null): void {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  const normalize = (v: string | null) => (v?.trim() ? v.trim() : null);
  if (normalize(s.shell) === normalize(shell)) return;
  void respawnSession(leafId, undefined, shell);
}

export function writeToSession(leafId: string, data: string): void {
  const s = sessions.get(leafId);
  if (!s || s.disposed || s.shellExited) return;
  s.pty?.write(data);
  focusSlot(leafId);
}

export function disposeSession(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  s.disposed = true;
  disposeLeafSlot(leafId);
  s.hasSlot = false;
  s.snapshot = null;
  s.pty?.close();
  s.pty = null;
  clearTerminalActivity(leafId);
  sessions.delete(leafId);
}

export function disposeSessionsForPath(path: string): void {
  const prefix = `${path}::`;
  for (const leafId of [...sessions.keys()]) {
    if (leafId.startsWith(prefix)) disposeSession(leafId);
  }
}

type Options = {
  leafId: string;
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  focused?: boolean;
  initialCwd?: string;
  shell?: string | null;
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onError?: (message: string) => void;
};

export function useTerminalSession({
  leafId,
  container,
  visible,
  focused = true,
  initialCwd,
  shell = null,
  onSearchReady,
  onExit,
  onCwd,
  onError,
}: Options) {
  const cbRef = useRef({ onSearchReady, onExit, onCwd, onError });
  cbRef.current = { onSearchReady, onExit, onCwd, onError };

  const initialCwdRef = useRef(initialCwd);
  initialCwdRef.current = initialCwd;
  const shellRef = useRef(shell);
  shellRef.current = shell;

  useEffect(() => {
    let cancelled = false;
    const s = ensureSession(leafId, initialCwdRef.current, shellRef.current);
    s.ready.then(() => {
      if (cancelled || s.disposed) return;
      const node = container.current;
      if (!node) return;
      attachSession(leafId, node, {
        onSearchReady: (a) => cbRef.current.onSearchReady?.(a),
        onExit: (c) => cbRef.current.onExit?.(c),
        onCwd: (c) => cbRef.current.onCwd?.(c),
        onError: (m) => cbRef.current.onError?.(m),
      });
      if (s.visibleNow && s.focusedNow) focusSlot(leafId);
    });
    return () => {
      cancelled = true;
      detachSession(leafId);
    };
  }, [leafId, container]);

  useEffect(() => {
    const s = sessions.get(leafId);
    if (!s) return;
    s.visibleNow = visible;
    s.focusedNow = focused;
    if (visible) {
      if (s.container && !s.hasSlot) bindLeafToSlot(leafId, s);
      else if (s.hasSlot) refreshLeafSlot(leafId);
      setSlotFocused(leafId, focused);
      if (focused) focusSlot(leafId);
    } else if (s.hasSlot) {
      if (isLeafAltScreen(leafId)) parkLeafSlot(leafId);
      else unbindLeafFromSlot(leafId, s);
    }
  }, [leafId, visible, focused]);

  const write = useCallback(
    (data: string) => sessions.get(leafId)?.pty?.write(data),
    [leafId],
  );

  const focus = useCallback(() => focusSlot(leafId), [leafId]);

  const applyTheme = useCallback(() => {
    applyPoolTheme();
  }, []);

  return useMemo(
    () => ({ write, focus, applyTheme }),
    [write, focus, applyTheme],
  );
}
