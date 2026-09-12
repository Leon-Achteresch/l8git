import { describe, expect, it } from "vitest";

import { matchHookActivity, parseHooksFromSettings } from "@/lib/agents/capability-market";

const settingsByScope = {
  project: {
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ command: "echo project" }] },
      ],
    },
  },
  user: {
    hooks: {
      Stop: [{ matcher: "*", hooks: [{ command: "echo done" }] }],
    },
  },
};

describe("parseHooksFromSettings", () => {
  it("gates project/local scopes on trust but leaves user scope always enabled", () => {
    const untrusted = parseHooksFromSettings(settingsByScope, false);
    const project = untrusted.find((hook) => hook.scope === "project");
    const user = untrusted.find((hook) => hook.scope === "user");
    expect(project?.enabled).toBe(false);
    expect(user?.enabled).toBe(true);

    const trusted = parseHooksFromSettings(settingsByScope, true);
    expect(trusted.find((hook) => hook.scope === "project")?.enabled).toBe(true);
  });
});

describe("matchHookActivity", () => {
  it("finds the first enabled hook matching event and matcher", () => {
    const hooks = parseHooksFromSettings(settingsByScope, true);
    expect(matchHookActivity(hooks, { event: "PreToolUse", matcher: "Bash" })?.command).toBe(
      "echo project",
    );
    expect(matchHookActivity(hooks, { event: "Stop", matcher: "anything" })?.command).toBe(
      "echo done",
    );
    expect(matchHookActivity(hooks, { event: "PostToolUse" })).toBeUndefined();

    const disabled = parseHooksFromSettings(settingsByScope, false);
    expect(matchHookActivity(disabled, { event: "PreToolUse", matcher: "Bash" })).toBeUndefined();
  });
});
