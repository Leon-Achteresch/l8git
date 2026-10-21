import { convertFileSrc } from "@tauri-apps/api/core";

// Avatar CDNs served by Rust's avatar:// scheme (src-tauri/src/avatar.rs, keep HOSTS in sync), so the webview
// opens no HTTPS connections for them. Other hosts (self-hosted GitLab, Gitea, GHE) still load directly.
const PROXIED_HOSTS = new Set([
  "www.gravatar.com",
  "secure.gravatar.com",
  "gravatar.com",
  "avatars.githubusercontent.com",
  "avatar-management--avatars.us-west-2.prod.public.atl-paas.net",
]);

export function avatarSrc(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && PROXIED_HOSTS.has(u.hostname) && !u.port && !u.username && !u.password) {
      return convertFileSrc(url, "avatar");
    }
  } catch {
    // not a URL: leave it to the <img> to fail
  }
  return url;
}
