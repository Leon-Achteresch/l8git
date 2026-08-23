import { Users } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { BranchRoute } from '~/components/repo/pr/branch-route';
import { PR_STATE_LABEL, PR_STATE_TONE, PrGlyph } from '~/components/repo/pr/pr-glyph';
import { prDisplayState, type PullRequest } from '~/components/repo/pr/pr-types';
import { relativeTime } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { Text } from '~/components/ui/text';

export const PrRow = React.memo(function PrRow({
  pr,
  first = false,
  last = false,
  onPress,
}: {
  pr: PullRequest;
  first?: boolean;
  last?: boolean;
  onPress: (number: number) => void;
}) {
  const state = prDisplayState(pr);
  const handlePress = React.useCallback(() => onPress(pr.number), [onPress, pr.number]);

  return (
    <PressableRow
      first={first}
      last={last}
      onPress={handlePress}
      accessibilityLabel={`Pull request ${pr.number}: ${pr.title}`}>
      <View className="flex-row items-start gap-3 px-4 py-3.5">
        <PrGlyph state={state} />

        <View className="min-w-0 flex-1 gap-1.5">
          <Text numberOfLines={2} className="text-foreground text-sm font-semibold leading-5">
            {pr.title}
          </Text>

          <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-muted-foreground text-2xs">
              #{pr.number}
            </Text>
            <Text className="text-muted-foreground/40 text-2xs">·</Text>
            <Text numberOfLines={1} className="text-muted-foreground max-w-28 text-2xs">
              {pr.author}
            </Text>
            <Text className="text-muted-foreground/40 text-2xs">·</Text>
            <BranchRoute head={pr.source_branch} base={pr.target_branch} max={16} />
          </View>

          {pr.labels.length > 0 ? (
            <View className="flex-row flex-wrap gap-1">
              {pr.labels.slice(0, 3).map((label) => (
                <StatusPill key={label} label={label} tone="accent" size="xs" />
              ))}
              {pr.labels.length > 3 ? (
                <Text className="text-muted-foreground self-center text-2xs">
                  +{pr.labels.length - 3}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="shrink-0 items-end gap-1.5">
          <StatusPill label={PR_STATE_LABEL[state]} tone={PR_STATE_TONE[state]} size="xs" dot />
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground text-2xs">
            {relativeTime(pr.updated_at)}
          </Text>
          {pr.reviewers.length > 0 ? (
            <StatusPill label={pr.reviewers.length} tone="neutral" icon={Users} size="xs" mono />
          ) : null}
        </View>
      </View>
    </PressableRow>
  );
});
