import { invoke } from "@tauri-apps/api/core";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AppWindow,
  File,
  FileDiff,
  FileImage,
  Folder,
  FolderGit2,
  GitBranch,
  GitPullRequestArrow,
  Mic,
  Paperclip,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { AgentCommandPicker, type AgentCommandPickerState } from "@/components/agents/chat/agent-command-picker";
import { AgentComposerControls } from "@/components/agents/chat/agent-composer-controls";
import { AgentConversationViewport } from "@/components/agents/chat/agent-conversation-viewport";
import { AgentPlanBanner } from "@/components/agents/chat/agent-plan-banner";
import { AgentTrustBanner } from "@/components/agents/chat/agent-trust-banner";
import { AgentUsagePill } from "@/components/agents/chat/agent-usage-pill";
import { AgentRateLimitChips } from "@/components/agents/chat/agent-rate-limit-chips";
import { AgentContextMeter } from "@/components/agents/ui/agent-context-meter";
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
import { barcodePrompt } from "@/lib/agents/barcode-spec";
import { browserE2ePrompt, readBrowserAddon } from "@/lib/agents/browser-addon";
import { chartPrompt } from "@/lib/agents/chart-spec";
import { listProviderCommands } from "@/lib/agents/cli-commands";
import {
  agentProviderMeta,
  providerSupportsCapabilityCenter,
} from "@/lib/agents/provider-meta";
import {
  isNativeSlashCommand,
  mergeSlashCommands,
  nativeSlashCommands,
  shouldRunNativeSlash,
  slashCommandLine,
  type AgentCliCommand,
} from "@/lib/agents/slash-commands";
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

function repoName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}


