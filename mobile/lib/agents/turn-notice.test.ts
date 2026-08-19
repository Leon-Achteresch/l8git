import { describe, expect, it, vi } from 'vitest';

import { turnNoticeRun, type TurnNoticeThread } from './turn-notice';

const notification = {
  title: 'Refactor the parser',
  target: { provider: 'codex' as const, path: '/repos/app', threadId: 'thread-7' },
  action: { label: 'Open thread', run: () => undefined },
};

describe('turnNoticeRun', () => {
  it('navigates to the finished thread on the bound host', () => {
    const seen: TurnNoticeThread[] = [];
    const run = turnNoticeRun(notification, 'mac-01', (target) => seen.push(target));
    expect(run).not.toBeNull();
    run?.();
    expect(seen).toEqual([
      { hostId: 'mac-01', provider: 'codex', path: '/repos/app', threadId: 'thread-7' },
    ]);
  });

  it('never runs the desktop action, which only mutates stores', () => {
    const desktopRun = vi.fn();
    const open = vi.fn();
    const run = turnNoticeRun({ ...notification, action: { label: 'Open thread', run: desktopRun } }, 'mac-01', open);
    run?.();
    expect(desktopRun).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('offers no action when the thread path is unknown', () => {
    expect(turnNoticeRun({ title: 'done' }, 'mac-01', () => undefined)).toBeNull();
  });

  it('offers no action while no host is bound', () => {
    expect(turnNoticeRun(notification, null, () => undefined)).toBeNull();
  });
});
