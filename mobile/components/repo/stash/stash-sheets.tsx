import { FileDiff, GitBranchPlus, Layers, Trash2, Upload } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { useRepoMutation, type RepoScope } from '~/components/repo/git-queries';
import type { GitToastApi } from '~/components/repo/git-toast';
import type { StashEntry } from '~/components/repo/git-types';
import {
  Sheet,
  SheetAction,
  SheetField,
  SheetInput,
  SheetNote,
  SheetPrimary,
  SheetSecondary,
  SheetToggle,
} from '~/components/repo/sheet';

export function stashLabel(entry: StashEntry): string {
  const message = entry.message?.trim() || entry.subject?.trim();
  return message && message.length > 0 ? message : `stash@{${entry.index}}`;
}

type StashStep = 'menu' | 'drop' | 'branch';

export function StashActionSheet({
  scope,
  entry,
  toast,
  onClose,
  onShowDiff,
  onConsumed,
}: {
  scope: RepoScope;
  entry: StashEntry | null;
  toast: GitToastApi;
  onClose: () => void;
  onShowDiff: (index: number) => void;
  onConsumed?: () => void;
}) {
  const [step, setStep] = React.useState<StashStep>('menu');
  const [branchName, setBranchName] = React.useState('');

  React.useEffect(() => {
    if (entry) {
      setStep('menu');
      setBranchName(`stash-${entry.index}`);
    }
  }, [entry]);

  const apply = useRepoMutation<{ index: number }, string>(scope, (invoke, vars) =>
    invoke('git_stash_apply', { path: scope.repoPath, index: vars.index })
  );
  const pop = useRepoMutation<{ index: number }, string>(scope, (invoke, vars) =>
    invoke('git_stash_pop', { path: scope.repoPath, index: vars.index })
  );
  const drop = useRepoMutation<{ index: number }, unknown>(scope, (invoke, vars) =>
    invoke('git_stash_drop', { path: scope.repoPath, index: vars.index })
  );
  const branch = useRepoMutation<{ index: number; name: string }, string>(scope, (invoke, vars) =>
    invoke('git_stash_branch', { path: scope.repoPath, index: vars.index, name: vars.name })
  );

  const busy = apply.isPending || pop.isPending || drop.isPending || branch.isPending;

  const settle = React.useCallback(
    (successTitle: string, failTitle: string, consumes = false) => ({
      onSuccess: (out: unknown) => {
        onClose();
        toast.showSuccess(successTitle, typeof out === 'string' ? out.trim() : undefined);
        if (consumes) {
          onConsumed?.();
        }
      },
      onError: (cause: unknown) => {
        onClose();
        toast.showError(failTitle, cause);
      },
    }),
    [onClose, onConsumed, toast]
  );

  if (!entry) {
    return <Sheet visible={false} onClose={onClose} title="" />;
  }

  const title = stashLabel(entry);

  if (step === 'drop') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Drop stash"
        description={`stash@{${entry.index}} · ${title}`}
        footer={
          <View className="flex-row gap-2.5">
            <SheetSecondary label="Back" disabled={busy} onPress={() => setStep('menu')} />
            <SheetPrimary
              label={drop.isPending ? 'Dropping…' : 'Drop'}
              destructive
              disabled={busy}
              onPress={() =>
                drop.mutate(
                  { index: entry.index },
                  settle('Stash dropped', 'Could not drop the stash', true)
                )
              }
            />
          </View>
        }>
        <SheetNote tone="danger">
          Dropping removes the stashed changes permanently — they are not recoverable from the
          stash list afterwards.
        </SheetNote>
      </Sheet>
    );
  }

  if (step === 'branch') {
    const trimmed = branchName.trim();
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Branch from stash"
        description={`stash@{${entry.index}} · ${title}`}
        footer={
          <View className="flex-row gap-2.5">
            <SheetSecondary label="Back" disabled={busy} onPress={() => setStep('menu')} />
            <SheetPrimary
              label={branch.isPending ? 'Creating…' : 'Create branch'}
              disabled={busy || trimmed.length === 0}
              onPress={() =>
                branch.mutate(
                  { index: entry.index, name: trimmed },
                  settle(`Branch ${trimmed} created`, 'Could not branch from the stash', true)
                )
              }
            />
          </View>
        }>
        <SheetField
          label="Branch name"
          hint="Checks out the stash base commit, applies the stash and drops it.">
          <SheetInput value={branchName} onChangeText={setBranchName} autoFocus />
        </SheetField>
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={onClose} title={title} description={`stash@{${entry.index}} · ${entry.branch}`}>
      <SheetAction
        icon={FileDiff}
        label="Show diff"
        description="Inspect the stashed changes file by file"
        onPress={() => {
          onClose();
          onShowDiff(entry.index);
        }}
      />
      <SheetAction
        icon={Layers}
        label="Apply"
        description="Restore the changes and keep the stash"
        tone="accent"
        disabled={busy}
        onPress={() =>
          apply.mutate({ index: entry.index }, settle('Stash applied', 'Could not apply the stash'))
        }
      />
      <SheetAction
        icon={Upload}
        label="Pop"
        description="Restore the changes and remove the stash"
        disabled={busy}
        onPress={() =>
          pop.mutate(
            { index: entry.index },
            settle('Stash popped', 'Could not pop the stash', true)
          )
        }
      />
      <SheetAction
        icon={GitBranchPlus}
        label="Branch from stash"
        description="Create a branch that contains the stashed work"
        disabled={busy}
        onPress={() => setStep('branch')}
      />
      <SheetAction
        icon={Trash2}
        label="Drop"
        description="Delete the stash without applying it"
        tone="danger"
        disabled={busy}
        onPress={() => setStep('drop')}
      />
    </Sheet>
  );
}

