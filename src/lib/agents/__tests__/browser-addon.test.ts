import { describe, expect, it } from "vitest";

import {
  applyServerEntry,
  browserAddonArgs,
  browserAddonEntry,
  browserAddonEntryArgs,
  browserAddonOptionsFromArgs,
  browserE2ePrompt,
  BROWSER_ADDON_SERVER_NAME,
  DEFAULT_BROWSER_ADDON_OPTIONS,
  type BrowserAddonOptions,
} from "@/lib/agents/browser-addon";

const options = (overrides: Partial<BrowserAddonOptions> = {}): BrowserAddonOptions => ({
  ...DEFAULT_BROWSER_ADDON_OPTIONS,
  ...overrides,
});

describe("browserAddonArgs", () => {
  it("starts the pinned package and keeps the defaults minimal", () => {
    expect(browserAddonArgs(options())).toEqual(["-y", "@playwright/mcp@latest", "--isolated"]);
  });

  it("maps every option onto its documented flag", () => {
    expect(browserAddonArgs(options({
      browser: "firefox",
      headless: true,
      isolated: false,
      viewport: "1280x720",
      device: "iPhone 15",
      allowedOrigins: "http://localhost:5173",
      caps: "vision,pdf",
    }))).toEqual([
      "-y",
      "@playwright/mcp@latest",
      "--browser",
      "firefox",
      "--headless",
      "--viewport-size",
      "1280x720",
      "--device",
      "iPhone 15",
      "--allowed-origins",
      "http://localhost:5173",
      "--caps",
      "vision,pdf",
    ]);
  });

  it("trims option values", () => {
    expect(browserAddonArgs(options({ viewport: "  800x600  " }))).toContain("800x600");
  });
});

describe("browserAddonOptionsFromArgs", () => {
  it("round-trips the arguments it produced", () => {
    const original = options({
      browser: "msedge",
      headless: true,
      isolated: true,
      viewport: "1440x900",
      device: "Pixel 7",
      allowedOrigins: "https://example.com;https://api.example.com",
      caps: "devtools",
    });
    expect(browserAddonOptionsFromArgs(browserAddonArgs(original))).toEqual(original);
  });

  it("ignores an unknown browser and a flag without a value", () => {
    const parsed = browserAddonOptionsFromArgs(["-y", "@playwright/mcp@latest", "--browser", "opera", "--device"]);
    expect(parsed.browser).toBe("");
    expect(parsed.device).toBe("");
  });
});

describe("browserAddonEntry", () => {
  it("writes command plus args for Claude Code and Cursor", () => {
    expect(browserAddonEntry("claude", options())).toEqual({
      command: "npx",
      args: ["-y", "@playwright/mcp@latest", "--isolated"],
    });
    expect(browserAddonEntry("cursor", options())).toEqual(browserAddonEntry("claude", options()));
  });

  it("writes OpenCode's single command array", () => {
    expect(browserAddonEntry("opencode", options())).toEqual({
      type: "local",
      command: ["npx", "-y", "@playwright/mcp@latest", "--isolated"],
      enabled: true,
    });
  });
});

describe("browserAddonEntryArgs", () => {
  it("reads back both entry shapes", () => {
    expect(browserAddonEntryArgs(browserAddonEntry("claude", options()))).toEqual([
      "-y",
      "@playwright/mcp@latest",
      "--isolated",
    ]);
    expect(browserAddonEntryArgs(browserAddonEntry("opencode", options()))).toEqual([
      "-y",
      "@playwright/mcp@latest",
      "--isolated",
    ]);
  });

  it("returns null when there is no entry", () => {
    expect(browserAddonEntryArgs(undefined)).toBeNull();
    expect(browserAddonEntryArgs({})).toBeNull();
    expect(browserAddonEntryArgs({ command: [] })).toBeNull();
  });
});

describe("applyServerEntry", () => {
  it("creates a Claude Code config from nothing", () => {
    const written = applyServerEntry("", "claude", BROWSER_ADDON_SERVER_NAME, browserAddonEntry("claude", options()));
    expect(JSON.parse(written)).toEqual({
      mcpServers: {
        browser: { command: "npx", args: ["-y", "@playwright/mcp@latest", "--isolated"] },
      },
    });
    expect(written.endsWith("}\n")).toBe(true);
  });

  it("seeds the schema only for a new OpenCode config", () => {
    const fresh = JSON.parse(applyServerEntry("", "opencode", BROWSER_ADDON_SERVER_NAME, browserAddonEntry("opencode", options())));
    expect(fresh.$schema).toBe("https://opencode.ai/config.json");
    expect(fresh.mcp.browser.type).toBe("local");

    const existing = JSON.parse(applyServerEntry(
      JSON.stringify({ model: "anthropic/claude-opus-5" }),
      "opencode",
      BROWSER_ADDON_SERVER_NAME,
      browserAddonEntry("opencode", options()),
    ));
    expect(existing.$schema).toBeUndefined();
    expect(existing.model).toBe("anthropic/claude-opus-5");
  });

  it("keeps unrelated keys, other servers and their order", () => {
    const before = JSON.stringify({
      mcpServers: { alpha: { command: "alpha" }, zulu: { command: "zulu" } },
      permissions: { allow: ["Bash"] },
    }, null, 2);
    const after = applyServerEntry(before, "claude", BROWSER_ADDON_SERVER_NAME, browserAddonEntry("claude", options()));
    const parsed = JSON.parse(after);
    expect(Object.keys(parsed)).toEqual(["mcpServers", "permissions"]);
    expect(Object.keys(parsed.mcpServers)).toEqual(["alpha", "zulu", "browser"]);
    expect(parsed.permissions.allow).toEqual(["Bash"]);
  });

  it("removes only its own server", () => {
    const before = JSON.stringify({
      mcpServers: { alpha: { command: "alpha" }, browser: { command: "npx" } },
    });
    const parsed = JSON.parse(applyServerEntry(before, "claude", BROWSER_ADDON_SERVER_NAME, null));
    expect(parsed.mcpServers).toEqual({ alpha: { command: "alpha" } });
  });

  it("does not add an empty section when removing from a file that never had one", () => {
    const parsed = JSON.parse(applyServerEntry(JSON.stringify({ model: "x" }), "claude", BROWSER_ADDON_SERVER_NAME, null));
    expect(parsed).toEqual({ model: "x" });
  });

  it("refuses to overwrite a config it cannot parse", () => {
    expect(() => applyServerEntry("{ not json", "claude", BROWSER_ADDON_SERVER_NAME, null)).toThrow(/gültiges JSON/u);
    expect(() => applyServerEntry("[]", "claude", BROWSER_ADDON_SERVER_NAME, null)).toThrow(/JSON-Objekt/u);
  });
});

describe("browserE2ePrompt", () => {
  it("carries the scenario, the base URL and the tool guidance", () => {
    const prompt = browserE2ePrompt("  Login mit falschem Passwort  ", { baseUrl: "http://localhost:5173" });
    expect(prompt).toContain("Login mit falschem Passwort");
    expect(prompt).toContain("http://localhost:5173");
    expect(prompt).toContain("browser_snapshot");
    expect(prompt).toContain("browser_verify_text_visible");
  });

  it("omits the base URL sentence when none is configured", () => {
    expect(browserE2ePrompt("Smoke test")).not.toContain("runs at");
  });
});
