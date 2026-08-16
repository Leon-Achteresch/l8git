import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import i18n from "i18next";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type NotificationKind =
  | "ciFailed"
  | "reviewRequested"
  | "agentTurn"
  | "remoteOpDone";

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "ciFailed",
  "reviewRequested",
  "agentTurn",
  "remoteOpDone",
];

export const NOTIFICATION_DEDUPE_MS = 60_000;
export const REMOTE_OP_MIN_DURATION_MS = 10_000;
const DEDUPE_CACHE_LIMIT = 200;

export type NotificationTarget =
  | { view: "ci"; path: string }
  | { view: "pr"; path: string; number: number }
  | { view: "agents"; provider: string; threadId: string }
  | { view: "repo"; path: string };

type NotificationPrefsState = {
  enabled: boolean;
  kinds: Record<NotificationKind, boolean>;
  setEnabled: (value: boolean) => void;
  setKind: (kind: NotificationKind, value: boolean) => void;
};

export const useNotificationPrefs = create<NotificationPrefsState>()(
  persist(
    (set) => ({
      enabled: true,
      kinds: {
        ciFailed: true,
        reviewRequested: true,
        agentTurn: true,
        remoteOpDone: true,
      },
      setEnabled: (enabled) => set({ enabled }),
      setKind: (kind, value) =>
        set((state) => ({ kinds: { ...state.kinds, [kind]: value } })),
    }),
    {
      name: "l8git-notification-prefs",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<NotificationPrefsState>;
        return {
          ...current,
          ...saved,
          kinds: { ...current.kinds, ...(saved.kinds ?? {}) },
        };
      },
    },
  ),
);

export type NotificationPermissionStatus = "unknown" | "granted" | "denied";

type PermissionState = {
  status: NotificationPermissionStatus;
  setStatus: (status: NotificationPermissionStatus) => void;
};

export const useNotificationPermission = create<PermissionState>((set) => ({
  status: "unknown",
  setStatus: (status) => set({ status }),
}));

export async function refreshNotificationPermission(): Promise<NotificationPermissionStatus> {
  try {
    const granted = await isPermissionGranted();
    const status: NotificationPermissionStatus = granted ? "granted" : "denied";
    useNotificationPermission.getState().setStatus(status);
    return status;
  } catch {
    useNotificationPermission.getState().setStatus("unknown");
    return "unknown";
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) {
      useNotificationPermission.getState().setStatus("granted");
      return true;
    }
    const result = await requestPermission();
    const granted = result === "granted";
    useNotificationPermission.getState().setStatus(granted ? "granted" : "denied");
    return granted;
  } catch {
    useNotificationPermission.getState().setStatus("unknown");
    return false;
  }
}

export function pruneDedupeCache(
  cache: Map<string, number>,
  now: number,
  windowMs = NOTIFICATION_DEDUPE_MS,
): void {
  for (const [key, at] of cache) {
    if (now - at >= windowMs) cache.delete(key);
  }
}

export function shouldEmit(
  cache: Map<string, number>,
  key: string,
  now: number,
  windowMs = NOTIFICATION_DEDUPE_MS,
): boolean {
  const last = cache.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  if (cache.size >= DEDUPE_CACHE_LIMIT) pruneDedupeCache(cache, now, windowMs);
  cache.set(key, now);
  return true;
}

export function isNotificationAllowed(
  prefs: { enabled: boolean; kinds: Record<NotificationKind, boolean> },
  kind: NotificationKind,
): boolean {
  return prefs.enabled && prefs.kinds[kind] !== false;
}

const dedupeCache = new Map<string, number>();

export function resetNotificationDedupe(): void {
  dedupeCache.clear();
}

export async function isWindowFocused(): Promise<boolean> {
  try {
    return await getCurrentWindow().isFocused();
  } catch {
    return typeof document !== "undefined" && document.hasFocus();
  }
}

