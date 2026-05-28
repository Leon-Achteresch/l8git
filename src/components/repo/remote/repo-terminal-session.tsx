import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { Terminal as Xterm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type CachedSession,
  type SessionStatus,
  attachSession,
  detachSession,
  getOrCreateSession,
  reopenSession,
  repaintSession,
  setSessionOutputPaused,
  subscribeStatus,
  subscribeTitle,
  syncResize,
  updateSessionShell,
  updateSessionTheme,
} from "@/lib/terminal-session-cache";

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

export type { SessionStatus };

interface SessionProps {
  path: string;
  tabId: string;
  active: boolean;
  isDark: boolean;
  onTitleChange?: (title: string) => void;
}

export function RepoTerminalSession({
  path,
  tabId,
  active,
  isDark,
  onTitleChange,
}: SessionProps) {
  const { t } = useTranslation();
  const embeddedTerminalCommand = useWorkspacePrefs(
    (s) => s.embeddedTerminalCommand,
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const recordRef = useRef<CachedSession | null>(null);
  const shellRef = useRef(embeddedTerminalCommand);
  shellRef.current = embeddedTerminalCommand;

  const [status, setStatus] = useState<SessionStatus>("starting");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { record } = getOrCreateSession({
      path,
      tabId,
      theme: currentXtermTheme(),
      shell: shellRef.current,
    });
    recordRef.current = record;

    attachSession(record, container);

    setStatus(record.status);
    setStatusMsg(record.statusMsg);
    if (record.lastTitle) onTitleChangeRef.current?.(record.lastTitle);

    const unsubStatus = subscribeStatus(record, (s, m) => {
      setStatus(s);
      setStatusMsg(m);
    });
    const unsubTitle = subscribeTitle(record, (title) => {
      onTitleChangeRef.current?.(title);
    });

    let resizeRaf: number | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeRaf != null) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        try {
          record.fit.fit();
        } catch {
          return;
        }
        const changed = syncResize(record);
        // If the running program is a TUI it may have rendered the initial
        // layout against a stale size — nudge it to redraw fully.
        if (changed) repaintSession(record);
      });
    });
    ro.observe(container);

    return () => {
      if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      unsubStatus();
      unsubTitle();
      detachSession(record, container);
    };
  }, [path, tabId]);

  useEffect(() => {
    const rec = recordRef.current;
    if (!rec) return;
    updateSessionShell(rec, embeddedTerminalCommand);
  }, [embeddedTerminalCommand]);

  useEffect(() => {
    const rec = recordRef.current;
    if (rec) updateSessionTheme(rec, currentXtermTheme());
  }, [isDark]);

  useEffect(() => {
    const rec = recordRef.current;
    const container = containerRef.current;
    if (!rec || !container) return;

    if (!active) {
      setSessionOutputPaused(rec, true, container);
      return;
    }

    setSessionOutputPaused(rec, false);
    attachSession(rec, container);

    const raf = requestAnimationFrame(() => {
      try {
        rec.fit.fit();
      } catch {
        return;
      }
      rec.term.focus();
      const changed = syncResize(rec);
      if (changed) repaintSession(rec);
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const handleReopen = () => {
    const rec = recordRef.current;
    if (!rec) return;
    reopenSession(rec, shellRef.current);
  };

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
            onClick={handleReopen}
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
            onClick={handleReopen}
          >
            {t("embeddedTerminal.reopen")}
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden px-2 py-1"
        onClick={() => recordRef.current?.term.focus()}
      />
    </div>
  );
}
