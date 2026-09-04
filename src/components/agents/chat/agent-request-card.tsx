import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  ApprovalCard,
  type ApprovalCardAnswers,
  type ApprovalCardQuestion,
} from "@/components/agents/ui/approval-card";
import { AgentPlanCard } from "@/components/agents/chat/agent-plan-card";
import { CodeBlock } from "@/components/agents/ui/code-block";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import type { AgentPendingRequest } from "@/lib/agents/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function selectedValue(answers: ApprovalCardAnswers, id: string): string {
  const answer = answers[id];
  return answer?.custom?.trim() || answer?.selected[0] || "";
}

type Translate = (key: string) => string;

function requestDetails(request: AgentPendingRequest): ReactNode {
  if (!request.reason && !request.command && !request.grantRoot && !request.cwd) return undefined;
  return (
    <div className="space-y-2">
      {request.reason ? <p>{request.reason}</p> : null}
      {request.command ? (
        <CodeBlock code={request.command} language="bash" showLineNumbers={false} maxHeight={160} />
      ) : null}
      {request.cwd ? <p className="font-mono text-[10px] opacity-75">{request.cwd}</p> : null}
      {request.grantRoot ? <p className="font-mono text-[11px]">{request.grantRoot}</p> : null}
    </div>
  );
}

function elicitationQuestions(
  request: AgentPendingRequest,
  t: Translate,
): ApprovalCardQuestion[] {
  const schema = isRecord(request.raw.requestedSchema) ? request.raw.requestedSchema : null;
  const properties = schema && isRecord(schema.properties) ? schema.properties : null;
  if (!properties) return [];
  const required = new Set(
    Array.isArray(schema?.required)
      ? schema.required.filter((value): value is string => typeof value === "string")
      : [],
  );
  return Object.entries(properties).flatMap(([id, value]) => {
    if (!isRecord(value)) return [];
    const enumValues = Array.isArray(value.enum) ? value.enum : [];
    return [{
      id,
      title: typeof value.title === "string" ? value.title : id,
      description: typeof value.description === "string" ? value.description : undefined,
      options: enumValues.map((option) => ({ value: String(option), label: String(option) })),
      allowCustom: enumValues.length === 0,
      customPlaceholder: t("agentChat.request.customAnswer"),
      secret: value.format === "password",
      optional: !required.has(id),
      autoAdvance: true,
    }];
  });
}

function approvalQuestions(
  request: AgentPendingRequest,
  t: Translate,
): ApprovalCardQuestion[] {
  if (request.kind === "user-input") {
    return (request.questions ?? []).map((question) => ({
      id: question.id,
      title: question.header || t("agentChat.request.inputRequired"),
      description: question.question,
      options: question.options.map((option) => ({
        value: option.label,
        label: option.label,
        description: option.description,
      })),
      multiple: question.multiSelect,
      allowCustom: question.isOther || question.options.length === 0,
      customPlaceholder: question.isSecret
        ? t("agentChat.request.secretAnswer")
        : t("agentChat.request.customAnswer"),
      secret: question.isSecret,
      autoAdvance: true,
    }));
  }
  if (request.kind === "command" || request.kind === "file-change") {
    return [
      {
        id: "decision",
        title: request.kind === "command"
          ? t("agentChat.request.approveCommand")
          : t("agentChat.request.approveFiles"),
        description: requestDetails(request),
        options: [
          { value: "accept", label: t("agentChat.request.allowOnce") },
          { value: "acceptForSession", label: t("agentChat.request.allowSession") },
          { value: "decline", label: t("agentChat.request.decline") },
        ],
        autoAdvance: false,
      },
    ];
  }
  if (request.kind === "permissions") {
    return [
      {
        id: "decision",
        title: t("agentChat.request.permissions"),
        description: (
          <div className="space-y-2">
            <p>{request.reason ?? t("agentChat.request.permissionsDescription")}</p>
            <pre className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] max-h-36 overflow-auto p-2 font-mono text-[10px] leading-4">
              {JSON.stringify(request.raw.permissions ?? {}, null, 2)}
            </pre>
          </div>
        ),
        options: [
          { value: "turn", label: t("agentChat.request.allowTurn") },
          { value: "session", label: t("agentChat.request.allowSession") },
          { value: "decline", label: t("agentChat.request.decline") },
        ],
        autoAdvance: false,
      },
    ];
  }
  if (request.kind === "elicitation") return elicitationQuestions(request, t);
  return [];
}

