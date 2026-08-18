import { Bell, CircleCheck, Info } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useAgentNotices, type AgentNotice, type AgentNoticeTone } from '~/lib/agents/attention';
import { useRemoteOps } from '~/lib/repo/remote-ops';
import { cn } from '~/lib/utils';

const NOTICE_TTL_MS = 6_000;
const PROGRESS_OFFSET = 76;

const TONE_ICON: Record<AgentNoticeTone, typeof Info> = {
  info: Info,
  success: CircleCheck,
  attention: Bell,
};

const TONE_CLASS: Record<AgentNoticeTone, string> = {
  info: 'border-border bg-popover',
  success: 'border-success/35 bg-popover',
  attention: 'border-warning/45 bg-warning/10',
};

const TONE_ICON_CLASS: Record<AgentNoticeTone, string> = {
  info: 'text-muted-foreground',
  success: 'text-success',
  attention: 'text-warning',
};

function NoticeCard({ notice }: { notice: AgentNotice }) {
  const dismiss = useAgentNotices((state) => state.dismiss);

  React.useEffect(() => {
    const timer = setTimeout(() => dismiss(notice.id), NOTICE_TTL_MS);
    return () => clearTimeout(timer);
  }, [dismiss, notice.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={notice.actionLabel ?? 'Dismiss agent notice'}
      onPress={() => {
        notice.run?.();
        dismiss(notice.id);
      }}>
      <View
        className={cn(
          'flex-row items-center gap-2.5 rounded-2xl border p-3 shadow-lg shadow-black/40',
          TONE_CLASS[notice.tone]
        )}>
        <Icon as={TONE_ICON[notice.tone]} size={14} className={TONE_ICON_CLASS[notice.tone]} />
        <Text numberOfLines={2} className="text-foreground flex-1 text-xs font-medium">
          {notice.title}
        </Text>
        {notice.actionLabel ? (
          <Text className="text-primary text-2xs font-semibold uppercase tracking-wide">
            {notice.actionLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function AgentToastHost() {
  const insets = useSafeAreaInsets();
  const notices = useAgentNotices((state) => state.notices);
  const progressVisible = useRemoteOps((state) => state.ops.length > 0 || state.result !== null);

  if (notices.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ top: insets.top + 6 + (progressVisible ? PROGRESS_OFFSET : 0) }}
      className="absolute left-4 right-4 z-40 gap-2">
      {notices.map((notice) => (
        <Animated.View
          key={notice.id}
          entering={FadeInUp.duration(200)}
          exiting={FadeOutUp.duration(150)}
          layout={LinearTransition.duration(200)}>
          <NoticeCard notice={notice} />
        </Animated.View>
      ))}
    </View>
  );
}
