import { describe, expect, it } from 'vitest';
import { getWorkflowGuides, isConflictedStatus, recommendWorkflow, searchWorkflowGuides, type WorkflowContext } from './workflow-help';
import { getGitGlossary } from './git-glossary';

const clean: WorkflowContext = { hasRepo: true, statusKnown: true, staged: 0, changed: 0, conflicts: 0, detached: false };

describe('workflow guidance', () => {
  it('explains searchable Git terms in both languages', () => {
    expect(getGitGlossary('de', 'arbeitskopie').length).toBeGreaterThan(0);
    expect(getGitGlossary('en', 'fast-forward')[0].id).toBe('fast-forward');
    expect(getGitGlossary('en', 'reflog')[0].definition).toContain('local');
    expect(getGitGlossary('en', 'unfindable-term')).toEqual([]);
    expect(getGitGlossary('de').map(term => term.id)).toEqual(getGitGlossary('en').map(term => term.id));
  });
  it('has matching localized guides with stable unique IDs and valid destinations', () => {
    const en = getWorkflowGuides('en');
    const de = getWorkflowGuides('de-DE');
    expect(en.map(g => g.id)).toEqual(de.map(g => g.id));
    expect(new Set(en.map(g => g.id)).size).toBe(en.length);
    expect(de[0].title).not.toBe(en[0].title);
    expect(getWorkflowGuides('fr')).toEqual(en);
    for (const guide of [...en, ...de]) {
      expect(guide.steps.length).toBeGreaterThan(2);
      expect(new URL(guide.reference).hostname).toBe('git-scm.com');
    }
  });

  it('searches multiple words, synonyms and accented German text', () => {
    const en = getWorkflowGuides('en');
    expect(searchWorkflowGuides(en, 'non-fast-forward')[0].id).toBe('sync-branch');
    expect(searchWorkflowGuides(en, 'stage snapshot')[0].id).toBe('first-commit');
    expect(searchWorkflowGuides(getWorkflowGuides('de'), 'aufraumen')[0].id).toBe('clean-history');
    expect(searchWorkflowGuides(en, '  ')[0]).toEqual(en[0]);
    expect(searchWorkflowGuides(en, 'unlikelymissingword')).toEqual([]);
    expect(searchWorkflowGuides(en, '', 'recovery').every(g => g.category === 'recovery')).toBe(true);
  });

  it('uses loaded localized copy without changing destinations or reference metadata', () => {
    const original = getWorkflowGuides('en')[0];
    const copy = { title: 'Dépendance enregistrée', summary: 'Version conservée', steps: original.steps.map((_, index) => `Étape ${index + 1}`), caution: 'Sauvegarder les changements', target: 'settings', reference: 'https://invalid.example' };
    const localized = getWorkflowGuides('fr', { [original.id]: copy });
    expect(localized[0]).toMatchObject({ title: copy.title, steps: copy.steps, target: original.target, reference: original.reference });
    expect(searchWorkflowGuides(localized, 'dependance')[0].id).toBe(original.id);
    expect(localized[1]).toEqual(getWorkflowGuides('en')[1]);
    for (const bad of [null, 'workflowGuides', [], { [original.id]: { ...copy, title: '' } }, { [original.id]: { ...copy, steps: ['Too short'] } }]) expect(getWorkflowGuides('fr', bad)).toEqual(getWorkflowGuides('en'));
    copy.steps[0] = 'Changed after reading';
    expect(localized[0].steps[0]).toBe('Étape 1');
  });

  it('searches localized glossary copy and falls back on incomplete translations', () => {
    const original = getGitGlossary('en')[0];
    const copy = { name: 'Arbre de travail', definition: 'Fichiers de travail', example: 'Modifier un fichier', reference: 'https://invalid.example' };
    expect(getGitGlossary('fr', 'arbre', { [original.id]: copy })[0]).toMatchObject({ name: copy.name, reference: original.reference });
    expect(getGitGlossary('fr', '', { [original.id]: { ...copy, example: '' } })).toEqual(getGitGlossary('en'));
  });

  it('prioritizes unresolved operations and detached HEAD over ordinary work', () => {
    expect(recommendWorkflow({ ...clean, staged: 4, conflicts: 1, ahead: 3 }).reason).toBe('conflicts');
    expect(recommendWorkflow({ ...clean, operation: 'rebase', detached: true }).reason).toBe('operation');
    expect(recommendWorkflow({ ...clean, detached: true, behind: 2 }).guideId).toBe('detached-head');
    expect(recommendWorkflow({ ...clean, ahead: 1, behind: 2 }).reason).toBe('diverged');
  });

  it('does not claim that an unloaded working copy is clean', () => {
    expect(recommendWorkflow({ ...clean, statusKnown: false }).reason).toBe('unknown');
    expect(recommendWorkflow({ ...clean, hasRepo: false }).reason).toBe('start');
    expect(recommendWorkflow({ ...clean, staged: 1 }).reason).toBe('staged');
    expect(recommendWorkflow({ ...clean, changed: 1 }).reason).toBe('changed');
    expect(recommendWorkflow(clean).reason).toBe('clean');
  });

  it('recognizes every porcelain unmerged pair including add/add and delete/delete', () => {
    for (const status of ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']) expect(isConflictedStatus(status[0], status[1])).toBe(true);
    for (const status of ['MM', ' M', 'M ', '??', 'A ', ' D']) expect(isConflictedStatus(status[0], status[1])).toBe(false);
  });
});
