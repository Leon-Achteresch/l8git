import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { HistoryFilter } from '@/lib/use-history-query';
export function HistoryFilters({ value, onChange }: { value: HistoryFilter; onChange: (value: HistoryFilter) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<HistoryFilter | null>(() => {
    try { const raw = JSON.parse(localStorage.getItem('l8git-history-filter') ?? 'null'); return raw && Array.isArray(raw.refs) && raw.refs.every((ref: unknown) => typeof ref === 'string') && ['author','since','until','query','file'].every(k => typeof raw[k] === 'string') ? raw : null; } catch { return null; }
  });
  return <div className="border-b border-border px-3 py-1.5">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{t('audit.filters')}</Button>
      {saved && <Button size="sm" variant="ghost" onClick={() => { onChange(saved); setOpen(true); }}>{t('audit.savedFilter')}</Button>}
      {open && <Button size="sm" variant="ghost" onClick={() => { localStorage.setItem('l8git-history-filter', JSON.stringify(value)); setSaved(value); }}>{t('common.save')}</Button>}
    </div>
    {open && <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {(['query','author','file','since','until'] as const).map(field => <label key={field} className="text-xs text-muted-foreground">{t(`audit.${field}`)}<Input type={field === 'since' || field === 'until' ? 'date' : 'text'} value={value[field]} onChange={e => onChange({ ...value, [field]: e.target.value })} className="mt-1 h-8" /></label>)}
      <Button size="sm" variant="ghost" onClick={() => onChange({ refs: value.refs, author: '', query: '', file: '', since: '', until: '' })}>{t('common.reset')}</Button>
    </div>}
  </div>;
}
