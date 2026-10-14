import { enc, hubApi } from "./api";
import type { CheckState, HubAccount, HubAdapter, HubPr, HubRepo, PullKind } from "./types";

type GlProject = {
  id: number;
  path_with_namespace: string;
  name: string;
  namespace: { avatar_url: string | null; path: string } | null;
  avatar_url: string | null;
  description: string | null;
  star_count: number;
  forks_count: number;
  visibility: string;
  forked_from_project?: unknown;
  last_activity_at: string;
  web_url: string;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  default_branch: string | null;
  open_issues_count?: number;
  topics?: string[];
  license?: { nickname: string | null; name: string } | null;
  permissions?: { project_access: { access_level: number } | null; group_access: { access_level: number } | null };
};

type GlMr = {
  id: number;
  iid: number;
  title: string;
  web_url: string;
  references: { full: string };
  author: { username: string; avatar_url: string | null; web_url: string } | null;
  created_at: string;
  updated_at: string;
  draft: boolean;
  state: string;
  user_notes_count: number;
  head_pipeline?: { status: string } | null;
};

const pid = (fullName: string) => `/projects/${enc(fullName)}`;

export function glStatus(s: string | null | undefined): CheckState {
  if (s === "success") return "success";
  if (s === "failed") return "failure";
  if (s === "running" || s === "pending" || s === "created" || s === "preparing" || s === "waiting_for_resource") return "pending";
  return null;
}

function repo(p: GlProject): HubRepo {
  return {
    fullName: p.path_with_namespace,
    name: p.name,
    owner: p.namespace?.path ?? p.path_with_namespace.split("/")[0],
    ownerAvatar: p.avatar_url ?? p.namespace?.avatar_url ?? null,
    description: p.description || null,
    stars: p.star_count,
    forks: p.forks_count,
    openPrs: null,
    private: p.visibility !== "public",
    fork: !!p.forked_from_project,
    language: null,
    updatedAt: p.last_activity_at,
    url: p.web_url,
    cloneUrl: p.http_url_to_repo,
  };
}

function mr(m: GlMr): HubPr {
  return {
    id: String(m.id),
    number: m.iid,
    title: m.title,
    url: m.web_url,
    repo: m.references.full.split("!")[0],
    author: m.author ? { login: m.author.username, avatarUrl: m.author.avatar_url, url: m.author.web_url } : null,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    draft: m.draft,
    state: m.state === "opened" ? "open" : m.state === "merged" ? "merged" : "closed",
    checks: glStatus(m.head_pipeline?.status),
    review: null,
    additions: null,
    deletions: null,
    comments: m.user_notes_count,
  };
}

function mrQuery(a: HubAccount, kind: PullKind): string | null {
  switch (kind) {
    case "authored":
      return "scope=created_by_me";
    case "review":
      return `scope=all&reviewer_username=${enc(a.login)}`;
    case "assigned":
      return "scope=assigned_to_me";
    default:
      return null;
  }
}

const projects = (a: HubAccount, q: string) =>
  hubApi<GlProject[]>(a, "GET", `/projects?${q}&order_by=last_activity_at&simple=false`);

