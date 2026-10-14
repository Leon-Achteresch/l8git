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
  contributions(a: HubAccount): Promise<ContributionDay[] | null>;
  notifications(a: HubAccount): Promise<HubNotification[] | null>;
  markRead(a: HubAccount, id: string): Promise<void>;
  issues(a: HubAccount, fullName: string, state: "open" | "closed"): Promise<HubIssue[]>;
  repoPulls(a: HubAccount, fullName: string, state: "open" | "closed"): Promise<HubPr[]>;
  releases(a: HubAccount, fullName: string): Promise<HubRelease[]>;
  runs(a: HubAccount, fullName: string): Promise<HubRun[] | null>;
  star(a: HubAccount, fullName: string, on: boolean): Promise<void>;
  fork(a: HubAccount, fullName: string): Promise<HubRepo>;
  createIssue(a: HubAccount, fullName: string, title: string, body: string): Promise<string>;
  createRepo(a: HubAccount, name: string, description: string, isPrivate: boolean): Promise<HubRepo>;
  approvePr(a: HubAccount, fullName: string, number: number): Promise<void>;
  mergePr(a: HubAccount, fullName: string, number: number): Promise<void>;
};
