import * as React from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CI_ICON, CI_TEXT, ciState, type CiState } from '~/components/repo/ci/ci-types';
import { Icon } from '~/components/ui/icon';
import { cn } from '~/lib/utils';

export function CiStatusIcon({
  status,
  conclusion,
  size = 15,
  className,
}: {
  status: string | null | undefined;
  conclusion?: string | null;
  size?: number;
  className?: string;
}) {
  const state: CiState = ciState(status, conclusion);
  const spinning = state === 'running';
  const angle = useSharedValue(0);

  React.useEffect(() => {
    if (!spinning) {
      cancelAnimation(angle);
      angle.value = 0;
      return;
    }
    angle.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(angle);
  }, [angle, spinning]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  return (
    <Animated.View style={style}>
      <Icon as={CI_ICON[state]} size={size} className={cn(CI_TEXT[state], className)} />
    </Animated.View>
  );
}
