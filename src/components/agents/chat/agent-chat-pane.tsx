import { open as openFile } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertCircle,
  AppWindow,
  Blocks,
  File,
  FileImage,
  Folder,
  GitPullRequestArrow,
  LoaderCircle,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { AgentAccountMenu } from "@/components/agents/chat/agent-account-menu";
import { AgentInlineTitle } from "@/components/agents/chat/agent-inline-title";
import { AgentRequestCard } from "@/components/agents/chat/agent-request-card";
import { AgentSettingsMenu } from "@/components/agents/chat/agent-settings-menu";
import { AgentThreadMenu } from "@/components/agents/chat/agent-thread-menu";
import {
  PromptInput,
  type PromptAction,
  type PromptModel,
  type PromptSlashCommand,
} from "@/components/agents/ui/prompt-input";
import { ClaudeCodeLogo, CodexLogo } from "@/components/brand/agent-logos";
import { Button } from "@/components/ui/button";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { codexReasoningEffortLabel } from "@/lib/agents/codex-labels";
import {
  agentComposerDraftKey,
  loadAgentComposerDraft,
  saveAgentComposerDraft,
} from "@/lib/agents/composer-drafts";
import type { AgentAttachment } from "@/lib/agents/types";
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { useAgentRealtimeVoice } from "@/lib/agents/use-realtime-voice";

const AgentFilePicker = lazy(() => import("@/components/agents/chat/agent-file-picker").then(
  (module) => ({ default: module.AgentFilePicker }),
));
const AgentFeedbackDialog = lazy(() => import("@/components/agents/chat/agent-feedback-dialog").then(
  (module) => ({ default: module.AgentFeedbackDialog }),
));
const AgentImportDialog = lazy(() => import("@/components/agents/chat/agent-import-dialog").then(
  (module) => ({ default: module.AgentImportDialog }),
));
const AgentResourcePicker = lazy(() => import("@/components/agents/chat/agent-resource-picker").then(
  (module) => ({ default: module.AgentResourcePicker }),
));
const AgentTurnView = lazy(() => import("@/components/agents/chat/agent-item").then(
  (module) => ({ default: module.AgentTurnView }),
));

function repoName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const INITIAL_VISIBLE_TURNS = 32;
const TURN_PAGE_SIZE = 32;

