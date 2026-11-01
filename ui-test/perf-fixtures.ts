import { router } from '@/lib/router';
import { useRepoStore, type Branch, type PullRequest, type StashEntry, type TagRef } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { useTerminalStore } from '@/lib/terminal-store';
import { useInboxStore } from '@/lib/inbox-store';
import { accountKey, hubCache, useHubStore } from '@/lib/hub/store';
import type { HubAccount, HubContributorStats, HubPr, HubRepo, HubRepoDetail } from '@/lib/hub/types';
import type { InboxCiItem, InboxPrItem } from '@/lib/inbox';
import { FIXTURE_PATH, seedAuditFixture } from './audit-fixtures';

// One big repository for every view benchmark: the `performance` fixture (1000 files, 10000 commits)
// plus large branch, PR, stash, dashboard, hub, inbox, command-log and terminal data.
declare global { interface Window { __L8GIT_PERF__?: { router: typeof router; ui: typeof useUiStore; terminal: typeof useTerminalStore; seedHub: () => void } } }

const DAY = 86_400_000;
// Today at 00:00 UTC: stable within a day and always inside the dashboard's "last N days" windows.
const NOW = Math.floor(Date.now() / DAY) * DAY;
const iso = (ms: number) => new Date(ms).toISOString();
const hash = (i: number) => (i + 1).toString(16).padStart(40, '0');
const people = Array.from({ length: 120 }, (_, i) => `dev-${String(i).padStart(3, '0')}`);
const groups = ['feature', 'fix', 'chore', 'release', 'user/alice', 'user/bob', 'spike', 'deps'];

const branches: Branch[] = [
  { name: 'main', tip: hash(0), is_current: true, is_remote: false },
  ...Array.from({ length: 400 }, (_, i) => ({ name: `${groups[i % groups.length]}/topic-${String(i).padStart(4, '0')}`, tip: hash(i), is_current: false, is_remote: false, behind: i % 7 })),
  ...Array.from({ length: 1200 }, (_, i) => ({ name: `origin/${groups[i % groups.length]}/remote-${String(i).padStart(4, '0')}`, tip: hash(i), is_current: false, is_remote: true })),
];
const tags: TagRef[] = Array.from({ length: 400 }, (_, i) => ({ name: `v${Math.floor(i / 100)}.${Math.floor(i / 10) % 10}.${i % 10}`, commit: hash(i * 3), kind: i % 3 ? 'lightweight' : 'annotated', message: null, tagger: null }));
const prs: PullRequest[] = Array.from({ length: 2000 }, (_, i) => ({
  number: 5000 - i, title: `Improve ${groups[i % groups.length]} handling for module ${i % 97} and friends`, state: i % 5 === 0 ? 'merged' : i % 11 === 0 ? 'closed' : 'open', is_draft: i % 6 === 1,
  author: people[i % people.length], author_avatar: null, source_branch: `feature/topic-${i}`, target_branch: 'main', html_url: `https://github.com/acme/big/pull/${5000 - i}`,
  created_at: iso(NOW - i * 3_600_000 * 7), updated_at: iso(NOW - i * 3_600_000), labels: i % 3 ? ['enhancement'] : ['bug', 'needs-review'],
  reviewers: [{ login: people[(i + 1) % people.length], avatar: null }, { login: people[(i + 2) % people.length], avatar: null }], provider: 'github',
}));
const stashes: StashEntry[] = Array.from({ length: 500 }, (_, i) => ({ index: i, refname: `stash@{${i}}`, branch: 'main', subject: `WIP on main: experiment ${i}`, date: iso(NOW - i * DAY / 3), hash: hash(20_000 + i), message: `WIP on main: ${hash(i).slice(-7)} experiment ${i}` }));
const commandLog = Array.from({ length: 500 }, (_, i) => ({ seq: i, repoPath: FIXTURE_PATH, args: i % 3 ? ['status', '--porcelain=v2', '-z'] : ['log', '--format=%H%x00%s', '-n', '80', `--skip=${i * 80}`], exitOk: i % 17 !== 0, durationMs: 3 + (i % 40), startedAt: iso(NOW - (500 - i) * 1000) }));

function buckets(sinceDays: number, bucket: string) {
  if (bucket === 'month') return Array.from({ length: 13 }, (_, i) => ({ bucket: iso(NOW - i * 30 * DAY).slice(0, 7), commits: 200 + i * 7, insertions: 9000 + i * 100, deletions: 4000 + i * 50 }));
  return Array.from({ length: sinceDays }, (_, i) => ({ bucket: iso(NOW - i * DAY).slice(0, 10), commits: (i * 7) % 23, insertions: (i * 131) % 900, deletions: (i * 71) % 400 }));
}

