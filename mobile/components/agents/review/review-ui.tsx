import { GitBranch, GitMerge, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { FileStatusBadge } from '~/components/shared/file-change-row';
import { splitPath } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import type { AgentReviewFile, AgentReviewSummary } from '~/lib/agents/review';
import { cn } from '~/lib/utils';

type ChipTone = 'neutral' | 'branch' | 'merge' | 'added' | 'removed' | 'warning';

const CHIP_SURFACE: Record<ChipTone, string> = {
  neutral: 'bg-white/[0.06]',
  branch: 'bg-git-branch/15',
  merge: 'bg-git-merge/15',
  added: 'bg-git-added/15',
  removed: 'bg-git-removed/15',
  warning: 'bg-warning/15',
};

const CHIP_TEXT: Record<ChipTone, string> = {
  neutral: 'text-muted-foreground',
  branch: 'text-git-branch',
  merge: 'text-git-merge',
  added: 'text-git-added',
  removed: 'text-git-removed',
  warning: 'text-warning',
};

export function ReviewChip({
  label,
  tone = 'neutral',
  icon,
  mono = false,
}: {
  label: string;
  tone?: ChipTone;
  icon?: LucideIcon;
  mono?: boolean;
}) {
  return (
    <View
      className={cn('flex-row items-center gap-1 rounded-full px-2.5 py-1', CHIP_SURFACE[tone])}>
      {icon ? <Icon as={icon} size={11} className={CHIP_TEXT[tone]} /> : null}
      <Text
        numberOfLines={1}
        style={{ fontVariant: ['tabular-nums'] }}
        className={cn('text-2xs font-semibold', mono && 'font-mono', CHIP_TEXT[tone])}>
        {label}
      </Text>
    </View>
  );
}

export function ReviewBranchBar({
  summary,
  branch,
}: {
  summary: AgentReviewSummary | null;
  branch: string | null;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <ReviewChip label={summary?.sessionBranch ?? branch ?? '—'} tone="branch" icon={GitBranch} />
      <Icon as={GitMerge} size={12} className="text-muted-foreground" />
      <ReviewChip label={summary?.baseBranch ?? '—'} tone="merge" icon={GitBranch} />
    </View>
  );
}

export function ReviewStats({ summary }: { summary: AgentReviewSummary | null }) {
  if (!summary) {
    return (
      <View className="flex-row gap-1.5">
        <Skeleton className="bg-white/10 h-5 w-16 rounded-full" />
        <Skeleton className="bg-white/10 h-5 w-14 rounded-full" />
        <Skeleton className="bg-white/10 h-5 w-14 rounded-full" />
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <ReviewChip label={`${summary.files.length} files`} />
      <ReviewChip label={`+${summary.additions}`} tone="added" mono />
      <ReviewChip label={`−${summary.deletions}`} tone="removed" mono />
      <ReviewChip label={`${summary.commits} commits`} />
      {summary.uncommitted > 0 ? (
        <ReviewChip label={`${summary.uncommitted} uncommitted`} tone="warning" />
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
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <FileStatusBadge status={statusFor(file)} size="sm" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            numberOfLines={1}
            className={cn(
              'text-sm font-semibold',
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
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-git-added font-mono text-2xs">
                +{file.additions}
              </Text>
            ) : null}
            {file.deletions > 0 ? (
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-git-removed font-mono text-2xs">
                −{file.deletions}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </PressableRow>
  );
}
