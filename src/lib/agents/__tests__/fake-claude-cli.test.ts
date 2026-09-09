import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFakeClaudeCli, readFixtureEvents } from "./fake-claude-cli";

const fixturesDir = path.join(__dirname, "fixtures", "claude");
const fixtureFiles = readdirSync(fixturesDir).filter((file) => file.endsWith(".jsonl"));

describe("claude fixtures", () => {
  it("has fixtures on disk", () => {
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  it.each(fixtureFiles)("parses %s as valid JSON events with a type field", async (file) => {
    const events = [];
    for await (const event of readFixtureEvents(path.join(fixturesDir, file))) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(typeof event.type).toBe("string");
      expect(event.type.length).toBeGreaterThan(0);
    }
  });
});

describe("createFakeClaudeCli", () => {
  it("iterates fixture events and collects control_request responses", async () => {
    const cli = createFakeClaudeCli(path.join(fixturesDir, "permission-request.jsonl"), {
      respond: (event) => ({ request_id: event.request_id, response: { behavior: "allow" } }),
    });

    const events = [];
    for await (const event of cli.events) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("control_request");
    expect(cli.responses).toEqual([
      { request_id: "req-fixture-001", response: { behavior: "allow" } },
    ]);
  });
});
