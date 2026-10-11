import { ArrowDown, ArrowLeftRight, ArrowUp, Check, Copy, Download, FileCode2, GitCompareArrows, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useRepoStore } from '@/lib/repo-store';
import { toastError } from '@/lib/error-toast';
import {
  COMPARE_FILE_STATUS_KEYS,
  comparisonErrorKey,
  comparisonSnapshotKey,
  filterCompareFiles,
  nextCompareFile,
  readCommitCompareDiff,
  readCommitComparison,
  validateCompareRefs,
  type CommitCompareDiff,
  type CommitCompareFileSort,
  type CommitCompareFileStatus,
  type CommitCompareRefs,
  type CommitComparison,
} from '@/lib/commit-compare';
import { CommitCompareFiles } from './commit-compare-files';
import { CommitCompareDiffView } from './commit-compare-diff';
import { WorkflowHelpLink } from '@/components/help/workflow-help-link';
import { comparisonReportFilename, comparisonReviewReport } from '@/lib/commit-compare-report';
import { saveText } from '@/lib/user-export';

const EMPTY_FILES: CommitComparison['files'] = [];
const EMPTY_REVIEWED: ReadonlySet<string> = new Set();
const SELECT_CLASS = 'h-7 min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring';

type ComparisonState = { key: string; data: CommitComparison | null; loading: boolean; error: string; cancelled: boolean };
type DiffState = { key: string; data: CommitCompareDiff | null; loading: boolean; error: string };

type Props = {
  open: boolean;
  onClose: () => void;
  path: string;
  initialBase?: string;
  initialHead?: string;
};

export function CommitCompareDialog({ open, onClose, path, initialBase = 'HEAD~1', initialHead = 'HEAD' }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex h-[90dvh] max-h-[1000px] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <GitCompareArrows aria-hidden="true" className="size-4 text-primary" />
            <DialogTitle className="flex-1">{t('compare.title')}</DialogTitle>
            <WorkflowHelpLink guideId="compare-branches" onOpen={onClose} />
            <Button type="button" size="icon-sm" variant="ghost" onClick={onClose} aria-label={t('common.close')}><X aria-hidden="true" /></Button>
          </div>
          <DialogDescription className="text-xs">{t('compare.description')}</DialogDescription>
        </DialogHeader>
        {open && <CommitCompareContent key={JSON.stringify([path, initialBase, initialHead])} path={path} initialBase={initialBase} initialHead={initialHead} />}
      </DialogContent>
    </Dialog>
  );
}

