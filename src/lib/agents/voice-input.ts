export type VoiceInputState =
  | { status: "idle" }
  | { status: "recording"; startedAt: number; draft?: string }
  | { status: "transcribing"; startedAt: number; draft?: string }
  | { status: "draft"; text: string }
  | { status: "error"; reason: string; previousDraft: string };

export interface VoiceAvailability {
  supported: boolean;
  platforms: readonly string[];
  languages: readonly string[];
}

export type VoiceInputEvent =
  | { type: "start" }
  | { type: "stop" }
  | { type: "audioInterrupted" }
  | { type: "transcribed"; text: string }
  | { type: "transcriptionFailed"; reason: string }
  | { type: "cancel" }
  | { type: "navigateAway" };

export function checkVoiceAvailability(
  probe: () => VoiceAvailability = defaultAvailabilityProbe,
): VoiceAvailability {
  return probe();
}

function defaultAvailabilityProbe(): VoiceAvailability {
  return { supported: false, platforms: [], languages: [] };
}

export function voiceInputReducer(
  state: VoiceInputState,
  event: VoiceInputEvent,
  existingDraft = "",
): VoiceInputState {
  switch (state.status) {
    case "idle": {
      if (event.type === "start") {
        return { status: "recording", startedAt: Date.now(), draft: existingDraft || undefined };
      }
      return state;
    }
    case "recording": {
      if (event.type === "stop") {
        return { status: "transcribing", startedAt: state.startedAt, draft: state.draft };
      }
      if (event.type === "audioInterrupted") {
        return {
          status: "error",
          reason: "interrupted",
          previousDraft: existingDraft || state.draft || "",
        };
      }
      if (event.type === "cancel" || event.type === "navigateAway") {
        return { status: "idle" };
      }
      return state;
    }
    case "transcribing": {
      if (event.type === "transcribed") {
        const combined = state.draft ? `${state.draft}\n${event.text}` : event.text;
        return { status: "draft", text: combined };
      }
      if (event.type === "transcriptionFailed") {
        return {
          status: "error",
          reason: event.reason,
          previousDraft: existingDraft || state.draft || "",
        };
      }
      if (event.type === "cancel" || event.type === "navigateAway") {
        return { status: "idle" };
      }
      return state;
    }
    case "draft": {
      if (event.type === "start") {
        return { status: "recording", startedAt: Date.now(), draft: state.text };
      }
      if (event.type === "cancel") {
        return { status: "idle" };
      }
      return state;
    }
    case "error": {
      if (event.type === "start") {
        return { status: "recording", startedAt: Date.now(), draft: existingDraft || state.previousDraft || undefined };
      }
      if (event.type === "cancel" || event.type === "navigateAway") {
        return { status: "idle" };
      }
      return state;
    }
    default:
      return state;
  }
}

export function isVoiceInputTerminal(state: VoiceInputState): boolean {
  return state.status === "idle" || state.status === "draft" || state.status === "error";
}
