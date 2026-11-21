export type Stroke = [number, number][];
export const MAX_POINTS = 1800;
const MARKER = "\n\n<!-- l8git-screenshot-v1:";

export function screenshotUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    /* Relative and malformed URLs cannot identify a portable attachment. */
  }
  return null;
}

export function screenshotComment(src: string, lines: Stroke[], note: string, label: string) {
  const url = screenshotUrl(src);
  if (!url || !lines.length) throw new Error("Invalid screenshot annotation");
  const points = lines.flat();
  const range = (axis: 0 | 1) => {
    const values = points.map((p) => p[axis] / 10);
    return `${Math.floor(Math.min(...values))}–${Math.ceil(Math.max(...values))}%`;
  };
  return `${note.trim()}\n\n![Screenshot](<${url.replace(/</g, "%3C").replace(/>/g, "%3E")}>)\n\n${label} · X ${range(0)} · Y ${range(1)}${MARKER}${JSON.stringify(lines)} -->`;
}

export function parseScreenshotComment(body: string) {
  const at = body.lastIndexOf(MARKER);
  if (at < 0 || !body.endsWith(" -->") || body.length - at > 24000) return null;
  try {
    const lines: unknown = JSON.parse(body.slice(at + MARKER.length, -4));
    if (!Array.isArray(lines) || !lines.length || lines.length > MAX_POINTS) return null;
    let count = 0;
    for (const line of lines) {
      if (!Array.isArray(line) || !line.length) return null;
      count += line.length;
      if (count > MAX_POINTS) return null;
      if (
        !line.every(
          (p) =>
            Array.isArray(p) && p.length === 2 && p.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000),
        )
      )
        return null;
    }
    const match = /\n\n!\[Screenshot\]\(<(https:\/\/[^<>\s]+)>\)\n\n[^\n]+$/.exec(body.slice(0, at));
    if (!match || !screenshotUrl(match[1])) return null;
    return { note: body.slice(0, match.index), src: match[1], lines: lines as Stroke[] };
  } catch {
    return null;
  }
}

/** Resolve repository images against the reviewed revision and GitLab uploads against the project. */
export function resolveReviewImage(value: string, prUrl?: string, sha?: string) {
  const direct = screenshotUrl(value);
  if (direct || !prUrl || !sha || !value || /^[a-z][a-z\d+.-]*:|^\/\/|^#/i.test(value)) return direct;
  const match = /^(https:\/\/.+?)\/(pull|-\/merge_requests|pull-requests)\/\d+\/?$/.exec(prUrl);
  if (!match) return null;
  const [, repo, kind] = match;
  try {
    if (kind === "-/merge_requests" && /^\/?uploads\//.test(value)) {
      return screenshotUrl(repo + "/" + value.replace(/^\//, ""));
    }
    const raw = kind === "-/merge_requests" ? "/-/raw/" : "/raw/";
    return screenshotUrl(new URL(value, repo + raw + encodeURIComponent(sha) + "/").href);
  } catch {
    return null;
  }
}
