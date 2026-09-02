import { setPlatform, type PlatformIpc } from "@/lib/platform";

const storage = window.localStorage;

const platform: PlatformIpc = {
  invoke: async (cmd) => {
    if (cmd === "agent_cap_inventory") return { targets: [], items: [], warnings: [] } as never;
    if (cmd === "detect_clis") return ["codex"] as never;
    return null as never;
  },
  channel: () => ({}),
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
