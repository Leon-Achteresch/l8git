import { Search, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { palette } from '~/lib/theme';

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  className,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View className={className}>
      <Glass
        style={{
          height: 46,
          borderRadius: 23,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderColor: focused ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)',
        }}>
        <Icon as={Search} size={17} color={palette.mutedForeground} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={palette.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ color: palette.foreground, paddingVertical: 0 }}
          className="h-11 flex-1 text-base"
        />
        {value.length > 0 ? (
          <Pressable
            hitSlop={10}
            onPress={() => onChangeText('')}
            accessibilityLabel="Clear search">
            <Icon as={X} size={16} color={palette.mutedForeground} />
          </Pressable>
        ) : null}
      </Glass>
    </View>
  );
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}
