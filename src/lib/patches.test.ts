import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));

import { oldestFirst } from './patches';

describe('oldestFirst', () => {
  const history = [{ hash: 'c3' }, { hash: 'c2' }, { hash: 'c1' }];

  it('numbers a selection oldest first regardless of click order', () => {
    expect(oldestFirst(['c3', 'c1', 'c2'], history)).toEqual(['c1', 'c2', 'c3']);
    expect(oldestFirst(new Set(['c2', 'c3']), history)).toEqual(['c2', 'c3']);
  });

  it('puts hashes missing from the loaded history last', () => {
    expect(oldestFirst(['zz', 'c3', 'c1'], history)).toEqual(['c1', 'c3', 'zz']);
  });
});
