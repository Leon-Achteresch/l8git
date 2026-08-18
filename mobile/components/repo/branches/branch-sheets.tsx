import { Check, GitBranchPlus, GitMerge, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { useRepoMutation, type RepoScope } from '~/components/repo/git-queries';
import type { GitToastApi } from '~/components/repo/git-toast';
import type { Branch, MergeStrategy, TagRef } from '~/components/repo/git-types';
import { remoteOf, shortRefName } from '~/components/repo/git-types';
import {
  OptionRow,
  Sheet,
  SheetAction,
  SheetField,
  SheetInput,
  SheetNote,
  SheetToggle,
} from '~/components/repo/sheet';
import { shortHash } from '~/components/shared/format';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

const STRATEGIES: { id: MergeStrategy; label: string; description: string }[] = [
  {
    id: 'ff',
    label: 'Fast-forward when possible',
    description: 'Move the pointer forward, otherwise create a merge commit.',
  },
  {
    id: 'ff-only',
    label: 'Fast-forward only',
    description: 'Abort instead of creating a merge commit.',
  },
  {
    id: 'no-ff',
    label: 'Always create a merge commit',
    description: 'Keeps the branch topology visible in the graph.',
  },
  {
    id: 'squash',
    label: 'Squash',
    description: 'Stage all changes as one commit without merge metadata.',
  },
];

type BranchStep = 'menu' | 'checkout-remote' | 'merge' | 'delete';

export function BranchActionSheet({
  scope,
  branch,
  currentBranch,
  toast,
  onClose,
}: {
  scope: RepoScope;
  branch: Branch | null;
  currentBranch: string;
  toast: GitToastApi;
  onClose: () => void;
}) {
  const [step, setStep] = React.useState<BranchStep>('menu');
  const [localName, setLocalName] = React.useState('');
  const [strategy, setStrategy] = React.useState<MergeStrategy>('ff');
  const [mergeMessage, setMergeMessage] = React.useState('');
  const [force, setForce] = React.useState(false);

  React.useEffect(() => {
    if (branch) {
      setStep('menu');
      setLocalName(branch.is_remote ? shortRefName(branch.name) : branch.name);
      setStrategy('ff');
      setMergeMessage('');
      setForce(false);
    }
  }, [branch]);

  const checkout = useRepoMutation<{ name: string; fromRemote: string | null }, unknown>(
    scope,
    (invoke, vars) =>
      invoke('git_checkout', {
        path: scope.repoPath,
        refName: vars.name,
        create: false,
        fromRemote: vars.fromRemote,
        base: null,
      })
  );

  const merge = useRepoMutation<
    { branch: string; strategy: MergeStrategy; message: string | null },
    string
  >(scope, (invoke, vars) =>
    invoke('git_merge', {
      path: scope.repoPath,
      branch: vars.branch,
      strategy: vars.strategy,
      message: vars.message,
    })
  );

  const removeLocal = useRepoMutation<{ name: string; force: boolean }, unknown>(
    scope,
    (invoke, vars) =>
      invoke('delete_branch', { path: scope.repoPath, name: vars.name, force: vars.force })
  );

  const removeRemote = useRepoMutation<{ remoteRef: string }, string>(scope, (invoke, vars) =>
    invoke('delete_remote_branch', { path: scope.repoPath, remoteRef: vars.remoteRef })
  );

  const busy =
    checkout.isPending || merge.isPending || removeLocal.isPending || removeRemote.isPending;

  const settle = React.useCallback(
    (successTitle: string, failTitle: string) => ({
      onSuccess: (out: unknown) => {
        onClose();
        toast.showSuccess(successTitle, typeof out === 'string' ? out.trim() : undefined);
      },
      onError: (cause: unknown) => {
        onClose();
        toast.showError(failTitle, cause);
      },
    }),
    [onClose, toast]
  );

  if (!branch) {
    return <Sheet visible={false} onClose={onClose} title="" />;
  }

  const isCurrent = branch.is_current;
  const remote = branch.is_remote ? remoteOf(branch.name) : null;

  const footer = (primary: React.ReactNode) => (
    <View className="flex-row gap-2">
      <Button variant="secondary" className="flex-1" disabled={busy} onPress={() => setStep('menu')}>
        <Text>Back</Text>
      </Button>
      {primary}
    </View>
  );

  if (step === 'checkout-remote') {
    const trimmed = localName.trim();
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Checkout remote branch"
        description={branch.name}
        footer={footer(
          <Button
            className="flex-1"
            disabled={busy || trimmed.length === 0}
            onPress={() =>
              checkout.mutate(
                { name: trimmed, fromRemote: branch.name },
                settle(`Checked out ${trimmed}`, 'Checkout failed')
              )
            }>
            <Text>{checkout.isPending ? 'Checking out…' : 'Checkout'}</Text>
          </Button>
        )}>
        <SheetField label="Local branch name" hint={`Tracks ${branch.name}`}>
          <SheetInput value={localName} onChangeText={setLocalName} autoFocus />
        </SheetField>
      </Sheet>
    );
  }

  if (step === 'merge') {
    const wantsMessage = strategy === 'no-ff' || strategy === 'squash';
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Merge into current branch"
        description={`${branch.name} → ${currentBranch}`}
        footer={footer(
          <Button
            className="flex-1"
            disabled={busy}
            onPress={() =>
              merge.mutate(
                {
                  branch: branch.name,
                  strategy,
                  message: wantsMessage && mergeMessage.trim() ? mergeMessage.trim() : null,
                },
                settle(`Merged ${branch.name}`, 'Merge failed')
              )
            }>
            <Text>{merge.isPending ? 'Merging…' : 'Merge'}</Text>
          </Button>
        )}>
        {STRATEGIES.map((entry) => (
          <OptionRow
            key={entry.id}
            label={entry.label}
            description={entry.description}
            selected={strategy === entry.id}
            onPress={() => setStrategy(entry.id)}
          />
        ))}
        {wantsMessage ? (
          <SheetField label="Commit message" hint="Leave empty to use the git default">
            <SheetInput
              value={mergeMessage}
              onChangeText={setMergeMessage}
              placeholder={`Merge branch '${shortRefName(branch.name)}'`}
              multiline
              autoCapitalize="sentences"
            />
          </SheetField>
        ) : null}
      </Sheet>
    );
  }

  if (step === 'delete') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title={branch.is_remote ? 'Delete remote branch' : 'Delete branch'}
        description={branch.name}
        footer={footer(
          <Button
            variant="destructive"
            className="flex-1"
            disabled={busy}
            onPress={() =>
              branch.is_remote
                ? removeRemote.mutate(
                    { remoteRef: branch.name },
                    settle(`Deleted ${branch.name}`, 'Delete failed')
                  )
                : removeLocal.mutate(
                    { name: branch.name, force },
                    settle(`Deleted ${branch.name}`, 'Delete failed')
                  )
            }>
            <Text>{busy ? 'Deleting…' : 'Delete'}</Text>
          </Button>
        )}>
        {branch.is_remote ? (
          <SheetNote tone="danger">
            {`This removes the branch on ${remote ?? 'the remote'} for everybody. The local copy is kept.`}
          </SheetNote>
        ) : (
          <>
            <SheetToggle
              label="Force delete"
              description="Required when the branch is not fully merged."
              checked={force}
              onCheckedChange={setForce}
            />
            <SheetNote tone={force ? 'danger' : 'muted'}>
              {force
                ? 'Unmerged commits on this branch will no longer be reachable.'
                : 'Git refuses the deletion when the branch still holds unmerged commits.'}
            </SheetNote>
          </>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={branch.name}
      description={[
        branch.is_remote ? 'Remote branch' : 'Local branch',
        isCurrent ? 'current' : null,
        branch.tip ? shortHash(branch.tip) : null,
      ]
        .filter(Boolean)
        .join(' · ')}>
      {isCurrent ? (
        <SheetNote>This is the branch you are on right now.</SheetNote>
      ) : (
        <SheetAction
          icon={Check}
          label="Checkout"
          description={branch.is_remote ? 'Create a local tracking branch' : 'Switch to this branch'}
          tone="accent"
          disabled={busy}
          onPress={() => {
            if (branch.is_remote) {
              setStep('checkout-remote');
              return;
            }
            checkout.mutate(
              { name: branch.name, fromRemote: null },
              settle(`Switched to ${branch.name}`, 'Checkout failed')
            );
          }}
        />
      )}

      {!isCurrent ? (
        <SheetAction
          icon={GitMerge}
          label={`Merge into ${currentBranch || 'HEAD'}`}
          description="Choose a merge strategy"
          disabled={busy}
          onPress={() => setStep('merge')}
        />
      ) : null}

      {!isCurrent ? (
        <SheetAction
          icon={Trash2}
          label={branch.is_remote ? 'Delete on remote' : 'Delete branch'}
          description={branch.is_remote ? remote ?? 'remote' : 'Removes the local ref'}
          tone="danger"
          disabled={busy}
          onPress={() => setStep('delete')}
        />
      ) : null}
    </Sheet>
  );
}

