import { CircleAlert, CircleCheck, GitMerge, Shield, TriangleAlert, Zap } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { isPrActive, type BranchProtection, type PullRequestDetail } from '~/components/repo/pr/pr-types';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

type Tone = 'success' | 'danger' | 'muted' | 'merge';

const BUBBLE: Record<Tone, string> = {
  success: 'bg-git-added/15',
  danger: 'bg-git-removed/15',
  muted: 'bg-white/10',
  merge: 'bg-git-merge/15',
};

const ACCENT: Record<Tone, string> = {
  success: 'text-git-added',
  danger: 'text-git-removed',
  muted: 'text-muted-foreground',
  merge: 'text-git-merge',
};

function bannerFor(detail: PullRequestDetail): {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  description: string;
} {
  if (detail.state === 'merged') {
    return {
      tone: 'merge',
      icon: GitMerge,
      title: `Merged into ${detail.target_branch}`,
      description: detail.merge_commit_sha
        ? `Merge commit ${detail.merge_commit_sha.slice(0, 10)}`
        : 'This pull request has been merged.',
    };
  }
  if (detail.state === 'closed') {
    return {
      tone: 'muted',
      icon: CircleAlert,
      title: 'Closed without merging',
      description: `${detail.source_branch} was never merged into ${detail.target_branch}.`,
    };
  }
  if (detail.mergeable === false) {
    return {
      tone: 'danger',
      icon: TriangleAlert,
      title: 'Conflicts with the target branch',
      description: `Resolve the conflicts between ${detail.source_branch} and ${detail.target_branch} before merging.`,
    };
  }
  if (detail.mergeable === true) {
    return {
      tone: 'success',
      icon: CircleCheck,
      title: 'Ready to merge',
      description: `No conflicts with ${detail.target_branch}.`,
    };
  }
  return {
    tone: 'muted',
    icon: CircleAlert,
    title: 'Mergeability unknown',
    description: 'The provider is still computing the merge state.',
  };
}

export function PrStatusBanner({
  detail,
  protection,
}: {
  detail: PullRequestDetail;
  protection?: BranchProtection | null;
}) {
  const banner = bannerFor(detail);
  const active = isPrActive(detail);
  const requiredReviews = protection?.required_approving_review_count ?? null;
  const requiredChecks = protection?.required_status_checks ?? [];

  return (
    <Animated.View
      entering={FadeInDown.duration(220).springify().damping(20)}
      className="bg-card gap-3 rounded-[28px] px-4 py-3.5">
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'h-11 w-11 items-center justify-center rounded-full',
            BUBBLE[banner.tone]
          )}>
          <Icon as={banner.icon} size={19} className={ACCENT[banner.tone]} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-base font-semibold">{banner.title}</Text>
          <Text className="text-muted-foreground text-xs leading-4">{banner.description}</Text>
        </View>
      </View>

      {active && detail.auto_merge_method ? (
        <View className="border-white/5 flex-row items-center gap-2 border-t pt-3">
          <Icon as={Zap} size={12} className="text-git-modified" />
          <Text className="text-muted-foreground text-2xs">
            Auto-merge queued with {detail.auto_merge_method}.
          </Text>
        </View>
      ) : null}

      {active && protection ? (
        <View className="border-white/5 flex-row items-start gap-2 border-t pt-3">
          <Icon as={Shield} size={12} className="text-muted-foreground mt-0.5" />
          <Text className="text-muted-foreground flex-1 text-2xs leading-4">
            {[
              requiredReviews ? `${requiredReviews} approving review(s) required` : null,
              requiredChecks.length > 0
                ? `${requiredChecks.length} required check(s): ${requiredChecks.slice(0, 3).join(', ')}`
                : null,
              protection.require_code_owner_reviews ? 'code owner review required' : null,
            ]
              .filter(Boolean)
              .join(' · ') || `${detail.target_branch} is protected.`}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
