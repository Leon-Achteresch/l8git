export async function sendNotification(): Promise<void> {
  return undefined;
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
