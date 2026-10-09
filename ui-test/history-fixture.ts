import { useOnboardingPrefs } from '@/lib/onboarding-prefs';
import { useRepoStore, type Branch, type Commit, type RepoInfo } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { useWorkspaceStore } from '@/lib/workspace-store';
import type { HistoryFilter } from '@/lib/ipc/git';
import type { TestInvoke } from './audit-fixtures';

export const HISTORY_FIXTURE_PATH = '/tmp/l8git-history-fixture';
export const HISTORY_SECONDARY_PATH = '/tmp/l8git-history-secondary';
export const historyFixtureHash = (index: number) => (120 - index).toString(16).padStart(40, '0');
const named = [
  { subject: 'Release login redirect fix', author: 'Alice Rivera', email: 'alice@example.com', date: '2026-10-08T12:00:00Z', body: 'Preserve callback redirects during release rollout.', files: ['src/auth/login.ts'] },
  { subject: 'Document token expiry', author: 'Bob Chen', email: 'bob@example.com', date: '2026-10-07T23:59:00Z', body: 'Release note: parser [literal], token expiry protocol.', files: ['docs/security.md'] },
  { subject: 'Handle retry budgets', author: 'Alice Rivera', email: 'alice@example.com', date: '2026-10-07T00:01:00Z', body: 'Release retry budgets for network operations.', files: ['src/net/retry.ts'] },
  { subject: 'Normalize mail addresses', author: 'Carla Nguyen', email: 'carla@example.com', date: '2026-10-06T16:00:00Z', body: 'Release parser [literal] guard for unusual addresses.', files: ['src/parser.ts'] },
];
export const HISTORY_FIXTURE_COMMITS: Commit[] = Array.from({ length: 120 }, (_, index) => {
  const sample = named[index];
  const hash = historyFixtureHash(index);
  return {
    hash, short_hash: hash.slice(-7), subject: sample?.subject ?? `Release audit ${String(index).padStart(3, '0')}`,
    author: sample?.author ?? 'Dana Brooks', email: sample?.email ?? 'dana@example.com',
    date: sample?.date ?? new Date(Date.UTC(2026, 9, 5 - Math.floor((index - 4) / 2), 12)).toISOString(),
    body: sample?.body ?? `Inspect release history page ${Math.floor(index / 80) + 1}.`,
    parents: index < 119 ? [historyFixtureHash(index + 1)] : [], tags: index === 2 ? ['v1.2'] : [], author_avatar: null,
  };
});

function filesFor(commit: Commit): string[] {
  const index = HISTORY_FIXTURE_COMMITS.findIndex(item => item.hash === commit.hash);
  return named[index]?.files ?? [`src/history/commit-${index}.ts`];
}

