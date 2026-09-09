export type ResumeFailureKind = "missing" | "incompatible" | "foreignInstance" | "unknown";

export interface ResumeFailureClassification {
  kind: ResumeFailureKind;
  userMessage: string;
  canStartFresh: boolean;
}

export interface ResumeFailureInput {
  error?: string | null;
  status?: string | null;
  expectedConfigDir?: string | null;
  actualConfigDir?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

export function classifyResumeFailure(input: ResumeFailureInput): ResumeFailureClassification {
  const { expectedConfigDir, actualConfigDir } = input;
  if (
    expectedConfigDir &&
    actualConfigDir &&
    expectedConfigDir !== actualConfigDir
  ) {
    return {
      kind: "foreignInstance",
      userMessage:
        "Diese Session gehört zu einer anderen Instanz-Konfiguration und kann hier nicht fortgesetzt werden.",
      canStartFresh: true,
    };
  }

  const error = normalize(input.error);
  const status = normalize(input.status);
  const combined = `${error} ${status}`;

  if (
    combined.includes("not found") ||
    combined.includes("no such file") ||
    combined.includes("enoent") ||
    combined.includes("missing")
  ) {
    return {
      kind: "missing",
      userMessage: "Die native Session wurde nicht gefunden. Ein neuer Chat kann gestartet werden.",
      canStartFresh: true,
    };
  }

  if (
    combined.includes("unsupported") ||
    combined.includes("incompatib") ||
    combined.includes("version")
  ) {
    return {
      kind: "incompatible",
      userMessage:
        "Diese Session ist mit der installierten CLI-Version nicht kompatibel. Ein Update oder ein neuer Chat wird benötigt.",
      canStartFresh: true,
    };
  }

  return {
    kind: "unknown",
    userMessage: "Die Session konnte nicht fortgesetzt werden. Bitte erneut versuchen.",
    canStartFresh: false,
  };
}
