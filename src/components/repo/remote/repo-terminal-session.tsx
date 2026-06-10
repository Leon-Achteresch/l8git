import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "@xterm/xterm/css/xterm.css";

import { cwdTabTitle } from "@/lib/terminal-tab-title";
import { isDarkMode, terminalBackground } from "@/lib/terminal/terminal-theme";
import {
  respawnSession,
  terminalLeafId,
  updateSessionShell,
  useTerminalSession,
} from "@/lib/terminal/use-terminal-session";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";

export { isDarkMode };

type SessionStatus = "ready" | "exited" | "error";

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

  const leafId = terminalLeafId(path, tabId);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<SessionStatus>("ready");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;

  const session = useTerminalSession({
    leafId,
    container: containerRef,
    visible: active,
    focused: active,
    initialCwd: path,
    shell: embeddedTerminalCommand,
    onExit: (code) => {
      setStatus("exited");
      setStatusMsg(String(code));
    },
    onError: (message) => {
      setStatus("error");
      setStatusMsg(message);
    },
    onCwd: (cwd) => {
      const title = cwdTabTitle(cwd);
      if (title) onTitleChangeRef.current?.(title);
    },
  });

  useEffect(() => {
    updateSessionShell(leafId, embeddedTerminalCommand);
  }, [leafId, embeddedTerminalCommand]);

  useEffect(() => {
    const id = requestAnimationFrame(() => session.applyTheme());
    return () => cancelAnimationFrame(id);
  }, [isDark, session]);

  const handleReopen = () => {
    setStatus("ready");
    setStatusMsg("");
    void respawnSession(leafId);
  };

  return (
    <div
      className="absolute inset-0 flex min-h-0 flex-col"
      style={{
        backgroundColor: terminalBackground(),
        display: active ? "flex" : "none",
      }}
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
        onClick={() => session.focus()}
      />
    </div>
  );
}
