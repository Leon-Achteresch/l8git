export type AppRelease = {
  id: number;
  tag: string;
  name: string;
  notes: string | null;
  publishedAt: string | null;
  prerelease: boolean;
  htmlUrl: string;
};

const RELEASES_URL =
  "https://api.github.com/repos/Leon-Achteresch/l8git/releases?per_page=100";

type GithubReleaseJson = {
  id?: number;
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  published_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  html_url?: unknown;
};

export function stripLeadingChangelogHeading(markdown: string): string {
  return markdown
    .replace(
      /^\s*#{1,2}\s+(changelog|\u00e4nderungsprotokoll|\u00c4nderungsprotokoll)\s*(\n+|$)/im,
      "",
    )
    .trim();
}

export function sameReleaseVersion(tag: string, version: string | null): boolean {
  if (!version) return false;
  return tag.replace(/^v/i, "") === version.replace(/^v/i, "");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseGithubReleases(payload: unknown): AppRelease[] {
  if (!Array.isArray(payload)) return [];

  const releases: AppRelease[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as GithubReleaseJson;
    if (item.draft) continue;
    const tag = asString(item.tag_name).trim();
    if (!tag || typeof item.id !== "number") continue;
    const rawNotes = asString(item.body).trim();
    const notes = rawNotes ? stripLeadingChangelogHeading(rawNotes) : "";
    releases.push({
      id: item.id,
      tag,
      name: asString(item.name).trim() || tag,
      notes: notes.length > 0 ? notes : null,
      publishedAt: asString(item.published_at) || null,
      prerelease: Boolean(item.prerelease),
      htmlUrl: asString(item.html_url),
    });
  }
  return releases;
}

let cached: Promise<AppRelease[]> | null = null;

export function fetchAppReleases(): Promise<AppRelease[]> {
  cached ??= fetch(RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return parseGithubReleases(await res.json());
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}
