import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

export function DetailHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();

  const goBack = React.useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/repos');
  }, [onBack, router]);

  return (
    <View className="flex-row items-center gap-2.5 px-2 pb-3 pt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={goBack}
        className="active:bg-accent bg-secondary h-10 w-10 items-center justify-center rounded-full">
        <Icon as={ChevronLeft} size={22} className="text-foreground" />
      </Pressable>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-foreground text-2xl font-bold">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center gap-1.5 pr-1">{right}</View> : null}
    </View>
  );
}
