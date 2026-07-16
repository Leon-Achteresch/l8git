import type { IMarker, Terminal } from "@xterm/xterm";

import {
  buildTerminalTheme,
  toOscRgb,
} from "./terminal-theme";

export type ShellIntegrationState = {
  inCommand: boolean;
};

export function createShellIntegrationState(): ShellIntegrationState {
  return { inCommand: false };
}

export function registerCwdHandler(
  term: Terminal,
  onCwd: (cwd: string) => void,
  state?: ShellIntegrationState,
): () => void {
  const d = term.parser.registerOscHandler(7, (data) => {
    if (state?.inCommand) return true;
    const cwd = parseOsc7(data);
    if (cwd) onCwd(cwd);
    return true;
  });
  return () => d.dispose();
}

export function registerColorQueryHandlers(
  term: Terminal,
  writeToPty: (data: string) => void,
): () => void {
  const reply = (code: number, hex: string) => {
    writeToPty(`\x1b]${code};${toOscRgb(hex)}\x1b\\`);
  };

  const fg = term.parser.registerOscHandler(10, (data) => {
    if (data === "?" || data.startsWith("?")) {
      const theme = buildTerminalTheme();
      reply(10, theme.foreground ?? "#eceae6");
    }
    return true;
  });
  const bg = term.parser.registerOscHandler(11, (data) => {
    if (data === "?" || data.startsWith("?")) {
      const theme = buildTerminalTheme();
      reply(11, theme.background ?? "#111114");
    }
    return true;
  });
  const cursor = term.parser.registerOscHandler(12, (data) => {
    if (data === "?" || data.startsWith("?")) {
      const theme = buildTerminalTheme();
      reply(12, theme.cursor ?? theme.foreground ?? "#eceae6");
    }
    return true;
  });

  return () => {
    fg.dispose();
    bg.dispose();
    cursor.dispose();
  };
}

export type PromptTracker = {
  getMarker: () => IMarker | null;
  dispose: () => void;
};

export function registerPromptTracker(
  term: Terminal,
  state?: ShellIntegrationState,
  onCommand?: (cmd: string) => void,
): PromptTracker {
  let marker: IMarker | null = null;
  const d = term.parser.registerOscHandler(133, (data) => {
    if (data.startsWith("A")) {
      if (state) state.inCommand = false;
      marker?.dispose();
      marker = term.registerMarker(0);
    } else if (data.startsWith("B")) {
      if (state) state.inCommand = true;
    } else if (data.startsWith("C")) {
      if (state) state.inCommand = true;
      if (onCommand && data.startsWith("C;")) {
        const cmd = data.slice(2);
        if (cmd.trim()) onCommand(cmd);
      }
    } else if (data.startsWith("D")) {
      if (state) state.inCommand = false;
    }
    return true;
  });
  return {
    getMarker: () => (marker && !marker.isDisposed ? marker : null),
    dispose: () => {
      d.dispose();
      marker?.dispose();
      marker = null;
    },
  };
}

function parseOsc7(data: string): string | null {
  const m = data.match(/^file:\/\/[^/]*(\/.*)$/);
  if (!m) return null;
  let path = m[1];
  try {
    path = decodeURIComponent(path);
  } catch {
    void 0;
  }
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  return path;
}
