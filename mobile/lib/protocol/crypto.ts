import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { equalBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const PROTOCOL_VERSION = 1;
export const HANDSHAKE_CONTEXT = 'l8git-hs-v1';
export const AUTH_CONTEXT = 'l8git-auth-v1';
export const RELAY_CONTEXT = 'l8git-relay-v1';
export const HKDF_INFO = 'l8git-remote-v1';

export const PSK_BYTES = 32;
export const KEY_BYTES = 32;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const HELLO_NONCE_BYTES = 16;

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < B64_ALPHABET.length; i += 1) {
    table[B64_ALPHABET[i]] = i;
  }
  table['-'] = 62;
  table['_'] = 63;
  return table;
})();

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += has1 ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += has2 ? B64_ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64(value: string): Uint8Array {
  const clean = value.trim().replace(/[=\s]+/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const digit = B64_LOOKUP[clean[i]];
    if (digit === undefined) {
      throw new Error('invalid base64 input');
    }
    acc = (acc << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index] = (acc >> bits) & 0xff;
      index += 1;
    }
  }
  return out.subarray(0, index);
}

export function decodeFixed(value: string, length: number, label: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = fromBase64(value);
  } catch {
    throw new Error(`${label} is not valid base64`);
  }
  if (raw.length !== length) {
    throw new Error(`${label} must be ${length} bytes`);
  }
  return raw;
}

export function decodePsk(value: string): Uint8Array {
  return decodeFixed(value, PSK_BYTES, 'psk');
}

export interface EphemeralKeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateEphemeralKeyPair(): EphemeralKeyPair {
  const pair = x25519.keygen();
  return { secretKey: pair.secretKey, publicKey: pair.publicKey };
}

export function randomHelloNonce(): Uint8Array {
  return randomBytes(HELLO_NONCE_BYTES);
}

export function contextTag(
  psk: Uint8Array,
  context: string,
  clientEph: Uint8Array,
  serverEph: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  return hmac(sha256, psk, concatBytes(utf8ToBytes(context), clientEph, serverEph, nonce));
}

export function handshakeTag(
  psk: Uint8Array,
  clientEph: Uint8Array,
  serverEph: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  return contextTag(psk, HANDSHAKE_CONTEXT, clientEph, serverEph, nonce);
}

export function authTag(
  psk: Uint8Array,
  clientEph: Uint8Array,
  serverEph: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  return contextTag(psk, AUTH_CONTEXT, clientEph, serverEph, nonce);
}

export function verifyTag(expected: Uint8Array, provided: string): boolean {
  let raw: Uint8Array;
  try {
    raw = fromBase64(provided);
  } catch {
    return false;
  }
  if (raw.length !== expected.length) {
    return false;
  }
  return equalBytes(expected, raw);
}

export function relayToken(psk: Uint8Array): string {
  return toBase64Url(sha256(concatBytes(psk, utf8ToBytes(RELAY_CONTEXT))));
}

export interface SessionKeys {
  c2s: Uint8Array;
  s2c: Uint8Array;
}

export function deriveSessionKeys(
  secretKey: Uint8Array,
  peerPublicKey: Uint8Array,
  psk: Uint8Array
): SessionKeys {
  const shared = x25519.getSharedSecret(secretKey, peerPublicKey);
  const okm = hkdf(sha256, shared, psk, utf8ToBytes(HKDF_INFO), 2 * KEY_BYTES);
  return { c2s: okm.slice(0, KEY_BYTES), s2c: okm.slice(KEY_BYTES, 2 * KEY_BYTES) };
}

export function counterNonce(counter: number): Uint8Array {
  if (!Number.isInteger(counter) || counter < 0 || counter > Number.MAX_SAFE_INTEGER) {
    throw new Error('nonce counter out of range');
  }
  const nonce = new Uint8Array(NONCE_BYTES);
  let rest = counter;
  for (let i = 0; i < NONCE_BYTES && rest > 0; i += 1) {
    nonce[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return nonce;
}

export function seal(key: Uint8Array, counter: number, plaintext: Uint8Array): Uint8Array {
  const nonce = counterNonce(counter);
  return concatBytes(nonce, chacha20poly1305(key, nonce).encrypt(plaintext));
}

export function open(key: Uint8Array, counter: number, frame: Uint8Array): Uint8Array {
  if (frame.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error('frame too short');
  }
  const nonce = counterNonce(counter);
  if (!equalBytes(nonce, frame.subarray(0, NONCE_BYTES))) {
    throw new Error('unexpected frame counter');
  }
  try {
    return chacha20poly1305(key, nonce).decrypt(frame.subarray(NONCE_BYTES));
  } catch {
    throw new Error('frame authentication failed');
  }
}
