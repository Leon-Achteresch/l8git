import {
  loadSignatureStatus,
  shortSigningKey,
  type CommitSignature,
  type SignatureState,
} from '@/lib/git-signing';
import { cn } from '@/lib/utils';
import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ICONS: Record<SignatureState, typeof ShieldCheck> = {
  good: ShieldCheck,
  invalid: ShieldX,
  untrusted: ShieldAlert,
  unknown_key: ShieldQuestion,
  unsigned: ShieldQuestion,
};

const TONES: Record<SignatureState, string> = {
  good: 'bg-git-added/10 text-git-added',
  invalid: 'bg-destructive/10 text-destructive',
  untrusted: 'bg-git-modified/10 text-git-modified',
  unknown_key: 'bg-git-modified/10 text-git-modified',
  unsigned: 'bg-muted/60 text-muted-foreground',
};

export function CommitSignatureBadge({
  path,
  commitHash,
  hideUnsigned,
  className,
}: {
  path: string;
  commitHash: string;
  hideUnsigned?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [signature, setSignature] = useState<CommitSignature | null>(null);

  useEffect(() => {
    let alive = true;
    setSignature(null);
    void loadSignatureStatus(path, commitHash)
      .then(sig => {
        if (alive) setSignature(sig);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, commitHash]);

  if (!signature) return null;
  if (hideUnsigned && signature.state === 'unsigned') return null;

  const Icon = ICONS[signature.state] ?? ShieldQuestion;
  const key = shortSigningKey(signature.key);
  const tooltip = [
    t(`commitSignature.${signature.state}`),
    signature.signer ? t('commitSignature.signer', { signer: signature.signer }) : '',
    key ? t('commitSignature.key', { key }) : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        TONES[signature.state] ?? TONES.unsigned,
        className
      )}
    >
      <Icon className='size-3' aria-hidden />
      {t(`commitSignature.${signature.state}`)}
    </span>
  );
}
