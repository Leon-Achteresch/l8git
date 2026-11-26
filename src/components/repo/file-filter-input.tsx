import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import type { KeyboardEventHandler } from 'react';
import { useTranslation } from 'react-i18next';

type FileFilterInputProps = {
  value: string;
  onChange: (value: string) => void;
  onPickFirstMatch?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  className?: string;
};

export function FileFilterInput({ value, onChange, onPickFirstMatch, onKeyDown, className }: FileFilterInputProps) {
  const { t } = useTranslation();
  const handleKey: KeyboardEventHandler<HTMLInputElement> = event => {
    if (event.nativeEvent.isComposing) return;
    if (onPickFirstMatch && event.key === 'Escape' && value) {
      event.preventDefault();
      event.stopPropagation();
      onChange('');
    } else if (onPickFirstMatch && event.key === 'Enter' && value.trim()) {
      event.preventDefault();
      onPickFirstMatch();
    } else {
      onKeyDown?.(event);
    }
  };
  return (
    <div className={cn('relative', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1.5 size-3.5 text-muted-foreground" />
      <Input
        type="search" inputSize="sm" className="pl-7" value={value}
        onChange={event => onChange(event.target.value)} onKeyDown={handleKey}
        aria-label={t('compare.filterFiles')} placeholder={`${t('compare.filterFiles')} (*.ts)`}
      />
    </div>
  );
}
