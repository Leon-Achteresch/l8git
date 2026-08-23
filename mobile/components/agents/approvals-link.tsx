import { useRouter } from 'expo-router';
import { GitPullRequestArrow, ShieldAlert } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { usePendingApprovalCount } from '~/lib/agents/approvals';
import { cn } from '~/lib/utils';

export function ApprovalsInboxButton({ className }: { className?: string }) {
  const router = useRouter();
  const pending = usePendingApprovalCount();

  return (
    <Button
      size="sm"
      variant={pending > 0 ? 'default' : 'outline'}
      accessibilityLabel="Open approvals inbox"
      onPress={() => router.push('/agents/approvals')}
      className={cn('gap-1.5', className)}>
      <Icon
        as={ShieldAlert}
        size={13}
        className={pending > 0 ? 'text-primary-foreground' : 'text-foreground'}
      />
      <Text className="text-xs">Approvals</Text>
      {pending > 0 ? (
        <View className="bg-primary-foreground/20 min-w-4 items-center rounded-full px-1">
          <Text className="text-primary-foreground font-mono text-2xs">{pending}</Text>
        </View>
      ) : null}
    </Button>
  );
}

export function ApprovalsInboxIconButton() {
  const router = useRouter();
  const pending = usePendingApprovalCount();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        pending > 0 ? `Approvals inbox, ${pending} waiting` : 'Approvals inbox'
      }
      hitSlop={8}
      onPress={() => router.push('/agents/approvals')}
      className={cn(
        'active:bg-accent h-8 items-center justify-center rounded-full border px-2',
        pending > 0 ? 'border-warning/45 bg-warning/12' : 'border-border bg-muted/70'
      )}>
      <View className="flex-row items-center gap-1">
        <Icon
          as={ShieldAlert}
          size={14}
          className={pending > 0 ? 'text-warning' : 'text-foreground'}
        />
        {pending > 0 ? (
          <Text className="text-warning font-mono text-2xs">{pending}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function WorktreeReviewsIconButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Worktree reviews"
      hitSlop={8}
      onPress={() => router.push('/agents/reviews')}
      className="border-border bg-muted/70 active:bg-accent h-8 w-8 items-center justify-center rounded-full border">
      <Icon as={GitPullRequestArrow} size={14} className="text-foreground" />
    </Pressable>
  );
}

export function WorktreeReviewsButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      accessibilityLabel="Open worktree reviews"
      onPress={() => router.push('/agents/reviews')}
      className={cn('gap-1.5', className)}>
      <Icon as={GitPullRequestArrow} size={13} className="text-foreground" />
      <Text className="text-xs">Reviews</Text>
    </Button>
  );
}
