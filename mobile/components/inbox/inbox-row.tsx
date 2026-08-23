import { ChevronRight, ExternalLink, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { relativeTime } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export function RepoChip({ name }: { name: string }) {
  return (
    <View className="bg-white/10 shrink-0 rounded-full px-2 py-0.5">
      <Text numberOfLines={1} className="text-foreground max-w-28 text-2xs font-semibold">
        {name}
      </Text>
    </View>
  );
}

export function MetaDot() {
  return <Text className="text-muted-foreground/50 text-2xs">·</Text>;
}

export type InboxRowFrameProps = {
  repoName: string;
  title: string;
  updatedAt: string;
  icon?: LucideIcon;
  iconColor?: string;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  externalUrl?: string | null;
  divider?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
};

export function InboxRowFrame({
  repoName,
  title,
  updatedAt,
  icon,
  iconColor = palette.foreground,
  meta,
  badges,
  externalUrl,
  divider = false,
  accessibilityLabel,
  onPress,
}: InboxRowFrameProps) {
  const openExternal = React.useCallback(() => {
    if (externalUrl) {
      void WebBrowser.openBrowserAsync(externalUrl);
    }
  }, [externalUrl]);

  return (
    <PressableRow
      flat
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? title}
      className={cn(divider && 'border-white/5 border-t')}>
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        {icon ? (
          <View className="bg-white/10 h-10 w-10 items-center justify-center rounded-full">
            <Icon as={icon} size={19} color={iconColor} />
          </View>
        ) : null}
        <View className="min-w-0 flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <RepoChip name={repoName} />
            <Text numberOfLines={1} className="text-foreground min-w-0 flex-1 text-sm font-semibold">
              {title}
            </Text>
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-muted-foreground shrink-0 text-2xs">
              {relativeTime(updatedAt)}
            </Text>
          </View>

          {meta ? (
            <View className="flex-row flex-wrap items-center gap-1.5">{meta}</View>
          ) : null}

          {badges ? (
            <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">{badges}</View>
          ) : null}
        </View>

        {externalUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open on the web"
            hitSlop={8}
            onPress={openExternal}
            className="bg-white/10 active:bg-white/15 h-8 w-8 items-center justify-center rounded-full">
            <Icon as={ExternalLink} size={13} className="text-foreground" />
          </Pressable>
        ) : (
          <Icon as={ChevronRight} size={16} className="text-muted-foreground/60" />
        )}
      </View>
    </PressableRow>
  );
}
