import { GitBranch, Timer } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { CiStatusIcon } from '~/components/repo/ci/ci-status-icon';
import {
  CI_TONE,
  ciState,
  ciStateLabel,
  runDuration,
  type CiState,
  type WorkflowRun,
} from '~/components/repo/ci/ci-types';
import { middleTruncate, relativeTime, shortHash } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

const RUN_SURFACE: Record<CiState, string> = {
  success: 'bg-git-added/15',
  failure: 'bg-git-removed/15',
  running: 'bg-git-branch/15',
  queued: 'bg-git-modified/15',
  cancelled: 'bg-secondary',
  skipped: 'bg-secondary',
  neutral: 'bg-secondary',
  unknown: 'bg-secondary',
};

export const RunRow = React.memo(function RunRow({
  run,
  first = false,
  last = false,
  onPress,
}: {
  run: WorkflowRun;
  first?: boolean;
  last?: boolean;
  onPress: (runId: number) => void;
}) {
  const state = ciState(run.status, run.conclusion);
  const duration = runDuration(run);
  const handlePress = React.useCallback(() => onPress(run.id), [onPress, run.id]);

  return (
    <PressableRow
      first={first}
      last={last}
      onPress={handlePress}
      accessibilityLabel={`Workflow run ${run.name} #${run.run_number}`}>
      <View className="flex-row items-start gap-3 px-3 py-3">
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-2xl',
            RUN_SURFACE[state]
          )}>
          <CiStatusIcon status={run.status} conclusion={run.conclusion} size={19} />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="text-foreground flex-1 text-sm font-medium">
              {run.name}
            </Text>
            <Text className="text-muted-foreground/60 font-mono text-2xs">#{run.run_number}</Text>
          </View>

          {run.display_title ? (
            <Text numberOfLines={1} className="text-muted-foreground text-2xs">
              {run.display_title}
            </Text>
          ) : null}

          <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
            {run.head_branch ? (
              <View className="flex-row items-center gap-1">
                <Icon as={GitBranch} size={9} className="text-foreground" />
                <Text numberOfLines={1} className="text-foreground/90 max-w-32 text-2xs">
                  {middleTruncate(run.head_branch, 22)}
                </Text>
              </View>
            ) : null}
            <Text className="text-muted-foreground/60 font-mono text-2xs">
              {shortHash(run.head_sha)}
            </Text>
            <Text className="text-muted-foreground/40 text-2xs">·</Text>
            <Text className="text-muted-foreground/70 text-2xs">{run.event}</Text>
            {duration ? (
              <>
                <Text className="text-muted-foreground/40 text-2xs">·</Text>
                <View className="flex-row items-center gap-1">
                  <Icon as={Timer} size={9} className="text-muted-foreground/60" />
                  <Text className="text-muted-foreground/70 text-2xs tabular-nums">{duration}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        <View className="shrink-0 items-end gap-1.5">
          <StatusPill
            label={ciStateLabel(run.status, run.conclusion)}
            tone={CI_TONE[state]}
            size="xs"
          />
          <Text className="text-muted-foreground/70 text-2xs tabular-nums">
            {relativeTime(run.created_at)}
          </Text>
        </View>
      </View>
    </PressableRow>
  );
});
