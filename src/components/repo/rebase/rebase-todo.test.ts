import { describe, expect, it } from 'vitest';

import type { RebaseCommit } from '@/lib/repo-store';
import {
  actionForKey,
  entriesFromCommits,
  moveEntry,
  summarizeEntries,
  toTodoItems,
  validateEntries,
  withFullMessage,
  type RebaseEntry,
} from '@/components/repo/rebase/rebase-todo';

function commit(hash: string, subject: string): RebaseCommit {
  return {
    hash,
    short_hash: hash.slice(0, 7),
    subject,
    author: 'Ada',
    email: 'ada@example.com',
    date: '2026-01-01T00:00:00+01:00',
  };
}

const commits = [
  commit('aaaaaaa1111', 'first'),
  commit('bbbbbbb2222', 'second'),
  commit('ccccccc3333', 'third'),
];

function entries(...actions: RebaseEntry['action'][]): RebaseEntry[] {
  return entriesFromCommits(commits).map((e, i) => ({
    ...e,
    action: actions[i] ?? e.action,
  }));
}

describe('actionForKey', () => {
  it('maps the lazygit letters case-insensitively', () => {
    expect(actionForKey('p')).toBe('pick');
    expect(actionForKey('R')).toBe('reword');
    expect(actionForKey('s')).toBe('squash');
    expect(actionForKey('f')).toBe('fixup');
    expect(actionForKey('e')).toBe('edit');
    expect(actionForKey('D')).toBe('drop');
  });

  it('ignores other keys', () => {
    expect(actionForKey('x')).toBeNull();
    expect(actionForKey('Enter')).toBeNull();
    expect(actionForKey('')).toBeNull();
  });
});

describe('entriesFromCommits', () => {
  it('defaults to pick and prefills the message with the subject', () => {
    const list = entriesFromCommits(commits);
    expect(list.map(e => e.action)).toEqual(['pick', 'pick', 'pick']);
    expect(list[1]).toMatchObject({
      hash: 'bbbbbbb2222',
      shortHash: 'bbbbbbb',
      message: 'second',
    });
  });

  it('applies a preset action to the matching commit only', () => {
    const list = entriesFromCommits(commits, {
      hash: 'ccccccc3333',
      action: 'reword',
    });
    expect(list.map(e => e.action)).toEqual(['pick', 'pick', 'reword']);
  });
});

describe('moveEntry', () => {
  it('reorders without mutating the input', () => {
    const list = entries();
    const moved = moveEntry(list, 2, 0);
    expect(moved.map(e => e.hash)).toEqual([
      'ccccccc3333',
      'aaaaaaa1111',
      'bbbbbbb2222',
    ]);
    expect(list.map(e => e.hash)).toEqual([
      'aaaaaaa1111',
      'bbbbbbb2222',
      'ccccccc3333',
    ]);
  });

  it('keeps the order for out-of-range targets', () => {
    const list = entries();
    expect(moveEntry(list, 0, -1).map(e => e.hash)).toEqual(
      list.map(e => e.hash)
    );
    expect(moveEntry(list, 0, 3).map(e => e.hash)).toEqual(
      list.map(e => e.hash)
    );
  });
});

describe('validateEntries', () => {
  it('accepts a plain pick list', () => {
    expect(validateEntries(entries())).toBeNull();
  });

  it('rejects an empty list', () => {
    expect(validateEntries([])).toBe('empty');
  });

  it('rejects a list where every commit is dropped', () => {
    expect(validateEntries(entries('drop', 'drop', 'drop'))).toBe('allDropped');
  });

  it('rejects squash or fixup as the first kept entry', () => {
    expect(validateEntries(entries('squash'))).toBe('firstSquash');
    expect(validateEntries(entries('drop', 'fixup'))).toBe('firstSquash');
  });

  it('allows squash below a kept leader', () => {
    expect(validateEntries(entries('pick', 'squash', 'fixup'))).toBeNull();
  });
});

describe('toTodoItems', () => {
  it('omits the message when it still equals the subject', () => {
    expect(toTodoItems(entries('reword'))[0]).toEqual({
      action: 'reword',
      hash: 'aaaaaaa1111',
      newMessage: null,
    });
  });

  it('sends a trimmed message for reword and squash', () => {
    const list = entries('pick', 'reword', 'squash').map((e, i) =>
      i === 0 ? e : { ...e, message: `  new ${i}  ` }
    );
    const items = toTodoItems(list);
    expect(items[1].newMessage).toBe('new 1');
    expect(items[2].newMessage).toBe('new 2');
  });

  it('never sends a message for actions that ignore it', () => {
    const list = entries('pick', 'fixup', 'drop').map(e => ({
      ...e,
      message: 'edited',
    }));
    expect(toTodoItems(list).map(i => i.newMessage)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe('summarizeEntries', () => {
  const order = commits.map(c => c.hash);

  it('reports an untouched list as unchanged', () => {
    const summary = summarizeEntries(entries(), order);
    expect(summary.changed).toBe(false);
    expect(summary.reordered).toBe(false);
    expect(summary.counts.pick).toBe(3);
  });

  it('detects reordering and counts actions', () => {
    const summary = summarizeEntries(
      moveEntry(entries('pick', 'drop', 'squash'), 0, 2),
      order
    );
    expect(summary.reordered).toBe(true);
    expect(summary.changed).toBe(true);
    expect(summary.dropped).toBe(1);
    expect(summary.counts.squash).toBe(1);
  });
});

describe('withFullMessage', () => {
  it('fills the untouched draft with the full commit body', () => {
    const list = withFullMessage(
      entries('reword'),
      'aaaaaaa1111',
      'first\n\nbody line'
    );
    expect(list[0].message).toBe('first\n\nbody line');
    expect(list[0].baseMessage).toBe('first\n\nbody line');
    expect(list[0].messageLoaded).toBe(true);
    expect(list[1].messageLoaded).toBe(false);
  });

  it('keeps a message the user already edited', () => {
    const edited = entries('reword').map(e =>
      e.hash === 'aaaaaaa1111' ? { ...e, message: 'mine' } : e
    );
    const list = withFullMessage(edited, 'aaaaaaa1111', 'first\n\nbody');
    expect(list[0].message).toBe('mine');
    expect(list[0].baseMessage).toBe('first\n\nbody');
  });

  it('does not reload an entry that was already loaded', () => {
    const once = withFullMessage(entries('reword'), 'aaaaaaa1111', 'full one');
    const twice = withFullMessage(once, 'aaaaaaa1111', 'full two');
    expect(twice[0].message).toBe('full one');
  });
});

describe('toTodoItems with a loaded full message', () => {
  it('sends nothing while the body is unchanged', () => {
    const list = withFullMessage(
      entries('reword'),
      'aaaaaaa1111',
      'first\n\nbody line'
    );
    expect(toTodoItems(list)[0].newMessage).toBeNull();
  });

  it('sends the edited body', () => {
    const list = withFullMessage(
      entries('reword'),
      'aaaaaaa1111',
      'first\n\nbody line'
    ).map(e =>
      e.hash === 'aaaaaaa1111' ? { ...e, message: 'first\n\nnew body' } : e
    );
    expect(toTodoItems(list)[0].newMessage).toBe('first\n\nnew body');
  });
});