function matchesPath(file: string, pathspec: string): boolean {
  if (!pathspec) return true;
  if (pathspec.startsWith(':(glob)')) {
    const expression = pathspec.slice(7).split('**').map(part => part.split('*').map(segment => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
    return new RegExp(`^${expression}$`).test(file);
  }
  return file === pathspec || file.startsWith(pathspec.endsWith('/') ? pathspec : pathspec + '/');
}

function applyFilter(commits: Commit[], filter: HistoryFilter): Commit[] {
  let start = 0;
  if (filter.refs.length) {
    const indexes = filter.refs.map(reference => HISTORY_FIXTURE_COMMITS.findIndex(commit => commit.hash === reference));
    start = Math.min(...indexes.filter(index => index >= 0));
    if (!Number.isFinite(start)) return [];
  }
  const lower = filter.since ? new Date(filter.since + 'T00:00:00').getTime() : -Infinity;
  const upper = filter.until ? new Date(filter.until + 'T23:59:59.999').getTime() : Infinity;
  return commits.filter((commit, index) => index >= start
    && `${commit.subject}\n${commit.body}`.toLocaleLowerCase().includes(filter.query.trim().toLocaleLowerCase())
    && `${commit.author} <${commit.email}>`.toLocaleLowerCase().includes(filter.author.trim().toLocaleLowerCase())
    && new Date(commit.date).getTime() >= lower && new Date(commit.date).getTime() <= upper
    && filesFor(commit).some(file => matchesPath(file, filter.file)));
}

/** Claim only this scene; other audit fixtures keep their existing behavior. */
export function seedHistoryFixture(scene: string): boolean {
  if (scene !== 'history-workflow') return false;
  useOnboardingPrefs.setState({ tourDone: true, tourActive: false, welcomeDismissed: true });
  const commits = HISTORY_FIXTURE_COMMITS;
  const branches: Branch[] = [
    { name: 'main', tip: commits[0].hash, is_current: true, is_remote: false },
    { name: 'release/1.2', tip: commits[2].hash, is_current: false, is_remote: false },
  ];
  const info: RepoInfo = { path: HISTORY_FIXTURE_PATH, branch: 'main', commits: commits.slice(0, 80), branches, tags: [] };
  const secondaryCommit: Commit = { ...commits[0], hash: 'f'.repeat(40), short_hash: 'fffffff', subject: 'Secondary repository baseline', author: 'Sam Patel', email: 'sam@example.com', parents: [], tags: [] };
  const secondaryInfo: RepoInfo = { path: HISTORY_SECONDARY_PATH, branch: 'main', commits: [secondaryCommit], branches: [{ name: 'main', tip: secondaryCommit.hash, is_current: true, is_remote: false }], tags: [] };
  window.__L8GIT_TEST_CALLS__ = [];
  const invoke: TestInvoke = async (command, args) => {
    window.__L8GIT_TEST_CALLS__!.push({ command, args });
    const secondary = args?.path === HISTORY_SECONDARY_PATH;
    switch (command) {
      case 'remote_status': return { running: false, managed: false, port: 9418, relay: null, roots: [], binary: null, configPath: null };
      case 'open_repo': return secondary ? secondaryInfo : info;
      case 'repo_history_page': return applyFilter(secondary ? [secondaryCommit] : commits, args?.filter as HistoryFilter).slice(Number(args?.skip ?? 0), Number(args?.skip ?? 0) + Number(args?.limit ?? 80));
      case 'repo_log_page': return (secondary ? [secondaryCommit] : commits).slice(Number(args?.skip ?? 0), Number(args?.skip ?? 0) + Number(args?.limit ?? 80));
      case 'repo_full_status': return { entries: [], upstream_sync: { ahead: 0, behind: 0 }, has_upstream: true };
      case 'repo_status': return [];
      case 'repo_commit_inspect': {
        const commit = secondary ? secondaryCommit : commits.find(commit => commit.hash === args?.commit || (args?.commit === 'HEAD' && commit === commits[0]));
        if (!commit) throw Error('Unknown history fixture commit');
        return { header: `commit ${commit.hash}\nAuthor: ${commit.author} <${commit.email}>\nAuthorDate: ${commit.date}\n\n    ${commit.subject}\n\n    ${commit.body}\n`, files: [] };
      }
      case 'commit_signature_status': return { state: 'unsigned', signer: null, key: null };
      case 'git_bisect_status': return { active: false, done: false, current_hash: null, result_hash: null, marked_bad: [], marked_good: [] };
      case 'rebase_status': return { in_progress: false, conflicted_paths: [] };
      case 'merge_state': return { in_progress: false, merge_head: null, conflicted_paths: [] };
      case 'cherry_pick_state': return { in_progress: false, head: null, conflicted_paths: [] };
      case 'stack_list': return { stacks: [], branches: [] };
      case 'list_stashes': case 'list_remotes': case 'resolve_repo_commit_avatars': case 'git_command_log': case 'list_repo_tools': case 'list_worktrees': return [];
      case 'read_repo_favicon': case 'git_credential_helper': return null;
      default: throw Error(`Unimplemented history fixture command: ${command}`);
    }
  };
  window.__L8GIT_TEST_INVOKE__ = invoke;
  useRepoStore.setState({ paths: [HISTORY_FIXTURE_PATH, HISTORY_SECONDARY_PATH], activePath: HISTORY_FIXTURE_PATH, repos: { [HISTORY_FIXTURE_PATH]: info, [HISTORY_SECONDARY_PATH]: secondaryInfo }, status: { [HISTORY_FIXTURE_PATH]: [], [HISTORY_SECONDARY_PATH]: [] }, stashes: { [HISTORY_FIXTURE_PATH]: [], [HISTORY_SECONDARY_PATH]: [] }, favicons: { [HISTORY_FIXTURE_PATH]: null, [HISTORY_SECONDARY_PATH]: null } });
  useWorkspaceStore.getState().initDefaultWorkspace([HISTORY_FIXTURE_PATH, HISTORY_SECONDARY_PATH]);
  useUiStore.getState().setSidebarTab('history');
  return true;
}
