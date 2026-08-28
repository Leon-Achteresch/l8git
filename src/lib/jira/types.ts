/** Mirrors `src-tauri/src/jira.rs`. Read-only by construction. */

export interface JiraCredentialStatus {
  configured: boolean;
  /** Normalised origin (plus context path) of the Jira instance. */
  baseUrl: string;
  email: string;
  /** Masked hint such as `••••1a2b`. The token itself never leaves the keychain. */
  tokenHint: string;
}

export interface JiraAccount {
  accountId: string;
  displayName: string;
  email: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  issueType: string;
  priority: string;
  assignee: string;
  reporter: string;
  resolution: string;
  labels: string[];
  components: string[];
  fixVersions: string[];
  parent: string;
  subtasks: string[];
  project: string;
  dueDate: string;
  created: string;
  updated: string;
  description: string;
  url: string;
  truncated: boolean;
}

export interface JiraComment {
  id: string;
  author: string;
  created: string;
  updated: string;
  body: string;
  truncated: boolean;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
  truncated: boolean;
}

/** A ticket the user pinned to a repository in the agents window. */
export interface JiraTicketLink {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  issueType: string;
  url: string;
  /** Epoch ms of the last successful metadata refresh; 0 when never synced. */
  syncedAt: number;
}

export function ticketLinkFromIssue(issue: JiraIssue, now = Date.now()): JiraTicketLink {
  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    statusCategory: issue.statusCategory,
    issueType: issue.issueType,
    url: issue.url,
    syncedAt: now,
  };
}
