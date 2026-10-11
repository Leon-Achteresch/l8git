import { useOnboardingPrefs } from '@/lib/onboarding-prefs';
import { useRepoStore, type StatusEntry, type Commit } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { useWorkspaceStore } from '@/lib/workspace-store';
import { useCommitPrefs } from '@/lib/commit-prefs';
import type { HistoryFilter } from '@/lib/ipc/git';
export const FIXTURE_PATH = '/tmp/l8git-audit-fixture';
export const PATCH = 'diff --git a/example.txt b/example.txt\nindex 1111111..2222222 100644\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old content\n+reviewed content\n';
export type TestInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type SplitFixtureControl = { indexRevision: number; worktreeRevision: number; failGroup: number | null;
  committed: number; stagedFiles: string[]; holdGroup: number | null; pendingGroup: number | null;
  releaseGroup: (() => void) | null; externalStage: boolean; changeOwner: (path: string) => void };
declare global { interface Window { __L8GIT_TEST_INVOKE__?: TestInvoke; __L8GIT_TEST_CALLS__?: { command: string; args?: Record<string, unknown> }[]; __L8GIT_HUNK_FIXTURE__?: { changeBeforeApply: boolean; revision: number }; __L8GIT_SPLIT_FIXTURE__?: SplitFixtureControl } }
export function seedAuditFixture(scene: string) {
  useOnboardingPrefs.setState({ tourDone: true, tourActive: false, welcomeDismissed: true });
  if (scene === 'split' || scene === 'split-worktree') { seedCommitSplitFixture(scene === 'split-worktree' ? '/tmp/base-fixture' : FIXTURE_PATH); return; }
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
  const stagedHunks = new Set<number>();
  const worktreeHunks = new Set([0, 1, 2]);
  const hunkFixture = scene === 'hunk-batch' ? { changeBeforeApply: false, revision: 0 } : null;
  if (hunkFixture) window.__L8GIT_HUNK_FIXTURE__ = hunkFixture;
  const hunkDiff = (indices: ReadonlySet<number>) => !indices.size ? null : [
    'diff --git a/example.txt b/example.txt', 'index 1111111..2222222 100644', '--- a/example.txt', '+++ b/example.txt',
    ...[...indices].sort((a, b) => a - b).flatMap(index => [`@@ -${index * 20 + 1},3 +${index * 20 + 1},3 @@`,
      ` before ${index}`, `-old change ${index}`, `+new change ${index}`, ` after ${index}`]), '',
  ].join('\n');
  const unstagedHunks = () => new Set([...worktreeHunks].filter(index => !stagedHunks.has(index)));
  const updateHunkStatus = () => {
    entries = [{ ...entries[0], index_status: stagedHunks.size ? 'M' : ' ', worktree_status: unstagedHunks().size ? 'M' : ' ',
      staged: stagedHunks.size > 0, unstaged: unstagedHunks().size > 0, additions_staged: stagedHunks.size, deletions_staged: stagedHunks.size,
      additions_unstaged: unstagedHunks().size, deletions_unstaged: unstagedHunks().size }];
  };
  if (hunkFixture) updateHunkStatus();
  if (scene === 'partial-staging') {
    entries = ['first.txt', 'second.txt', 'third.txt'].map(path => ({ ...entries[0], path, index_status: 'M', worktree_status: 'M', staged: true, unstaged: true, additions_staged: 1, deletions_staged: 1 }));
  }
  if (scene === 'recovery') {
    entries = [];
    commits = [{ ...base, hash: 'b'.repeat(40), short_hash: 'bbbbbbb', subject: 'Recoverable change', parents: [base.hash] }, base];
  }
  if (scene === 'performance' || scene === 'performance-history') {
    entries = Array.from({ length: 1000 }, (_, i) => ({ ...entries[0], path: `files/file-${String(i).padStart(4, '0')}.txt` }));
    commits = Array.from({ length: 10_000 }, (_, i) => ({ ...base, hash: (10_000 - i).toString(16).padStart(40, '0'), short_hash: String(10_000 - i), subject: `Fixture commit ${i}`, parents: i === 9999 ? [] : [(9999 - i).toString(16).padStart(40, '0')] }));
  }
  let merge = scene === 'conflict';
  let resolved = false;
  let reviewMerged = false;
  let reviewRemoved = false;
  let reviewBranchDeleted = false;
  let reviewBaseHead = base;
  let recoveryVersion = 0;
  const restoredBranches: { name: string; tip: string; is_current: boolean; is_remote: boolean }[] = [];
  const reviewBasePath = '/tmp/base-fixture';
  const fileFingerprint = async (file: string) => {
    const data = new TextEncoder().encode(JSON.stringify([file, commits[0].hash, entries.find(entry => entry.path === file), PATCH,
      ...(hunkFixture ? [hunkFixture.revision, [...stagedHunks], [...worktreeHunks]] : [])]));
    const hash = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const checkFiles = async (args?: Record<string, unknown>) => {
    const files = (args?.files as string[] | undefined) ?? [];
    const expected = args?.expectedFingerprints as string[] | null | undefined;
    if (expected && expected.length !== files.length) throw Error('Mismatched fingerprint count');
    if (expected) for (const [index, file] of files.entries()) {
      if (expected[index] !== await fileFingerprint(file)) throw Error(`__FILE_CHANGED__|${file}`);
    }
    return files;
  };
  const info = (path = FIXTURE_PATH) => {
    const reviewing = scene === 'review';
    const branch = reviewing && path === FIXTURE_PATH ? 'agents/fixture' : 'main';
    const head = reviewing && path === reviewBasePath ? reviewBaseHead : commits[0];
    return { path, branch, commits: reviewing && path === reviewBasePath ? [head] : commits, branches: [
      { name: 'main', tip: reviewing ? reviewBaseHead.hash : commits[0].hash, is_current: branch === 'main', is_remote: false },
      ...(reviewing && !reviewBranchDeleted ? [{ name: 'agents/fixture', tip: commits[0].hash, is_current: branch === 'agents/fixture', is_remote: false }] : []),
      ...restoredBranches,
    ], tags: [] };
  };
  window.__L8GIT_TEST_CALLS__ = [];
  window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
    window.__L8GIT_TEST_CALLS__!.push({ command, args });
    if (scene === 'health') {
      if (['repo_activity_buckets', 'repo_branch_activity', 'repo_language_stats', 'repo_contributor_stats', 'pr_list'].includes(command)) return [];
      if (command === 'git_bisect_status') return { active: false, current: null, good: null, bad: null, remaining: null };
    }
    switch (command) {
      case 'remote_status': return { running: false, managed: false, port: 9418, relay: null, roots: [], binary: null, configPath: null };
      case 'open_repo': return info(String(args?.path ?? FIXTURE_PATH));
      case 'repo_log_page': return commits.slice(Number(args?.skip ?? 0), Number(args?.skip ?? 0) + Number(args?.limit ?? 80));
      case 'repo_history_page': {
        const filter = args?.filter as HistoryFilter;
        const indexes = filter.refs.map(reference => commits.findIndex(commit => commit.hash === reference));
        const start = filter.refs.length ? Math.min(...indexes.filter(index => index >= 0)) : 0;
        // These synthetic audit commits expose no changed-path metadata in repo_commit_inspect.
        const filtered = commits.filter((commit, index) => index >= start && !filter.file
          && `${commit.subject}\n${commit.body}`.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase())
          && `${commit.author} <${commit.email}>`.toLocaleLowerCase().includes(filter.author.toLocaleLowerCase())
          && (!filter.since || commit.date.slice(0, 10) >= filter.since)
          && (!filter.until || commit.date.slice(0, 10) <= filter.until));
        return filtered.slice(Number(args?.skip ?? 0), Number(args?.skip ?? 0) + Number(args?.limit ?? 80));
      }
      case 'repo_full_status': return { entries, upstream_sync: { ahead: commits.length - 1, behind: 0 }, has_upstream: true };
      case 'repo_status': return scene === 'review' && args?.path === reviewBasePath ? [] : entries;
      case 'repo_commit_inspect': {
        const commit = args?.commit === 'HEAD' ? (scene === 'review' && args?.path === reviewBasePath ? reviewBaseHead : commits[0]) : commits.find(commit => commit.hash === args?.commit);
        if (!commit) throw Error('Unknown fixture commit');
        return { header: `commit ${commit.hash}\nAuthor:     ${commit.author} <${commit.email}>\nAuthorDate: ${commit.date}\n\n${[commit.subject, ...(commit.body ? ['', ...commit.body.split('\n')] : [])].map(line => `    ${line}`).join('\n')}\n`, files: [] };
      }
      case 'repo_file_diff': {
        if (hunkFixture) return { staged: hunkDiff(stagedHunks), unstaged: hunkDiff(unstagedHunks()), untracked_plain: null,
          is_binary: false, fingerprint: args?.includeFingerprint ? await fileFingerprint(String(args?.file)) : null };
        const entry = entries.find(entry => entry.path === args?.file) ?? entries[0];
        return { staged: entry?.staged ? PATCH : null, unstaged: entry?.unstaged ? PATCH : null, untracked_plain: null, is_binary: false, fingerprint: args?.includeFingerprint ? await fileFingerprint(String(args?.file)) : null };
      }
      case 'git_apply_reviewed_hunks': {
        if (!hunkFixture || args?.file !== 'example.txt') throw Error('Unavailable batch fixture');
        if (hunkFixture.changeBeforeApply) { hunkFixture.changeBeforeApply = false; hunkFixture.revision += 1; }
        if (args?.expectedFingerprint !== await fileFingerprint(String(args?.file))) throw Error('__FILE_CHANGED__|example.txt');
        const patches = args?.patches as string[];
        const indices = new Set(patches.flatMap(patch => [...patch.matchAll(/(?:old|new) change (\d+)/g)].map(match => Number(match[1]))));
        if (!patches.length || !indices.size || !['stage', 'unstage', 'discard'].includes(String(args?.action))) throw Error('Invalid batch fixture action');
        for (const index of indices) {
          if (args?.action === 'stage') stagedHunks.add(index);
          else if (args?.action === 'unstage') stagedHunks.delete(index);
          else worktreeHunks.delete(index);
        }
        updateHunkStatus();
        return null;
      }
      case 'repo_staged_diff': return PATCH;
      case 'reflog_list': return scene === 'recovery' ? commits.slice(Number(args?.skip ?? 0), Number(args?.skip ?? 0) + Number(args?.limit ?? 100)).map((commit, index) => ({ selector: `HEAD@{${Number(args?.skip ?? 0) + index}}`, hash: commit.hash, short_hash: commit.short_hash, action: 'commit', subject: commit.subject, message: commit.subject, date: commit.date })) : [];
      case 'undo_preview': return { action: 'commit', supported: commits.length > 1, target_hash: base.hash, target_short_hash: base.short_hash, target_subject: base.subject, description_key: 'undo.action.commit', snapshot: `fixture-${commits[0].hash}-${recoveryVersion}`, current_hash: commits[0].hash, current_short_hash: commits[0].short_hash, head_name: 'main', mode: 'soft' };
      case 'undo_last_operation': {
        if (args?.expectedSnapshot !== `fixture-${commits[0].hash}-${recoveryVersion}`) throw Error('__UNDO_CHANGED__');
        const from = commits[0].hash;
        commits = [base]; recoveryVersion++;
        entries = [{ path: 'example.txt', index_status: 'M', worktree_status: ' ', staged: true, unstaged: false, untracked: false, additions_staged: 1, deletions_staged: 1, additions_unstaged: 0, deletions_unstaged: 0, binary: false, embedded_repo: false }];
        return { undone_action: 'commit', from_hash: from, to_hash: base.hash, head_name: 'main' };
      }
      case 'reset_to_reflog_entry': {
        const index = Number(String(args?.selector).match(/^HEAD@\{(\d+)\}$/)?.[1]);
        const target = commits[index];
        if (!target || args?.expectedHash !== target.hash) throw Error('__REFLOG_CHANGED__');
        if (args?.expectedHead !== commits[0].hash) throw Error('__HEAD_CHANGED__');
        const from = commits[0].hash;
        commits = commits.slice(index); recoveryVersion++; entries = [];
        return { undone_action: 'reset', from_hash: from, to_hash: target.hash, head_name: 'main' };
      }
      case 'branch_restore': {
        const name = String(args?.name), hash = String(args?.hash);
        restoredBranches.push({ name, tip: hash, is_current: false, is_remote: false });
        return { name, hash, short_hash: hash.slice(0, 7) };
      }
      case 'list_repo_tools': return [];
      case 'lfs_available': return { installed: true, version: 'git-lfs/3.7.1', initialized: true, hasAttributes: true };
      case 'lfs_tracked_patterns': return [{ pattern: '*.png', source: '.gitattributes', excluded: false }];
      case 'lfs_ls_files': return { files: [{ oid: 'f'.repeat(64), path: 'art/example.png', size: '1.2 MB', downloaded: false }], total: 1, truncated: false };
      case 'lfs_track': case 'lfs_untrack': case 'lfs_pull': return 'Done';
      case 'repo_compare_commits': return {
        base: String(args?.base), head: String(args?.head), mode: args?.mode ?? 'direct', base_hash: base.hash, head_hash: 'd'.repeat(40),
        merge_base: args?.mode === 'merge-base' ? 'e'.repeat(40) : null, ahead: 3, behind: 1,
        files: [
          { path: 'docs/new name.txt', previous_path: 'docs/old name.txt', status: 'R', additions: 0, deletions: 0, binary: false },
          { path: 'src/example.txt', previous_path: null, status: 'M', additions: 1, deletions: 1, binary: false },
        ], additions: 1, deletions: 1, total_files: 2, truncated: false,
      };
      case 'repo_compare_file_diff': return {
        patch: args?.file === 'docs/new name.txt' ? 'diff --git a/docs/old name.txt b/docs/new name.txt\nsimilarity index 100%\nrename from docs/old name.txt\nrename to docs/new name.txt\n' : PATCH,
        truncated: false, binary: false,
      };
      case 'stage_files': entries = entries.map(e => (args?.files as string[] | undefined)?.some(file => file === '.' || file === e.path) ? ({ ...e, staged: true, unstaged: false, index_status: 'M', worktree_status: ' ', additions_staged: 1, deletions_staged: 1 }) : e); return null;
      case 'unstage_files': entries = entries.map(e => (args?.files as string[] | undefined)?.some(file => file === '.' || file === e.path) ? ({ ...e, staged: false, unstaged: true, index_status: ' ', worktree_status: 'M', additions_staged: 0, deletions_staged: 0, additions_unstaged: 1, deletions_unstaged: 1 }) : e); return null;
      case 'git_discard_files': { const files = await checkFiles(args); entries = entries.filter(entry => !files.includes(entry.path)); return null; }
      case 'git_discard_worktree_changes': {
        const files = await checkFiles(args);
        entries = entries.flatMap(entry => !files.includes(entry.path) ? [entry] : entry.staged ? [{ ...entry, unstaged: false, untracked: false, worktree_status: ' ', additions_unstaged: 0, deletions_unstaged: 0 }] : []);
        return null;
      }
      case 'commit_changes':
        if (!entries.some(e => e.staged)) throw Error('Nothing staged');
        commits = [{ ...base, hash: 'b'.repeat(40), short_hash: 'bbbbbbb', subject: String(args?.message), parents: [base.hash] }, base]; entries = []; return null;
      case 'agent_review_commit_checked':
        if (args?.expectedBaseBranch !== 'main' || args?.expectedSessionBranch !== 'agents/fixture' ||
            args?.expectedBaseHead !== reviewBaseHead.hash || args?.expectedSessionHead !== commits[0].hash ||
            args?.expectedFingerprint !== await fileFingerprint('example.txt')) throw Error('agentReviewFinish.errors.reviewChanged');
        if (!entries.length) throw Error('agentReviewFinish.errors.nothingToCommit');
        if (!String(args?.message ?? '').split('\n')[0].trim()) throw Error('agentReviewFinish.errors.messageRequired');
        commits = [{ ...base, hash: 'b'.repeat(40), short_hash: 'bbbbbbb', subject: String(args?.message), parents: [base.hash] }, base]; entries = []; return commits[0].hash;
      case 'commit_amend':
        if (args?.expectedHead && args.expectedHead !== commits[0].hash) throw Error('__HEAD_CHANGED__');
        commits = [{ ...commits[0], hash: 'c'.repeat(40), short_hash: 'ccccccc', subject: String(args?.message).split('\n')[0] }, ...commits.slice(1)]; entries = []; return null;
      case 'git_reset':
        if (args?.expectedHead && args.expectedHead !== commits[0].hash) throw Error('__HEAD_CHANGED__');
        commits = [base]; entries = [{ path: 'example.txt', index_status: 'M', worktree_status: ' ', staged: true, unstaged: false, untracked: false, additions_staged: 1, deletions_staged: 1, additions_unstaged: 0, deletions_unstaged: 0, binary: false, embedded_repo: false }]; return 'Commit undone';
      case 'merge_state': return { in_progress: merge, merge_head: merge ? 'c'.repeat(40) : null, conflicted_paths: merge && !resolved ? ['example.txt'] : [] };
      case 'git_get_conflict_versions': return { base: 'base content\n', ours: 'local content\n', theirs: 'incoming content\n', current: '<<<<<<< HEAD\nlocal content\n=======\nincoming content\n>>>>>>> feature\n' };
      case 'git_save_resolved_file': if (String(args?.content).includes('<<<<<<<')) throw Error('Unresolved conflict'); resolved = true; entries = []; return null;
      case 'git_merge_commit': if (!resolved) throw Error('Unresolved conflict'); merge = false; return 'Merge completed';
      case 'rebase_status': return { in_progress: false, conflicted_paths: [] };
      case 'cherry_pick_state': return { in_progress: false, head: null, conflicted_paths: [] };
      case 'agent_review_summary': return { baseBranch: 'main', sessionBranch: 'agents/fixture', mergeBase: base.hash, files: [{ path: 'example.txt', additions: 1, deletions: 1, binary: false, untracked: false }], additions: 1, deletions: 1, commits: commits.length - 1, uncommitted: entries.length, fingerprint: args?.includeFingerprint ? await fileFingerprint('example.txt') : null };
      case 'agent_review_file_diff': return { diff: PATCH, untrackedPlain: null, isBinary: false, fingerprint: await fileFingerprint('example.txt') };
      case 'agent_review_discard_change':
        if (args?.expectedFingerprint !== await fileFingerprint(String(args?.file))) throw Error('__FILE_CHANGED__|' + args?.file);
        entries = entries.filter(entry => entry.path !== args?.file); return null;
      case 'agent_review_branch_merged': return reviewMerged;
      case 'git_merge': reviewMerged = true; reviewBaseHead = commits[0]; return 'Merged';
      case 'git_worktree_remove_checked': if (!reviewMerged || entries.length) throw Error('Session is not clean and integrated'); reviewRemoved = true; return null;
      case 'git_worktree_remove': reviewRemoved = true; return null;
      case 'delete_branch': reviewBranchDeleted = true; return null;
      case 'agent_review_delete_branch_checked':
        if (!reviewRemoved || !reviewMerged || args?.branch !== 'agents/fixture' ||
            args?.expectedBaseBranch !== 'main' || args?.expectedHead !== commits[0].hash) throw Error('agentReviewFinish.errors.reviewChanged');
        reviewBranchDeleted = true; return null;
      case 'list_worktrees': return scene === 'review' ? [
        { path: reviewBasePath, branch: 'main', head: reviewBaseHead.hash, is_main: true, is_locked: false, is_prunable: false },
        ...(!reviewRemoved ? [{ path: FIXTURE_PATH, branch: 'agents/fixture', head: commits[0].hash, is_main: false, is_locked: false, is_prunable: false }] : []),
      ] : [];
      case 'stack_list': return { stacks: [], branches: [] };
      case 'list_stashes': case 'list_remotes': case 'resolve_repo_commit_avatars': case 'git_command_log': return [];
      case 'read_repo_favicon': case 'git_credential_helper': return null;
      default: throw Error(`Unimplemented fixture command: ${command}`);
    }
  };
  useRepoStore.setState({ paths: [FIXTURE_PATH], activePath: FIXTURE_PATH, repos: { [FIXTURE_PATH]: info() }, status: scene === 'health' ? {} : { [FIXTURE_PATH]: entries }, stashes: scene === 'health' ? {} : { [FIXTURE_PATH]: [] }, favicons: { [FIXTURE_PATH]: null } });
  useWorkspaceStore.getState().initDefaultWorkspace([FIXTURE_PATH]);
  useUiStore.getState().setSidebarTab(scene === 'performance-history' ? 'history' : scene === 'lfs' ? 'tools' : 'commit');
}

