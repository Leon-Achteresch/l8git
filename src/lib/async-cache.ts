/** Share in-flight work separately from the bounded cache of completed reads. */
export function createReadCache<T>(ttlMs: number, maxEntries = 100) {
  const pending = new Map<string, Promise<T>>();
  const completed = new Map<string, { at: number; value: Promise<T> }>();
  return {
    clear(key?: string) {
      if (key === undefined) {
        pending.clear();
        completed.clear();
        return;
      }
      const wasPending = pending.delete(key);
      return completed.delete(key) || wasPending;
    },
    get(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
      const active = pending.get(key);
      if (active) return active;
      const cached = completed.get(key);
      if (!force && cached && Date.now() - cached.at < ttlMs) return cached.value;
      completed.delete(key);

      const request: Promise<T> = Promise.resolve().then(fetcher).then(value => {
        if (pending.get(key) === request && maxEntries > 0) {
          if (completed.size >= maxEntries) {
            const oldest = completed.keys().next();
            if (!oldest.done) completed.delete(oldest.value);
          }
          completed.set(key, { at: Date.now(), value: request });
        }
        return value;
      }).finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
      pending.set(key, request);
      return request;
    },
  };
}

export async function mapConcurrent<T, R>(items: readonly T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (index < items.length) { const i = index++; results[i] = await map(items[i]); }
  }));
  return results;
}
