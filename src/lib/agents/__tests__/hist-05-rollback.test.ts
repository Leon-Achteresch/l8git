import { describe, expect, it } from "vitest";

import { planRollback } from "@/lib/agents/resume-cursor";

describe("HIST-05 planRollback", () => {
  it("always plans a fork-conversation step", () => {
    const steps = planRollback({ toMessageUuid: "uuid-1", restoreFiles: false });
    expect(steps).toEqual([{ kind: "fork-conversation" }]);
  });

  it("adds an independent checkpoint-restore step when files should be restored", () => {
    const steps = planRollback({ toMessageUuid: "uuid-1", restoreFiles: true });
    expect(steps).toEqual([{ kind: "fork-conversation" }, { kind: "checkpoint-restore" }]);
  });
});
