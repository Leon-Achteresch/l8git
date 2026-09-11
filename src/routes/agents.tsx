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
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { useAgentRepoPaths, useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import {
  approvalResult,
  questionAnswerResult,
  threadRows,
  transcriptEntries,
  usageLimits,
  usageSegments,
  type TranscriptEntry,
} from "@/lib/agents/agents-page";
import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentPendingRequest } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});

const EMPTY_REQUESTS: AgentPendingRequest[] = [];

function TranscriptRow({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm">{entry.text}</p>
      </div>
    );
  }
  if (entry.kind === "agent") return <p className="whitespace-pre-wrap text-sm">{entry.text}</p>;
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
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <AgentStatusChip tone={entry.running ? "working" : "idle"}>{entry.label}</AgentStatusChip>
      <span className="truncate font-mono text-xs">{entry.detail}</span>
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
    <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
      <p className="font-medium">{request.reason || `${request.kind} approval`}</p>
      {request.command && <p className="mt-1 font-mono text-xs text-muted-foreground">{request.command}</p>}
      {request.plan && <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{request.plan}</p>}
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
  const paths = useAgentRepoPaths();
  const storedPath = useAgentRepoStore(state => state.path);
  const setStoredPath = useAgentRepoStore(state => state.setPath);
  const path = storedPath && paths.includes(storedPath) ? storedPath : (paths[0] ?? "");

  const connectionStatus = useAgentChatStore(state => state.connectionStatus);
  const connectionError = useAgentChatStore(state => state.connectionError);
  const requiresAuth = useAgentChatStore(state => state.requiresAuth);
  const threadsByPath = useAgentChatStore(state => state.threadsByPath);
  const conversations = useAgentChatStore(state => state.conversations);
  const requestsByThread = useAgentChatStore(state => state.requestsByThread);
  const rateLimits = useAgentChatStore(state => state.rateLimits);
  const models = useAgentChatStore(state => state.models);
  const account = useAgentChatStore(state => state.account);

  const [threadId, setThreadId] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const release = useAgentChatStore.getState().retainSurface();
    void useAgentChatStore.getState().connect().catch(() => {});
    return release;
  }, [provider]);

  useEffect(() => {
    if (paths.length === 0) return;
    void useAgentChatStore.getState().loadThreads(paths).catch(() => {});
  }, [paths, provider]);

  useEffect(() => {
    setThreadId(null);
  }, [provider]);

  useEffect(() => {
    useAgentChatStore.getState().setVisibleThread(threadId);
  }, [threadId]);

  const rows = useMemo(
    () => threadRows(threadsByPath, conversations, requestsByThread, { paths }),
    [conversations, paths, requestsByThread, threadsByPath],
  );
  const conversation = threadId ? conversations[threadId] : undefined;
  const entries = useMemo(() => transcriptEntries(conversation?.turns ?? []), [conversation?.turns]);
  const requests = (threadId && requestsByThread[threadId]) || EMPTY_REQUESTS;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [entries.length, requests.length]);

  const composerModels: ComposerModel[] = useMemo(
    () =>
      models.length > 0
        ? models.map(model => ({
            id: model.id,
            label: model.label,
            efforts: model.reasoningEfforts.map(effort => effort.label),
          }))
        : [{ id: "default", label: conversation?.model || "Default model" }],
    [conversation?.model, models],
  );

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
    setThreadId(row.id);
    setStoredPath(row.path);
    void run(() => useAgentChatStore.getState().openThread(row.path, row.id));
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
    const store = useAgentChatStore.getState();
    if (modelId !== "default" && modelId !== store.model) store.setModel(modelId);
    const chosen = models.find(model => model.id === modelId);
    const mapped = chosen?.reasoningEfforts.find(item => item.label === effort)?.value;
    if (mapped) store.setReasoningEffort(mapped);
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
      const active = useAgentChatStore.getState().activeThreadByPath[path];
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

  return (
    <div className="flex h-full min-h-0 overflow-hidden" data-agent-chat>
      <AgentsSidebar threads={rows} selectedId={threadId} onSelect={select} onNewThread={newThread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-sm">
          {AGENT_PROVIDERS.map(entry => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setProvider(entry.value)}
              className={cn(
                "rounded-lg px-2 py-1 text-xs",
                entry.value === provider ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {entry.label}
            </button>
          ))}
          <AgentStatusChip
            className="ml-auto"
            tone={connectionStatus === "ready" ? (running ? "working" : "ready") : connectionStatus === "error" ? "error" : "waiting"}
          >
            {connectionStatus === "ready" ? (running ? "Working" : "Ready") : connectionStatus}
          </AgentStatusChip>
          {account?.email && <span className="text-xs text-muted-foreground">{account.email}</span>}
        </header>

        <div ref={scroller} className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-6">
          {connectionError && (
            <p className="w-full max-w-2xl rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {connectionError}
            </p>
          )}
          {requiresAuth && (
            <Button size="sm" onClick={() => void run(() => useAgentChatStore.getState().startLogin())}>
              Sign in
            </Button>
          )}
          {conversation && (
            <AgentsEnter className="w-full max-w-3xl" y={8}>
              <p className="text-xs text-muted-foreground">{conversation.path}</p>
              <h1 className="mt-1 text-lg font-medium">{conversation.title || "Untitled thread"}</h1>
            </AgentsEnter>
          )}
          <div className="flex w-full max-w-3xl flex-col gap-3">
            {entries.map(entry => (
              <TranscriptRow key={entry.key} entry={entry} />
            ))}
          </div>
          {conversation?.error && (
            <p className="w-full max-w-3xl text-sm text-destructive" role="alert">{conversation.error}</p>
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
              planLabel={account?.planType ?? undefined}
              limits={limits}
            />
          )}
        </div>

        <div className="flex shrink-0 justify-center px-6 pb-6" data-agent-composer>
          <AgentComposer
            key={composerKey}
            placeholder={running ? "Steer the running turn…" : "Hi, what do you need today?"}
            context={{ project: path.split("/").pop(), usedPercent: usage?.modelContextWindow ? Math.round((usage.totalTokens / usage.modelContextWindow) * 100) : undefined }}
            models={composerModels}
            permissions={DEFAULT_PERMISSIONS}
            className="w-full max-w-2xl"
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
