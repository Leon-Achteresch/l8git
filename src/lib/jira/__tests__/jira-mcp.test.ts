import { beforeEach, describe, expect, it, vi } from "vitest";

import { installTestPlatform, type TestPlatform } from "@/lib/agents/__tests__/platform-harness";
import {
  CODEX_CONFIG_KEY_PATH,
  JIRA_MCP_SERVER_KEY,
  acpMcpServer,
  codexMcpConfig,
  jiraMcpCommandFor,
  resetJiraMcpCommandCache,
} from "@/lib/jira/jira-mcp";
import { DEFAULT_JIRA_PREFS, useJiraStore } from "@/lib/jira/jira-store";
import {
  jiraAcpMcpServers,
  jiraServerUseful,
  resetJiraSyncCache,
  syncJiraExternalRegistration,
} from "@/lib/jira/jira-sync";

const REPO = "/repos/app";
const BASE = ["/apps/l8git", "mcp-jira"];

const controlClient = {
  writeConfigValue: vi.fn(),
  reloadMcpServers: vi.fn(),
};
const releaseControl = vi.fn();

vi.mock("@/lib/agents/session-manager", () => ({
  codexSessionManager: {
    controlClient: () => Promise.resolve(controlClient),
    releaseControl: () => releaseControl(),
  },
}));

let platform: TestPlatform;

beforeEach(() => {
  platform = installTestPlatform();
  controlClient.writeConfigValue.mockReset().mockResolvedValue({});
  controlClient.reloadMcpServers.mockReset().mockResolvedValue({});
  releaseControl.mockReset();
  resetJiraSyncCache();
  resetJiraMcpCommandCache();
  useJiraStore.setState({
    ...DEFAULT_JIRA_PREFS,
    status: { configured: false, baseUrl: "", email: "", tokenHint: "" },
    statusLoaded: true,
  });
});

function configured(overrides: { enabled?: boolean; registerExternal?: boolean } = {}) {
  useJiraStore.setState({
    enabled: overrides.enabled ?? true,
    registerExternal: overrides.registerExternal ?? true,
    status: {
      configured: true,
      baseUrl: "https://acme.atlassian.net",
      email: "me@example.com",
      tokenHint: "••••1a2b",
    },
    statusLoaded: true,
  });
}

describe("jiraMcpCommandFor", () => {
  it("appends the repository so the spawned server gates on it", () => {
    expect(jiraMcpCommandFor(BASE, REPO)).toEqual({
      command: "/apps/l8git",
      args: ["mcp-jira", "--repo", REPO],
    });
  });

  it("omits the repository flag when there is none", () => {
    expect(jiraMcpCommandFor(BASE, "")).toEqual({
      command: "/apps/l8git",
      args: ["mcp-jira"],
    });
  });

  it("returns null when the backend gave no executable", () => {
    expect(jiraMcpCommandFor([], REPO)).toBeNull();
  });
});

describe("descriptor shapes", () => {
  const command = { command: "/apps/l8git", args: ["mcp-jira", "--repo", REPO] };

  it("builds the ACP entry OpenCode expects", () => {
    expect(acpMcpServer(command)).toEqual({
      name: JIRA_MCP_SERVER_KEY,
      command: "/apps/l8git",
      args: ["mcp-jira", "--repo", REPO],
      env: [],
    });
  });

  it("builds an enabled Codex stdio server", () => {
    const config = codexMcpConfig(command);
    expect(config).toMatchObject({ command: "/apps/l8git", enabled: true });
    expect(config.args).toEqual(["mcp-jira", "--repo", REPO]);
    // No env: the child opens the keychain itself, the token never travels.
    expect(config).not.toHaveProperty("env");
  });
});

describe("jiraServerUseful", () => {
  it("needs both the switch and credentials", () => {
    expect(jiraServerUseful({ enabled: true, status: { configured: true } })).toBe(true);
    expect(jiraServerUseful({ enabled: false, status: { configured: true } })).toBe(false);
    expect(jiraServerUseful({ enabled: true, status: { configured: false } })).toBe(false);
  });
});

