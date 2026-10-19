import { languageFromPath } from "@/lib/agents/agent-code-types";

import type { HubCommitSample, HubContributor, HubContributorStats } from "./types";

const WEEK = 7 * 86_400_000;
export const WINDOW_WEEKS = 52;

export type LangLines = { name: string; lines: number };

export type ContributorInsight = {
  login: string;
  avatarUrl: string | null;
  url?: string;
  /** All-time where the provider knows it, otherwise counted from the sample. */
  commits: number;
  additions: number | null;
  deletions: number | null;
  firstActive: number | null;
  lastActive: number | null;
  activeWeeks: number;
  longestStreak: number;
  /** Commits per week over the last {@link WINDOW_WEEKS} weeks, oldest first. */
  weekly: number[];
  languages: LangLines[];
  dirs: LangLines[];
  /** 7×24 commit counts by local weekday (0 = Sunday) and hour. */
  punch: number[];
  sample: HubCommitSample[];
  avgSize: number | null;
};

export type ContributorInsights = {
  people: ContributorInsight[];
  source: "weekly" | "sample";
  totals: { contributors: number; commits: number; additions: number | null; deletions: number | null; active30: number; busFactor: number };
  /** Week start (ms) per entry of `weekly`. */
  weeks: number[];
  languages: LangLines[];
  punch: number[];
  sampleSize: number;
  filesSampled: number;
};

// Shiki grammar ids → the names GitHub linguist uses, so colors match the repo's language list.
const LANG_NAMES: Record<string, string> = {
  tsx: "TypeScript",
  typescript: "TypeScript",
  jsx: "JavaScript",
  javascript: "JavaScript",
  csharp: "C#",
  cpp: "C++",
  bash: "Shell",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  json5: "JSON",
  jsonc: "JSON",
  yaml: "YAML",
  toml: "TOML",
  sql: "SQL",
  php: "PHP",
  mdx: "MDX",
  xml: "XML",
  docker: "Dockerfile",
  make: "Makefile",
  graphql: "GraphQL",
  powershell: "PowerShell",
};

