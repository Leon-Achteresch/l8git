import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  },
}));

import { knownRepoPaths, useRepoRegistry } from './registry';

beforeEach(() => {
  storage.clear();
  useRepoRegistry.setState({ hydrated: false, pathsByHost: {} });
});

describe('host repository path identity', () => {
  it('persists distinct exact paths without converting legal filename characters', async () => {
    const paths = ['/repos/app', '/repos/app ', '/repos/app\n', '/repos/a\\b', '/repos/a/b', '/repos/app%20'];
    for (const path of paths) await useRepoRegistry.getState().addPath('host-a', path);
    expect(useRepoRegistry.getState().pathsByHost['host-a']).toEqual([...paths].sort());
    expect(JSON.parse(storage.get('l8git.repoPaths.v1')!)).toEqual({ 'host-a': [...paths].sort() });
    useRepoRegistry.setState({ hydrated: false, pathsByHost: {} });
    await useRepoRegistry.getState().hydrate();
    expect(knownRepoPaths()).toEqual([...paths].sort());
  });

  it('removes only the selected repository on its original host', async () => {
    for (const host of ['host-a', 'host-b']) {
      await useRepoRegistry.getState().addPath(host, '/repos/app');
      await useRepoRegistry.getState().addPath(host, '/repos/app ');
    }
    await useRepoRegistry.getState().removePath('host-a', '/repos/app ');
    expect(useRepoRegistry.getState().pathsByHost).toEqual({
      'host-a': ['/repos/app'], 'host-b': ['/repos/app', '/repos/app '],
    });
  });

  it('merges discovery results using exact identity and deduplicates only identical paths', () => {
    useRepoRegistry.getState().mergePaths('host-a', ['/repos/app', '/repos/app ', '/repos/a\\b']);
    useRepoRegistry.getState().mergePaths('host-a', ['/repos/app ', '/repos/app\n', '/repos/a/b']);
    expect(useRepoRegistry.getState().pathsByHost['host-a']).toEqual(
      ['/repos/app', '/repos/app ', '/repos/app\n', '/repos/a\\b', '/repos/a/b'].sort(),
    );
    expect(JSON.parse(storage.get('l8git.repoPaths.v1')!)).toEqual(useRepoRegistry.getState().pathsByHost);
  });

  it('retains Windows and UNC spellings returned by the host and skips empty entries', async () => {
    const paths = ['C:\\work\\app\\', '\\\\server\\share\\app', 'C:/work/app/'];
    useRepoRegistry.getState().mergePaths('host-a', ['', ...paths]);
    await useRepoRegistry.getState().addPath('host-a', '');
    expect(useRepoRegistry.getState().pathsByHost['host-a']).toEqual([...paths].sort());
  });
});
