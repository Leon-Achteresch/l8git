import { GitBranch, GitMerge } from 'lucide-react-native';
import { View } from 'react-native';

import { FileStatusBadge } from '~/components/shared/file-change-row';
import { splitPath } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import type { AgentReviewFile, AgentReviewSummary } from '~/lib/agents/review';
import { cn } from '~/lib/utils';

export function ReviewBranchBar({
  summary,
  branch,
}: {
  summary: AgentReviewSummary | null;
  branch: string | null;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <StatusPill
        label={summary?.sessionBranch ?? branch ?? '—'}
        tone="branch"
        icon={GitBranch}
        size="xs"
      />
      <Icon as={GitMerge} size={11} className="text-muted-foreground" />
      <StatusPill label={summary?.baseBranch ?? '—'} tone="merge" icon={GitBranch} size="xs" />
    </View>
  );
}

export function ReviewStats({ summary }: { summary: AgentReviewSummary | null }) {
  if (!summary) {
    return (
      <View className="flex-row gap-1.5">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <StatusPill label={`${summary.files.length} files`} tone="neutral" size="xs" />
      <StatusPill label={`+${summary.additions}`} tone="added" size="xs" mono />
      <StatusPill label={`−${summary.deletions}`} tone="removed" size="xs" mono />
      <StatusPill label={`${summary.commits} commits`} tone="neutral" size="xs" />
      {summary.uncommitted > 0 ? (
        <StatusPill label={`${summary.uncommitted} uncommitted`} tone="warning" size="xs" />
      ) : null}
    </View>
  );
}

function statusFor(file: AgentReviewFile): 'A' | 'D' | 'M' {
  if (file.untracked) {
    return 'A';
  }
  return file.additions === 0 && file.deletions > 0 ? 'D' : 'M';
}

export function ReviewFileRow({
  file,
  first,
  last,
  reviewed,
  onPress,
  onLongPress,
}: {
  file: AgentReviewFile;
  first: boolean;
  last: boolean;
  reviewed: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { name, dir } = splitPath(file.path);
  return (
    <PressableRow
      first={first}
      last={last}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`Review ${file.path}`}>
      <View className="flex-row items-center gap-2.5 px-3 py-2.5">
        <FileStatusBadge status={statusFor(file)} size="sm" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            numberOfLines={1}
            className={cn(
              'text-sm font-medium',
              reviewed ? 'text-muted-foreground line-through' : 'text-foreground'
            )}>
            {name}
          </Text>
          {dir ? (
            <Text numberOfLines={1} className="text-muted-foreground/70 text-2xs">
              {dir}
            </Text>
          ) : null}
        </View>
        {file.binary ? (
          <Text className="text-muted-foreground text-2xs">binary</Text>
        ) : (
          <View className="flex-row items-center gap-1.5">
            {file.additions > 0 ? (
              <Text className="text-git-added font-mono text-2xs">+{file.additions}</Text>
            ) : null}
            {file.deletions > 0 ? (
              <Text className="text-git-removed font-mono text-2xs">−{file.deletions}</Text>
            ) : null}
          </View>
        )}
      </View>
    </PressableRow>
  );
}
