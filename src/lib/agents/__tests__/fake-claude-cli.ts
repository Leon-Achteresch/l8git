import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type FakeClaudeEvent = Record<string, unknown> & { type: string };

export type ControlResponse = Record<string, unknown>;

export interface FakeClaudeCliOptions {
  respond?: (event: FakeClaudeEvent) => ControlResponse | undefined;
}

export interface FakeClaudeCli {
  events: AsyncGenerator<FakeClaudeEvent>;
  responses: ControlResponse[];
}

export async function* readFixtureEvents(fixturePath: string): AsyncGenerator<FakeClaudeEvent> {
  const stream = createReadStream(fixturePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      yield JSON.parse(trimmed) as FakeClaudeEvent;
    }
  } finally {
    rl.close();
  }
}

export function createFakeClaudeCli(fixturePath: string, options: FakeClaudeCliOptions = {}): FakeClaudeCli {
  const responses: ControlResponse[] = [];

  async function* run(): AsyncGenerator<FakeClaudeEvent> {
    for await (const event of readFixtureEvents(fixturePath)) {
      yield event;
      if (event.type === "control_request") {
        const response = options.respond?.(event);
        if (response) responses.push(response);
      }
    }
  }

  return { events: run(), responses };
}
