import { Bot, ChevronDown, Compass, Gauge, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentModelPicker } from "@/components/agents/chat/agent-model-picker";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { openCodeChatStore } from "@/lib/agents/providers/opencode/chat-store";
import { codexReasoningEffortLabel } from "@/lib/agents/codex-labels";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { SPRING_PRESS } from "@/lib/motion/ease";
import type {
  AgentApprovalPolicy,
  AgentCollaborationMode,
  AgentPersonality,
  AgentReasoningEffort,
  AgentSandboxMode,
} from "@/lib/agents/types";

/*
 * Claude Code's model catalog only arrives once the CLI has reported it on
 * initialize, and older CLIs never do. Its effort levels are fixed, so fall
 * back to them rather than rendering an empty picker.
 */
const CLAUDE_EFFORTS: AgentReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

function permissionProfileLabel(id: string): string {
  return id
    .replace(/^:/u, "")
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function ControlPill({
  icon,
  label,
  title,
  tone = "default",
  children,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  tone?: "default" | "warning";
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <m.button
          type="button"
          className="ag-chip"
          title={title}
          aria-label={title}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          transition={SPRING_PRESS}
        >
          <span
            className={`grid size-3.5 shrink-0 place-items-center ${
              tone === "warning" ? "text-[var(--destructive)]" : ""
            } [&_svg]:size-3.5`}
          >
            {icon}
          </span>
          <span className="max-w-32 truncate">{label}</span>
          <ChevronDown className="ag-faint size-3 shrink-0" />
        </m.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={8} className="ag-menu w-60 p-1.5">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const RADIO_CLASS = "rounded-[9px] py-1.5 text-[12px]";

const BOOLEAN_ON = "__on";
const BOOLEAN_OFF = "__off";

/**
 * opencode meldet neben Modell, Agent und Denk-Aufwand weitere Session-Optionen
 * – aktuell vor allem die Modell-Variante. Welche das sind, haengt von CLI und
 * Provider ab, also wird der gemeldete Katalog generisch als Pill gerendert.
 */
function OpenCodeConfigPills() {
  const { t } = useTranslation();
  const selections = useStore(openCodeChatStore, (state) => state.configSelections);
  const setSelection = useStore(openCodeChatStore, (state) => state.setConfigSelection);

  return (
    <>
      {selections.map((selection) => {
        const label =
          selection.type === "boolean"
            ? selection.value
              ? t("agentChat.settings.on")
              : t("agentChat.settings.off")
            : (selection.choices.find((choice) => choice.value === selection.value)?.label ??
              String(selection.value || t("agentChat.settings.default")));
        return (
          <ControlPill
            key={selection.id}
            icon={<SlidersHorizontal />}
            label={label}
            title={selection.description || selection.name}
          >
            <DropdownMenuLabel className="ag-label">{selection.name}</DropdownMenuLabel>
            {selection.type === "boolean" ? (
              <DropdownMenuRadioGroup
                value={selection.value ? BOOLEAN_ON : BOOLEAN_OFF}
                onValueChange={(value) => setSelection(selection.id, value === BOOLEAN_ON)}
              >
                <DropdownMenuRadioItem value={BOOLEAN_ON} className={RADIO_CLASS}>
                  {t("agentChat.settings.on")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value={BOOLEAN_OFF} className={RADIO_CLASS}>
                  {t("agentChat.settings.off")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            ) : (
              <DropdownMenuRadioGroup
                value={typeof selection.value === "string" ? selection.value : ""}
                onValueChange={(value) => setSelection(selection.id, value)}
              >
                {selection.choices.map((choice) => (
                  <DropdownMenuRadioItem
                    key={choice.value}
                    value={choice.value}
                    className={RADIO_CLASS}
                    title={choice.description || undefined}
                  >
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )}
          </ControlPill>
        );
      })}
    </>
  );
}

export function AgentComposerControls({
  path,
  providerLocked = false,
}: {
  path: string;
  providerLocked?: boolean;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const effort = useAgentChatStore((state) => state.reasoningEffort);
  const sandbox = useAgentChatStore((state) => state.sandboxMode);
  const approval = useAgentChatStore((state) => state.approvalPolicy);
  const serviceTier = useAgentChatStore((state) => state.serviceTier);
  const personality = useAgentChatStore((state) => state.personality);
  const collaborationMode = useAgentChatStore((state) => state.collaborationMode);
  const permissionProfiles = useAgentChatStore((state) => state.permissionProfiles);
  const permissionProfile = useAgentChatStore((state) => state.permissionProfile);
  const model = useAgentChatStore((state) => state.model);
  const models = useAgentChatStore((state) => state.models);
  const setEffort = useAgentChatStore((state) => state.setReasoningEffort);
  const setSandbox = useAgentChatStore((state) => state.setSandboxMode);
  const setApproval = useAgentChatStore((state) => state.setApprovalPolicy);
  const setServiceTier = useAgentChatStore((state) => state.setServiceTier);
  const setPersonality = useAgentChatStore((state) => state.setPersonality);
  const setCollaborationMode = useAgentChatStore((state) => state.setCollaborationMode);
  const loadPermissionProfiles = useAgentChatStore((state) => state.loadPermissionProfiles);
  const setPermissionProfile = useAgentChatStore((state) => state.setPermissionProfile);

  const selectedModel = models.find((candidate) => candidate.id === model);
  const catalogEfforts = selectedModel?.reasoningEfforts ?? [];
  const supportedEfforts = catalogEfforts.length
    ? catalogEfforts
    : provider === "claude"
      ? CLAUDE_EFFORTS.map((value) => ({
          value,
          label: codexReasoningEffortLabel(value),
          description: "",
        }))
      : [];
  const sandboxes: Array<{ value: AgentSandboxMode; label: string }> = [
    { value: "read-only", label: t("agentChat.settings.readOnly") },
    { value: "workspace-write", label: t("agentChat.settings.workspaceWrite") },
    { value: "danger-full-access", label: t("agentChat.settings.fullAccess") },
  ];
  const approvals: Array<{ value: AgentApprovalPolicy; label: string }> = [
    { value: "on-request", label: t("agentChat.settings.askWhenNeeded") },
    { value: "untrusted", label: t("agentChat.settings.untrustedOnly") },
    { value: "never", label: t("agentChat.settings.neverAsk") },
  ];
  const unrestricted = sandbox === "danger-full-access" && approval === "never";
  const agentModePill = provider === "opencode" && permissionProfiles.length > 0;
  const accessLabel =
    !agentModePill && permissionProfile
      ? permissionProfileLabel(permissionProfile)
      : (sandboxes.find((item) => item.value === sandbox)?.label ?? sandbox);

  useEffect(() => {
    void loadPermissionProfiles(path).catch(() => {});
  }, [loadPermissionProfiles, path]);

  return (
    <>
      <AgentModelPicker path={path} providerLocked={providerLocked} />

      {supportedEfforts.length ? (
      <ControlPill
        icon={<Gauge />}
        label={codexReasoningEffortLabel(effort)}
        title={t("agentChat.settings.effort")}
      >
        <DropdownMenuLabel className="ag-label">{t("agentChat.settings.effort")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={effort}
          onValueChange={(value) => setEffort(value as AgentReasoningEffort)}
        >
          {supportedEfforts.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className={RADIO_CLASS}>
              <span className="min-w-0 flex-1">{codexReasoningEffortLabel(item.value)}</span>
              {item.value === selectedModel?.defaultReasoningEffort ? (
                <span className="ag-faint text-[10px]">{t("agentChat.settings.default")}</span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {selectedModel?.serviceTiers.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="ag-label">{t("agentChat.settings.speed")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={serviceTier ?? "__default"}
              onValueChange={(value) => setServiceTier(value === "__default" ? null : value)}
            >
              <DropdownMenuRadioItem value="__default" className={RADIO_CLASS}>
                {t("agentChat.settings.standard")}
              </DropdownMenuRadioItem>
              {selectedModel.serviceTiers.map((tier) => (
                <DropdownMenuRadioItem key={tier.id} value={tier.id} className={RADIO_CLASS}>
                  {tier.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}

        {selectedModel?.supportsPersonality ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="ag-label">
              {t("agentChat.settings.personality")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={personality}
              onValueChange={(value) => setPersonality(value as AgentPersonality)}
            >
              {(["friendly", "pragmatic", "none"] as AgentPersonality[]).map((value) => (
                <DropdownMenuRadioItem key={value} value={value} className={RADIO_CLASS}>
                  {value === "friendly" ? "Friendly" : value === "pragmatic" ? "Pragmatic" : "None"}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </ControlPill>
      ) : null}

      {provider === "opencode" ? <OpenCodeConfigPills /> : null}

      {agentModePill ? (
        <ControlPill
          icon={<Bot />}
          label={permissionProfile ? permissionProfileLabel(permissionProfile) : t("agentChat.settings.agent")}
          title={t("agentChat.settings.agent")}
        >
          <DropdownMenuLabel className="ag-label">{t("agentChat.settings.agent")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={permissionProfile ?? ""}
            onValueChange={(value) => setPermissionProfile(value)}
          >
            {permissionProfiles.map((profile) => (
              <DropdownMenuRadioItem
                key={profile.id}
                value={profile.id}
                disabled={!profile.allowed}
                className={RADIO_CLASS}
                title={profile.description ?? undefined}
              >
                {permissionProfileLabel(profile.id)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </ControlPill>
      ) : null}

      <ControlPill
        icon={<ShieldCheck />}
        label={accessLabel}
        title={t("agentChat.settings.sandbox")}
        tone={unrestricted ? "warning" : "default"}
      >
        {!agentModePill && permissionProfiles.length ? (
          <>
            <DropdownMenuLabel className="ag-label">
              {t("agentChat.settings.profile")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={permissionProfile ?? "__custom"}
              onValueChange={(value) => setPermissionProfile(value === "__custom" ? null : value)}
            >
              <DropdownMenuRadioItem value="__custom" className={RADIO_CLASS}>
                {t("agentChat.settings.custom")}
              </DropdownMenuRadioItem>
              {permissionProfiles.map((profile) => (
                <DropdownMenuRadioItem
                  key={profile.id}
                  value={profile.id}
                  disabled={!profile.allowed}
                  className={RADIO_CLASS}
                  title={profile.description ?? undefined}
                >
                  {permissionProfileLabel(profile.id)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuLabel className="ag-label">{t("agentChat.settings.sandbox")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sandbox}
          onValueChange={(value) => setSandbox(value as AgentSandboxMode)}
        >
          {sandboxes.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className={RADIO_CLASS}>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="ag-label">
          {t("agentChat.settings.approvals")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={approval}
          onValueChange={(value) => setApproval(value as AgentApprovalPolicy)}
        >
          {approvals.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className={RADIO_CLASS}>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {unrestricted ? (
          <p className="mx-1 mb-0.5 mt-1 rounded-[9px] bg-destructive/10 px-2 py-1.5 text-[10px] leading-4 text-destructive">
            {t("agentChat.settings.unrestrictedWarning")}
          </p>
        ) : null}
      </ControlPill>

      <ControlPill
        icon={<Compass />}
        label={
          collaborationMode === "plan"
            ? t("agentChat.settings.planMode")
            : t("agentChat.settings.defaultMode")
        }
        title={t("agentChat.settings.mode")}
      >
        <DropdownMenuLabel className="ag-label">{t("agentChat.settings.mode")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={collaborationMode}
          onValueChange={(value) => setCollaborationMode(value as AgentCollaborationMode)}
        >
          <DropdownMenuRadioItem value="default" className={RADIO_CLASS}>
            {t("agentChat.settings.defaultMode")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="plan" className={RADIO_CLASS}>
            {t("agentChat.settings.planMode")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </ControlPill>
    </>
  );
}