export const AgentChatPane = memo(function AgentChatPane({
  path,
  threadId,
  terminalVisible = false,
  onToggleTerminal,
  onOpenCapabilities,
  onOpenAddons,
}: {
  path: string;
  threadId: string | null;
  terminalVisible?: boolean;
  onToggleTerminal?: () => void;
  onOpenCapabilities?: (section?: AgentCapabilitySection) => void;
  onOpenAddons?: () => void;
  onOpenThreadsOverview?: () => void;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const isClaude = provider === "claude";
  const isCodex = provider === "codex";
  const providerLabel = agentProviderMeta(provider).label;
  const connectionStatus = useAgentChatStore((state) => state.connectionStatus);
  const connectionError = useAgentChatStore((state) => state.connectionError);
  const requiresAuth = useAgentChatStore((state) => state.requiresAuth);
  const loginStatus = useAgentChatStore((state) => state.loginStatus);
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
  const terminateBackgroundTerminal = useAgentChatStore((state) => state.terminateBackgroundTerminal);
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
  const [resourcePicker, setResourcePicker] = useState<"skill" | "app" | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [commandPicker, setCommandPicker] = useState<AgentCommandPickerState | null>(null);
  const [cliCommands, setCliCommands] = useState<AgentCliCommand[]>([]);
  const [scrollToBottomSignal, setScrollToBottomSignal] = useState(0);

  const busy = Boolean(conversationMeta.activeTurnId);
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

  useEffect(() => {
    let cancelled = false;
    void listProviderCommands(provider, path)
      .then((commands) => {
        if (!cancelled) setCliCommands(commands);
      })
      .catch(() => {
        if (!cancelled) setCliCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path, provider, threadId]);

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
      (true);
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

  const extraCliCommands = useMemo(
    () => cliCommands.filter((command) => !isNativeSlashCommand(command.name)),
    [cliCommands],
  );

  const slashCommands = useMemo<PromptSlashCommand[]>(
    () =>
      mergeSlashCommands(
        nativeSlashCommands({
          provider,
          providerLabel,
          isClaude,
          isCodex,
          threadId,
          busy,
          conversationExists: conversationMeta.exists,
          model,
          models,
          hasTerminalToggle: Boolean(onToggleTerminal),
        }),
        cliCommands,
      ),
    [busy, cliCommands, conversationMeta.exists, isClaude, isCodex, model, models, onToggleTerminal, provider, providerLabel, threadId],
  );

  const runSlashCommand = async (command: string, argument: string) => {
    try {
      if (!shouldRunNativeSlash(command, provider)) {
        await sendMessage(path, slashCommandLine(command, argument));
        return;
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
        const verbose = argument.toLocaleLowerCase() === "verbose";
        if (!servers.length) {
          setCommandPicker({ title: "MCP", detail: "No MCP servers configured" });
          return;
        }
        if (verbose) {
          setCommandPicker({
            title: "MCP",
            detail: servers.map((server) =>
              `${server.name} · ${server.authStatus}\n${server.tools.join(", ") || "No tools"}`,
            ).join("\n\n"),
          });
          return;
        }
        setCommandPicker({
          title: "MCP",
          items: servers.map((server) => ({
            id: server.name,
            label: server.name,
            description: `${server.tools.length} tools · ${server.authStatus}`,
          })),
          onSelect: (name) => {
            setCommandPicker(null);
            void runSlashCommand("mcp", name);
          },
        });
        return;
      }
      if (command === "hooks") {
        return onOpenCapabilities?.("hooks");
      }
      if (command === "marketplace") return onOpenCapabilities?.("market");
      if (command === "sync") return onOpenCapabilities?.("sync");
      if (command === "plugins") {
        return onOpenCapabilities?.("plugins");
      }
      if (command === "import") return setImportOpen(true);
      if (command === "terminal") return onToggleTerminal?.();
      if (command === "feedback") return setFeedbackOpen(true);
      if (command === "model") {
        if (!argument) {
          setCommandPicker({
            title: "Model",
            items: models.map((option) => ({
              id: option.id,
              label: option.label,
              description: `${option.id} · ${codexReasoningEffortLabel(option.defaultReasoningEffort)}`,
            })),
            onSelect: (id) => {
              setModel(id);
              setCommandPicker(null);
              toast.success(models.find((option) => option.id === id)?.label ?? id);
            },
          });
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
      if (command === "variants") {
        const selected = models.find((option) => option.id === model);
        const variants = selected?.reasoningEfforts ?? [];
        if (!variants.length) throw new Error("The selected model does not offer any variants.");
        if (!argument) {
          const current = useAgentChatStore.getState().reasoningEffort;
          setCommandPicker({
            title: "Variants",
            items: variants.map((variant) => ({
              id: variant.value,
              label: codexReasoningEffortLabel(variant.value),
              description: variant.value === current ? "Current" : variant.description || undefined,
            })),
            onSelect: (id) => {
              setCommandPicker(null);
              void runSlashCommand("variants", id);
            },
          });
          return;
        }
        const variant = variants.find((candidate) =>
          candidate.value.toLocaleLowerCase() === argument.toLocaleLowerCase(),
        );
        if (!variant) throw new Error(`Unknown variant: ${argument}`);
        setReasoningEffort(variant.value);
        toast.success(`${selected?.label ?? model} · ${codexReasoningEffortLabel(variant.value)}`);
        return;
      }
      if (command === "permissions") {
        if (!argument) {
          setCommandPicker({
            title: "Permissions",
            description: permissionProfiles.length
              ? undefined
              : "Open the settings menu to choose custom sandbox and approval rules.",
            items: [
              { id: "custom", label: "Custom" },
              ...permissionProfiles.map((profile) => ({
                id: profile.id,
                label: profile.id.replace(/^:/u, ""),
                description: profile.allowed ? "Available" : "Blocked",
                disabled: !profile.allowed,
              })),
            ],
            onSelect: (id) => {
              setCommandPicker(null);
              void runSlashCommand("permissions", id);
            },
          });
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
        if (!argument) {
          setCommandPicker({
            title: "Memory",
            items: [
              { id: "enabled", label: "Enabled" },
              { id: "disabled", label: "Disabled" },
              { id: "reset", label: "Reset all memories" },
            ],
            onSelect: (id) => {
              setCommandPicker(null);
              void runSlashCommand("memories", id);
            },
          });
          return;
        }
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
        if (!argument) {
          setCommandPicker({
            title: "Chart",
            input: { placeholder: "What to visualize", submitLabel: "Run" },
            onSubmit: (value) => {
              setCommandPicker(null);
              void sendMessage(path, chartPrompt(value));
            },
          });
          return;
        }
        await sendMessage(path, chartPrompt(argument));
        return;
      }
      if (command === "barcode") {
        if (!argument) {
          setCommandPicker({
            title: "Barcode",
            input: { placeholder: "Which values to encode", submitLabel: "Run" },
            onSubmit: (value) => {
              setCommandPicker(null);
              void sendMessage(path, barcodePrompt(value));
            },
          });
          return;
        }
        await sendMessage(path, barcodePrompt(argument));
        return;
      }
      if (command === "addons") return onOpenAddons?.();
      if (command === "browser") {
        if (!onOpenAddons) throw new Error("The browser addon is unavailable here.");
        if (!argument) {
          setCommandPicker({
            title: "Browser",
            input: { placeholder: "What to test", submitLabel: "Run" },
            onSubmit: (value) => {
              setCommandPicker(null);
              void runSlashCommand("browser", value);
            },
          });
          return;
        }
        const status = await readBrowserAddon(path, provider);
        if (!status.installed) {
          onOpenAddons();
          throw new Error("Install the browser addon first — the Addon Studio is open.");
        }
        await sendMessage(path, browserE2ePrompt(argument));
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
        if (!argument) {
          setCommandPicker({
            title: "Personality",
            items: [
              { id: "friendly", label: "Friendly" },
              { id: "pragmatic", label: "Pragmatic" },
              { id: "none", label: "None" },
            ],
            onSelect: (id) => {
              setCommandPicker(null);
              void runSlashCommand("personality", id);
            },
          });
          return;
        }
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
        else (true);
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
          const current = useAgentChatStore.getState().conversations[threadId]?.goal?.objective ?? "";
          setCommandPicker({
            title: "Goal",
            description: current || "No active goal",
            items: current ? [{ id: "clear", label: "Clear goal" }] : undefined,
            input: { placeholder: "Objective", submitLabel: "Set goal" },
            onSelect: (id) => {
              setCommandPicker(null);
              if (id === "clear") void runSlashCommand("goal", "clear");
            },
            onSubmit: (value) => {
              setCommandPicker(null);
              void runSlashCommand("goal", value);
            },
          });
        }
        return;
      }
      if (command === "ps") {
        const terminals = await listBackgroundTerminals(threadId);
        setCommandPicker({
          title: "Background terminals",
          detail: terminals.length ? undefined : "No background terminals",
          items: terminals.map((terminal) => ({
            id: terminal.processId,
            label: terminal.command,
            description: terminal.processId,
          })),
          onSelect: (processId) => {
            setCommandPicker(null);
            void terminateBackgroundTerminal(threadId, processId)
              .then(() => toast.success("Terminal stopped"))
              .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
          },
        });
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
          ? `${Math.round((usage.totalTokens / usage.modelContextWindow) * 100)}% context`
          : null;
        setCommandPicker({
          title: "Status",
          detail: [
            model ?? "Default model",
            codexReasoningEffortLabel(useAgentChatStore.getState().reasoningEffort),
            useAgentChatStore.getState().permissionProfile ?? useAgentChatStore.getState().sandboxMode,
            context,
          ].filter(Boolean).join(" · "),
        });
        return;
      }
      if (command === "usage") {
        const state = useAgentChatStore.getState();
        const primary = state.rateLimits?.primary;
        const lifetime = state.accountUsage?.lifetimeTokens;
        setCommandPicker({
          title: "Usage",
          detail: [
            primary ? `${Math.round(primary.usedPercent)}% of current limit used` : null,
            lifetime !== null && lifetime !== undefined ? `${lifetime.toLocaleString()} lifetime tokens` : null,
            state.accountUsage?.currentStreakDays ? `${state.accountUsage.currentStreakDays}-day streak` : null,
          ].filter(Boolean).join("\n") || "No usage data available",
        });
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

  const attachmentChips = attachments.length > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <span
          key={attachment.path}
          className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] inline-flex max-w-56 items-center gap-1.5 rounded-[9px] px-2 py-1 text-[11px]"
          title={attachment.path}
        >
          {attachment.type === "localImage" ? (
            <FileImage className="text-[var(--ag-text-3)] size-3 shrink-0" />
          ) : attachment.type === "localAudio" ? (
            <Mic className="text-[var(--ag-text-3)] size-3 shrink-0" />
          ) : attachment.type === "skill" ? (
            <Sparkles className="text-[var(--ag-text-3)] size-3 shrink-0" />
          ) : (
            <File className="text-[var(--ag-text-3)] size-3 shrink-0" />
          )}
          <span className="truncate">{attachment.name}</span>
          <button
            type="button"
            aria-label={t("agentChat.removeAttachment", { name: attachment.name })}
            onClick={() => setAttachments((current) => current.filter((item) => item.path !== attachment.path))}
            className="grid size-7 place-items-center rounded-full text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 size-4"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
    </div>
  ) : null;

  const composer = (
    <div className="min-w-0 w-full">
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

      <div
        data-agent-composer-dock=""
        className="mx-2 flex min-w-0 items-center gap-2 overflow-hidden rounded-b-[var(--ag-r-lg)] border border-t-0 border-[var(--ag-line)] bg-[var(--ag-dock-bg)] px-3 py-1.5 text-[11px] shadow-[0_8px_22px_-18px_rgb(20_32_38_/_0.45)] max-sm:flex-wrap"
      >
        <span className="text-[var(--ag-text-3)] flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
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
              className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 h-5 gap-1 px-1.5 text-[11px]"
              title={branchPr.title}
              onClick={() => void openUrl(branchPr.html_url).catch(() => {})}
            >
              <GitPullRequestArrow className="size-3 shrink-0" />
              <span className="tabular-nums">#{branchPr.number}</span>
            </button>
          ) : null}
        </span>

        {conversationMeta.goalObjective && threadId ? (
          <span className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] ml-1 inline-flex min-w-0 max-w-64 items-center gap-1.5 rounded-full px-2 py-0.5">
            <span className="text-[var(--ag-text-3)] shrink-0">{t("agentChat.goal")}</span>
            <span className="truncate">{conversationMeta.goalObjective}</span>
            <button
              type="button"
              className="grid size-7 place-items-center rounded-full text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 size-4"
              aria-label={t("agentChat.clearGoal")}
              onClick={() => void clearGoal(threadId).catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : String(error)),
              )}
            >
              <X className="size-2.5" />
            </button>
          </span>
        ) : null}

        <span className="text-[var(--ag-text-3)] ml-auto flex min-w-0 max-w-[58%] shrink items-center justify-end gap-1.5 overflow-hidden">
          <AgentUsagePill
            usage={conversationMeta.usage}
            model={conversationMeta.usageModel || model}
          />
          <AgentContextMeter usage={conversationMeta.usage} />
          <AgentRateLimitChips />
          {onToggleTerminal ? (
            <button
              type="button"
              className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
              data-active={terminalVisible || undefined}
              onClick={onToggleTerminal}
              aria-pressed={terminalVisible}
              title={`${t("commitPanel.terminalToggleInApp")} (Ctrl+\`)`}
              aria-label={t("commitPanel.terminalToggleInApp")}
            >
              <SquareTerminal className="size-3.5" />
            </button>
          ) : null}
          {threadId ? <AgentThreadMenu path={path} threadId={threadId} busy={busy} /> : null}
        </span>
      </div>
    </div>
  );

  return (
    <section
      data-agent-chat=""
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >

      <div className="shrink-0 px-4 md:px-6">
        <AgentTrustBanner path={path} />
        <AgentPlanBanner />
      </div>

      <AgentConversationViewport
        path={path}
        threadId={threadId}
        centered={centeredComposer}
        composer={composer}
        onStarter={setDraft}
        cliCommands={extraCliCommands}
        onCliCommand={(command) => {
          if (command.argumentHint) setDraft(`/${command.name} `);
          else void runSlashCommand(command.name, "");
        }}
        scrollToBottomSignal={scrollToBottomSignal}
      />

      {centeredComposer ? null : (
        <div
          data-agent-composer-shell=""
          className="relative z-10 min-w-0 shrink-0 bg-[linear-gradient(to_bottom,transparent,var(--ag-stage-bg)_38%)] px-4 pb-4 pt-2 md:px-6"
        >
          <div className="max-w-224 mx-auto min-w-0 w-full">{composer}</div>
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
      <AgentCommandPicker
        picker={commandPicker}
        onOpenChange={(open) => {
          if (!open) setCommandPicker(null);
        }}
      />
    </section>
  );
});
