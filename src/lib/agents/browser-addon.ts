import { invoke } from "@/lib/platform/ipc";

import type { NativeAgentProvider } from "@/lib/agents/provider-store";

/**
 * Browser-Addon: gibt jeder unterstützten CLI über einen MCP-Server echten
 * Browser-Zugriff, damit End-to-End-Tests direkt aus dem Chat laufen.
 *
 * Die drei dateibasierten CLIs bekommen ihren Eintrag in die jeweilige
 * Projektkonfiguration geschrieben (Rust-Commands in `agent_addons.rs`),
 * Codex geht über den App-Server, der seine `config.toml` selbst pflegt.
 */

export const BROWSER_ADDON_SERVER_NAME = "browser";
export const BROWSER_ADDON_PACKAGE = "@playwright/mcp@latest";
export const BROWSER_ADDON_COMMAND = "npx";

/** CLIs, deren MCP-Konfiguration als Datei im Repository liegt. */
export const BROWSER_ADDON_FILE_PROVIDERS = ["claude", "cursor", "opencode"] as const;
export type BrowserAddonFileProvider = (typeof BROWSER_ADDON_FILE_PROVIDERS)[number];

export const BROWSER_ADDON_CONFIG_SECTION: Record<BrowserAddonFileProvider, "mcpServers" | "mcp"> = {
  claude: "mcpServers",
  cursor: "mcpServers",
  opencode: "mcp",
};

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";

export type BrowserAddonBrowser = "" | "chrome" | "msedge" | "firefox" | "webkit";

export interface BrowserAddonOptions {
  /** Leer = Playwrights eigenes Chromium. */
  browser: BrowserAddonBrowser;
  headless: boolean;
  isolated: boolean;
  /** `1280x720`; leer = Playwright-Standard. */
  viewport: string;
  /** Gerätename wie `iPhone 15`; leer = Desktop. */
  device: string;
  /** Semikolonliste vertrauenswürdiger Origins; leer = alle erlaubt. */
  allowedOrigins: string;
  /** Kommaliste aus `vision`, `pdf`, `devtools`. */
  caps: string;
  /** Nur für den Testprompt: Basisadresse der laufenden Anwendung. */
  baseUrl: string;
}

export const DEFAULT_BROWSER_ADDON_OPTIONS: BrowserAddonOptions = {
  browser: "",
  headless: false,
  // Ein eigenes Profil je Lauf: Tests starten sonst mit den Cookies des
  // letzten Laufs und werden unreproduzierbar.
  isolated: true,
  viewport: "",
  device: "",
  allowedOrigins: "",
  caps: "",
  baseUrl: "",
};

export const BROWSER_ADDON_BROWSERS: Array<{ value: BrowserAddonBrowser; label: string }> = [
  { value: "", label: "Chromium (Playwright)" },
  { value: "chrome", label: "Google Chrome" },
  { value: "msedge", label: "Microsoft Edge" },
  { value: "firefox", label: "Firefox" },
  { value: "webkit", label: "WebKit / Safari" },
];

const KNOWN_BROWSERS: readonly string[] = ["chrome", "msedge", "firefox", "webkit"];

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Startargumente für `npx`, in stabiler Reihenfolge. */
export function browserAddonArgs(options: BrowserAddonOptions): string[] {
  const args = ["-y", BROWSER_ADDON_PACKAGE];
  if (options.browser) args.push("--browser", options.browser);
  if (options.headless) args.push("--headless");
  if (options.isolated) args.push("--isolated");
  if (trimmed(options.viewport)) args.push("--viewport-size", trimmed(options.viewport));
  if (trimmed(options.device)) args.push("--device", trimmed(options.device));
  if (trimmed(options.allowedOrigins)) args.push("--allowed-origins", trimmed(options.allowedOrigins));
  if (trimmed(options.caps)) args.push("--caps", trimmed(options.caps));
  return args;
}

/** Liest die Optionen aus einer bestehenden Argumentliste zurück. */
export function browserAddonOptionsFromArgs(
  args: readonly string[],
  baseUrl = "",
): BrowserAddonOptions {
  const valueOf = (flag: string): string => {
    const index = args.indexOf(flag);
    if (index < 0) return "";
    const next = args[index + 1];
    return next && !next.startsWith("--") ? next : "";
  };
  const browser = valueOf("--browser");
  return {
    browser: KNOWN_BROWSERS.includes(browser) ? (browser as BrowserAddonBrowser) : "",
    headless: args.includes("--headless"),
    isolated: args.includes("--isolated"),
    viewport: valueOf("--viewport-size"),
    device: valueOf("--device"),
    allowedOrigins: valueOf("--allowed-origins"),
    caps: valueOf("--caps"),
    baseUrl,
  };
}

