import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as Xterm } from "@xterm/xterm";

import { registerTerminalSessionDestroyers } from "@/lib/terminal-session-registry";
import {
  TitleEventSource,
  TerminalInputTracker,
  processOscTitle,
  titleFromTerminalOutput,
} from "@/lib/terminal-tab-title";

export type SessionStatus = "starting" | "ready" | "exited" | "error";

export type XtermTheme = NonNullable<
  ConstructorParameters<typeof Xterm>[0]
>["theme"];

type Subscribers = {
  status: Set<(s: SessionStatus, msg: string) => void>;
  title: Set<(title: string) => void>;
};

export type CachedSession = {
  path: string;
  tabId: string;
  term: Xterm | null;
  fit: FitAddon | null;
  webgl: WebglAddon | null;
  theme: XtermTheme;
  orphan: HTMLDivElement;
  sessionId: number | null;
  inputTracker: TerminalInputTracker;
  outputBuf: string;
  lastTitle: string | null;
  titleSource: TitleEventSource | null;
  hasSeenOscTitle: boolean;
  awaitingPrompt: boolean;
  dataChannel: Channel<ArrayBuffer> | null;
  exitChannel: Channel<number | null> | null;
  decoder: TextDecoder;
  pendingWrites: Uint8Array[];
  pendingBytes: number;
  flushHandle: number | null;
  onDataDispose: { dispose: () => void } | null;
  onTitleChangeDispose: { dispose: () => void } | null;
  status: SessionStatus;
  statusMsg: string;
  shell: string | null;
  opened: boolean;
  ptyStarted: boolean;
  evicted: boolean;
  active: boolean;
  lastActiveAt: number;
  lastSentCols: number;
  lastSentRows: number;
  subscribers: Subscribers;
};

const cache = new Map<string, CachedSession>();

const FLUSH_BYTES_CAP = 256 * 1024;
const SCROLLBACK = 600;
const MAX_LIVE = 4;

function key(path: string, tabId: string) {
  return `${path}::${tabId}`;
}

function createOrphan(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-99999px";
  el.style.top = "-99999px";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.overflow = "hidden";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  return el;
}

function setStatus(rec: CachedSession, status: SessionStatus, msg: string) {
  rec.status = status;
  rec.statusMsg = msg;
  for (const cb of rec.subscribers.status) cb(status, msg);
}

function emitTitle(
  rec: CachedSession,
  title: string,
  source: TitleEventSource = TitleEventSource.OutputPrompt,
) {
  if (!title || rec.lastTitle === title) return;
  if (
    rec.titleSource === TitleEventSource.Api ||
    (rec.titleSource === TitleEventSource.Sequence &&
      source !== TitleEventSource.Sequence &&
      source !== TitleEventSource.Api)
  ) {
    return;
  }
  rec.lastTitle = title;
  rec.titleSource = source;
  for (const cb of rec.subscribers.title) cb(title);
}

function buildTerm(rec: CachedSession) {
  const term = new Xterm({
    cursorBlink: true,
    fontFamily:
      '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    theme: rec.theme,
    allowProposedApi: true,
    scrollback: SCROLLBACK,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  rec.term = term;
  rec.fit = fit;
  rec.webgl = null;
  rec.opened = false;
}

function enableWebgl(rec: CachedSession) {
  if (!rec.term || rec.webgl) return;
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      try {
        webgl.dispose();
      } catch {
        void 0;
      }
      rec.webgl = null;
    });
    rec.term.loadAddon(webgl);
    rec.webgl = webgl;
  } catch {
    rec.webgl = null;
  }
}

function disableWebgl(rec: CachedSession) {
  if (!rec.webgl) return;
  try {
    rec.webgl.dispose();
  } catch {
    void 0;
  }
  rec.webgl = null;
}

function wireOnData(rec: CachedSession) {
  if (!rec.term) return;
  rec.onDataDispose?.dispose();
  rec.onDataDispose = rec.term.onData((data) => {
    const sid = rec.sessionId;
    if (sid == null) return;
    if (!rec.hasSeenOscTitle) {
      const cmdTitle = rec.inputTracker.feed(data);
      if (cmdTitle) {
        rec.awaitingPrompt = true;
        emitTitle(rec, cmdTitle, TitleEventSource.InputCommand);
      }
    }
    void invoke("terminal_write", { session: sid, data }).catch(() => {});
  });
}

