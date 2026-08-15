import { toast } from 'sonner';

import i18n from '@/lib/i18n';
import type { RebaseResult } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';

export function notifyRebaseResult(path: string, res: RebaseResult) {
  switch (res.status) {
    case 'completed':
      toast.success(i18n.t('rebase.toastCompleted'));
      return;
    case 'conflict':
      toast.warning(
        i18n.t('rebase.toastConflict', {
          count: res.state.conflicted_paths.length,
        }),
        {
          duration: 8000,
          action: {
            label: i18n.t('rebaseBanner.resolve'),
            onClick: () => useUiStore.getState().openMergeEditor(path),
          },
        }
      );
      return;
    case 'stopped':
      toast.info(
        i18n.t('rebase.toastStopped', {
          subject: res.state.stopped?.subject ?? '',
        })
      );
      return;
    case 'aborted':
      toast.success(i18n.t('rebase.toastAborted'));
      return;
  }
}
