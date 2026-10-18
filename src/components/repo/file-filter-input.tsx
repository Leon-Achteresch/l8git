import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import type { KeyboardEventHandler } from 'react';
import { useTranslation } from 'react-i18next';

export function FileFilterInput({ value, onChange, onKeyDown, className }: { value: string; onChange: (value: string) => void; onKeyDown?: KeyboardEventHandler<HTMLInputElement>; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn('relative', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1.5 size-3.5 text-muted-foreground" />
      <Input type="search" inputSize="sm" className="pl-7" value={value} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} aria-label={t('compare.filterFiles')} placeholder={t('compare.filterFiles')} />
    </div>
  );
}
