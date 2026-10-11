import { AlertCircle, FileCode2, FileWarning, LoaderCircle } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MediaDiffPanel } from '@/components/repo/media/media-diff-panel';
import { looksLikeLfsPointerText } from '@/lib/media';
import { comparisonEffectiveBase, type CommitCompareDiff, type CommitCompareFile, type CommitComparison } from '@/lib/commit-compare';

const MonacoDiffViewer = lazy(() => import('../commit/monaco-diff-viewer').then(module => ({ default: module.MonacoDiffViewer })));

export function CommitCompareDiffView({ path, comparison, file, diff, loading, error, onRetry }: {
  path: string;
  comparison: CommitComparison;
  file: CommitCompareFile | null;
  diff: CommitCompareDiff | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const lfs = looksLikeLfsPointerText(diff?.patch);
  if (!file) return <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground"><FileCode2 aria-hidden="true" className="size-8 opacity-50" /><p className="text-xs">{t('compare.pickFile')}</p></div>;
  if (loading) return <div className="flex flex-1 items-center justify-center" role="status" aria-label={t('common.loading')}><LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary/60" /></div>;
  if (error) return <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><AlertCircle aria-hidden="true" className="size-6 text-destructive" /><p className="max-w-xl break-words text-xs text-destructive">{error}</p><Button size="sm" variant="outline" onClick={onRetry}>{t('common.retry')}</Button></div>;
  if (!diff) return null;
  if (diff.binary || lfs) return (
    <MediaDiffPanel
      key={`${comparison.base_hash}:${comparison.head_hash}:${file.path}`}
      repoPath={path}
      filePath={file.path}
      beforeFilePath={file.previous_path ?? file.path}
      beforeTreeish={comparisonEffectiveBase(comparison)}
      afterTreeish={comparison.head_hash}
      beforeLabel={t('compare.base')}
      afterLabel={t('compare.head')}
      checkLfs={lfs}
      className="min-h-0 flex-1"
    />
  );
  if (!diff.patch.trim()) return <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-muted-foreground"><FileWarning aria-hidden="true" className="size-6" /><p className="text-xs">{t('compare.noTextChanges')}</p></div>;
  if (!/^@@/m.test(diff.patch)) return <div className="min-h-0 flex-1 overflow-auto p-4">{diff.truncated && <p role="status" className="mb-3 text-xs text-git-modified">{t('compare.patchTruncated')}</p>}<p className="mb-3 text-xs text-muted-foreground">{t('compare.metadataOnly')}</p><pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{diff.patch}</pre></div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {diff.truncated && <p role="status" className="shrink-0 border-b border-border bg-git-modified/10 px-4 py-2 text-xs text-git-modified">{t('compare.patchTruncated')}</p>}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center"><LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary/60" /></div>}>
          <MonacoDiffViewer key={`${comparison.base_hash}:${comparison.head_hash}:${file.path}`} unifiedText={diff.patch} filename={file.path} />
        </Suspense>
      </div>
    </div>
  );
}
