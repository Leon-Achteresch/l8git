import {
  Bot,
  Compass,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { AgentControlPill } from "@/components/agents/chat/agent-control-pill";
import { AgentModelPicker } from "@/components/agents/chat/agent-model-picker";
import { AgentOpenCodeConfigPills } from "@/components/agents/chat/agent-opencode-config-pills";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { codexReasoningEffortLabel } from "@/lib/agents/codex-labels";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type {
  AgentApprovalPolicy,
  AgentCollaborationMode,
  AgentPersonality,
  AgentReasoningEffort,
  AgentSandboxMode,
} from "@/lib/agents/types";

const CLAUDE_EFFORTS: AgentReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
const RADIO_CLASS = "rounded-[9px] py-1.5 text-[12px]";

function permissionProfileLabel(id: string): string {
  return id
    .replace(/^:/u, "")
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
  const collaborationMode = useAgentChatStore(
    (state) => state.collaborationMode,
  );
  const permissionProfiles = useAgentChatStore(
    (state) => state.permissionProfiles,
  );
  const permissionProfile = useAgentChatStore(
    (state) => state.permissionProfile,
  );
  const model = useAgentChatStore((state) => state.model);
  const models = useAgentChatStore((state) => state.models);
  const setEffort = useAgentChatStore((state) => state.setReasoningEffort);
  const setSandbox = useAgentChatStore((state) => state.setSandboxMode);
  const setApproval = useAgentChatStore((state) => state.setApprovalPolicy);
  const setServiceTier = useAgentChatStore((state) => state.setServiceTier);
  const setPersonality = useAgentChatStore((state) => state.setPersonality);
  const setCollaborationMode = useAgentChatStore(
    (state) => state.setCollaborationMode,
  );
  const loadPermissionProfiles = useAgentChatStore(
    (state) => state.loadPermissionProfiles,
  );
  const setPermissionProfile = useAgentChatStore(
    (state) => state.setPermissionProfile,
  );

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
  const agentModePill =
    provider === "opencode" && permissionProfiles.length > 0;
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
        <AgentControlPill
          icon={<Gauge />}
          label={codexReasoningEffortLabel(effort)}
          title={t("agentChat.settings.effort")}
        >
          <DropdownMenuLabel className="ag-label">
            {t("agentChat.settings.effort")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={effort}
            onValueChange={(value) => setEffort(value as AgentReasoningEffort)}
          >
            {supportedEfforts.map((item) => (
              <DropdownMenuRadioItem
                key={item.value}
                value={item.value}
                className={RADIO_CLASS}
              >
                <span className="min-w-0 flex-1">
                  {codexReasoningEffortLabel(item.value)}
                </span>
                {item.value === selectedModel?.defaultReasoningEffort ? (
                  <span className="ag-faint text-[10px]">
                    {t("agentChat.settings.default")}
                  </span>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {selectedModel?.serviceTiers.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="ag-label">
                {t("agentChat.settings.speed")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={serviceTier ?? "__default"}
                onValueChange={(value) =>
                  setServiceTier(value === "__default" ? null : value)
                }
              >
                <DropdownMenuRadioItem value="__default" className={RADIO_CLASS}>
                  {t("agentChat.settings.standard")}
                </DropdownMenuRadioItem>
                {selectedModel.serviceTiers.map((tier) => (
                  <DropdownMenuRadioItem
                    key={tier.id}
                    value={tier.id}
                    className={RADIO_CLASS}
                  >
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
                onValueChange={(value) =>
                  setPersonality(value as AgentPersonality)
                }
              >
                {(
                  ["friendly", "pragmatic", "none"] as AgentPersonality[]
                ).map((value) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    className={RADIO_CLASS}
                  >
                    {value === "friendly"
                      ? "Friendly"
                      : value === "pragmatic"
                        ? "Pragmatic"
                        : "None"}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) : null}
        </AgentControlPill>
      ) : null}

      {provider === "opencode" ? <AgentOpenCodeConfigPills /> : null}

      {agentModePill ? (
        <AgentControlPill
          icon={<Bot />}
          label={
            permissionProfile
              ? permissionProfileLabel(permissionProfile)
              : t("agentChat.settings.agent")
          }
          title={t("agentChat.settings.agent")}
        >
          <DropdownMenuLabel className="ag-label">
            {t("agentChat.settings.agent")}
          </DropdownMenuLabel>
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
        </AgentControlPill>
      ) : null}

      <AgentControlPill
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
              onValueChange={(value) =>
                setPermissionProfile(value === "__custom" ? null : value)
              }
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

        <DropdownMenuLabel className="ag-label">
          {t("agentChat.settings.sandbox")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sandbox}
          onValueChange={(value) => setSandbox(value as AgentSandboxMode)}
        >
          {sandboxes.map((item) => (
            <DropdownMenuRadioItem
              key={item.value}
              value={item.value}
              className={RADIO_CLASS}
            >
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
            <DropdownMenuRadioItem
              key={item.value}
              value={item.value}
              className={RADIO_CLASS}
            >
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {unrestricted ? (
          <p className="mx-1 mb-0.5 mt-1 rounded-[9px] bg-destructive/10 px-2 py-1.5 text-[10px] leading-4 text-destructive">
            {t("agentChat.settings.unrestrictedWarning")}
          </p>
        ) : null}
      </AgentControlPill>

      <AgentControlPill
        icon={<Compass />}
        label={
          collaborationMode === "plan"
            ? t("agentChat.settings.planMode")
            : t("agentChat.settings.defaultMode")
        }
        title={t("agentChat.settings.mode")}
      >
        <DropdownMenuLabel className="ag-label">
          {t("agentChat.settings.mode")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={collaborationMode}
          onValueChange={(value) =>
            setCollaborationMode(value as AgentCollaborationMode)
          }
        >
          <DropdownMenuRadioItem value="default" className={RADIO_CLASS}>
            {t("agentChat.settings.defaultMode")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="plan" className={RADIO_CLASS}>
            {t("agentChat.settings.planMode")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </AgentControlPill>
    </>
  );
}