export function PushStashSheet({
  scope,
  visible,
  toast,
  onClose,
}: {
  scope: RepoScope;
  visible: boolean;
  toast: GitToastApi;
  onClose: () => void;
}) {
  const [message, setMessage] = React.useState('');
  const [includeUntracked, setIncludeUntracked] = React.useState(false);
  const [keepIndex, setKeepIndex] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setMessage('');
      setIncludeUntracked(false);
      setKeepIndex(false);
    }
  }, [visible]);

  const push = useRepoMutation<
    { message: string | null; includeUntracked: boolean; keepIndex: boolean },
    string
  >(scope, (invoke, vars) =>
    invoke('git_stash_push', {
      path: scope.repoPath,
      message: vars.message,
      includeUntracked: vars.includeUntracked,
      keepIndex: vars.keepIndex,
    })
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Stash changes"
      description="Park the current working tree and start from a clean state"
      footer={
        <View className="flex-row gap-2.5">
          <SheetSecondary label="Cancel" disabled={push.isPending} onPress={onClose} />
          <SheetPrimary
            label={push.isPending ? 'Stashing…' : 'Stash'}
            disabled={push.isPending}
            onPress={() =>
              push.mutate(
                {
                  message: message.trim() ? message.trim() : null,
                  includeUntracked,
                  keepIndex,
                },
                {
                  onSuccess: (out) => {
                    onClose();
                    toast.showSuccess('Changes stashed', out.trim());
                  },
                  onError: (cause) => {
                    onClose();
                    toast.showError('Could not stash the changes', cause);
                  },
                }
              )
            }
          />
        </View>
      }>
      <SheetField label="Message" hint="Optional — git generates one from the current commit">
        <SheetInput
          value={message}
          onChangeText={setMessage}
          placeholder="WIP on the login flow"
          autoCapitalize="sentences"
          autoFocus
        />
      </SheetField>
      <SheetToggle
        label="Include untracked files"
        description="Also stash files that are not tracked yet."
        checked={includeUntracked}
        onCheckedChange={setIncludeUntracked}
      />
      <SheetToggle
        label="Keep index"
        description="Leave already staged changes staged in the working tree."
        checked={keepIndex}
        onCheckedChange={setKeepIndex}
      />
    </Sheet>
  );
}
