import { invoke } from "@/lib/platform/ipc";

import { openAgentTransport, type AgentTransport } from "@/lib/agents/transport";
import type {
  AgentCapability,
  AgentProviderAdapter,
  DriverKind,
  InstanceId,
  NativeSessionRef,
  ThreadId,
} from "@/lib/agents/types";
import { driverKind, nativeSessionId as toNativeSessionId } from "@/lib/agents/types";

export interface CursorRunOptions {
  cwd: string;
  prompt: string;
  resumeSessionId?: string;
  model?: string;
  permissionMode?: string;
  sandbox?: string;
  addDirs?: string[];
  worktree?: string;
  agentsTrusted?: boolean;
}

export interface CursorClientHandlers {
  onEvent: (event: Record<string, unknown>) => void;
  onDiagnostic?: (line: string) => void;
  onExit?: (code: number) => void;
}

export interface CursorModel {
  id: string;
  label: string;
}

export interface CursorAccount {
  email: string | null;
  loggedIn: boolean;
}

/**
 * The Cursor CLI has no bidirectional stdio protocol: every turn is one
 * `--print` process that streams JSONL and exits. Continuity comes from the
 * chat id passed via `--resume`.
 */
export class CursorClient {
  private transport: AgentTransport | null = null;
  private run = 0;

  constructor(
    readonly threadId: string,
    private readonly handlers: CursorClientHandlers,
  ) {}

  get running(): boolean {
    return this.transport !== null;
  }

  async send(options: CursorRunOptions): Promise<void> {
    if (this.transport) throw new Error("Cursor bearbeitet bereits eine Anfrage.");
    const sessionId = `cursor-${this.threadId}:${(this.run += 1)}`;
    const transport = await openAgentTransport(
      "cursor",
      sessionId,
      {
        onMessage: (message) => {
          if (typeof message === "object" && message !== null) {
            this.handlers.onEvent(message as Record<string, unknown>);
          }
        },
        onStderr: (line) => this.handlers.onDiagnostic?.(line),
        onExit: (code) => {
          this.transport = null;
          this.handlers.onExit?.(code);
        },
      },
      {
        cwd: options.cwd,
        prompt: options.prompt,
        resume: Boolean(options.resumeSessionId),
        resumeSessionId: options.resumeSessionId,
        model: options.model,
        permissionMode: options.permissionMode,
        sandbox: options.sandbox,
        addDirs: options.addDirs,
        worktree: options.worktree,
        agentsTrusted: options.agentsTrusted,
      },
    );
    this.transport = transport;
  }

  async interrupt(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    await transport?.close().catch(() => {});
  }

  close(): Promise<void> {
    return this.interrupt();
  }
}

export function cursorCli(args: string[], cwd?: string): Promise<string> {
  return invoke<string>("cursor_cli", { args, cwd });
}

export async function cursorCreateChat(cwd: string): Promise<string> {
  const output = await cursorCli(["create-chat"], cwd);
  const id = output.split(/\s+/u).pop() ?? "";
  if (!/^[A-Za-z0-9-]{8,128}$/u.test(id)) {
    throw new Error("Cursor hat keine Chat-ID zurückgegeben.");
  }
  return id;
}

/** Parses the `id - Label` lines of `cursor-agent models`. */
export function parseCursorModels(output: string): CursorModel[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9][\w.-]*\s+-\s+\S/u.test(line))
    .map((line) => {
      const [id, ...rest] = line.split(/\s+-\s+/u);
      return { id, label: rest.join(" - ").replace(/\s*\(default\)$/u, "") };
    });
}

const CURSOR_EFFORT_TOKENS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  fast: "Fast",
  thinking: "Thinking",
};

function splitCursorModelId(id: string): { base: string; effort: string } {
  const parts = id.split("-");
  let cut = parts.length;
  while (cut > 1 && CURSOR_EFFORT_TOKENS[parts[cut - 1]]) cut -= 1;
  return { base: parts.slice(0, cut).join("-"), effort: parts.slice(cut).join("-") };
}

export function cursorEffortLabel(effort: string): string {
  if (!effort) return "Default";
  return effort
    .split("-")
    .map((token) => CURSOR_EFFORT_TOKENS[token] ?? token)
    .join(" ");
}

