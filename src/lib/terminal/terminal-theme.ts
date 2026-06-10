import type { ITheme } from "@xterm/xterm";

const DARK_THEME: ITheme = {
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

const LIGHT_THEME: ITheme = {
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

export function buildTerminalTheme(): ITheme {
  return isDarkMode() ? DARK_THEME : LIGHT_THEME;
}

export function terminalBackground(): string {
  return isDarkMode() ? "#0b0b0d" : "#ffffff";
}
