export interface FakeFixtureEvent {
  type: "text" | "tool" | "usage" | "turn-completed";
  text?: string;
  toolName?: string;
  totalTokens?: number;
}

export const FAKE_FIXTURE_EVENTS: FakeFixtureEvent[] = [
  { type: "text", text: "Hallo, ich bin der Fake-Treiber." },
  { type: "tool", toolName: "read_file" },
  { type: "text", text: "Fertig." },
  { type: "usage", totalTokens: 42 },
  { type: "turn-completed" },
];
