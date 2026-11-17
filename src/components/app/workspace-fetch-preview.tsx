import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatBackendError } from '@/lib/backend-error';
import { invoke } from '@/lib/platform/ipc';
import { useRemoteOps } from '@/lib/remote-ops';
import { repoLabel, useRepoStore } from '@/lib/repo-store';
import { useWorkspaceStore } from '@/lib/workspace-store';

type FetchScope = { commonDir: string; remotes: string[] };
type PreviewResult = FetchScope | { error: string };

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
  const [status, setStatus] = useState<'idle' | 'checking' | 'canceling' | 'canceled'>('idle');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);
  const busy = status === 'checking' || status === 'canceling';

  const inspection = async () => {
    if (pending.current || !selected.size) return;
    const controller = new AbortController();
    pending.current = controller;
    setResults({});
    setStatus('checking');
    const stillInScope = (path: string) => {
      const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState();
      return !controller.signal.aborted && activeWorkspaceId === workspaceId
        && useRepoStore.getState().paths.includes(path)
        && workspaces.find(w => w.id === workspaceId)?.repoPaths.includes(path);
    };
    try {
      for (const path of paths.filter(path => selected.has(path))) {
        if (!stillInScope(path)) break;
        let result: PreviewResult;
        try {
          result = await invoke<FetchScope>('repo_fetch_scope', { path });
        } catch (error) {
          result = { error: formatBackendError(error) };
        }
        if (!stillInScope(path)) break;
        setResults(previous => ({ ...previous, [path]: result }));
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setStatus(controller.signal.aborted ? 'canceled' : 'idle');
      }
    }
  };

  const commonDirs = new Map<string, number>();
  for (const result of Object.values(results)) {
    if ('commonDir' in result) {
      commonDirs.set(result.commonDir, (commonDirs.get(result.commonDir) ?? 0) + 1);
    }
  }

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
                      setResults({});
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
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={!selected.size || busy} onClick={() => void inspection()}>
              {t('workspaceFetchPreview.inspect')}
            </Button>
            {status === 'checking' && <Button size="sm" variant="ghost" onClick={() => {
              pending.current?.abort();
              setStatus('canceling');
            }}>{t('common.cancel')}</Button>}
            {status !== 'idle' && <span role="status" className="text-xs text-muted-foreground">
              {t(status === 'checking' ? 'common.loading' : 'workspaceFetchPreview.canceled')}
            </span>}
          </div>
        </>
      )}
    </details>
  );
}
