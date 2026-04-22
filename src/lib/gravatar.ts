import { useEffect, useState } from "react";

const STORAGE_KEY = "l8git.gravatar-hashes.v1";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// In-memory hash cache keyed by normalised email. The hash is purely a
// function of the email so it survives indefinitely; we also mirror it to
// localStorage so page reloads skip the Web Crypto round-trip entirely.
const hashCache = new Map<string, string>();
// URL cache is keyed per (email, size) but derived from the hash.
const urlCache = new Map<string, string>();

function loadPersistedHashes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.length === 64) {
        hashCache.set(k, v);
      }
    }
  } catch {
    // corrupt cache: drop it
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
loadPersistedHashes();

let persistTimer: number | undefined;
function persistHashes() {
  if (persistTimer !== undefined) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = undefined;
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of hashCache) obj[k] = v;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore quota errors
    }
  }, 500);
}

export function useGravatarUrl(email: string, size = 64): string | undefined {
  const key = email.trim().toLowerCase();
  const urlKey = `${key}:${size}`;

  const initial = (() => {
    const cached = urlCache.get(urlKey);
    if (cached) return cached;
    const hash = hashCache.get(key);
    if (hash) {
      const url = `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
      urlCache.set(urlKey, url);
      return url;
    }
    return undefined;
  })();

  const [url, setUrl] = useState<string | undefined>(initial);

  useEffect(() => {
    if (!key) return;
    const cachedUrl = urlCache.get(urlKey);
    if (cachedUrl) {
      setUrl(cachedUrl);
      return;
    }
    const cachedHash = hashCache.get(key);
    if (cachedHash) {
      const next = `https://www.gravatar.com/avatar/${cachedHash}?s=${size}&d=404`;
      urlCache.set(urlKey, next);
      setUrl(next);
      return;
    }
    let cancelled = false;
    sha256Hex(key).then((hash) => {
      hashCache.set(key, hash);
      persistHashes();
      const next = `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
      urlCache.set(urlKey, next);
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key, size, urlKey]);

  return url;
}
