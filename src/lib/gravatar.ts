import { useEffect, useState } from "react";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const cache = new Map<string, string>();

export function useGravatarUrl(email: string, size = 64): string | undefined {
  const key = email.trim().toLowerCase();
  const [url, setUrl] = useState<string | undefined>(() => cache.get(`${key}:${size}`));

  useEffect(() => {
    if (!key) return;
    const cacheKey = `${key}:${size}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    sha256Hex(key).then((hash) => {
      const next = `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
      cache.set(cacheKey, next);
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key, size]);

  return url;
}