const account: HubAccount = { host: 'github.com', provider: 'github', login: 'fixture', name: 'Fixture', avatar_url: null };
const hubRepo = (i: number): HubRepo => ({ fullName: `acme/repo-${String(i).padStart(4, '0')}`, name: `repo-${i}`, owner: 'acme', ownerAvatar: null, description: `Service number ${i} with a moderately long description that wraps`, stars: i * 13, forks: i * 2, openPrs: i % 30, private: i % 4 === 0, fork: i % 9 === 0, language: { name: ['TypeScript', 'Rust', 'Go', 'Python'][i % 4], color: ['#3178c6', '#dea584', '#00ADD8', '#3572A5'][i % 4] }, updatedAt: iso(NOW - i * DAY), url: `https://github.com/acme/repo-${i}`, cloneUrl: `https://github.com/acme/repo-${i}.git` });
const hubPr = (i: number): HubPr => ({ id: `pr-${i}`, number: 900 - i, title: `Refactor subsystem ${i}`, url: `https://github.com/acme/big/pull/${900 - i}`, repo: 'acme/big', author: { login: people[i % people.length], avatarUrl: null }, createdAt: iso(NOW - i * DAY), updatedAt: iso(NOW - i * 3_600_000), draft: i % 5 === 0, baseBranch: 'main', state: 'open', checks: i % 3 ? 'success' : 'failure', review: i % 2 ? 'approved' : 'required', additions: i * 10, deletions: i * 3, comments: i % 9 });
const weeks = Array.from({ length: 260 }, (_, w) => Math.floor((NOW - (260 - w) * 7 * DAY) / 1000));
const repoDetail: HubRepoDetail = {
  ...hubRepo(1), fullName: 'acme/big', name: 'big', homepage: null, license: 'MIT', topics: ['git', 'desktop'], defaultBranch: 'main', starred: false, canAdmin: true, sshUrl: null,
  releaseCount: 80, latestRelease: null, pulls: Array.from({ length: 10 }, (_, i) => hubPr(i)), openIssues: 300,
  commits: Array.from({ length: 30 }, (_, i) => ({ sha: hash(i), message: `Commit ${i}`, author: { login: people[i % people.length], avatarUrl: null }, authorName: people[i % people.length], date: iso(NOW - i * 3_600_000), url: '', checks: 'success' })),
  languages: [{ name: 'TypeScript', color: '#3178c6', share: 0.7 }, { name: 'Rust', color: '#dea584', share: 0.3 }],
  contributors: people.slice(0, 30).map((login, i) => ({ login, avatarUrl: null, contributions: 3000 - i * 90 })), starHistory: Array.from({ length: 30 }, (_, i) => 1000 + i * 4), starHistoryCapped: false,
};
// GitHub's stats endpoint caps at 100 authors; 260 weeks is five years of history.
const contributorStats: HubContributorStats = {
  computing: false,
  weekly: people.slice(0, 100).map((login, p) => ({ login, avatarUrl: null, weeks: weeks.map((w, i) => ({ w, a: ((i + p) * 37) % 800, d: ((i + p) * 17) % 300, c: ((i * (p + 3)) % 11) })) })),
  commits: Array.from({ length: 100 }, (_, i) => ({ sha: hash(i), message: `Change ${i}`, url: '', date: iso(NOW - i * 3_600_000), login: people[i % 100], avatarUrl: null, additions: i * 5, deletions: i * 2, files: i < 30 ? Array.from({ length: 12 }, (_, f) => ({ path: `src/${['ui', 'core', 'net'][f % 3]}/file-${f}.${['ts', 'rs', 'css'][f % 3]}`, additions: f * 3, deletions: f })) : null })),
};

