import { GitBranchPlus, GitFork, History, Tag, Undo2 } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { useRepoMutation, type RepoScope } from '~/components/repo/git-queries';
import type { GitToastApi } from '~/components/repo/git-toast';
import type { ResetMode } from '~/components/repo/git-types';
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

export type CommitTarget = {
  hash: string;
  subject: string;
  parents?: readonly string[];
};

type Step = 'menu' | 'checkout' | 'cherry-pick' | 'revert' | 'reset' | 'tag';

const RESET_MODES: { mode: ResetMode; label: string; description: string; danger: boolean }[] = [
  {
    mode: 'soft',
    label: 'Soft',
    description: 'Move the branch pointer, keep index and working tree.',
    danger: false,
  },
  {
    mode: 'mixed',
    label: 'Mixed',
    description: 'Move the pointer and reset the index, keep your files.',
    danger: false,
  },
  {
    mode: 'hard',
    label: 'Hard',
    description: 'Move the pointer and discard every local change.',
    danger: true,
  },
];

export function CommitActionSheet({
  scope,
  commit,
  toast,
  onClose,
}: {
  scope: RepoScope;
  commit: CommitTarget | null;
  toast: GitToastApi;
  onClose: () => void;
}) {
  const [step, setStep] = React.useState<Step>('menu');
  const [mode, setMode] = React.useState<ResetMode>('mixed');
  const [tagName, setTagName] = React.useState('');
  const [annotated, setAnnotated] = React.useState(false);
  const [tagMessage, setTagMessage] = React.useState('');

  React.useEffect(() => {
    if (commit) {
      setStep('menu');
      setMode('mixed');
      setTagName('');
      setAnnotated(false);
      setTagMessage('');
    }
  }, [commit]);

  const isMerge = (commit?.parents?.length ?? 0) > 1;
  const label = commit ? shortHash(commit.hash) : '';

  const checkout = useRepoMutation<{ hash: string }, unknown>(scope, (invoke, vars) =>
    invoke('git_checkout', {
      path: scope.repoPath,
      refName: vars.hash,
      create: false,
      fromRemote: null,
      base: null,
    })
  );

  const cherryPick = useRepoMutation<{ hash: string; mainline: number | null }, string>(
    scope,
    (invoke, vars) =>
      invoke('git_cherry_pick', {
        path: scope.repoPath,
        commits: [vars.hash],
        mainline: vars.mainline,
      })
  );

  const revert = useRepoMutation<{ hash: string; mergeMainline: number | null }, string>(
    scope,
    (invoke, vars) =>
      invoke('git_revert_commit', {
        path: scope.repoPath,
        commit: vars.hash,
        mergeMainline: vars.mergeMainline,
      })
  );

  const reset = useRepoMutation<{ hash: string; mode: ResetMode }, string>(scope, (invoke, vars) =>
    invoke('git_reset', { path: scope.repoPath, target: vars.hash, mode: vars.mode })
  );

  const tag = useRepoMutation<
    { hash: string; name: string; annotated: boolean; message: string | null },
    unknown
  >(scope, (invoke, vars) =>
    invoke('git_tag_commit', {
      path: scope.repoPath,
      name: vars.name,
      commit: vars.hash,
      annotated: vars.annotated,
      message: vars.message,
      sign: false,
    })
  );

  const busy =
    checkout.isPending ||
    cherryPick.isPending ||
    revert.isPending ||
    reset.isPending ||
    tag.isPending;

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

  if (!commit) {
    return <Sheet visible={false} onClose={onClose} title="" />;
  }

  const footer = (primary: React.ReactNode) => (
    <View className="flex-row gap-2">
      <Button variant="secondary" className="flex-1" disabled={busy} onPress={() => setStep('menu')}>
        <Text>Back</Text>
      </Button>
      {primary}
    </View>
  );

  if (step === 'checkout') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Checkout commit"
        description={`${label} — ${commit.subject}`}
        footer={footer(
          <Button
            className="flex-1"
            disabled={busy}
            onPress={() =>
              checkout.mutate(
                { hash: commit.hash },
                settle('Checked out commit', 'Checkout failed')
              )
            }>
            <Text>{checkout.isPending ? 'Checking out…' : 'Checkout'}</Text>
          </Button>
        )}>
        <SheetNote>
          Checking out a commit leaves the repository in a detached HEAD state. Create a branch
          before committing anything on top of it.
        </SheetNote>
      </Sheet>
    );
  }

  if (step === 'cherry-pick') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Cherry-pick commit"
        description={`${label} — ${commit.subject}`}
        footer={footer(
          <Button
            className="flex-1"
            disabled={busy}
            onPress={() =>
              cherryPick.mutate(
                { hash: commit.hash, mainline: isMerge ? 1 : null },
                settle('Cherry-picked', 'Cherry-pick failed')
              )
            }>
            <Text>{cherryPick.isPending ? 'Applying…' : 'Cherry-pick'}</Text>
          </Button>
        )}>
        <SheetNote>
          {isMerge
            ? 'This is a merge commit — it is applied relative to its first parent (mainline 1).'
            : 'The commit is replayed on top of the current branch. Conflicts stop the operation for manual resolution.'}
        </SheetNote>
      </Sheet>
    );
  }

  if (step === 'revert') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Revert commit"
        description={`${label} — ${commit.subject}`}
        footer={footer(
          <Button
            className="flex-1"
            disabled={busy}
            onPress={() =>
              revert.mutate(
                { hash: commit.hash, mergeMainline: isMerge ? 1 : null },
                settle('Revert created', 'Revert failed')
              )
            }>
            <Text>{revert.isPending ? 'Reverting…' : 'Revert'}</Text>
          </Button>
        )}>
        <SheetNote>
          A new commit is created that undoes the changes of this one. History is preserved.
        </SheetNote>
      </Sheet>
    );
  }

  if (step === 'reset') {
    const hard = mode === 'hard';
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Reset to commit"
        description={`${label} — ${commit.subject}`}
        footer={footer(
          <Button
            variant={hard ? 'destructive' : 'default'}
            className="flex-1"
            disabled={busy}
            onPress={() =>
              reset.mutate(
                { hash: commit.hash, mode },
                settle(`Reset (${mode}) done`, 'Reset failed')
              )
            }>
            <Text>{reset.isPending ? 'Resetting…' : `Reset ${mode}`}</Text>
          </Button>
        )}>
        {RESET_MODES.map((entry) => (
          <OptionRow
            key={entry.mode}
            label={entry.label}
            description={entry.description}
            danger={entry.danger}
            selected={mode === entry.mode}
            onPress={() => setMode(entry.mode)}
          />
        ))}
        {hard ? (
          <SheetNote tone="danger">
            A hard reset permanently discards all uncommitted changes in the working tree. This
            cannot be undone.
          </SheetNote>
        ) : null}
      </Sheet>
    );
  }

  if (step === 'tag') {
    const trimmed = tagName.trim();
    const trimmedMessage = tagMessage.trim();
    const tagReady = trimmed.length > 0 && (!annotated || trimmedMessage.length > 0);
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Create tag"
        description={`${label} — ${commit.subject}`}
        footer={footer(
          <Button
            className="flex-1"
            disabled={busy || !tagReady}
            onPress={() =>
              tag.mutate(
                {
                  hash: commit.hash,
                  name: trimmed,
                  annotated,
                  message: annotated ? trimmedMessage : null,
                },
                settle(`Tag ${trimmed} created`, 'Tagging failed')
              )
            }>
            <Text>{tag.isPending ? 'Tagging…' : 'Create tag'}</Text>
          </Button>
        )}>
        <SheetField label="Tag name" hint="For example v1.4.0">
          <SheetInput
            value={tagName}
            onChangeText={setTagName}
            placeholder="v0.0.0"
            autoFocus
          />
        </SheetField>
        <SheetToggle
          label="Annotated tag"
          description="Stores tagger, date and a message object."
          checked={annotated}
          onCheckedChange={setAnnotated}
        />
        {annotated ? (
          <SheetField label="Message" hint="Required for annotated tags">
            <SheetInput
              value={tagMessage}
              onChangeText={setTagMessage}
              placeholder="Release notes"
              multiline
              autoCapitalize="sentences"
            />
          </SheetField>
        ) : null}
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={commit.subject}
      description={`${label}${isMerge ? ' · merge commit' : ''}`}>
      <SheetAction
        icon={GitFork}
        label="Checkout"
        description="Detach HEAD at this commit"
        disabled={busy}
        onPress={() => setStep('checkout')}
      />
      <SheetAction
        icon={GitBranchPlus}
        label="Cherry-pick"
        description="Replay this commit on the current branch"
        disabled={busy}
        onPress={() => setStep('cherry-pick')}
      />
      <SheetAction
        icon={Undo2}
        label="Revert"
        description="Create a commit that undoes this one"
        disabled={busy}
        onPress={() => setStep('revert')}
      />
      <SheetAction
        icon={Tag}
        label="Create tag"
        description="Lightweight or annotated"
        disabled={busy}
        onPress={() => setStep('tag')}
      />
      <SheetAction
        icon={History}
        label="Reset to here"
        description="Soft, mixed or hard reset of the current branch"
        tone="danger"
        disabled={busy}
        onPress={() => setStep('reset')}
      />
    </Sheet>
  );
}
