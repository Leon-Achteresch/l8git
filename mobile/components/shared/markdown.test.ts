import { describe, expect, test } from 'vitest';

import { highlightCode, parseInline, parseMarkdown } from '~/components/shared/markdown';

describe('parseInline', () => {
  test('keeps plain text as one span', () => {
    expect(parseInline('just text')).toEqual([{ text: 'just text' }]);
  });

  test('parses bold without looping', () => {
    expect(parseInline('a **bold** b')).toEqual([
      { text: 'a ' },
      { text: 'bold', bold: true },
      { text: ' b' },
    ]);
  });

  test('parses links without looping', () => {
    expect(parseInline('see [docs](https://l8git.dev) now')).toEqual([
      { text: 'see ' },
      { text: 'docs', href: 'https://l8git.dev' },
      { text: ' now' },
    ]);
  });

  test('handles several nested emphases in one line', () => {
    const spans = parseInline('**one** and *two* and ~~three~~ and [four](https://x.dev)');
    expect(spans.map((span) => span.text)).toEqual([
      'one',
      ' and ',
      'two',
      ' and ',
      'three',
      ' and ',
      'four',
    ]);
    expect(spans[0].bold).toBe(true);
    expect(spans[2].italic).toBe(true);
    expect(spans[4].strike).toBe(true);
    expect(spans[6].href).toBe('https://x.dev');
  });

  test('keeps inline code verbatim', () => {
    expect(parseInline('call `git_status` now')).toEqual([
      { text: 'call ' },
      { text: 'git_status', code: true },
      { text: ' now' },
    ]);
  });
});

describe('parseMarkdown', () => {
  test('parses a mixed document', () => {
    const blocks = parseMarkdown(
      [
        '## Release notes',
        '',
        'Adds the **progress toast**.',
        '',
        '- `ProgressToastHost` mounts once',
        '- Deep links resolve',
        '',
        '> Long-press a tile.',
        '',
        '```ts',
        'const a = 1;',
        '```',
        '',
        'See [the concept](https://l8git.dev).',
      ].join('\n')
    );

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'quote',
      'code',
      'paragraph',
    ]);
  });
});

describe('highlightCode', () => {
  test('tokenizes a line', () => {
    expect(highlightCode('const a = 1;').length).toBeGreaterThan(1);
  });
});