/** Servereintrag im Format der jeweiligen CLI. */
export function browserAddonEntry(
  provider: BrowserAddonFileProvider,
  options: BrowserAddonOptions,
): Record<string, unknown> {
  const args = browserAddonArgs(options);
  if (provider === "opencode") {
    return {
      type: "local",
      command: [BROWSER_ADDON_COMMAND, ...args],
      enabled: true,
    };
  }
  return { command: BROWSER_ADDON_COMMAND, args };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Argumentliste eines vorhandenen Eintrags, egal in welchem CLI-Format. */
export function browserAddonEntryArgs(entry: unknown): string[] | null {
  if (!isRecord(entry)) return null;
  if (Array.isArray(entry.command)) {
    const command = entry.command.filter((item): item is string => typeof item === "string");
    return command.length ? command.slice(1) : null;
  }
  if (Array.isArray(entry.args)) {
    return entry.args.filter((item): item is string => typeof item === "string");
  }
  return null;
}

/**
 * Setzt oder entfernt einen Servereintrag in einer CLI-Konfiguration und gibt
 * den neuen Dateiinhalt zurück. Alle übrigen Schlüssel und ihre Reihenfolge
 * bleiben erhalten — die Datei gehört dem Anwender, nicht uns.
 */
export function applyServerEntry(
  contents: string,
  provider: BrowserAddonFileProvider,
  name: string,
  entry: Record<string, unknown> | null,
): string {
  const source = contents.trim();
  let parsed: unknown = {};
  if (source) {
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error("Die vorhandene MCP-Konfiguration ist kein gültiges JSON.");
    }
  }
  if (!isRecord(parsed)) throw new Error("Die vorhandene MCP-Konfiguration ist kein JSON-Objekt.");

  const config: Record<string, unknown> = { ...parsed };
  if (provider === "opencode" && !source) config.$schema = OPENCODE_SCHEMA;

  const key = BROWSER_ADDON_CONFIG_SECTION[provider];
  const section: Record<string, unknown> = isRecord(config[key]) ? { ...(config[key] as Record<string, unknown>) } : {};
  if (entry) section[name] = entry;
  else delete section[name];

  if (Object.keys(section).length === 0 && !isRecord(parsed[key])) delete config[key];
  else config[key] = section;

  return `${JSON.stringify(config, null, 2)}\n`;
}

interface AddonConfigFile {
  provider: string;
  file: string;
  exists: boolean;
  contents: string;
}

export interface BrowserAddonStatus {
  provider: NativeAgentProvider;
  installed: boolean;
  /** Konfigurationsdatei; bei Codex `null`, dort verwaltet der App-Server. */
  file: string | null;
  options: BrowserAddonOptions;
  /** Kompletter Startbefehl zur Anzeige. */
  command: string;
  error: string | null;
}

function isFileProvider(provider: NativeAgentProvider): provider is BrowserAddonFileProvider {
  return (BROWSER_ADDON_FILE_PROVIDERS as readonly string[]).includes(provider);
}

function emptyStatus(provider: NativeAgentProvider, file: string | null): BrowserAddonStatus {
  return {
    provider,
    installed: false,
    file,
    options: DEFAULT_BROWSER_ADDON_OPTIONS,
    command: `${BROWSER_ADDON_COMMAND} ${browserAddonArgs(DEFAULT_BROWSER_ADDON_OPTIONS).join(" ")}`,
    error: null,
  };
}

function statusFromArgs(
  provider: NativeAgentProvider,
  file: string | null,
  args: string[] | null,
  baseUrl: string,
): BrowserAddonStatus {
  if (!args) return { ...emptyStatus(provider, file), options: { ...DEFAULT_BROWSER_ADDON_OPTIONS, baseUrl } };
  return {
    provider,
    installed: true,
    file,
    options: browserAddonOptionsFromArgs(args, baseUrl),
    command: `${BROWSER_ADDON_COMMAND} ${args.join(" ")}`,
    error: null,
  };
}

async function readConfigFile(path: string, provider: BrowserAddonFileProvider): Promise<AddonConfigFile> {
  return invoke<AddonConfigFile>("agent_addon_config_read", { path, provider });
}

async function writeConfigFile(
  path: string,
  provider: BrowserAddonFileProvider,
  contents: string,
): Promise<AddonConfigFile> {
  return invoke<AddonConfigFile>("agent_addon_config_write", { path, provider, contents });
}

function configuredEntry(contents: string, provider: BrowserAddonFileProvider, name: string): unknown {
  if (!contents.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(contents);
    if (!isRecord(parsed)) return null;
    const section = parsed[BROWSER_ADDON_CONFIG_SECTION[provider]];
    return isRecord(section) ? section[name] ?? null : null;
  } catch {
    return null;
  }
}

