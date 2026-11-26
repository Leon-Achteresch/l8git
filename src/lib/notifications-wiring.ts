import { invoke } from '@tauri-apps/api/core';
import type { PullRequest } from '@/lib/repo-store';
import { armTurnAttention } from "@/lib/agents/turn-attention";
import { armUsageLedger } from "@/lib/agents/usage-ledger";
import { toastError } from "@/lib/error-toast";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onAction, type ActiveNotification } from "@tauri-apps/plugin-notification";

import { chatStoreFor } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore, type NativeAgentProvider } from "@/lib/agents/provider-store";
import {
  agentThreadEvents,
  agentThreadSnapshots,
  isLongRunningOp,
  notifyAgentEvent,
  notifyRemoteOpDone,
  refreshNotificationPermission,
  type AgentThreadSnapshot,
  type NotificationTarget,
} from "@/lib/notifications";
import { useRemoteOps } from "@/lib/remote-ops";
import { useRepoStore } from "@/lib/repo-store";
import { router } from "@/lib/router";
import { useUiStore } from "@/lib/ui-store";

const PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "cursor", "opencode"];

function armAgentEvents(): () => void {
  const unsubscribes = PROVIDERS.map((provider) => {
    const store = chatStoreFor(provider);
    let previous: Record<string, AgentThreadSnapshot> = agentThreadSnapshots(
      store.getState().conversations,
      store.getState().requestsByThread,
    );
    return store.subscribe((state) => {
      const next = agentThreadSnapshots(state.conversations, state.requestsByThread);
      const events = agentThreadEvents(previous, next);
      previous = next;
      for (const event of events) {
        const title = state.conversations[event.threadId]?.title?.trim() ?? "";
        void notifyAgentEvent(provider, event, title);
      }
    });
  });
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

export function armRemoteActivityNotifications(): () => void {
  return useRemoteOps.subscribe((state, previous) => {
    if (state.history === previous.history) return;
    const result = state.history[0];
    if (!result || result.status === "canceled" || !isLongRunningOp(result.startedAt, result.finishedAt)) return;
    void notifyRemoteOpDone({
      opId: result.opId,
      repoPath: result.repoPath,
      op: result.op,
      ok: result.status === "success",
      canceled: false,
      durationMs: result.finishedAt - result.startedAt,
    });
  });
}

function focusMainWindow(): void {
  const window = getCurrentWindow();
  void window.unminimize().catch(() => {});
  void window.show().catch(() => {});
  void window.setFocus().catch(() => {});
}

export async function navigateToTarget(target: NotificationTarget): Promise<void> {
  if (target.view === "agents") {
    if (!PROVIDERS.includes(target.provider as NativeAgentProvider)) return;
    const provider = target.provider as NativeAgentProvider;
    const store = chatStoreFor(provider).getState();
    const thread = store.conversations[target.threadId];
    if (!thread?.path) throw new Error("Session is no longer available");
    useAgentProviderStore.getState().setProvider(provider);
    await store.openThread(thread.path, target.threadId);
    const repoStore = useRepoStore.getState();
    if (!repoStore.repos[thread.path]) await repoStore.addRepo(thread.path);
    if (!useRepoStore.getState().repos[thread.path]) throw new Error("Repository is unavailable");
    repoStore.setActive(thread.path);
    await router.navigate({ to: "/" });
    return;
  }
  const repoStore = useRepoStore.getState();
  if (!repoStore.repos[target.path]) await repoStore.addRepo(target.path);
  if (!useRepoStore.getState().repos[target.path]) throw new Error("Repository is unavailable");
  repoStore.setActive(target.path);
  if (target.view === "ci") useUiStore.getState().setSidebarTab("ci");
  if (target.view === "pr") {
    useUiStore.getState().setSidebarTab("pr");
    // A notification may point beyond the loaded history page.
    if (!useRepoStore.getState().prs[target.path]?.some(pr => pr.number === target.number)) {
      const pr = await invoke<PullRequest>('pr_detail', { path: target.path, number: target.number });
      useRepoStore.setState(state => ({ prs: { ...state.prs, [target.path]: [...(state.prs[target.path] ?? []).filter(row => row.number !== pr.number), pr] } }));
    }
    useUiStore.getState().requestPrFocus(target.path, target.number);
  }
  await router.navigate({ to: "/" });
}

function readTarget(notification: ActiveNotification | null): NotificationTarget | null {
  const extra = notification?.extra as { target?: NotificationTarget } | undefined;
  return extra?.target ?? null;
}

function armClickHandling(): () => void {
  let unlisten: (() => void) | undefined;
  void onAction((event) => {
    focusMainWindow();
    const target = readTarget(event.notification);
    if (target) void navigateToTarget(target).catch(error => toastError(String(error)));
  })
    .then((listener) => {
      unlisten = () => void listener.unregister().catch(() => {});
    })
    .catch(() => {});
  return () => unlisten?.();
}

let armed = false;

export function armNotifications(): () => void {
  if (armed) return () => {};
  armed = true;
  void refreshNotificationPermission();
  const disposers = [armAgentEvents(), armRemoteActivityNotifications(), armClickHandling(), armTurnAttention(), armUsageLedger()];
  return () => {
    armed = false;
    for (const dispose of disposers) dispose();
  };
}