function bindTitleTracking(rec: CachedSession) {
  if (!rec.term) return;
  rec.onTitleChangeDispose?.dispose();
  rec.onTitleChangeDispose = rec.term.onTitleChange((rawTitle) => {
    const title = processOscTitle(rawTitle);
    if (!title) return;
    rec.hasSeenOscTitle = true;
    rec.awaitingPrompt = false;
    emitTitle(rec, title, TitleEventSource.Sequence);
  });
}

function queueWrite(rec: CachedSession, bytes: Uint8Array) {
  rec.pendingWrites.push(bytes);
  rec.pendingBytes += bytes.length;
  if (rec.pendingBytes >= FLUSH_BYTES_CAP) {
    flushWrites(rec);
    return;
  }
  if (rec.flushHandle == null) {
    rec.flushHandle = requestAnimationFrame(() => flushWrites(rec));
  }
}

function flushWrites(rec: CachedSession) {
  if (rec.flushHandle != null) {
    cancelAnimationFrame(rec.flushHandle);
    rec.flushHandle = null;
  }
  const chunks = rec.pendingWrites;
  if (chunks.length === 0) return;
  rec.pendingWrites = [];
  rec.pendingBytes = 0;
  const term = rec.term;
  if (!term) return;
  if (chunks.length === 1) {
    term.write(chunks[0]);
    return;
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  term.write(merged);
}

function measurePixelSize(rec: CachedSession): {
  pixelWidth: number;
  pixelHeight: number;
} {
  const el = rec.term?.element as HTMLElement | null;
  if (el) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        pixelWidth: Math.round(rect.width),
        pixelHeight: Math.round(rect.height),
      };
    }
  }
  const cols = rec.term?.cols || 80;
  const rows = rec.term?.rows || 24;
  return { pixelWidth: cols * 9, pixelHeight: rows * 17 };
}

function wireChannels(rec: CachedSession) {
  const dataChannel = new Channel<ArrayBuffer>();
  dataChannel.onmessage = (buf) => {
    const bytes = new Uint8Array(buf);
    if (!rec.hasSeenOscTitle) {
      const text = rec.decoder.decode(bytes);
      const cap = 4096;
      const nextBuf = rec.outputBuf + text;
      rec.outputBuf =
        nextBuf.length > cap ? nextBuf.slice(nextBuf.length - cap) : nextBuf;
      if (rec.awaitingPrompt) {
        const cwd = titleFromTerminalOutput(rec.outputBuf);
        if (cwd) {
          rec.awaitingPrompt = false;
          emitTitle(rec, cwd, TitleEventSource.OutputPrompt);
        }
      }
    }
    queueWrite(rec, bytes);
  };

  const exitChannel = new Channel<number | null>();
  exitChannel.onmessage = (code) => {
    setStatus(rec, "exited", String(code ?? 0));
    rec.sessionId = null;
  };

  rec.dataChannel = dataChannel;
  rec.exitChannel = exitChannel;
  return { dataChannel, exitChannel };
}

async function openPty(rec: CachedSession, shell: string | null) {
  if (rec.ptyStarted || !rec.term) return;
  rec.ptyStarted = true;
  rec.shell = shell;
  setStatus(rec, "starting", "");

  bindTitleTracking(rec);
  const { dataChannel, exitChannel } = wireChannels(rec);

  try {
    const cols = rec.term.cols || 80;
    const rows = rec.term.rows || 24;
    const { pixelWidth, pixelHeight } = measurePixelSize(rec);
    rec.lastSentCols = cols;
    rec.lastSentRows = rows;
    const id = await invoke<number>("terminal_open", {
      path: rec.path,
      shell: shell?.trim() || null,
      cols,
      rows,
      pixelWidth,
      pixelHeight,
      onData: dataChannel,
      onExit: exitChannel,
    });
    rec.sessionId = id;
    setStatus(rec, "ready", "");
    wireOnData(rec);
  } catch (e) {
    rec.ptyStarted = false;
    rec.dataChannel = null;
    rec.exitChannel = null;
    setStatus(rec, "error", String(e));
  }
}

