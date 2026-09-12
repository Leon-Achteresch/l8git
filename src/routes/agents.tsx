import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AgentsSidebar, type SidebarThread } from "@/components/agents/sidebar/agents-sidebar";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { AgentComposer, DEFAULT_PERMISSIONS, type ComposerModel } from "@/components/agents/composer";
import { AgentContextUsage, CONTEXT_SEGMENT_COLORS } from "@/components/agents/ui/agent-context-usage";
import { AgentStepsCard } from "@/components/agents/ui/agent-steps-card";
import { AgentQuestionCard } from "@/components/agents/ui/agent-question-card";
import { AgentStatusChip } from "@/components/agents/ui/agent-status-chip";
import { AgentThinkingBlock } from "@/components/agents/ui/agent-thinking";
import { Button } from "@/components/ui/button";
import { useStore } from "zustand";

import { chatStoreFor, useAgentChatStore, useProviderChatStore } from "@/lib/agents/active-chat-store";
import { openCodeChatStore } from "@/lib/agents/providers/opencode/chat-store";
import { useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import {
  approvalResult,
  questionAnswerResult,
  splitComposerModelId,
  threadRows,
  transcriptEntries,
  usageLimits,
  usageSegments,
  type TranscriptEntry,
} from "@/lib/agents/agents-page";
import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import { loadModelCatalog } from "@/lib/agents/model-catalog";
import { useAgentProviderStore, type NativeAgentProvider } from "@/lib/agents/provider-store";
import { estimateCost } from "@/lib/agents/token-cost";
import type { AgentPendingRequest } from "@/lib/agents/types";
import { useRepoStore } from "@/lib/repo-store";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});

const EMPTY_REQUESTS: AgentPendingRequest[] = [];

const COMPOSER_PROVIDERS = AGENT_PROVIDERS.map(entry => ({
  id: entry.value as string,
  label: entry.label,
  Icon: entry.Logo,
}));

function useProviderRows(provider: NativeAgentProvider, path: string) {
  const threadsByPath = useProviderChatStore(provider, state => state.threadsByPath);
  const conversations = useProviderChatStore(provider, state => state.conversations);
  const requestsByThread = useProviderChatStore(provider, state => state.requestsByThread);
  return useMemo(
    () =>
      path ? threadRows(threadsByPath, conversations, requestsByThread, { paths: [path], provider }) : [],
    [conversations, path, provider, requestsByThread, threadsByPath],
  );
}

function useProviderModels(provider: NativeAgentProvider) {
  const live = useProviderChatStore(provider, state => state.models);
  return useMemo(() => (live.length > 0 ? live : loadModelCatalog(provider)), [live, provider]);
}

function TranscriptRow({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl bg-muted px-3 py-2 text-sm">{entry.text}</p>
      </div>
    );
  }
  if (entry.kind === "agent") return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">{entry.text}</p>;
  if (entry.kind === "reasoning") {
    return <AgentThinkingBlock text={entry.text} redacted={entry.redacted} completed={entry.completed} />;
  }
  if (entry.kind === "plan") {
    return (
      <AgentStepsCard
        steps={entry.steps.map(step => ({
          id: step.id,
          label: step.label,
          status: step.status === "completed" ? "done" : step.status === "inProgress" ? "active" : "pending",
        }))}
      />
    );
  }
  if (entry.kind === "error") {
    return <p className="text-sm text-destructive" role="alert">{entry.text}</p>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <AgentStatusChip tone={entry.running ? "working" : "idle"}>{entry.label}</AgentStatusChip>
      <span className="min-w-0 truncate font-mono text-xs">{entry.detail}</span>
    </div>
  );
}

