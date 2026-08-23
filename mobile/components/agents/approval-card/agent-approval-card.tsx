import { FolderGit2, Terminal } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { DiffView } from '~/components/shared/diff-view';
import {
  parseDiffFiles,
  untrackedDiffFile,
  type DiffFile,
} from '~/components/shared/diff-parse';
import { middleTruncate } from '~/components/shared/format';
import { Text } from '~/components/ui/text';
import { agentApprovalHaptic, agentSendHaptic } from '~/lib/agents/attention';
import { tryChatStore, type NativeAgentProvider } from '~/lib/agents/stores';
import type { AgentPendingRequest } from '@desktop/lib/agents/types';

import { ApprovalCard, ApprovalTag, type ApprovalCardStatus } from './approval-card';
import { CommandLine } from './command-line';
import {
  answerPayload,
  approvalSubtitle,
  approvalTitle,
  cautionReasons,
  commandOf,
  dangerLevel,
  dangerReasons,
  decisionOutcome,
  decisionPayload,
  externalUrl,
  fileChanges,
  inputQuestions,
  rawPreview,
  supportsAlwaysAllow,
  unifiedDiffFor,
  type ApprovalAnswers,
  type ApprovalDecision,
} from './request-model';

const PROVIDER_LABEL: Record<NativeAgentProvider, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  cursor: 'Cursor',
  opencode: 'OpenCode',
};

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function diffFilesFor(request: AgentPendingRequest): DiffFile[] {
  return fileChanges(request).flatMap<DiffFile>((change) => {
    const unified = unifiedDiffFor(change);
    if (unified) {
      return parseDiffFiles(unified);
    }
    if (change.content !== null) {
      return [untrackedDiffFile(change.path, change.content)];
    }
    return [];
  });
}

