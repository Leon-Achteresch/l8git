import { describe, expect, it } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import pt from '@/locales/pt.json';
import ja from '@/locales/ja.json';
import zh from '@/locales/zh.json';
import { getWorkflowGuides, searchWorkflowGuides } from './workflow-help';
import { getGitGlossary } from './git-glossary';

function leaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  return Object.fromEntries(Object.entries(value as object).flatMap(([key, child]) => Object.entries(leaves(child, `${prefix}.${key}`))));
}

describe('localized workflow guidance', () => {
  const source = leaves({ helpCenter: en.helpCenter, workflowGuides: en.workflowGuides, gitGlossary: en.gitGlossary });
  const catalog = getWorkflowGuides('en');
  for (const [language, bundle] of Object.entries({ en, de, es, fr, pt, ja, zh })) {
    it(`${language} has complete copy, exact placeholders and stable workflow metadata`, () => {
      const copy = leaves({ helpCenter: bundle.helpCenter, workflowGuides: bundle.workflowGuides, gitGlossary: bundle.gitGlossary });
      expect(Object.keys(copy).sort()).toEqual(Object.keys(source).sort());
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim(), key).not.toBe('');
        expect((value.match(/\{\{[^}]+\}\}/g) ?? []).sort(), key).toEqual((source[key].match(/\{\{[^}]+\}\}/g) ?? []).sort());
      }
      const guides = getWorkflowGuides(language, bundle.workflowGuides);
      expect(guides.map(({ id, category, target, reference }) => ({ id, category, target, reference }))).toEqual(catalog.map(({ id, category, target, reference }) => ({ id, category, target, reference })));
      for (const guide of guides) {
        expect(guide.title).toBe(bundle.workflowGuides[guide.id as keyof typeof bundle.workflowGuides].title);
        expect(searchWorkflowGuides(guides, guide.title).some(result => result.id === guide.id)).toBe(true);
      }
      const glossary = getGitGlossary(language, '', bundle.gitGlossary);
      expect(glossary.map(term => term.id)).toEqual(getGitGlossary('en').map(term => term.id));
      for (const term of glossary) expect(term.definition).toBe(bundle.gitGlossary[term.id as keyof typeof bundle.gitGlossary].definition);
      if (language !== 'en') expect(guides[0].title).not.toBe(catalog[0].title);
    });
  }
});
