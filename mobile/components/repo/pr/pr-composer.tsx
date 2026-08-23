import { Send } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Spinner } from '~/components/shared/spinner';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

export function PrComposer({
  value,
  onChangeText,
  onSubmit,
  sending,
  disabled = false,
  placeholder = 'Leave a comment',
}: {
  value: string;
  onChangeText: (next: string) => void;
  onSubmit: () => void;
  sending: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const canSend = value.trim().length > 0 && !sending && !disabled;

  return (
    <View className="bg-card gap-3 rounded-[28px] p-3">
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.mutedForeground}
        editable={!disabled && !sending}
        multiline
        autoCapitalize="sentences"
        className="bg-white/5 h-24 rounded-3xl px-4 py-3 text-sm"
      />
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-muted-foreground text-2xs">Markdown supported</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          disabled={!canSend}
          onPress={onSubmit}
          style={({ pressed }) => ({
            height: 38,
            borderRadius: 19,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: palette.primary,
            opacity: !canSend ? 0.45 : pressed ? 0.85 : 1,
          })}>
          {sending ? (
            <Spinner size={13} className="text-primary-foreground" />
          ) : (
            <Icon as={Send} size={13} className="text-primary-foreground" />
          )}
          <Text className="text-primary-foreground text-sm font-semibold">
            {sending ? 'Sending' : 'Comment'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
