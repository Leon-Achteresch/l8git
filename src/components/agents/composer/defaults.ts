import {
  FileText,
  FolderCode,
  Gauge,
  GitBranch,
  ListChecks,
  Paperclip,
  Presentation,
  ShieldCheck,
  Sheet,
  Target,
} from "lucide-react";

import type {
  ComposerAction,
  ComposerModel,
  ComposerPermission,
  ComposerProvider,
} from "./types";

export const DEFAULT_PROVIDERS: ComposerProvider[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
  { id: "meta", label: "Meta" },
  { id: "mistral", label: "Mistral" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "xai", label: "xAI" },
];

export const DEFAULT_MODELS: ComposerModel[] = [
  { id: "opus-5", label: "Opus 5", providerId: "anthropic", efforts: ["Low", "Medium", "High"] },
  { id: "sonnet-5", label: "Sonnet 5", providerId: "anthropic", efforts: ["Low", "Medium", "High"] },
  { id: "haiku-4-5", label: "Haiku 4.5", providerId: "anthropic" },
  { id: "gpt-5-1", label: "GPT-5.1", providerId: "openai", efforts: ["Low", "Medium", "High"] },
  { id: "gemini-3", label: "Gemini 3 Pro", providerId: "google" },
];

export const DEFAULT_PERMISSIONS: ComposerPermission[] = [
  { id: "auto", label: "Auto", hint: "Agent decides by itself", icon: Gauge },
  { id: "manual", label: "Manual", hint: "Always ask before making a change", icon: GitBranch },
  { id: "plan", label: "Plan mode", hint: "Create a plan before proceeding", icon: ListChecks },
  { id: "bypass", label: "Bypass all", hint: "Agent handles permission decisions", icon: ShieldCheck },
];

export const DEFAULT_ACTIONS: ComposerAction[] = [
  { id: "files", label: "Files and folders", icon: Paperclip, group: "Add" },
  { id: "goal", label: "Goal", hint: "Set a goal for faster results", icon: Target, group: "Add" },
  { id: "plan", label: "Plan mode", hint: "Manage complex tasks", icon: ListChecks, group: "Add" },
  { id: "documents", label: "Documents", hint: "Create and edit documents", icon: FileText, group: "Plugins" },
  { id: "spreadsheets", label: "Spreadsheets", hint: "Generate spreadsheets", icon: Sheet, group: "Plugins" },
  { id: "presentations", label: "Presentations", hint: "Create marketing assets", icon: Presentation, group: "Plugins" },
  { id: "code", label: "Code blocks", hint: "Write and edit existing code", icon: FolderCode, group: "Plugins" },
];
