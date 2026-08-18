import { Check, CircleDashed, GitMerge, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Sheet, SheetInput, SheetNote } from '~/components/repo/sheet';
import { Spinner } from '~/components/shared/spinner';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { agentSendHaptic } from '~/lib/agents/attention';
import type {
  AgentReviewStep,
  AgentReviewStepId,
  AgentReviewSummary,
  ReviewFinishApi,
} from '~/lib/agents/review';
import { cn } from '~/lib/utils';

const STEP_ICON: Record<AgentReviewStepId, typeof Check> = {
  commit: Check,
  merge: GitMerge,
  cleanup: CircleDashed,
};

const STEP_TITLE: Record<AgentReviewStepId, string> = {
  commit: 'Commit remaining changes',
  merge: 'Fast-forward merge into base',
  cleanup: 'Remove worktree and branch',
};

const STATUS_LABEL: Record<AgentReviewStep['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
};

function StepGlyph({ step }: { step: AgentReviewStep }) {
  if (step.status === 'running') {
    return <Spinner size={14} className="text-git-branch" />;
  }
  if (step.status === 'failed') {
    return <Icon as={TriangleAlert} size={14} className="text-destructive" />;
  }
  if (step.status === 'done') {
    return <Icon as={Check} size={14} className="text-git-added" />;
  }
  return <Icon as={STEP_ICON[step.id]} size={14} className="text-muted-foreground" />;
}

function StepCard({
  step,
  hint,
  disabled,
  runLabel,
  canRun,
  onRun,
  onRetry,
  children,
}: {
  step: AgentReviewStep;
  hint?: string;
  disabled: boolean;
  runLabel: string;
  canRun: boolean;
  onRun: () => void;
  onRetry: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View
      className={cn(
        'border-border bg-card/50 gap-2 rounded-xl border p-3',
        step.status === 'failed' && 'border-destructive/45',
        step.status === 'done' && 'opacity-70'
      )}>
      <View className="flex-row items-center gap-2">
        <StepGlyph step={step} />
        <Text className="text-foreground flex-1 text-sm font-medium">{STEP_TITLE[step.id]}</Text>
        <Text className="text-muted-foreground text-2xs uppercase tracking-wide">
          {STATUS_LABEL[step.status]}
        </Text>
      </View>
      {hint ? <Text className="text-muted-foreground text-xs leading-4">{hint}</Text> : null}
      {children}
      {step.error ? (
        <View className="border-destructive/30 bg-destructive/10 rounded-lg border px-2.5 py-2">
          <Text className="text-destructive text-2xs leading-4">{step.error}</Text>
        </View>
      ) : null}
      {step.status === 'done' || step.status === 'skipped' ? null : step.status === 'failed' ? (
        <Button variant="outline" size="sm" onPress={onRetry} className="self-start">
          <Text className="text-xs">Retry</Text>
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={disabled || !canRun || step.status === 'running'}
          onPress={onRun}
          className="self-start">
          <Text className="text-xs">{runLabel}</Text>
        </Button>
      )}
    </View>
  );
}

export function ReviewFinishSheet({
  visible,
  onClose,
  finish,
  summary,
  busy,
  onFinished,
}: {
  visible: boolean;
  onClose: () => void;
  finish: ReviewFinishApi;
  summary: AgentReviewSummary | null;
  busy: boolean;
  onFinished: () => void;
}) {
  const announced = React.useRef(false);

  React.useEffect(() => {
    if (!visible) {
      announced.current = false;
    }
  }, [visible]);

  React.useEffect(() => {
    if (!visible || finish.status !== 'done' || announced.current) {
      return;
    }
    announced.current = true;
    agentSendHaptic();
    onFinished();
  }, [finish.status, onFinished, visible]);

  const commit = finish.steps.find((step) => step.id === 'commit');
  const merge = finish.steps.find((step) => step.id === 'merge');
  const cleanup = finish.steps.find((step) => step.id === 'cleanup');

  if (!commit || !merge || !cleanup) {
    return null;
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Finish review"
      description={
        summary
          ? `${summary.sessionBranch} → ${summary.baseBranch}`
          : 'Land the agent session into its base branch.'
      }
      footer={
        <Button variant="outline" onPress={onClose}>
          <Text>{finish.status === 'done' ? 'Close' : 'Not now'}</Text>
        </Button>
      }>
      <StepCard
        step={commit}
        disabled={busy}
        canRun={finish.canRun('commit')}
        runLabel="Commit"
        onRun={() => finish.runStep('commit')}
        onRetry={() => finish.retry('commit')}
        hint={
          commit.status === 'skipped'
            ? 'The worktree is clean — nothing left to commit.'
            : `${summary?.uncommitted ?? 0} uncommitted change(s) in the worktree.`
        }>
        {commit.status === 'skipped' ? null : (
          <SheetInput
            value={finish.message}
            onChangeText={finish.setMessage}
            placeholder="Commit message"
            multiline
            autoCapitalize="sentences"
          />
        )}
      </StepCard>

      <StepCard
        step={merge}
        disabled={busy}
        canRun={finish.canRun('merge')}
        runLabel="Merge"
        onRun={() => finish.runStep('merge')}
        onRetry={() => finish.retry('merge')}
        hint={
          summary
            ? `Fast-forward ${summary.sessionBranch} into ${summary.baseBranch}.`
            : undefined
        }
      />

      <StepCard
        step={cleanup}
        disabled={busy}
        canRun={finish.canRun('cleanup')}
        runLabel="Clean up"
        onRun={() => finish.runStep('cleanup')}
        onRetry={() => finish.retry('cleanup')}
        hint="Removes the worktree and deletes the session branch once it is merged."
      />

      {finish.branchKept ? (
        <SheetNote>The session branch was kept — it is not fully merged yet.</SheetNote>
      ) : null}

      {busy ? (
        <SheetNote tone="danger">
          An agent turn is still running in this worktree. Finishing now can conflict with it.
        </SheetNote>
      ) : null}
    </Sheet>
  );
}
