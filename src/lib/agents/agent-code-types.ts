// Shared between the transcript's React components and the highlighting
// worker. Kept free of DOM and React imports so the worker bundle does not
// pull either in.

export type AgentCodeLanguage =
  | "bash"
  | "diff"
  | "json"
  | "text"
  | "tsx"
  | "typescript";

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