export function langName(path: string): string | null {
  const id = languageFromPath(path);
  if (id === "text") return null;
  return LANG_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function top(map: Map<string, number>, n = Infinity): LangLines[] {
  return [...map].map(([name, lines]) => ({ name, lines })).sort((a, b) => b.lines - a.lines).slice(0, n);
}

function longestRun(flags: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const f of flags) {
    run = f ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function contributorInsights(stats: HubContributorStats, known: HubContributor[], now = Date.now()): ContributorInsights {
  const start = now - WINDOW_WEEKS * WEEK;
  const slot = (t: number) => Math.floor((t - start) / WEEK);
  const people = new Map<string, ContributorInsight>();
  const get = (login: string, avatarUrl: string | null, url?: string) => {
    let p = people.get(login);
    if (!p) {
      p = {
        login,
        avatarUrl,
        url,
        commits: 0,
        additions: null,
        deletions: null,
        firstActive: null,
        lastActive: null,
        activeWeeks: 0,
        longestStreak: 0,
        weekly: Array(WINDOW_WEEKS).fill(0),
        languages: [],
        dirs: [],
        punch: Array(168).fill(0),
        sample: [],
        avgSize: null,
      };
      people.set(login, p);
    }
    p.avatarUrl ??= avatarUrl;
    p.url ??= url;
    return p;
  };

  if (stats.weekly) {
    for (const w of stats.weekly) {
      const p = get(w.login, w.avatarUrl, w.url);
      const active = w.weeks.filter((x) => x.c > 0);
      p.commits = active.reduce((s, x) => s + x.c, 0);
      p.additions = w.weeks.reduce((s, x) => s + x.a, 0);
      p.deletions = w.weeks.reduce((s, x) => s + x.d, 0);
      p.firstActive = active.length ? active[0].w * 1000 : null;
      p.lastActive = active.length ? active[active.length - 1].w * 1000 : null;
      p.activeWeeks = active.length;
      p.longestStreak = longestRun(w.weeks.map((x) => x.c > 0));
      for (const x of w.weeks) {
        const i = slot(x.w * 1000);
        if (i >= 0 && i < WINDOW_WEEKS) p.weekly[i] += x.c;
      }
    }
  }

  const teamLangs = new Map<string, number>();
  const teamPunch: number[] = Array(168).fill(0);
  const langsOf = new Map<string, Map<string, number>>();
  const dirsOf = new Map<string, Map<string, number>>();
  let filesSampled = 0;

  for (const c of stats.commits) {
    const t = Date.parse(c.date);
    const d = new Date(t);
    const h = d.getDay() * 24 + d.getHours();
    teamPunch[h]++;
    // Weekly stats are the roster; authors without a provider account (or past its top 100) only feed team totals.
    const p = stats.weekly ? people.get(c.login) : get(c.login, c.avatarUrl);
    for (const f of c.files ?? []) {
      filesSampled++;
      const lang = langName(f.path);
      if (lang) teamLangs.set(lang, (teamLangs.get(lang) ?? 0) + f.additions + f.deletions);
    }
    if (!p) continue;
    p.sample.push(c);
    p.punch[h]++;
    // Weekly buckets start on Sunday; a sampled commit pins the real last activity.
    if (stats.weekly) p.lastActive = Math.max(p.lastActive ?? t, t);
    else {
      const i = slot(t);
      if (i >= 0 && i < WINDOW_WEEKS) p.weekly[i]++;
      p.firstActive = Math.min(p.firstActive ?? t, t);
      p.lastActive = Math.max(p.lastActive ?? t, t);
      if (c.additions != null) p.additions = (p.additions ?? 0) + c.additions;
      if (c.deletions != null) p.deletions = (p.deletions ?? 0) + c.deletions;
    }
    for (const f of c.files ?? []) {
      const lines = f.additions + f.deletions;
      const lang = langName(f.path);
      if (lang) {
        const m = langsOf.get(p.login) ?? new Map<string, number>();
        m.set(lang, (m.get(lang) ?? 0) + lines);
        langsOf.set(p.login, m);
      }
      const dir = f.path.split("/").slice(0, -1).slice(0, 2).join("/") || "/";
      const m = dirsOf.get(p.login) ?? new Map<string, number>();
      m.set(dir, (m.get(dir) ?? 0) + lines);
      dirsOf.set(p.login, m);
    }
  }

  const knownBy = new Map(known.map((k) => [k.login, k]));
  for (const p of people.values()) {
    const k = knownBy.get(p.login);
    if (k) {
      p.avatarUrl ??= k.avatarUrl;
      p.url ??= k.url;
    }
    if (!stats.weekly) {
      p.commits = Math.max(k?.contributions ?? 0, p.sample.length);
      const weeks = p.weekly.map((n) => n > 0);
      p.activeWeeks = weeks.filter(Boolean).length;
      p.longestStreak = longestRun(weeks);
    }
    p.languages = top(langsOf.get(p.login) ?? new Map());
    p.dirs = top(dirsOf.get(p.login) ?? new Map(), 6);
    const sized = p.sample.filter((c) => c.additions != null);
    p.avgSize = sized.length ? sized.reduce((s, c) => s + c.additions! + (c.deletions ?? 0), 0) / sized.length : null;
  }
  // Sample-only providers: people the contributors endpoint knows but the sample missed.
  if (!stats.weekly) for (const k of known) if (!people.has(k.login)) get(k.login, k.avatarUrl, k.url).commits = k.contributions;

  const list = [...people.values()].sort((a, b) => b.commits - a.commits || (b.lastActive ?? 0) - (a.lastActive ?? 0));
  const commits = list.reduce((s, p) => s + p.commits, 0);
  const sum = (key: "additions" | "deletions") => (list.some((p) => p[key] != null) ? list.reduce((s, p) => s + (p[key] ?? 0), 0) : null);
  let busFactor = 0;
  for (let acc = 0; busFactor < list.length && acc < commits / 2; busFactor++) acc += list[busFactor].commits;
  const month = now - 30 * 86_400_000;

  return {
    people: list,
    source: stats.weekly ? "weekly" : "sample",
    totals: {
      contributors: list.length,
      commits,
      additions: sum("additions"),
      deletions: sum("deletions"),
      // Weekly stats are bucketed by week start, so allow one extra week.
      active30: list.filter((p) => (p.lastActive ?? 0) >= month - (stats.weekly ? WEEK : 0)).length,
      busFactor,
    },
    weeks: Array.from({ length: WINDOW_WEEKS }, (_, i) => start + i * WEEK),
    languages: top(teamLangs),
    punch: teamPunch,
    sampleSize: stats.commits.length,
    filesSampled,
  };
}
