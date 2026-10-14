import { mapConcurrent } from "@/lib/async-cache";

import { enc, hubApi } from "./api";
import type { CheckState, HubAccount, HubAdapter, HubPr, HubRepo } from "./types";

type BbRepo = {
  full_name: string;
  name: string;
  owner: { display_name: string; nickname?: string; username?: string; links: { avatar: { href: string } } };
  workspace?: { slug: string };
  description: string;
  is_private: boolean;
  parent?: unknown;
  language: string;
  updated_on: string;
  mainbranch?: { name: string } | null;
  links: { html: { href: string }; avatar?: { href: string }; clone?: { name: string; href: string }[] };
};

type BbPr = {
  id: number;
  title: string;
  state: string;
  draft?: boolean;
  created_on: string;
  updated_on: string;
  comment_count: number;
  author: { display_name: string; nickname?: string; links: { avatar: { href: string }; html?: { href: string } } } | null;
  destination: { repository: { full_name: string } };
  links: { html: { href: string } };
};

type Page<T> = { values: T[]; size?: number };

/** Bitbucket puts `user@` into clone URLs; keep them account-neutral. */
function cleanClone(href: string | undefined): string {
  return (href ?? "").replace(/^https:\/\/[^@/]+@/, "https://");
}

function repo(r: BbRepo): HubRepo {
  return {
    fullName: r.full_name,
    name: r.name,
    owner: r.workspace?.slug ?? r.full_name.split("/")[0],
    ownerAvatar: r.links.avatar?.href ?? r.owner.links.avatar.href,
    description: r.description || null,
    stars: null,
    forks: null,
    openPrs: null,
    private: r.is_private,
    fork: !!r.parent,
    language: r.language ? { name: r.language, color: null } : null,
    updatedAt: r.updated_on,
    url: r.links.html.href,
    cloneUrl: cleanClone(r.links.clone?.find((c) => c.name === "https")?.href) || `${r.links.html.href}.git`,
  };
}

function pr(p: BbPr): HubPr {
  return {
    id: `${p.destination.repository.full_name}#${p.id}`,
    number: p.id,
    title: p.title,
    url: p.links.html.href,
    repo: p.destination.repository.full_name,
    author: p.author
      ? { login: p.author.nickname ?? p.author.display_name, avatarUrl: p.author.links.avatar.href, url: p.author.links.html?.href }
      : null,
    createdAt: p.created_on,
    updatedAt: p.updated_on,
    draft: !!p.draft,
    state: p.state === "OPEN" ? "open" : p.state === "MERGED" ? "merged" : "closed",
    checks: null,
    review: null,
    additions: null,
    deletions: null,
    comments: p.comment_count,
  };
}

function bbState(s: { name: string; result?: { name: string } }): CheckState {
  if (s.name !== "COMPLETED") return "pending";
  if (s.result?.name === "SUCCESSFUL") return "success";
  if (s.result?.name === "FAILED" || s.result?.name === "ERROR") return "failure";
  return null;
}

const uuids = new Map<string, Promise<string>>();
function userUuid(a: HubAccount): Promise<string> {
  const key = `${a.host}:${a.login}`;
  let p = uuids.get(key);
  if (!p) {
    p = hubApi<{ uuid: string }>(a, "GET", "/user").then((u) => u.uuid);
    p.catch(() => uuids.delete(key));
    uuids.set(key, p);
  }
  return p;
}

const r = (fullName: string) => `/repositories/${fullName.split("/").map(enc).join("/")}`;

async function memberRepos(a: HubAccount, n: number): Promise<HubRepo[]> {
  const page = await hubApi<Page<BbRepo>>(a, "GET", `/repositories?role=member&sort=-updated_on&pagelen=${n}`);
  return page.values.map(repo);
}

function unsupported(what: string): never {
  throw new Error(`Bitbucket: ${what} wird von der API nicht angeboten.`);
}