function commonLabel(labels: string[]): string {
  let prefix = labels[0] ?? "";
  for (const label of labels.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < label.length && prefix[index] === label[index]) index += 1;
    prefix = prefix.slice(0, index);
  }
  const trimmed = prefix.replace(/[\s(\-–—]+$/u, "").trim();
  return trimmed || labels.reduce((shortest, label) => (label.length < shortest.length ? label : shortest), labels[0] ?? "");
}

export interface CursorModelGroup {
  id: string;
  label: string;
  efforts: string[];
}

export function groupCursorModels(models: CursorModel[]): CursorModelGroup[] {
  const groups = new Map<string, { labels: string[]; efforts: string[] }>();
  for (const model of models) {
    const { base, effort } = splitCursorModelId(model.id);
    const group = groups.get(base) ?? { labels: [], efforts: [] };
    group.labels.push(model.label);
    if (!group.efforts.includes(effort)) group.efforts.push(effort);
    groups.set(base, group);
  }
  return [...groups].map(([id, group]) => ({
    id,
    label: commonLabel(group.labels),
    efforts: group.efforts.length === 1 && group.efforts[0] === "" ? [] : group.efforts,
  }));
}

export function cursorModelId(model: string | null, effort: string | null): string | undefined {
  if (!model) return undefined;
  return effort ? `${model}-${effort}` : model;
}

export function parseCursorStatus(output: string): CursorAccount {
  const email = output.match(/[\w.+-]+@[\w-]+\.[\w.-]+/u)?.[0] ?? null;
  return { email, loggedIn: Boolean(email) && !/not logged in|logged out/iu.test(output) };
}

export function parseCursorMcpServers(output: string): Array<{ name: string; status: string }> {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(Configured MCP servers|No MCP servers)/iu.test(line))
    .map((line) => {
      const cleaned = line.replace(/^[-•*]\s*/u, "");
      const [name, ...rest] = cleaned.split(/\s{2,}|\s+-\s+|:\s+/u);
      return { name: name.trim(), status: rest.join(" ").trim() || "unknown" };
    })
    .filter((server) => /^[\w@./-]+$/u.test(server.name));
}

export class CursorProviderAdapter implements AgentProviderAdapter {
  readonly driver: DriverKind = driverKind("cursor");
  private readonly clients = new Map<string, CursorClient>();
  private readonly cwds = new Map<string, string>();
  private readonly nativeSessions = new Map<string, string>();

  async start(instance: InstanceId): Promise<NativeSessionRef> {
    const sessionId = `cursor:${instance}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.cwds.set(sessionId, String(instance));
    return { driver: this.driver, instance, nativeSessionId: toNativeSessionId(sessionId) };
  }

  async send(threadId: ThreadId, text: string): Promise<void> {
    const client = this.clientFor(threadId);
    await client.send({
      cwd: this.cwds.get(threadId) ?? "",
      prompt: text,
      resumeSessionId: this.nativeSessions.get(threadId),
    });
  }

  async interrupt(threadId: ThreadId): Promise<void> {
    await this.clients.get(threadId)?.interrupt();
  }

  async stop(threadId: ThreadId): Promise<void> {
    const client = this.clients.get(threadId);
    this.clients.delete(threadId);
    await client?.close();
  }

  async resume(threadId: ThreadId, ref: NativeSessionRef): Promise<void> {
    this.cwds.set(threadId, this.cwds.get(threadId) ?? String(ref.instance));
    this.nativeSessions.set(threadId, ref.nativeSessionId);
  }

  capability(name: string): AgentCapability {
    switch (name) {
      case "history":
      case "models":
      case "tools":
        return { status: "supported" };
      case "approvals":
      case "images":
        return { status: "unsupported", reason: "Cursor CLI unterstützt dies nicht." };
      default:
        return { status: "unavailable", reason: `Unbekannte Capability ${name}` };
    }
  }

  private clientFor(threadId: ThreadId): CursorClient {
    let client = this.clients.get(threadId);
    if (!client) {
      client = new CursorClient(threadId, { onEvent: () => {} });
      this.clients.set(threadId, client);
    }
    return client;
  }
}