export function getOrCreateSession(opts: {
  path: string;
  tabId: string;
  theme: XtermTheme;
  shell: string | null;
}): { record: CachedSession; created: boolean } {
  const k = key(opts.path, opts.tabId);
  const existing = cache.get(k);
  if (existing) return { record: existing, created: false };

  const record: CachedSession = {
    path: opts.path,
    tabId: opts.tabId,
    term: null,
    fit: null,
    webgl: null,
    theme: opts.theme,
    orphan: createOrphan(),
    sessionId: null,
    inputTracker: new TerminalInputTracker(),
    outputBuf: "",
    lastTitle: null,
    titleSource: null,
    hasSeenOscTitle: false,
    awaitingPrompt: true,
    dataChannel: null,
    exitChannel: null,
    decoder: new TextDecoder(),
    pendingWrites: [],
    pendingBytes: 0,
    flushHandle: null,
    onDataDispose: null,
    onTitleChangeDispose: null,
    status: "starting",
    statusMsg: "",
    shell: opts.shell,
    opened: false,
    ptyStarted: false,
    evicted: false,
    active: false,
    lastActiveAt: 0,
    lastSentCols: 0,
    lastSentRows: 0,
    subscribers: { status: new Set(), title: new Set() },
  };
  cache.set(k, record);
  return { record, created: true };
}

function reviveSession(rec: CachedSession, container: HTMLElement) {
  buildTerm(rec);
  rec.term!.open(container);
  rec.opened = true;
  rec.evicted = false;
  bindTitleTracking(rec);
  wireOnData(rec);
  try {
    rec.fit!.fit();
  } catch {
    void 0;
  }
  if (rec.sessionId != null) {
    void invoke("terminal_attach", { session: rec.sessionId }).catch(() => {});
  } else {
    rec.ptyStarted = false;
  }
}

export function attachSession(rec: CachedSession, container: HTMLElement) {
  const visible = container.clientWidth > 0 && container.clientHeight > 0;

  if (rec.evicted) {
    if (!visible) return;
    reviveSession(rec, container);
    return;
  }

  if (!rec.term) {
    if (!visible) return;
    buildTerm(rec);
  }
  const term = rec.term!;

  if (!rec.opened) {
    if (!visible) return;
    term.open(container);
    rec.opened = true;
  } else if (term.element && term.element.parentElement !== container) {
    container.appendChild(term.element);
    try {
      term.refresh(0, Math.max(0, term.rows - 1));
    } catch {
      void 0;
    }
  }
  try {
    rec.fit?.fit();
  } catch {
    void 0;
  }
  if (!rec.ptyStarted) {
    if (visible) void openPty(rec, rec.shell);
  } else {
    syncResize(rec);
  }
}

export function syncResize(rec: CachedSession): boolean {
  if (rec.sessionId == null || !rec.term) return false;
  const cols = rec.term.cols;
  const rows = rec.term.rows;
  if (!cols || !rows) return false;
  if (cols === rec.lastSentCols && rows === rec.lastSentRows) return false;
  rec.lastSentCols = cols;
  rec.lastSentRows = rows;
  const { pixelWidth, pixelHeight } = measurePixelSize(rec);
  void invoke("terminal_resize", {
    session: rec.sessionId,
    cols,
    rows,
    pixelWidth,
    pixelHeight,
  }).catch(() => {});
  return true;
}

export function markActive(rec: CachedSession) {
  rec.active = true;
  rec.lastActiveAt = Date.now();
  if (rec.term) enableWebgl(rec);
  evictLeastRecentlyUsed();
}

export function markInactive(rec: CachedSession) {
  rec.active = false;
  disableWebgl(rec);
}

function evictSession(rec: CachedSession) {
  if (rec.evicted || !rec.term || rec.sessionId == null) return;
  disableWebgl(rec);
  if (rec.flushHandle != null) {
    cancelAnimationFrame(rec.flushHandle);
    rec.flushHandle = null;
  }
  rec.pendingWrites = [];
  rec.pendingBytes = 0;
  rec.onDataDispose?.dispose();
  rec.onTitleChangeDispose?.dispose();
  rec.onDataDispose = null;
  rec.onTitleChangeDispose = null;
  try {
    rec.term.dispose();
  } catch {
    void 0;
  }
  rec.term = null;
  rec.fit = null;
  rec.opened = false;
  rec.evicted = true;
  void invoke("terminal_detach", { session: rec.sessionId }).catch(() => {});
}

