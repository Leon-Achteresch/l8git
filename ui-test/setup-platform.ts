import { setPlatform, type PlatformIpc } from "@/lib/platform";

const storage = window.localStorage;

const platform: PlatformIpc = {
  invoke: async (cmd, args) => {
    if (window.__L8GIT_TEST_INVOKE__) return window.__L8GIT_TEST_INVOKE__(cmd, args) as never;
    if (cmd === "agent_cap_inventory") return { items: [] } as never;
    if (cmd === "detect_clis") return ["codex"] as never;
    return null as never;
  },
  channel: onMessage => ({ onMessage }),
  listen: () => () => undefined,
  storage: {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      storage.setItem(name, value);
    },
    removeItem: (name) => {
      storage.removeItem(name);
    },
  },
  secrets: {
    get: async () => null,
    set: async () => undefined,
    delete: async () => undefined,
  },
};

setPlatform(platform);