export const bitbucket: HubAdapter = {
  async sidebar(a) {
    const [repos, authored] = await Promise.all([memberRepos(a, 40), bitbucket.pulls(a, "authored")]);
    return { repos, repoCount: repos.length, prCount: authored.length, reviewCount: null };
  },

  async pulls(a, kind) {
    const uuid = await userUuid(a);
    if (kind === "authored") {
      const page = await hubApi<Page<BbPr>>(a, "GET", `/pullrequests/${enc(uuid)}?state=OPEN&pagelen=50`);
      return page.values.map(pr);
    }
    if (kind !== "review") return [];
    // No global "review requested" endpoint: scan the most recently active repos.
    // shortcut: only the 15 newest repos are scanned, page through all if users miss reviews.
    const repos = await memberRepos(a, 15);
    const q = enc(`state="OPEN" AND reviewers.uuid="${uuid}"`);
    const pages = await mapConcurrent(repos, 4, (rp) =>
      hubApi<Page<BbPr>>(a, "GET", `${r(rp.fullName)}/pullrequests?q=${q}&pagelen=20`).catch(() => ({ values: [] })),
    );
    return pages.flatMap((p) => p.values.map(pr)).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  },

  async starred() {
    return [];
  },

  async repos(a) {
    return memberRepos(a, 100);
  },

  async repo(a, fullName) {
    const base = r(fullName);
    const d = await hubApi<BbRepo>(a, "GET", base);
    const branch = d.mainbranch?.name;
    const [commits, prs] = await Promise.all([
      branch
        ? hubApi<Page<{ hash: string; message: string; date: string; author: { raw: string; user?: { nickname?: string; display_name: string; links: { avatar: { href: string } } } }; links: { html: { href: string } } }>>(
            a,
            "GET",
            `${base}/commits/${enc(branch)}?pagelen=7`,
          ).catch(() => ({ values: [] }))
        : Promise.resolve({ values: [] }),
      hubApi<Page<BbPr>>(a, "GET", `${base}/pullrequests?state=OPEN&pagelen=8`).catch(() => ({ values: [], size: 0 })),
    ]);
    const authors = new Map<string, { login: string; avatarUrl: string | null; contributions: number }>();
    for (const c of commits.values) {
      const login = c.author.user?.nickname ?? c.author.user?.display_name ?? c.author.raw.replace(/\s*<.*>$/, "");
      const entry = authors.get(login) ?? { login, avatarUrl: c.author.user?.links.avatar.href ?? null, contributions: 0 };
      entry.contributions++;
      authors.set(login, entry);
    }
    return {
      ...repo(d),
      openPrs: prs.size ?? prs.values.length,
      homepage: null,
      license: null,
      topics: [],
      defaultBranch: branch ?? null,
      starred: null,
      canAdmin: false,
      sshUrl: d.links.clone?.find((c) => c.name === "ssh")?.href ?? null,
      releaseCount: null,
      latestRelease: null,
      pulls: prs.values.map(pr),
      openIssues: null,
      commits: commits.values.map((c) => ({
        sha: c.hash,
        message: c.message.split("\n")[0],
        author: c.author.user ? { login: c.author.user.nickname ?? c.author.user.display_name, avatarUrl: c.author.user.links.avatar.href } : null,
        authorName: c.author.user?.display_name ?? c.author.raw.replace(/\s*<.*>$/, ""),
        date: c.date,
        url: c.links.html.href,
        checks: null,
      })),
      languages: d.language ? [{ name: d.language, color: null, share: 1 }] : [],
      // Bitbucket has no contributors endpoint; recent commit authors stand in.
      contributors: [...authors.values()].sort((x, y) => y.contributions - x.contributions),
      starHistory: null,
      starHistoryCapped: false,
    };
  },

  async contributions() {
    return null;
  },

  async notifications() {
    return null;
  },

  async markRead() {
    unsupported("Benachrichtigungen");
  },

  async issues(a, fullName, state) {
    const q = enc(state === "open" ? `state="new" OR state="open"` : `state="resolved" OR state="closed"`);
    const page = await hubApi<
      Page<{ id: number; title: string; created_on: string; state: string; reporter: { nickname?: string; display_name: string; links: { avatar: { href: string } } } | null; links: { html: { href: string } } }>
    >(a, "GET", `${r(fullName)}/issues?q=${q}&sort=-updated_on&pagelen=50`).catch(() => ({ values: [] }));
    return page.values.map((i) => ({
      id: String(i.id),
      number: i.id,
      title: i.title,
      url: i.links.html.href,
      author: i.reporter ? { login: i.reporter.nickname ?? i.reporter.display_name, avatarUrl: i.reporter.links.avatar.href } : null,
      createdAt: i.created_on,
      comments: 0,
      labels: [],
      state,
    }));
  },

  async repoPulls(a, fullName, state) {
    const s = state === "open" ? "state=OPEN" : "state=MERGED&state=DECLINED";
    const page = await hubApi<Page<BbPr>>(a, "GET", `${r(fullName)}/pullrequests?${s}&pagelen=50`);
    return page.values.map(pr);
  },

  async releases() {
    return [];
  },

  async runs(a, fullName) {
    const page = await hubApi<
      Page<{ uuid: string; build_number: number; created_on: string; state: { name: string; result?: { name: string } }; target: { ref_name?: string }; trigger: { name: string } }>
    >(a, "GET", `${r(fullName)}/pipelines/?sort=-created_on&pagelen=30`).catch(() => null);
    if (!page) return null;
    return page.values.map((p) => ({
      id: p.uuid,
      name: `Pipeline #${p.build_number}`,
      branch: p.target.ref_name ?? null,
      event: p.trigger.name,
      status: bbState(p.state),
      url: `https://bitbucket.org/${fullName}/pipelines/results/${p.build_number}`,
      createdAt: p.created_on,
    }));
  },

  async star() {
    unsupported("Sterne");
  },

  async fork(a, fullName) {
    return repo(await hubApi<BbRepo>(a, "POST", `${r(fullName)}/forks`, {}));
  },

  async createIssue(a, fullName, title, body) {
    const issue = await hubApi<{ links: { html: { href: string } } }>(a, "POST", `${r(fullName)}/issues`, { title, content: { raw: body } });
    return issue.links.html.href;
  },

  async createRepo(a, name, description, isPrivate) {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    return repo(await hubApi<BbRepo>(a, "POST", `/repositories/${enc(a.login)}/${enc(slug)}`, { scm: "git", is_private: isPrivate, description }));
  },

  async approvePr(a, fullName, number) {
    await hubApi(a, "POST", `${r(fullName)}/pullrequests/${number}/approve`);
  },

  async mergePr(a, fullName, number) {
    await hubApi(a, "POST", `${r(fullName)}/pullrequests/${number}/merge`, {});
  },
};