function elicitationContent(
  request: AgentPendingRequest,
  answers: ApprovalCardAnswers,
): Record<string, unknown> {
  const schema = isRecord(request.raw.requestedSchema) ? request.raw.requestedSchema : {};
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return Object.fromEntries(
    Object.entries(answers).flatMap<[string, unknown]>(([id, answer]) => {
      const rawValue = answer.custom?.trim() || answer.selected[0];
      if (!rawValue) return [];
      const property = isRecord(properties[id]) ? properties[id] : {};
      if (property.type === "boolean") return [[id, rawValue === "true"]];
      if (property.type === "number" || property.type === "integer") {
        const numeric = Number(rawValue);
        return Number.isFinite(numeric) ? [[id, numeric]] : [[id, rawValue]];
      }
      if (property.type === "array") return [[id, answer.selected]];
      return [[id, rawValue]];
    }),
  );
}

export const AgentRequestCard = memo(function AgentRequestCard({ request }: { request: AgentPendingRequest }) {
  const { t } = useTranslation();
  const respond = useAgentChatStore((state) => state.respondToRequest);
  const rejectUnsupported = useAgentChatStore((state) => state.rejectUnsupportedRequest);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<"approved" | "rejected" | "answered" | null>(null);
  const questions = useMemo(() => approvalQuestions(request, t), [request, t]);

  if (request.kind === "plan") return <AgentPlanCard request={request} />;

  const submit = async (answers: ApprovalCardAnswers) => {
    setBusy(true);
    try {
      if (request.kind === "user-input") {
        const mapped = Object.fromEntries(
          (request.questions ?? []).map((question) => {
            const answer = answers[question.id];
            const values = [...(answer?.selected ?? [])];
            if (answer?.custom?.trim()) values.push(answer.custom.trim());
            return [question.id, { answers: values }];
          }),
        );
        await respond(request, { answers: mapped });
        setResolved("answered");
        return;
      }
      if (request.kind === "elicitation") {
        await respond(request, {
          action: "accept",
          content: elicitationContent(request, answers),
          _meta: null,
        });
        setResolved("answered");
        return;
      }
      const decision = selectedValue(answers, "decision");
      if (request.kind === "permissions") {
        const requested = isRecord(request.raw.permissions) ? request.raw.permissions : {};
        const permissions: Record<string, unknown> = {};
        if (isRecord(requested.network)) permissions.network = requested.network;
        if (isRecord(requested.fileSystem)) permissions.fileSystem = requested.fileSystem;
        await respond(request, {
          permissions: decision === "decline" ? {} : permissions,
          scope: decision === "session" ? "session" : "turn",
        });
        setResolved(decision === "decline" ? "rejected" : "approved");
        return;
      }
      if (request.method === "execCommandApproval" || request.method === "applyPatchApproval") {
        const legacyDecision = decision === "accept"
          ? "approved"
          : decision === "acceptForSession"
            ? "approved_for_session"
            : { denied: { rejection: "Rejected by user" } };
        await respond(request, { decision: legacyDecision });
      } else {
        await respond(request, { decision: decision || "decline" });
      }
      setResolved(decision === "decline" ? "rejected" : "approved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleElicitation = async (accepted: boolean) => {
    setBusy(true);
    try {
      const url = typeof request.raw.url === "string" ? request.raw.url : null;
      if (accepted && url) await openUrl(url);
      await respond(request, {
        action: accepted ? "accept" : "decline",
        content: null,
        _meta: null,
      });
      setResolved(accepted ? "approved" : "rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const status = busy ? "submitting" : (resolved ?? "pending");

  if (questions.length > 0) {
    return (
      <ApprovalCard
        questions={questions}
        status={status}
        submitLabel={request.kind === "user-input" || request.kind === "elicitation"
          ? t("agentChat.request.sendAnswer")
          : t("agentChat.request.sendDecision")}
        onSubmit={(answers) => void submit(answers)}
        onReject={request.kind === "elicitation"
          ? () => void handleElicitation(false)
          : undefined}
        
      />
    );
  }

  if (request.kind === "elicitation") {
    return (
      <ApprovalCard
        title={typeof request.raw.message === "string" ? request.raw.message : t("agentChat.request.openExternal")}
        description={typeof request.raw.serverName === "string" ? request.raw.serverName : undefined}
        status={status}
        approveLabel={t("agentChat.request.openContinue")}
        onApprove={() => void handleElicitation(true)}
        onReject={() => void handleElicitation(false)}
        
      />
    );
  }

  return (
    <ApprovalCard
      title={t("agentChat.request.unsupported")}
      description={request.method}
      status={status}
      approveLabel={t("agentChat.request.decline")}
      onApprove={() => void rejectUnsupported(request)}
      
    >
      <pre className="text-[var(--ag-text-2)] max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">
        {JSON.stringify(request.raw, null, 2)}
      </pre>
    </ApprovalCard>
  );
});
