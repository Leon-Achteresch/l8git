import { Bell, CircleCheck, Info } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useAgentNotices, type AgentNotice, type AgentNoticeTone } from '~/lib/agents/attention';
import { useRemoteOps } from '~/lib/repo/remote-ops';

const NOTICE_TTL_MS = 6_000;
const PROGRESS_OFFSET = 76;

const TONE_ICON: Record<AgentNoticeTone, typeof Info> = {
  info: Info,
  success: CircleCheck,
  attention: Bell,
};

const TONE_SURFACE: Record<AgentNoticeTone, string> = {
  info: 'rgba(28,28,32,0.78)',
  success: 'rgba(52,199,89,0.16)',
  attention: 'rgba(255,159,10,0.16)',
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
      <Glass
        intensity={50}
        style={{
          borderRadius: 24,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: TONE_SURFACE[notice.tone],
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }}>
        <Icon as={TONE_ICON[notice.tone]} size={15} className={TONE_ICON_CLASS[notice.tone]} />
        <Text numberOfLines={2} className="text-foreground flex-1 text-sm font-medium">
          {notice.title}
        </Text>
        {notice.actionLabel ? (
          <View className="bg-white/10 rounded-full px-2.5 py-1">
            <Text className="text-foreground text-2xs font-semibold">{notice.actionLabel}</Text>
          </View>
        ) : null}
      </Glass>
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
      className="absolute left-5 right-5 z-40 gap-2">
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
