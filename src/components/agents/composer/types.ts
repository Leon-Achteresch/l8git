import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export type ComposerProvider = {
  id: string;
  label: string;
  Icon?: ComponentType<{ className?: string }>;
};

export type ComposerModel = {
  id: string;
  label: string;
  providerId?: string;
  hint?: string;
  efforts?: string[];
};

export type ComposerOption = {
  id: string;
  name: string;
  description?: string;
  type: "select" | "boolean";
  value: string | boolean;
  choices: Array<{ value: string; label: string; description?: string }>;
};

export type ComposerPermission = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export type ComposerAction = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group?: string;
  onSelect?: () => void;
};

export type ComposerContext = {
  branch?: string;
  project?: string;
  usedPercent?: number;
  usedTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export type ComposerValue = {
  text: string;
  modelId: string;
  effort?: string;
  permissionId: string;
};
