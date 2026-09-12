import type {
  AgentCapability,
  AgentInputQuestion,
  AgentProviderAdapter,
  DriverKind,
  InstanceId,
  NativeSessionRef,
  ThreadId,
} from "@/lib/agents/types";
import { driverKind, nativeSessionId as toNativeSessionId } from "@/lib/agents/types";

import { FAKE_FIXTURE_EVENTS, type FakeFixtureEvent } from "@/lib/agents/providers/fake/fixture-events";

export type FakeProviderPreset = "minimal" | "full";

export interface FakeProviderCapabilityMatrix {
  history: boolean;
  approvals: boolean;
  models: boolean;
  images: boolean;
  tools: boolean;
}

const FULL_CAPABILITIES: FakeProviderCapabilityMatrix = {
  history: true,
  approvals: true,
  models: true,
  images: true,
  tools: true,
};

const MINIMAL_CAPABILITIES: FakeProviderCapabilityMatrix = {
  history: true,
  approvals: false,
  models: false,
  images: false,
  tools: false,
};

export interface FakeProviderAdapterOptions {
  capabilities?: FakeProviderCapabilityMatrix;
  supportsSteer?: boolean;
  events?: FakeFixtureEvent[];
  onEvent?: (event: FakeFixtureEvent) => void;
}

export class FakeProviderAdapter implements AgentProviderAdapter {
  readonly driver: DriverKind = driverKind("fake");
  private readonly capabilities: FakeProviderCapabilityMatrix;
  private readonly supportsSteer: boolean;
  private readonly events: FakeFixtureEvent[];
  private readonly onEvent?: (event: FakeFixtureEvent) => void;
  private readonly knownThreads = new Set<string>();

  constructor(options: FakeProviderAdapterOptions = {}) {
    this.capabilities = options.capabilities ?? FULL_CAPABILITIES;
    this.supportsSteer = options.supportsSteer ?? true;
    this.events = options.events ?? FAKE_FIXTURE_EVENTS;
    this.onEvent = options.onEvent;
    if (this.supportsSteer) {
      this.steer = async (threadId: ThreadId) => {
        this.requireKnownThread(threadId);
      };
    }
  }

  static preset(preset: FakeProviderPreset, overrides: FakeProviderAdapterOptions = {}): FakeProviderAdapter {
    if (preset === "minimal") {
      return new FakeProviderAdapter({
        capabilities: MINIMAL_CAPABILITIES,
        supportsSteer: false,
        ...overrides,
      });
    }
    return new FakeProviderAdapter({ capabilities: FULL_CAPABILITIES, supportsSteer: true, ...overrides });
  }

  async start(instance: InstanceId): Promise<NativeSessionRef> {
    const sessionId = `fake:${instance}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.knownThreads.add(sessionId);
    return { driver: this.driver, instance, nativeSessionId: toNativeSessionId(sessionId) };
  }

  async send(threadId: ThreadId, _text: string): Promise<void> {
    this.requireKnownThread(threadId);
    for (const event of this.events) {
      this.onEvent?.(event);
    }
  }

  async interrupt(threadId: ThreadId): Promise<void> {
    this.requireKnownThread(threadId);
  }

  async stop(threadId: ThreadId): Promise<void> {
    this.knownThreads.delete(threadId);
  }

  async resume(threadId: ThreadId, ref: NativeSessionRef): Promise<void> {
    this.knownThreads.add(threadId);
    this.knownThreads.add(ref.nativeSessionId);
  }

  capability(name: string): AgentCapability {
    if (!(name in this.capabilities)) {
      return { status: "unavailable", reason: `Unbekannte Capability ${name}` };
    }
    const supported = this.capabilities[name as keyof FakeProviderCapabilityMatrix];
    if (supported) return { status: "supported" };
    return { status: "unsupported", reason: `Fake-Treiber (${this.presetLabel()}) unterstützt dies nicht.` };
  }

  steer?(threadId: ThreadId, text: string): Promise<void>;

  async approve(threadId: ThreadId, _requestId: string, _approved: boolean): Promise<void> {
    this.requireKnownThread(threadId);
  }

  async ask(threadId: ThreadId, _question: AgentInputQuestion): Promise<void> {
    this.requireKnownThread(threadId);
  }

  private requireKnownThread(threadId: string): void {
    if (!this.knownThreads.has(threadId)) {
      throw new Error(`Fake-Treiber kennt Thread ${threadId} nicht.`);
    }
  }

  private presetLabel(): string {
    return this.supportsSteer ? "full" : "minimal";
  }
}