function PendingRequestCard({
  request,
  onAnswer,
  onDecide,
}: {
  request: AgentPendingRequest;
  onAnswer: (request: AgentPendingRequest, index: number, answers: string[]) => void;
  onDecide: (request: AgentPendingRequest, approved: boolean) => void;
}) {
  const question = request.questions?.[0];
  if (question) {
    return (
      <AgentQuestionCard
        header={question.header}
        question={question.question}
        options={question.options}
        multiSelect={question.multiSelect}
        onSubmit={answers => onAnswer(request, 0, answers)}
      />
    );
  }
  return (
    <div className="w-full max-w-5xl rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
      <p className="font-medium">{request.reason || `${request.kind} approval`}</p>
      {request.command && <p className="mt-1 font-mono text-xs text-muted-foreground">{request.command}</p>}
      {request.plan && <p className="mt-2 max-h-60 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words text-muted-foreground">{request.plan}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => onDecide(request, true)}>Approve</Button>
        <Button size="sm" variant="outline" onClick={() => onDecide(request, false)}>Reject</Button>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const provider = useAgentProviderStore(state => state.provider);
  const setProvider = useAgentProviderStore(state => state.setProvider);
  const activePath = useRepoStore(state => state.activePath);
  const setStoredPath = useAgentRepoStore(state => state.setPath);
  const path = activePath ?? "";

  const connectionStatus = useAgentChatStore(state => state.connectionStatus);
  const connectionError = useAgentChatStore(state => state.connectionError);
  const requiresAuth = useAgentChatStore(state => state.requiresAuth);
  const conversations = useAgentChatStore(state => state.conversations);
  const requestsByThread = useAgentChatStore(state => state.requestsByThread);
  const rateLimits = useAgentChatStore(state => state.rateLimits);
  const account = useAgentChatStore(state => state.account);

  const codexRows = useProviderRows("codex", path);
  const claudeRows = useProviderRows("claude", path);
  const openCodeRows = useProviderRows("opencode", path);
  const cursorRows = useProviderRows("cursor", path);
  const codexModels = useProviderModels("codex");
  const claudeModels = useProviderModels("claude");
  const openCodeModels = useProviderModels("opencode");
  const cursorModels = useProviderModels("cursor");

  const configSelections = useStore(openCodeChatStore, state => state.configSelections);

  const [composerModelId, setComposerModelId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const releases = AGENT_PROVIDERS.map(entry => {
      const store = chatStoreFor(entry.value).getState();
      const release = store.retainSurface();
      void store.connect().catch(() => {});
      return release;
    });
    return () => releases.forEach(release => release());
  }, []);

  useEffect(() => {
    if (!path) return;
    setStoredPath(path);
    for (const entry of AGENT_PROVIDERS) {
      void chatStoreFor(entry.value).getState().loadThreads([path]).catch(() => {});
    }
  }, [path, setStoredPath]);

  useEffect(() => {
    setThreadId(null);
  }, [path]);

  useEffect(() => {
    useAgentChatStore.getState().setVisibleThread(threadId);
  }, [threadId, provider]);

  const rows = useMemo(
    () =>
      [...codexRows, ...claudeRows, ...openCodeRows, ...cursorRows].sort(
        (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.updatedAt - a.updatedAt,
      ),
    [claudeRows, codexRows, cursorRows, openCodeRows],
  );
  const sidebarThreads: SidebarThread[] = useMemo(
    () =>
      rows.map(row => ({
        id: row.id,
        title: row.title,
        group: row.group,
        age: row.age,
        status: row.status,
        agent: (() => {
          const meta = AGENT_PROVIDERS.find(entry => entry.value === row.provider);
          return { label: meta?.label ?? row.provider, Icon: meta?.Logo };
        })(),
        pinned: row.pinned,
      })),
    [rows],
  );
  const conversation = threadId ? conversations[threadId] : undefined;
  const entries = useMemo(() => transcriptEntries(conversation?.turns ?? []), [conversation?.turns]);
  const requests = (threadId && requestsByThread[threadId]) || EMPTY_REQUESTS;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [entries.length, requests.length]);

  const composerModels: ComposerModel[] = useMemo(() => {
    const byProvider: Array<[NativeAgentProvider, typeof codexModels]> = [
      ["codex", codexModels],
      ["claude", claudeModels],
      ["opencode", openCodeModels],
      ["cursor", cursorModels],
    ];
    const all = byProvider.flatMap(([id, list]) =>
      list.map(model => ({
        id: `${id}:${model.id}`,
        label: model.label,
        providerId: id as string,
        hint: model.description || undefined,
        efforts: model.reasoningEfforts.map(effort => effort.label),
      })),
    );
    if (all.length === 0) {
      return [{ id: `${provider}:default`, label: conversation?.model || "Default model", providerId: provider }];
    }
    return all.sort(
      (a, b) =>
        Number(b.providerId === provider) - Number(a.providerId === provider) ||
        a.label.localeCompare(b.label),
    );
  }, [claudeModels, codexModels, conversation?.model, cursorModels, openCodeModels, provider]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const select = (thread: SidebarThread) => {
    const row = rows.find(candidate => candidate.id === thread.id);
    if (!row) return;
    setProvider(row.provider);
    setThreadId(row.id);
    setStoredPath(row.path);
    void run(() => chatStoreFor(row.provider).getState().openThread(row.path, row.id));
  };

  const newThread = () => {
    setThreadId(null);
    setComposerKey(key => key + 1);
  };

  const submit = (text: string, modelId: string, effort: string | undefined, permissionId: string) => {
    if (!path) {
      toast.error("Open a repository first.");
      return;
    }
    const { provider: target, model } = splitComposerModelId(modelId, provider);
    if (target !== provider) setProvider(target);
    const store = chatStoreFor(target).getState();
    if (model !== "default" && model !== store.model) store.setModel(model);
    const chosen = store.models.find(entry => entry.id === model);
    const mapped = chosen?.reasoningEfforts.find(item => item.label === effort)?.value;
    if (mapped !== undefined) store.setReasoningEffort(mapped);
    if (permissionId === "plan") store.setCollaborationMode("plan");
    else if (permissionId === "manual") store.setApprovalPolicy("untrusted");
    else if (permissionId === "bypass") store.setApprovalPolicy("never");
    else store.setApprovalPolicy("on-request");

    void run(async () => {
      if (threadId && conversation?.activeTurnId) {
        await store.steerMessage(threadId, text);
        return;
      }
      if (!threadId && store.activeThreadByPath[path]) await store.createThread(path);
      await store.sendMessage(path, text);
      const active = chatStoreFor(target).getState().activeThreadByPath[path];
      if (active) setThreadId(active);
    });
  };

  const decide = (request: AgentPendingRequest, approved: boolean) =>
    void run(() => useAgentChatStore.getState().respondToRequest(request, approvalResult(provider, approved)));

  const answer = (request: AgentPendingRequest, index: number, answers: string[]) =>
    void run(() => useAgentChatStore.getState().respondToRequest(request, questionAnswerResult(index, answers)));

  const usage = conversation?.tokenUsage;
  const segments = usageSegments(usage).map((segment, index) => ({
    ...segment,
    color: CONTEXT_SEGMENT_COLORS[index % CONTEXT_SEGMENT_COLORS.length],
  }));
  const limits = usageLimits(rateLimits);
  const running = Boolean(conversation?.activeTurnId);
  const composerProvider = splitComposerModelId(composerModelId ?? "", provider).provider;
  const composerOptions =
    composerProvider === "opencode"
      ? configSelections.map(selection => ({
          id: selection.id,
          name: selection.name,
          description: selection.description,
          type: selection.type,
          value: selection.value,
          choices: selection.choices,
        }))
      : [];
  const cost = estimateCost(usage, conversation?.model);
  const usedPercent = usage?.modelContextWindow
    ? Math.round((usage.totalTokens / usage.modelContextWindow) * 100)
    : undefined;

  return (
    <div className="flex h-full min-h-0 overflow-hidden" data-agent-chat>
      <AgentsSidebar threads={sidebarThreads} selectedId={threadId} onSelect={select} onNewThread={newThread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-sm">
          <span className="truncate font-medium">{path ? path.split("/").pop() : "No repository"}</span>
          <span className="truncate text-xs text-muted-foreground">{rows.length} threads</span>
          <AgentStatusChip
            className="ml-auto"
            tone={connectionStatus === "ready" ? (running ? "working" : "ready") : connectionStatus === "error" ? "error" : "waiting"}
          >
            {connectionStatus === "ready" ? (running ? "Working" : "Ready") : connectionStatus}
          </AgentStatusChip>
          {account?.email && <span className="text-xs text-muted-foreground">{account.email}</span>}
        </header>

        <div ref={scroller} className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto overflow-x-hidden p-6">
          {connectionError && (
            <p className="w-full max-w-5xl rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {connectionError}
            </p>
          )}
          {requiresAuth && (
            <Button size="sm" onClick={() => void run(() => useAgentChatStore.getState().startLogin())}>
              Sign in
            </Button>
          )}
          {conversation && (
            <AgentsEnter className="w-full max-w-5xl" y={8}>
              <p className="text-xs text-muted-foreground">{conversation.path}</p>
              <h1 className="mt-1 text-lg font-medium">{conversation.title || "Untitled thread"}</h1>
            </AgentsEnter>
          )}
          <div className="flex w-full min-w-0 max-w-5xl flex-col gap-3">
            {entries.map(entry => (
              <TranscriptRow key={entry.key} entry={entry} />
            ))}
          </div>
          {conversation?.error && (
            <p className="w-full max-w-5xl break-words text-sm text-destructive" role="alert">{conversation.error}</p>
          )}
          {requests.map(request => (
            <PendingRequestCard
              key={`${request.sessionId}:${String(request.requestId)}`}
              request={request}
              onAnswer={answer}
              onDecide={decide}
            />
          ))}
          {!conversation && entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? "No agent threads yet — send a message to start one." : "Select a thread or start a new one."}
            </p>
          )}
          {usage && (
            <AgentContextUsage
              used={usage.totalTokens}
              total={usage.modelContextWindow ?? 0}
              measured={Boolean(usage.modelContextWindow)}
              segments={segments}
              costUsd={cost?.totalUsd}
              planLabel={account?.planType ?? undefined}
              limits={limits}
            />
          )}
        </div>

        <div className="flex shrink-0 justify-center px-6 pb-6" data-agent-composer>
          <AgentComposer
            key={composerKey}
            placeholder={running ? "Steer the running turn…" : "Hi, what do you need today?"}
            context={{
              project: path.split("/").pop(),
              usedPercent,
              usedTokens: usage?.totalTokens,
              totalTokens: usage?.modelContextWindow ?? undefined,
              costUsd: cost?.totalUsd,
            }}
            models={composerModels}
            providers={COMPOSER_PROVIDERS}
            options={composerOptions}
            optionsLabel="Variants"
            onOptionChange={(id, value) => openCodeChatStore.getState().setConfigSelection(id, value)}
            onModelChange={setComposerModelId}
            permissions={DEFAULT_PERMISSIONS}
            className="w-full max-w-3xl"
            onSubmit={value => !busy && submit(value.text, value.modelId, value.effort, value.permissionId)}
          />
          {running && (
            <Button
              size="sm"
              variant="outline"
              className="ml-2 self-end"
              onClick={() => threadId && void run(() => useAgentChatStore.getState().interrupt(threadId))}
            >
              Stop
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
