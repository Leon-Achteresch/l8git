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
import { useTerminalStore } from "@/lib/terminal-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { TerminalSessionStatus } from "./terminal-session-status";

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
  const tabCommand = useTerminalStore(
    (s) => s.tabsByPath[path]?.find((tab) => tab.id === tabId)?.command,
  );
  const sessionShell = tabCommand ?? embeddedTerminalCommand;

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
    shell: sessionShell,
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
    updateSessionShell(leafId, sessionShell);
  }, [leafId, sessionShell]);

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
      <TerminalSessionStatus
        status={status}
        label={
          status === "error"
            ? t("embeddedTerminal.failed", { error: statusMsg })
            : t("embeddedTerminal.exited", { code: statusMsg })
        }
        reopenLabel={t("embeddedTerminal.reopen")}
        onReopen={handleReopen}
      />
      <div
        ref={containerRef}
        className="terminal-viewport min-h-0 flex-1 overflow-hidden"
        onClick={() => session.focus()}
      />
    </div>
  );
}
