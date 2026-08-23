import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  AI_FEATURES,
  defaultPromptTemplate,
  isAiFeature,
  type AiFeature,
} from "@/lib/ai/prompts";

export type AiPromptOverrides = Partial<Record<AiFeature, string>>;

export const LEGACY_COMMIT_PREFS_KEY = "l8git-commit-prefs";

export interface AiPromptPrefsSnapshot {
  overrides: AiPromptOverrides;
  repoOverrides: Record<string, string>;
  migratedLegacyCommitPrompt: boolean;
}

type AiPromptPrefsState = AiPromptPrefsSnapshot & {
  setTemplate: (feature: AiFeature, value: string) => void;
  resetTemplate: (feature: AiFeature) => void;
  resetAll: () => void;
  setRepoCommitTemplate: (repoPath: string, value: string | undefined) => void;
};

export function sanitizePromptOverrides(input: unknown): AiPromptOverrides {
  if (!input || typeof input !== "object") return {};
  const out: AiPromptOverrides = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isAiFeature(key)) continue;
    if (typeof value !== "string" || value.trim().length === 0) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeRepoOverrides(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string" || value.trim().length === 0) continue;
    out[key] = value;
  }
  return out;
}

export function migratePromptPrefs(
  persisted: unknown,
  legacyCommitTemplate: string | undefined,
): AiPromptPrefsSnapshot {
  const record = (persisted ?? {}) as Record<string, unknown>;
  const overrides = sanitizePromptOverrides(record.overrides);
  const repoOverrides = sanitizeRepoOverrides(record.repoOverrides);
  const alreadyMigrated = record.migratedLegacyCommitPrompt === true;

  if (!alreadyMigrated && !overrides.commitMessage && legacyCommitTemplate?.trim()) {
    overrides.commitMessage = legacyCommitTemplate;
  }

  return { overrides, repoOverrides, migratedLegacyCommitPrompt: true };
}

export function readLegacyCommitPromptTemplate(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(LEGACY_COMMIT_PREFS_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { state?: { aiPromptTemplate?: unknown } };
    const value = parsed.state?.aiPromptTemplate;
    return typeof value === "string" && value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

export const useAiPromptPrefs = create<AiPromptPrefsState>()(
  persist(
    (set) => ({
      overrides: {},
      repoOverrides: {},
      migratedLegacyCommitPrompt: false,
      setTemplate: (feature, value) =>
        set((s) => {
          if (!value.trim() || value === defaultPromptTemplate(feature)) {
            const { [feature]: _removed, ...rest } = s.overrides;
            return { overrides: rest };
          }
          return { overrides: { ...s.overrides, [feature]: value } };
        }),
      resetTemplate: (feature) =>
        set((s) => {
          const { [feature]: _removed, ...rest } = s.overrides;
          return { overrides: rest };
        }),
      resetAll: () => set({ overrides: {} }),
      setRepoCommitTemplate: (repoPath, value) =>
        set((s) => {
          if (!value?.trim()) {
            const { [repoPath]: _removed, ...rest } = s.repoOverrides;
            return { repoOverrides: rest };
          }
          return { repoOverrides: { ...s.repoOverrides, [repoPath]: value } };
        }),
    }),
    {
      name: "l8git-ai-prompt-prefs",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        overrides: s.overrides,
        repoOverrides: s.repoOverrides,
        migratedLegacyCommitPrompt: s.migratedLegacyCommitPrompt,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...migratePromptPrefs(persisted, readLegacyCommitPromptTemplate()),
      }),
    },
  ),
);

export function getPromptTemplate(
  feature: AiFeature,
  options: { repoPath?: string } = {},
): string {
  const { overrides, repoOverrides } = useAiPromptPrefs.getState();
  if (feature === "commitMessage" && options.repoPath) {
    const repoValue = repoOverrides[options.repoPath];
    if (repoValue?.trim()) return repoValue;
  }
  const value = overrides[feature];
  return value?.trim() ? value : defaultPromptTemplate(feature);
}

export function isPromptOverridden(feature: AiFeature): boolean {
  return !!useAiPromptPrefs.getState().overrides[feature]?.trim();
}

export function usePromptTemplate(feature: AiFeature): string {
  const override = useAiPromptPrefs((s) => s.overrides[feature]);
  return override?.trim() ? override : defaultPromptTemplate(feature);
}

export function overriddenFeatures(overrides: AiPromptOverrides): AiFeature[] {
  return AI_FEATURES.filter((feature) => !!overrides[feature]?.trim());
}
