import { invoke } from "@tauri-apps/api/core";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertCircle,
  AppWindow,
  Blocks,
  ChevronRight,
  File,
  FileDiff,
  FileImage,
  Folder,
  FolderGit2,
  GitBranch,
  GitPullRequestArrow,
  Hammer,
  LoaderCircle,
  Mic,
  Paperclip,
  ScanSearch,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  lazy,
  memo,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { AgentAccountMenu } from "@/components/agents/chat/agent-account-menu";
import { AgentComposerControls } from "@/components/agents/chat/agent-composer-controls";
import { AgentPlanBanner } from "@/components/agents/chat/agent-plan-banner";
import { AgentTrustBanner } from "@/components/agents/chat/agent-trust-banner";
import { AgentInlineTitle } from "@/components/agents/chat/agent-inline-title";
import { AgentUsagePill } from "@/components/agents/chat/agent-usage-pill";
import { AgentRequestCard } from "@/components/agents/chat/agent-request-card";
import { AgentThreadMenu } from "@/components/agents/chat/agent-thread-menu";
import { AgentReviewButton } from "@/components/agents/worktree-review/agent-review-launcher";
import { useAgentReviewSession } from "@/components/agents/worktree-review/use-agent-review";
import {
  PromptInput,
  type PromptAction,
  type PromptSlashCommand,
} from "@/components/agents/ui/prompt-input";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { codexReasoningEffortLabel } from "@/lib/agents/codex-labels";
import {
  agentComposerDraftKey,
  loadAgentComposerDraft,
  saveAgentComposerDraft,
} from "@/lib/agents/composer-drafts";
import { onAgentComposerInsert } from "@/lib/agents/composer-insert";
import type { AgentAttachment } from "@/lib/agents/types";
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { chartPrompt } from "@/lib/agents/chart-spec";
import {
  agentProviderMeta,
  providerSupportsCapabilityCenter,
  providerSupportsSlashCommand,
} from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { useRepoStore } from "@/lib/repo-store";

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
const STARTER_ICONS = [
  { Icon: ScanSearch, color: "var(--git-branch)" },
  { Icon: Hammer, color: "var(--git-modified)" },
  { Icon: GitPullRequestArrow, color: "var(--git-added)" },
] as const;