function CommitCompareContent({ path, initialBase, initialHead }: { path: string; initialBase: string; initialHead: string }) {
  const { t } = useTranslation();
  const refsId = useId();
  const hideReviewedId = useId();
  const modeId = useId();
  const repo = useRepoStore(state => state.repos[path]);
  const [draft, setDraft] = useState<CommitCompareRefs>({ base: initialBase, head: initialHead, mode: 'direct' });
  const [exporting, setExporting] = useState(false);
  const [request, setRequest] = useState<CommitCompareRefs | null>(() => validateCompareRefs({ base: initialBase, head: initialHead }) ? null : { base: initialBase.trim(), head: initialHead.trim(), mode: 'direct' });
  const requestKey = JSON.stringify([path, request]);
  const comparisonEpoch = useRef(0);
  const diffEpoch = useRef(0);
  const [state, setState] = useState<ComparisonState>({ key: '', data: null, loading: false, error: '', cancelled: false });
  const comparison = state.key === requestKey ? state.data : null;
  const loading = !!request && (state.key !== requestKey || state.loading);
  const error = state.key === requestKey ? state.error : '';
  const errorKey = comparisonErrorKey(error);
  const cancelled = state.key === requestKey && state.cancelled;
  const snapshotKey = comparison ? comparisonSnapshotKey(comparison) : '';
  const [selection, setSelection] = useState({ key: '', path: null as string | null });
  const selectedPath = selection.key === snapshotKey ? selection.path : comparison?.files[0]?.path ?? null;
  const [reviewedState, setReviewedState] = useState({ key: '', paths: EMPTY_REVIEWED });
  const reviewed = reviewedState.key === snapshotKey ? reviewedState.paths : EMPTY_REVIEWED;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CommitCompareFileStatus | 'all'>('all');
  const [sort, setSort] = useState<CommitCompareFileSort>('path');
  const [hideReviewed, setHideReviewed] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [diffState, setDiffState] = useState<DiffState>({ key: '', data: null, loading: false, error: '' });
  const diffKey = JSON.stringify([path, snapshotKey, selectedPath]);
  const currentDiff = diffState.key === diffKey;
  const diff = currentDiff ? diffState.data : null;
  const diffLoading = !!comparison && !!selectedPath && (!currentDiff || diffState.loading);
  const diffError = currentDiff ? diffState.error : '';
  const diffErrorKey = comparisonErrorKey(diffError);
  const refError = validateCompareRefs(draft);
  const draftDirty = !!request && (draft.base.trim() !== request.base || draft.head.trim() !== request.head || draft.mode !== request.mode);
  const suggestions = useMemo(() => [...new Set(['HEAD', 'HEAD~1', ...(repo?.branches.map(branch => branch.name) ?? []), ...(repo?.tags.map(tag => `refs/tags/${tag.name}`) ?? [])])].slice(0, 200), [repo?.branches, repo?.tags]);
  const visibleFiles = useMemo(() => filterCompareFiles(comparison?.files ?? EMPTY_FILES, query, status, sort, reviewed, hideReviewed), [comparison?.files, query, status, sort, reviewed, hideReviewed]);
  const selectedFile = comparison?.files.find(file => file.path === selectedPath) ?? null;
  const visibleIndex = visibleFiles.findIndex(file => file.path === selectedPath);

  const selectFile = useCallback((filePath: string | null) => setSelection({ key: snapshotKey, path: filePath }), [snapshotKey]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const loadComparison = useCallback(async () => {
    if (!request) return;
    const epoch = ++comparisonEpoch.current;
    diffEpoch.current++;
    setState(previous => ({ key: requestKey, data: previous.key === requestKey ? previous.data : null, loading: true, error: '', cancelled: false }));
    try {
      const data = await readCommitComparison(path, request);
      if (comparisonEpoch.current !== epoch) return;
      setState({ key: requestKey, data, loading: false, error: '', cancelled: false });
    } catch (failure) {
      if (comparisonEpoch.current !== epoch) return;
      setState({ key: requestKey, data: null, loading: false, error: String(failure), cancelled: false });
    }
  }, [path, request, requestKey]);

  useEffect(() => {
    void loadComparison();
    return () => { comparisonEpoch.current++; diffEpoch.current++; };
  }, [loadComparison]);

  useEffect(() => {
    if (!comparison) return;
    if (!visibleFiles.some(file => file.path === selectedPath)) selectFile(visibleFiles[0]?.path ?? null);
  }, [comparison, visibleFiles, selectedPath, selectFile]);

  const loadDiff = useCallback(async () => {
    const epoch = ++diffEpoch.current;
    if (!comparison || !selectedPath) {
      setDiffState({ key: diffKey, data: null, loading: false, error: '' });
      return;
    }
    setDiffState({ key: diffKey, data: null, loading: true, error: '' });
    try {
      const data = await readCommitCompareDiff(path, comparison, selectedPath);
      if (diffEpoch.current !== epoch) return;
      setDiffState({ key: diffKey, data, loading: false, error: '' });
    } catch (failure) {
      if (diffEpoch.current !== epoch) return;
      setDiffState({ key: diffKey, data: null, loading: false, error: String(failure) });
    }
  }, [path, comparison, selectedPath, diffKey]);

  useEffect(() => {
    void loadDiff();
    return () => { diffEpoch.current++; };
  }, [loadDiff]);

  const setReviewed = (filePath: string, checked: boolean) => {
    setReviewedState(previous => {
      const paths = new Set(previous.key === snapshotKey ? previous.paths : EMPTY_REVIEWED);
      if (checked) paths.add(filePath); else paths.delete(filePath);
      return { key: snapshotKey, paths };
    });
  };
  const copyPatch = async () => {
    if (!diff || diff.truncated || diff.binary || !diff.patch) return;
    try {
      await navigator.clipboard.writeText(diff.patch);
      toast.success(t('compare.patchCopied'));
    } catch (failure) {
      toastError(String(failure));
    }
  };
  const exportReview = async () => {
    if (!comparison || exporting) return;
    setExporting(true);
    try {
      if (await saveText(comparisonReportFilename(comparison), comparisonReviewReport(comparison, reviewed), {
        label: 'Markdown', extension: 'md', mime: 'text/markdown;charset=utf-8',
      })) toast.success(t('compare.reportSaved'));
    } catch (failure) {
      toastError(String(failure));
    } finally { setExporting(false); }
  };
  const apply = () => {
    if (refError) return;
    setRequest({ base: draft.base.trim(), head: draft.head.trim(), mode: draft.mode });
  };

  return (
    <>
      <form className="shrink-0 space-y-2 border-b border-border bg-muted/10 px-4 py-3" onSubmit={event => { event.preventDefault(); apply(); }}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
          <label className="min-w-0 text-xs font-medium">{t('compare.base')}<Input className="mt-1 font-mono text-xs" value={draft.base} list={refsId} aria-invalid={!!refError} placeholder="main, v1.0, HEAD~1" onChange={event => setDraft(current => ({ ...current, base: event.target.value }))} /></label>
          <Button type="button" variant="ghost" size="icon" disabled={!!refError} aria-label={t('compare.swap')} title={t('compare.swap')} onClick={() => {
            const swapped = { ...draft, base: draft.head, head: draft.base };
            setDraft(swapped);
            setRequest({ ...swapped, base: swapped.base.trim(), head: swapped.head.trim() });
          }}><ArrowLeftRight aria-hidden="true" /></Button>
          <label className="min-w-0 text-xs font-medium">{t('compare.head')}<Input className="mt-1 font-mono text-xs" value={draft.head} list={refsId} aria-invalid={!!refError} placeholder="HEAD, feature, origin/main" onChange={event => setDraft(current => ({ ...current, head: event.target.value }))} /></label>
          <Button type="submit" disabled={!!refError} className="col-span-3 sm:col-span-1"><GitCompareArrows aria-hidden="true" />{t('compare.compare')}</Button>
        </div>
        <datalist id={refsId}>{suggestions.map(ref => <option key={ref} value={ref} />)}</datalist>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <legend className="sr-only">{t('compare.mode')}</legend>
          {(['direct', 'merge-base'] as const).map(mode => <label key={mode} className="flex cursor-pointer items-center gap-1.5"><input type="radio" name={modeId} checked={draft.mode === mode} onChange={() => setDraft(current => ({ ...current, mode }))} className="accent-primary" />{t(mode === 'direct' ? 'compare.direct' : 'compare.mergeBase')}</label>)}
          <span className="text-muted-foreground">{t(draft.mode === 'direct' ? 'compare.directHint' : 'compare.mergeBaseHint')}</span>
        </fieldset>
        {refError && <p role="alert" className="text-xs text-destructive">{t(`compare.${refError}`)}</p>}
        {!refError && draftDirty && <p className="text-xs text-git-modified">{t('compare.pendingChanges')}</p>}
      </form>
      {loading ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3" role="status">
          <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('compare.loading')}</p>
          <Button size="sm" variant="outline" onClick={() => { comparisonEpoch.current++; diffEpoch.current++; setState({ key: requestKey, data: null, loading: false, error: '', cancelled: true }); }}>{t('common.cancel')}</Button>
        </div>
      ) : error || cancelled ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <GitCompareArrows aria-hidden="true" className="size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">{t(cancelled ? 'compare.cancelled' : 'compare.loadFailed')}</p>
          {error && <p className="max-w-2xl whitespace-pre-wrap break-words text-xs text-destructive">{errorKey ? t(`compare.${errorKey}`) : error}</p>}
          <Button variant="outline" size="sm" onClick={() => void loadComparison()}>{t('common.retry')}</Button>
        </div>
      ) : comparison ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs" role="status">
            <span className="font-medium">{t('compare.fileCount', { count: comparison.total_files })}</span>
            <span className="font-mono text-git-added">+{comparison.additions}</span>
            <span className="font-mono text-git-removed">−{comparison.deletions}</span>
            <span title={t('compare.aheadHint')}>{t('compare.ahead', { count: comparison.ahead })}</span>
            <span title={t('compare.behindHint')}>{t('compare.behind', { count: comparison.behind })}</span>
            <span className="ml-auto text-muted-foreground" title={`${comparison.base_hash} → ${comparison.head_hash}`}><code>{comparison.base_hash.slice(0, 8)}</code> → <code>{comparison.head_hash.slice(0, 8)}</code></span>
            <Button size="xs" variant="ghost" disabled={exporting} title={t('compare.reportHint')} onClick={() => void exportReview()}><Download aria-hidden="true" />{t('compare.exportReport')}</Button>
            <Button size="icon-xs" variant="ghost" aria-label={t('compare.refresh')} title={t('compare.refresh')} onClick={() => void loadComparison()}><RefreshCw aria-hidden="true" /></Button>
          </div>
          {comparison.mode === 'merge-base' && comparison.merge_base && <p className="shrink-0 border-b border-border bg-muted/10 px-4 py-1.5 text-[11px] text-muted-foreground">{t('compare.mergeBaseUsed')} <code title={comparison.merge_base}>{comparison.merge_base.slice(0, 12)}</code></p>}
          {comparison.truncated && <p role="status" className="shrink-0 border-b border-border bg-git-modified/10 px-4 py-2 text-xs text-git-modified">{t('compare.filesTruncated', { shown: comparison.files.length, count: comparison.total_files })}</p>}
          {comparison.files.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><Check aria-hidden="true" className="size-8 text-git-added" /><p className="text-sm font-medium">{t('compare.noChanges')}</p><p className="max-w-lg text-xs text-muted-foreground">{t('compare.noChangesHint')}</p></div>
          ) : (
            <ResizablePanelGroup key={narrow ? 'compare-vertical' : 'compare-horizontal'} orientation={narrow ? 'vertical' : 'horizontal'} className="min-h-0 flex-1">
              <ResizablePanel id="compare-files" defaultSize={narrow ? '36%' : '29%'} minSize={narrow ? '22%' : '18%'} maxSize={narrow ? '65%' : '60%'} className="flex min-h-0 flex-col">
                <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">
                  <div className="relative"><Search aria-hidden="true" className="absolute left-2 top-1.5 size-3.5 text-muted-foreground" /><Input type="search" inputSize="sm" className="pl-7" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('compare.filterFiles')} placeholder={t('compare.filterFiles')} /></div>
                  <div className="flex items-center gap-2">
                    <select aria-label={t('compare.fileStatus')} className={`${SELECT_CLASS} flex-1`} value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="all">{t('compare.allStatuses')}</option>{Object.entries(COMPARE_FILE_STATUS_KEYS).map(([key, label]) => <option key={key} value={key}>{t(`compare.${label}`)}</option>)}</select>
                    <select aria-label={t('compare.sortFiles')} className={`${SELECT_CLASS} flex-1`} value={sort} onChange={event => setSort(event.target.value as CommitCompareFileSort)}><option value="path">{t('compare.sortPath')}</option><option value="changes">{t('compare.sortChanges')}</option><option value="status">{t('compare.sortStatus')}</option></select>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground"><span>{t('compare.reviewProgress', { reviewed: reviewed.size, count: comparison.files.length })}</span><label htmlFor={hideReviewedId} className="flex cursor-pointer items-center gap-1.5"><Checkbox id={hideReviewedId} checked={hideReviewed} onCheckedChange={value => setHideReviewed(value === true)} className="size-3.5" />{t('compare.hideReviewed')}</label></div>
                </div>
                <CommitCompareFiles files={visibleFiles} selectedPath={selectedPath} reviewed={reviewed} onSelect={selectFile} onReviewedChange={setReviewed} />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="compare-diff" minSize="35%" className="flex min-h-0 min-w-0 flex-col">
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-muted/10 px-3 py-1.5">
                  <FileCode2 aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <span className="mr-auto min-w-0 max-w-full truncate font-mono text-[11px]" title={selectedPath ?? undefined}>{selectedPath ?? t('compare.pickFile')}</span>
                  <Button size="icon-xs" variant="ghost" aria-label={t('compare.previousFile')} title={t('compare.previousFile')} disabled={visibleIndex <= 0} onClick={() => selectFile(nextCompareFile(visibleFiles, selectedPath, -1))}><ArrowUp aria-hidden="true" /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label={t('compare.nextFile')} title={t('compare.nextFile')} disabled={visibleIndex < 0 || visibleIndex >= visibleFiles.length - 1} onClick={() => selectFile(nextCompareFile(visibleFiles, selectedPath, 1))}><ArrowDown aria-hidden="true" /></Button>
                  <Button size="xs" variant="ghost" disabled={!selectedFile} onClick={() => {
                    if (!selectedFile) return;
                    setReviewed(selectedFile.path, true);
                    const next = visibleFiles.find((file, index) => index > visibleIndex && !reviewed.has(file.path)) ?? visibleFiles.find(file => file.path !== selectedFile.path && !reviewed.has(file.path));
                    if (next) selectFile(next.path);
                  }}><Check aria-hidden="true" />{t('compare.reviewAndNext')}</Button>
                  <Button size="xs" variant="ghost" disabled={diffLoading || !diff?.patch || !!diff.binary || !!diff.truncated} onClick={() => void copyPatch()}><Copy aria-hidden="true" />{t('compare.copyPatch')}</Button>
                </div>
                <CommitCompareDiffView path={path} comparison={comparison} file={selectedFile} diff={diff} loading={diffLoading} error={diffErrorKey ? t(`compare.${diffErrorKey}`) : diffError} onRetry={() => void loadDiff()} />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </>
      ) : <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">{t('compare.chooseRefs')}</div>}
    </>
  );
}
