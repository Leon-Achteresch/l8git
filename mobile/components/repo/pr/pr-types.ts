export type MergeStrategy = 'merge' | 'squash' | 'rebase';

export const ALL_MERGE_STRATEGIES: readonly MergeStrategy[] = ['merge', 'squash', 'rebase'];

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

export type PrReviewer = {
  login: string;
  avatar: string | null;
};

export type PullRequest = {
  number: number;
  title: string;
  state: string;
  is_draft: boolean;
  author: string;
  author_avatar: string | null;
  source_branch: string;
  target_branch: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  reviewers: PrReviewer[];
  provider: string;
  node_id?: string | null;
};

export type PullRequestDetail = PullRequest & {
  body_markdown: string;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
  head_sha: string;
  auto_merge_method?: string | null;
};

export type PrComment = {
  id: string;
  author: string;
  author_avatar: string | null;
  created_at: string;
  body: string;
  kind: string;
  file_path: string | null;
  line: number | null;
  in_reply_to?: string | null;
  thread_id?: string | null;
};

export type PrReview = {
  id: string;
  author: string;
  author_avatar: string | null;
  state: string;
  submitted_at: string;
  body: string;
};

export type PrConversation = {
  comments: PrComment[];
  reviews: PrReview[];
};

export type PrMergeResult = {
  sha: string | null;
  merged: boolean;
  message: string | null;
};

export type PrCheckoutResult = {
  branch: string;
};

export type BranchProtection = {
  required_status_checks: string[];
  required_approving_review_count: number | null;
  dismiss_stale_reviews: boolean;
  require_code_owner_reviews: boolean;
  enforce_admins: boolean;
  allow_force_pushes: boolean;
  allow_deletions: boolean;
};

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export const PROVIDER_UNKNOWN_CODE = '__PROVIDER_UNKNOWN__';

export function providerUnknownHost(message: string): string | null {
  const marker = `${PROVIDER_UNKNOWN_CODE}|`;
  const index = message.indexOf(marker);
  if (index < 0) {
    return null;
  }
  return message.slice(index + marker.length).trim();
}

export function pickMergeStrategy(
  wanted: MergeStrategy,
  allowed: readonly MergeStrategy[]
): MergeStrategy {
  if (allowed.length === 0) {
    return wanted;
  }
  return allowed.includes(wanted) ? wanted : allowed[0];
}

export const MERGE_STRATEGY_LABEL: Record<MergeStrategy, string> = {
  merge: 'Create a merge commit',
  squash: 'Squash and merge',
  rebase: 'Rebase and merge',
};

export type PrDisplayState = 'open' | 'draft' | 'merged' | 'closed';

export function prDisplayState(pr: Pick<PullRequest, 'state' | 'is_draft'>): PrDisplayState {
  if (pr.state === 'merged') {
    return 'merged';
  }
  if (pr.state === 'closed') {
    return 'closed';
  }
  if (pr.state === 'draft' || pr.is_draft) {
    return 'draft';
  }
  return 'open';
}

export function isPrActive(pr: Pick<PullRequest, 'state' | 'is_draft'>): boolean {
  const state = prDisplayState(pr);
  return state === 'open' || state === 'draft';
}

export const PR_FILTERS = ['open', 'merged', 'closed', 'all'] as const;

export type PrFilter = (typeof PR_FILTERS)[number];

export const PR_FILTER_LABEL: Record<PrFilter, string> = {
  open: 'Open',
  merged: 'Merged',
  closed: 'Closed',
  all: 'All',
};

export function matchesPrFilter(pr: PullRequest, filter: PrFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  const state = prDisplayState(pr);
  if (filter === 'open') {
    return state === 'open' || state === 'draft';
  }
  return state === filter;
}

export function countPrFilters(prs: readonly PullRequest[]): Record<PrFilter, number> {
  const counts: Record<PrFilter, number> = { open: 0, merged: 0, closed: 0, all: prs.length };
  for (const pr of prs) {
    const state = prDisplayState(pr);
    if (state === 'open' || state === 'draft') {
      counts.open += 1;
    } else if (state === 'merged') {
      counts.merged += 1;
    } else {
      counts.closed += 1;
    }
  }
  return counts;
}

export const REVIEW_STATE_LABEL: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  DISMISSED: 'review dismissed',
  PENDING: 'pending review',
};

export function reviewStateLabel(state: string): string {
  return REVIEW_STATE_LABEL[state.toUpperCase()] ?? state.toLowerCase().replace(/_/g, ' ');
}
