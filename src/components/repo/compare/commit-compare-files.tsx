import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, FileCode2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { COMPARE_FILE_STATUS_KEYS, type CommitCompareFile } from '@/lib/commit-compare';
import { cn } from '@/lib/utils';

const STATUS_COLORS = {
  A: 'text-git-added', M: 'text-git-modified', D: 'text-git-removed',
  R: 'text-primary', C: 'text-primary', T: 'text-git-modified',
};

export function CommitCompareFiles({ files, selectedPath, reviewed, onSelect, onReviewedChange }: {
  files: CommitCompareFile[];
  selectedPath: string | null;
  reviewed: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onReviewedChange: (path: string, checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 64,
    overscan: 5,
    getItemKey: index => files[index].path,
  });
  const selectedIndex = files.findIndex(file => file.path === selectedPath);
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, virtualizer]);

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]" aria-label={t('compare.changedFiles')}>
      {files.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t('compare.noMatchingFiles')}</p>
      ) : (
        <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(item => {
            const file = files[item.index];
            const active = selectedPath === file.path;
            const checked = reviewed.has(file.path);
            return (
              <li key={file.path} className={cn('absolute inset-x-0 top-0 flex items-center gap-2 border-b border-border/40 px-2', active ? 'bg-primary/10' : 'hover:bg-muted/60')} style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
                <Checkbox checked={checked} aria-label={t('compare.markFileReviewed', { path: file.path })} onCheckedChange={value => onReviewedChange(file.path, value === true)} />
                <button type="button" onClick={() => onSelect(file.path)} aria-pressed={active} title={file.previous_path ? `${file.previous_path} → ${file.path}` : file.path} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <FileCode2 aria-hidden="true" className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground/60')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{file.path}</span>
                    {file.previous_path && <span className="block truncate text-[10px] text-muted-foreground">← {file.previous_path}</span>}
                    <span className="mt-1 flex items-center gap-2 text-[10px]">
                      <span className={STATUS_COLORS[file.status]}>{t(`compare.${COMPARE_FILE_STATUS_KEYS[file.status]}`)}</span>
                      {file.binary ? <span className="text-muted-foreground">{t('commitInspect.binaryBadge')}</span> : <><span className="font-mono text-git-added">+{file.additions}</span><span className="font-mono text-git-removed">−{file.deletions}</span></>}
                      {checked && <Check aria-hidden="true" className="ml-auto size-3 text-git-added" />}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
