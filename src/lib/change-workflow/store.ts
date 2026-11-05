import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { platformStorage } from "@/lib/platform/kv";
import { planInitiative, type AgentEvidence, type ChangeInitiative, type ReviewNarrative } from "./model";

function key(scope: string, id: string): string {
  return JSON.stringify([scope, id]);
}

interface ChangeWorkflowState {
  narratives: Record<string, ReviewNarrative>;
  evidence: Record<string, AgentEvidence>;
  initiatives: Record<string, ChangeInitiative>;
  saveNarrative: (narrative: ReviewNarrative) => void;
  removeNarrative: (scope: string, id: string) => void;
  recordEvidence: (evidence: AgentEvidence) => void;
  removeEvidence: (scope: string, id: string) => void;
  saveInitiative: (initiative: ChangeInitiative) => void;
  removeInitiative: (scope: string, id: string) => void;
}

export const changeWorkflowKey = key;

export const useChangeWorkflow = create<ChangeWorkflowState>()(persist((set) => ({
  narratives: {},
  evidence: {},
  initiatives: {},
  saveNarrative: (narrative) => {
    if (new Set(narrative.chapters.map(chapter => chapter.id)).size !== narrative.chapters.length) throw new Error("Duplicate chapter ID");
    set(state => ({ narratives: { ...state.narratives, [key(narrative.scope, narrative.id)]: structuredClone(narrative) } }));
  },
  removeNarrative: (scope, id) => set(state => {
    const narratives = { ...state.narratives };
    delete narratives[key(scope, id)];
    return { narratives };
  }),
  recordEvidence: (evidence) => set(state => ({ evidence: { ...state.evidence, [key(evidence.scope, evidence.id)]: structuredClone(evidence) } })),
  removeEvidence: (scope, id) => set(state => {
    const evidence = { ...state.evidence };
    delete evidence[key(scope, id)];
    return { evidence };
  }),
  saveInitiative: (initiative) => {
    planInitiative(initiative);
    set(state => ({ initiatives: { ...state.initiatives, [key(initiative.scope, initiative.id)]: structuredClone(initiative) } }));
  },
  removeInitiative: (scope, id) => set(state => {
    const initiatives = { ...state.initiatives };
    delete initiatives[key(scope, id)];
    return { initiatives };
  }),
}), {
  name: "l8git-change-workflow-v1",
  storage: createJSONStorage(() => platformStorage),
  partialize: state => ({ narratives: state.narratives, evidence: state.evidence, initiatives: state.initiatives }),
}));
