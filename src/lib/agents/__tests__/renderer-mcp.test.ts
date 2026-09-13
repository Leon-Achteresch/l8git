import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform, type TestPlatform } from "@/lib/agents/__tests__/platform-harness";
import { BARCODE_MCP_SERVER_NAME } from "@/lib/agents/barcode-spec";
import { BROWSER_ADDON_SERVER_NAME } from "@/lib/agents/browser-addon";
import {
  addonCapability,
  findHostMcpTool,
  HOST_MCP_TOOLS,
  rendererAcpMcpServers,
  requireHostMcpTool,
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

describe("HOST_MCP_TOOLS registry", () => {
  it("lists barcode, chart and browser with the same schema every driver receives", () => {
    const names = HOST_MCP_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(["render_barcode", "render_chart", BROWSER_ADDON_SERVER_NAME]);
    for (const tool of HOST_MCP_TOOLS) {
      expect(tool.driverSupport).toEqual({ claude: true, cursor: true, opencode: true, codex: true });
      expect(tool.inputSchema).toBeTruthy();
    }
  });

  it("finds a registered tool by name", () => {
    expect(findHostMcpTool("render_chart")?.name).toBe("render_chart");
    expect(findHostMcpTool("does_not_exist")).toBeUndefined();
  });

  it("throws an explicit error for an unknown tool name instead of a silent no-op", () => {
    expect(() => requireHostMcpTool("does_not_exist")).toThrow("Unbekanntes Renderer-Tool: does_not_exist");
    expect(requireHostMcpTool("render_barcode").name).toBe("render_barcode");
  });
});

describe("addonCapability", () => {
  it("reports supported for a known tool and a supported driver", () => {
    expect(addonCapability("render_chart", "claude")).toEqual({ status: "supported" });
  });

  it("gives a reason when the tool is unknown", () => {
    expect(addonCapability("does_not_exist", "claude")).toEqual({
      status: "unavailable",
      reason: "Unbekanntes Renderer-Tool: does_not_exist",
    });
  });
});