/** Codex verwaltet MCP-Server über den App-Server, nicht über eine Repo-Datei. */
async function codexCapabilityStore() {
  const module = await import("@/lib/agents/capability-store");
  return module;
}

export async function readBrowserAddon(
  path: string,
  provider: NativeAgentProvider,
  baseUrl = "",
): Promise<BrowserAddonStatus> {
  try {
    if (isFileProvider(provider)) {
      const file = await readConfigFile(path, provider);
      const entry = configuredEntry(file.contents, provider, BROWSER_ADDON_SERVER_NAME);
      return statusFromArgs(provider, file.file, browserAddonEntryArgs(entry), baseUrl);
    }
    const { useAgentCapabilityStore } = await codexCapabilityStore();
    await useAgentCapabilityStore.getState().load(path);
    const server = useAgentCapabilityStore
      .getState()
      .mcpServers.find((candidate) => candidate.name === BROWSER_ADDON_SERVER_NAME);
    return statusFromArgs(provider, null, browserAddonEntryArgs(server?.config), baseUrl);
  } catch (error) {
    return {
      ...emptyStatus(provider, null),
      options: { ...DEFAULT_BROWSER_ADDON_OPTIONS, baseUrl },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function installBrowserAddon(
  path: string,
  provider: NativeAgentProvider,
  options: BrowserAddonOptions,
): Promise<BrowserAddonStatus> {
  if (isFileProvider(provider)) {
    const file = await readConfigFile(path, provider);
    const next = applyServerEntry(
      file.contents,
      provider,
      BROWSER_ADDON_SERVER_NAME,
      browserAddonEntry(provider, options),
    );
    const written = await writeConfigFile(path, provider, next);
    return statusFromArgs(provider, written.file, browserAddonArgs(options), options.baseUrl);
  }
  const { emptyMcpServerDraft, useAgentCapabilityStore } = await codexCapabilityStore();
  await useAgentCapabilityStore.getState().load(path);
  await useAgentCapabilityStore.getState().saveMcpServer({
    ...emptyMcpServerDraft(),
    name: BROWSER_ADDON_SERVER_NAME,
    transport: "stdio",
    command: BROWSER_ADDON_COMMAND,
    args: browserAddonArgs(options),
    // Der erste Start lädt das Paket über npx nach, das dauert.
    startupTimeoutSec: 60,
    toolTimeoutSec: 120,
  });
  return statusFromArgs(provider, null, browserAddonArgs(options), options.baseUrl);
}

export async function removeBrowserAddon(
  path: string,
  provider: NativeAgentProvider,
): Promise<BrowserAddonStatus> {
  if (isFileProvider(provider)) {
    const file = await readConfigFile(path, provider);
    if (!file.exists) return emptyStatus(provider, file.file);
    const next = applyServerEntry(file.contents, provider, BROWSER_ADDON_SERVER_NAME, null);
    const written = await writeConfigFile(path, provider, next);
    return emptyStatus(provider, written.file);
  }
  const { useAgentCapabilityStore } = await codexCapabilityStore();
  await useAgentCapabilityStore.getState().load(path);
  await useAgentCapabilityStore.getState().deleteMcpServer(BROWSER_ADDON_SERVER_NAME);
  return emptyStatus(provider, null);
}

export const BROWSER_E2E_DOC = `You have direct browser access through the MCP server "${BROWSER_ADDON_SERVER_NAME}" (Playwright MCP). Drive the real browser yourself instead of writing a test file and asking someone to run it.

How to work:
- Start with browser_navigate, then browser_snapshot. Act on the accessibility snapshot, not on guessed selectors — every element in it carries a ref you pass to browser_click, browser_type, browser_hover, browser_select_option and browser_fill_form.
- Assert with browser_verify_text_visible, browser_verify_element_visible and browser_verify_value. Do not call a step passed because a click returned without an error.
- Use browser_wait_for for anything asynchronous. Never poll in a loop and never sleep blindly.
- On a failure, collect evidence before you change anything: browser_console_messages, browser_network_requests and browser_take_screenshot.
- Close the browser with browser_close when the run is finished.

Report as a compact table: step, expectation, result (pass/fail), and for each failure the shortest reproduction plus the console or network evidence. State plainly which steps you could not run.`;

export function browserE2ePrompt(request: string, options?: Pick<BrowserAddonOptions, "baseUrl">): string {
  const baseUrl = trimmed(options?.baseUrl);
  const target = baseUrl ? `\n\nThe application under test runs at ${baseUrl}. Start there.` : "";
  return `Run this end-to-end test in the browser and report the result:\n\n${request.trim()}${target}\n\n${BROWSER_E2E_DOC}`;
}
