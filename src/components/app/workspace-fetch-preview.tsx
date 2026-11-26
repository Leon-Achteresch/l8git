import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatBackendError } from '@/lib/backend-error';
import { invoke } from '@/lib/platform/ipc';
import { useRemoteOps } from '@/lib/remote-ops';
import { repoLabel, useRepoStore } from '@/lib/repo-store';
import { useWorkspaceStore } from '@/lib/workspace-store';
import { desktopWorkspaceFetchAvailable, revokeDesktopWorkspaceFetch, runDesktopWorkspaceFetch } from '@/lib/workspace-fetch-desktop';

type FetchScope = {
  commonDir: string;
  supportedTarget?: boolean;
  remotes: string[];
  target: { remote: string; fingerprint: string } | null;
};
type PreviewResult = FetchScope | { error: string };
type TargetCheck = 'matched' | 'repoChanged' | 'targetChanged' | 'noTarget' | 'unavailable';

function checkTarget(expected: FetchScope, current: PreviewResult): TargetCheck {
  if ('error' in current) return 'unavailable';
  if (current.commonDir !== expected.commonDir) return 'repoChanged';
  if (!current.target) return 'noTarget';
  return current.target.remote === expected.target?.remote
    && current.target.fingerprint === expected.target.fingerprint ? 'matched' : 'targetChanged';
}

export function WorkspaceFetchPreview() {
  const workspace = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId));
  const openPaths = useRepoStore(s => s.paths);
  if (!workspace) return null;
  const paths = workspace.repoPaths.filter(path => openPaths.includes(path));
  return <FetchPreview key={JSON.stringify([workspace.id, paths])} workspaceId={workspace.id}
    workspaceName={workspace.name} paths={paths} />;
}