function evictLeastRecentlyUsed() {
  const isLive = (r: CachedSession) => r.opened && r.term && !r.evicted;
  const liveCount = [...cache.values()].filter(isLive).length;
  if (liveCount <= MAX_LIVE) return;
  const evictable = [...cache.values()]
    .filter((r) => isLive(r) && !r.active && r.ptyStarted)
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
  let toEvict = liveCount - MAX_LIVE;
  for (const r of evictable) {
    if (toEvict <= 0) break;
    evictSession(r);
    toEvict--;
  }
}

export function detachSession(rec: CachedSession, container: HTMLElement) {
  try {
    const el = rec.term?.element;
    if (!el || el.parentElement !== container) return;
    if (rec.orphan.isConnected) {
      rec.orphan.appendChild(el);
    } else {
      el.remove();
    }
  } catch {
    void 0;
  }
}

export function destroySession(path: string, tabId: string) {
  const k = key(path, tabId);
  const rec = cache.get(k);
  if (!rec) return;
  if (rec.flushHandle != null) {
    cancelAnimationFrame(rec.flushHandle);
    rec.flushHandle = null;
  }
  disableWebgl(rec);
  rec.dataChannel = null;
  rec.exitChannel = null;
  rec.onDataDispose?.dispose();
  rec.onTitleChangeDispose?.dispose();
  const id = rec.sessionId;
  rec.sessionId = null;
  if (id != null) {
    void invoke("terminal_close", { session: id }).catch(() => {});
  }
  try {
    rec.term?.dispose();
  } catch {
    void 0;
  }
  rec.term = null;
  rec.fit = null;
  if (rec.orphan.parentElement) {
    rec.orphan.parentElement.removeChild(rec.orphan);
  }
  cache.delete(k);
}

export function destroySessionsForPath(path: string) {
  const prefix = `${path}::`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) {
      const [p, tabId] = k.split("::");
      destroySession(p, tabId);
    }
  }
}

export function reopenSession(rec: CachedSession, shell: string | null) {
  rec.onDataDispose?.dispose();
  rec.onTitleChangeDispose?.dispose();
  rec.onDataDispose = null;
  rec.onTitleChangeDispose = null;
  rec.dataChannel = null;
  rec.exitChannel = null;
  if (rec.flushHandle != null) {
    cancelAnimationFrame(rec.flushHandle);
    rec.flushHandle = null;
  }
  rec.pendingWrites = [];
  rec.pendingBytes = 0;
  rec.inputTracker = new TerminalInputTracker();
  rec.outputBuf = "";
  rec.awaitingPrompt = true;
  rec.lastTitle = null;
  rec.titleSource = null;
  rec.hasSeenOscTitle = false;
  rec.sessionId = null;
  rec.ptyStarted = false;
  rec.evicted = false;
  rec.lastSentCols = 0;
  rec.lastSentRows = 0;
  rec.shell = shell;
  if (rec.term) void openPty(rec, shell);
}

export function updateSessionShell(rec: CachedSession, shell: string | null) {
  const normalize = (v: string | null) => (v?.trim() ? v.trim() : null);
  if (normalize(rec.shell) === normalize(shell)) return;
  if (rec.sessionId != null) {
    void invoke("terminal_close", { session: rec.sessionId }).catch(() => {});
  }
  reopenSession(rec, shell);
}

export function updateSessionTheme(rec: CachedSession, theme: XtermTheme) {
  rec.theme = theme;
  if (rec.term) rec.term.options.theme = theme;
}

export function subscribeStatus(
  rec: CachedSession,
  cb: (s: SessionStatus, msg: string) => void,
): () => void {
  rec.subscribers.status.add(cb);
  return () => {
    rec.subscribers.status.delete(cb);
  };
}

export function subscribeTitle(
  rec: CachedSession,
  cb: (title: string) => void,
): () => void {
  rec.subscribers.title.add(cb);
  return () => {
    rec.subscribers.title.delete(cb);
  };
}

registerTerminalSessionDestroyers({ destroySession, destroySessionsForPath });
