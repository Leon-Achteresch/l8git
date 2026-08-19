import { beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcProcessClient } from "@/lib/agents/rpc-client";
import { failAgentTransports, openAgentTransport } from "@/lib/agents/transport";
import { setPlatform, type PlatformIpc } from "@/lib/platform";

interface InvokeCall {
  cmd: string;
  args: Record<string, unknown>;
}

let calls: InvokeCall[] = [];
let nextId = 1;

function installPlatform(): void {
  calls = [];
  const platform: PlatformIpc = {
    invoke: async <T,>(cmd: string, args: Record<string, unknown> = {}) => {
      calls.push({ cmd, args });
      if (cmd === "agent_transport_open") {
        nextId += 1;
        return { id: nextId, sessionId: args.sessionId } as T;
      }
      return undefined as T;
    },
    channel: <T,>(onMessage: (message: T) => void) => onMessage,
    listen: () => () => undefined,
    storage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
    secrets: {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    },
  };
  setPlatform(platform);
}

function lastOpen(): InvokeCall {
  const call = [...calls].reverse().find((entry) => entry.cmd === "agent_transport_open");
  if (!call) throw new Error("no agent_transport_open call was recorded");
  return call;
}

beforeEach(() => {
  installPlatform();
});

describe("failAgentTransports", () => {
  it("reports an exit for every live transport when the host connection dies", async () => {
    const onExit = vi.fn();
    await openAgentTransport("codex", "session-a", { onMessage: () => {}, onExit });

    failAgentTransports();

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(-1);
    expect(calls.some((call) => call.cmd === "agent_transport_close")).toBe(false);
  });

  it("reports the exit only once and stops tracking the transport", async () => {
    const onExit = vi.fn();
    await openAgentTransport("codex", "session-a", { onMessage: () => {}, onExit });

    failAgentTransports();
    failAgentTransports();

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("leaves transports of a later connection untouched", async () => {
    const first = vi.fn();
    await openAgentTransport("codex", "session-a", { onMessage: () => {}, onExit: first });
    failAgentTransports();

    const second = vi.fn();
    await openAgentTransport("codex", "session-b", { onMessage: () => {}, onExit: second });

    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("does not fire for a transport that already exited on its own", async () => {
    const onExit = vi.fn();
    await openAgentTransport("codex", "session-a", { onMessage: () => {}, onExit });
    const emit = lastOpen().args.onEvent as (event: unknown) => void;

    emit({ sessionId: "session-a", sequence: 1, stream: "exit", payload: 0 });
    failAgentTransports();

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(0);
  });

  it("drops the rpc transport so the next request fails instead of reusing a dead id", async () => {
    const client = new JsonRpcProcessClient("session-a");
    const status: Array<{ type: string; value: string | number }> = [];
    client.onStatus((event) => status.push(event));
    await client.connect("codex");

    failAgentTransports();

    expect(status).toContainEqual({ type: "exit", value: -1 });
    await expect(client.request("model/list")).rejects.toThrow(/nicht verbunden/u);
    expect(calls.some((call) => call.cmd === "agent_transport_send")).toBe(false);
  });

  it("lets the rpc client open a fresh transport after the connection came back", async () => {
    const client = new JsonRpcProcessClient("session-a");
    await client.connect("codex");
    const firstId = lastOpen().args;
    failAgentTransports();

    await client.connect("codex");
    void client.request("model/list").catch(() => undefined);
    await Promise.resolve();

    const sends = calls.filter((call) => call.cmd === "agent_transport_send");
    expect(sends).toHaveLength(1);
    expect(sends[0].args.id).not.toBe(firstId.id);
  });
});
