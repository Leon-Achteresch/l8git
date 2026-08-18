import { Check, ListChecks } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Spinner } from '~/components/shared/spinner';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type TodoStatus = 'pending' | 'in-progress' | 'completed';

export interface TodoEntry {
  id: string;
  title: string;
  status: TodoStatus;
}

function Bullet({ status }: { status: TodoStatus }) {
  if (status === 'in-progress') {
    return <Spinner size={11} className="text-git-branch" />;
  }
  if (status === 'completed') {
    return (
      <View className="border-success/50 bg-success/15 h-3.5 w-3.5 items-center justify-center rounded-full border">
        <Icon as={Check} size={8} className="text-success" />
      </View>
    );
  }
  return <View className="border-muted-foreground/45 h-3.5 w-3.5 rounded-full border" />;
}

export function TodoList({
  items,
  title = 'Plan',
}: {
  items: readonly TodoEntry[];
  title?: string;
}) {
  const done = items.filter((item) => item.status === 'completed').length;
  const ratio = items.length > 0 ? done / items.length : 0;

  if (items.length === 0) {
    return null;
  }

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      entering={FadeIn.duration(160)}
      className="border-border bg-card/45 gap-2.5 rounded-xl border p-3">
      <View className="flex-row items-center gap-2">
        <Icon as={ListChecks} size={13} className="text-git-merge" />
        <Text className="text-foreground flex-1 text-xs font-semibold uppercase tracking-widest">
          {title}
        </Text>
        <Text className="text-muted-foreground font-mono text-2xs">
          {done}/{items.length}
        </Text>
      </View>

      <View className="bg-muted h-1 overflow-hidden rounded-full">
        <Animated.View
          layout={LinearTransition.duration(280)}
          style={{ width: `${Math.round(ratio * 100)}%` }}
          className="bg-success h-1 rounded-full"
        />
      </View>

      <View className="gap-1.5">
        {items.map((item) => (
          <View key={item.id} className="flex-row items-start gap-2">
            <View className="pt-0.5">
              <Bullet status={item.status} />
            </View>
            <Text
              className={cn(
                'flex-1 text-xs leading-5',
                item.status === 'completed'
                  ? 'text-muted-foreground line-through'
                  : item.status === 'in-progress'
                    ? 'text-foreground font-medium'
                    : 'text-foreground/85'
              )}>
              {item.title}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}
