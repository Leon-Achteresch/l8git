import { enc, gql, hubApi } from "./api";
import type {
  CheckState,
  HubAdapter,
  HubCommit,
  HubPr,
  HubRelease,
  HubRepo,
  PullKind,
} from "./types";

const REPO_FIELDS = `
  nameWithOwner name url updatedAt description stargazerCount forkCount isPrivate isFork
  owner { login avatarUrl }
  primaryLanguage { name color }
  pullRequests(states: OPEN) { totalCount }
`;

const PR_FIELDS = `
  id number title url isDraft state createdAt updatedAt additions deletions reviewDecision
  repository { nameWithOwner }
  author { login avatarUrl url }
  comments { totalCount }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
`;

type GqlRepo = {
  nameWithOwner: string;
  name: string;
  url: string;
  updatedAt: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  isPrivate: boolean;
  isFork: boolean;
  owner: { login: string; avatarUrl: string };
  primaryLanguage: { name: string; color: string | null } | null;
  pullRequests: { totalCount: number };
};

type GqlPr = {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  state: "OPEN" | "MERGED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  repository: { nameWithOwner: string };
  author: { login: string; avatarUrl: string; url: string } | null;
  comments: { totalCount: number };
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
};

export function rollup(state: string | null | undefined): CheckState {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return null;
  }
}

function repo(r: GqlRepo): HubRepo {
  return {
    fullName: r.nameWithOwner,
    name: r.name,
    owner: r.owner.login,
    ownerAvatar: r.owner.avatarUrl,
    description: r.description,
    stars: r.stargazerCount,
    forks: r.forkCount,
    openPrs: r.pullRequests.totalCount,
    private: r.isPrivate,
    fork: r.isFork,
    language: r.primaryLanguage,
    updatedAt: r.updatedAt,
    url: r.url,
    cloneUrl: `${r.url}.git`,
  };
}

function pr(p: GqlPr): HubPr {
  return {
    id: p.id,
    number: p.number,
    title: p.title,
    url: p.url,
    repo: p.repository.nameWithOwner,
    author: p.author ? { login: p.author.login, avatarUrl: p.author.avatarUrl, url: p.author.url } : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    draft: p.isDraft,
    state: p.state === "OPEN" ? "open" : p.state === "MERGED" ? "merged" : "closed",
    checks: rollup(p.commits.nodes[0]?.commit.statusCheckRollup?.state),
    review:
      p.reviewDecision === "APPROVED"
        ? "approved"
        : p.reviewDecision === "CHANGES_REQUESTED"
          ? "changes"
          : p.reviewDecision === "REVIEW_REQUIRED"
            ? "required"
            : null,
    additions: p.additions,
    deletions: p.deletions,
    comments: p.comments.totalCount,
  };
}

function split(fullName: string) {
  const [owner, name] = fullName.split("/");
  return { owner, name };
}

const PULL_QUERY: Record<PullKind, string> = {
  authored: "author",
  review: "review-requested",
  assigned: "assignee",
  mentioned: "mentions",
};

/** Cumulative daily totals for the last 30 days from the newest stargazer timestamps. */
export function starHistory(total: number, starredAt: string[], now = Date.now()): { days: number[]; capped: boolean } {
  const DAY = 86_400_000;
  const days: number[] = [];
  const times = starredAt.map((s) => Date.parse(s)).filter(Number.isFinite);
  for (let i = 29; i >= 0; i--) {
    const end = now - i * DAY;
    days.push(total - times.filter((t) => t > end).length);
  }
  // A full sample whose oldest star is still inside the window means older growth is unseen.
  const capped = times.length >= 100 && times.length > 0 && Math.min(...times) > now - 30 * DAY;
  return { days, capped };
}

