import { Check, CircleDashed, GitMerge, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import {
  AgentSheet,
  SheetMessage,
  SoftPill,
} from '~/components/agents/agent-sheet';
import { Spinner } from '~/components/shared/spinner';
import { SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import i18n from '~/lib/agents/i18n';
import { splitCommitMessage } from '@desktop/lib/commit-message';
import { agentSendHaptic } from '~/lib/agents/attention';
import type {
  AgentReviewStep,
  AgentReviewStepId,
  ReviewFinishApi,
} from '~/lib/agents/review';
import { cn } from '~/lib/utils';

const STEP_ICON: Record<AgentReviewStepId, typeof Check> = {
  commit: Check,
  merge: GitMerge,
  cleanup: CircleDashed,
};

const STEP_TITLE = { commit: 'agentReview.stepCommit', merge: 'agentReview.stepMerge', cleanup: 'agentReview.stepCleanup' };
function errorText(error: string, branches: { base: string; session: string }): string {
  return error.startsWith('agentReviewFinish.') ? i18n.t(error, branches) : error;
}

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
  errorBranches,
  hint,
  disabled,
  runLabel,
  canRun,
  onRun,
  onRetry,
  children,
}: {
  step: AgentReviewStep;
  errorBranches: { base: string; session: string };
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
        'gap-2.5 rounded-[22px] px-4 py-3.5',
        step.status === 'failed' ? 'bg-destructive/10' : 'bg-white/[0.05]',
        step.status === 'done' && 'opacity-70'
      )}>
      <View className="flex-row items-center gap-2.5">
        <View className="bg-white/10 h-8 w-8 items-center justify-center rounded-full">
          <StepGlyph step={step} />
        </View>
        <Text className="text-foreground flex-1 text-sm font-semibold">{i18n.t(STEP_TITLE[step.id])}</Text>
        <Text className="text-muted-foreground text-2xs uppercase tracking-wide">
          {i18n.t(`agentReview.status.${step.status}`)}
        </Text>
      </View>
      {hint ? <Text className="text-muted-foreground text-xs leading-4">{hint}</Text> : null}
      {children}
      {step.error ? (
        <View className="bg-destructive/12 rounded-2xl px-3.5 py-2.5">
          <Text className="text-destructive text-2xs leading-4">{errorText(step.error, errorBranches)}</Text>
        </View>
      ) : null}
      {step.status === 'done' || step.status === 'skipped' ? null : step.status === 'failed' ? (
        <SoftPill
          label={i18n.t('agentReview.retry')}
          disabled={disabled}
          onPress={onRetry}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : (
        <SolidPill
          label={runLabel}
          disabled={disabled || !canRun || step.status === 'running'}
          onPress={onRun}
          style={{ alignSelf: 'flex-start', height: 42, borderRadius: 21, paddingHorizontal: 18 }}
        />
      )}
    </View>
  );
}

