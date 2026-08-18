import { Send } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Spinner } from '~/components/shared/spinner';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';

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
    <View className="border-border bg-card/40 gap-2 rounded-xl border p-2.5">
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={!disabled && !sending}
        multiline
        autoCapitalize="sentences"
        className="h-20 py-2 text-sm"
      />
      <View className="flex-row items-center justify-between">
        <Text className="text-muted-foreground/60 text-2xs">Markdown supported</Text>
        <Button size="sm" disabled={!canSend} onPress={onSubmit}>
          {sending ? (
            <Spinner size={13} className="text-primary-foreground" />
          ) : (
            <Icon as={Send} size={13} className="text-primary-foreground" />
          )}
          <Text className="text-xs">{sending ? 'Sending' : 'Comment'}</Text>
        </Button>
      </View>
    </View>
  );
}