/** Real split UI and AI SDK, with deterministic repository RPCs confined to the audit scene. */
function seedCommitSplitFixture(ownerRepoPath: string) {
  useCommitPrefs.setState({ aiProviderType: 'compatible', aiProviderApiKey: 'fixture-only-key',
    aiProviderModel: 'fixture-split-model', aiProviderBaseUrl: `${window.location.origin}/__fixture-ai/v1` });
  const control: SplitFixtureControl = { indexRevision: 0, worktreeRevision: 0, failGroup: null, committed: 0,
    stagedFiles: [], holdGroup: null, pendingGroup: null, releaseGroup: null, externalStage: false,
    changeOwner: path => { useRepoStore.setState({ activePath: path }); } };
  window.__L8GIT_SPLIT_FIXTURE__ = control;
  const remaining = new Set([0, 1, 2]); const staged = new Set<number>();
  let wholePending = true; let wholeStaged = false;
  const base: Commit = { hash: 'a'.repeat(40), short_hash: 'aaaaaaa', subject: 'Initial split fixture', author: 'Fixture',
    email: 'fixture@example.com', date: '2026-10-01T12:00:00Z', body: '', parents: [], tags: [], author_avatar: null };
  let commits = [base];
  const diff = (indices: ReadonlySet<number>) => !indices.size ? null : ['diff --git a/example.txt b/example.txt',
    'index 1111111..2222222 100644', '--- a/example.txt', '+++ b/example.txt',
    ...[...indices].sort((a, b) => a - b).flatMap(index => [`@@ -${index * 20 + 1},3 +${index * 20 + 1},3 @@`,
      ` before ${index}`, `-old split ${index}`, `+new split ${index}`, ` after ${index}`]), ''].join('\n');
  const status = (): StatusEntry[] => {
    const unstaged = new Set([...remaining].filter(index => !staged.has(index)));
    return [
      ...(remaining.size ? [{ path: 'example.txt', index_status: staged.size ? 'M' : ' ', worktree_status: unstaged.size ? 'M' : ' ',
        staged: staged.size > 0, unstaged: unstaged.size > 0, untracked: false, additions_staged: staged.size,
        deletions_staged: staged.size, additions_unstaged: unstaged.size, deletions_unstaged: unstaged.size, binary: false, embedded_repo: false }] : []),
      ...(wholePending ? [{ path: 'new-notes.txt', index_status: wholeStaged || control.externalStage ? 'A' : '?',
        worktree_status: wholeStaged || control.externalStage ? ' ' : '?', staged: wholeStaged || control.externalStage,
        unstaged: false, untracked: !(wholeStaged || control.externalStage), additions_staged: wholeStaged || control.externalStage ? 1 : 0,
        deletions_staged: 0, additions_unstaged: wholeStaged || control.externalStage ? 0 : 1, deletions_unstaged: 0, binary: false, embedded_repo: false }] : []),
    ];
  };
  const digest = async (data: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data))))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const snapshot = async () => ({ head: commits[0].hash, branch: 'fixture-split',
    indexFingerprint: await digest([commits[0].hash, control.indexRevision, [...staged], wholeStaged, control.externalStage]),
    // Raw worktree contents remain the same after committing selected changes.
    worktreeFingerprint: await digest(['reviewed split contents', control.worktreeRevision]) });
  const info = () => ({ path: FIXTURE_PATH, branch: 'fixture-split', commits,
    branches: [{ name: 'fixture-split', tip: commits[0].hash, is_current: true, is_remote: false }], tags: [] });
  window.__L8GIT_TEST_CALLS__ = [];
  window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
    window.__L8GIT_TEST_CALLS__!.push({ command, args });
    if (args?.path !== undefined && args.path !== FIXTURE_PATH) throw Error('Wrong split fixture path');
    switch (command) {
      case 'repo_status': return status();
      case 'repo_full_status': return { entries: status(), upstream_sync: { ahead: control.committed, behind: 0 }, has_upstream: true };
      case 'open_repo': return info();
      case 'list_stashes': case 'resolve_repo_commit_avatars': return [];
      case 'git_commit_split_snapshot': return snapshot();
      case 'repo_file_diff': return { staged: args?.file === 'example.txt' ? diff(staged) : null,
        unstaged: args?.file === 'example.txt' ? diff(new Set([...remaining].filter(index => !staged.has(index)))) : null,
        untracked_plain: null, is_binary: false };
      case 'unstage_files':
        if (JSON.stringify(args?.files) !== JSON.stringify(['.'])) throw Error('Unexpected split flatten target');
        staged.clear(); wholeStaged = false; control.externalStage = false; control.stagedFiles = []; control.indexRevision += 1; return null;
      case 'git_commit_split_group_checked': {
        const group = control.committed + 1;
        if (control.holdGroup === group) {
          control.pendingGroup = group;
          await new Promise<void>(resolve => { control.releaseGroup = resolve; });
          control.pendingGroup = null; control.releaseGroup = null; control.holdGroup = null;
        }
        const current = await snapshot();
        if ((args?.expected as { indexFingerprint?: string })?.indexFingerprint !== current.indexFingerprint) throw Error('__SPLIT_STAGING_CHANGED__');
        if (JSON.stringify(args?.expected) !== JSON.stringify(current)) throw Error('__SPLIT_REVIEW_CHANGED__');
        const selections = args?.selections as { file: string; patches: string[] | null }[];
        if (!selections?.length || !Array.isArray(args?.files) || selections.some(selection => !(args.files as string[]).includes(selection.file))) throw Error('__INVALID_SPLIT_SELECTION__');
        const selectedHunks = new Set(selections.flatMap(selection => selection.patches?.flatMap(patch =>
          [...patch.matchAll(/(?:old|new) split (\d+)/g)].map(match => Number(match[1]))) ?? []));
        const selectedWhole = selections.some(selection => selection.file === 'new-notes.txt' && selection.patches === null);
        if (control.failGroup === group) {
          for (const index of selectedHunks) staged.add(index);
          wholeStaged = selectedWhole; control.stagedFiles = selections.map(selection => selection.file);
          control.indexRevision += 1; control.failGroup = null;
          throw Error('Fixture commit hook rejected the second group');
        }
        for (const index of selectedHunks) remaining.delete(index);
        if (selectedWhole) wholePending = false;
        staged.clear(); wholeStaged = false; control.stagedFiles = []; control.committed += 1;
        const hash = String(control.committed + 1).repeat(40);
        commits = [{ ...base, hash, short_hash: hash.slice(0, 7), subject: String(args?.message), parents: [commits[0].hash] }, ...commits];
        return snapshot();
      }
      default: throw Error(`Unimplemented split fixture command: ${command}`);
    }
  };
  useRepoStore.setState({ paths: [...new Set([ownerRepoPath, FIXTURE_PATH])], activePath: ownerRepoPath, repos: { [FIXTURE_PATH]: info() },
    status: { [FIXTURE_PATH]: status() }, stashes: { [FIXTURE_PATH]: [] }, favicons: { [FIXTURE_PATH]: null } });
}
