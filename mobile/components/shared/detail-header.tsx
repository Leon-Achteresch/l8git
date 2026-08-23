import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { GlassCircle } from '~/components/ui/glass';
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
    <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
      <GlassCircle icon={ArrowLeft} label="Back" onPress={goBack} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-foreground text-xl font-bold tracking-tight">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-xs">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}
