import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as Xterm } from "@xterm/xterm";

import {
  TitleEventSource,
  TerminalInputTracker,
  processOscTitle,
  titleFromTerminalOutput,
} from "@/lib/terminal-tab-title";

export type SessionStatus = "starting" | "ready" | "exited" | "error";

type TerminalDataEvent = { session: number; data: string };
type TerminalExitEvent = { session: number; code: number | null };

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
  term: Xterm;
  fit: FitAddon;
  orphan: HTMLDivElement;
  sessionId: number | null;
  inputTracker: TerminalInputTracker;
  outputBuf: string;
  lastTitle: string | null;
  /**
   * Tracks the source of the current title, mirroring VSCode's TitleEventSource.
   * Priority: Api > Sequence > InputCommand > OutputPrompt
   */
  titleSource: TitleEventSource | null;
  /**
   * Set to true as soon as the shell emits its first OSC 0/2 title sequence.
   * Once true, input-tracking and prompt-scanning are skipped because the shell
   * itself is managing the title — exactly like VSCode's Sequence source.
   */
  hasSeenOscTitle: boolean;
  awaitingPrompt: boolean;
  unlistenData: UnlistenFn | null;
  unlistenExit: UnlistenFn | null;
  onDataDispose: { dispose: () => void } | null;
  onTitleChangeDispose: { dispose: () => void } | null;
  status: SessionStatus;
  statusMsg: string;
  shell: string | null;
  opened: boolean;
  ptyStarted: boolean;
  lastSentCols: number;
  lastSentRows: number;
  subscribers: Subscribers;
};

const cache = new Map<string, CachedSession>();

function key(path: string, tabId: string) {
  return `${path}::${tabId}`;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
  // Respect priority: never overwrite a higher-priority source with a lower one.
  // Api is set externally and is never overwritten here.
  // Sequence overwrites everything except Api.
  // InputCommand / OutputPrompt only fire when no Sequence source is active.
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

function wireOnData(rec: CachedSession) {
  rec.onDataDispose?.dispose();
  rec.onDataDispose = rec.term.onData((data) => {
    const sid = rec.sessionId;
    if (sid == null) return;
    // Only do keystroke-based title tracking when the shell has NOT started
    // emitting OSC 0/2 sequences.  Once it does, the shell manages its own
    // title (like VSCode's Sequence source) and our heuristics become noise.
    if (!rec.hasSeenOscTitle) {
      const cmdTitle = rec.inputTracker.feed(data);
      if (cmdTitle) {
        rec.awaitingPrompt = true;
        emitTitle(rec, cmdTitle, TitleEventSource.InputCommand);
      }
    }
    const bytes = new TextEncoder().encode(data);
    const encoded = encodeBytesToBase64(bytes);
    void invoke("terminal_write", { session: sid, data: encoded }).catch(
      () => {},
    );
  });
}

function measurePixelSize(rec: CachedSession): {
  pixelWidth: number;
  pixelHeight: number;
} {
  const el = rec.term.element as HTMLElement | null;
  if (el) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        pixelWidth: Math.round(rect.width),
        pixelHeight: Math.round(rect.height),
      };
    }
  }
  // Fallback: derive from cell count.
  const cols = rec.term.cols || 80;
  const rows = rec.term.rows || 24;
  return { pixelWidth: cols * 9, pixelHeight: rows * 17 };
}

