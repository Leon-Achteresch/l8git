import { Search, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

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
    <View
      className={cn(
        'flex-row items-center gap-2 rounded-xl border px-3',
        focused ? 'border-foreground/25 bg-card' : 'border-border bg-card/50',
        className
      )}>
      <Icon as={Search} size={14} className="text-muted-foreground" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={`${palette.mutedForeground}99`}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ color: palette.foreground }}
        className="h-10 flex-1 text-sm"
      />
      {value.length > 0 ? (
        <Pressable hitSlop={10} onPress={() => onChangeText('')} accessibilityLabel="Clear search">
          <Icon as={X} size={14} className="text-muted-foreground" />
        </Pressable>
      ) : null}
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
