import { BookmarkPlus, CalendarDays, Check, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  EMPTY_HISTORY_FILTER,
  hasHistoryFilters,
  historyDateRange,
  historyFilterCount,
  historyFilterKey,
  sanitizeHistoryFilter,
  validateHistoryDates,
} from '@/lib/history-filters';
import { useHistoryPrefs } from '@/lib/history-prefs';
import type { HistoryFilter } from '@/lib/use-history-query';

const EMPTY_PRESETS: NonNullable<ReturnType<typeof useHistoryPrefs.getState>['repositories'][string]>['presets'] = [];

type Props = {
  path: string;
  value: HistoryFilter;
  authors?: string[];
  onChange: (value: HistoryFilter) => void;
};

export function HistoryFilters({ path, value, authors = [], onChange }: Props) {
  const { t } = useTranslation();
  const formId = useId();
  const authorsId = useId();
  const dateErrorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [presetName, setPresetName] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const presets = useHistoryPrefs(state => state.repositories[path]?.presets ?? EMPTY_PRESETS);
  const valueKey = historyFilterKey(value);
  const dateError = validateHistoryDates(draft);
  const dirty = historyFilterKey(draft) !== valueKey;
  const activeCount = historyFilterCount(value);
  const matchingPreset = presets.find(preset => preset.name.toLocaleLowerCase() === presetName.trim().toLocaleLowerCase());
  const authorSuggestions = useMemo(() => [...new Set(authors)].sort((a, b) => a.localeCompare(b)).slice(0, 80), [authors]);

  useEffect(() => {
    setDraft(value);
  }, [path, valueKey]);

  useEffect(() => {
    setPresetName('');
    setPresetsOpen(false);
  }, [path]);

  useEffect(() => {
    // Keep the previous single saved filter when upgrading to named searches.
    try {
      const raw = localStorage.getItem('l8git-history-filter');
      if (!raw) return;
      const previous = sanitizeHistoryFilter(JSON.parse(raw));
      if (!hasHistoryFilters(previous) || validateHistoryDates(previous)) return;
      useHistoryPrefs.getState().savePreset(path, t('audit.savedFilter'), previous);
      localStorage.removeItem('l8git-history-filter');
    } catch {
      // An unavailable or malformed legacy store must not prevent history use.
    }
  }, [path, t]);

  const apply = () => {
    if (dateError) return;
    const next = sanitizeHistoryFilter(draft);
    setDraft(next);
    onChange(next);
  };
  const reset = () => {
    setDraft(EMPTY_HISTORY_FILTER);
    onChange(EMPTY_HISTORY_FILTER);
  };
  const removeField = (field: keyof Omit<HistoryFilter, 'refs'>) => onChange({ ...value, [field]: '' });

  return (
    <div className="shrink-0 border-b border-border px-3 py-2">
      <form
        id={formId}
        aria-label={t('audit.filters')}
        onSubmit={event => { event.preventDefault(); apply(); }}
        onKeyDown={event => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          setDraft(value);
          setOpen(false);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
            <Input
              type="search"
              value={draft.query}
              aria-label={t('audit.query')}
              placeholder={t('historyFilters.searchPlaceholder')}
              onChange={event => setDraft(current => ({ ...current, query: event.target.value }))}
              className="h-8 pl-8"
            />
          </div>
          <Button type="submit" size="sm" disabled={!dirty || !!dateError}>
            <Search aria-hidden="true" />
            {t('historyFilters.apply')}
          </Button>
          <Button type="button" size="sm" variant={open || activeCount > 0 ? 'secondary' : 'ghost'} onClick={() => setOpen(current => !current)} aria-expanded={open} aria-controls={`${formId}-advanced`}>
            <SlidersHorizontal aria-hidden="true" />
            {t('historyFilters.advanced')}
            {activeCount > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{activeCount}</span>}
          </Button>
          <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="ghost">
                <BookmarkPlus aria-hidden="true" />
                {t('historyFilters.presets')}
                {presets.length > 0 && <span className="text-xs text-muted-foreground">{presets.length}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">{t('historyFilters.presets')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('historyFilters.presetsHint')}</p>
                </div>
                {presets.length > 0 ? (
                  <div className="max-h-52 space-y-1 overflow-auto">
                    {presets.map(preset => (
                      <div key={preset.id} className="flex items-center gap-1 rounded-md hover:bg-muted/50">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto min-h-8 min-w-0 flex-1 justify-start gap-2 py-1.5 text-left"
                          onClick={() => {
                            setDraft(preset.filter);
                            onChange(preset.filter);
                            setPresetsOpen(false);
                          }}
                        >
                          {historyFilterKey(preset.filter) === valueKey && <Check aria-hidden="true" className="size-3.5 text-primary" />}
                          <span className="truncate">{preset.name}</span>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={t('historyFilters.deletePreset', { name: preset.name })} title={t('historyFilters.deletePreset', { name: preset.name })} onClick={() => useHistoryPrefs.getState().removePreset(path, preset.id)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground">{t('historyFilters.noPresets')}</p>}
                <div className="space-y-2 border-t border-border pt-3">
                  <label className="block text-xs text-muted-foreground" htmlFor={`${formId}-preset-name`}>{t('historyFilters.presetName')}</label>
                  <Input id={`${formId}-preset-name`} value={presetName} maxLength={80} onChange={event => setPresetName(event.target.value)} placeholder={t('historyFilters.presetPlaceholder')} onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (presetName.trim() && hasHistoryFilters(draft) && !dateError) {
                        useHistoryPrefs.getState().savePreset(path, presetName, draft);
                        toast.success(t('historyFilters.presetSaved', { name: presetName.trim() }));
                        setPresetName('');
                      }
                    }
                  }} />
                  <Button type="button" className="w-full" size="sm" disabled={!presetName.trim() || !hasHistoryFilters(draft) || !!dateError} onClick={() => {
                    useHistoryPrefs.getState().savePreset(path, presetName, draft);
                    toast.success(t('historyFilters.presetSaved', { name: presetName.trim() }));
                    setPresetName('');
                  }}>
                    <BookmarkPlus aria-hidden="true" />
                    {t(matchingPreset ? 'historyFilters.updatePreset' : 'historyFilters.savePreset')}
                  </Button>
                  {!hasHistoryFilters(draft) && <p className="text-xs text-muted-foreground">{t('historyFilters.addFilterFirst')}</p>}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {open && (
          <div id={`${formId}-advanced`} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(['author', 'file', 'since', 'until'] as const).map(field => (
                <label key={field} className="block text-xs text-muted-foreground">
                  {t(`audit.${field}`)}
                  <Input
                    type={field === 'since' || field === 'until' ? 'date' : 'text'}
                    value={draft[field]}
                    list={field === 'author' ? authorsId : undefined}
                    placeholder={field === 'author' ? t('historyFilters.authorPlaceholder') : field === 'file' ? t('historyFilters.pathPlaceholder') : undefined}
                    max={field === 'since' ? draft.until || '9999-12-31' : field === 'until' ? '9999-12-31' : undefined}
                    min={field === 'until' ? draft.since || '0001-01-01' : field === 'since' ? '0001-01-01' : undefined}
                    aria-invalid={field === 'since' || field === 'until' ? !!dateError : undefined}
                    aria-describedby={dateError && (field === 'since' || field === 'until') ? dateErrorId : undefined}
                    onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))}
                    className="mt-1 h-8"
                  />
                </label>
              ))}
            </div>
            <datalist id={authorsId}>{authorSuggestions.map(author => <option key={author} value={author} />)}</datalist>
            <div className="flex flex-wrap items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-3.5 text-muted-foreground" />
              {[7, 30, 90].map(days => <Button key={days} type="button" size="xs" variant="outline" onClick={() => setDraft(current => ({ ...current, ...historyDateRange(days) }))}>{t('historyFilters.lastDays', { count: days })}</Button>)}
              {(draft.since || draft.until) && <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(current => ({ ...current, since: '', until: '' }))}>{t('historyFilters.anyTime')}</Button>}
              {dirty && <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(value)}>{t('historyFilters.discardDraft')}</Button>}
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer hover:text-foreground">{t('historyFilters.searchHelp')}</summary>
              <p className="mt-1 max-w-3xl leading-relaxed">{t('historyFilters.searchHelpText')}</p>
            </details>
          </div>
        )}
        {dateError && <p id={dateErrorId} role="alert" className="mt-2 text-xs text-destructive">{t(`historyFilters.${dateError}`)}</p>}
      </form>
      {activeCount > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={t('historyFilters.activeFilters')}>
          {(['query', 'author', 'file', 'since', 'until'] as const).filter(field => value[field]).map(field => (
            <button key={field} type="button" className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => removeField(field)} aria-label={t('historyFilters.removeFilter', { field: t(`audit.${field}`), value: value[field] })} title={value[field]}>
              <span className="max-w-56 truncate">{t(`audit.${field}`)}: {value[field]}</span><X aria-hidden="true" className="size-3 shrink-0" />
            </button>
          ))}
          {value.refs.map(ref => (
            <button key={ref} type="button" className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChange({ ...value, refs: value.refs.filter(name => name !== ref) })} aria-label={t('historyFilters.removeBranch', { name: ref })} title={ref}>
              <span className="max-w-48 truncate">{ref}</span><X aria-hidden="true" className="size-3 shrink-0" />
            </button>
          ))}
          <Button type="button" size="xs" variant="ghost" onClick={reset}><X aria-hidden="true" />{t('historyFilters.clearAll')}</Button>
        </div>
      )}
    </div>
  );
}