export type NotifyInput = {
  kind: NotificationKind;
  key: string;
  title: string;
  body?: string;
  target?: NotificationTarget;
};

export async function notify(input: NotifyInput): Promise<boolean> {
  if (!isNotificationAllowed(useNotificationPrefs.getState(), input.kind)) return false;
  if (await isWindowFocused()) return false;
  if (!shouldEmit(dedupeCache, input.key, Date.now())) return false;
  const status = useNotificationPermission.getState().status;
  if (status === "denied") return false;
  if (status === "unknown" && (await refreshNotificationPermission()) !== "granted") {
    return false;
  }
  try {
    sendNotification({
      title: input.title,
      body: input.body,
      extra: input.target ? { target: input.target } : undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export type CiRunSnapshot = {
  id: number | string;
  name: string;
  status: string;
  conclusion: string | null;
  branch?: string | null;
};

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "failed",
  "timed_out",
  "startup_failure",
  "action_required",
  "error",
]);

export function isFailedRun(run: Pick<CiRunSnapshot, "status" | "conclusion">): boolean {
  const key = (run.conclusion ?? run.status ?? "").toLowerCase();
  return FAILED_CONCLUSIONS.has(key);
}

export function newlyFailedRuns(
  previous: CiRunSnapshot[] | undefined,
  next: CiRunSnapshot[],
): CiRunSnapshot[] {
  if (!previous) return [];
  const before = new Map(previous.map((run) => [String(run.id), run]));
  return next.filter((run) => {
    if (!isFailedRun(run)) return false;
    const old = before.get(String(run.id));
    return !old || !isFailedRun(old);
  });
}

export type PrSnapshot = {
  number: number;
  title: string;
  reviewers: { login: string }[];
};

export type ReviewRequest = { number: number; title: string; login: string };

export function newReviewRequests(
  previous: PrSnapshot[] | undefined,
  next: PrSnapshot[],
): ReviewRequest[] {
  if (!previous) return [];
  const before = new Map(previous.map((pr) => [pr.number, pr]));
  const requests: ReviewRequest[] = [];
  for (const pr of next) {
    const old = before.get(pr.number);
    const known = new Set((old?.reviewers ?? []).map((reviewer) => reviewer.login));
    for (const reviewer of pr.reviewers) {
      if (known.has(reviewer.login)) continue;
      requests.push({ number: pr.number, title: pr.title, login: reviewer.login });
    }
  }
  return requests;
}

export type AgentThreadSnapshot = { activeTurn: boolean; pendingRequests: number };

export type AgentThreadEvent = {
  threadId: string;
  kind: "turnFinished" | "awaitingApproval";
};

export function agentThreadSnapshots(conversations: {
  [threadId: string]: { activeTurnId: string | null };
}, requestsByThread: Record<string, unknown[]>): Record<string, AgentThreadSnapshot> {
  const snapshots: Record<string, AgentThreadSnapshot> = {};
  for (const [threadId, conversation] of Object.entries(conversations)) {
    snapshots[threadId] = {
      activeTurn: Boolean(conversation.activeTurnId),
      pendingRequests: requestsByThread[threadId]?.length ?? 0,
    };
  }
  for (const [threadId, requests] of Object.entries(requestsByThread)) {
    if (snapshots[threadId]) continue;
    snapshots[threadId] = { activeTurn: false, pendingRequests: requests?.length ?? 0 };
  }
  return snapshots;
}

export function agentThreadEvents(
  previous: Record<string, AgentThreadSnapshot>,
  next: Record<string, AgentThreadSnapshot>,
): AgentThreadEvent[] {
  const events: AgentThreadEvent[] = [];
  for (const [threadId, snapshot] of Object.entries(next)) {
    const old = previous[threadId];
    if (!old) continue;
    if (snapshot.pendingRequests > old.pendingRequests) {
      events.push({ threadId, kind: "awaitingApproval" });
      continue;
    }
    if (old.activeTurn && !snapshot.activeTurn) {
      events.push({ threadId, kind: "turnFinished" });
    }
  }
  return events;
}

export function isLongRunningOp(
  startedAt: number | undefined,
  finishedAt: number,
  minMs = REMOTE_OP_MIN_DURATION_MS,
): boolean {
  if (startedAt === undefined) return false;
  return finishedAt - startedAt > minMs;
}

function repoName(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).pop() ?? path;
}

export async function notifyWorkflowRuns(
  path: string,
  previous: CiRunSnapshot[] | undefined,
  next: CiRunSnapshot[],
): Promise<void> {
  const failed = newlyFailedRuns(previous, next);
  if (!failed.length) return;
  const run = failed[0];
  await notify({
    kind: "ciFailed",
    key: `ci:${path}:${run.id}`,
    title: i18n.t("notifications.ciFailedTitle", { repo: repoName(path) }),
    body: i18n.t("notifications.ciFailedBody", {
      name: run.name,
      branch: run.branch ?? "",
      count: failed.length,
    }),
    target: { view: "ci", path },
  });
}

export async function notifyReviewRequests(
  path: string,
  previous: PrSnapshot[] | undefined,
  next: PrSnapshot[],
): Promise<void> {
  const requests = newReviewRequests(previous, next);
  if (!requests.length) return;
  const request = requests[0];
  await notify({
    kind: "reviewRequested",
    key: `review:${path}:${request.number}:${request.login}`,
    title: i18n.t("notifications.reviewRequestedTitle", { repo: repoName(path) }),
    body: i18n.t("notifications.reviewRequestedBody", {
      number: request.number,
      title: request.title,
      login: request.login,
    }),
    target: { view: "pr", path, number: request.number },
  });
}

const ciSnapshots = new Map<string, CiRunSnapshot[]>();
const prSnapshots = new Map<string, PrSnapshot[]>();

export function resetNotificationSnapshots(): void {
  ciSnapshots.clear();
  prSnapshots.clear();
}

export function trackWorkflowRuns(path: string, runs: CiRunSnapshot[]): void {
  const previous = ciSnapshots.get(path);
  ciSnapshots.set(path, runs);
  void notifyWorkflowRuns(path, previous, runs);
}

export function trackPullRequests(path: string, prs: PrSnapshot[]): void {
  const previous = prSnapshots.get(path);
  prSnapshots.set(path, prs);
  void notifyReviewRequests(path, previous, prs);
}

export async function notifyAgentEvent(
  provider: string,
  event: AgentThreadEvent,
  title: string,
): Promise<void> {
  const key = `agent:${provider}:${event.threadId}:${event.kind}`;
  await notify({
    kind: "agentTurn",
    key,
    title:
      event.kind === "awaitingApproval"
        ? i18n.t("notifications.agentApprovalTitle")
        : i18n.t("notifications.agentTurnTitle"),
    body:
      event.kind === "awaitingApproval"
        ? i18n.t("notifications.agentApprovalBody", { provider, title })
        : i18n.t("notifications.agentTurnBody", { provider, title }),
    target: { view: "agents", provider, threadId: event.threadId },
  });
}

export async function notifyRemoteOpDone(input: {
  opId: string;
  repoPath: string;
  op: string;
  ok: boolean;
  canceled: boolean;
  durationMs: number;
}): Promise<void> {
  if (input.canceled) return;
  const seconds = Math.round(input.durationMs / 1000);
  await notify({
    kind: "remoteOpDone",
    key: `remote:${input.repoPath}:${input.op}`,
    title: input.ok
      ? i18n.t("notifications.remoteDoneTitle", { op: input.op })
      : i18n.t("notifications.remoteFailedTitle", { op: input.op }),
    body: i18n.t("notifications.remoteDoneBody", {
      repo: repoName(input.repoPath),
      seconds,
    }),
    target: { view: "repo", path: input.repoPath },
  });
}
