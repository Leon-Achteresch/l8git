import { cn } from '@/lib/utils';
import type { TagKind } from '@/lib/repo-store';
import { FileText, ShieldCheck, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ICONS: Record<TagKind, typeof Tag> = {
  lightweight: Tag,
  annotated: FileText,
  signed: ShieldCheck,
};

const TONES: Record<TagKind, string> = {
  lightweight: 'bg-muted/70 text-muted-foreground',
  annotated: 'bg-git-branch/10 text-git-branch',
  signed: 'bg-git-added/10 text-git-added',
};

export function TagKindBadge({
  kind,
  compact,
  className,
}: {
  kind: TagKind;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = ICONS[kind] ?? Tag;
  const label = t(`tagKind.${kind}`);

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.06em]',
        TONES[kind] ?? TONES.lightweight,
        className
      )}
    >
      <Icon className='size-2.5' aria-hidden />
      {!compact && <span>{label}</span>}
    </span>
  );
}