const AgentConversationViewport = memo(function AgentConversationViewport({
  path,
  threadId,
  centered,
  composer,
  onStarter,
  scrollToBottomSignal,
}: {
  path: string;
  threadId: string | null;
  centered: boolean;
  composer: ReactNode;
  onStarter: (text: string) => void;
  scrollToBottomSignal: number;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const isClaude = provider === "claude";
  const ProviderLogo = agentProviderMeta(provider).Logo;
  const agent = agentProviderMeta(provider).label;
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
      className="ag-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 py-7">
        {conversation?.loading || (!threadId && connectionStatus === "connecting") ? (
          <div className="ag-muted m-auto flex items-center gap-2 text-[12px]">
            <LoaderCircle className="size-3.5 animate-spin" />
            {t("agentChat.connecting", { agent })}
          </div>
        ) : !threadId && connectionError && connectionStatus === "error" ? (
          <div className="ag-card m-auto flex max-w-md items-start gap-3 border-destructive/25 bg-destructive/[0.06] p-4">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{t("agentChat.startErrorTitle", { agent })}</p>
              <p className="ag-muted mt-1 text-[12px] leading-5">{connectionError}</p>
              <button
                type="button"
                className="ag-pill mt-3"
                onClick={() => void connect().then(() => loadThreads([path])).catch(() => {})}
              >
                {t("agentChat.retry")}
              </button>
            </div>
          </div>
        ) : requiresAuth ? (
          <div className="ag-card m-auto max-w-sm p-6 text-center">
            <span className="ag-inset mx-auto grid size-11 place-items-center rounded-[13px]">
              <ProviderLogo className="size-5" />
            </span>
            <p className="mt-4 text-[14px] font-semibold tracking-tight">
              {isClaude ? t("agentChat.loginTitleClaude") : t("agentChat.loginTitle")}
            </p>
            <p className="ag-muted mt-1.5 text-[12px] leading-5">
              {isClaude ? t("agentChat.loginDescriptionClaude") : t("agentChat.loginDescription")}
            </p>
            {loginError ? (
              <p className="mt-2 text-[12px] text-destructive">
                {t("agentChat.loginFailed")}: {loginError}
              </p>
            ) : null}
            <button
              type="button"
              className="ag-pill mt-5 h-8 px-4"
              data-active="true"
              onClick={() => void login()}
              disabled={loginStatus === "starting" || loginStatus === "waiting"}
            >
              {loginStatus === "starting" || loginStatus === "waiting" ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : null}
              {loginStatus === "waiting"
                ? t("agentChat.loginWaiting")
                : isClaude ? t("agentChat.loginActionClaude") : t("agentChat.loginAction")}
            </button>
          </div>
        ) : centered ? (
          <div className="m-auto w-full max-w-2xl py-8">
            <div className="flex flex-col items-center text-center">
              <span className="ag-inset grid size-11 place-items-center rounded-[13px]">
                <ProviderLogo className="size-5" />
              </span>
              <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.015em]">
                {t("agentChat.emptyTitle", { agent })}
              </h2>
              <p className="ag-muted mt-1.5 max-w-sm text-[12px] leading-5">
                {t("agentChat.emptyDescription", { agent, repo: repoName(path) })}
              </p>
            </div>

            <div className="ag-card mt-7 p-1.5">
              <p className="ag-label px-2 py-1.5">{t("agentChat.shortcuts")}</p>
              {starters.map((starter, index) => {
                const { Icon, color } = STARTER_ICONS[index] ?? STARTER_ICONS[0];
                return (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => onStarter(starter)}
                    className="ag-menu-item"
                  >
                    <Icon className="size-4 shrink-0" style={{ color }} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{starter}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3">{composer}</div>
          </div>
        ) : (
          <div className="space-y-6">
            {hiddenTurnCount > 0 ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  className="ag-pill"
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
                </button>
              </div>
            ) : null}
            <Suspense fallback={<div className="ag-inset h-16 animate-pulse" />}>
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
          <div className="mt-6 space-y-3">
            {requests.map((request) => (
              <AgentRequestCard
                key={`${request.sessionId}:${String(request.requestId)}`}
                request={request}
              />
            ))}
          </div>
        ) : null}

        {conversation?.error ? (
          <div className="ag-card mt-4 flex items-start gap-2 border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-[12px] text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{conversation.error}</span>
            <button
              type="button"
              onClick={() => void openThread(path, conversation.threadId)}
              className="rounded-md px-1.5 py-0.5 font-medium hover:bg-destructive/10"
            >
              {t("agentChat.retry")}
            </button>
            <button
              type="button"
              onClick={() => clearError(conversation.threadId)}
              aria-label={t("agentChat.dismissError")}
              className="rounded-md p-0.5 hover:bg-destructive/10"
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
  const isCodex = provider === "codex";
  const ProviderLogo = agentProviderMeta(provider).Logo;
  const providerLabel = agentProviderMeta(provider).label;
  const connectionStatus = useAgentChatStore((state) => state.connectionStatus);
  const connectionError = useAgentChatStore((state) => state.connectionError);
  const requiresAuth = useAgentChatStore((state) => state.requiresAuth);
  const loginStatus = useAgentChatStore((state) => state.loginStatus);
  const account = useAgentChatStore((state) => state.account);
  const models = useAgentChatStore((state) => state.models);
  const model = useAgentChatStore((state) => state.model);
  const branch = useRepoStore((state) => state.repos[path]?.branch);
  const worktreeName = useRepoStore((state) => {
    const entry = state.worktrees[path]?.find((item) => item.path === path);
    return entry && !entry.is_main ? (entry.branch ?? repoName(entry.path)) : null;
  });
  const reviewSession = useAgentReviewSession(path);
  const branchPr = useRepoStore(
    useShallow((state) =>
      branch
        ? (state.prs[path] ?? []).find((pr) => pr.source_branch === branch) ?? null
        : null,
    ),
  );
  const loadPRs = useRepoStore((state) => state.loadPRs);
  const reloadWorktrees = useRepoStore((state) => state.reloadWorktrees);
  const reloadStatus = useRepoStore((state) => state.reloadStatus);
  const changedFileCount = useRepoStore((state) => state.status[path]?.length ?? 0);
  const sessionStatus = useAgentChatStore((state) =>
    threadId ? (state.sessionStatusByThread[threadId] ?? "idle") : "idle",
  );
  const conversationMeta = useAgentChatStore(
    useShallow((state) => {
      const conversation = threadId ? state.conversations[threadId] : undefined;
      const usage = conversation?.tokenUsage;
      return {
        exists: Boolean(conversation),
        loading: Boolean(conversation?.loading),
        title: conversation?.title ?? "",
        turnCount: conversation?.turns.length ?? 0,
        activeTurnId: conversation?.activeTurnId ?? null,
        goalObjective: conversation?.goal?.objective ?? null,
        usage: usage ?? null,
        usageModel: conversation?.model ?? null,
        contextPercent: usage?.modelContextWindow
          ? Math.min(100, Math.round((usage.totalTokens / usage.modelContextWindow) * 100))
          : null,
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
  const setServiceTier = useAgentChatStore((state) => state.setServiceTier);
  const setPersonality = useAgentChatStore((state) => state.setPersonality);
  const permissionProfiles = useAgentChatStore((state) => state.permissionProfiles);
  const setPermissionProfile = useAgentChatStore((state) => state.setPermissionProfile);
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
  // Mirrors the viewport's blocking branches exactly: whenever it shows a
  // connecting / error / sign-in card instead of the transcript, the composer
  // stays docked at the bottom rather than moving into the middle.
  const viewportBlocked =
    requiresAuth ||
    conversationMeta.loading ||
    (!threadId && connectionStatus === "connecting") ||
    (!threadId && Boolean(connectionError) && connectionStatus === "error");
  const centeredComposer = !viewportBlocked && conversationMeta.turnCount === 0;

  useEffect(() => {
    if (!path) return;
    void loadPRs(path).catch(() => {});
    void reloadWorktrees(path).catch(() => {});
    void reloadStatus(path).catch(() => {});
  }, [loadPRs, path, reloadStatus, reloadWorktrees]);

  useEffect(() => {
    if (!path || busy) return;
    void reloadStatus(path).catch(() => {});
  }, [busy, path, reloadStatus]);

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

  useEffect(
    () =>
      onAgentComposerInsert((text) =>
        setDraft((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n\n${text}` : text)),
      ),
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || !threadId) return;
      event.preventDefault();
      setRenamingTitle(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [threadId]);

  const actions = useMemo<PromptAction[]>(
    () => [
      {
        value: "image",
        label: t("agentChat.attachImage"),
        description: t("agentChat.attachImageTypes"),
        icon: <FileImage className="size-4" />,
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
    ].filter((action) => isCodex || action.value !== "app"),
    [busy, isCodex, providerLabel, t, threadId],
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

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    void (async () => {
      for (const file of files) {
        try {
          const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
          const savedPath = await invoke<string>("save_clipboard_image", {
            bytes,
            ext: file.name.split(".").pop() ?? "png",
            name: file.name || null,
          });
          const type: AgentAttachment["type"] = file.type.startsWith("image/")
            ? "localImage"
            : file.type.startsWith("audio/")
              ? "localAudio"
              : "mention";
          appendPathAttachments([savedPath], type);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      }
    })();
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
    { value: "memories", label: "Configure memory", description: "/memories enabled, disabled, or reset", acceptsArgument: true },
    { value: "chart", label: "Visualize data as a chart", description: "/chart what to visualize — renders an interactive chart", disabled: busy, acceptsArgument: true },
    { value: "init", label: `Create ${isClaude ? "CLAUDE.md" : "AGENTS.md"}`, description: `Ask ${providerLabel} to add repository instructions`, disabled: busy },
    { value: "capabilities", label: "Open Capability Studio", description: "Manage skills, MCP, plugins, apps, and hooks" },
    { value: "skills", label: "Manage skills", description: "Create, edit, enable, duplicate, and remove skills" },
    { value: "apps", label: "Manage apps", description: "Configure apps, tools, and approval policies" },
    { value: "mcp", label: "Show or authenticate MCP servers", description: "/mcp [server-name|verbose]", acceptsArgument: true },
    { value: "hooks", label: "Show lifecycle hooks", description: `Inspect configured ${providerLabel} hooks` },
    { value: "plugins", label: "Show plugins", description: "Inspect installed and discoverable plugins" },
    { value: "import", label: "Import from Claude Code", description: "Preview setup, skills, and recent chats" },
    { value: "terminal", label: "Toggle in-app terminal", description: "Open it beside or below the chat", disabled: !onToggleTerminal },
    { value: "feedback", label: `Send ${providerLabel} feedback`, description: isCodex ? "Optionally include diagnostic logs" : `Report a ${providerLabel} issue` },
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
    { value: "logout", label: `Log out of ${providerLabel}`, description: `Disconnect the current ${isClaude ? "Anthropic" : isCodex ? "OpenAI" : "OpenCode"} account` },
  ].filter((command) => providerSupportsSlashCommand(provider, command.value)), [busy, conversationMeta.exists, isClaude, isCodex, model, models, onOpenCapabilities, onToggleTerminal, provider, providerLabel, threadId]);

  const runSlashCommand = async (command: string, argument: string) => {
    try {
      if (!providerSupportsSlashCommand(provider, command)) {
        throw new Error(`/${command} is not available with ${providerLabel}.`);
      }
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
        if (!argument && providerSupportsCapabilityCenter(provider)) {
          return onOpenCapabilities?.("mcp");
        }
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
      if (command === "chart") {
        if (!argument) throw new Error("Use /chart <what to visualize>.");
        await sendMessage(path, chartPrompt(argument));
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

  const statusState = busy
    ? "working"
    : sessionStatus === "ready"
      ? "ready"
      : sessionStatus === "connecting"
        ? "working"
        : sessionStatus === "error"
          ? "error"
          : "idle";
  const statusLabel = busy
    ? t("agentChat.working")
    : sessionStatus === "ready"
      ? t("agentChat.statusReady")
      : sessionStatus === "connecting"
        ? t("agentChat.statusConnecting")
        : sessionStatus === "error"
          ? t("agentChat.statusError")
          : t("agentChat.statusIdle");

  const attachmentChips = attachments.length > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <span
          key={attachment.path}
          className="ag-inset inline-flex max-w-56 items-center gap-1.5 rounded-[9px] px-2 py-1 text-[11px]"
          title={attachment.path}
        >
          {attachment.type === "localImage" ? (
            <FileImage className="ag-faint size-3 shrink-0" />
          ) : attachment.type === "localAudio" ? (
            <Mic className="ag-faint size-3 shrink-0" />
          ) : attachment.type === "skill" ? (
            <Sparkles className="ag-faint size-3 shrink-0" />
          ) : (
            <File className="ag-faint size-3 shrink-0" />
          )}
          <span className="truncate">{attachment.name}</span>
          <button
            type="button"
            aria-label={t("agentChat.removeAttachment", { name: attachment.name })}
            onClick={() => setAttachments((current) => current.filter((item) => item.path !== attachment.path))}
            className="ag-icon-btn size-4"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
    </div>
  ) : null;

  const composer = (
    <div className="w-full">
      <PromptInput
        value={draft}
        onValueChange={setDraft}
        actions={actions}
        onAction={(action) => void runAction(action)}
        slashCommands={slashCommands}
        onSlashCommand={(command, argument) => void runSlashCommand(command, argument)}
        onSubmit={(value) => void submit(value)}
        onPaste={handlePaste}
        loading={busy}
        allowSubmitWhileLoading
        allowEmptySubmit={attachments.length > 0}
        onStop={threadId
          ? () => void interrupt(threadId).catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : String(error)),
            )
          : undefined}
        header={attachmentChips}
        leadingAction={
          <AgentComposerControls path={path} providerLocked={conversationMeta.turnCount > 0} />
        }
        disabled={connectionStatus !== "ready" || requiresAuth}
        placeholder={busy
          ? t("agentChat.steerPrompt")
          : t("agentChat.prompt", { agent: providerLabel, repo: repoName(path) })}
        aria-label={t("agentChat.promptAria", { agent: providerLabel })}
      />

      <div className="ag-dock flex items-center gap-2 px-3 py-1.5 text-[11px]">
        <span className="ag-faint flex min-w-0 items-center gap-1.5">
          <span className="truncate">{repoName(path)}</span>
          {branch ? (
            <>
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate">{branch}</span>
            </>
          ) : null}
          {worktreeName ? (
            <>
              <FolderGit2 className="size-3 shrink-0" />
              <span className="truncate">{worktreeName}</span>
            </>
          ) : null}
          {worktreeName && reviewSession ? (
            <AgentReviewButton
              worktreePath={reviewSession.worktreePath}
              basePath={reviewSession.basePath}
              branch={reviewSession.branch}
              variant="ghost"
              size="xs"
            />
          ) : null}
          {changedFileCount > 0 ? (
            <span
              className="flex shrink-0 items-center gap-1"
              title={t("agentChat.changedFiles", { count: changedFileCount })}
            >
              <FileDiff className="size-3 shrink-0" />
              <span>{changedFileCount}</span>
            </span>
          ) : null}
          {branchPr ? (
            <button
              type="button"
              className="ag-chip h-5 gap-1 px-1.5 text-[11px]"
              title={branchPr.title}
              onClick={() => void openUrl(branchPr.html_url).catch(() => {})}
            >
              <GitPullRequestArrow className="size-3 shrink-0" />
              <span className="tabular-nums">#{branchPr.number}</span>
            </button>
          ) : null}
        </span>

        {conversationMeta.goalObjective && threadId ? (
          <span className="ag-inset ml-1 inline-flex min-w-0 max-w-64 items-center gap-1.5 rounded-full px-2 py-0.5">
            <span className="ag-faint shrink-0">{t("agentChat.goal")}</span>
            <span className="truncate">{conversationMeta.goalObjective}</span>
            <button
              type="button"
              className="ag-icon-btn size-4"
              aria-label={t("agentChat.clearGoal")}
              onClick={() => void clearGoal(threadId).catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : String(error)),
              )}
            >
              <X className="size-2.5" />
            </button>
          </span>
        ) : null}

        <span className="ag-faint ml-auto flex shrink-0 items-center gap-2">
          {account?.email ? <span className="max-w-48 truncate">{account.email}</span> : null}
          <AgentUsagePill
            usage={conversationMeta.usage}
            model={conversationMeta.usageModel || model}
          />
          {conversationMeta.contextPercent !== null ? (
            <span className="tabular-nums">
              {t("agentChat.contextUsed", { value: conversationMeta.contextPercent })}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col">
      <header className="ag-line flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="ag-inset grid size-6 shrink-0 place-items-center rounded-[7px]">
          <ProviderLogo className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="ag-faint hidden shrink-0 truncate text-[12px] sm:block">
            {repoName(path)}
          </span>
          <ChevronRight className="ag-faint hidden size-3 shrink-0 sm:block" />
          {conversationMeta.exists && threadId ? (
            <AgentInlineTitle
              path={path}
              threadId={threadId}
              title={conversationMeta.title}
              editing={renamingTitle}
              onEditingChange={setRenamingTitle}
              className="min-w-0 truncate text-[13px] font-medium tracking-[-0.01em]"
              inputClassName="max-w-md text-[13px] font-medium tracking-[-0.01em]"
            />
          ) : (
            <p className="truncate text-[13px] font-medium tracking-[-0.01em]">{providerLabel}</p>
          )}
        </div>

        {threadId || busy ? (
          <span className="ag-pill shrink-0" title={t("agentChat.streamIsolated")}>
            <span className="ag-dot" data-state={statusState} aria-hidden="true" />
            {statusLabel}
          </span>
        ) : null}

        {onToggleTerminal ? (
          <button
            type="button"
            className="ag-icon-btn"
            data-active={terminalVisible || undefined}
            onClick={onToggleTerminal}
            aria-pressed={terminalVisible}
            title={`${t("commitPanel.terminalToggleInApp")} (Ctrl+\`)`}
            aria-label={t("commitPanel.terminalToggleInApp")}
          >
            <SquareTerminal className="size-4" />
          </button>
        ) : null}

        {onOpenCapabilities && providerSupportsCapabilityCenter(provider) ? (
          <button
            type="button"
            className="ag-icon-btn"
            onClick={() => onOpenCapabilities("skills")}
            title={t("agentCapabilities.open")}
            aria-label={t("agentCapabilities.open")}
          >
            <Blocks className="size-4" />
          </button>
        ) : null}

        {threadId ? <AgentThreadMenu path={path} threadId={threadId} busy={busy} /> : null}

        <AgentAccountMenu onImport={isCodex ? () => setImportOpen(true) : undefined} />
      </header>

      <div className="shrink-0 px-6">
        <AgentTrustBanner path={path} />
        <AgentPlanBanner />
      </div>

      <AgentConversationViewport
        path={path}
        threadId={threadId}
        centered={centeredComposer}
        composer={composer}
        onStarter={setDraft}
        scrollToBottomSignal={scrollToBottomSignal}
      />

      {centeredComposer ? null : (
        <div className="shrink-0 px-6 pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl">{composer}</div>
        </div>
      )}

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
