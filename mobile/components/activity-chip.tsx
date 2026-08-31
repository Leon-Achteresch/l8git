import { View } from 'react-native';

import { Text } from '~/components/ui/text';

export function ActivityChip({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <View
      className="flex-1 gap-0.5 rounded-2xl px-3 py-2.5"
      style={{ backgroundColor: hot ? 'rgba(255,159,10,0.16)' : 'rgba(255,255,255,0.08)' }}>
      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-foreground text-base font-bold">
        {value}
      </Text>
      <Text className="text-muted-foreground text-2xs">{label}</Text>
    </View>
  );
}
