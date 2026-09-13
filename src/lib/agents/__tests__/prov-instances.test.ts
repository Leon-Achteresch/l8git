import { beforeEach, describe, expect, it } from "vitest";

import { useAgentProviderInstanceStore } from "@/lib/agents/provider-store";

describe("provider instances", () => {
  beforeEach(() => {
    const instances = useAgentProviderInstanceStore.getState().instances.filter((instance) => instance.isDefault);
    useAgentProviderInstanceStore.setState({ instances });
  });

  it("keeps two claude instances isolated when one is disabled", () => {
    const store = useAgentProviderInstanceStore.getState();
    const first = store.addInstance("claude", "Claude Work", { apiKeyRef: "a" });
    const second = store.addInstance("claude", "Claude Personal", { apiKeyRef: "b" });

    useAgentProviderInstanceStore.getState().setEnabled(first.id, false);

    const instances = useAgentProviderInstanceStore.getState().instances;
    const disabled = instances.find((instance) => instance.id === first.id);
    const enabled = instances.find((instance) => instance.id === second.id);

    expect(disabled?.enabled).toBe(false);
    expect(enabled?.enabled).toBe(true);
    expect(enabled?.config).toEqual({ apiKeyRef: "b" });
  });
});
