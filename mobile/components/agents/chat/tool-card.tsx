import { Ban, Check, ChevronRight, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { Spinner } from '~/components/shared/spinner';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { fonts } from '~/lib/theme';
import { cn } from '~/lib/utils';

import type { ToolRunStatus } from './item-utils';

const STATUS_ICON: Record<Exclude<ToolRunStatus, 'running'>, LucideIcon> = {
  success: Check,
  error: TriangleAlert,
  cancelled: Ban,
};

const STATUS_TINT: Record<ToolRunStatus, string> = {
  running: 'text-git-branch',
  success: 'text-success',
  error: 'text-destructive',
  cancelled: 'text-muted-foreground',
};

const STATUS_SURFACE: Record<ToolRunStatus, string> = {
  running: 'bg-git-branch/[0.12]',
  success: 'bg-white/5',
  error: 'bg-destructive/[0.10]',
  cancelled: 'bg-white/5',
};

function StatusGlyph({ status }: { status: ToolRunStatus }) {
  if (status === 'running') {
    return <Spinner size={12} className={STATUS_TINT.running} />;
  }
  return <Icon as={STATUS_ICON[status]} size={12} className={STATUS_TINT[status]} />;
}

export function ToolCard({
  icon,
  tool,
  title,
  meta,
  status,
  defaultOpen = false,
  trailing,
  children,
}: {
  icon?: LucideIcon;
  tool: string;
  title: string;
  meta?: string | null;
  status: ToolRunStatus;
  defaultOpen?: boolean;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const progress = useDerivedValue(() =>
    withTiming(open ? 1 : 0, { duration: 160, easing: Easing.out(Easing.quad) })
  );
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      className={cn('overflow-hidden rounded-3xl', STATUS_SURFACE[status])}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${tool}: ${title}`}
        onPress={() => setOpen((value) => !value)}
        className="active:bg-white/5 flex-row items-center gap-2.5 px-4 py-3">
        <Animated.View style={chevronStyle}>
          <Icon as={ChevronRight} size={13} className="text-muted-foreground" />
        </Animated.View>
        {icon ? <Icon as={icon} size={15} className="text-muted-foreground" /> : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-muted-foreground text-2xs font-medium uppercase tracking-widest">
              {tool}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.mono }}
              className="text-foreground min-w-0 flex-1 text-xs">
              {title}
            </Text>
          </View>
          {meta ? (
            <Text numberOfLines={1} className="text-muted-foreground/80 text-2xs">
              {meta}
            </Text>
          ) : null}
        </View>
        {trailing}
        <StatusGlyph status={status} />
      </Pressable>

      {open && children ? (
        <Animated.View entering={FadeIn.duration(140)} className="border-white/5 border-t">
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function ToolOutput({
  text,
  tone = 'default',
  maxLines = 400,
}: {
  text: string;
  tone?: 'default' | 'error';
  maxLines?: number;
}) {
  const lines = React.useMemo(() => {
    const all = text.split('\n');
    return all.length > maxLines ? all.slice(-maxLines) : all;
  }, [maxLines, text]);

  if (!text.trim()) {
    return (
      <Text className="text-muted-foreground/70 px-4 py-3 text-xs italic">No output yet</Text>
    );
  }

  return (
    <ScrollView
      horizontal
      bounces={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ minWidth: '100%', paddingHorizontal: 16, paddingVertical: 10 }}>
      <View>
        {lines.map((line, index) => (
          <Text
            key={index}
            numberOfLines={1}
            style={{ fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}
            className={tone === 'error' ? 'text-destructive/90' : 'text-foreground/80'}>
            {line || ' '}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
