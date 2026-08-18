import * as Haptics from 'expo-haptics';
import { Check, Minus, Plus, Trash2, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { FileChangeRow } from '~/components/shared/file-change-row';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { ChangeItem } from '~/lib/repo/types';
import { cn } from '~/lib/utils';

const ACTION_WIDTH = 78;

export type ChangeRowAction = {
  key: 'stage' | 'unstage' | 'discard' | 'resolve';
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  run: () => void;
};

function ActionButton({
  action,
  index,
  count,
  progress,
  close,
}: {
  action: ChangeRowAction;
  index: number;
  count: number;
  progress: SharedValue<number>;
  close: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const offset = (count - index) * ACTION_WIDTH;
    return {
      transform: [{ translateX: offset * (1 - Math.min(progress.value, 1)) }],
    };
  });

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={() => {
          close();
          action.run();
        }}
        className={cn(
          'h-full items-center justify-center gap-1',
          action.destructive ? 'bg-destructive/85' : 'bg-secondary'
        )}
        style={{ width: ACTION_WIDTH }}>
        <Icon
          as={action.icon}
          size={16}
          className={action.destructive ? 'text-white' : 'text-foreground'}
        />
        <Text
          className={cn(
            'text-2xs font-medium',
            action.destructive ? 'text-white' : 'text-foreground'
          )}>
          {action.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export type ChangeRowProps = {
  item: ChangeItem;
  actions: readonly ChangeRowAction[];
  first?: boolean;
  last?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export const ChangeRow = React.memo(function ChangeRow({
  item,
  actions,
  first,
  last,
  onPress,
  onLongPress,
}: ChangeRowProps) {
  const ref = React.useRef<SwipeableMethods | null>(null);

  const renderActions = React.useCallback(
    (progress: SharedValue<number>) => (
      <View className="flex-row">
        {actions.map((action, index) => (
          <ActionButton
            key={action.key}
            action={action}
            index={index}
            count={actions.length}
            progress={progress}
            close={() => ref.current?.close()}
          />
        ))}
      </View>
    ),
    [actions]
  );

  const row = (
    <FileChangeRow
      path={item.path}
      status={item.status}
      additions={item.additions}
      deletions={item.deletions}
      binary={item.entry.binary}
      submodule={item.entry.embedded_repo}
      first={first}
      last={last}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );

  if (actions.length === 0) {
    return row;
  }

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      rightThreshold={ACTION_WIDTH * 0.55}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      onSwipeableWillOpen={() => {
        if (Platform.OS !== 'web') {
          void Haptics.selectionAsync();
        }
      }}
      renderRightActions={renderActions}>
      {row}
    </ReanimatedSwipeable>
  );
});

export const STAGE_ICON = Plus;
export const UNSTAGE_ICON = Minus;
export const DISCARD_ICON = Trash2;
export const RESOLVE_ICON = Check;
