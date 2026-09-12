import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform } from "@/lib/agents/__tests__/platform-harness";
import {
  navigatePromptHistory,
  pushPrompt,
  resetPromptHistoryCache,
  PROMPT_HISTORY_LIMIT,
} from "@/lib/agents/prompt-history";

describe("prompt history", () => {
  beforeEach(() => {
    installTestPlatform();
    resetPromptHistoryCache();
  });

  it("recalls the previous prompt with up and restores the draft with down", () => {
    pushPrompt("thread-1", "first");
    pushPrompt("thread-1", "second");

    expect(navigatePromptHistory("thread-1", "up", "")).toBe("second");
    expect(navigatePromptHistory("thread-1", "up", "")).toBe("first");
    expect(navigatePromptHistory("thread-1", "up", "")).toBeNull();
    expect(navigatePromptHistory("thread-1", "down", "")).toBe("second");
    expect(navigatePromptHistory("thread-1", "down", "")).toBe("");
  });

  it("dedupes consecutive duplicate prompts", () => {
    pushPrompt("thread-1", "same");
    pushPrompt("thread-1", "same");
    expect(navigatePromptHistory("thread-1", "up", "")).toBe("same");
    expect(navigatePromptHistory("thread-1", "up", "")).toBeNull();
  });

  it("caps history at the configured limit", () => {
    for (let i = 0; i < PROMPT_HISTORY_LIMIT + 10; i += 1) pushPrompt("thread-1", `p${i}`);
    let count = 0;
    let value = navigatePromptHistory("thread-1", "up", "");
    while (value !== null) {
      count += 1;
      value = navigatePromptHistory("thread-1", "up", "");
    }
    expect(count).toBe(PROMPT_HISTORY_LIMIT);
  });
});
