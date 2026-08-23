import { Icon } from '~/components/ui/icon';
import { Text, TextClassContext } from '~/components/ui/text';
import { cn } from '~/lib/utils';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

function Alert({
  className,
  variant,
  children,
  icon,
  iconClassName,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View> & {
  icon: LucideIcon;
  variant?: 'default' | 'destructive';
  iconClassName?: string;
}) {
  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm text-foreground',
        variant === 'destructive' && 'text-destructive',
        className
      )}>
      <View
        role="alert"
        className={cn(
          'bg-card relative w-full rounded-3xl px-4 pb-2.5 pt-4',
          className
        )}
        {...props}>
        <View className="absolute left-4 top-[15px]">
          <Icon
            as={icon}
            className={cn('size-4', variant === 'destructive' && 'text-destructive', iconClassName)}
          />
        </View>
        {children}
      </View>
    </TextClassContext.Provider>
  );
}

function AlertTitle({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn('mb-1 ml-0.5 min-h-4 pl-6 font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  const textClass = React.useContext(TextClassContext);
  return (
    <Text
      className={cn(
        'text-muted-foreground ml-0.5 pb-1.5 pl-6 text-sm leading-relaxed',
        textClass?.includes('text-destructive') && 'text-destructive/90',
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
