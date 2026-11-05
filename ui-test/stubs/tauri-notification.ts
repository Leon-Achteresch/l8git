export function sendNotification(options?: unknown): void {
  // Tests may observe would-be native notifications; nothing native is ever shown.
  (window as { __L8GIT_TEST_NOTIFY__?: (o: unknown) => void }).__L8GIT_TEST_NOTIFY__?.(options);
}

export async function isPermissionGranted(): Promise<boolean> {
  return false;
}

export async function requestPermission(): Promise<string> {
  return "denied";
}

export function onAction(_cb: (event: unknown) => void): Promise<() => void> {
  return Promise.resolve(() => undefined);
}

export type Options = Record<string, unknown>;
