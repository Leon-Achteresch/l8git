export type HubProviderId = "github" | "gitlab" | "bitbucket" | "gitea";

/** Non-secret account metadata; the token stays in the OS keychain (Rust side). */
export type HubAccount = {
  host: string;
  provider: HubProviderId;
  login: string;
  name: string | null;
  avatar_url: string | null;
};

export type HubUser = { login: string; avatarUrl: string | null; url?: string };

export type CheckState = "success" | "failure" | "pending" | null;

export type HubRepo = {
  fullName: string;
  name: string;
  owner: string;
  ownerAvatar: string | null;
  description: string | null;
  /** `null` where the provider has no such concept (Bitbucket stars). */
  stars: number | null;
  forks: number | null;
  openPrs: number | null;
  private: boolean;
  fork: boolean;
  language: { name: string; color: string | null } | null;
  updatedAt: string;
  url: string;
  cloneUrl: string;
};

export type HubPr = {
  id: string;
  number: number;
  title: string;
  url: string;
  repo: string;
  author: HubUser | null;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  /** Branch the PR merges into. */
  baseBranch: string | null;
  state: "open" | "merged" | "closed";
  checks: CheckState;
  review: "approved" | "changes" | "required" | null;
  additions: number | null;
  deletions: number | null;
  comments: number | null;
};

export type HubCommit = {
  sha: string;
  message: string;
  author: HubUser | null;
  authorName: string;
  date: string;
  url: string;
  checks: CheckState;
};

export type HubRelease = {
  tag: string;
  name: string | null;
  publishedAt: string | null;
  url: string;
  prerelease: boolean;
  body?: string | null;
};

export type HubLanguage = { name: string; color: string | null; share: number };

export type HubContributor = HubUser & { contributions: number };

/** One recent commit with whatever detail the provider gives cheaply. */
export type HubCommitSample = {
  sha: string;
  message: string;
  url: string;
  date: string;
  /** Stable key for grouping: provider login when known, else the git author name. */
  login: string;
  avatarUrl: string | null;
  additions: number | null;
  deletions: number | null;
  /** Only fetched for the newest commits; `null` where not loaded. */
  files: { path: string; additions: number; deletions: number }[] | null;
};

/** Weekly totals per author over the repo's whole history (GitHub stats API). */
export type HubContributorWeeks = HubUser & { weeks: { w: number; a: number; d: number; c: number }[] };

export type HubContributorStats = {
  /** `null` when the provider has no such endpoint or is still computing it. */
  weekly: HubContributorWeeks[] | null;
  computing: boolean;
  commits: HubCommitSample[];
};

export type HubRepoDetail = HubRepo & {
  homepage: string | null;
  license: string | null;
  topics: string[];
  defaultBranch: string | null;
  starred: boolean | null;
  canAdmin: boolean;
  sshUrl: string | null;
  releaseCount: number | null;
  latestRelease: HubRelease | null;
  pulls: HubPr[];
  openIssues: number | null;
  commits: HubCommit[];
  languages: HubLanguage[];
  contributors: HubContributor[];
  /** Cumulative stargazer count per day for the last 30 days (oldest first). */
  starHistory: number[] | null;
  /** True when more stars arrived in 30 days than the sample covers. */
  starHistoryCapped: boolean;
};

export type HubIssue = {
  id: string;
  number: number;
  title: string;
  url: string;
  author: HubUser | null;
  createdAt: string;
  comments: number;
  labels: { name: string; color: string | null }[];
  state: "open" | "closed";
};

export type HubIssueDetail = HubIssue & { body: string };
export type HubIssueUpdate = { title?: string; body?: string; state?: "open" | "closed" };
/** Labels by name; assignees by the provider's own id (GitHub login, GitLab user id). */
export type HubIssueMeta = { labels?: string[]; assignees?: string[] };
/** `color` is bare hex without "#". */
export type HubChoice = { id: string; label: string; color?: string };
export type HubChoicePage = { items: HubChoice[]; page: number; hasMore: boolean };

export type HubRun = {
  id: string;
  name: string;
  branch: string | null;
  event: string | null;
  status: CheckState;
  url: string;
  createdAt: string;
};

export type HubNotification = {
  id: string;
  title: string;
  repo: string;
  type: string;
  reason: string;
  unread: boolean;
  updatedAt: string;
  url: string | null;
};

export type HubSidebar = {
  repos: HubRepo[];
  repoCount: number;
  prCount: number | null;
  reviewCount: number | null;
};

export type ContributionDay = { date: string; count: number };

export type PullKind = "authored" | "review" | "assigned" | "mentioned";

/** Each hosting provider implements what its API allows; `null` marks "not available here". */
export type HubAdapter = {
  sidebar(a: HubAccount): Promise<HubSidebar>;
  pulls(a: HubAccount, kind: PullKind): Promise<HubPr[]>;
  starred(a: HubAccount): Promise<HubRepo[]>;
  repos(a: HubAccount): Promise<HubRepo[]>;
  repo(a: HubAccount, fullName: string): Promise<HubRepoDetail>;
  contributorStats(a: HubAccount, fullName: string): Promise<HubContributorStats>;
  contributions(a: HubAccount): Promise<ContributionDay[] | null>;
  notifications(a: HubAccount): Promise<HubNotification[] | null>;
  markRead(a: HubAccount, id: string): Promise<void>;
  issues(a: HubAccount, fullName: string, state: "open" | "closed"): Promise<HubIssue[]>;
  repoPulls(a: HubAccount, fullName: string, state: "open" | "closed"): Promise<HubPr[]>;
  releases(a: HubAccount, fullName: string): Promise<HubRelease[]>;
  runs(a: HubAccount, fullName: string): Promise<HubRun[] | null>;
  star(a: HubAccount, fullName: string, on: boolean): Promise<void>;
  fork(a: HubAccount, fullName: string): Promise<HubRepo>;
  createIssue(a: HubAccount, fullName: string, title: string, body: string, meta?: HubIssueMeta): Promise<string>;
  /** Choices for a new issue; absent where the provider can't list them cheaply. */
  issueLabels?(a: HubAccount, fullName: string, page: number): Promise<HubChoicePage>;
  issueAssignees?(a: HubAccount, fullName: string, page: number): Promise<HubChoicePage>;
  /** Generic view/edit; GitHub has its own richer issue sheet instead. */
  issue?(a: HubAccount, fullName: string, number: number): Promise<HubIssueDetail>;
  updateIssue?(a: HubAccount, fullName: string, number: number, patch: HubIssueUpdate): Promise<HubIssueDetail>;
  createRepo(a: HubAccount, name: string, description: string, isPrivate: boolean): Promise<HubRepo>;
  approvePr(a: HubAccount, fullName: string, number: number): Promise<void>;
  mergePr(a: HubAccount, fullName: string, number: number): Promise<void>;
};
