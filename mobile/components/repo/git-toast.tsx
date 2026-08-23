import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';

import { errorMessage } from '~/components/repo/git-types';
import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export type ToastKind = 'error' | 'success' | 'info';

export type ToastNotice = {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
};

const AUTO_DISMISS: Record<ToastKind, number> = {
  error: 7_000,
  success: 3_200,
  info: 4_000,
};

const ACCENT: Record<ToastKind, string> = {
  error: palette.destructive,
  success: palette.success,
  info: palette.foreground,
};

const ICON = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

export type GitToastApi = {
  notice: ToastNotice | null;
  dismiss: () => void;
  showError: (title: string, cause?: unknown) => void;
  showSuccess: (title: string, detail?: string) => void;
  showInfo: (title: string, detail?: string) => void;
};

export function useGitToast(): GitToastApi {
  const [notice, setNotice] = React.useState<ToastNotice | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);

  const push = React.useCallback(
    (kind: ToastKind, title: string, detail?: string) => {
      clearTimer();
      setNotice({ id: Date.now(), kind, title, detail });
      timer.current = setTimeout(() => setNotice(null), AUTO_DISMISS[kind]);
    },
    [clearTimer]
  );

  const dismiss = React.useCallback(() => {
    clearTimer();
    setNotice(null);
  }, [clearTimer]);

  const showError = React.useCallback(
    (title: string, cause?: unknown) => {
      const detail = cause === undefined ? undefined : errorMessage(cause).trim();
      push('error', title, detail && detail !== title ? detail : undefined);
    },
    [push]
  );

  const showSuccess = React.useCallback(
    (title: string, detail?: string) => push('success', title, detail?.trim() || undefined),
    [push]
  );

  const showInfo = React.useCallback(
    (title: string, detail?: string) => push('info', title, detail?.trim() || undefined),
    [push]
  );

  return { notice, dismiss, showError, showSuccess, showInfo };
}

export function GitToast({
  notice,
  onDismiss,
  className,
}: {
  notice: ToastNotice | null;
  onDismiss: () => void;
  className?: string;
}) {
  if (!notice) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      className={cn('absolute bottom-4 left-0 right-0 px-5', className)}>
      <Animated.View
        key={notice.id}
        layout={LinearTransition.duration(160)}
        entering={FadeInDown.duration(220).springify().damping(18)}
        exiting={FadeOutDown.duration(160)}>
        <Glass
          intensity={50}
          style={{
            borderRadius: 24,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
          }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}>
            <Icon as={ICON[notice.kind]} size={15} color={ACCENT[notice.kind]} />
          </View>
          <View className="min-w-0 flex-1 gap-1 pt-1.5">
            <Text className="text-foreground text-sm font-semibold">{notice.title}</Text>
            {notice.detail ? (
              <Text numberOfLines={6} className="text-muted-foreground font-mono text-2xs">
                {notice.detail}
              </Text>
            ) : null}
          </View>
          <Pressable
            hitSlop={12}
            onPress={onDismiss}
            accessibilityLabel="Dismiss"
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}>
            <Icon as={X} size={13} color={palette.foreground} />
          </Pressable>
        </Glass>
      </Animated.View>
    </View>
  );
}
