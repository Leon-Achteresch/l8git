import { invoke } from "@tauri-apps/api/core";
import { hubApi } from "./api";
import type { GithubTarget } from "@/lib/github-ui/target";
import type { Stroke } from "@/lib/pr-screenshot";

const branch = "l8git-review-assets";

/** The keychain credential stays in Rust and is never sent to redirected storage. */
export async function githubAttachment(target: GithubTarget, src: string) {
  const url = new URL(src);
  const match = /^\/user-attachments\/assets\/([a-f0-9-]{36})$/i.exec(url.pathname);
  if (url.origin !== "https://" + target.host) return null;
  if (!match) {
    const prefix = "/" + target.fullName + "/raw/";
    if (!url.pathname.startsWith(prefix)) return null;
    const file = /^(?:refs\/heads\/)?([a-f0-9]{40}|l8git-review-assets)\/(.+)$/i.exec(
      url.pathname.slice(prefix.length),
    );
    if (!file) return null;
    const data = await hubApi<{ download_url?: string }>(
      target.account,
      "GET",
      "/repos/" + target.fullName + "/contents/" + file[2] + "?ref=" + encodeURIComponent(file[1]),
    );
    return data.download_url?.startsWith("https://") ? data.download_url : null;
  }
  const image = await invoke<{ base64: string; content_type: string }>("hub_screenshot_attachment", {
    host: target.host,
    login: target.account.login,
    assetId: match[1],
  });
  const mime = image.content_type.split(";")[0].trim();
  if (!/^image\/(png|jpeg|gif|webp|avif)$/i.test(mime)) return null;
  return "data:" + mime + ";base64," + image.base64;
}

async function renderPng(target: GithubTarget, src: string, lines: Stroke[]) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";
  image.src = src;
  try {
    await image.decode();
  } catch (error) {
    const local = await githubAttachment(target, src);
    if (!local) throw error;
    image.src = local;
    await image.decode();
  }
  const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.lineJoin = ctx.lineCap = "round";
  const pen = Math.max(2, Math.max(canvas.width, canvas.height) / 260);
  for (const line of lines) {
    ctx.beginPath();
    for (const [i, [x, y]] of line.entries()) {
      const px = (x * canvas.width) / 1000,
        py = (y * canvas.height) / 1000;
      if (!i) ctx.moveTo(px - 0.01, py);
      ctx.lineTo(px, py);
    }
    for (const [color, width] of [
      ["white", pen * 1.65],
      ["#d92c53", pen],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  return canvas.toDataURL("image/png").split(",")[1];
}

/** Explicit opt-in to an asset commit. A content-derived filename makes retry safe. */
export async function publishScreenshot(target: GithubTarget, number: number, src: string, lines: Stroke[]) {
  const content = await renderPng(target, src, lines);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const filename = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("") + ".png";
  const repo = "/repos/" + target.fullName.split("/").map(encodeURIComponent).join("/");
  const a = target.account;
  const ref = repo + "/git/ref/heads/" + branch;
  try {
    await hubApi(a, "GET", ref);
  } catch (e) {
    if (!String(e).includes(" 404:")) throw e;
    const info = await hubApi<{ default_branch: string }>(a, "GET", repo);
    const base = await hubApi<{ object: { sha: string } }>(
      a,
      "GET",
      repo + "/git/ref/heads/" + info.default_branch.split("/").map(encodeURIComponent).join("/"),
    );
    try {
      await hubApi(a, "POST", repo + "/git/refs", { ref: "refs/heads/" + branch, sha: base.object.sha });
    } catch (e) {
      if (!String(e).includes(" 422:")) throw e;
      await hubApi(a, "GET", ref);
    }
  }
  const file = "screenshots/pr-" + number + "/" + filename;
  const path = repo + "/contents/" + file;
  let revision = branch;
  try {
    const created = await hubApi<{ commit: { sha: string } }>(a, "PUT", path, {
      branch,
      message: "Add screenshot review for #" + number,
      content,
    });
    revision = created.commit.sha;
  } catch (e) {
    if (!/ (409|422):/.test(String(e))) throw e;
    const existing = await hubApi<{ sha: string }>(a, "GET", path + "?ref=" + branch);
    const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
    const header = new TextEncoder().encode("blob " + bytes.length + "\0");
    const blob = new Uint8Array(header.length + bytes.length);
    blob.set(header);
    blob.set(bytes, header.length);
    const oid = await crypto.subtle.digest("SHA-1", blob);
    if (Array.from(new Uint8Array(oid), (b) => b.toString(16).padStart(2, "0")).join("") !== existing.sha)
      throw e;
  }
  return "https://" + target.host + "/" + target.fullName + "/raw/" + revision + "/" + file;
}
