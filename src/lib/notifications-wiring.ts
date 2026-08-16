import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onAction, type Options } from "@tauri-apps/plugin-notification";

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
import { useRemoteOps, type GitProgressDone } from "@/lib/remote-ops";
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

function armRemoteOps(): () => void {
  const startedAt = new Map<string, number>();
  const unsubscribe = useRemoteOps.subscribe((state) => {
    for (const op of state.ops) {
      if (!startedAt.has(op.opId)) startedAt.set(op.opId, op.startedAt);
    }
  });
  let unlisten: (() => void) | undefined;
  void listen<GitProgressDone>("git-progress-done", (event) => {
    const payload = event.payload;
    const begun = startedAt.get(payload.opId);
    startedAt.delete(payload.opId);
    const finishedAt = Date.now();
    if (!isLongRunningOp(begun, finishedAt)) return;
    void notifyRemoteOpDone({
      opId: payload.opId,
      repoPath: payload.repoPath,
      op: payload.op,
      ok: payload.ok,
      canceled: payload.canceled,
      durationMs: finishedAt - (begun ?? finishedAt),
    });
  }).then((fn) => {
    unlisten = fn;
  });
  return () => {
    unsubscribe();
    unlisten?.();
  };
}

function focusMainWindow(): void {
  const window = getCurrentWindow();
  void window.unminimize().catch(() => {});
  void window.show().catch(() => {});
  void window.setFocus().catch(() => {});
}

function navigateToTarget(target: NotificationTarget): void {
  if (target.view === "agents") {
    useAgentProviderStore.getState().setProvider(target.provider as NativeAgentProvider);
    void router.navigate({ to: "/agents" });
    return;
  }
  useRepoStore.getState().setActive(target.path);
  if (target.view === "ci") useUiStore.getState().setSidebarTab("ci");
  if (target.view === "pr") useUiStore.getState().setSidebarTab("pr");
  void router.navigate({ to: "/" });
}

function readTarget(notification: Options): NotificationTarget | null {
  const extra = notification.extra as { target?: NotificationTarget } | undefined;
  return extra?.target ?? null;
}

function armClickHandling(): () => void {
  let unlisten: (() => void) | undefined;
  void onAction((notification) => {
    focusMainWindow();
    const target = readTarget(notification);
    if (target) navigateToTarget(target);
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
  const disposers = [armAgentEvents(), armRemoteOps(), armClickHandling()];
  return () => {
    armed = false;
    for (const dispose of disposers) dispose();
  };
}