export function CreateBranchSheet({
  scope,
  visible,
  baseRef,
  toast,
  onClose,
}: {
  scope: RepoScope;
  visible: boolean;
  baseRef: string;
  toast: GitToastApi;
  onClose: () => void;
}) {
  const [name, setName] = React.useState('');
  const [base, setBase] = React.useState(baseRef);
  const [checkout, setCheckout] = React.useState(true);

  React.useEffect(() => {
    if (visible) {
      setName('');
      setBase(baseRef);
      setCheckout(true);
    }
  }, [baseRef, visible]);

  const create = useRepoMutation<
    { name: string; base: string | null; checkout: boolean },
    unknown
  >(scope, (invoke, vars) =>
    invoke('git_create_branch', {
      path: scope.repoPath,
      name: vars.name,
      base: vars.base,
      checkout: vars.checkout,
    })
  );

  const trimmed = name.trim();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New branch"
      description="Branch off any ref, tag or commit"
      footer={
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={create.isPending}
            onPress={onClose}>
            <Text>Cancel</Text>
          </Button>
          <Button
            className="flex-1"
            disabled={create.isPending || trimmed.length === 0}
            onPress={() =>
              create.mutate(
                { name: trimmed, base: base.trim() || null, checkout },
                {
                  onSuccess: () => {
                    onClose();
                    toast.showSuccess(`Branch ${trimmed} created`);
                  },
                  onError: (cause) => {
                    onClose();
                    toast.showError('Could not create the branch', cause);
                  },
                }
              )
            }>
            <Text>{create.isPending ? 'Creating…' : 'Create'}</Text>
          </Button>
        </View>
      }>
      <SheetField label="Branch name">
        <SheetInput
          value={name}
          onChangeText={setName}
          placeholder="feature/awesome-thing"
          autoFocus
        />
      </SheetField>
      <SheetField label="Base" hint="Branch, tag or commit hash">
        <SheetInput value={base} onChangeText={setBase} placeholder="main" />
      </SheetField>
      <SheetToggle
        label="Check out after creating"
        checked={checkout}
        onCheckedChange={setCheckout}
      />
    </Sheet>
  );
}

