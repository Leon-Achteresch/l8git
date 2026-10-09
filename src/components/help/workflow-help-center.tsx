import { useMemo, useState } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { ArrowRight, BookOpen, Check, ChevronRight, Compass, ExternalLink, Search, ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useRepoStore, repoLabel } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { startOnboardingTour } from '@/lib/onboarding-prefs';
import { getWorkflowGuides, isConflictedStatus, recommendWorkflow, searchWorkflowGuides, type WorkflowCategory, type WorkflowTarget } from '@/lib/workflow-help';
import { cn } from '@/lib/utils';
import { getGitGlossary } from '@/lib/git-glossary';

const categories: WorkflowCategory[] = ['daily', 'history', 'team', 'recovery', 'advanced'];

export function WorkflowHelpCenter() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const hash = useRouterState({ select: state => state.location.hash });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WorkflowCategory | undefined>();
  const [checked, setChecked] = useState<Record<string, number[]>>({});
  const activePath = useRepoStore(state => state.activePath);
  const repo = useRepoStore(state => activePath ? state.repos[activePath] : undefined);
  const entries = useRepoStore(state => activePath ? state.status[activePath] : undefined);
  const sync = useRepoStore(state => activePath ? state.upstreamSync[activePath] : undefined);
  const rebase = useRepoStore(state => activePath ? state.rebaseState[activePath] : undefined);
  const merge = useRepoStore(state => activePath ? state.mergeState[activePath] : undefined);
  const cherryPick = useRepoStore(state => activePath ? state.cherryPickState[activePath] : undefined);
  const guides = useMemo(() => getWorkflowGuides(i18n.language, t('workflowGuides', { returnObjects: true })), [i18n.language, t]);
  const results = useMemo(() => searchWorkflowGuides(guides, query, category), [guides, query, category]);
  const terms = useMemo(() => getGitGlossary(i18n.language, query, t('gitGlossary', { returnObjects: true })), [i18n.language, query, t]);
  const recommendation = recommendWorkflow({
    hasRepo: !!repo,
    statusKnown: entries !== undefined,
    staged: entries?.filter(entry => entry.staged).length ?? 0,
    changed: entries?.filter(entry => entry.unstaged || entry.untracked).length ?? 0,
    conflicts: entries?.filter(entry => isConflictedStatus(entry.index_status, entry.worktree_status)).length ?? 0,
    detached: !!repo && repo.commits.length > 0 && !repo.branches.some(branch => branch.is_current),
    ahead: sync?.ahead,
    behind: sync?.behind,
    operation: rebase?.in_progress ? 'rebase' : merge?.in_progress ? 'merge' : cherryPick?.in_progress ? 'cherry-pick' : null,
  });
  const suggested = guides.find(guide => guide.id === recommendation.guideId)!;
  const selected = guides.find(guide => guide.id === hash)
    ?? (!query.trim() && !category ? results.find(guide => guide.id === suggested.id) : undefined)
    ?? results[0];

  function selectGuide(id: string) {
    void router.navigate({ to: '/info', hash: id, replace: true });
  }

  async function openTarget(target: WorkflowTarget) {
    if (target === 'settings') { await router.navigate({ to: '/settings' }); return; }
    if (target === 'tour') { await router.navigate({ to: '/' }); startOnboardingTour(); return; }
    if (!activePath) return;
    await router.navigate({ to: '/' });
    const ui = useUiStore.getState();
    if (target === 'reflog') ui.openReflogView(activePath);
    else if (target === 'commands') ui.openCommandLog();
    else ui.setSidebarTab(target);
  }

  const progress = selected ? checked[selected.id] ?? [] : [];

  return <div className="space-y-5" data-testid="workflow-help">
    <section className={cn('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between', recommendation.severity === 'attention' ? 'border-amber-500/30 bg-amber-500/5' : 'bg-muted/25')} aria-label={t('helpCenter.recommendation')}>
      <div className="flex min-w-0 items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{activePath ? repoLabel(activePath) : t('helpCenter.getStarted')}</p>
          <h2 className="mt-1 text-sm font-semibold">{t(`helpCenter.reason.${recommendation.reason}`)}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{suggested.summary}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setQuery(''); setCategory(undefined); selectGuide(suggested.id); }}>{t('helpCenter.showGuide')}<ArrowRight className="size-3.5" /></Button>
    </section>

    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden />
        <Input type="search" className="pl-9 pr-10" value={query} onChange={event => { setQuery(event.target.value); void router.navigate({ to: '/info', hash: '', replace: true }); }} placeholder={t('helpCenter.searchPlaceholder')} aria-label={t('helpCenter.search')} />
        {query && <Button size="icon-sm" variant="ghost" className="absolute right-1 top-1" aria-label={t('helpCenter.clearSearch')} onClick={() => setQuery('')}><X className="size-4" /></Button>}
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label={t('helpCenter.categories')}>
        <Button size="sm" variant={!category ? 'secondary' : 'ghost'} aria-pressed={!category} onClick={() => { setCategory(undefined); void router.navigate({ to: '/info', hash: '', replace: true }); }}>{t('helpCenter.all')}</Button>
        {categories.map(value => <Button key={value} size="sm" variant={category === value ? 'secondary' : 'ghost'} aria-pressed={category === value} onClick={() => { setCategory(value); void router.navigate({ to: '/info', hash: '', replace: true }); }}>{t(`helpCenter.category.${value}`)}</Button>)}
      </div>
      <p className="text-xs text-muted-foreground" role="status">{t('helpCenter.results', { count: results.length })}</p>
    </div>

    {results.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center">
      <Search className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{t('helpCenter.noResults')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('helpCenter.noResultsHint')}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => { setQuery(''); setCategory(undefined); }}>{t('helpCenter.clearFilters')}</Button>
    </div> : <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label={t('helpCenter.guideList')} value={selected?.id ?? results[0].id} onChange={event => selectGuide(event.target.value)}>{results.map(guide => <option key={guide.id} value={guide.id}>{guide.title}</option>)}</select>
      <nav aria-label={t('helpCenter.guideList')} className="hidden space-y-1 lg:sticky lg:top-4 lg:block">
        {results.map(guide => <button type="button" key={guide.id} onClick={() => selectGuide(guide.id)} aria-current={selected?.id === guide.id ? 'true' : undefined} className={cn('flex w-full items-start gap-2.5 rounded-lg border border-transparent px-3 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring', selected?.id === guide.id ? 'border-border bg-muted/60' : 'hover:bg-muted/40')}>
          <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-snug">{guide.title}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t(`helpCenter.category.${guide.category}`)}</span></span>
          <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>)}
      </nav>

      {selected && <article className="min-w-0 rounded-xl border p-5 sm:p-6" aria-label={selected.title}>
        <span className="text-xs font-medium text-muted-foreground">{t(`helpCenter.category.${selected.category}`)}</span>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{selected.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selected.summary}</p>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{t('helpCenter.progress', { done: progress.length, total: selected.steps.length })}</span>
          {progress.length > 0 && <Button variant="ghost" size="sm" onClick={() => setChecked(current => ({ ...current, [selected.id]: [] }))}>{t('helpCenter.resetChecklist')}</Button>}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t('helpCenter.checklist')} aria-valuenow={progress.length} aria-valuemin={0} aria-valuemax={selected.steps.length}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.length / selected.steps.length * 100}%` }} /></div>
        <ol className="mt-5 space-y-4">
          {selected.steps.map((step, index) => <li key={`${selected.id}-${index}`} className="flex items-start gap-3">
            <Checkbox id={`guide-${selected.id}-${index}`} className="mt-1" checked={progress.includes(index)} onCheckedChange={value => setChecked(current => ({ ...current, [selected.id]: value === true ? [...new Set([...progress, index])] : progress.filter(item => item !== index) }))} />
            <label htmlFor={`guide-${selected.id}-${index}`} className="cursor-pointer text-sm leading-relaxed"><span className="mr-2 font-mono text-xs text-muted-foreground">{index + 1}.</span>{step}</label>
          </li>)}
        </ol>
        {progress.length === selected.steps.length && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" role="status"><Check className="size-4" />{t('helpCenter.checklistComplete')}</p>}
        <aside className="mt-6 rounded-lg bg-muted/40 p-4 text-sm leading-relaxed"><h3 className="mb-1 font-medium">{t('helpCenter.keepInMind')}</h3><p className="text-muted-foreground">{selected.caution}</p></aside>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!activePath && selected.target !== 'settings' && selected.target !== 'tour'} onClick={() => void openTarget(selected.target)}>{t(`helpCenter.target.${selected.target}`)}<ArrowRight className="size-3.5" /></Button>
          <Button asChild variant="ghost" size="sm"><a href={selected.reference} target="_blank" rel="noopener noreferrer">{t('helpCenter.gitReference')}<ExternalLink className="size-3.5" /></a></Button>
        </div>
        {!activePath && selected.target !== 'settings' && selected.target !== 'tour' && <p className="mt-2 text-xs text-muted-foreground">{t('helpCenter.openRepoFirst')}</p>}
      </article>}
    </div>}

    {terms.length > 0 && <details className="rounded-xl border" open={query.trim().length > 0 || undefined}>
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('helpCenter.glossary', { count: terms.length })}</summary>
      <dl className="grid gap-5 px-5 pb-5 sm:grid-cols-2">{terms.map(term => <div key={term.id} className="min-w-0 border-t pt-4"><dt className="text-sm font-semibold">{term.name}</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{term.definition}<p className="mt-2 text-xs leading-relaxed">{term.example}</p><a className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline" href={term.reference} target="_blank" rel="noopener noreferrer">{t('helpCenter.gitReference')}<ExternalLink className="size-3" /></a></dd></div>)}</dl>
    </details>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">{t('helpCenter.localHint')}</p>
      <Button size="sm" variant="ghost" onClick={() => void openTarget('tour')}><Compass className="size-4" />{t('appSearch.actionRestartTour')}</Button>
    </div>
  </div>;
}
