// Shared between the transcript's React components and the highlighting
// worker. Kept free of DOM and React imports so the worker bundle does not
// pull either in.

export type AgentCodeLanguage = string;

export interface AgentCodeToken {
  content: string;
  offset: number;
  light?: string;
  dark?: string;
}

export type AgentCodeTokenLines = AgentCodeToken[][];

export const AGENT_CODE_LIGHT_THEME = "github-light-high-contrast";
export const AGENT_CODE_DARK_THEME = "github-dark-high-contrast";
export const AGENT_CODE_LANGS = ["bash", "diff", "json", "tsx", "typescript"] as const;

const EXTENSION_LANGUAGES: Record<string, string> = {
  astro: "astro",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cxx: "cpp",
  dart: "dart",
  elm: "elm",
  ex: "elixir",
  exs: "elixir",
  fish: "fish",
  go: "go",
  gradle: "groovy",
  graphql: "graphql",
  h: "c",
  hpp: "cpp",
  hs: "haskell",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  json5: "json5",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mts: "typescript",
  nix: "nix",
  php: "php",
  pl: "perl",
  prisma: "prisma",
  ps1: "powershell",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  sass: "sass",
  scala: "scala",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  tf: "terraform",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "bash",
};

const FILENAME_LANGUAGES: Record<string, string> = {
  ".bashrc": "bash",
  ".gitignore": "ini",
  ".zshrc": "bash",
  dockerfile: "docker",
  makefile: "make",
};

/** Shiki grammar id for a repo-relative path, or "text" when nothing fits. */
export function languageFromPath(path: string | null | undefined): AgentCodeLanguage {
  if (!path) return "text";
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const byName = FILENAME_LANGUAGES[name];
  if (byName) return byName;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "text";
  return EXTENSION_LANGUAGES[name.slice(dot + 1)] ?? "text";
}
