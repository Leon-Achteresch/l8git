import { Settings2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { codexReasoningEffortLabel } from "@/lib/agents/codex-labels";
import type {
  AgentApprovalPolicy,
  AgentCollaborationMode,
  AgentPersonality,
  AgentRealtimeVoice,
  AgentReasoningEffort,
  AgentSandboxMode,
} from "@/lib/agents/types";

function permissionProfileLabel(id: string): string {
  return id
    .replace(/^:/u, "")
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function AgentSettingsMenu({ path }: { path: string }) {
  const { t } = useTranslation();
  const effort = useAgentChatStore((state) => state.reasoningEffort);
  const sandbox = useAgentChatStore((state) => state.sandboxMode);
  const approval = useAgentChatStore((state) => state.approvalPolicy);
  const serviceTier = useAgentChatStore((state) => state.serviceTier);
  const personality = useAgentChatStore((state) => state.personality);
  const collaborationMode = useAgentChatStore((state) => state.collaborationMode);
  const permissionProfiles = useAgentChatStore((state) => state.permissionProfiles);
  const permissionProfile = useAgentChatStore((state) => state.permissionProfile);
  const realtimeVoices = useAgentChatStore((state) => state.realtimeVoices);
  const realtimeVoice = useAgentChatStore((state) => state.realtimeVoice);
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
  const setRealtimeVoice = useAgentChatStore((state) => state.setRealtimeVoice);
  const supportedEfforts = models.find((candidate) => candidate.id === model)?.reasoningEfforts ?? [];
  const selectedModel = models.find((candidate) => candidate.id === model);
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

  useEffect(() => {
    void loadPermissionProfiles(path).catch(() => {});
  }, [loadPermissionProfiles, path]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-xl px-2 text-muted-foreground"
          aria-label={t("agentChat.settings.title")}
          title={t("agentChat.settings.title")}
        >
          <Settings2 className="size-3.5" />
          <span className="text-xs">{codexReasoningEffortLabel(effort)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-64 rounded-xl p-1.5">
        <DropdownMenuLabel>Thinking effort</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={effort} onValueChange={(value) => setEffort(value as AgentReasoningEffort)}>
          {supportedEfforts.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className="rounded-lg py-1.5">
              <span className="min-w-0 flex-1">{codexReasoningEffortLabel(item.value)}</span>
              {item.value === selectedModel?.defaultReasoningEffort ? (
                <span className="text-[10px] text-muted-foreground">Default</span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {selectedModel?.serviceTiers.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Speed</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={serviceTier ?? "__default"}
              onValueChange={(value) => setServiceTier(value === "__default" ? null : value)}
            >
              <DropdownMenuRadioItem value="__default" className="rounded-lg py-1.5">
                Standard
              </DropdownMenuRadioItem>
              {selectedModel.serviceTiers.map((tier) => (
                <DropdownMenuRadioItem key={tier.id} value={tier.id} className="rounded-lg py-1.5">
                  {tier.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        {selectedModel?.supportsPersonality ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Personality</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={personality}
              onValueChange={(value) => setPersonality(value as AgentPersonality)}
            >
              {(["friendly", "pragmatic", "none"] as AgentPersonality[]).map((value) => (
                <DropdownMenuRadioItem key={value} value={value} className="rounded-lg py-1.5">
                  {value === "friendly" ? "Friendly" : value === "pragmatic" ? "Pragmatic" : "None"}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={collaborationMode}
          onValueChange={(value) => setCollaborationMode(value as AgentCollaborationMode)}
        >
          <DropdownMenuRadioItem value="default" className="rounded-lg py-1.5">Default</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="plan" className="rounded-lg py-1.5">Plan</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {permissionProfiles.length ? (
          <>
            <DropdownMenuLabel>Permissions profile</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={permissionProfile ?? "__custom"}
              onValueChange={(value) => setPermissionProfile(value === "__custom" ? null : value)}
            >
              <DropdownMenuRadioItem value="__custom" className="rounded-lg py-1.5">
                Custom
              </DropdownMenuRadioItem>
              {permissionProfiles.map((profile) => (
                <DropdownMenuRadioItem
                  key={profile.id}
                  value={profile.id}
                  disabled={!profile.allowed}
                  className="rounded-lg py-1.5"
                  title={profile.description ?? undefined}
                >
                  {permissionProfileLabel(profile.id)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel>{t("agentChat.settings.sandbox")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sandbox} onValueChange={(value) => setSandbox(value as AgentSandboxMode)}>
          {sandboxes.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className="rounded-lg py-1.5">
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("agentChat.settings.approvals")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={approval} onValueChange={(value) => setApproval(value as AgentApprovalPolicy)}>
          {approvals.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className="rounded-lg py-1.5">
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {sandbox === "danger-full-access" && approval === "never" ? (
          <p className="mx-1.5 mb-1 mt-1 rounded-lg bg-destructive/10 px-2 py-1.5 text-[10px] leading-4 text-destructive">
            {t("agentChat.settings.unrestrictedWarning")}
          </p>
        ) : null}
        {realtimeVoices?.v2.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Voice</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={realtimeVoice ?? realtimeVoices.defaultV2}
              onValueChange={(value) => setRealtimeVoice(value as AgentRealtimeVoice)}
            >
              {realtimeVoices.v2.map((voice) => (
                <DropdownMenuRadioItem key={voice} value={voice} className="rounded-lg py-1.5 capitalize">
                  {voice}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
