import { describe, expect, it } from "vitest";

import {
  checkVoiceAvailability,
  isVoiceInputTerminal,
  voiceInputReducer,
  type VoiceInputState,
} from "@/lib/agents/voice-input";

describe("voiceInputReducer", () => {
  it("walks idle to draft without auto-sending", () => {
    let state: VoiceInputState = { status: "idle" };
    state = voiceInputReducer(state, { type: "start" });
    expect(state.status).toBe("recording");
    state = voiceInputReducer(state, { type: "stop" });
    expect(state.status).toBe("transcribing");
    state = voiceInputReducer(state, { type: "transcribed", text: "hallo" });
    expect(state).toEqual({ status: "draft", text: "hallo" });
    expect(isVoiceInputTerminal(state)).toBe(true);
  });

  it("routes an audio interruption to the error path and keeps the prior draft", () => {
    let state: VoiceInputState = { status: "recording", startedAt: 0 };
    state = voiceInputReducer(state, { type: "audioInterrupted" }, "vorheriger entwurf");
    expect(state).toEqual({
      status: "error",
      reason: "interrupted",
      previousDraft: "vorheriger entwurf",
    });
  });

  it("recovers from a failed transcription back into recording", () => {
    let state: VoiceInputState = { status: "transcribing", startedAt: 0 };
    state = voiceInputReducer(state, { type: "transcriptionFailed", reason: "network" });
    expect(state.status).toBe("error");
    state = voiceInputReducer(state, { type: "start" });
    expect(state.status).toBe("recording");
  });
});

describe("checkVoiceAvailability", () => {
  it("is injectable for platform-specific probes", () => {
    const availability = checkVoiceAvailability(() => ({
      supported: true,
      platforms: ["macos"],
      languages: ["de-DE"],
    }));
    expect(availability.supported).toBe(true);
  });
});
