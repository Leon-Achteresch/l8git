export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "l8git.theme";

export function getStoredTheme(): Theme {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function setStoredTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  void syncWindowBackground(resolved).catch(() => {});
}

const WINDOW_BG = { light: [250, 250, 250, 255], dark: [17, 17, 20, 255] } as const;

async function syncWindowBackground(resolved: "light" | "dark") {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setBackgroundColor([...WINDOW_BG[resolved]]);
}