export function seedPerfFixture(scene: string): boolean {
  if (scene !== 'performance-app') return false;
  seedAuditFixture('performance');
  const base = window.__L8GIT_TEST_INVOKE__!;
  window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
    switch (command) {
      case 'open_repo': return { ...(await base(command, args) as object), branches, tags };
      case 'pr_list': return prs;
      case 'list_stashes': return stashes;
      case 'git_command_log': return commandLog;
      case 'repo_activity_buckets': return buckets(Number(args?.sinceDays), String(args?.bucket));
      case 'repo_contributor_stats': return people.slice(0, 64).map((name, i) => ({ name, email: `${name}@example.com`, commits: 900 - i * 13, insertions: 50_000 - i * 700, deletions: 20_000 - i * 300 }));
      case 'repo_language_stats': return ['TypeScript', 'Rust', 'CSS', 'Shell', 'JSON', 'Markdown', 'HTML', 'Python'].map((language, i) => ({ language, color: '#888', bytes: 100_000 >> i, percent: 50 / (i + 1) }));
      case 'repo_branch_activity': return branches.map((b, i) => ({ name: b.name, is_remote: b.is_remote, last_commit_at: iso(NOW - i * DAY / 4) }));
      case 'git_bisect_status': return { active: false, done: false, current_hash: null, result_hash: null, marked_bad: [], marked_good: [] };
      case 'pty_open': {
        // 5000 lines of build-like output; xterm keeps the last 2000 as scrollback.
        const onData = args?.onData as { onmessage: ((data: ArrayBuffer) => void) | null };
        const text = Array.from({ length: 5000 }, (_, i) => `\x1b[32m✓\x1b[0m src/module-${i % 50}/file-${i}.test.ts \x1b[2m(${i % 40} tests)\x1b[0m ${i * 3}ms\r\n`).join('');
        setTimeout(() => onData.onmessage?.(new TextEncoder().encode(text).buffer), 50);
        return 1;
      }
      case 'pty_write': case 'pty_resize': case 'pty_close': return null;
      default: return base(command, args);
    }
  };
  useRepoStore.setState(s => ({ repos: { ...s.repos, [FIXTURE_PATH]: { ...s.repos[FIXTURE_PATH], branches, tags } } }));
  useInboxStore.setState({
    lastLoadedAt: Date.now(), readKeys: [],
    sections: {
      myPrs: prs.slice(0, 300).map((pr, i): InboxPrItem => ({ key: `mine-${i}`, path: FIXTURE_PATH, repoName: 'big', number: pr.number, title: pr.title, author: 'fixture', isDraft: pr.is_draft, sourceBranch: pr.source_branch, targetBranch: 'main', htmlUrl: pr.html_url, updatedAt: pr.updated_at, reviewers: pr.reviewers.map(r => r.login), provider: 'github', checks: (['success', 'failure', 'running', 'unknown'] as const)[i % 4] })),
      reviewRequested: prs.slice(300, 600).map((pr, i): InboxPrItem => ({ key: `review-${i}`, path: FIXTURE_PATH, repoName: 'big', number: pr.number, title: pr.title, author: pr.author, isDraft: false, sourceBranch: pr.source_branch, targetBranch: 'main', htmlUrl: pr.html_url, updatedAt: pr.updated_at, reviewers: ['fixture'], provider: 'github', checks: 'success' })),
      redRuns: Array.from({ length: 300 }, (_, i): InboxCiItem => ({ key: `run-${i}`, path: FIXTURE_PATH, repoName: 'big', runId: i, name: 'CI', branch: `feature/topic-${i}`, conclusion: 'failure', event: 'push', runNumber: 9000 - i, htmlUrl: '', updatedAt: iso(NOW - i * 3_600_000) })),
    },
  });
  // Hub reads go through a 60 s cache; seeding it skips the GitHub wire formats.
  useHubStore.setState({ accounts: [account], activeKey: accountKey(account) });
  window.__L8GIT_PERF__ = { router, ui: useUiStore, terminal: useTerminalStore, seedHub };
  seedHub();
  return true;
}

function seedHub() {
  const seed = (key: string, value: unknown) => { hubCache.clear(`${accountKey(account)}|${key}`); void hubCache.get(`${accountKey(account)}|${key}`, async () => value); };
  const repos = Array.from({ length: 1000 }, (_, i) => hubRepo(i));
  seed('sidebar', { repos: repos.slice(0, 40), repoCount: 1000, prCount: 120, reviewCount: 40 });
  seed('contributions', Array.from({ length: 365 }, (_, i) => ({ date: iso(NOW - (364 - i) * DAY).slice(0, 10), count: (i * 7) % 13 })));
  for (const kind of ['review', 'authored', 'assigned', 'mentioned']) seed(`pulls:${kind}`, Array.from({ length: 200 }, (_, i) => hubPr(i)));
  seed('repos', repos);
  seed('starred', repos.slice(0, 300));
  seed('repo:acme/big', repoDetail);
  seed('contributorStats:acme/big:0', contributorStats);
}
