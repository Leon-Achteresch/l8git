import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform, type TestPlatform } from "@/lib/agents/__tests__/platform-harness";
import { BARCODE_MCP_SERVER_NAME } from "@/lib/agents/barcode-spec";
import {
  rendererAcpMcpServers,
  resetRendererMcpCommandCache,
} from "@/lib/agents/renderer-mcp";

let platform: TestPlatform;

beforeEach(() => {
  platform = installTestPlatform();
  resetRendererMcpCommandCache();
});

describe("rendererAcpMcpServers", () => {
  it("hands OpenCode the bundled renderer without touching its config", async () => {
    platform.invoke.mockResolvedValue(["/apps/l8git", "mcp-renderers"]);

    await expect(rendererAcpMcpServers()).resolves.toEqual([{
      name: BARCODE_MCP_SERVER_NAME,
      command: "/apps/l8git",
      args: ["mcp-renderers"],
      env: [],
    }]);
    expect(platform.invoke).toHaveBeenCalledWith("renderer_mcp_command", undefined);
  });

  it("reuses the executable descriptor across sessions", async () => {
    platform.invoke.mockResolvedValue(["/apps/l8git", "mcp-renderers"]);
    await rendererAcpMcpServers();
    await rendererAcpMcpServers();
    expect(platform.invoke).toHaveBeenCalledTimes(1);
  });

  it("does not prevent a chat when the bundled server is unavailable", async () => {
    platform.invoke.mockRejectedValue(new Error("no executable"));
    await expect(rendererAcpMcpServers()).resolves.toEqual([]);
  });
});