export function ReviewFinishSheet({
  visible,
  onClose,
  finish,
  busy,
  online,
  available,
  onFinished,
}: {
  visible: boolean;
  onClose: () => void;
  finish: ReviewFinishApi;
  busy: boolean;
  online: boolean;
  available: boolean;
  onFinished: () => void;
}) {
  const announced = React.useRef(false);
  const running = finish.status === 'running';
  const locked = busy || !online || !available || !finish.ready || !finish.validated || finish.checking || running;
  const summary = finish.summary;
  const errorBranches = { base: finish.expectedBaseBranch, session: finish.expectedSessionBranch };

  React.useEffect(() => {
    announced.current = false;
  }, [visible, finish.key]);

  React.useEffect(() => {
    if (visible && finish.ready) finish.refresh();
  }, [visible, finish.ready, finish.key]);

  React.useEffect(() => {
    if (!visible || finish.status !== 'done' || finish.checking || !finish.validated || !finish.isComplete() || announced.current) {
      return;
    }
    announced.current = true;
    agentSendHaptic();
    onFinished();
  }, [finish.status, finish.checking, finish.validated, finish.checkError, onFinished, visible]);

  const commit = finish.steps.find((step) => step.id === 'commit');
  const merge = finish.steps.find((step) => step.id === 'merge');
  const cleanup = finish.steps.find((step) => step.id === 'cleanup');

  if (!commit || !merge || !cleanup) {
    return null;
  }

  return (
    <AgentSheet
      visible={visible}
      onClose={() => { if (!running) onClose(); }}
      title={i18n.t('agentReview.finishTitle')}
      description={
        summary
          ? `${summary.sessionBranch} → ${summary.baseBranch}`
          : 'Land the agent session into its base branch.'
      }
      footer={<SoftPill label={i18n.t('agentReview.close')} disabled={running} onPress={onClose} />}>
      <View className="gap-2.5 rounded-[22px] bg-white/[0.05] px-4 py-3.5">
        <Text className="text-foreground text-sm font-semibold">{i18n.t('agentReviewFinish.preflight')}</Text>
        {summary ? <Text className="text-muted-foreground text-xs leading-4">{i18n.t('agentReviewFinish.summary', {
          files: summary.files.length, added: summary.additions, removed: summary.deletions,
          commits: summary.commits, open: summary.uncommitted,
        })}</Text> : null}
        {finish.checking ? <Spinner size={14} className="text-muted-foreground" /> : null}
        {finish.checkError ? <SheetMessage tone="danger">{errorText(finish.checkError, errorBranches)}</SheetMessage> : null}
        <SoftPill label={i18n.t('agentReview.refresh')} disabled={busy || !online || !available || finish.checking || running} onPress={finish.refresh} style={{ alignSelf: 'flex-start' }} />
        {!finish.worktreeRemoved && merge.status !== 'done' ? <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={i18n.t('agentReviewFinish.reviewed')}
          accessibilityState={{ checked: finish.reviewed, disabled: locked || !summary }}
          disabled={locked || !summary}
          onPress={() => finish.markReviewed(!finish.reviewed)}
          className="flex-row items-start gap-2.5 py-2">
          <View className={cn('mt-0.5 h-5 w-5 items-center justify-center rounded border border-white/30', finish.reviewed && 'bg-primary')}>
            {finish.reviewed ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
          </View>
          <Text className="text-foreground flex-1 text-xs leading-4">{i18n.t('agentReviewFinish.reviewed')}</Text>
        </Pressable> : null}
      </View>
      <StepCard
        step={commit}
        errorBranches={errorBranches}
        disabled={locked || !finish.reviewed || !splitCommitMessage(finish.message).subject.trim()}
        canRun={finish.canRun('commit')}
        runLabel={i18n.t('agentReview.runCommit')}
        onRun={() => finish.runStep('commit')}
        onRetry={() => finish.retry('commit')}
        hint={
          commit.status === 'skipped'
            ? i18n.t('agentReview.stepCommitSkipped')
            : i18n.t('agentReviewFinish.commitAllHint')
        }>
        {commit.status === 'done' ? <Text className="text-muted-foreground text-xs leading-4">{i18n.t('agentReviewFinish.reviewAfterCommit')}</Text> : commit.status === 'skipped' ? null : (
          <Input
            value={finish.message}
            onChangeText={finish.setMessage}
            accessibilityLabel={i18n.t('agentReview.commitMessagePlaceholder')}
            placeholder={i18n.t('agentReview.commitMessagePlaceholder')}
            editable={!locked}
            multiline
            autoCapitalize="sentences"
            className="h-20 bg-white/[0.06] py-2 text-sm"
          />
        )}
      </StepCard>

      <StepCard
        step={merge}
        errorBranches={errorBranches}
        disabled={locked || !finish.reviewed}
        canRun={finish.canRun('merge')}
        runLabel={i18n.t('agentReview.runMerge')}
        onRun={() => finish.runStep('merge')}
        onRetry={() => finish.retry('merge')}
        hint={summary ? `${summary.sessionBranch} → ${summary.baseBranch}` : undefined}>
        {(['ff', 'ff-only', 'no-ff'] as const).map(strategy => <Pressable
          key={strategy}
          accessibilityRole="radio"
          accessibilityState={{ selected: finish.strategy === strategy, disabled: locked || merge.status === 'done' }}
          disabled={locked || merge.status === 'done'}
          onPress={() => finish.setStrategy(strategy)}
          className={cn('gap-1 rounded-2xl border px-3 py-2.5', finish.strategy === strategy ? 'border-primary/50 bg-primary/10' : 'border-white/10')}>
          <Text className="text-foreground text-xs font-semibold">{i18n.t(`agentReviewFinish.strategies.${strategy}.label`)}</Text>
          <Text className="text-muted-foreground text-2xs leading-4">{i18n.t(`agentReviewFinish.strategies.${strategy}.hint`)}</Text>
        </Pressable>)}
      </StepCard>

      <StepCard
        step={cleanup}
        errorBranches={errorBranches}
        disabled={locked}
        canRun={finish.canRun('cleanup')}
        runLabel={i18n.t(finish.worktreeRemoved ? 'agentReviewFinish.deleteRemainingBranch' : 'agentReview.runCleanup')}
        onRun={() => finish.runStep('cleanup')}
        onRetry={() => finish.retry('cleanup')}
        hint={i18n.t('agentReviewFinish.cleanupHint')}>
        {finish.worktreeRemoved ? <SheetMessage>{i18n.t(finish.branchDeleted ? 'agentReviewFinish.cleanupComplete' : 'agentReviewFinish.worktreeRemoved')}</SheetMessage> : null}
      </StepCard>

      {busy ? (
        <SheetMessage tone="danger">
          {i18n.t('agentReviewFinish.errors.agentBusy')}
        </SheetMessage>
      ) : null}
      {!online ? <SheetMessage tone="danger">The host is offline. Reconnect it before continuing.</SheetMessage> : !available ? <SheetMessage>The agent connection is not ready. Wait for it to reconnect before continuing.</SheetMessage> : null}
    </AgentSheet>
  );
}