const AgentConversationViewport = memo(function AgentConversationViewport({
  path,
  threadId,
  onStarter,
  scrollToBottomSignal,
}: {
  path: string;
  threadId: string | null;
  onStarter: (text: string) => void;
  scrollToBottomSignal: number;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const isClaude = provider === "claude";
  const ProviderLogo = isClaude ? ClaudeCodeLogo : CodexLogo;
  const conversation = useAgentChatStore((state) =>
    threadId ? state.conversations[threadId] : undefined,
  );
  const requests = useAgentChatStore(
    useShallow((state) => [
      ...(threadId ? (state.requestsByThread[threadId] ?? []) : []),
      ...(state.requestsByThread.__global ?? []),
    ]),
  );
  const connectionStatus = useAgentChatStore((state) => state.connectionStatus);
  const connectionError = useAgentChatStore((state) => state.connectionError);
  const requiresAuth = useAgentChatStore((state) => state.requiresAuth);
  const loginStatus = useAgentChatStore((state) => state.loginStatus);
  const loginError = useAgentChatStore((state) => state.loginError);
  const connect = useAgentChatStore((state) => state.connect);
  const loadThreads = useAgentChatStore((state) => state.loadThreads);
  const openThread = useAgentChatStore((state) => state.openThread);
  const startLogin = useAgentChatStore((state) => state.startLogin);
  const clearError = useAgentChatStore((state) => state.clearError);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreBottomOffset = useRef<number | null>(null);
  const [visibleTurnCount, setVisibleTurnCount] = useState(INITIAL_VISIBLE_TURNS);
  const turns = conversation?.turns ?? [];
  const hiddenTurnCount = Math.max(0, turns.length - visibleTurnCount);
  const visibleTurns = hiddenTurnCount > 0 ? turns.slice(-visibleTurnCount) : turns;
  const busy = Boolean(conversation?.activeTurnId);
  const starters = useMemo(() => [
    t("agentChat.starterAnalyze"),
    t("agentChat.starterImplement"),
    t("agentChat.starterReview"),
  ], [t]);

  useEffect(() => {
    stickToBottom.current = true;
    restoreBottomOffset.current = null;
    setVisibleTurnCount(INITIAL_VISIBLE_TURNS);
  }, [threadId]);

  useLayoutEffect(() => {
    if (scrollToBottomSignal === 0) return;
    const viewport = scrollRef.current;
    stickToBottom.current = true;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [scrollToBottomSignal]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    const bottomOffset = restoreBottomOffset.current;
    if (!viewport || bottomOffset === null) return;
    viewport.scrollTop = viewport.scrollHeight - bottomOffset;
    restoreBottomOffset.current = null;
  }, [visibleTurnCount]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || !stickToBottom.current) return;
    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [requests.length, busy, threadId]);

  useEffect(() => {
    const content = contentRef.current;
    const viewport = scrollRef.current;
    if (!content || !viewport || typeof ResizeObserver === "undefined") return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!stickToBottom.current || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        viewport.scrollTop = viewport.scrollHeight;
      });
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [threadId]);

  const login = async () => {
    try {
      const url = await startLogin();
      if (url) await openUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const node = event.currentTarget;
        stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-6 sm:px-8">
        {conversation?.loading || (!threadId && connectionStatus === "connecting") ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t("agentChat.connecting")}
          </div>
        ) : !threadId && connectionError && connectionStatus === "error" ? (
          <div className="m-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium">{t("agentChat.startErrorTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{connectionError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-lg"
                  onClick={() => void connect().then(() => loadThreads([path])).catch(() => {})}
                >
                  {t("agentChat.retry")}
                </Button>
              </div>
            </div>
          </div>
        ) : requiresAuth ? (
          <div className="m-auto max-w-md rounded-xl border border-border/60 bg-muted/45 p-5 text-center">
            <ProviderLogo className="mx-auto size-6" />
            <p className="mt-3 text-sm font-medium">{isClaude ? "Claude Code is not signed in" : t("agentChat.loginTitle")}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {isClaude ? "Sign in with your Anthropic account in the browser. l8git keeps using the installed Claude Code CLI." : t("agentChat.loginDescription")}
            </p>
            {loginError ? (
              <p className="mt-2 text-xs text-destructive">
                {t("agentChat.loginFailed")}: {loginError}
              </p>
            ) : null}
            <Button
              type="button"
              className="mt-4 rounded-lg"
              onClick={() => void login()}
              disabled={loginStatus === "starting" || loginStatus === "waiting"}
            >
              {loginStatus === "starting" || loginStatus === "waiting" ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : null}
              {loginStatus === "waiting"
                ? t("agentChat.loginWaiting")
                : isClaude ? "Sign in to Claude Code" : t("agentChat.loginAction")}
            </Button>
          </div>
        ) : !conversation || turns.length === 0 ? (
          <div className="my-auto flex flex-col items-center py-12 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-foreground/[0.06] ring-1 ring-border/40">
              <ProviderLogo className="size-5" />
            </span>
            <h2 className="mt-4 text-[15px] font-semibold tracking-tight">{t("agentChat.emptyTitle")}</h2>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              {t("agentChat.emptyDescription", { repo: repoName(path) })}
            </p>
            <div className="mt-5 grid w-full max-w-lg gap-2">
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => onStarter(starter)}
                  className="rounded-xl border border-border/55 bg-card/50 px-3 py-2.5 text-left text-xs leading-5 text-foreground/85 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {hiddenTurnCount > 0 ? (
              <div className="flex justify-center pb-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs text-muted-foreground"
                  onClick={() => {
                    const viewport = scrollRef.current;
                    if (viewport) {
                      restoreBottomOffset.current = viewport.scrollHeight - viewport.scrollTop;
                      stickToBottom.current = false;
                    }
                    setVisibleTurnCount((count) => count + TURN_PAGE_SIZE);
                  }}
                >
                  {t("agentChat.showOlder", { count: Math.min(TURN_PAGE_SIZE, hiddenTurnCount) })}
                </Button>
              </div>
            ) : null}
            <Suspense fallback={<div className="h-16 animate-pulse rounded-xl bg-foreground/[0.025]" />}>
              {visibleTurns.map((turn) => (
                <div
                  key={turn.id}
                  className="[contain-intrinsic-size:auto_320px] [content-visibility:auto]"
                >
                  <AgentTurnView turn={turn} />
                </div>
              ))}
            </Suspense>
          </div>
        )}

        {requests.length > 0 ? (
          <div className="mt-5 space-y-3">
            {requests.map((request) => (
              <AgentRequestCard
                key={`${request.sessionId}:${String(request.requestId)}`}
                request={request}
              />
            ))}
          </div>
        ) : null}

        {conversation?.error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{conversation.error}</span>
            <button
              type="button"
              onClick={() => void openThread(path, conversation.threadId)}
              className="rounded px-1.5 py-0.5 font-medium hover:bg-destructive/10"
            >
              {t("agentChat.retry")}
            </button>
            <button
              type="button"
              onClick={() => clearError(conversation.threadId)}
              aria-label={t("agentChat.dismissError")}
              className="rounded p-0.5 hover:bg-destructive/10"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export const AgentChatPane = memo(function AgentChatPane({
  path,
  threadId,
  terminalVisible = false,
  onToggleTerminal,
  onOpenCapabilities,
}: {
  path: string;
  threadId: string | null;
  terminalVisible?: boolean;
  onToggleTerminal?: () => void;
  onOpenCapabilities?: (section?: AgentCapabilitySection) => void;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const isClaude = provider === "claude";
  const ProviderLogo = isClaude ? ClaudeCodeLogo : CodexLogo;
  const providerLabel = isClaude ? "Claude Code" : "Codex";
  const connectionStatus = useAgentChatStore((state) => state.connectionStatus);
  const requiresAuth = useAgentChatStore((state) => state.requiresAuth);
  const loginStatus = useAgentChatStore((state) => state.loginStatus);
  const account = useAgentChatStore((state) => state.account);
  const models = useAgentChatStore((state) => state.models);
  const model = useAgentChatStore((state) => state.model);
  const sessionStatus = useAgentChatStore((state) =>
    threadId ? (state.sessionStatusByThread[threadId] ?? "idle") : "idle",
  );
  const conversationMeta = useAgentChatStore(
    useShallow((state) => {
      const conversation = threadId ? state.conversations[threadId] : undefined;
      return {
        exists: Boolean(conversation),
        title: conversation?.title ?? "",
        activeTurnId: conversation?.activeTurnId ?? null,
        goalObjective: conversation?.goal?.objective ?? null,
      };
    }),
  );
  const setModel = useAgentChatStore((state) => state.setModel);
  const setReasoningEffort = useAgentChatStore((state) => state.setReasoningEffort);
  const sendMessage = useAgentChatStore((state) => state.sendMessage);
  const interrupt = useAgentChatStore((state) => state.interrupt);
  const createThread = useAgentChatStore((state) => state.createThread);
  const startReview = useAgentChatStore((state) => state.startReview);
  const archiveThread = useAgentChatStore((state) => state.archiveThread);
  const deleteThread = useAgentChatStore((state) => state.deleteThread);
  const compactThread = useAgentChatStore((state) => state.compactThread);
  const forkThread = useAgentChatStore((state) => state.forkThread);
  const setGoal = useAgentChatStore((state) => state.setGoal);
  const clearGoal = useAgentChatStore((state) => state.clearGoal);
  const setMemoryMode = useAgentChatStore((state) => state.setMemoryMode);
  const resetMemory = useAgentChatStore((state) => state.resetMemory);
  const listBackgroundTerminals = useAgentChatStore((state) => state.listBackgroundTerminals);
  const listMcpServers = useAgentChatStore((state) => state.listMcpServers);
  const loginMcpServer = useAgentChatStore((state) => state.loginMcpServer);
  const stopBackgroundTerminals = useAgentChatStore((state) => state.stopBackgroundTerminals);
  const setCollaborationMode = useAgentChatStore((state) => state.setCollaborationMode);
  const serviceTier = useAgentChatStore((state) => state.serviceTier);
  const realtimeVoice = useAgentChatStore((state) => state.realtimeVoice);
  const setServiceTier = useAgentChatStore((state) => state.setServiceTier);
  const setPersonality = useAgentChatStore((state) => state.setPersonality);
  const permissionProfiles = useAgentChatStore((state) => state.permissionProfiles);
  const setPermissionProfile = useAgentChatStore((state) => state.setPermissionProfile);
  const realtimeVoices = useAgentChatStore((state) => state.realtimeVoices);
  const setRealtimeVoice = useAgentChatStore((state) => state.setRealtimeVoice);
  const logout = useAgentChatStore((state) => state.logout);
  const refreshAccount = useAgentChatStore((state) => state.refreshAccount);
  const composerDraftKey = agentComposerDraftKey(`${provider}:${path}`, threadId);
  const initialDraft = useMemo(() => loadAgentComposerDraft(composerDraftKey), [composerDraftKey]);
  const [draft, setDraft] = useState(initialDraft.text);
  const [attachments, setAttachments] = useState<AgentAttachment[]>(initialDraft.attachments);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [resourcePicker, setResourcePicker] = useState<"skill" | "app" | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [scrollToBottomSignal, setScrollToBottomSignal] = useState(0);

  const busy = Boolean(conversationMeta.activeTurnId);
  const realtime = useAgentRealtimeVoice({ threadId, path, voice: realtimeVoice });

  useEffect(() => {
    if (!isClaude || loginStatus !== "waiting") return;
    const timer = window.setInterval(() => void refreshAccount().catch(() => {}), 2_000);
    return () => window.clearInterval(timer);
  }, [isClaude, loginStatus, refreshAccount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveAgentComposerDraft(composerDraftKey, { text: draft, attachments });
    }, 250);
    return () => clearTimeout(timer);
  }, [attachments, composerDraftKey, draft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || !threadId) return;
      event.preventDefault();
      setRenamingTitle(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [threadId]);

  const promptModels = useMemo<PromptModel[]>(
    () =>
      models.map((option) => ({
        value: option.id,
        label: option.label,
        icon: <ProviderLogo className="size-3.5" />,
      })),
    [ProviderLogo, models],
  );

  const actions = useMemo<PromptAction[]>(
    () => [
      {
        value: "image",
        label: t("agentChat.attachImage"),
        description: t("agentChat.attachImageTypes"),
        icon: <Paperclip className="size-4" />,
      },
      {
        value: "mention",
        label: "Mention repository file",
        description: `Fast repository search for ${providerLabel}`,
        icon: <File className="size-4" />,
      },
      {
        value: "browse",
        label: "Browse any file",
        description: "Attach a file outside the repository",
        icon: <Paperclip className="size-4" />,
      },
      {
        value: "folder",
        label: "Mention folder",
        description: "Attach a directory to the turn",
        icon: <Folder className="size-4" />,
      },
      {
        value: "audio",
        label: "Attach audio",
        description: "Add a voice note or audio file",
        icon: <Mic className="size-4" />,
      },
      {
        value: "skill",
        label: "Use skill",
        description: `Attach an enabled ${providerLabel} skill`,
        icon: <Sparkles className="size-4" />,
      },
      {
        value: "app",
        label: "Use app",
        description: "Mention a ChatGPT app/connector",
        icon: <AppWindow className="size-4" />,
      },
      {
        value: "review",
        label: t("agentChat.reviewChanges"),
        description: t("agentChat.reviewDescription"),
        icon: <GitPullRequestArrow className="size-4" />,
        disabled: !threadId || busy,
      },
    ].filter((action) => !isClaude || action.value !== "app"),
    [busy, isClaude, providerLabel, t, threadId],
  );

  const appendPathAttachments = (
    paths: string[],
    type: AgentAttachment["type"],
  ) => {
    setAttachments((current) => {
      const known = new Set(current.map((item) => `${item.type}:${item.path}`));
      return [
        ...current,
        ...paths
          .filter((itemPath) => !known.has(`${type}:${itemPath}`))
          .map((itemPath) => ({
            type,
            path: itemPath,
            name: itemPath.split(/[\\/]/).pop() ?? itemPath,
          }) as AgentAttachment),
      ];
    });
  };

  const pickImages = async () => {
    const picked = await openFile({
      multiple: true,
      directory: false,
      filters: [{ name: t("agentChat.imageFilter"), extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    const paths = typeof picked === "string" ? [picked] : Array.isArray(picked) ? picked : [];
    if (!paths.length) return;
    appendPathAttachments(paths, "localImage");
  };

  const pickMention = async () => {
    const picked = await openFile({ multiple: true, directory: false });
    const paths = typeof picked === "string" ? [picked] : Array.isArray(picked) ? picked : [];
    appendPathAttachments(paths, "mention");
  };

  const pickAudio = async () => {
    const picked = await openFile({
      multiple: true,
      directory: false,
      filters: [{ name: "Audio", extensions: ["mp3", "m4a", "wav", "webm", "ogg", "flac"] }],
    });
    const paths = typeof picked === "string" ? [picked] : Array.isArray(picked) ? picked : [];
    appendPathAttachments(paths, "localAudio");
  };

  const pickFolder = async () => {
    const picked = await openFile({ multiple: true, directory: true });
    const paths = typeof picked === "string" ? [picked] : Array.isArray(picked) ? picked : [];
    appendPathAttachments(paths, "mention");
  };

  const submit = async (value: string) => {
    const pendingAttachments = attachments;
    try {
      setScrollToBottomSignal((value) => value + 1);
      setDraft("");
      setAttachments([]);
      saveAgentComposerDraft(composerDraftKey, { text: "", attachments: [] });
      await sendMessage(path, value, pendingAttachments);
    } catch (error) {
      setDraft(value);
      setAttachments(pendingAttachments);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const runAction = async (action: string) => {
    if (action === "image") {
      await pickImages();
      return;
    }
    if (action === "mention") {
      setFilePickerOpen(true);
      return;
    }
    if (action === "browse") {
      await pickMention();
      return;
    }
    if (action === "audio") {
      await pickAudio();
      return;
    }
    if (action === "folder") {
      await pickFolder();
      return;
    }
    if (action === "skill" || action === "app") {
      setResourcePicker(action);
      return;
    }
    if (action === "review" && threadId) {
      try {
        await startReview(threadId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const newThread = async () => {
    try {
      await createThread(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const slashCommands = useMemo<PromptSlashCommand[]>(() => [
    { value: "new", label: "Start a new chat", description: "Fresh context in this repository" },
    { value: "clear", label: "Clear into a new chat", description: `${providerLabel}-compatible alias for /new` },
    { value: "rename", label: "Rename this chat", description: "Use /rename New title or edit inline", disabled: !threadId, acceptsArgument: true },
    { value: "review", label: "Review working tree", description: "Optionally add custom review instructions", disabled: !threadId || busy, acceptsArgument: true },
    { value: "fork", label: "Fork this chat", description: "Continue from a copy", disabled: !threadId || busy },
    { value: "compact", label: "Compact context", description: "Summarize older context", disabled: !threadId || busy },
    { value: "plan", label: "Toggle Plan mode", description: "Switch between Default and Plan" },
    { value: "goal", label: "Set or clear a goal", description: "/goal objective or /goal clear", disabled: !threadId, acceptsArgument: true },
    { value: "model", label: "Choose model and effort", description: "/model model-id [effort]", acceptsArgument: true },
    { value: "permissions", label: "Choose permissions", description: `Select a named ${providerLabel} permission profile`, acceptsArgument: true },
    { value: "voice", label: "Start realtime voice", description: "/voice [voice-name]", disabled: !threadId, acceptsArgument: true },
    { value: "memories", label: "Configure memory", description: "/memories enabled, disabled, or reset", acceptsArgument: true },
    { value: "init", label: `Create ${isClaude ? "CLAUDE.md" : "AGENTS.md"}`, description: `Ask ${providerLabel} to add repository instructions`, disabled: busy },
    { value: "capabilities", label: "Open Capability Studio", description: "Manage skills, MCP, plugins, apps, and hooks" },
    { value: "skills", label: "Manage skills", description: "Create, edit, enable, duplicate, and remove skills" },
    { value: "apps", label: "Manage apps", description: "Configure apps, tools, and approval policies" },
    { value: "mcp", label: "Show or authenticate MCP servers", description: "/mcp [server-name|verbose]", acceptsArgument: true },
    { value: "hooks", label: "Show lifecycle hooks", description: `Inspect configured ${providerLabel} hooks` },
    { value: "plugins", label: "Show plugins", description: "Inspect installed and discoverable plugins" },
    { value: "import", label: "Import from Claude Code", description: "Preview setup, skills, and recent chats" },
    { value: "terminal", label: "Toggle in-app terminal", description: "Open it beside or below the chat", disabled: !onToggleTerminal },
    { value: "feedback", label: `Send ${providerLabel} feedback`, description: isClaude ? "Report a Claude Code issue" : "Optionally include diagnostic logs" },
    { value: "mention", label: "Mention files", description: "Attach exact local paths" },
    { value: "browse", label: "Browse any file", description: "Attach a path outside the repository" },
    { value: "folder", label: "Mention a folder", description: "Attach a local directory" },
    { value: "image", label: "Attach images", description: "PNG, JPEG, GIF or WebP" },
    { value: "audio", label: "Attach audio", description: "Voice note or audio file" },
    { value: "ps", label: "Background terminals", description: "List running shell processes", disabled: !threadId },
    { value: "stop", label: "Stop background terminals", description: "Terminate all background shells", disabled: !threadId },
    { value: "fast", label: "Toggle Fast mode", description: "Use the catalog-provided Fast service tier", disabled: !(models.find((option) => option.id === model)?.serviceTiers.length) },
    { value: "personality", label: "Set personality", description: "friendly, pragmatic, or none", disabled: !models.find((option) => option.id === model)?.supportsPersonality, acceptsArgument: true },
    { value: "copy", label: "Copy latest response", description: `Copy the last ${providerLabel} message`, disabled: !conversationMeta.exists },
    { value: "status", label: "Show chat status", description: "Model, effort, permissions, and context" },
    { value: "usage", label: "Show usage limits", description: "Current account rate limits" },
    { value: "archive", label: "Archive this chat", description: "Remove it from the active list", disabled: !threadId || busy },
    { value: "delete", label: "Delete this chat", description: "Permanently delete the transcript", disabled: !threadId || busy },
    { value: "logout", label: `Log out of ${providerLabel}`, description: `Disconnect the current ${isClaude ? "Anthropic" : "OpenAI"} account` },
  ].filter((command) => !isClaude || !["apps", "voice", "memories", "import", "fast", "personality", "usage"].includes(command.value)), [busy, conversationMeta.exists, isClaude, model, models, onOpenCapabilities, onToggleTerminal, providerLabel, threadId]);

  const runSlashCommand = async (command: string, argument: string) => {
    try {
      if (command === "new") return await newThread();
      if (command === "clear") return await newThread();
      if (command === "image") return await pickImages();
      if (command === "mention") return setFilePickerOpen(true);
      if (command === "browse") return await pickMention();
      if (command === "folder") return await pickFolder();
      if (command === "audio") return await pickAudio();
      if (command === "capabilities") return onOpenCapabilities?.("skills");
      if (command === "skills") return onOpenCapabilities?.("skills");
      if (command === "apps") return onOpenCapabilities?.("apps");
      if (command === "mcp") {
        if (!argument) return onOpenCapabilities?.("mcp");
        const servers = await listMcpServers(threadId ?? undefined);
        if (argument && argument.toLocaleLowerCase() !== "verbose") {
          const server = servers.find((candidate) =>
            candidate.name.toLocaleLowerCase() === argument.toLocaleLowerCase(),
          );
          if (!server) throw new Error(`Unknown MCP server: ${argument}`);
          const authUrl = await loginMcpServer(server.name, threadId ?? undefined);
          if (authUrl) await openUrl(authUrl);
          toast.success(`${server.name} authentication started`);
          return;
        }
        toast.info(servers.length
          ? servers.map((server) => argument.toLocaleLowerCase() === "verbose"
            ? `${server.name} · ${server.authStatus}\n${server.tools.join(", ") || "No tools"}`
            : `${server.name} · ${server.tools.length} tools · ${server.authStatus}`).join("\n")
          : "No MCP servers configured");
        return;
      }
      if (command === "hooks") {
        return onOpenCapabilities?.("hooks");
      }
      if (command === "plugins") {
        return onOpenCapabilities?.("plugins");
      }
      if (command === "import") return setImportOpen(true);
      if (command === "terminal") return onToggleTerminal?.();
      if (command === "feedback") return setFeedbackOpen(true);
      if (command === "model") {
        if (!argument) {
          toast.info(models.map((option) => `${option.id} · ${codexReasoningEffortLabel(option.defaultReasoningEffort)}`).join("\n"));
          return;
        }
        const [requestedModel, requestedEffort] = argument.split(/\s+/u);
        const option = models.find((candidate) =>
          candidate.id.toLocaleLowerCase() === requestedModel.toLocaleLowerCase() ||
          candidate.label.toLocaleLowerCase() === requestedModel.toLocaleLowerCase(),
        );
        if (!option) throw new Error(`Unknown model: ${requestedModel}`);
        setModel(option.id);
        if (requestedEffort) {
          const effort = option.reasoningEfforts.find((candidate) =>
            candidate.value.toLocaleLowerCase() === requestedEffort.toLocaleLowerCase(),
          );
          if (!effort) throw new Error(`${option.label} does not support ${requestedEffort}.`);
          setReasoningEffort(effort.value);
        }
        toast.success(`${option.label}${requestedEffort ? ` · ${codexReasoningEffortLabel(requestedEffort)}` : ""}`);
        return;
      }
      if (command === "permissions") {
        if (!argument) {
          toast.info(permissionProfiles.length
            ? permissionProfiles.map((profile) => `${profile.allowed ? "Available" : "Blocked"} · ${profile.id}`).join("\n")
            : "Open the settings menu to choose custom sandbox and approval rules.");
          return;
        }
        if (argument.toLocaleLowerCase() === "custom") {
          setPermissionProfile(null);
          toast.success("Custom permissions enabled");
          return;
        }
        const profile = permissionProfiles.find((candidate) =>
          candidate.id.toLocaleLowerCase() === argument.toLocaleLowerCase() ||
          candidate.id.replace(/^:/u, "").toLocaleLowerCase() === argument.toLocaleLowerCase(),
        );
        if (!profile) throw new Error(`Unknown permission profile: ${argument}`);
        if (!profile.allowed) throw new Error(`Permission profile ${profile.id} is blocked by policy.`);
        setPermissionProfile(profile.id);
        toast.success(`Permissions: ${profile.id.replace(/^:/u, "")}`);
        return;
      }
      if (command === "memories") {
        const value = argument.toLocaleLowerCase();
        if (value === "reset") {
          if (!window.confirm("Reset all Codex memories? This cannot be undone.")) return;
          await resetMemory();
          toast.success("Codex memories reset");
          return;
        }
        if (value !== "enabled" && value !== "disabled") {
          throw new Error("Use /memories enabled, /memories disabled, or /memories reset.");
        }
        if (!threadId) throw new Error("Open a chat first.");
        await setMemoryMode(threadId, value);
        toast.success(`Memory ${value}`);
        return;
      }
      if (command === "init") {
        await sendMessage(path, `Create a ${isClaude ? "CLAUDE.md" : "AGENTS.md"} file for this repository. Inspect the project first, then capture concise build, test, style, architecture, and contribution instructions that will help future coding agents work safely and effectively.`);
        return;
      }
      if (command === "logout") {
        await logout();
        toast.success(`Logged out of ${providerLabel}`);
        return;
      }
      if (command === "plan") {
        const next = useAgentChatStore.getState().collaborationMode === "plan" ? "default" : "plan";
        setCollaborationMode(next);
        toast.success(`${next === "plan" ? "Plan" : "Default"} mode`);
        return;
      }
      if (command === "fast") {
        const selected = models.find((option) => option.id === model);
        const fast = selected?.serviceTiers.find((tier) => tier.id === "fast") ?? selected?.serviceTiers[0];
        if (!fast) throw new Error("The selected model does not offer a Fast service tier.");
        const next = serviceTier === fast.id ? null : fast.id;
        setServiceTier(next);
        toast.success(next ? `${fast.name} enabled` : "Fast mode disabled");
        return;
      }
      if (command === "personality") {
        const value = argument.toLocaleLowerCase();
        if (value !== "friendly" && value !== "pragmatic" && value !== "none") {
          throw new Error("Use /personality friendly, /personality pragmatic, or /personality none.");
        }
        setPersonality(value);
        toast.success(`Personality: ${value === "friendly" ? "Friendly" : value === "pragmatic" ? "Pragmatic" : "None"}`);
        return;
      }
      if (command === "voice") {
        let selectedVoice = realtimeVoice ?? undefined;
        if (argument) {
          selectedVoice = realtimeVoices?.v2.find((candidate) =>
            candidate.toLocaleLowerCase() === argument.toLocaleLowerCase(),
          );
          if (!selectedVoice) throw new Error(`Unknown realtime voice: ${argument}`);
          setRealtimeVoice(selectedVoice);
          toast.success(`Voice: ${selectedVoice}`);
          if (realtime.active) return;
        }
        if (realtime.active) await realtime.stop();
        else {
          realtime.dismissError();
          await realtime.start(selectedVoice);
        }
        return;
      }
      if (!threadId) throw new Error("Open a chat first.");
      if (command === "rename") {
        if (argument) await useAgentChatStore.getState().renameThread(path, threadId, argument);
        else setRenamingTitle(true);
        return;
      }
      if (command === "review") return await startReview(threadId, argument || undefined);
      if (command === "fork") return void await forkThread(path, threadId);
      if (command === "compact") {
        await compactThread(threadId);
        toast.success("Compaction started");
        return;
      }
      if (command === "goal") {
        if (argument.toLocaleLowerCase() === "clear") {
          await clearGoal(threadId);
          toast.success("Goal cleared");
        } else if (argument) {
          await setGoal(threadId, argument);
          toast.success("Goal updated");
        } else {
          toast.info(
            useAgentChatStore.getState().conversations[threadId]?.goal?.objective ??
              "No active goal",
          );
        }
        return;
      }
      if (command === "ps") {
        const terminals = await listBackgroundTerminals(threadId);
        toast.info(terminals.length
          ? terminals.map((terminal) => `${terminal.processId} · ${terminal.command}`).join("\n")
          : "No background terminals");
        return;
      }
      if (command === "stop") {
        await stopBackgroundTerminals(threadId);
        toast.success("Background terminals stopped");
        return;
      }
      if (command === "copy") {
        const currentConversation = useAgentChatStore.getState().conversations[threadId];
        const response = [...(currentConversation?.turns ?? [])].reverse()
          .flatMap((turn) => [...turn.items].reverse())
          .find((item) => item.type === "agentMessage" && typeof item.text === "string");
        if (!response || typeof response.text !== "string") throw new Error("No completed response to copy.");
        await navigator.clipboard.writeText(response.text);
        toast.success("Latest response copied");
        return;
      }
      if (command === "status") {
        const usage = useAgentChatStore.getState().conversations[threadId]?.tokenUsage;
        const context = usage?.modelContextWindow
          ? ` · ${Math.round((usage.totalTokens / usage.modelContextWindow) * 100)}% context`
          : "";
        toast.info(`${model ?? "Default model"} · ${codexReasoningEffortLabel(useAgentChatStore.getState().reasoningEffort)} · ${useAgentChatStore.getState().permissionProfile ?? useAgentChatStore.getState().sandboxMode}${context}`);
        return;
      }
      if (command === "usage") {
        const state = useAgentChatStore.getState();
        const primary = state.rateLimits?.primary;
        const lifetime = state.accountUsage?.lifetimeTokens;
        toast.info([
          primary ? `${Math.round(primary.usedPercent)}% of current limit used` : null,
          lifetime !== null && lifetime !== undefined ? `${lifetime.toLocaleString()} lifetime tokens` : null,
          state.accountUsage?.currentStreakDays ? `${state.accountUsage.currentStreakDays}-day streak` : null,
        ].filter(Boolean).join(" · ") || "No usage data available");
        return;
      }
      if (command === "archive") return await archiveThread(path, threadId);
      if (command === "delete") {
        if (!window.confirm(`Delete this ${providerLabel} chat? The transcript will be moved to l8git's Claude trash when supported.`)) return;
        return await deleteThread(path, threadId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] ring-1 ring-border/40">
          <ProviderLogo className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          {conversationMeta.exists && threadId ? (
            <AgentInlineTitle
              path={path}
              threadId={threadId}
              title={conversationMeta.title}
              editing={renamingTitle}
              onEditingChange={setRenamingTitle}
              className="block text-[13px] font-medium tracking-tight"
              inputClassName="max-w-md text-[13px] font-medium tracking-tight"
            />
          ) : (
            <p className="truncate text-[13px] font-medium tracking-tight">{providerLabel}</p>
          )}
          <p className="truncate text-[10px] text-muted-foreground">
            {repoName(path)}
            {account?.email ? ` · ${account.email}` : ""}
            {conversationMeta.goalObjective ? ` · Goal: ${conversationMeta.goalObjective}` : ""}
          </p>
        </div>
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" />
            {t("agentChat.working")}
          </span>
        ) : threadId ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border/45 px-2 py-1 text-[10px] font-medium text-muted-foreground"
            title={t("agentChat.streamIsolated")}
          >
            <span
              className={`size-1.5 rounded-full ${
                sessionStatus === "ready"
                  ? "bg-emerald-500"
                  : sessionStatus === "connecting"
                    ? "animate-pulse bg-amber-500"
                    : sessionStatus === "error"
                      ? "bg-destructive"
                      : "bg-muted-foreground/45"
              }`}
            />
            JSON
          </span>
        ) : null}
        {threadId ? (
          <AgentThreadMenu path={path} threadId={threadId} busy={busy} />
        ) : null}
        {onToggleTerminal ? (
          <Button
            type="button"
            variant={terminalVisible ? "secondary" : "ghost"}
            size="icon-sm"
            className={`rounded-full ${terminalVisible ? "text-foreground" : "text-muted-foreground"}`}
            onClick={onToggleTerminal}
            aria-pressed={terminalVisible}
            title={`${t("commitPanel.terminalToggleInApp")} (Ctrl+\`)`}
            aria-label={t("commitPanel.terminalToggleInApp")}
          >
            <SquareTerminal className="size-3.5" />
          </Button>
        ) : null}
        {onOpenCapabilities ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-muted-foreground"
            onClick={() => onOpenCapabilities("skills")}
            title={t("agentCapabilities.open")}
            aria-label={t("agentCapabilities.open")}
          >
            <Blocks className="size-3.5" />
          </Button>
        ) : null}
        <AgentAccountMenu onImport={isClaude ? undefined : () => setImportOpen(true)} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-muted-foreground"
          onClick={() => void newThread()}
          title={t("agentChat.newConversation")}
          aria-label={t("agentChat.newConversation")}
        >
          <MessageSquarePlus className="size-3.5" />
        </Button>
      </header>

      <AgentConversationViewport
        path={path}
        threadId={threadId}
        onStarter={setDraft}
        scrollToBottomSignal={scrollToBottomSignal}
      />

      <div className="shrink-0 border-t border-border/40 bg-background/95 px-4 pb-4 pt-3 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-3xl">
          {!isClaude && (realtime.active || realtime.error) ? (
            <div
              className={`mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                realtime.error
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-emerald-500/25 bg-emerald-500/[0.07] text-foreground"
              }`}
            >
              <span className={`size-2 shrink-0 rounded-full ${
                realtime.status === "listening" ? "animate-pulse bg-emerald-500" : "bg-muted-foreground"
              }`} />
              <span className="min-w-0 flex-1 truncate">
                {realtime.error
                  ? realtime.error
                  : realtime.transcript?.text || (realtime.status === "starting" ? "Starting voice…" : "Listening…")}
              </span>
              {realtime.error ? (
                <button
                  type="button"
                  onClick={realtime.dismissError}
                  className="rounded p-0.5 hover:bg-destructive/10"
                  aria-label="Dismiss voice error"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((attachment) => (
                <span
                  key={attachment.path}
                  className="inline-flex max-w-56 items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground ring-1 ring-border/40"
                >
                  {attachment.type === "localImage" ? (
                    <FileImage className="size-3 shrink-0" />
                  ) : attachment.type === "localAudio" ? (
                    <Mic className="size-3 shrink-0" />
                  ) : attachment.type === "skill" ? (
                    <Sparkles className="size-3 shrink-0" />
                  ) : (
                    <File className="size-3 shrink-0" />
                  )}
                  <span className="truncate">{attachment.name}</span>
                  <button
                    type="button"
                    aria-label={t("agentChat.removeAttachment", { name: attachment.name })}
                    onClick={() => setAttachments((current) => current.filter((item) => item.path !== attachment.path))}
                    className="rounded p-0.5 hover:bg-foreground/10 hover:text-foreground"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <PromptInput
            value={draft}
            onValueChange={setDraft}
            models={promptModels}
            model={model ?? undefined}
            onModelChange={setModel}
            actions={actions}
            onAction={(action) => void runAction(action)}
            slashCommands={slashCommands}
            onSlashCommand={(command, argument) => void runSlashCommand(command, argument)}
            onSubmit={(value) => void submit(value)}
            loading={busy}
            allowSubmitWhileLoading
            allowEmptySubmit={attachments.length > 0}
            onStop={threadId
              ? () => void interrupt(threadId).catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : String(error)),
                )
              : undefined}
            leadingAction={<AgentSettingsMenu path={path} />}
            trailingAction={threadId && !isClaude ? (
              <Button
                type="button"
                variant={realtime.active ? "destructive" : "ghost"}
                size="icon"
                className="size-8 rounded-full"
                disabled={!realtime.active && (busy || connectionStatus !== "ready" || requiresAuth)}
                onClick={() => {
                  if (realtime.active) void realtime.stop();
                  else {
                    realtime.dismissError();
                    void realtime.start();
                  }
                }}
                title={realtime.active ? "Stop voice" : `Start voice${realtimeVoice ? ` · ${realtimeVoice}` : ""}`}
                aria-label={realtime.active ? "Stop voice" : "Start voice"}
              >
                <Mic className={`size-3.5 ${realtime.status === "listening" ? "animate-pulse" : ""}`} />
              </Button>
            ) : undefined}
            disabled={connectionStatus !== "ready" || requiresAuth}
            placeholder={busy
              ? t("agentChat.steerPrompt")
              : t("agentChat.prompt", { repo: repoName(path) })}
            aria-label={t("agentChat.promptAria")}
            className="shadow-sm"
          />
          <p className="mt-1.5 px-1 text-center text-[10px] text-muted-foreground/60">
            {t("agentChat.composerHint")}
          </p>
        </div>
      </div>
      <Suspense fallback={null}>
        {resourcePicker === "skill" ? (
          <AgentResourcePicker
            kind="skill"
            open
            onOpenChange={(open) => setResourcePicker(open ? "skill" : null)}
            path={path}
            threadId={threadId}
            onSelectSkill={(skill) => {
              setAttachments((current) => current.some((item) => item.type === "skill" && item.path === skill.path)
                ? current
                : [...current, { type: "skill", name: skill.name, path: skill.path }]);
            }}
            onSelectApp={() => {}}
          />
        ) : null}
        {resourcePicker === "app" ? (
          <AgentResourcePicker
            kind="app"
            open
            onOpenChange={(open) => setResourcePicker(open ? "app" : null)}
            path={path}
            threadId={threadId}
            onSelectSkill={() => {}}
            onSelectApp={(app) => setDraft((current) => `${current}${current && !/\s$/u.test(current) ? " " : ""}$${app.id} `)}
          />
        ) : null}
        {filePickerOpen ? (
          <AgentFilePicker
            path={path}
            open
            onOpenChange={setFilePickerOpen}
            onSelect={(file) => {
              setAttachments((current) => current.some((item) => item.type === "mention" && item.path === file.path)
                ? current
                : [...current, { type: "mention", name: file.name, path: file.path }]);
            }}
          />
        ) : null}
        {feedbackOpen ? (
          <AgentFeedbackDialog
            open
            onOpenChange={setFeedbackOpen}
            threadId={threadId}
          />
        ) : null}
        {importOpen ? (
          <AgentImportDialog
            open
            onOpenChange={setImportOpen}
            path={path}
          />
        ) : null}
      </Suspense>
    </section>
  );
});
