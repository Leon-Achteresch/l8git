import { cn } from '~/lib/utils';
import * as React from 'react';
import { Platform, TextInput } from 'react-native';

function Input({
  className,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  const [focused, setFocused] = React.useState(false);
  return (
    <TextInput
      className={cn(
        'text-foreground flex w-full min-w-0 flex-row items-center text-base leading-5',
        props.multiline ? 'min-h-12 rounded-3xl px-4 py-3' : 'h-12 rounded-full px-4 py-1',
        focused ? 'bg-elevated' : 'bg-card',
        props.editable === false &&
        cn(
          'opacity-50',
          Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
        ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40'
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className
      )}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...props}
    />
  );
}

export { Input };
