/** Coalesce transient streamed text without persisting every model token. */
export function createCommitDraftStream(onValue: (value: string) => void, scheduler = {
  request: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
  cancel: (id: number) => cancelAnimationFrame(id),
}) {
  let latest: string | undefined;
  let frame: number | null = null;
  let closed = false;
  return {
    push(value: string): void {
      if (closed) return;
      latest = value;
      if (frame !== null) return;
      frame = scheduler.request(() => {
        frame = null;
        const value = latest;
        latest = undefined;
        if (!closed && value !== undefined) onValue(value);
      });
    },
    cancel(): void {
      closed = true;
      if (frame !== null) scheduler.cancel(frame);
      frame = null;
      latest = undefined;
    },
  };
}

export class StagedCommitContextChanged extends Error {
  constructor() { super("commitActions.aiContextChanged"); }
}
export class EmptyGeneratedCommitDraft extends Error {
  constructor() { super("commitActions.aiEmptyMessage"); }
}

/** A generated message is installed only if its staged input still matches. */
export async function generateFreshCommitDraft({ signal, readDiff, generate }: {
  signal: AbortSignal;
  readDiff: () => Promise<string>;
  generate: (diff: string, signal: AbortSignal) => Promise<string>;
}): Promise<string> {
  signal.throwIfAborted();
  const captured = await readDiff();
  signal.throwIfAborted();
  const message = await generate(captured, signal);
  signal.throwIfAborted();
  if (!message.trim()) throw new EmptyGeneratedCommitDraft();
  const current = await readDiff();
  signal.throwIfAborted();
  if (captured !== current) throw new StagedCommitContextChanged();
  return message;
}
