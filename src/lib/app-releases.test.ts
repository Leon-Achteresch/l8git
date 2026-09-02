import { describe, expect, it } from "vitest";

import {
  parseGithubReleases,
  sameReleaseVersion,
  stripLeadingChangelogHeading,
} from "@/lib/app-releases";

describe("stripLeadingChangelogHeading", () => {
  it("removes a leading changelog heading", () => {
    expect(stripLeadingChangelogHeading("## Changelog\n\n- fix")).toBe("- fix");
    expect(stripLeadingChangelogHeading("# Änderungsprotokoll\nHi")).toBe("Hi");
  });

  it("keeps body without that heading", () => {
    expect(stripLeadingChangelogHeading("### Fixes\n- a")).toBe("### Fixes\n- a");
  });
});

describe("sameReleaseVersion", () => {
  it("matches tags with or without a v prefix", () => {
    expect(sameReleaseVersion("v0.5.113", "0.5.113")).toBe(true);
    expect(sameReleaseVersion("0.5.113", "v0.5.113")).toBe(true);
    expect(sameReleaseVersion("v0.5.111", "0.5.113")).toBe(false);
    expect(sameReleaseVersion("v0.5.113", null)).toBe(false);
  });
});

describe("parseGithubReleases", () => {
  it("maps github payloads and skips drafts", () => {
    expect(
      parseGithubReleases([
        {
          id: 1,
          tag_name: "v0.5.113",
          name: "l8git v0.5.113",
          body: "## Changelog\n\n- Marktplatz",
          published_at: "2026-09-01T13:14:40Z",
          html_url: "https://github.com/Leon-Achteresch/l8git/releases/tag/v0.5.113",
        },
        {
          id: 2,
          tag_name: "v0.5.0-draft",
          draft: true,
          body: "hidden",
        },
        {
          id: 3,
          tag_name: "v0.4.0",
          name: "  ",
          body: "   ",
          prerelease: true,
        },
      ]),
    ).toEqual([
      {
        id: 1,
        tag: "v0.5.113",
        name: "l8git v0.5.113",
        notes: "- Marktplatz",
        publishedAt: "2026-09-01T13:14:40Z",
        prerelease: false,
        htmlUrl: "https://github.com/Leon-Achteresch/l8git/releases/tag/v0.5.113",
      },
      {
        id: 3,
        tag: "v0.4.0",
        name: "v0.4.0",
        notes: null,
        publishedAt: null,
        prerelease: true,
        htmlUrl: "",
      },
    ]);
  });

  it("returns an empty list for invalid payloads", () => {
    expect(parseGithubReleases(null)).toEqual([]);
    expect(parseGithubReleases({ message: "error" })).toEqual([]);
  });
});