export const github: HubAdapter = {
  async sidebar(a) {
    const d = await gql<{
      viewer: { repositories: { totalCount: number; nodes: GqlRepo[] } };
      authored: { issueCount: number };
      review: { issueCount: number };
    }>(
      a,
      `query($a: String!, $r: String!) {
        viewer { repositories(first: 40, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: PUSHED_AT, direction: DESC}) { totalCount nodes { ${REPO_FIELDS} } } }
        authored: search(type: ISSUE, query: $a, first: 1) { issueCount }
        review: search(type: ISSUE, query: $r, first: 1) { issueCount }
      }`,
      {
        a: `is:open is:pr archived:false author:${a.login}`,
        r: `is:open is:pr archived:false review-requested:${a.login}`,
      },
    );
    return {
      repos: d.viewer.repositories.nodes.map(repo),
      repoCount: d.viewer.repositories.totalCount,
      prCount: d.authored.issueCount,
      reviewCount: d.review.issueCount,
    };
  },

  async pulls(a, kind) {
    const d = await gql<{ search: { nodes: GqlPr[] } }>(
      a,
      `query($q: String!) { search(type: ISSUE, query: $q, first: 50) { nodes { ... on PullRequest { ${PR_FIELDS} } } } }`,
      { q: `is:open is:pr archived:false ${PULL_QUERY[kind]}:${a.login} sort:updated-desc` },
    );
    return d.search.nodes.filter((n) => n && "number" in n).map(pr);
  },

  async starred(a) {
    const d = await gql<{ viewer: { starredRepositories: { nodes: GqlRepo[] } } }>(
      a,
      `{ viewer { starredRepositories(first: 60, orderBy: {field: STARRED_AT, direction: DESC}) { nodes { ${REPO_FIELDS} } } } }`,
    );
    return d.viewer.starredRepositories.nodes.map(repo);
  },

  async repos(a) {
    const d = await gql<{ viewer: { repositories: { nodes: GqlRepo[] } } }>(
      a,
      `{ viewer { repositories(first: 100, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: PUSHED_AT, direction: DESC}) { nodes { ${REPO_FIELDS} } } } }`,
    );
    return d.viewer.repositories.nodes.map(repo);
  },

  async repo(a, fullName) {
    const { owner, name } = split(fullName);
    type Detail = GqlRepo & {
      homepageUrl: string | null;
      sshUrl: string;
      viewerHasStarred: boolean;
      viewerPermission: string | null;
      licenseInfo: { spdxId: string | null; name: string } | null;
      repositoryTopics: { nodes: { topic: { name: string } }[] };
      defaultBranchRef: {
        name: string;
        target: {
          history?: {
            nodes: {
              oid: string;
              messageHeadline: string;
              committedDate: string;
              url: string;
              author: { name: string; avatarUrl: string; user: { login: string } | null } | null;
              statusCheckRollup: { state: string } | null;
            }[];
          };
        };
      } | null;
      releases: { totalCount: number; nodes: { tagName: string; name: string | null; publishedAt: string | null; url: string; isPrerelease: boolean }[] };
      openPrs: { totalCount: number; nodes: GqlPr[] };
      issues: { totalCount: number };
      languages: { totalSize: number; edges: { size: number; node: { name: string; color: string | null } }[] };
      stargazers: { totalCount: number; edges: { starredAt: string }[] };
    };
    const [d, contributors] = await Promise.all([
      gql<{ repository: Detail }>(
        a,
        `query($o: String!, $n: String!) { repository(owner: $o, name: $n) {
          ${REPO_FIELDS}
          homepageUrl sshUrl viewerHasStarred viewerPermission
          licenseInfo { spdxId name }
          repositoryTopics(first: 12) { nodes { topic { name } } }
          defaultBranchRef { name target { ... on Commit { history(first: 7) { nodes {
            oid messageHeadline committedDate url
            author { name avatarUrl user { login } }
            statusCheckRollup { state }
          } } } } }
          releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) { totalCount nodes { tagName name publishedAt url isPrerelease } }
          openPrs: pullRequests(states: OPEN, first: 8, orderBy: {field: UPDATED_AT, direction: DESC}) { totalCount nodes { ${PR_FIELDS} } }
          issues(states: OPEN) { totalCount }
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { totalSize edges { size node { name color } } }
          stargazers(last: 100, orderBy: {field: STARRED_AT, direction: ASC}) { totalCount edges { starredAt } }
        } }`,
        { o: owner, n: name },
      ),
      hubApi<{ login: string; avatar_url: string; html_url: string; contributions: number }[] | null>(
        a,
        "GET",
        `/repos/${enc(owner)}/${enc(name)}/contributors?per_page=30`,
      ).catch(() => null),
    ]);
    const r = d.repository;
    const stars = starHistory(r.stargazers.totalCount, r.stargazers.edges.map((e) => e.starredAt));
    const total = r.languages.totalSize || 1;
    const commits: HubCommit[] = (r.defaultBranchRef?.target.history?.nodes ?? []).map((c) => ({
      sha: c.oid,
      message: c.messageHeadline,
      author: c.author?.user ? { login: c.author.user.login, avatarUrl: c.author.avatarUrl } : null,
      authorName: c.author?.user?.login ?? c.author?.name ?? "",
      date: c.committedDate,
      url: c.url,
      checks: rollup(c.statusCheckRollup?.state),
    }));
    const latest = r.releases.nodes[0];
    return {
      ...repo(r),
      openPrs: r.openPrs.totalCount,
      homepage: r.homepageUrl || null,
      license: r.licenseInfo ? (r.licenseInfo.spdxId && r.licenseInfo.spdxId !== "NOASSERTION" ? r.licenseInfo.spdxId : r.licenseInfo.name) : null,
      topics: r.repositoryTopics.nodes.map((n) => n.topic.name),
      defaultBranch: r.defaultBranchRef?.name ?? null,
      starred: r.viewerHasStarred,
      canAdmin: r.viewerPermission === "ADMIN",
      sshUrl: r.sshUrl,
      releaseCount: r.releases.totalCount,
      latestRelease: latest
        ? { tag: latest.tagName, name: latest.name, publishedAt: latest.publishedAt, url: latest.url, prerelease: latest.isPrerelease }
        : null,
      pulls: r.openPrs.nodes.map(pr),
      openIssues: r.issues.totalCount,
      commits,
      languages: r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, share: e.size / total })),
      contributors: (contributors ?? []).map((c) => ({
        login: c.login,
        avatarUrl: c.avatar_url,
        url: c.html_url,
        contributions: c.contributions,
      })),
      starHistory: stars.days,
      starHistoryCapped: stars.capped,
    };
  },

  async contributions(a) {
    const d = await gql<{
      viewer: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } } };
    }>(a, `{ viewer { contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`);
    return d.viewer.contributionsCollection.contributionCalendar.weeks.flatMap((w) =>
      w.contributionDays.map((day) => ({ date: day.date, count: day.contributionCount })),
    );
  },

  async notifications(a) {
    const list = await hubApi<
      { id: string; unread: boolean; reason: string; updated_at: string; subject: { title: string; type: string; url: string | null }; repository: { full_name: string; html_url: string } }[]
    >(a, "GET", "/notifications?all=false&per_page=50");
    return list.map((n) => ({
      id: n.id,
      title: n.subject.title,
      repo: n.repository.full_name,
      type: n.subject.type,
      reason: n.reason,
      unread: n.unread,
      updatedAt: n.updated_at,
      url: webUrlForSubject(n.subject.url, n.repository.html_url),
    }));
  },

  async markRead(a, id) {
    await hubApi(a, "PATCH", `/notifications/threads/${enc(id)}`);
  },

  async issues(a, fullName, state) {
    const { owner, name } = split(fullName);
    const d = await gql<{
      repository: {
        issues: {
          nodes: { id: string; number: number; title: string; url: string; createdAt: string; state: string; author: { login: string; avatarUrl: string } | null; comments: { totalCount: number }; labels: { nodes: { name: string; color: string }[] } }[];
        };
      };
    }>(
      a,
      `query($o: String!, $n: String!, $s: [IssueState!]) { repository(owner: $o, name: $n) {
        issues(first: 50, states: $s, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes {
          id number title url createdAt state author { login avatarUrl } comments { totalCount } labels(first: 5) { nodes { name color } }
        } }
      } }`,
      { o: owner, n: name, s: [state.toUpperCase()] },
    );
    return d.repository.issues.nodes.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      url: i.url,
      author: i.author,
      createdAt: i.createdAt,
      comments: i.comments.totalCount,
      labels: i.labels.nodes.map((l) => ({ name: l.name, color: `#${l.color}` })),
      state: i.state === "OPEN" ? "open" : "closed",
    }));
  },

  async repoPulls(a, fullName, state) {
    const { owner, name } = split(fullName);
    const d = await gql<{ repository: { pullRequests: { nodes: GqlPr[] } } }>(
      a,
      `query($o: String!, $n: String!, $s: [PullRequestState!]) { repository(owner: $o, name: $n) {
        pullRequests(first: 50, states: $s, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ${PR_FIELDS} } }
      } }`,
      { o: owner, n: name, s: state === "open" ? ["OPEN"] : ["MERGED", "CLOSED"] },
    );
    return d.repository.pullRequests.nodes.map(pr);
  },

  async releases(a, fullName) {
    const { owner, name } = split(fullName);
    const list = await hubApi<{ tag_name: string; name: string | null; published_at: string | null; html_url: string; prerelease: boolean; body: string | null }[]>(
      a,
      "GET",
      `/repos/${enc(owner)}/${enc(name)}/releases?per_page=30`,
    );
    return list.map(
      (r): HubRelease => ({ tag: r.tag_name, name: r.name, publishedAt: r.published_at, url: r.html_url, prerelease: r.prerelease, body: r.body }),
    );
  },

  async runs(a, fullName) {
    const { owner, name } = split(fullName);
    const d = await hubApi<{
      workflow_runs: { id: number; name: string; head_branch: string; event: string; status: string; conclusion: string | null; html_url: string; created_at: string }[];
    }>(a, "GET", `/repos/${enc(owner)}/${enc(name)}/actions/runs?per_page=30`);
    return d.workflow_runs.map((r) => ({
      id: String(r.id),
      name: r.name,
      branch: r.head_branch,
      event: r.event,
      status: r.status !== "completed" ? "pending" : r.conclusion === "success" ? "success" : r.conclusion === "failure" ? "failure" : null,
      url: r.html_url,
      createdAt: r.created_at,
    }));
  },

  async star(a, fullName, on) {
    const { owner, name } = split(fullName);
    await hubApi(a, on ? "PUT" : "DELETE", `/user/starred/${enc(owner)}/${enc(name)}`);
  },

  async fork(a, fullName) {
    const { owner, name } = split(fullName);
    const r = await hubApi<RestRepo>(a, "POST", `/repos/${enc(owner)}/${enc(name)}/forks`, {});
    return restRepo(r);
  },

  async createIssue(a, fullName, title, body) {
    const { owner, name } = split(fullName);
    const r = await hubApi<{ html_url: string }>(a, "POST", `/repos/${enc(owner)}/${enc(name)}/issues`, { title, body });
    return r.html_url;
  },

  async createRepo(a, name, description, isPrivate) {
    const r = await hubApi<RestRepo>(a, "POST", "/user/repos", { name, description, private: isPrivate, auto_init: true });
    return restRepo(r);
  },

  async approvePr(a, fullName, number) {
    const { owner, name } = split(fullName);
    await hubApi(a, "POST", `/repos/${enc(owner)}/${enc(name)}/pulls/${number}/reviews`, { event: "APPROVE" });
  },

  async mergePr(a, fullName, number) {
    const { owner, name } = split(fullName);
    await hubApi(a, "PUT", `/repos/${enc(owner)}/${enc(name)}/pulls/${number}/merge`, {});
  },
};

type RestRepo = {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  fork: boolean;
  language: string | null;
  updated_at: string;
  html_url: string;
  clone_url: string;
};

function restRepo(r: RestRepo): HubRepo {
  return {
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    ownerAvatar: r.owner.avatar_url,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openPrs: null,
    private: r.private,
    fork: r.fork,
    language: r.language ? { name: r.language, color: null } : null,
    updatedAt: r.updated_at,
    url: r.html_url,
    cloneUrl: r.clone_url,
  };
}

/** API subject URLs (`/repos/o/n/pulls/1`) map 1:1 to web paths except `pulls` → `pull`. */
function webUrlForSubject(api: string | null, repoHtml: string): string {
  const m = api?.match(/\/repos\/[^/]+\/[^/]+\/(pulls|issues|commits|releases)\/(.+)$/);
  if (!m) return repoHtml;
  // Release subjects carry a numeric id, the web route wants the tag.
  if (m[1] === "releases") return `${repoHtml}/releases`;
  return `${repoHtml}/${m[1] === "pulls" ? "pull" : m[1]}/${m[2]}`;
}
