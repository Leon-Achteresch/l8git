import { CircleCheck, CircleX, FileCode2, MessageSquare } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  reviewStateLabel,
  type PrComment,
  type PrConversation,
  type PrReview,
} from '~/components/repo/pr/pr-types';
import { accentFor, initials, relativeTime } from '~/components/shared/format';
import { MarkdownView } from '~/components/shared/markdown-view';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type TimelineEntry =
  | { kind: 'comment'; id: string; at: string; data: PrComment }
  | { kind: 'review'; id: string; at: string; data: PrReview };

export function buildTimeline(conversation: PrConversation | undefined): TimelineEntry[] {
  if (!conversation) {
    return [];
  }
  const entries: TimelineEntry[] = [
    ...conversation.comments.map((comment) => ({
      kind: 'comment' as const,
      id: `c-${comment.id}`,
      at: comment.created_at,
      data: comment,
    })),
    ...conversation.reviews.map((review) => ({
      kind: 'review' as const,
      id: `r-${review.id}`,
      at: review.submitted_at,
      data: review,
    })),
  ];
  entries.sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));
  return entries;
}

const REVIEW_ICON: Record<string, LucideIcon> = {
  APPROVED: CircleCheck,
  CHANGES_REQUESTED: CircleX,
};

const REVIEW_ACCENT: Record<string, string> = {
  APPROVED: 'text-git-added',
  CHANGES_REQUESTED: 'text-git-removed',
};

const REVIEW_BUBBLE: Record<string, string> = {
  APPROVED: 'bg-git-added/15',
  CHANGES_REQUESTED: 'bg-git-removed/15',
};

function AuthorAvatar({ name }: { name: string }) {
  const tint = accentFor(name);
  return (
    <Avatar alt={name} className="size-9">
      <AvatarFallback style={{ backgroundColor: `${tint}26` }}>
        <Text style={{ color: tint }} className="text-xs font-semibold">
          {initials(name)}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}

function EntryCard({
  entry,
  index,
}: {
  entry: TimelineEntry;
  index: number;
}) {
  const isReview = entry.kind === 'review';
  const state = isReview ? entry.data.state.toUpperCase() : '';
  const author = entry.data.author;
  const body = entry.data.body?.trim() ?? '';

  return (
    <Animated.View
      entering={FadeInDown.duration(200)
        .delay(Math.min(index, 6) * 28)
        .springify()
        .damping(20)}
      className="bg-card gap-3 rounded-[28px] px-4 py-3.5">
      <View className="flex-row items-center gap-3">
        <AuthorAvatar name={author} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
              {author}
            </Text>
            {isReview ? (
              <View
                className={cn(
                  'flex-row items-center gap-1 rounded-full px-2 py-0.5',
                  REVIEW_BUBBLE[state] ?? 'bg-white/10'
                )}>
                <Icon
                  as={REVIEW_ICON[state] ?? MessageSquare}
                  size={11}
                  className={REVIEW_ACCENT[state] ?? 'text-muted-foreground'}
                />
                <Text
                  className={cn(
                    'text-2xs font-medium',
                    REVIEW_ACCENT[state] ?? 'text-muted-foreground'
                  )}>
                  {reviewStateLabel(entry.data.state)}
                </Text>
              </View>
            ) : null}
          </View>
          {!isReview && entry.data.file_path ? (
            <View className="flex-row items-center gap-1">
              <Icon as={FileCode2} size={9} className="text-muted-foreground" />
              <Text numberOfLines={1} className="text-muted-foreground font-mono text-2xs">
                {entry.data.file_path}
                {entry.data.line ? `:${entry.data.line}` : ''}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-muted-foreground text-2xs">
          {relativeTime(entry.at)}
        </Text>
      </View>

      {body.length > 0 ? (
        <MarkdownView content={body} textClassName="text-sm" />
      ) : (
        <Text className="text-muted-foreground text-xs italic">No message.</Text>
      )}
    </Animated.View>
  );
}

export function PrTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <View className="bg-card flex-row items-center gap-3 rounded-[28px] px-4 py-3.5">
        <View className="bg-white/10 h-10 w-10 items-center justify-center rounded-full">
          <Icon as={MessageSquare} size={17} className="text-muted-foreground" />
        </View>
        <Text className="text-muted-foreground flex-1 text-xs">
          No comments or reviews yet — start the conversation below.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {entries.map((entry, index) => (
        <EntryCard key={entry.id} entry={entry} index={index} />
      ))}
    </View>
  );
}