export function TagActionSheet({
  scope,
  tag,
  toast,
  onClose,
}: {
  scope: RepoScope;
  tag: TagRef | null;
  toast: GitToastApi;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (tag) {
      setConfirming(false);
    }
  }, [tag]);

  const remove = useRepoMutation<{ name: string }, unknown>(scope, (invoke, vars) =>
    invoke('delete_tag', { path: scope.repoPath, name: vars.name })
  );

  const branchFrom = useRepoMutation<{ name: string; base: string }, unknown>(
    scope,
    (invoke, vars) =>
      invoke('git_create_branch', {
        path: scope.repoPath,
        name: vars.name,
        base: vars.base,
        checkout: true,
      })
  );

  if (!tag) {
    return <Sheet visible={false} onClose={onClose} title="" />;
  }

  if (confirming) {
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Delete tag"
        description={tag.name}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={remove.isPending}
              onPress={() => setConfirming(false)}>
              <Text>Back</Text>
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={remove.isPending}
              onPress={() =>
                remove.mutate(
                  { name: tag.name },
                  {
                    onSuccess: () => {
                      onClose();
                      toast.showSuccess(`Tag ${tag.name} deleted`);
                    },
                    onError: (cause) => {
                      onClose();
                      toast.showError('Could not delete the tag', cause);
                    },
                  }
                )
              }>
              <Text>{remove.isPending ? 'Deleting…' : 'Delete'}</Text>
            </Button>
          </View>
        }>
        <SheetNote tone="danger">
          The local tag is removed. Tags already pushed stay on the remote until they are deleted
          there as well.
        </SheetNote>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={tag.name}
      description={`${tag.kind} tag · ${shortHash(tag.commit)}${tag.tagger ? ` · ${tag.tagger}` : ''}`}>
      {tag.message ? <SheetNote>{tag.message}</SheetNote> : null}
      <SheetAction
        icon={GitBranchPlus}
        label="Branch from tag"
        description={`Create and check out ${tag.name}-branch`}
        disabled={branchFrom.isPending}
        onPress={() =>
          branchFrom.mutate(
            { name: `${tag.name}-branch`, base: tag.name },
            {
              onSuccess: () => {
                onClose();
                toast.showSuccess(`Branch ${tag.name}-branch created`);
              },
              onError: (cause) => {
                onClose();
                toast.showError('Could not create the branch', cause);
              },
            }
          )
        }
      />
      <SheetAction
        icon={Trash2}
        label="Delete tag"
        tone="danger"
        onPress={() => setConfirming(true)}
      />
    </Sheet>
  );
}
