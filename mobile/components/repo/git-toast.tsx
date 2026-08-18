import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';

import { errorMessage } from '~/components/repo/git-types';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
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

const SURFACE: Record<ToastKind, string> = {
  error: 'border-destructive/40 bg-destructive/12',
  success: 'border-success/35 bg-success/12',
  info: 'border-border bg-card',
};

const ACCENT: Record<ToastKind, string> = {
  error: 'text-destructive',
  success: 'text-success',
  info: 'text-git-branch',
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
      className={cn('absolute bottom-4 left-0 right-0 px-4', className)}>
      <Animated.View
        key={notice.id}
        layout={LinearTransition.duration(160)}
        entering={FadeInDown.duration(220).springify().damping(18)}
        exiting={FadeOutDown.duration(160)}
        className={cn(
          'flex-row items-start gap-2.5 rounded-2xl border px-3.5 py-3 shadow-lg shadow-black/40',
          SURFACE[notice.kind]
        )}>
        <Icon as={ICON[notice.kind]} size={15} className={cn('mt-0.5', ACCENT[notice.kind])} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-foreground text-sm font-medium">{notice.title}</Text>
          {notice.detail ? (
            <Text numberOfLines={6} className="text-muted-foreground font-mono text-2xs">
              {notice.detail}
            </Text>
          ) : null}
        </View>
        <Pressable hitSlop={12} onPress={onDismiss} accessibilityLabel="Dismiss">
          <Icon as={X} size={14} className="text-muted-foreground" />
        </Pressable>
      </Animated.View>
    </View>
  );
}
