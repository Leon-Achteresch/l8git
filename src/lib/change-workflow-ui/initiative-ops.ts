import { formatBackendError } from '@/lib/backend-error';
import { transitionInitiative, type ChangeInitiative, type InitiativeStep } from "@/lib/change-workflow/model";
import type { AgentReviewInvoke } from "@/lib/agents/agent-review";
import { invoke } from "@/lib/platform/ipc";

export type ProviderPr = { number: number; state: string; html_url: string; head_sha: string; source_branch: string };
export type MergeMethod = "merge" | "squash" | "rebase";

/** GitHub `/pull/N`, GitLab `/-/merge_requests/N` and Bitbucket `/pull-requests/N` all end in the number. */
export function prNumberFromUrl(url: string | undefined): number | null {
  const n = Number(url?.match(/\/(\d+)\/?$/)?.[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function providerPr(step: InitiativeStep, transport: AgentReviewInvoke): Promise<ProviderPr> {
  const number = prNumberFromUrl(step.pullRequestUrl);
  if (!number) throw new Error("This step has no pull request to operate on.");
  const pr = await transport<ProviderPr>("pr_detail", { path: step.repository, number });
  if (pr.html_url !== step.pullRequestUrl) throw new Error(`Provider returned a different pull request (${pr.html_url}).`);
  return pr;
}

function mergedAtPin(step: InitiativeStep, pr: ProviderPr): boolean {
  if (pr.state !== "merged") return false;
  if (pr.head_sha !== step.headSha) throw new Error(`Merged at ${pr.head_sha.slice(0, 10)}, not the pinned head ${step.headSha.slice(0, 10)}.`);
  return true;
}

function finish(initiative: ChangeInitiative, id: string, error: unknown | null): ChangeInitiative {
  return error === null
    ? transitionInitiative(initiative, id, "done")
    : transitionInitiative(initiative, id, "failed", formatBackendError(error));
}

/**
 * Merges one step's PR through the provider, conditioned on the pinned head (`expectedHeadSha`;
 * providers that cannot enforce it refuse). Only a provider read-back of `merged` at the
 * pinned head completes the step; every other outcome fails it and stays resumable.
 * `save` is called after each transition so an interruption leaves a `running` step to refresh.
 */
export async function mergeStep(initiative: ChangeInitiative, id: string, method: MergeMethod, save: (i: ChangeInitiative) => void, transport: AgentReviewInvoke = invoke): Promise<ChangeInitiative> {
  const running = transitionInitiative(initiative, id, "running");
  save(running);
  const step = running.steps.find((s) => s.id === id)!;
  let next: ChangeInitiative;
  try {
    const pr = await providerPr(step, transport);
    if (!mergedAtPin(step, pr)) {
      if (pr.state !== "open") throw new Error(`Pull request is ${pr.state}.`);
      if (pr.head_sha !== step.headSha) throw new Error(`Head moved to ${pr.head_sha.slice(0, 10)} since it was pinned at ${step.headSha.slice(0, 10)}.`);
      const result = await transport<{ merged: boolean; message: string | null }>("pr_merge", {
        // The provider rejects the merge server-side if the head is no longer the pinned SHA.
        path: step.repository, number: pr.number, strategy: method, message: null, deleteSourceBranch: false, expectedHeadSha: step.headSha,
      });
      const after = await providerPr(step, transport);
      if (!mergedAtPin(step, after)) throw new Error(result.message || `Provider reports the pull request as ${after.state}.`);
    }
    next = finish(running, id, null);
  } catch (e) {
    next = finish(running, id, e);
  }
  save(next);
  return next;
}

/** Resolves a step left `running` (e.g. app closed mid-merge) from the provider's current state. */
export async function resolveRunningStep(initiative: ChangeInitiative, id: string, transport: AgentReviewInvoke = invoke): Promise<ChangeInitiative> {
  const step = initiative.steps.find((s) => s.id === id);
  if (step?.status !== "running") return initiative;
  try {
    const pr = await providerPr(step, transport);
    return finish(initiative, id, mergedAtPin(step, pr) ? null : new Error(`Interrupted; provider reports the pull request as ${pr.state}.`));
  } catch (e) {
    return finish(initiative, id, e);
  }
}
