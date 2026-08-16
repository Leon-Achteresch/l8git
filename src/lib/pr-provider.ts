export type MergeStrategy = "merge" | "squash" | "rebase";

export type ProviderCapabilities = {
  provider: string;
  label: string;
  host: string;
  can_approve: boolean;
  can_request_changes: boolean;
  can_auto_merge: boolean;
  can_draft: boolean;
  can_delete_source_branch: boolean;
  can_rerun_checks: boolean;
  can_workflows: boolean;
  can_inline_comments: boolean;
  can_draft_reviews: boolean;
  can_resolve_threads: boolean;
  merge_strategies: MergeStrategy[];
};

export const PROVIDER_UNKNOWN_CODE = "__PROVIDER_UNKNOWN__";

export const ALL_MERGE_STRATEGIES: MergeStrategy[] = [
  "merge",
  "squash",
  "rebase",
];

export function providerUnknownHost(message: string): string | null {
  const marker = `${PROVIDER_UNKNOWN_CODE}|`;
  const idx = message.indexOf(marker);
  if (idx < 0) return null;
  return message.slice(idx + marker.length).trim();
}

export function pickMergeStrategy(
  wanted: MergeStrategy,
  allowed: MergeStrategy[],
): MergeStrategy {
  if (allowed.length === 0) return wanted;
  return allowed.includes(wanted) ? wanted : allowed[0];
}
