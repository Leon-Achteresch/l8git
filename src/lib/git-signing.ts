import { invoke } from '@tauri-apps/api/core';

export type SigningScope = {
  commitSign: boolean | null;
  tagSign: boolean | null;
  format: string | null;
  signingKey: string | null;
};

export type SigningInfo = {
  commitSign: boolean;
  tagSign: boolean;
  format: string;
  signingKey: string | null;
  program: string;
  toolAvailable: boolean;
  toolVersion: string | null;
  local: SigningScope;
  global: SigningScope;
};

export type SignatureState =
  | 'good'
  | 'invalid'
  | 'untrusted'
  | 'unknown_key'
  | 'unsigned';

export type CommitSignature = {
  state: SignatureState;
  code: string;
  signer: string | null;
  key: string | null;
};

export type SigningFormat = 'openpgp' | 'ssh' | 'x509';

export const SIGNING_FORMATS: SigningFormat[] = ['openpgp', 'ssh', 'x509'];

export function normalizeSigningFormat(format: string | null | undefined): SigningFormat {
  const value = (format ?? '').trim().toLowerCase();
  if (value === 'ssh') return 'ssh';
  if (value === 'x509') return 'x509';
  return 'openpgp';
}

export function signingFormatLabel(format: string | null | undefined): string {
  switch (normalizeSigningFormat(format)) {
    case 'ssh':
      return 'SSH';
    case 'x509':
      return 'X.509';
    default:
      return 'GPG';
  }
}

export function shortSigningKey(key: string | null | undefined): string | null {
  const value = (key ?? '').trim();
  if (!value) return null;
  if (value.includes('/') || value.includes('\\')) {
    return value.split(/[\\/]/).filter(Boolean).pop() ?? value;
  }
  if (/^[0-9a-fA-F]{16,}$/.test(value)) return value.slice(-16).toUpperCase();
  return value;
}

export function signingActive(info: SigningInfo | null): boolean {
  return !!info?.commitSign;
}

export async function loadSigningInfo(path: string): Promise<SigningInfo> {
  return invoke<SigningInfo>('commit_signing_info', { path });
}

export async function applySigningConfig(
  path: string,
  patch: {
    commitSign?: boolean;
    tagSign?: boolean;
    format?: string;
    signingKey?: string;
  }
): Promise<SigningInfo> {
  return invoke<SigningInfo>('set_commit_signing', {
    path,
    commitSign: patch.commitSign ?? null,
    tagSign: patch.tagSign ?? null,
    format: patch.format ?? null,
    signingKey: patch.signingKey ?? null,
  });
}

export async function loadSignatureStatus(
  path: string,
  hash: string
): Promise<CommitSignature> {
  return invoke<CommitSignature>('commit_signature_status', { path, hash });
}
