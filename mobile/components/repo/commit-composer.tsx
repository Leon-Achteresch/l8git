import * as Haptics from 'expo-haptics';
import { Check, GitCommitVertical } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Spinner } from '~/components/shared/spinner';
import { palette } from '~/lib/theme';
import { useBottomInset } from '~/components/shared/use-bottom-inset';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

const SUBJECT_SOFT_LIMIT = 72;

export type CommitComposerProps = {
  stagedCount: number;
  amendSubject?: string | null;
  amend: boolean;
  onAmendChange: (value: boolean) => void;
  message: string;
  onMessageChange: (value: string) => void;
  onCommit: () => void;
  committing: boolean;
  disabled?: boolean;
  error?: string | null;
};

export function CommitComposer({
  stagedCount,
  amendSubject,
  amend,
  onAmendChange,
  message,
  onMessageChange,
  onCommit,
  committing,
  disabled = false,
  error,
}: CommitComposerProps) {
  const bottomInset = useBottomInset();
  const [focused, setFocused] = React.useState(false);
  const subject = message.split('\n')[0] ?? '';
  const canCommit =
    !disabled && !committing && message.trim().length > 0 && (amend || stagedCount > 0);

  const commit = React.useCallback(() => {
    if (!canCommit) {
      return;
    }
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onCommit();
  }, [canCommit, onCommit]);

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={{ paddingBottom: bottomInset }}
      className="border-border bg-sidebar gap-2.5 border-t px-4 pt-2.5">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon as={GitCommitVertical} size={13} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-2xs uppercase tracking-widest">
            {amend
              ? 'Amend last commit'
              : stagedCount > 0
                ? `${stagedCount} staged ${stagedCount === 1 ? 'file' : 'files'}`
                : 'Nothing staged'}
          </Text>
          {amend && amendSubject ? (
            <Text numberOfLines={1} className="text-muted-foreground/50 min-w-0 flex-1 text-2xs">
              {amendSubject}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: amend }}
          hitSlop={8}
          onPress={() => {
            if (Platform.OS !== 'web') {
              void Haptics.selectionAsync();
            }
            onAmendChange(!amend);
          }}
          className={cn(
            'flex-row items-center gap-1.5 rounded-full border px-2 py-0.5',
            amend ? 'border-git-modified/40 bg-git-modified/15' : 'border-border bg-muted/60'
          )}>
          {amend ? <Icon as={Check} size={10} className="text-git-modified" /> : null}
          <Text
            className={cn(
              'text-2xs font-medium',
              amend ? 'text-git-modified' : 'text-muted-foreground'
            )}>
            Amend
          </Text>
        </Pressable>
      </View>

      <View
        className={cn(
          'border-input bg-background rounded-xl border px-3 py-2',
          focused && 'border-ring'
        )}>
        <TextInput
          value={message}
          onChangeText={onMessageChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={amend ? 'Rewrite the commit message' : 'Commit message'}
          placeholderTextColor={`${palette.mutedForeground}80`}
          multiline
          editable={!committing}
          className="text-foreground min-h-11 text-sm"
          style={{ maxHeight: focused ? 140 : 72, textAlignVertical: 'top' }}
        />
      </View>

      {error ? (
        <Animated.Text
          entering={FadeIn.duration(140)}
          className="text-destructive px-1 text-2xs">
          {error}
        </Animated.Text>
      ) : null}

      <View className="flex-row items-center gap-3">
        <Text
          className={cn(
            'font-mono text-2xs',
            subject.length > SUBJECT_SOFT_LIMIT ? 'text-warning' : 'text-muted-foreground/50'
          )}>
          {subject.length}/{SUBJECT_SOFT_LIMIT}
        </Text>
        <View className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={amend ? 'Amend commit' : 'Commit staged changes'}
          disabled={!canCommit}
          onPress={commit}
          className={cn(
            'h-10 flex-row items-center justify-center gap-2 rounded-xl px-5',
            canCommit ? 'bg-primary active:bg-primary/90' : 'bg-secondary opacity-50'
          )}>
          {committing ? <Spinner size={14} className="text-primary-foreground" /> : null}
          <Text
            className={cn(
              'text-sm font-semibold',
              canCommit ? 'text-primary-foreground' : 'text-muted-foreground'
            )}>
            {committing ? 'Committing…' : amend ? 'Amend' : 'Commit'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
