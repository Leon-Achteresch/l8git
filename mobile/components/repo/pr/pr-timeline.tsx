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

const REVIEW_SURFACE: Record<string, string> = {
  APPROVED: 'border-git-added/25 bg-git-added/8',
  CHANGES_REQUESTED: 'border-git-removed/25 bg-git-removed/8',
};

function AuthorAvatar({ name }: { name: string }) {
  const tint = accentFor(name);
  return (
    <Avatar alt={name} className="size-7">
      <AvatarFallback style={{ backgroundColor: `${tint}26` }}>
        <Text style={{ color: tint }} className="text-2xs font-semibold">
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
      className={cn(
        'gap-2 rounded-xl border p-3',
        isReview
          ? (REVIEW_SURFACE[state] ?? 'border-border bg-card/60')
          : 'border-border bg-card/40'
      )}>
      <View className="flex-row items-center gap-2">
        <AuthorAvatar name={author} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="text-foreground text-xs font-medium">
              {author}
            </Text>
            {isReview ? (
              <View className="flex-row items-center gap-1">
                <Icon
                  as={REVIEW_ICON[state] ?? MessageSquare}
                  size={11}
                  className={REVIEW_ACCENT[state] ?? 'text-muted-foreground'}
                />
                <Text
                  className={cn(
                    'text-2xs',
                    REVIEW_ACCENT[state] ?? 'text-muted-foreground'
                  )}>
                  {reviewStateLabel(entry.data.state)}
                </Text>
              </View>
            ) : null}
          </View>
          {!isReview && entry.data.file_path ? (
            <View className="flex-row items-center gap-1">
              <Icon as={FileCode2} size={9} className="text-muted-foreground/60" />
              <Text numberOfLines={1} className="text-muted-foreground/70 font-mono text-2xs">
                {entry.data.file_path}
                {entry.data.line ? `:${entry.data.line}` : ''}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-muted-foreground/70 text-2xs tabular-nums">
          {relativeTime(entry.at)}
        </Text>
      </View>

      {body.length > 0 ? (
        <MarkdownView content={body} textClassName="text-sm" />
      ) : (
        <Text className="text-muted-foreground/70 text-xs italic">No message.</Text>
      )}
    </Animated.View>
  );
}

export function PrTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <View className="border-border bg-card/40 flex-row items-center gap-2 rounded-xl border px-3 py-3">
        <Icon as={MessageSquare} size={14} className="text-muted-foreground" />
        <Text className="text-muted-foreground text-xs">
          No comments or reviews yet — start the conversation below.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {entries.map((entry, index) => (
        <EntryCard key={entry.id} entry={entry} index={index} />
      ))}
    </View>
  );
}