async function openPty(rec: CachedSession, shell: string | null) {
  if (rec.ptyStarted) return;
  rec.ptyStarted = true;
  rec.shell = shell;
  setStatus(rec, "starting", "");

  // ── VSCode-style OSC 0/2 title tracking ──────────────────────────────────
  // xterm.js fires onTitleChange whenever the running shell/program sends an
  // OSC 0 (\x1b]0;...\x07) or OSC 2 (\x1b]2;...\x07) sequence.  This is the
  // primary title mechanism in VSCode (TitleEventSource.Sequence): bash uses
  // $PROMPT_COMMAND, zsh uses precmd(), fish has built-in support, and any
  // program (vim, htop, …) can set its own title while running.
  //
  // Once we see the first OSC title we know the shell manages its own title
  // and we stop doing our own heuristic input/prompt tracking — exactly like
  // VSCode disables lower-priority sources when Sequence is active.
  rec.onTitleChangeDispose?.dispose();
  rec.onTitleChangeDispose = rec.term.onTitleChange((rawTitle) => {
    const title = processOscTitle(rawTitle);
    if (!title) return;
    rec.hasSeenOscTitle = true;
    rec.awaitingPrompt = false;
    emitTitle(rec, title, TitleEventSource.Sequence);
  });

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
    });
    rec.sessionId = id;
    setStatus(rec, "ready", "");

    rec.unlistenData = await listen<TerminalDataEvent>(
      "terminal:data",
      (event) => {
        if (event.payload.session !== id) return;
        const bytes = decodeBase64ToBytes(event.payload.data);
        const text = new TextDecoder().decode(bytes);
        const cap = 4096;
        const nextBuf = rec.outputBuf + text;
        rec.outputBuf =
          nextBuf.length > cap ? nextBuf.slice(nextBuf.length - cap) : nextBuf;
        // Only scan for prompt patterns when the shell has NOT started emitting
        // OSC sequences.  If it does, onTitleChange (above) is already handling
        // the title with higher fidelity (VSCode's Sequence source wins).
        if (rec.awaitingPrompt && !rec.hasSeenOscTitle) {
          const cwd = titleFromTerminalOutput(rec.outputBuf);
          if (cwd) {
            rec.awaitingPrompt = false;
            emitTitle(rec, cwd, TitleEventSource.OutputPrompt);
          }
        }
        rec.term.write(bytes);
      },
    );

    rec.unlistenExit = await listen<TerminalExitEvent>(
      "terminal:exit",
      (event) => {
        if (event.payload.session !== id) return;
        setStatus(rec, "exited", String(event.payload.code ?? 0));
        rec.sessionId = null;
      },
    );

    wireOnData(rec);
  } catch (e) {
    rec.ptyStarted = false;
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

  const term = new Xterm({
    cursorBlink: true,
    fontFamily:
      '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    theme: opts.theme,
    allowProposedApi: true,
    scrollback: 5000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());

  const record: CachedSession = {
    path: opts.path,
    tabId: opts.tabId,
    term,
    fit,
    orphan: createOrphan(),
    sessionId: null,
    inputTracker: new TerminalInputTracker(),
    outputBuf: "",
    lastTitle: null,
    titleSource: null,
    hasSeenOscTitle: false,
    awaitingPrompt: true,
    unlistenData: null,
    unlistenExit: null,
    onDataDispose: null,
    onTitleChangeDispose: null,
    status: "starting",
    statusMsg: "",
    shell: opts.shell,
    opened: false,
    ptyStarted: false,
    lastSentCols: 0,
    lastSentRows: 0,
    subscribers: { status: new Set(), title: new Set() },
  };
  cache.set(k, record);
  // Note: PTY is started lazily from attachSession() AFTER fit.fit() has measured
  // the real terminal size — otherwise TUIs render against the xterm.js default
  // 80x24 and look fragmented.
  return { record, created: true };
}

export function attachSession(rec: CachedSession, container: HTMLElement) {
  if (!rec.opened) {
    rec.term.open(container);
    rec.opened = true;
  } else if (rec.term.element && rec.term.element.parentElement !== container) {
    container.appendChild(rec.term.element);
    try {
      rec.term.refresh(0, Math.max(0, rec.term.rows - 1));
    } catch {
      /* term may not be ready */
    }
  }
  try {
    rec.fit.fit();
  } catch {
    /* container not yet sized */
  }
  if (!rec.ptyStarted) {
    // First attach: now we have a real size — open the PTY against it.
    void openPty(rec, rec.shell);
  } else {
    syncResize(rec);
  }
}

export function syncResize(rec: CachedSession): boolean {
  if (rec.sessionId == null) return false;
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

export function repaintSession(rec: CachedSession) {
  if (rec.sessionId == null) return;
  void invoke("terminal_repaint", { session: rec.sessionId }).catch(() => {});
}

export function detachSession(rec: CachedSession, container: HTMLElement) {
  try {
    const el = rec.term.element;
    if (!el || el.parentElement !== container) return;
    if (rec.orphan.isConnected) {
      rec.orphan.appendChild(el);
    } else {
      el.remove();
    }
  } catch {
    /* term may already be disposed */
  }
}

export function destroySession(path: string, tabId: string) {
  const k = key(path, tabId);
  const rec = cache.get(k);
  if (!rec) return;
  rec.unlistenData?.();
  rec.unlistenExit?.();
  rec.onDataDispose?.dispose();
  rec.onTitleChangeDispose?.dispose();
  const id = rec.sessionId;
  rec.sessionId = null;
  if (id != null) {
    void invoke("terminal_close", { session: id }).catch(() => {});
  }
  try {
    rec.term.dispose();
  } catch {
    /* noop */
  }
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
  rec.unlistenData?.();
  rec.unlistenExit?.();
  rec.onDataDispose?.dispose();
  rec.onTitleChangeDispose?.dispose();
  rec.unlistenData = null;
  rec.unlistenExit = null;
  rec.onDataDispose = null;
  rec.onTitleChangeDispose = null;
  rec.inputTracker = new TerminalInputTracker();
  rec.outputBuf = "";
  rec.awaitingPrompt = true;
  rec.lastTitle = null;
  rec.titleSource = null;
  rec.hasSeenOscTitle = false;
  rec.sessionId = null;
  rec.ptyStarted = false;
  rec.lastSentCols = 0;
  rec.lastSentRows = 0;
  void openPty(rec, shell);
}

export function updateSessionShell(rec: CachedSession, shell: string | null) {
  const normalize = (v: string | null) => (v?.trim() ? v.trim() : null);
  if (normalize(rec.shell) === normalize(shell)) return;
  // Close current PTY and start a new one with the new shell.
  if (rec.sessionId != null) {
    void invoke("terminal_close", { session: rec.sessionId }).catch(() => {});
  }
  reopenSession(rec, shell);
}

export function updateSessionTheme(rec: CachedSession, theme: XtermTheme) {
  rec.term.options.theme = theme;
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
