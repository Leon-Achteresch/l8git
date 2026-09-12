import { useOnboardingPrefs } from '@/lib/onboarding-prefs';
import { useRepoStore, type StatusEntry, type Commit } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { useWorkspaceStore } from '@/lib/workspace-store';
export const FIXTURE_PATH = '/tmp/l8git-audit-fixture';
export const PATCH = 'diff --git a/example.txt b/example.txt\nindex 1111111..2222222 100644\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old content\n+reviewed content\n';
export type TestInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
declare global { interface Window { __L8GIT_TEST_INVOKE__?: TestInvoke; __L8GIT_TEST_CALLS__?: { command: string; args?: Record<string, unknown> }[] } }
export function seedAuditFixture(scene: string) {
  useOnboardingPrefs.setState({ tourDone: true, tourActive: false, welcomeDismissed: true });
  if (scene === 'remote-dialog') {
    localStorage.setItem('l8git.git-accounts.v2', JSON.stringify([{ id: 'github', name: 'GitHub', host: 'github.com', username: 'fixture', builtin: true }]));
    window.__L8GIT_TEST_INVOKE__ = async (command) => {
      if (command === 'list_git_remotes') return [];
      if (command === 'git_credential_helper') return null;
      throw new Error(`Unavailable in remote dialog fixture: ${command}`);
    };
    useRepoStore.setState({ paths: [], activePath: null });
    return;
  }
  if (scene === 'app') {
    window.__L8GIT_TEST_INVOKE__ = async (cmd) => {
      if (cmd === 'git_credential_helper') return null;
      if (cmd === 'remote_status') return { running: false, managed: false, port: 9418, relay: null, roots: [], binary: null, configPath: null };
      throw new Error(`Unavailable in offline fixture: ${cmd}`);
    };
    useRepoStore.setState({ paths: [], activePath: null });
    return;
  }
  let entries: StatusEntry[] = [{ path: 'example.txt', index_status: scene === 'conflict' ? 'U' : ' ', worktree_status: scene === 'conflict' ? 'U' : 'M', staged: false, unstaged: true, untracked: false, additions_staged: 0, deletions_staged: 0, additions_unstaged: 1, deletions_unstaged: 1, binary: false, embedded_repo: false }];
  const base: Commit = { hash: 'a'.repeat(40), short_hash: 'aaaaaaa', subject: 'Initial fixture', author: 'Fixture', email: 'fixture@example.com', date: '2026-09-05T12:00:00Z', body: '', parents: [], tags: [], author_avatar: null };
  let commits = [base];
  if (scene === 'performance' || scene === 'performance-history') {
    entries = Array.from({ length: 1000 }, (_, i) => ({ ...entries[0], path: `files/file-${String(i).padStart(4, '0')}.txt` }));
    commits = Array.from({ length: 10_000 }, (_, i) => ({ ...base, hash: (10_000 - i).toString(16).padStart(40, '0'), short_hash: String(10_000 - i), subject: `Fixture commit ${i}`, parents: i === 9999 ? [] : [(9999 - i).toString(16).padStart(40, '0')] }));
  }
  let merge = scene === 'conflict';
  let resolved = false;
  const info = () => ({ path: FIXTURE_PATH, branch: 'main', commits, branches: [{ name: 'main', tip: commits[0].hash, is_current: true, is_remote: false }], tags: [] });
  window.__L8GIT_TEST_CALLS__ = [];
  window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
    window.__L8GIT_TEST_CALLS__!.push({ command, args });
    switch (command) {
      case 'remote_status': return { running: false, managed: false, port: 9418, relay: null, roots: [], binary: null, configPath: null };
      case 'open_repo': return info();
      case 'repo_full_status': return { entries, upstream_sync: { ahead: commits.length - 1, behind: 0 }, has_upstream: true };
      case 'repo_status': return entries;
      case 'repo_file_diff': return { staged: entries[0]?.staged ? PATCH : null, unstaged: entries[0]?.unstaged ? PATCH : null, untracked_plain: null, is_binary: false };
      case 'repo_staged_diff': return PATCH;
      case 'stage_files': entries = entries.map(e => ({ ...e, staged: true, unstaged: false, index_status: 'M', worktree_status: ' ', additions_staged: 1, deletions_staged: 1 })); return null;
      case 'unstage_files': entries = entries.map(e => ({ ...e, staged: false, unstaged: true, index_status: ' ', worktree_status: 'M' })); return null;
      case 'commit_changes':
        if (!entries.some(e => e.staged)) throw Error('Nothing staged');
        commits = [{ ...base, hash: 'b'.repeat(40), short_hash: 'bbbbbbb', subject: String(args?.message), parents: [base.hash] }, base]; entries = []; return null;
      case 'git_reset': commits = [base]; entries = [{ path: 'example.txt', index_status: 'M', worktree_status: ' ', staged: true, unstaged: false, untracked: false, additions_staged: 1, deletions_staged: 1, additions_unstaged: 0, deletions_unstaged: 0, binary: false, embedded_repo: false }]; return 'Commit undone';
      case 'merge_state': return { in_progress: merge, merge_head: merge ? 'c'.repeat(40) : null, conflicted_paths: merge && !resolved ? ['example.txt'] : [] };
      case 'git_get_conflict_versions': return { base: 'base content\n', ours: 'local content\n', theirs: 'incoming content\n', current: '<<<<<<< HEAD\nlocal content\n=======\nincoming content\n>>>>>>> feature\n' };
      case 'git_save_resolved_file': if (String(args?.content).includes('<<<<<<<')) throw Error('Unresolved conflict'); resolved = true; entries = []; return null;
      case 'git_merge_commit': if (!resolved) throw Error('Unresolved conflict'); merge = false; return 'Merge completed';
      case 'rebase_status': return { in_progress: false, conflicted_paths: [] };
      case 'cherry_pick_state': return { in_progress: false, head: null, conflicted_paths: [] };
      case 'agent_review_summary': return { baseBranch: 'main', sessionBranch: 'agents/fixture', mergeBase: base.hash, files: [{ path: 'example.txt', additions: 1, deletions: 1, binary: false, untracked: false }], additions: 1, deletions: 1, commits: 0, uncommitted: 1 };
      case 'agent_review_file_diff': return { diff: PATCH, untrackedPlain: null, isBinary: false };
      case 'agent_review_branch_merged': return true;
      case 'git_merge': return 'Merged';
      case 'git_worktree_remove': case 'delete_branch': return null;
      case 'stack_list': return { stacks: [], branches: [] };
      case 'list_stashes': case 'list_worktrees': case 'list_remotes': case 'resolve_repo_commit_avatars': case 'reflog_list': case 'git_command_log': return [];
      case 'read_repo_favicon': case 'git_credential_helper': return null;
      default: throw Error(`Unimplemented fixture command: ${command}`);
    }
  };
  useRepoStore.setState({ paths: [FIXTURE_PATH], activePath: FIXTURE_PATH, repos: { [FIXTURE_PATH]: info() }, status: { [FIXTURE_PATH]: entries }, stashes: { [FIXTURE_PATH]: [] }, favicons: { [FIXTURE_PATH]: null } });
  useWorkspaceStore.getState().initDefaultWorkspace([FIXTURE_PATH]);
  useUiStore.getState().setSidebarTab(scene === 'performance-history' ? 'history' : 'commit');
}
