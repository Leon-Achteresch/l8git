import { invoke } from "@tauri-apps/api/core";

import { openAgentTransport, type AgentTransport } from "@/lib/agents/transport";

export interface CursorRunOptions {
  cwd: string;
  prompt: string;
  resumeSessionId?: string;
  model?: string;
  permissionMode?: string;
  sandbox?: string;
  addDirs?: string[];
  worktree?: string;
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
