import type { ITheme } from "@xterm/xterm";

const DARK_BG = "#111114";
const LIGHT_BG = "#faf8f4";

const DARK_THEME: ITheme = {
  background: DARK_BG,
  foreground: "#eceae6",
  cursor: "#eceae6",
  cursorAccent: DARK_BG,
  selectionBackground: "#3a3a42",
  black: "#1a1a1f",
  red: "#f87171",
  green: "#86efac",
  yellow: "#fcd34d",
  blue: "#93c5fd",
  magenta: "#d8b4fe",
  cyan: "#67e8f9",
  white: "#eceae6",
  brightBlack: "#71717a",
  brightRed: "#fca5a5",
  brightGreen: "#bbf7d0",
  brightYellow: "#fde68a",
  brightBlue: "#bfdbfe",
  brightMagenta: "#e9d5ff",
  brightCyan: "#a5f3fc",
  brightWhite: "#fafaf9",
};

const LIGHT_THEME: ITheme = {
  background: LIGHT_BG,
  foreground: "#1a1714",
  cursor: "#1a1714",
  cursorAccent: LIGHT_BG,
  selectionBackground: "#ddd6cc",
  black: "#1a1714",
  red: "#b91c1c",
  green: "#15803d",
  yellow: "#a16207",
  blue: "#1d4ed8",
  magenta: "#7e22ce",
  cyan: "#0e7490",
  white: "#44403c",
  brightBlack: "#78716c",
  brightRed: "#dc2626",
  brightGreen: "#16a34a",
  brightYellow: "#ca8a04",
  brightBlue: "#2563eb",
  brightMagenta: "#9333ea",
  brightCyan: "#0891b2",
  brightWhite: "#0c0a09",
};

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function buildTerminalTheme(): ITheme {
  return isDarkMode() ? DARK_THEME : LIGHT_THEME;
}

export function terminalBackground(): string {
  return isDarkMode() ? DARK_BG : LIGHT_BG;
}

export function toOscRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `rgb:${r}${r}/${g}${g}/${b}${b}`;
}