export const gitlab: HubAdapter = {
  async sidebar(a) {
    const [list, authored, review] = await Promise.all([
      projects(a, "membership=true&per_page=40"),
      gitlab.pulls(a, "authored"),
      gitlab.pulls(a, "review"),
    ]);
    return { repos: list.map(repo), repoCount: list.length, prCount: authored.length, reviewCount: review.length };
  },

  async pulls(a, kind) {
    const q = mrQuery(a, kind);
    if (!q) return [];
    return (await hubApi<GlMr[]>(a, "GET", `/merge_requests?state=opened&per_page=50&${q}`)).map(mr);
  },

  async starred(a) {
    return (await projects(a, "starred=true&per_page=60")).map(repo);
  },

  async repos(a) {
    return (await projects(a, "membership=true&per_page=100")).map(repo);
  },

  async repo(a, fullName) {
    const base = pid(fullName);
    const p = await hubApi<GlProject>(a, "GET", `${base}?license=true`);
    const branch = p.default_branch ? `&ref_name=${enc(p.default_branch)}` : "";
    const [commits, mrs, releases, languages, contributors] = await Promise.all([
      hubApi<{ id: string; title: string; author_name: string; created_at: string; web_url: string }[]>(a, "GET", `${base}/repository/commits?per_page=7${branch}`).catch(() => []),
      hubApi<GlMr[]>(a, "GET", `${base}/merge_requests?state=opened&per_page=8`).catch(() => []),
      hubApi<{ tag_name: string; name: string | null; released_at: string | null; _links: { self: string }; upcoming_release: boolean }[]>(a, "GET", `${base}/releases?per_page=1`).catch(() => []),
      hubApi<Record<string, number>>(a, "GET", `${base}/languages`).catch(() => ({})),
      hubApi<{ name: string; commits: number }[]>(a, "GET", `${base}/repository/contributors?order_by=commits&sort=desc&per_page=30`).catch(() => []),
    ]);
    const level = Math.max(p.permissions?.project_access?.access_level ?? 0, p.permissions?.group_access?.access_level ?? 0);
    const latest = releases[0];
    return {
      ...repo(p),
      openPrs: mrs.length,
      homepage: null,
      license: p.license ? (p.license.nickname ?? p.license.name) : null,
      topics: p.topics ?? [],
      defaultBranch: p.default_branch,
      starred: null,
      canAdmin: level >= 40,
      sshUrl: p.ssh_url_to_repo,
      releaseCount: null,
      latestRelease: latest
        ? { tag: latest.tag_name, name: latest.name, publishedAt: latest.released_at, url: latest._links.self, prerelease: latest.upcoming_release }
        : null,
      pulls: mrs.map(mr),
      openIssues: p.open_issues_count ?? null,
      commits: commits.map((c) => ({
        sha: c.id,
        message: c.title,
        author: null,
        authorName: c.author_name,
        date: c.created_at,
        url: c.web_url,
        checks: null,
      })),
      languages: Object.entries(languages).map(([name, pct]) => ({ name, color: null, share: pct / 100 })),
      contributors: contributors.map((c) => ({ login: c.name, avatarUrl: null, contributions: c.commits })),
      starHistory: null,
      starHistoryCapped: false,
    };
  },

  async contributions() {
    return null;
  },

  async notifications(a) {
    const todos = await hubApi<
      { id: number; action_name: string; target_type: string; target_url: string; updated_at: string; state: string; target: { title?: string } | null; body: string; project: { path_with_namespace: string } | null }[]
    >(a, "GET", "/todos?state=pending&per_page=50");
    return todos.map((t) => ({
      id: String(t.id),
      title: t.target?.title ?? t.body,
      repo: t.project?.path_with_namespace ?? "",
      type: t.target_type,
      reason: t.action_name,
      unread: t.state === "pending",
      updatedAt: t.updated_at,
      url: t.target_url,
    }));
  },

  async markRead(a, id) {
    await hubApi(a, "POST", `/todos/${enc(id)}/mark_as_done`);
  },

  async issues(a, fullName, state) {
    const list = await hubApi<
      { id: number; iid: number; title: string; web_url: string; created_at: string; user_notes_count: number; labels: string[]; state: string; author: { username: string; avatar_url: string | null } | null }[]
    >(a, "GET", `${pid(fullName)}/issues?state=${state === "open" ? "opened" : "closed"}&per_page=50&order_by=updated_at`);
    return list.map((i) => ({
      id: String(i.id),
      number: i.iid,
      title: i.title,
      url: i.web_url,
      author: i.author ? { login: i.author.username, avatarUrl: i.author.avatar_url } : null,
      createdAt: i.created_at,
      comments: i.user_notes_count,
      labels: i.labels.map((name) => ({ name, color: null })),
      state: i.state === "opened" ? "open" : "closed",
    }));
  },

  async repoPulls(a, fullName, state) {
    const states = state === "open" ? ["opened"] : ["merged", "closed"];
    const lists = await Promise.all(
      states.map((s) => hubApi<GlMr[]>(a, "GET", `${pid(fullName)}/merge_requests?state=${s}&per_page=50&order_by=updated_at`)),
    );
    return lists.flat().map(mr).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  },

  async releases(a, fullName) {
    const list = await hubApi<{ tag_name: string; name: string | null; released_at: string | null; _links: { self: string }; upcoming_release: boolean; description: string | null }[]>(
      a,
      "GET",
      `${pid(fullName)}/releases?per_page=30`,
    );
    return list.map((r) => ({ tag: r.tag_name, name: r.name, publishedAt: r.released_at, url: r._links.self, prerelease: r.upcoming_release, body: r.description }));
  },

  async runs(a, fullName) {
    const list = await hubApi<{ id: number; ref: string; source: string; status: string; web_url: string; created_at: string }[]>(
      a,
      "GET",
      `${pid(fullName)}/pipelines?per_page=30`,
    );
    return list.map((r) => ({
      id: String(r.id),
      name: `Pipeline #${r.id}`,
      branch: r.ref,
      event: r.source,
      status: glStatus(r.status),
      url: r.web_url,
      createdAt: r.created_at,
    }));
  },

  async star(a, fullName, on) {
    // GitLab answers 304 when the project already has the requested state.
    await hubApi(a, "POST", `${pid(fullName)}/${on ? "star" : "unstar"}`).catch((e) => {
      if (!String(e).includes(" 304")) throw e;
    });
  },

  async fork(a, fullName) {
    return repo(await hubApi<GlProject>(a, "POST", `${pid(fullName)}/fork`, {}));
  },

  async createIssue(a, fullName, title, body) {
    return (await hubApi<{ web_url: string }>(a, "POST", `${pid(fullName)}/issues`, { title, description: body })).web_url;
  },

  async createRepo(a, name, description, isPrivate) {
    return repo(
      await hubApi<GlProject>(a, "POST", "/projects", {
        name,
        description,
        visibility: isPrivate ? "private" : "public",
        initialize_with_readme: true,
      }),
    );
  },

  async approvePr(a, fullName, number) {
    await hubApi(a, "POST", `${pid(fullName)}/merge_requests/${number}/approve`);
  },

  async mergePr(a, fullName, number) {
    await hubApi(a, "PUT", `${pid(fullName)}/merge_requests/${number}/merge`, {});
  },
};
