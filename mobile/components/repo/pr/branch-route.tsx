import { ArrowRight } from 'lucide-react-native';
import { View } from 'react-native';

import { middleTruncate } from '~/components/shared/format';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export function BranchRoute({
  head,
  base,
  max = 20,
  className,
}: {
  head: string;
  base: string;
  max?: number;
  className?: string;
}) {
  return (
    <View className={cn('min-w-0 flex-row items-center gap-1', className)}>
      <Text numberOfLines={1} className="text-git-branch font-mono text-2xs">
        {middleTruncate(head, max)}
      </Text>
      <Icon as={ArrowRight} size={9} className="text-muted-foreground/60" />
      <Text numberOfLines={1} className="text-muted-foreground font-mono text-2xs">
        {middleTruncate(base, max)}
      </Text>
    </View>
  );
}
