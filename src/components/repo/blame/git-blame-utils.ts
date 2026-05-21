import type * as Monaco from "monaco-editor";

const EXT_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript",
  rs: "rust", py: "python", go: "go",
  java: "java", kt: "kotlin", swift: "swift",
  c: "c", cpp: "cpp", h: "cpp", cs: "csharp",
  css: "css", scss: "scss", less: "less",
  html: "html", xml: "xml",
  json: "json", jsonc: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml", md: "markdown",
  sh: "shell", bash: "shell",
  sql: "sql", graphql: "graphql",
  proto: "protobuf", dart: "dart",
  lua: "lua", vue: "html", svelte: "html",
  php: "php", tf: "hcl", rb: "ruby",
};

export function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

export function nameToHsl(name: string): string {
  let n = 0;
  for (let i = 0; i < name.length; i++) {
    n = ((n * 31 + name.charCodeAt(i)) | 0) >>> 0;
  }
  return `hsl(${n % 360}, 55%, 42%)`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

export function formatRelative(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
}

export function formatFullDate(ts: number, locale: string): string {
  return new Date(ts * 1000).toLocaleDateString(locale, {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export const LINE_HEIGHT = 22;

export const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
  fontSize: 13,
  lineHeight: LINE_HEIGHT,
  renderLineHighlight: "line",
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  folding: false,
  lineNumbers: "on",
  lineDecorationsWidth: 0,
  glyphMargin: false,
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    useShadows: false,
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
  },
  wordWrap: "off",
  automaticLayout: true,
  contextmenu: false,
  cursorStyle: "line",
  renderWhitespace: "none",
  guides: { indentation: false, bracketPairs: false },
  padding: { top: 0, bottom: 0 },
};
