import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listContextFiles } from "@/lib/agents/capability-hub";

describe("listContextFiles", () => {
  let dir: string | null = null;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("lists CLAUDE.md from repo and user scope, rules, and memory", async () => {
    dir = await mkdtemp(join(tmpdir(), "l8git-context-"));
    const repoRoot = join(dir, "repo");
    const configDir = join(dir, "config");
    await mkdir(repoRoot, { recursive: true });
    await mkdir(join(configDir, "rules"), { recursive: true });
    await mkdir(join(configDir, "memory"), { recursive: true });

    await writeFile(join(repoRoot, "CLAUDE.md"), "repo rules");
    await writeFile(join(configDir, "CLAUDE.md"), "user rules");
    await writeFile(join(configDir, "rules", "style.md"), "style");
    await writeFile(join(configDir, "memory", "notes.md"), "notes");

    const entries = await listContextFiles(repoRoot, configDir);

    expect(entries.find((entry) => entry.path === join(repoRoot, "CLAUDE.md"))?.scope).toBe("repo");
    expect(entries.find((entry) => entry.path === join(configDir, "CLAUDE.md"))?.scope).toBe("user");
    expect(entries.some((entry) => entry.scope === "project-rules" && entry.path.endsWith("style.md"))).toBe(true);
    expect(entries.some((entry) => entry.scope === "memory" && entry.path.endsWith("notes.md"))).toBe(true);
  });

  it("returns an empty list when nothing exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "l8git-context-empty-"));
    const entries = await listContextFiles(join(dir, "repo"), join(dir, "config"));
    expect(entries).toEqual([]);
  });
});
