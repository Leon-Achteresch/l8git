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
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<NativeAgentProvider>(provider);
  const [query, setQuery] = useState("");
  const [warming, setWarming] = useState(false);

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
    if (!open) return;
    if (visiblePane === "claude" || visiblePane === "opencode" || visiblePane === "cursor") {
      const warm =
        visiblePane === "claude"
          ? warmClaudeModelCatalog
          : visiblePane === "cursor"
            ? warmCursorModelCatalog
            : warmOpenCodeModelCatalog;
      setWarming(true);
      void warm(path).catch(() => {}).finally(() => setWarming(false));
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
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPane(provider);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="ag-chip" title={t("agentChat.settings.model")}>
          <span className="grid size-3.5 shrink-0 place-items-center [&_svg]:size-3.5">
            <ActiveLogo />
          </span>
          <span className="max-w-40 truncate font-medium text-[var(--ag-text)]">{currentLabel}</span>
          <ChevronDown className="ag-faint size-3 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="ag-menu w-[336px] gap-0 p-0"
      >
        <div className="flex min-h-0">
          {providerLocked ? null : (
            <div className="ag-line flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2">
              {AGENT_PROVIDERS.map(({ value, label, Logo }) => (
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
            <div className="ag-line flex items-center gap-1.5 border-b px-3 py-2">
              <Search className="ag-faint size-3.5 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("agentChat.searchModels")}
                aria-label={t("agentChat.searchModels")}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ag-text)] outline-none placeholder:text-[var(--ag-text-3)]"
              />
            </div>

            <div className="ag-scroll max-h-64 min-h-0 overflow-y-auto p-1.5">
              {models.length === 0 && paneModels.length > 0 ? (
                <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.noMatchingModels")}</p>
              ) : models.length === 0 && (warming || paneStatus === "connecting") ? (
                <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.loadingModels")}</p>
              ) : models.length === 0 ? (
                <button
                  type="button"
                  onClick={() => select(visiblePane, null)}
                  className="ag-row h-auto items-start gap-2 px-2 py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-[var(--ag-text)]">
                      {paneMeta.label}
                    </span>
                    <span className="ag-faint mt-0.5 flex items-center gap-1 text-[10px]">
                      <PaneLogo className="size-2.5 shrink-0" />
                      {t("agentChat.noModels")}
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
                      className="ag-row h-auto items-start gap-2 px-2 py-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-[var(--ag-text)]">
                          {option.label}
                        </span>
                        <span className="ag-faint mt-0.5 flex items-center gap-1 text-[10px]">
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