describe("jiraAcpMcpServers", () => {
  it("hands OpenCode nothing while the feature is off", async () => {
    await expect(jiraAcpMcpServers(REPO)).resolves.toEqual([]);
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("hands OpenCode nothing without credentials", async () => {
    useJiraStore.setState({ enabled: true });
    await expect(jiraAcpMcpServers(REPO)).resolves.toEqual([]);
  });

  it("hands OpenCode the stdio server once Jira is usable", async () => {
    configured();
    platform.invoke.mockResolvedValue(BASE);
    const servers = await jiraAcpMcpServers(REPO);
    expect(servers).toEqual([
      { name: JIRA_MCP_SERVER_KEY, command: "/apps/l8git", args: ["mcp-jira", "--repo", REPO], env: [] },
    ]);
    expect(platform.invoke).toHaveBeenCalledWith("jira_mcp_command", undefined);
  });

  it("registers the server even before a ticket is pinned", async () => {
    // ACP fixes mcpServers at session creation, so the server has to exist
    // ahead of the first pin; the policy file keeps the tool list empty.
    configured();
    platform.invoke.mockResolvedValue(BASE);
    expect(useJiraStore.getState().linksByThread).toEqual({});
    await expect(jiraAcpMcpServers(REPO)).resolves.toHaveLength(1);
  });

  it("degrades to no server when the backend cannot name the executable", async () => {
    configured();
    platform.invoke.mockRejectedValue(new Error("no exe"));
    await expect(jiraAcpMcpServers(REPO)).resolves.toEqual([]);
  });
});

describe("syncJiraExternalRegistration", () => {
  it("removes both entries while the feature is off", async () => {
    await syncJiraExternalRegistration(REPO);
    expect(controlClient.writeConfigValue).toHaveBeenCalledWith(
      CODEX_CONFIG_KEY_PATH,
      null,
      "replace",
    );
    expect(platform.invoke).toHaveBeenCalledWith("jira_sync_cursor_mcp", {
      enabled: false,
      repo: REPO,
    });
  });

  it("writes both entries once Jira is usable", async () => {
    configured();
    platform.invoke.mockResolvedValue(BASE);
    await syncJiraExternalRegistration(REPO);
    const [keyPath, value, strategy] = controlClient.writeConfigValue.mock.calls[0];
    expect(keyPath).toBe(CODEX_CONFIG_KEY_PATH);
    expect(value).toMatchObject({ command: "/apps/l8git", enabled: true });
    expect(strategy).toBe("upsert");
    expect(controlClient.reloadMcpServers).toHaveBeenCalled();
    expect(platform.invoke).toHaveBeenCalledWith("jira_sync_cursor_mcp", {
      enabled: true,
      repo: REPO,
    });
  });

  it("writes nothing external while the registration switch is off", async () => {
    configured({ registerExternal: false });
    platform.invoke.mockResolvedValue(BASE);
    await syncJiraExternalRegistration(REPO);
    expect(controlClient.writeConfigValue).toHaveBeenCalledWith(
      CODEX_CONFIG_KEY_PATH,
      null,
      "replace",
    );
    expect(platform.invoke).toHaveBeenCalledWith("jira_sync_cursor_mcp", {
      enabled: false,
      repo: REPO,
    });
  });

  it("always releases the codex control client", async () => {
    configured();
    platform.invoke.mockResolvedValue(BASE);
    controlClient.writeConfigValue.mockRejectedValue(new Error("codex not installed"));
    await syncJiraExternalRegistration(REPO);
    expect(releaseControl).toHaveBeenCalled();
  });

  it("survives a provider that is not installed", async () => {
    configured();
    platform.invoke.mockRejectedValue(new Error("nope"));
    controlClient.writeConfigValue.mockRejectedValue(new Error("nope"));
    await expect(syncJiraExternalRegistration(REPO)).resolves.toBeUndefined();
  });

  it("skips a repeated sync but retries after a failure", async () => {
    configured();
    platform.invoke.mockResolvedValue(BASE);
    await syncJiraExternalRegistration(REPO);
    const afterFirst = controlClient.writeConfigValue.mock.calls.length;
    await syncJiraExternalRegistration(REPO);
    expect(controlClient.writeConfigValue.mock.calls.length).toBe(afterFirst);

    controlClient.writeConfigValue.mockRejectedValueOnce(new Error("transient"));
    await syncJiraExternalRegistration("/repos/other");
    const afterFailure = controlClient.writeConfigValue.mock.calls.length;
    await syncJiraExternalRegistration("/repos/other");
    expect(controlClient.writeConfigValue.mock.calls.length).toBeGreaterThan(afterFailure);
  });
});
