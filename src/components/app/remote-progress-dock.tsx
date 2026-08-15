import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  cancelRemoteOp,
  ensureRemoteProgressListeners,
  useRemoteOps,
  type RemoteOpEntry,
} from '@/lib/remote-ops';
import { repoLabel } from '@/lib/repo-store';
import { Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function RemoteOpCard({ op }: { op: RemoteOpEntry }) {
  const { t } = useTranslation();
  const percent = op.percent;

  return (
    <div className='pointer-events-auto w-72 rounded-xl border border-border/60 bg-popover/95 p-2.5 shadow-lg backdrop-blur-sm'>
      <div className='flex items-center gap-2'>
        <Loader2 className='size-3.5 shrink-0 animate-spin text-primary' />
        <span className='min-w-0 flex-1 truncate text-xs font-medium'>
          {t(`remoteProgress.op_${op.op}`)}
          {op.repoPath ? ` · ${repoLabel(op.repoPath)}` : ''}
        </span>
        {percent != null && (
          <span className='shrink-0 text-[11px] tabular-nums text-muted-foreground'>
            {Math.round(percent)}%
          </span>
        )}
        <Button
          type='button'
          variant='ghost'
          size='icon-xs'
          className='shrink-0 text-muted-foreground hover:text-destructive'
          title={t('remoteProgress.cancel')}
          aria-label={t('remoteProgress.cancel')}
          disabled={op.canceling}
          onClick={() => void cancelRemoteOp(op.opId)}
        >
          <X className='size-3.5' />
        </Button>
      </div>
      <p className='mt-1 truncate text-[11px] text-muted-foreground'>
        {op.canceling
          ? t('remoteProgress.canceling')
          : op.phase
            ? `${op.phase}${op.detail ? ` ${op.detail}` : ''}`
            : t('remoteProgress.starting')}
      </p>
      <Progress
        value={percent ?? 0}
        className={percent == null ? 'mt-1.5 opacity-40' : 'mt-1.5'}
      />
    </div>
  );
}

export function RemoteProgressDock() {
  const ops = useRemoteOps((s) => s.ops);

  useEffect(() => {
    ensureRemoteProgressListeners();
  }, []);

  if (ops.length === 0) return null;

  return (
    <div className='pointer-events-none fixed bottom-4 right-4 z-[65] flex flex-col gap-2'>
      {ops.map((op) => (
        <RemoteOpCard key={op.opId} op={op} />
      ))}
    </div>
  );
}
