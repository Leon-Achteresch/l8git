import { recoveryError } from '@/lib/reflog-format';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function RecoveryFeedback({ error }: { error: string }) {
  const { t } = useTranslation();
  const details = recoveryError(error);
  return <div role='alert' className='space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs'>
    <p className='flex items-start gap-2 text-destructive'><AlertTriangle className='mt-0.5 size-3.5 shrink-0' />{t(details.key)}</p>
    {details.files.length > 0 && <ul className='max-h-40 space-y-1 overflow-auto pl-5 text-foreground'>
      {details.files.map((file) => <li key={file}><code className='whitespace-pre-wrap break-all'>{file}</code></li>)}
    </ul>}
    {details.key === 'recovery.operationFailed' && <pre className='max-h-40 overflow-auto whitespace-pre-wrap break-all text-muted-foreground'>{details.raw}</pre>}
  </div>;
}
