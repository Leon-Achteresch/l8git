import {
  CircleCheck,
  Download,
  ExternalLink,
  GitMerge,
  ThumbsDown,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import * as React from 'react';
import { Linking, View } from 'react-native';

import type { RepoScope } from '~/components/repo/git-queries';
import type { GitToastApi } from '~/components/repo/git-toast';
import {
  usePrAutoMergeMutation,
  usePrCheckoutMutation,
  usePrMergeMutation,
  usePrReviewMutation,
} from '~/components/repo/pr/pr-queries';
import {
  ALL_MERGE_STRATEGIES,
  MERGE_STRATEGY_LABEL,
  isPrActive,
  pickMergeStrategy,
  type MergeStrategy,
  type ProviderCapabilities,
  type PullRequestDetail,
} from '~/components/repo/pr/pr-types';
import {
  OptionRow,
  Sheet,
  SheetAction,
  SheetField,
  SheetInput,
  SheetNote,
  SheetToggle,
} from '~/components/repo/sheet';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

type Step = 'menu' | 'merge' | 'approve' | 'request-changes';

const STRATEGY_HINT: Record<MergeStrategy, string> = {
  merge: 'Keeps every commit and adds a merge commit on the target branch.',
  squash: 'Combines all commits into a single commit on the target branch.',
  rebase: 'Replays the commits onto the target branch without a merge commit.',
};

export function PrActionSheet({
  scope,
  detail,
  caps,
  visible,
  toast,
  onClose,
}: {
  scope: RepoScope;
  detail: PullRequestDetail | null;
  caps: ProviderCapabilities | null;
  visible: boolean;
  toast: GitToastApi;
  onClose: () => void;
}) {
  const strategies = React.useMemo<readonly MergeStrategy[]>(
    () =>
      caps && caps.merge_strategies.length > 0 ? caps.merge_strategies : ALL_MERGE_STRATEGIES,
    [caps]
  );

  const [step, setStep] = React.useState<Step>('menu');
  const [strategy, setStrategy] = React.useState<MergeStrategy>(() =>
    pickMergeStrategy('squash', strategies)
  );
  const [mergeMessage, setMergeMessage] = React.useState('');
  const [deleteSource, setDeleteSource] = React.useState(false);
  const [reviewBody, setReviewBody] = React.useState('');

  React.useEffect(() => {
    if (visible) {
      setStep('menu');
      setMergeMessage('');
      setDeleteSource(false);
      setReviewBody('');
      setStrategy(pickMergeStrategy('squash', strategies));
    }
  }, [strategies, visible]);

  const merge = usePrMergeMutation(scope);
  const review = usePrReviewMutation(scope);
  const autoMerge = usePrAutoMergeMutation(scope);
  const checkout = usePrCheckoutMutation(scope);

  const busy =
    merge.isPending || review.isPending || autoMerge.isPending || checkout.isPending;

  const settle = React.useCallback(
    (successTitle: string, failTitle: string, detailOf?: (out: unknown) => string | undefined) => ({
      onSuccess: (out: unknown) => {
        onClose();
        toast.showSuccess(successTitle, detailOf?.(out));
      },
      onError: (cause: unknown) => {
        onClose();
        toast.showError(failTitle, cause);
      },
    }),
    [onClose, toast]
  );

  if (!detail) {
    return <Sheet visible={false} onClose={onClose} title="" />;
  }

  const active = isPrActive(detail);
  const autoMergeOn = Boolean(detail.auto_merge_method);
  const canAutoMerge = Boolean(caps?.can_auto_merge) && Boolean(detail.node_id) && active;
  const canDeleteSource = caps?.can_delete_source_branch ?? false;
  const label = `#${detail.number} · ${detail.title}`;

  const back = (primary: React.ReactNode) => (
    <View className="flex-row gap-2">
      <Button
        variant="secondary"
        className="flex-1"
        disabled={busy}
        onPress={() => setStep('menu')}>
        <Text>Back</Text>
      </Button>
      {primary}
    </View>
  );

  if (step === 'merge') {
    const trimmed = mergeMessage.trim();
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Merge pull request"
        description={label}
        footer={back(
          <Button
            className="flex-1"
            disabled={busy}
            onPress={() =>
              merge.mutate(
                {
                  number: detail.number,
                  strategy,
                  message: trimmed.length > 0 ? trimmed : null,
                  deleteSourceBranch: canDeleteSource && deleteSource,
                },
                settle('Pull request merged', 'Merge failed', (out) =>
                  out && typeof out === 'object' && 'sha' in out
                    ? ((out as { sha: string | null }).sha ?? undefined)
                    : undefined
                )
              )
            }>
            <Text>{merge.isPending ? 'Merging…' : `Merge (${strategy})`}</Text>
          </Button>
        )}>
        {strategies.map((option) => (
          <OptionRow
            key={option}
            label={MERGE_STRATEGY_LABEL[option]}
            description={STRATEGY_HINT[option]}
            selected={strategy === option}
            onPress={() => setStrategy(option)}
          />
        ))}
        <SheetField label="Merge message" hint="Leave empty to use the provider default.">
          <SheetInput
            value={mergeMessage}
            onChangeText={setMergeMessage}
            placeholder="Optional merge commit message"
            multiline
            autoCapitalize="sentences"
          />
        </SheetField>
        {canDeleteSource ? (
          <SheetToggle
            label="Delete source branch"
            description={`Remove ${detail.source_branch} on the remote after merging.`}
            checked={deleteSource}
            onCheckedChange={setDeleteSource}
          />
        ) : null}
        {detail.mergeable === false ? (
          <SheetNote tone="danger">
            The provider reports conflicts with {detail.target_branch}. Merging will most likely be
            rejected until the conflicts are resolved.
          </SheetNote>
        ) : null}
      </Sheet>
    );
  }

  if (step === 'approve' || step === 'request-changes') {
    const requesting = step === 'request-changes';
    const trimmed = reviewBody.trim();
    const ready = !requesting || trimmed.length > 0;
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title={requesting ? 'Request changes' : 'Approve pull request'}
        description={label}
        footer={back(
          <Button
            variant={requesting ? 'destructive' : 'default'}
            className="flex-1"
            disabled={busy || !ready}
            onPress={() =>
              review.mutate(
                {
                  number: detail.number,
                  event: requesting ? 'REQUEST_CHANGES' : 'APPROVE',
                  body: trimmed,
                },
                settle(
                  requesting ? 'Changes requested' : 'Pull request approved',
                  requesting ? 'Review failed' : 'Approval failed'
                )
              )
            }>
            <Text>
              {review.isPending
                ? 'Submitting…'
                : requesting
                  ? 'Request changes'
                  : 'Approve'}
            </Text>
          </Button>
        )}>
        <SheetField
          label={requesting ? 'What needs to change?' : 'Review comment'}
          hint={requesting ? 'Required by the provider.' : 'Optional.'}>
          <SheetInput
            value={reviewBody}
            onChangeText={setReviewBody}
            placeholder={requesting ? 'Describe the requested changes' : 'Looks good to me'}
            multiline
            autoCapitalize="sentences"
            autoFocus
          />
        </SheetField>
        {caps ? (
          <SheetNote>
            The review is submitted as {caps.label} on {caps.host}.
          </SheetNote>
        ) : null}
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Pull request actions" description={label}>
      {caps?.can_approve && active ? (
        <SheetAction
          icon={CircleCheck}
          label="Approve"
          description="Submit an approving review."
          tone="accent"
          disabled={busy}
          onPress={() => setStep('approve')}
        />
      ) : null}

      {caps?.can_request_changes && active ? (
        <SheetAction
          icon={ThumbsDown}
          label="Request changes"
          description="Block the merge with a review comment."
          disabled={busy}
          onPress={() => setStep('request-changes')}
        />
      ) : null}

      {active ? (
        <SheetAction
          icon={GitMerge}
          label="Merge"
          description={`Strategies: ${strategies.join(', ')}`}
          disabled={busy}
          onPress={() => setStep('merge')}
        />
      ) : null}

      {canAutoMerge ? (
        <SheetAction
          icon={autoMergeOn ? ZapOff : Zap}
          label={autoMergeOn ? 'Disable auto-merge' : 'Enable auto-merge'}
          description={
            autoMergeOn
              ? `Currently queued with ${detail.auto_merge_method}.`
              : `Merge automatically with ${strategy} once all checks pass.`
          }
          disabled={busy}
          onPress={() =>
            autoMerge.mutate(
              {
                prNodeId: detail.node_id ?? '',
                enable: !autoMergeOn,
                mergeMethod: strategy,
              },
              settle(
                autoMergeOn ? 'Auto-merge disabled' : 'Auto-merge enabled',
                'Auto-merge update failed'
              )
            )
          }
        />
      ) : null}

      <SheetAction
        icon={Download}
        label="Checkout PR branch"
        description={`Fetch and switch the host to ${detail.source_branch}.`}
        disabled={busy}
        onPress={() =>
          checkout.mutate(
            detail.number,
            settle('Branch checked out', 'Checkout failed', (out) =>
              out && typeof out === 'object' && 'branch' in out
                ? (out as { branch: string }).branch
                : undefined
            )
          )
        }
      />

      {detail.html_url ? (
        <SheetAction
          icon={ExternalLink}
          label="Open in browser"
          description={detail.html_url}
          disabled={busy}
          onPress={() => {
            onClose();
            void Linking.openURL(detail.html_url).catch(() => undefined);
          }}
        />
      ) : null}

      {!active ? (
        <SheetNote>
          This pull request is {detail.state}. Review and merge actions are no longer available.
        </SheetNote>
      ) : null}
    </Sheet>
  );
}