function FetchPreview({ workspaceId, workspaceName, paths }: {
  workspaceId: string;
  workspaceName: string;
  paths: string[];
}) {
  const { t } = useTranslation();
  const listId = useId();
  const history = useRemoteOps(s => s.history);
  const ops = useRemoteOps(s => s.ops);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [results, setResults] = useState<Record<string, PreviewResult>>({});
  const [checks, setChecks] = useState<Record<string, TargetCheck> | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'canceling' | 'canceled'>('idle');
  const pending = useRef<AbortController | null>(null);
  const [nativeConfirmation, setNativeConfirmation] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const starting = useRef(false);
  useEffect(() => {
    let active = true;
    void desktopWorkspaceFetchAvailable().then(supported => { if (active) setNativeConfirmation(supported); });
    return () => { active = false; };
  }, []);
  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);
  const busy = running || status === 'checking' || status === 'canceling';
  const chosen = paths.filter(path => selected.has(path));
  const commonDirs = new Map<string, number>();
  for (const result of Object.values(results)) {
    if ('commonDir' in result) {
      commonDirs.set(result.commonDir, (commonDirs.get(result.commonDir) ?? 0) + 1);
    }
  }
  const canConfirm = chosen.length > 0 && chosen.every(path => {
    const result = results[path];
    return result && 'commonDir' in result && result.target && commonDirs.get(result.commonDir) === 1;
  });
  const matched = canConfirm && chosen.every(path => checks?.[path] === 'matched');
  const canStart = matched && confirmed !== null && chosen.every(path => {
    const result = results[path];
    return 'supportedTarget' in result && result.supportedTarget === true;
  });

  const start = async () => {
    if (!canStart || confirmed === null || starting.current) return;
    starting.current = true;
    setRunning(true);
    let next = 0;
    const worker = async () => {
      while (next < chosen.length) {
        const path = chosen[next++];
        // The native host repeats the membership and target check before spawn.
        await runDesktopWorkspaceFetch(path, workspaceId, confirmed).catch(() => {});
      }
    };
    try {
      await Promise.all([worker(), worker()]);
    } finally {
      starting.current = false;
      setRunning(false);
    }
  };

  const inspection = async (confirm: boolean) => {
    if (pending.current || !chosen.length || (confirm && !canConfirm)) return;
    const controller = new AbortController();
    pending.current = controller;
    setConfirmationError('');
    setConfirmed(null);
    if (!confirm) setResults({});
    setChecks(confirm ? {} : null);
    setStatus('checking');
    const stillInScope = () => {
      const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState();
      const members = workspaces.find(w => w.id === workspaceId)?.repoPaths;
      const open = useRepoStore.getState().paths;
      return !controller.signal.aborted && activeWorkspaceId === workspaceId
        && chosen.every(path => members?.includes(path) && open.includes(path));
    };
    const invalidate = () => { if (!stillInScope()) controller.abort(); };
    const unsubscribeWorkspace = useWorkspaceStore.subscribe(invalidate);
    const unsubscribeRepos = useRepoStore.subscribe(invalidate);
    const freshChecks: Record<string, TargetCheck> = {};
    try {
      invalidate();
      let revision: number | null = null;
      if (confirm && nativeConfirmation && stillInScope()) {
        const selection = chosen.map(path => ({
          path, fingerprint: (results[path] as FetchScope).target?.fingerprint,
        }));
        revision = await invoke<number | null>('workspace_fetch_desktop_confirm', { workspaceId, selection });
        if (revision === null || !stillInScope()) {
          controller.abort();
          return;
        }
      }
      for (const path of chosen) {
        if (!stillInScope()) break;
        let result: PreviewResult;
        try {
          if (revision !== null) {
            await invoke('workspace_fetch_desktop_validate', { path, workspaceId, revision });
          }
          result = await invoke<FetchScope>('repo_fetch_scope', { path });
        } catch (error) {
          result = { error: formatBackendError(error) };
        }
        if (!stillInScope()) break;
        if (confirm) {
          const expected = results[path];
          if ('commonDir' in expected) freshChecks[path] = checkTarget(expected, result);
        } else {
          setResults(previous => ({ ...previous, [path]: result }));
        }
      }
      if (confirm && stillInScope()) {
        setChecks(freshChecks);
        if (chosen.every(path => freshChecks[path] === 'matched')) setConfirmed(revision);
      }
    } catch (error) {
      if (stillInScope()) setConfirmationError(formatBackendError(error));
    } finally {
      unsubscribeWorkspace();
      unsubscribeRepos();
      if (pending.current === controller) {
        pending.current = null;
        setStatus(controller.signal.aborted ? 'canceled' : 'idle');
      }
    }
  };

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t('workspaceFetchPreview.title')}</summary>
      <p className="mt-2 text-xs text-muted-foreground">{t('workspaceFetchPreview.hint', { workspace: workspaceName })}</p>
      {paths.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{t('workspaceFetchPreview.empty')}</p> : (
        <>
          <ul className="mt-2 max-h-[min(40dvh,22rem)] divide-y overflow-y-auto overscroll-contain">
            {paths.map((path, index) => {
              const result = results[path];
              const last = history.find(entry => entry.repoPath === path && entry.op === 'fetch' && entry.status === 'success');
              const ownActivity = ops.some(entry => entry.repoPath === path);
              const shared = result && 'commonDir' in result && (commonDirs.get(result.commonDir) ?? 0) > 1;
              const check = checks?.[path];
              const id = `${listId}-${index}`;
              return (
                <li key={path} className="flex min-w-0 items-start gap-2 py-2">
                  <Checkbox id={id} className="mt-0.5" disabled={busy} checked={selected.has(path)}
                    onCheckedChange={checked => {
                      setSelected(previous => {
                        const next = new Set(previous);
                        if (checked === true) next.add(path);
                        else next.delete(path);
                        return next;
                      });
                      revokeDesktopWorkspaceFetch();
                      setConfirmed(null);
                      setConfirmationError('');
                      setResults({});
                      setChecks(null);
                      setStatus('idle');
                    }} />
                  <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
                    <label htmlFor={id} className="cursor-pointer break-words text-sm font-medium text-foreground">{repoLabel(path)}</label>
                    <p className="break-all font-mono">{path}</p>
                    <p>{last ? t('workspaceFetchPreview.lastFetch', { time: new Date(last.finishedAt).toLocaleTimeString() }) : t('workspaceFetchPreview.noFetch')}</p>
                    {ownActivity && <p>{t('workspaceFetchPreview.active')}</p>}
                    {result && ('error' in result ? <p role="status" className="break-words text-destructive">{result.error}</p> :
                      <p className="break-words">{result.remotes.length
                        ? t('workspaceFetchPreview.remotes', { names: result.remotes.join(', ') })
                        : t('workspaceFetchPreview.noRemotes')}</p>)}
                    {shared && <p>{t('workspaceFetchPreview.shared')}</p>}
                    {result && 'commonDir' in result && (
                      <p>{result.target
                        ? t('workspaceFetchPreview.target', { remote: result.target.remote })
                        : t('workspaceFetchPreview.noTarget')}</p>
                    )}
                    {check && check !== 'matched' && <p role="status" className="text-destructive">
                      {t(`workspaceFetchPreview.${check}`)}
                    </p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={!selected.size || busy} onClick={() => void inspection(false)}>
              {t('workspaceFetchPreview.inspect')}
            </Button>
            {canConfirm && <Button size="sm" variant="outline" disabled={busy} onClick={() => void inspection(true)}>
              {t(checks ? 'workspaceFetchPreview.retryValidation' : 'workspaceFetchPreview.confirm')}
            </Button>}
            {canStart && <Button size="sm" disabled={busy} onClick={() => void start()}>
              {t('workspaceFetchPreview.start')}
            </Button>}
            {status === 'checking' && <Button size="sm" variant="ghost" onClick={() => {
              pending.current?.abort();
              revokeDesktopWorkspaceFetch();
              setStatus('canceling');
            }}>{t('common.cancel')}</Button>}
            {status !== 'idle' && <span role="status" className="text-xs text-muted-foreground">
              {t(status === 'checking' ? 'common.loading' : 'workspaceFetchPreview.canceled')}
            </span>}
          </div>
          {confirmationError && <p role="status" className="mt-2 text-xs text-destructive">{confirmationError}</p>}
          {matched && <p role="status" className="mt-2 text-xs text-muted-foreground">
            {t(canStart ? 'workspaceFetchPreview.executableMatched' : 'workspaceFetchPreview.matched')}
          </p>}
        </>
      )}
    </details>
  );
}
