import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import en from "@/locales/en.json";
import type { RebaseStatus } from "@/lib/repo-store";
import * as parser from "@/lib/conflict-parser";

const rendered = vi.hoisted(() => ({
  buttons: [] as { title?: string; onClick?: () => void }[],
  t: null as unknown as typeof import("i18next").t,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: rendered.t }) }));
vi.mock("@/lib/monaco-setup", () => ({}));
vi.mock("@monaco-editor/react", () => ({ DiffEditor: () => null, Editor: () => null }));
vi.mock("@/lib/theme", () => ({ resolveTheme: () => "dark", getStoredTheme: () => "dark" }));
vi.mock("./use-merge-decorations", () => ({ useMergeDecorations: () => {} }));
vi.mock("./use-conflict-ai", () => ({ useConflictAi: () => ({}) }));
vi.mock("./conflict-ai-panel", () => ({ ConflictAiPreview: () => null, ConflictAiToolbar: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: (props: { title?: string; onClick?: () => void }) => {
    rendered.buttons.push(props);
    return createElement("button", { type: "button", ...props });
  },
}));

import { MergeEditor2Way } from "./merge-editor-2way";
import { MergeEditor3Way } from "./merge-editor-3way";

const scratch: string[] = [];
afterAll(() => { for (const path of scratch) rmSync(path, { recursive: true, force: true }); });

// Repositories live only in OS temp directories, never in the user's checkout.
function conflict(mode: "merge" | "rebase") {
  const path = mkdtempSync(join(tmpdir(), "l8git-conflict-roles-"));
  scratch.push(path);
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull };
  const git = (...args: string[]) => execFileSync("git", ["-C", path, ...args], {
    encoding: "utf8", env,
  });
  git("init", "-q", "-b", "main");
  for (const [key, value] of Object.entries({ "user.name": "Test", "user.email": "test@example.com", "commit.gpgsign": "false", "core.autocrlf": "false", "merge.conflictstyle": "merge" })) git("config", key, value);
  const commit = (file: string, text: string, subject: string) => {
    writeFileSync(join(path, file), text);
    git("add", "--", file);
    git("commit", "-qm", subject);
    return git("rev-parse", "HEAD").trim();
  };
  commit("shared.txt", "base\n", "base");
  git("branch", "feature");
  const onto = commit("shared.txt", "target state\n", "target change");
  git("checkout", "-q", "feature");
  commit("earlier.txt", "already replayed\n", "earlier clean change");
  const stopped = commit("shared.txt", "replayed change\n", "conflicting change");
  if (mode === "merge") git("checkout", "-q", "main");
  const operation = spawnSync("git", ["-C", path, ...(mode === "rebase" ? ["-c", "rebase.autoStash=false", "rebase", "--merge", "main"] : ["merge", "--no-edit", "feature"])], { encoding: "utf8", env });
  expect(operation.status, operation.stderr).toBe(1);
  const versions = {
    base: git("show", ":1:shared.txt"), ours: git("show", ":2:shared.txt"),
    theirs: git("show", ":3:shared.txt"), current: readFileSync(join(path, "shared.txt"), "utf8"),
  };
  const rebaseState: RebaseStatus | undefined = mode === "rebase" ? {
    in_progress: true, kind: "normal", step: 2, total: 2, head_name: "feature",
    onto, onto_short: onto.slice(0, 7), current_action: "pick",
    stopped: { hash: stopped, short_hash: stopped.slice(0, 7), subject: "conflicting change" },
    conflicted_paths: ["shared.txt"], todo: [],
  } : undefined;
  if (rebaseState) {
    expect(git("rev-parse", "REBASE_HEAD").trim()).toBe(stopped);
    expect(git("rev-parse", "HEAD").trim()).not.toBe(onto);
    expect(git("show", "HEAD:earlier.txt")).toBe("already replayed\n");
  }
  return { versions, rebaseState };
}

beforeAll(async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  rendered.t = i18n.t;
});

for (const mode of ["merge", "rebase"] as const) {
  describe(`${mode} with real Git conflict stages`, () => {
    let fixture: ReturnType<typeof conflict>;
    beforeAll(() => { fixture = conflict(mode); });
    for (const [name, Editor] of [["2-way", MergeEditor2Way], ["3-way", MergeEditor3Way]] as const) {
      it(`${name} names the actual sides and single/all actions keep stage 2/3`, () => {
        rendered.buttons = [];
        const html = renderToStaticMarkup(createElement(Editor, {
          ...fixture, language: "plaintext", filePath: "shared.txt", saving: false, onSave: () => {},
        }));
        const copy = mode === "rebase" ? en.mergeEditor.rebase : en.mergeEditor;
        expect(html).toContain(copy.oursHead);
        if (mode === "rebase") {
          expect(html).toContain(fixture.rebaseState!.stopped!.short_hash);
          expect(html).toContain("conflicting change");
          expect(html).toContain(fixture.rebaseState!.onto_short);
          expect(html).toContain("including previously replayed commits");
          expect(html).not.toContain("Ours (HEAD)");
        } else {
          expect(html).toContain("Theirs (incoming)");
          expect(html).not.toContain("Target base:");
        }
        expect(fixture.versions.ours).toBe("target state\n");
        expect(fixture.versions.theirs).toBe("replayed change\n");
        const resolve = vi.spyOn(parser, "resolveConflict");
        try {
          for (const [title, side, expected] of [
            [copy.takeOursHint, "ours", fixture.versions.ours],
            [copy.takeTheirsHint, "theirs", fixture.versions.theirs],
            [copy.acceptAllOursHint, "ours", fixture.versions.ours],
            [copy.acceptAllTheirsHint, "theirs", fixture.versions.theirs],
          ]) {
            resolve.mockClear();
            const action = rendered.buttons.find(button => button.title === title);
            expect(action?.onClick).toBeTypeOf("function");
            action!.onClick!();
            expect(resolve).toHaveBeenCalledWith(fixture.versions.current, expect.any(Object), side);
            expect(resolve.mock.results[resolve.mock.results.length - 1]?.value).toBe(expected);
          }
        } finally { resolve.mockRestore(); }
      });
    }
  });
}
