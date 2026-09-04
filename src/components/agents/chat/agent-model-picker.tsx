import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chatStoreFor, useAgentChatStore, useProviderChatStore } from "@/lib/agents/active-chat-store";
import { AGENT_PROVIDERS, agentProviderMeta } from "@/lib/agents/provider-meta";
import { warmClaudeModelCatalog } from "@/lib/agents/providers/claude/chat-store";
import { warmCursorModelCatalog } from "@/lib/agents/providers/cursor/chat-store";
import { warmOpenCodeModelCatalog } from "@/lib/agents/providers/opencode/chat-store";
import { useAgentProviderStore, type NativeAgentProvider } from "@/lib/agents/provider-store";
import { detectInstalledAgents, useInstalledAgents } from "@/lib/agent-integrations";
import type { AgentModelOption } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

const EMPTY_MODELS: AgentModelOption[] = [];

export function AgentModelPicker({
  path,
  providerLocked = false,
}: {
  path: string;
  providerLocked?: boolean;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const setProvider = useAgentProviderStore((state) => state.setProvider);
  const model = useAgentChatStore((state) => state.model);
  const codexModels = useProviderChatStore("codex", (state) => state.models ?? EMPTY_MODELS);
  const claudeModels = useProviderChatStore("claude", (state) => state.models ?? EMPTY_MODELS);
  const openCodeModels = useProviderChatStore("opencode", (state) => state.models ?? EMPTY_MODELS);
  const cursorModels = useProviderChatStore("cursor", (state) => state.models ?? EMPTY_MODELS);
  const codexStatus = useProviderChatStore("codex", (state) => state.connectionStatus);
  const claudeStatus = useProviderChatStore("claude", (state) => state.connectionStatus);
  const openCodeStatus = useProviderChatStore("opencode", (state) => state.connectionStatus);
  const cursorStatus = useProviderChatStore("cursor", (state) => state.connectionStatus);
  const installed = useInstalledAgents((state) => state.installed);
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<NativeAgentProvider>(provider);
  const [query, setQuery] = useState("");
  const [warming, setWarming] = useState(false);
  const [warmError, setWarmError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeForPrompt = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-agent-prompt]")) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("focusin", closeForPrompt);
    document.addEventListener("pointerdown", closeForPrompt, true);
    return () => {
      document.removeEventListener("focusin", closeForPrompt);
      document.removeEventListener("pointerdown", closeForPrompt, true);
    };
  }, [open]);

  useEffect(() => {
    detectInstalledAgents();
  }, []);

  const visibleProviders = useMemo(() => {
    if (!installed) return AGENT_PROVIDERS;
    const filtered = AGENT_PROVIDERS.filter((entry) => installed.has(entry.value));
    return filtered.length > 0 ? filtered : AGENT_PROVIDERS;
  }, [installed]);

  const activeMeta = agentProviderMeta(provider);
  const ActiveLogo = activeMeta.Logo;
  const visiblePane = providerLocked ? provider : pane;
  const paneMeta = agentProviderMeta(visiblePane);
  const PaneLogo = paneMeta.Logo;
  const modelsByProvider: Record<NativeAgentProvider, AgentModelOption[]> = {
    codex: codexModels,
    claude: claudeModels,
    opencode: openCodeModels,
    cursor: cursorModels,
  };
  const statusByProvider: Record<NativeAgentProvider, typeof codexStatus> = {
    codex: codexStatus,
    claude: claudeStatus,
    opencode: openCodeStatus,
    cursor: cursorStatus,
  };
  const paneModels = modelsByProvider[visiblePane];
  const paneStatus = statusByProvider[visiblePane];
  const activeModels = modelsByProvider[provider];
  const currentLabel =
    activeModels.find((option) => option.id === model)?.label ?? model ?? activeMeta.label;

  const models = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return paneModels;
    return paneModels.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(needle) ||
        option.id.toLocaleLowerCase().includes(needle),
    );
  }, [paneModels, query]);

  useEffect(() => {
    if (!path) return;
    if (!claudeModels.length) void warmClaudeModelCatalog(path).catch(() => {});
    if (!cursorModels.length) void warmCursorModelCatalog(path).catch(() => {});
    if (!openCodeModels.length) void warmOpenCodeModelCatalog(path).catch(() => {});
    if (!codexModels.length) void chatStoreFor("codex").getState().connect().catch(() => {});
  }, [path]);

  useEffect(() => {
    if (!open) return;
    if (paneModels.length > 0) return;
    if (visiblePane === "claude" || visiblePane === "opencode" || visiblePane === "cursor") {
      const warm =
        visiblePane === "claude"
          ? warmClaudeModelCatalog
          : visiblePane === "cursor"
            ? warmCursorModelCatalog
            : warmOpenCodeModelCatalog;
      setWarming(true);
      setWarmError(null);
      void warm(path)
        .catch((error: unknown) => setWarmError(error instanceof Error ? error.message : String(error)))
        .finally(() => setWarming(false));
      return;
    }
    if (paneModels.length === 0) {
      void chatStoreFor("codex").getState().connect().catch(() => {});
    }
  }, [open, paneModels.length, path, visiblePane]);

  const select = (nextProvider: NativeAgentProvider, modelId: string | null) => {
    const store = chatStoreFor(nextProvider);
    if (nextProvider !== provider) {
      store.setState((state) => ({
        activeThreadByPath: { ...state.activeThreadByPath, [path]: null },
      }));
      setProvider(nextProvider);
    }
    if (modelId) store.getState().setModel(modelId);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const defaultPane = visibleProviders.some((p) => p.value === provider)
            ? provider
            : visibleProviders[0]?.value ?? provider;
          setPane(defaultPane);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
          title={t("agentChat.settings.model")}
          aria-label={t("agentChat.settings.model")}
        >
          <span className="grid size-3.5 shrink-0 place-items-center [&_svg]:size-3.5">
            <ActiveLogo />
          </span>
          <span className="max-w-40 truncate font-medium text-[var(--ag-text)]">{currentLabel}</span>
          <ChevronDown className="text-[var(--ag-text-3)] size-3 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="overflow-hidden rounded-[var(--ag-r-lg)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[var(--ag-shadow-pop)] w-[336px] gap-0 p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex min-h-0">
          {providerLocked || visibleProviders.length <= 1 ? null : (
            <div className="border-[var(--ag-line)] flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2">
              {visibleProviders.map(({ value, label, Logo }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={visiblePane === value}
                  onClick={() => setPane(value)}
                  className={cn(
                    "grid size-8 place-items-center rounded-[9px] transition-colors",
                    visiblePane === value
                      ? "bg-[var(--ag-hover)] text-[var(--ag-text)]"
                      : "text-[var(--ag-text-3)] hover:bg-[var(--ag-hover)]",
                  )}
                >
                  <Logo className="size-4" />
                </button>
              ))}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-[var(--ag-line)] flex items-center gap-1.5 border-b px-3 py-2">
              <Search className="text-[var(--ag-text-3)] size-3.5 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("agentChat.searchModels")}
                aria-label={t("agentChat.searchModels")}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ag-text)] outline-none placeholder:text-[var(--ag-text-3)]"
              />
            </div>

            <div className="[scrollbar-color:color-mix(in_oklab,var(--foreground)_16%,transparent)_transparent] [scrollbar-width:thin] max-h-64 min-h-0 overflow-y-auto p-1.5">
              {models.length === 0 && paneModels.length > 0 ? (
                <p className="text-[var(--ag-text-3)] px-2 py-3 text-[11px]">{t("agentChat.noMatchingModels")}</p>
              ) : models.length === 0 && (warming || paneStatus === "connecting") ? (
                <p className="text-[var(--ag-text-3)] px-2 py-3 text-[11px]">{t("agentChat.loadingModels")}</p>
              ) : models.length === 0 ? (
                <button
                  type="button"
                  onClick={() => select(visiblePane, null)}
                  className="relative flex w-full min-w-0 items-center gap-2 rounded-[var(--ag-r-md)] px-2 text-left text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform,box-shadow] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:bg-[var(--ag-press)] focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-[var(--ag-surface)] data-[active=true]:text-[var(--ag-text)] data-[active=true]:shadow-[var(--ag-shadow-raise)] h-auto items-start gap-2 px-2 py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-[var(--ag-text)]">
                      {paneMeta.label}
                    </span>
                    <span className="text-[var(--ag-text-3)] mt-0.5 flex items-center gap-1 text-[10px]">
                      <PaneLogo className="size-2.5 shrink-0" />
                      {warmError ?? t("agentChat.noModels")}
                    </span>
                  </span>
                  {visiblePane === provider ? <Check className="mt-0.5 size-3.5 shrink-0" /> : null}
                </button>
              ) : (
                models.map((option) => {
                  const selected = visiblePane === provider && option.id === model;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => select(visiblePane, option.id)}
                      className="relative flex w-full min-w-0 items-center gap-2 rounded-[var(--ag-r-md)] px-2 text-left text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform,box-shadow] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:bg-[var(--ag-press)] focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-[var(--ag-surface)] data-[active=true]:text-[var(--ag-text)] data-[active=true]:shadow-[var(--ag-shadow-raise)] h-auto items-start gap-2 px-2 py-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-[var(--ag-text)]">
                          {option.label}
                        </span>
                        <span className="text-[var(--ag-text-3)] mt-0.5 flex items-center gap-1 text-[10px]">
                          <PaneLogo className="size-2.5 shrink-0" />
                          {paneMeta.label}
                        </span>
                      </span>
                      {selected ? <Check className="mt-0.5 size-3.5 shrink-0" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
