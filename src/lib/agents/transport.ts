import { Channel, invoke } from "@tauri-apps/api/core";

export type AgentTransportProvider = "codex" | "claude" | (string & {});

export interface AgentTransportOpenOptions {
  cwd?: string;
  resume?: boolean;
  resumeSessionId?: string;
  forkSession?: boolean;
  persistSession?: boolean;
  model?: string;
  effort?: string;
  permissionMode?: string;
  prompt?: string;
  sandbox?: string;
  addDirs?: string[];
  worktree?: string;
}

export interface AgentTransportHandlers {
  onMessage: (message: unknown, sequence: number) => void;
  onStderr?: (line: string) => void;
  onExit?: (code: number) => void;
}

export interface AgentTransport {
  readonly id: number;
  readonly sessionId: string;
  send: (message: unknown) => Promise<void>;
  close: () => Promise<void>;
}

interface AgentTransportHandle {
  id: number;
  sessionId: string;
}

interface AgentStreamEvent {
  sessionId: string;
  sequence: number;
  stream: "json" | "diagnostic" | "exit";
  payload: unknown;
}

export async function openAgentTransport(
  provider: AgentTransportProvider,
  sessionId: string,
  handlers: AgentTransportHandlers,
  options?: AgentTransportOpenOptions,
): Promise<AgentTransport> {
  const onEvent = new Channel<AgentStreamEvent>();
  let transportId: number | null = null;
  let exited = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    onEvent.onmessage = () => {};
  };

  onEvent.onmessage = (event) => {
    if (event.sessionId !== sessionId) return;
    if (event.stream === "json") {
      handlers.onMessage(event.payload, event.sequence);
      return;
    }
    if (event.stream === "diagnostic") {
      handlers.onStderr?.(String(event.payload ?? ""));
      return;
    }
    if (event.stream === "exit") {
      exited = true;
      const code = typeof event.payload === "number" ? event.payload : -1;
      handlers.onExit?.(code);
      if (transportId !== null) {
        void invoke("agent_transport_close", { id: transportId, sessionId });
      }
      release();
    }
  };

  try {
    const handle = await invoke<AgentTransportHandle>("agent_transport_open", {
      provider,
      sessionId,
      options,
      onEvent,
    });
    const { id } = handle;
    if (handle.sessionId !== sessionId) {
      throw new Error("Der native Agent-Transport hat eine falsche Session zurückgegeben.");
    }
    transportId = id;
    if (exited) void invoke("agent_transport_close", { id, sessionId });
    let closed = false;
    return {
      id,
      sessionId,
      send: (message) => invoke("agent_transport_send", { id, sessionId, message }),
      close: async () => {
        if (closed) return;
        closed = true;
        try {
          await invoke("agent_transport_close", { id, sessionId });
        } finally {
          release();
        }
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
