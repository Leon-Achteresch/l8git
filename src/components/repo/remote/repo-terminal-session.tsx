import {
  TerminalInputTracker,
  titleFromTerminalOutput,
} from "@/lib/terminal-tab-title";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as Xterm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type TerminalDataEvent = { session: number; data: string };
type TerminalExitEvent = { session: number; code: number | null };

type XtermTheme = NonNullable<ConstructorParameters<typeof Xterm>[0]>["theme"];

const DARK_THEME: XtermTheme = {
  background: "#0b0b0d",
  foreground: "#e6e6e6",
  cursor: "#e6e6e6",
  cursorAccent: "#0b0b0d",
  selectionBackground: "#3a3a45",
  black: "#1e1e22",
  red: "#f87171",
  green: "#86efac",
  yellow: "#fcd34d",
  blue: "#93c5fd",
  magenta: "#d8b4fe",
  cyan: "#67e8f9",
  white: "#e6e6e6",
  brightBlack: "#52525b",
  brightRed: "#fca5a5",
  brightGreen: "#bbf7d0",
  brightYellow: "#fde68a",
  brightBlue: "#bfdbfe",
  brightMagenta: "#e9d5ff",
  brightCyan: "#a5f3fc",
  brightWhite: "#ffffff",
};

const LIGHT_THEME: XtermTheme = {
  background: "#ffffff",
  foreground: "#1f2937",
  cursor: "#1f2937",
  cursorAccent: "#ffffff",
  selectionBackground: "#bfdbfe",
  black: "#1f2937",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#f3f4f6",
  brightBlack: "#6b7280",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#111827",
};

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

function currentXtermTheme(): XtermTheme {
  return isDarkMode() ? DARK_THEME : LIGHT_THEME;
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

interface SessionProps {
  path: string;
  tabId: string;
  active: boolean;
  isDark: boolean;
  onExit?: (code: number | null) => void;
  onStatusChange?: (status: SessionStatus, message: string) => void;
  onTitleChange?: (title: string) => void;
}

export type SessionStatus = "starting" | "ready" | "exited" | "error";

export function RepoTerminalSession({
  path,
  tabId,
  active,
  isDark,
  onExit,
  onStatusChange,
  onTitleChange,
}: SessionProps) {
  const { t } = useTranslation();
  const embeddedTerminalCommand = useWorkspacePrefs(
    (s) => s.embeddedTerminalCommand,
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<number | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const inputTrackerRef = useRef(new TerminalInputTracker());
  const outputBufRef = useRef("");
  const lastTitleRef = useRef<string | null>(null);
  const awaitingPromptRef = useRef(false);
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const [status, setStatus] = useState<SessionStatus>("starting");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [reopenTick, setReopenTick] = useState(0);

  useEffect(() => {
    onStatusChange?.(status, statusMsg);
  }, [status, statusMsg, onStatusChange]);

  const pushTitle = (title: string | null) => {
    if (!title || title === lastTitleRef.current) return;
    lastTitleRef.current = title;
    onTitleChangeRef.current?.(title);
  };

  const appendOutput = (chunk: string) => {
    const cap = 4096;
    const next = outputBufRef.current + chunk;
    outputBufRef.current =
      next.length > cap ? next.slice(next.length - cap) : next;
    if (!awaitingPromptRef.current) return;
    const cwd = titleFromTerminalOutput(outputBufRef.current);
    if (cwd) {
      awaitingPromptRef.current = false;
      pushTitle(cwd);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Xterm({
      cursorBlink: true,
      fontFamily:
        '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      theme: currentXtermTheme(),
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    try {
      fit.fit();
    } catch {
      /* size may not be ready */
    }

    inputTrackerRef.current = new TerminalInputTracker();
    outputBufRef.current = "";
    lastTitleRef.current = null;
    awaitingPromptRef.current = true;

    let disposed = false;
    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    const openSession = async () => {
      setStatus("starting");
      setStatusMsg("");
      try {
        const dims = { cols: term.cols, rows: term.rows };
        const id = await invoke<number>("terminal_open", {
          path,
          shell: embeddedTerminalCommand.trim() || null,
          cols: dims.cols,
          rows: dims.rows,
        });
        if (disposed) {
          void invoke("terminal_close", { session: id });
          return;
        }
        sessionRef.current = id;
        setStatus("ready");

        unlistenData = await listen<TerminalDataEvent>(
          "terminal:data",
          (event) => {
            if (event.payload.session !== id) return;
            const bytes = decodeBase64ToBytes(event.payload.data);
            const text = new TextDecoder().decode(bytes);
            appendOutput(text);
            term.write(bytes);
          },
        );

        unlistenExit = await listen<TerminalExitEvent>(
          "terminal:exit",
          (event) => {
            if (event.payload.session !== id) return;
            setStatus("exited");
            setStatusMsg(String(event.payload.code ?? 0));
            sessionRef.current = null;
            onExit?.(event.payload.code);
          },
        );
      } catch (e) {
        if (disposed) return;
        setStatus("error");
        setStatusMsg(String(e));
      }
    };

    void openSession();

    const onData = term.onData((data) => {
      const id = sessionRef.current;
      if (id == null) return;
      const cmdTitle = inputTrackerRef.current.feed(data);
      if (cmdTitle) {
        awaitingPromptRef.current = true;
        pushTitle(cmdTitle);
      }
      const bytes = new TextEncoder().encode(data);
      const encoded = encodeBytesToBase64(bytes);
      void invoke("terminal_write", { session: id, data: encoded }).catch(
        () => {},
      );
    });

    const applyResize = () => {
      if (!fitRef.current || !termRef.current) return;
      try {
        fitRef.current.fit();
      } catch {
        return;
      }
      const id = sessionRef.current;
      if (id != null) {
        void invoke("terminal_resize", {
          session: id,
          cols: termRef.current.cols,
          rows: termRef.current.rows,
        }).catch(() => {});
      }
    };

    const ro = new ResizeObserver(() => applyResize());
    ro.observe(containerRef.current);
    resizeObsRef.current = ro;

    return () => {
      disposed = true;
      onData.dispose();
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      unlistenData?.();
      unlistenExit?.();
      const id = sessionRef.current;
      sessionRef.current = null;
      if (id != null) {
        void invoke("terminal_close", { session: id }).catch(() => {});
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [path, embeddedTerminalCommand, reopenTick, tabId]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = currentXtermTheme();
    }
  }, [isDark]);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* noop */
      }
      termRef.current?.focus();
      const id = sessionRef.current;
      if (id != null && termRef.current) {
        void invoke("terminal_resize", {
          session: id,
          cols: termRef.current.cols,
          rows: termRef.current.rows,
        }).catch(() => {});
      }
    });
  }, [active]);

  const bg = isDark ? "#0b0b0d" : "#ffffff";

  return (
    <div
      className="absolute inset-0 flex min-h-0 flex-col"
      style={{ backgroundColor: bg, display: active ? "flex" : "none" }}
    >
      {status === "error" && (
        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1 text-xs text-destructive">
          {t("embeddedTerminal.failed", { error: statusMsg })}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setReopenTick((n) => n + 1)}
          >
            {t("embeddedTerminal.reopen")}
          </button>
        </div>
      )}
      {status === "exited" && (
        <div className="shrink-0 border-b border-border/50 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          {t("embeddedTerminal.exited", { code: statusMsg })}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setReopenTick((n) => n + 1)}
          >
            {t("embeddedTerminal.reopen")}
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden px-2 py-1"
        onClick={() => termRef.current?.focus()}
      />
    </div>
  );
}