function RequestBody({ request }: { request: AgentPendingRequest }) {
  const command = commandOf(request);
  const diffFiles = React.useMemo(
    () => (request.kind === 'file-change' ? diffFilesFor(request) : []),
    [request]
  );
  const changes = React.useMemo(
    () => (request.kind === 'file-change' ? fileChanges(request) : []),
    [request]
  );

  if (request.kind === 'file-change') {
    return (
      <View className="gap-2">
        {request.reason ? (
          <Text className="text-muted-foreground text-xs leading-4">{request.reason}</Text>
        ) : null}
        {diffFiles.length > 0 ? (
          <DiffView files={diffFiles} initialRows={80} emptyHint="No textual changes." />
        ) : changes.length > 0 ? (
          <View className="bg-black/40 gap-1 rounded-2xl px-4 py-3">
            {changes.map((change) => (
              <Text key={change.path} numberOfLines={1} className="text-foreground font-mono text-2xs">
                {change.path}
              </Text>
            ))}
          </View>
        ) : (
          <Text className="text-muted-foreground text-xs">
            The agent did not attach a diff for this change.
          </Text>
        )}
      </View>
    );
  }

  if (request.kind === 'permissions') {
    return (
      <View className="gap-2">
        <Text className="text-muted-foreground text-xs leading-4">
          {request.reason ?? 'The agent is asking for additional permissions for this turn.'}
        </Text>
        <View className="bg-black/40 max-h-48 overflow-hidden rounded-2xl">
          <ScrollView bounces={false} contentContainerClassName="px-4 py-3">
            <Text className="text-foreground/80 font-mono text-2xs leading-4">
              {JSON.stringify(request.raw.permissions ?? {}, null, 2)}
            </Text>
          </ScrollView>
        </View>
        {request.grantRoot ? (
          <Text numberOfLines={1} className="text-warning font-mono text-2xs">
            {request.grantRoot}
          </Text>
        ) : null}
      </View>
    );
  }

  if (request.kind === 'unknown') {
    return (
      <View className="bg-black/40 max-h-56 overflow-hidden rounded-2xl">
        <ScrollView bounces={false} contentContainerClassName="px-4 py-3">
          <Text className="text-muted-foreground font-mono text-2xs leading-4">
            {rawPreview(request)}
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {request.reason ? (
        <Text className="text-muted-foreground text-xs leading-4">{request.reason}</Text>
      ) : null}
      {command ? (
        <CommandLine command={command} tone={dangerLevel(request) === 'danger' ? 'danger' : 'normal'} />
      ) : null}
      {request.cwd ? (
        <Text numberOfLines={1} className="text-muted-foreground/70 font-mono text-2xs">
          {middleTruncate(request.cwd, 46)}
        </Text>
      ) : null}
    </View>
  );
}

export interface AgentApprovalCardProps {
  request: AgentPendingRequest;
  provider: NativeAgentProvider;
  hostName?: string | null;
  repoName?: string | null;
  showContext?: boolean;
  onResolved?: (outcome: 'approved' | 'rejected' | 'answered') => void;
  className?: string;
}

export function AgentApprovalCard({
  request,
  provider,
  hostName,
  repoName,
  showContext = false,
  onResolved,
  className,
}: AgentApprovalCardProps) {
  const [status, setStatus] = React.useState<ApprovalCardStatus>('pending');
  const [error, setError] = React.useState<string | null>(null);
  const questions = React.useMemo(() => inputQuestions(request), [request]);
  const danger = React.useMemo(() => dangerLevel(request), [request]);
  const notes = React.useMemo(
    () => (danger === 'danger' ? dangerReasons(request) : cautionReasons(request)).slice(0, 3),
    [danger, request]
  );

  const run = React.useCallback(
    async (task: () => Promise<void>, outcome: 'approved' | 'rejected' | 'answered') => {
      const store = tryChatStore(provider);
      if (!store) {
        setError('The agent runtime is not ready yet.');
        return;
      }
      setStatus('submitting');
      setError(null);
      try {
        await task();
        setStatus(outcome === 'rejected' ? 'rejected' : outcome === 'answered' ? 'answered' : 'approved');
        onResolved?.(outcome);
      } catch (cause) {
        setStatus('pending');
        setError(errorText(cause));
      }
    },
    [onResolved, provider]
  );

  const decide = React.useCallback(
    (decision: ApprovalDecision) => {
      agentApprovalHaptic();
      void run(async () => {
        const state = tryChatStore(provider)?.getState();
        if (!state) {
          throw new Error('The agent runtime is not ready yet.');
        }
        if (request.kind === 'unknown') {
          await state.rejectUnsupportedRequest(request);
          return;
        }
        if (decision !== 'decline') {
          const url = externalUrl(request);
          if (url) {
            await WebBrowser.openBrowserAsync(url).catch(() => undefined);
          }
        }
        await state.respondToRequest(request, decisionPayload(request, decision));
      }, decisionOutcome(decision));
    },
    [provider, request, run]
  );

  const submit = React.useCallback(
    (answers: ApprovalAnswers) => {
      agentSendHaptic();
      void run(async () => {
        const state = tryChatStore(provider)?.getState();
        if (!state) {
          throw new Error('The agent runtime is not ready yet.');
        }
        await state.respondToRequest(request, answerPayload(request, answers));
      }, 'answered');
    },
    [provider, request, run]
  );

  const meta = showContext ? (
    <>
      <ApprovalTag label={PROVIDER_LABEL[provider]} tone="accent" />
      {hostName ? <ApprovalTag label={hostName} tone="neutral" /> : null}
      {repoName ? <ApprovalTag label={repoName} tone="branch" icon={FolderGit2} /> : null}
      {request.kind === 'command' ? (
        <ApprovalTag label="Command" tone="modified" icon={Terminal} />
      ) : null}
    </>
  ) : null;

  if (questions.length > 0) {
    return (
      <ApprovalCard
        className={className}
        title={approvalTitle(request)}
        subtitle={approvalSubtitle(request)}
        meta={meta}
        status={status}
        danger="normal"
        questions={questions}
        submitLabel="Send answer"
        denyLabel={request.kind === 'elicitation' ? 'Decline' : 'Skip'}
        onSubmit={submit}
        onDeny={request.kind === 'elicitation' ? () => decide('decline') : undefined}
        error={error}
      />
    );
  }

  return (
    <ApprovalCard
      className={className}
      title={approvalTitle(request)}
      subtitle={approvalSubtitle(request)}
      meta={meta}
      status={status}
      danger={danger}
      dangerNotes={notes}
      approveLabel={
        request.kind === 'unknown'
          ? 'Decline request'
          : request.kind === 'elicitation'
            ? 'Open and continue'
            : danger === 'danger'
              ? 'Approve anyway'
              : 'Approve'
      }
      alwaysAllowLabel={
        supportsAlwaysAllow(request) && danger !== 'danger' ? 'Always allow in this session' : undefined
      }
      denyLabel="Deny"
      onApprove={() => decide('accept')}
      onAlwaysAllow={
        supportsAlwaysAllow(request) && danger !== 'danger'
          ? () => decide('acceptForSession')
          : undefined
      }
      onDeny={request.kind === 'unknown' ? undefined : () => decide('decline')}
      error={error}
      resultNote={
        status === 'approved'
          ? 'Approved — the agent is continuing.'
          : status === 'rejected'
            ? 'Denied — the agent was told to stop.'
            : null
      }>
      <RequestBody request={request} />
    </ApprovalCard>
  );
}
